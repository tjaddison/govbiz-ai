import json
import boto3
import os
import logging
import math
from typing import Dict, List, Any, Tuple
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bedrock_runtime = boto3.client('bedrock-runtime')
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']
VECTOR_INDEX_TABLE = os.environ['VECTOR_INDEX_TABLE']
BEDROCK_MODEL_ARN = os.environ['BEDROCK_MODEL_ARN']

def generate_query_embedding(text: str) -> List[float]:
    """Generate embedding for search query using Bedrock Titan Text Embeddings V2"""
    try:
        body = {
            "inputText": text,
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
        embedding = response_body['embedding']

        logger.info(f"Generated query embedding with {len(embedding)} dimensions")
        return embedding

    except Exception as e:
        logger.error(f"Error generating query embedding: {str(e)}")
        raise

def cosine_similarity_simple(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity without numpy"""
    try:
        # Calculate dot product
        dot_product = sum(a * b for a, b in zip(vec1, vec2))

        # Calculate magnitudes
        magnitude1 = math.sqrt(sum(a * a for a in vec1))
        magnitude2 = math.sqrt(sum(a * a for a in vec2))

        # Avoid division by zero
        if magnitude1 == 0 or magnitude2 == 0:
            return 0.0

        # Calculate cosine similarity
        similarity = dot_product / (magnitude1 * magnitude2)

        return similarity

    except Exception as e:
        logger.error(f"Error calculating cosine similarity: {str(e)}")
        return 0.0

def get_stored_embedding_from_s3(s3_uri: str) -> List[float]:
    """Retrieve embedding from S3"""
    try:
        # Parse S3 URI
        s3_uri = s3_uri.replace('s3://', '')
        bucket_name, key = s3_uri.split('/', 1)

        # Get object from S3
        response = s3_client.get_object(Bucket=bucket_name, Key=key)
        data = json.loads(response['Body'].read().decode('utf-8'))

        return data.get('embedding', [])

    except Exception as e:
        logger.error(f"Error retrieving embedding from S3 {s3_uri}: {str(e)}")
        return []

def semantic_search(
    query: str,
    entity_type: str = 'all',
    max_results: int = 10,
    min_similarity: float = 0.5
) -> List[Dict[str, Any]]:
    """Perform semantic search using cosine similarity"""
    try:
        # Generate embedding for the query
        query_embedding = generate_query_embedding(query)

        # Get all vector index entries
        vector_index_table = dynamodb.Table(VECTOR_INDEX_TABLE)

        scan_params = {
            'Select': 'ALL_ATTRIBUTES'
        }

        if entity_type != 'all':
            scan_params['FilterExpression'] = '#entity_type = :entity_type'
            scan_params['ExpressionAttributeNames'] = {'#entity_type': 'entity_type'}
            scan_params['ExpressionAttributeValues'] = {':entity_type': entity_type}

        response = vector_index_table.scan(**scan_params)
        items = response['Items']

        logger.info(f"Found {len(items)} vector index entries to search")

        # Calculate similarities
        similarities = []

        for item in items:
            s3_uri = item.get('s3_uri')
            if not s3_uri:
                continue

            # Get stored embedding
            stored_embedding = get_stored_embedding_from_s3(s3_uri)
            if not stored_embedding:
                continue

            # Calculate similarity
            similarity = cosine_similarity_simple(query_embedding, stored_embedding)

            if similarity >= min_similarity:
                similarities.append({
                    'entity_type': item.get('entity_type'),
                    'entity_id': item.get('entity_id'),
                    'similarity': similarity,
                    's3_uri': s3_uri,
                    'metadata': item.get('metadata', {}),
                    'total_tokens': item.get('total_tokens', 0),
                    'embedding_count': item.get('embedding_count', 0)
                })

        # Sort by similarity (descending) and limit results
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        results = similarities[:max_results]

        logger.info(f"Found {len(results)} results with similarity >= {min_similarity}")
        return results

    except Exception as e:
        logger.error(f"Error in semantic search: {str(e)}")
        raise

def keyword_search(
    query: str,
    entity_type: str = 'all',
    max_results: int = 10
) -> List[Dict[str, Any]]:
    """Simple keyword-based search through stored text"""
    try:
        # Get all vector index entries
        vector_index_table = dynamodb.Table(VECTOR_INDEX_TABLE)

        scan_params = {
            'Select': 'ALL_ATTRIBUTES'
        }

        if entity_type != 'all':
            scan_params['FilterExpression'] = '#entity_type = :entity_type'
            scan_params['ExpressionAttributeNames'] = {'#entity_type': 'entity_type'}
            scan_params['ExpressionAttributeValues'] = {':entity_type': entity_type}

        response = vector_index_table.scan(**scan_params)
        items = response['Items']

        # Prepare query terms
        query_terms = query.lower().split()

        # Calculate keyword scores
        matches = []

        for item in items:
            s3_uri = item.get('s3_uri')
            if not s3_uri:
                continue

            # Get stored text from embedding file
            try:
                s3_uri_clean = s3_uri.replace('s3://', '')
                bucket_name, key = s3_uri_clean.split('/', 1)

                response = s3_client.get_object(Bucket=bucket_name, Key=key)
                data = json.loads(response['Body'].read().decode('utf-8'))

                text = data.get('text', '').lower()

                # Calculate keyword match score
                match_count = sum(1 for term in query_terms if term in text)
                score = match_count / len(query_terms) if query_terms else 0

                if score > 0:
                    matches.append({
                        'entity_type': item.get('entity_type'),
                        'entity_id': item.get('entity_id'),
                        'keyword_score': score,
                        's3_uri': s3_uri,
                        'metadata': item.get('metadata', {}),
                        'total_tokens': item.get('total_tokens', 0),
                        'embedding_count': item.get('embedding_count', 0),
                        'matched_terms': match_count
                    })

            except Exception as e:
                logger.warning(f"Error processing item {item.get('entity_id')}: {str(e)}")
                continue

        # Sort by keyword score (descending) and limit results
        matches.sort(key=lambda x: x['keyword_score'], reverse=True)
        results = matches[:max_results]

        logger.info(f"Found {len(results)} keyword matches")
        return results

    except Exception as e:
        logger.error(f"Error in keyword search: {str(e)}")
        raise

def lambda_handler(event, context):
    """
    Lambda handler for simple search functionality

    Event structure:
    {
        "search_type": "semantic" | "keyword" | "hybrid",
        "query": "search query text",
        "entity_type": "opportunity" | "company" | "all",
        "max_results": 10,
        "min_similarity": 0.5
    }
    """
    try:
        logger.info(f"Processing search request: {json.dumps(event, default=str)}")

        search_type = event.get('search_type', 'semantic')
        query = event.get('query', '')
        entity_type = event.get('entity_type', 'all')
        max_results = event.get('max_results', 10)
        min_similarity = event.get('min_similarity', 0.5)

        if not query:
            raise ValueError("Query text is required")

        results = []

        if search_type == 'semantic':
            results = semantic_search(query, entity_type, max_results, min_similarity)
        elif search_type == 'keyword':
            results = keyword_search(query, entity_type, max_results)
        elif search_type == 'hybrid':
            # Simple hybrid: combine semantic and keyword results
            semantic_results = semantic_search(query, entity_type, max_results // 2, min_similarity)
            keyword_results = keyword_search(query, entity_type, max_results // 2)

            # Combine and deduplicate
            combined = {}
            for result in semantic_results:
                entity_key = f"{result['entity_type']}-{result['entity_id']}"
                combined[entity_key] = result
                combined[entity_key]['search_method'] = 'semantic'

            for result in keyword_results:
                entity_key = f"{result['entity_type']}-{result['entity_id']}"
                if entity_key in combined:
                    # Merge scores if already exists
                    combined[entity_key]['keyword_score'] = result['keyword_score']
                    combined[entity_key]['search_method'] = 'hybrid'
                else:
                    combined[entity_key] = result
                    combined[entity_key]['search_method'] = 'keyword'

            results = list(combined.values())[:max_results]
        else:
            raise ValueError(f"Unknown search type: {search_type}")

        response = {
            'statusCode': 200,
            'body': {
                'message': f'Search completed successfully',
                'search_type': search_type,
                'query': query,
                'entity_type': entity_type,
                'results_count': len(results),
                'results': results
            }
        }

        logger.info(f"Search completed with {len(results)} results")
        return response

    except Exception as e:
        logger.error(f"Error in search: {str(e)}")
        return {
            'statusCode': 500,
            'body': {
                'error': str(e),
                'message': 'Failed to perform search'
            }
        }