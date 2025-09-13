import json
import boto3
import os
import logging
import re
from typing import Dict, List, Any, Optional
from datetime import datetime
from collections import Counter

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')

EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']
VECTOR_INDEX_TABLE = os.environ['VECTOR_INDEX_TABLE']
OPPORTUNITIES_TABLE = os.environ['OPPORTUNITIES_TABLE']
COMPANIES_TABLE = os.environ['COMPANIES_TABLE']
SEMANTIC_SEARCH_FUNCTION = os.environ['SEMANTIC_SEARCH_FUNCTION']

# Initialize DynamoDB tables
opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE)
companies_table = dynamodb.Table(COMPANIES_TABLE)

def extract_keywords(text: str, min_length: int = 3) -> List[str]:
    """
    Extract meaningful keywords from text for keyword-based matching
    """
    if not text:
        return []

    # Convert to lowercase and extract words
    text_lower = text.lower()

    # Remove common stop words
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
        'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does',
        'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
        'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
        'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their'
    }

    # Extract words (letters, numbers, hyphens)
    words = re.findall(r'\b[a-zA-Z][\w-]*\b', text_lower)

    # Filter keywords
    keywords = []
    for word in words:
        if len(word) >= min_length and word not in stop_words:
            keywords.append(word)

    return keywords

def calculate_keyword_score(query_keywords: List[str], document_text: str) -> float:
    """
    Calculate keyword-based relevance score using TF-IDF-like approach
    """
    if not query_keywords or not document_text:
        return 0.0

    doc_keywords = extract_keywords(document_text)
    if not doc_keywords:
        return 0.0

    doc_keyword_counts = Counter(doc_keywords)
    total_doc_words = len(doc_keywords)

    score = 0.0
    for query_keyword in query_keywords:
        # Term frequency in document
        tf = doc_keyword_counts.get(query_keyword, 0) / total_doc_words

        # Simple scoring: TF with bonus for exact matches
        if tf > 0:
            score += tf * 10  # Scale up TF score

            # Bonus for phrase matches
            if query_keyword in document_text.lower():
                score += 0.5

    # Normalize by query length
    return min(score / len(query_keywords), 1.0)

