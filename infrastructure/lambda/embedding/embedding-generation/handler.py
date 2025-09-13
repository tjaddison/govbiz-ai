import json
import boto3
import os
import logging
import tiktoken
import numpy as np
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

bedrock_runtime = boto3.client('bedrock-runtime')
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']
OPPORTUNITIES_TABLE = os.environ['OPPORTUNITIES_TABLE']
COMPANIES_TABLE = os.environ['COMPANIES_TABLE']
VECTOR_INDEX_TABLE = os.environ['VECTOR_INDEX_TABLE']
BEDROCK_MODEL_ARN = os.environ['BEDROCK_MODEL_ARN']

# Initialize vector index table
vector_index_table = dynamodb.Table(VECTOR_INDEX_TABLE)

# Initialize tiktoken encoder for token counting
try:
    encoding = tiktoken.get_encoding("cl100k_base")
except Exception:
    encoding = None

def count_tokens(text: str) -> int:
    """Count tokens in text using tiktoken"""
    if encoding:
        return len(encoding.encode(text))
    # Fallback: approximate token count
    return len(text.split()) * 1.3

def chunk_text(text: str, max_tokens: int = 8000, overlap_tokens: int = 200) -> List[str]:
    """
    Chunk text into smaller segments with overlap for embedding generation.
    Bedrock Titan Text Embeddings V2 has a max input of 8192 tokens.
    """
    if not text.strip():
        return []

    words = text.split()
    chunks = []
    current_chunk = []
    current_tokens = 0

    for word in words:
        word_tokens = count_tokens(word)

        if current_tokens + word_tokens > max_tokens and current_chunk:
            # Create chunk
            chunk_text = ' '.join(current_chunk)
            chunks.append(chunk_text)

            # Start new chunk with overlap
            overlap_words = current_chunk[-min(overlap_tokens//2, len(current_chunk)):]
            current_chunk = overlap_words + [word]
            current_tokens = count_tokens(' '.join(current_chunk))
        else:
            current_chunk.append(word)
            current_tokens += word_tokens

    # Add final chunk if it has content
    if current_chunk:
        chunks.append(' '.join(current_chunk))

    return chunks

def generate_embedding(text: str) -> List[float]:
    """Generate embedding using Bedrock Titan Text Embeddings V2"""
    try:
        # Prepare the request body
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

        logger.info(f"Generated embedding with {len(embedding)} dimensions")
        return embedding

    except Exception as e:
        logger.error(f"Error generating embedding: {str(e)}")
        raise

def store_embedding_s3(embedding_data: Dict[str, Any], bucket: str, key: str) -> str:
    """Store embedding data in S3"""
    try:
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps(embedding_data),
            ContentType='application/json'
        )

        s3_uri = f"s3://{bucket}/{key}"
        logger.info(f"Stored embedding at {s3_uri}")
        return s3_uri

    except Exception as e:
        logger.error(f"Error storing embedding in S3: {str(e)}")
        raise

def process_opportunity_embedding(opportunity_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process opportunity data and generate embeddings"""
    notice_id = opportunity_data.get('notice_id')

    # Extract text content for embedding
    text_parts = []

    # Core opportunity fields
    if opportunity_data.get('Title'):
        text_parts.append(f"Title: {opportunity_data['Title']}")

    if opportunity_data.get('Description'):
        text_parts.append(f"Description: {opportunity_data['Description']}")

    if opportunity_data.get('Sol#'):
        text_parts.append(f"Solicitation Number: {opportunity_data['Sol#']}")

    if opportunity_data.get('Department/Ind.Agency'):
        text_parts.append(f"Agency: {opportunity_data['Department/Ind.Agency']}")

    if opportunity_data.get('NaicsCode'):
        text_parts.append(f"NAICS Code: {opportunity_data['NaicsCode']}")

    if opportunity_data.get('SetASide'):
        text_parts.append(f"Set Aside: {opportunity_data['SetASide']}")

    # Combine all text
    full_text = '\n'.join(text_parts)

    # Generate embeddings for different levels
    embeddings = {}

    # Full document embedding
    if full_text.strip():
        full_embedding = generate_embedding(full_text)
        embeddings['full_document'] = {
            'embedding': full_embedding,
            'text': full_text[:500] + '...' if len(full_text) > 500 else full_text,
            'token_count': count_tokens(full_text),
            'type': 'full_document'
        }

    # Section-level embeddings
    if opportunity_data.get('Description'):
        desc_text = opportunity_data['Description']
        if len(desc_text) > 100:  # Only create separate embedding if substantial
            desc_embedding = generate_embedding(desc_text)
            embeddings['description'] = {
                'embedding': desc_embedding,
                'text': desc_text[:500] + '...' if len(desc_text) > 500 else desc_text,
                'token_count': count_tokens(desc_text),
                'type': 'description'
            }

    # Chunk-level embeddings for long descriptions
    if opportunity_data.get('Description') and count_tokens(opportunity_data['Description']) > 6000:
        chunks = chunk_text(opportunity_data['Description'])
        for i, chunk in enumerate(chunks):
            chunk_embedding = generate_embedding(chunk)
            embeddings[f'chunk_{i}'] = {
                'embedding': chunk_embedding,
                'text': chunk[:500] + '...' if len(chunk) > 500 else chunk,
                'token_count': count_tokens(chunk),
                'type': 'chunk',
                'chunk_index': i,
                'total_chunks': len(chunks)
            }

    # Store embeddings in S3
    timestamp = datetime.utcnow().isoformat()
    embedding_key = f"opportunities/{notice_id}/embeddings/{timestamp}.json"

    embedding_data = {
        'notice_id': notice_id,
        'embeddings': embeddings,
        'metadata': {
            'posted_date': opportunity_data.get('PostedDate'),
            'archive_date': opportunity_data.get('ArchiveDate'),
            'naics_code': opportunity_data.get('NaicsCode'),
            'set_aside': opportunity_data.get('SetASideCode'),
            'response_deadline': opportunity_data.get('ResponseDeadLine'),
            'agency': opportunity_data.get('Department/Ind.Agency'),
            'title': opportunity_data.get('Title'),
            'generated_at': timestamp
        }
    }

    s3_uri = store_embedding_s3(embedding_data, EMBEDDINGS_BUCKET, embedding_key)

    # Store vector index entry in DynamoDB for fast lookup
    vector_index_entry = {
        'entity_type': 'opportunity',
        'entity_id': notice_id,
        's3_uri': s3_uri,
        'embedding_count': len(embeddings),
        'total_tokens': sum(emb['token_count'] for emb in embeddings.values()),
        'metadata': {
            'title': opportunity_data.get('Title'),
            'agency': opportunity_data.get('Department/Ind.Agency'),
            'naics_code': opportunity_data.get('NaicsCode'),
            'set_aside': opportunity_data.get('SetASideCode'),
            'posted_date': opportunity_data.get('PostedDate'),
            'response_deadline': opportunity_data.get('ResponseDeadLine')
        },
        'created_at': timestamp
    }

    try:
        vector_index_table.put_item(Item=vector_index_entry)
        logger.info(f"Stored vector index entry for opportunity {notice_id}")
    except Exception as e:
        logger.error(f"Error storing vector index entry: {str(e)}")

    return {
        'notice_id': notice_id,
        's3_uri': s3_uri,
        'embedding_count': len(embeddings),
        'total_tokens': sum(emb['token_count'] for emb in embeddings.values())
    }

def process_company_embedding(company_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process company data and generate embeddings"""
    company_id = company_data.get('company_id')

    # Extract text content for embedding
    text_parts = []

    # Core company fields
    if company_data.get('company_name'):
        text_parts.append(f"Company: {company_data['company_name']}")

    if company_data.get('capability_statement'):
        text_parts.append(f"Capability Statement: {company_data['capability_statement']}")

    if company_data.get('industry_naics'):
        naics_codes = company_data['industry_naics']
        if isinstance(naics_codes, list):
            text_parts.append(f"NAICS Codes: {', '.join(naics_codes)}")
        else:
            text_parts.append(f"NAICS Codes: {naics_codes}")

    if company_data.get('certifications'):
        certs = company_data['certifications']
        if isinstance(certs, list):
            text_parts.append(f"Certifications: {', '.join(certs)}")
        else:
            text_parts.append(f"Certifications: {certs}")

    if company_data.get('past_performance'):
        text_parts.append(f"Past Performance: {company_data['past_performance']}")

    # Combine all text
    full_text = '\n'.join(text_parts)

    # Generate embeddings
    embeddings = {}

    # Full profile embedding
    if full_text.strip():
        full_embedding = generate_embedding(full_text)
        embeddings['full_profile'] = {
            'embedding': full_embedding,
            'text': full_text[:500] + '...' if len(full_text) > 500 else full_text,
            'token_count': count_tokens(full_text),
            'type': 'full_profile'
        }

    # Capability statement embedding
    if company_data.get('capability_statement'):
        cap_text = company_data['capability_statement']
        if len(cap_text) > 100:
            cap_embedding = generate_embedding(cap_text)
            embeddings['capability_statement'] = {
                'embedding': cap_embedding,
                'text': cap_text[:500] + '...' if len(cap_text) > 500 else cap_text,
                'token_count': count_tokens(cap_text),
                'type': 'capability_statement'
            }

    # Store embeddings in S3
    timestamp = datetime.utcnow().isoformat()
    embedding_key = f"companies/{company_id}/embeddings/{timestamp}.json"

    embedding_data = {
        'company_id': company_id,
        'embeddings': embeddings,
        'metadata': {
            'company_name': company_data.get('company_name'),
            'tenant_id': company_data.get('tenant_id'),
            'industry_naics': company_data.get('industry_naics'),
            'certifications': company_data.get('certifications'),
            'generated_at': timestamp
        }
    }

    s3_uri = store_embedding_s3(embedding_data, EMBEDDINGS_BUCKET, embedding_key)

    # Store vector index entry in DynamoDB for fast lookup
    vector_index_entry = {
        'entity_type': 'company',
        'entity_id': company_id,
        's3_uri': s3_uri,
        'embedding_count': len(embeddings),
        'total_tokens': sum(emb['token_count'] for emb in embeddings.values()),
        'metadata': {
            'company_name': company_data.get('company_name'),
            'tenant_id': company_data.get('tenant_id'),
            'industry_naics': company_data.get('industry_naics'),
            'certifications': company_data.get('certifications')
        },
        'created_at': timestamp
    }

    try:
        vector_index_table.put_item(Item=vector_index_entry)
        logger.info(f"Stored vector index entry for company {company_id}")
    except Exception as e:
        logger.error(f"Error storing vector index entry: {str(e)}")

    return {
        'company_id': company_id,
        's3_uri': s3_uri,
        'embedding_count': len(embeddings),
        'total_tokens': sum(emb['token_count'] for emb in embeddings.values())
    }

def lambda_handler(event, context):
    """
    Lambda handler for embedding generation

    Event structure:
    {
        "type": "opportunity" | "company",
        "data": {...},  # Opportunity or company data
        "batch": [...], # Optional batch of items
        "operation": "generate" | "regenerate"
    }
    """
    try:
        logger.info(f"Processing embedding generation request: {json.dumps(event, default=str)}")

        event_type = event.get('type')
        operation = event.get('operation', 'generate')

        results = []

        if 'batch' in event:
            # Process batch of items
            batch_data = event['batch']
            for item in batch_data:
                try:
                    if event_type == 'opportunity':
                        result = process_opportunity_embedding(item)
                    elif event_type == 'company':
                        result = process_company_embedding(item)
                    else:
                        raise ValueError(f"Unknown type: {event_type}")

                    results.append(result)

                except Exception as e:
                    logger.error(f"Error processing item: {str(e)}")
                    results.append({
                        'error': str(e),
                        'item': item.get('notice_id') or item.get('company_id', 'unknown')
                    })

        elif 'data' in event:
            # Process single item
            data = event['data']
            if event_type == 'opportunity':
                result = process_opportunity_embedding(data)
            elif event_type == 'company':
                result = process_company_embedding(data)
            else:
                raise ValueError(f"Unknown type: {event_type}")

            results.append(result)

        else:
            raise ValueError("Event must contain either 'data' or 'batch'")

        response = {
            'statusCode': 200,
            'body': {
                'message': f'Successfully processed {len(results)} embeddings',
                'type': event_type,
                'operation': operation,
                'results': results,
                'summary': {
                    'total_processed': len(results),
                    'total_embeddings': sum(r.get('embedding_count', 0) for r in results if 'embedding_count' in r),
                    'total_tokens': sum(r.get('total_tokens', 0) for r in results if 'total_tokens' in r)
                }
            }
        }

        logger.info(f"Embedding generation completed: {response['body']['summary']}")
        return response

    except Exception as e:
        logger.error(f"Error in embedding generation: {str(e)}")
        return {
            'statusCode': 500,
            'body': {
                'error': str(e),
                'message': 'Failed to generate embeddings'
            }
        }