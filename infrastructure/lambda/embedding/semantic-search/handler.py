import json
import boto3
import os
import logging
import numpy as np
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bedrock_runtime = boto3.client('bedrock-runtime')
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']
VECTOR_INDEX_TABLE = os.environ['VECTOR_INDEX_TABLE']
BEDROCK_MODEL_ARN = os.environ['BEDROCK_MODEL_ARN']

# Initialize DynamoDB table
vector_index_table = dynamodb.Table(VECTOR_INDEX_TABLE)

def generate_query_embedding(query: str) -> List[float]:
    """Generate embedding for search query using Bedrock Titan"""
    try:
        body = {
            "inputText": query,
            "dimensions": 1024,
            "normalize": True
        }

        response = bedrock_runtime.invoke_model(
            modelId="amazon.titan-embed-text-v2:0",
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json"
        )

        response_body = json.loads(response['body'].read())
        return response_body['embedding']

    except Exception as e:
        logger.error(f"Error generating query embedding: {str(e)}")
        raise

def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity between two vectors"""
    try:
        a = np.array(vec1)
        b = np.array(vec2)

        # Calculate cosine similarity
        dot_product = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        similarity = dot_product / (norm_a * norm_b)
        return float(similarity)

    except Exception as e:
        logger.error(f"Error calculating cosine similarity: {str(e)}")
        return 0.0

def load_embeddings_from_s3(s3_uri: str) -> Optional[Dict[str, Any]]:
    """Load embedding data from S3"""
    try:
        # Parse S3 URI
        parts = s3_uri.replace('s3://', '').split('/', 1)
        bucket = parts[0]
        key = parts[1]

        # Load from S3
        response = s3_client.get_object(Bucket=bucket, Key=key)
        data = json.loads(response['Body'].read().decode('utf-8'))

        return data

    except Exception as e:
        logger.error(f"Error loading embeddings from {s3_uri}: {str(e)}")
        return None

def search_vector_index(
    entity_type: str,
    query_embedding: List[float],
    max_results: int = 10,
    metadata_filters: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Search vector index using cosine similarity

    Args:
        entity_type: 'opportunity' or 'company'
        query_embedding: Query embedding vector
        max_results: Maximum number of results to return
        metadata_filters: Optional metadata filters

    Returns:
        List of search results with similarity scores
    """
    try:
        # Query vector index table
        scan_kwargs = {
            'FilterExpression': 'entity_type = :entity_type',
            'ExpressionAttributeValues': {':entity_type': entity_type}
        }

        # Add metadata filters if provided
        if metadata_filters:
            filter_expressions = ['entity_type = :entity_type']

            for key, value in metadata_filters.items():
                if value:
                    attr_name = f'metadata.{key}'
                    attr_value = f':{key}'
                    filter_expressions.append(f'{attr_name} = {attr_value}')
                    scan_kwargs['ExpressionAttributeValues'][attr_value] = value

            scan_kwargs['FilterExpression'] = ' AND '.join(filter_expressions)

        response = vector_index_table.scan(**scan_kwargs)

        # Calculate similarity scores
        candidates = []
        for item in response.get('Items', []):
            s3_uri = item.get('s3_uri')
            if not s3_uri:
                continue

            # Load embeddings from S3
            embedding_data = load_embeddings_from_s3(s3_uri)
            if not embedding_data:
                continue

            embeddings = embedding_data.get('embeddings', {})

            # Calculate best similarity score across all embeddings for this entity
            best_score = 0.0
            best_content = ""

            for emb_key, emb_data in embeddings.items():
                embedding_vector = emb_data.get('embedding', [])
                if embedding_vector:
                    score = cosine_similarity(query_embedding, embedding_vector)
                    if score > best_score:
                        best_score = score
                        best_content = emb_data.get('text', '')

            if best_score > 0.1:  # Minimum similarity threshold
                candidate = {
                    'entity_id': item.get('entity_id'),
                    'entity_type': entity_type,
                    'score': best_score,
                    'content': best_content,
                    'metadata': item.get('metadata', {}),
                    's3_uri': s3_uri
                }
                candidates.append(candidate)

        # Sort by similarity score and return top results
        candidates.sort(key=lambda x: x['score'], reverse=True)
        return candidates[:max_results]

    except Exception as e:
        logger.error(f"Error searching vector index: {str(e)}")
        return []