def keyword_search_opportunities(
    query: str,
    max_results: int = 20,
    filters: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Perform keyword-based search on opportunities using DynamoDB scan
    """
    logger.info(f"Performing keyword search on opportunities for: '{query}'")

    query_keywords = extract_keywords(query)
    if not query_keywords:
        return []

    try:
        # Scan opportunities table (in production, consider using a search index)
        scan_kwargs = {}

        # Add filters if provided
        if filters:
            filter_expressions = []
            expression_values = {}

            for key, value in filters.items():
                if value:
                    filter_expressions.append(f"#{key} = :{key}")
                    scan_kwargs.setdefault('ExpressionAttributeNames', {})[f'#{key}'] = key
                    expression_values[f':{key}'] = value

            if filter_expressions:
                scan_kwargs['FilterExpression'] = ' AND '.join(filter_expressions)
                scan_kwargs['ExpressionAttributeValues'] = expression_values

        response = opportunities_table.scan(**scan_kwargs)
        items = response.get('Items', [])

        # Score each opportunity
        scored_results = []
        for item in items:
            # Extract searchable text
            searchable_text = f"{item.get('Title', '')} {item.get('Description', '')}"

            keyword_score = calculate_keyword_score(query_keywords, searchable_text)

            if keyword_score > 0:
                result = {
                    'notice_id': item.get('notice_id', ''),
                    'title': item.get('Title', ''),
                    'agency': item.get('Department/Ind.Agency', ''),
                    'naics_code': item.get('NaicsCode', ''),
                    'set_aside': item.get('SetASide', ''),
                    'posted_date': item.get('posted_date', ''),
                    'response_deadline': item.get('ResponseDeadLine', ''),
                    'content_snippet': searchable_text[:500] + '...' if len(searchable_text) > 500 else searchable_text,
                    'relevance_score': keyword_score,
                    'search_type': 'keyword'
                }
                scored_results.append(result)

        # Sort by score and return top results
        scored_results.sort(key=lambda x: x['relevance_score'], reverse=True)
        return scored_results[:max_results]

    except Exception as e:
        logger.error(f"Error in keyword search: {str(e)}")
        return []

def keyword_search_companies(
    query: str,
    max_results: int = 20,
    filters: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Perform keyword-based search on companies using DynamoDB scan
    """
    logger.info(f"Performing keyword search on companies for: '{query}'")

    query_keywords = extract_keywords(query)
    if not query_keywords:
        return []

    try:
        # Scan companies table
        scan_kwargs = {}

        # Add filters if provided
        if filters:
            filter_expressions = []
            expression_values = {}

            for key, value in filters.items():
                if value:
                    filter_expressions.append(f"#{key} = :{key}")
                    scan_kwargs.setdefault('ExpressionAttributeNames', {})[f'#{key}'] = key
                    expression_values[f':{key}'] = value

            if filter_expressions:
                scan_kwargs['FilterExpression'] = ' AND '.join(filter_expressions)
                scan_kwargs['ExpressionAttributeValues'] = expression_values

        response = companies_table.scan(**scan_kwargs)
        items = response.get('Items', [])

        # Score each company
        scored_results = []
        for item in items:
            # Extract searchable text
            searchable_text = f"{item.get('company_name', '')} {item.get('capability_statement', '')}"

            keyword_score = calculate_keyword_score(query_keywords, searchable_text)

            if keyword_score > 0:
                result = {
                    'company_id': item.get('company_id', ''),
                    'company_name': item.get('company_name', ''),
                    'tenant_id': item.get('tenant_id', ''),
                    'industry_naics': item.get('industry_naics', []),
                    'certifications': item.get('certifications', []),
                    'content_snippet': searchable_text[:500] + '...' if len(searchable_text) > 500 else searchable_text,
                    'relevance_score': keyword_score,
                    'search_type': 'keyword'
                }
                scored_results.append(result)

        # Sort by score and return top results
        scored_results.sort(key=lambda x: x['relevance_score'], reverse=True)
        return scored_results[:max_results]

    except Exception as e:
        logger.error(f"Error in keyword search: {str(e)}")
        return []

def invoke_semantic_search(operation: str, query: str, max_results: int, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Invoke the semantic search Lambda function
    """
    try:
        payload = {
            'operation': operation,
            'query': query,
            'max_results': max_results,
            'filters': filters
        }

        response = lambda_client.invoke(
            FunctionName=SEMANTIC_SEARCH_FUNCTION,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        result = json.loads(response['Payload'].read())
        if result.get('statusCode') == 200:
            return result.get('body', {}).get('results', [])
        else:
            logger.error(f"Semantic search failed: {result}")
            return []

    except Exception as e:
        logger.error(f"Error invoking semantic search: {str(e)}")
        return []

def combine_search_results(
    semantic_results: List[Dict[str, Any]],
    keyword_results: List[Dict[str, Any]],
    semantic_weight: float = 0.7,
    keyword_weight: float = 0.3
) -> List[Dict[str, Any]]:
    """
    Combine and re-rank semantic and keyword search results
    """
    # Create a map to track all unique results
    result_map = {}

    # Add semantic results
    for result in semantic_results:
        key = result.get('notice_id') or result.get('company_id')
        if key:
            result_map[key] = {
                **result,
                'semantic_score': result.get('relevance_score', 0.0),
                'keyword_score': 0.0,
                'has_semantic': True,
                'has_keyword': False
            }

    # Add or update with keyword results
    for result in keyword_results:
        key = result.get('notice_id') or result.get('company_id')
        if key:
            if key in result_map:
                # Update existing result
                result_map[key]['keyword_score'] = result.get('relevance_score', 0.0)
                result_map[key]['has_keyword'] = True
            else:
                # Add new result
                result_map[key] = {
                    **result,
                    'semantic_score': 0.0,
                    'keyword_score': result.get('relevance_score', 0.0),
                    'has_semantic': False,
                    'has_keyword': True
                }

    # Calculate hybrid scores
    combined_results = []
    for key, result in result_map.items():
        semantic_score = result['semantic_score']
        keyword_score = result['keyword_score']

        # Calculate hybrid score
        hybrid_score = (semantic_score * semantic_weight) + (keyword_score * keyword_weight)

        # Bonus for appearing in both searches
        if result['has_semantic'] and result['has_keyword']:
            hybrid_score *= 1.2  # 20% bonus for dual presence

        result.update({
            'hybrid_score': hybrid_score,
            'search_type': 'hybrid',
            'relevance_score': hybrid_score  # Override with hybrid score
        })

        combined_results.append(result)

    # Sort by hybrid score
    combined_results.sort(key=lambda x: x['hybrid_score'], reverse=True)

    logger.info(f"Combined {len(semantic_results)} semantic + {len(keyword_results)} keyword = {len(combined_results)} hybrid results")
    return combined_results

def hybrid_search_opportunities(
    query: str,
    max_results: int = 10,
    filters: Optional[Dict[str, Any]] = None,
    semantic_weight: float = 0.7,
    keyword_weight: float = 0.3
) -> List[Dict[str, Any]]:
    """
    Perform hybrid search combining semantic and keyword approaches for opportunities
    """
    logger.info(f"Performing hybrid search on opportunities for: '{query}'")

    # Perform both searches in parallel (conceptually)
    semantic_results = invoke_semantic_search('search_opportunities', query, max_results * 2, filters or {})
    keyword_results = keyword_search_opportunities(query, max_results * 2, filters)

    # Combine and re-rank results
    combined_results = combine_search_results(
        semantic_results, keyword_results, semantic_weight, keyword_weight
    )

    return combined_results[:max_results]

def hybrid_search_companies(
    query: str,
    max_results: int = 10,
    filters: Optional[Dict[str, Any]] = None,
    semantic_weight: float = 0.7,
    keyword_weight: float = 0.3
) -> List[Dict[str, Any]]:
    """
    Perform hybrid search combining semantic and keyword approaches for companies
    """
    logger.info(f"Performing hybrid search on companies for: '{query}'")

    # Perform both searches
    semantic_results = invoke_semantic_search('search_companies', query, max_results * 2, filters or {})
    keyword_results = keyword_search_companies(query, max_results * 2, filters)

    # Combine and re-rank results
    combined_results = combine_search_results(
        semantic_results, keyword_results, semantic_weight, keyword_weight
    )

    return combined_results[:max_results]

def lambda_handler(event, context):
    """
    Lambda handler for hybrid search operations

    Event structure:
    {
        "operation": "hybrid_search_opportunities" | "hybrid_search_companies",
        "query": "search query text",
        "max_results": 10,
        "filters": {...},
        "semantic_weight": 0.7,
        "keyword_weight": 0.3
    }
    """
    try:
        logger.info(f"Processing hybrid search request: {json.dumps(event, default=str)}")

        operation = event.get('operation')
        query = event.get('query', '')
        max_results = event.get('max_results', 10)
        filters = event.get('filters', {})
        semantic_weight = event.get('semantic_weight', 0.7)
        keyword_weight = event.get('keyword_weight', 0.3)

        if not query:
            raise ValueError("Query is required for hybrid search")

        results = []

        if operation == 'hybrid_search_opportunities':
            results = hybrid_search_opportunities(
                query, max_results, filters, semantic_weight, keyword_weight
            )

        elif operation == 'hybrid_search_companies':
            results = hybrid_search_companies(
                query, max_results, filters, semantic_weight, keyword_weight
            )

        else:
            raise ValueError(f"Unknown operation: {operation}")

        response = {
            'statusCode': 200,
            'body': {
                'operation': operation,
                'query': query,
                'filters': filters,
                'weights': {
                    'semantic': semantic_weight,
                    'keyword': keyword_weight
                },
                'results': results,
                'summary': {
                    'total_results': len(results),
                    'max_score': max(r.get('hybrid_score', 0) for r in results) if results else 0,
                    'avg_score': sum(r.get('hybrid_score', 0) for r in results) / len(results) if results else 0,
                    'semantic_results': sum(1 for r in results if r.get('has_semantic', False)),
                    'keyword_results': sum(1 for r in results if r.get('has_keyword', False)),
                    'dual_presence': sum(1 for r in results if r.get('has_semantic', False) and r.get('has_keyword', False))
                }
            }
        }

        logger.info(f"Hybrid search completed: {response['body']['summary']}")
        return response

    except Exception as e:
        logger.error(f"Error in hybrid search: {str(e)}")
        return {
            'statusCode': 500,
            'body': {
                'error': str(e),
                'message': 'Failed to perform hybrid search'
            }
        }