def search_opportunities(
    query: str,
    max_results: int = 10,
    filters: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Search opportunities using semantic search

    Args:
        query: Search query (e.g., "cloud computing services", "IT infrastructure")
        max_results: Maximum number of results
        filters: Optional filters (naics_code, agency, set_aside, etc.)

    Returns:
        List of matching opportunities with relevance scores
    """
    logger.info(f"Searching opportunities for query: '{query}'")

    # Generate embedding for the query
    query_embedding = generate_query_embedding(query)

    # Search vector index
    results = search_vector_index(
        entity_type='opportunity',
        query_embedding=query_embedding,
        max_results=max_results,
        metadata_filters=filters
    )

    # Enhance results with opportunity-specific processing
    enhanced_results = []
    for result in results:
        metadata = result.get('metadata', {})
        enhanced_result = {
            'notice_id': result.get('entity_id', ''),
            'title': metadata.get('title', ''),
            'agency': metadata.get('agency', ''),
            'naics_code': metadata.get('naics_code', ''),
            'set_aside': metadata.get('set_aside', ''),
            'posted_date': metadata.get('posted_date', ''),
            'response_deadline': metadata.get('response_deadline', ''),
            'content_snippet': result['content'][:500] + '...' if len(result['content']) > 500 else result['content'],
            'relevance_score': result['score'],
            'source_uri': result['s3_uri'],
            'search_type': 'semantic'
        }
        enhanced_results.append(enhanced_result)

    logger.info(f"Enhanced {len(enhanced_results)} opportunity results")
    return enhanced_results

def search_companies(
    query: str,
    max_results: int = 10,
    filters: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Search company profiles using semantic search

    Args:
        query: Search query (e.g., "cybersecurity expertise", "8(a) certified")
        max_results: Maximum number of results
        filters: Optional filters (certifications, naics_codes, etc.)

    Returns:
        List of matching companies with relevance scores
    """
    logger.info(f"Searching companies for query: '{query}'")

    # Generate embedding for the query
    query_embedding = generate_query_embedding(query)

    # Search vector index
    results = search_vector_index(
        entity_type='company',
        query_embedding=query_embedding,
        max_results=max_results,
        metadata_filters=filters
    )

    # Enhance results with company-specific processing
    enhanced_results = []
    for result in results:
        metadata = result.get('metadata', {})
        enhanced_result = {
            'company_id': result.get('entity_id', ''),
            'company_name': metadata.get('company_name', ''),
            'tenant_id': metadata.get('tenant_id', ''),
            'industry_naics': metadata.get('industry_naics', []),
            'certifications': metadata.get('certifications', []),
            'content_snippet': result['content'][:500] + '...' if len(result['content']) > 500 else result['content'],
            'relevance_score': result['score'],
            'source_uri': result['s3_uri'],
            'search_type': 'semantic'
        }
        enhanced_results.append(enhanced_result)

    logger.info(f"Enhanced {len(enhanced_results)} company results")
    return enhanced_results

def find_similar_opportunities(
    reference_opportunity_id: str,
    max_results: int = 5
) -> List[Dict[str, Any]]:
    """
    Find opportunities similar to a reference opportunity

    Args:
        reference_opportunity_id: Notice ID of the reference opportunity
        max_results: Maximum number of similar opportunities to return

    Returns:
        List of similar opportunities
    """
    # This would require retrieving the reference opportunity's content first
    # and then using it as a search query
    logger.info(f"Finding opportunities similar to {reference_opportunity_id}")

    # For now, return a placeholder - this would need additional implementation
    # to first retrieve the reference opportunity's content
    return []

def find_similar_companies(
    reference_company_id: str,
    max_results: int = 5
) -> List[Dict[str, Any]]:
    """
    Find companies similar to a reference company

    Args:
        reference_company_id: ID of the reference company
        max_results: Maximum number of similar companies to return

    Returns:
        List of similar companies
    """
    logger.info(f"Finding companies similar to {reference_company_id}")

    # Placeholder - would need additional implementation
    return []

def lambda_handler(event, context):
    """
    Lambda handler for semantic search operations

    Event structure:
    {
        "operation": "search_opportunities" | "search_companies" | "find_similar_opportunities" | "find_similar_companies",
        "query": "search query text",
        "max_results": 10,
        "filters": {...},
        "reference_id": "id" // for similarity searches
    }
    """
    try:
        logger.info(f"Processing semantic search request: {json.dumps(event, default=str)}")

        operation = event.get('operation')
        query = event.get('query', '')
        max_results = event.get('max_results', 10)
        filters = event.get('filters', {})
        reference_id = event.get('reference_id')

        results = []

        if operation == 'search_opportunities':
            if not query:
                raise ValueError("Query is required for opportunity search")
            results = search_opportunities(query, max_results, filters)

        elif operation == 'search_companies':
            if not query:
                raise ValueError("Query is required for company search")
            results = search_companies(query, max_results, filters)

        elif operation == 'find_similar_opportunities':
            if not reference_id:
                raise ValueError("Reference ID is required for similarity search")
            results = find_similar_opportunities(reference_id, max_results)

        elif operation == 'find_similar_companies':
            if not reference_id:
                raise ValueError("Reference ID is required for similarity search")
            results = find_similar_companies(reference_id, max_results)

        else:
            raise ValueError(f"Unknown operation: {operation}")

        response = {
            'statusCode': 200,
            'body': {
                'operation': operation,
                'query': query,
                'filters': filters,
                'results': results,
                'summary': {
                    'total_results': len(results),
                    'max_score': max(r.get('relevance_score', 0) for r in results) if results else 0,
                    'avg_score': sum(r.get('relevance_score', 0) for r in results) / len(results) if results else 0
                }
            }
        }

        logger.info(f"Semantic search completed: {response['body']['summary']}")
        return response

    except Exception as e:
        logger.error(f"Error in semantic search: {str(e)}")
        return {
            'statusCode': 500,
            'body': {
                'error': str(e),
                'message': 'Failed to perform semantic search'
            }
        }