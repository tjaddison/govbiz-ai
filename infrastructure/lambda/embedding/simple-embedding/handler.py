import json
import boto3
import os
import logging
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

def count_tokens(text: str) -> int:
    """Simple token counting approximation"""
    if not text:
        return 0
    # Simple approximation: 1 token per 4 characters
    return max(1, len(text) // 4)

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

    if not full_text.strip():
        raise ValueError("No text content found in opportunity data")

    # Generate embedding for full document
    embedding = generate_embedding(full_text)
    token_count = count_tokens(full_text)

    # Store embedding data
    timestamp = datetime.utcnow().isoformat()
    embedding_key = f"opportunities/{notice_id}/embeddings/{timestamp}.json"

    embedding_data = {
        'notice_id': notice_id,
        'embedding': embedding,
        'text': full_text[:500] + '...' if len(full_text) > 500 else full_text,
        'token_count': token_count,
        'type': 'full_document',
        'metadata': {
            'posted_date': opportunity_data.get('PostedDate'),
            'archive_date': opportunity_data.get('ArchiveDate'),
            'naics_code': opportunity_data.get('NaicsCode'),
            'set_aside': opportunity_data.get('SetAsideCode'),
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
        'embedding_count': 1,
        'total_tokens': token_count,
        'metadata': {
            'title': opportunity_data.get('Title'),
            'agency': opportunity_data.get('Department/Ind.Agency'),
            'naics_code': opportunity_data.get('NaicsCode'),
            'set_aside': opportunity_data.get('SetAsideCode'),
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
        'embedding_count': 1,
        'total_tokens': token_count
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

    if not full_text.strip():
        raise ValueError("No text content found in company data")

    # Generate embedding
    embedding = generate_embedding(full_text)
    token_count = count_tokens(full_text)

    # Store embedding data
    timestamp = datetime.utcnow().isoformat()
    embedding_key = f"companies/{company_id}/embeddings/{timestamp}.json"

    embedding_data = {
        'company_id': company_id,
        'embedding': embedding,
        'text': full_text[:500] + '...' if len(full_text) > 500 else full_text,
        'token_count': token_count,
        'type': 'full_profile',
        'metadata': {
            'company_name': company_data.get('company_name'),
            'tenant_id': company_data.get('tenant_id'),
            'industry_naics': company_data.get('industry_naics'),
            'certifications': company_data.get('certifications'),
            'generated_at': timestamp
        }
    }

    s3_uri = store_embedding_s3(embedding_data, EMBEDDINGS_BUCKET, embedding_key)

    # Store vector index entry in DynamoDB
    vector_index_entry = {
        'entity_type': 'company',
        'entity_id': company_id,
        's3_uri': s3_uri,
        'embedding_count': 1,
        'total_tokens': token_count,
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
        'embedding_count': 1,
        'total_tokens': token_count
    }

def lambda_handler(event, context):
    """
    Lambda handler for simple embedding generation

    Event structure:
    {
        "type": "opportunity" | "company",
        "data": {...},  # Opportunity or company data
        "operation": "generate" | "regenerate"
    }
    """
    try:
        logger.info(f"Processing simple embedding generation request: {json.dumps(event, default=str)}")

        event_type = event.get('type')
        operation = event.get('operation', 'generate')
        data = event.get('data')

        if not data:
            raise ValueError("Event must contain 'data'")

        if event_type == 'opportunity':
            result = process_opportunity_embedding(data)
        elif event_type == 'company':
            result = process_company_embedding(data)
        else:
            raise ValueError(f"Unknown type: {event_type}")

        response = {
            'statusCode': 200,
            'body': {
                'message': f'Successfully generated embedding for {event_type}',
                'type': event_type,
                'operation': operation,
                'result': result
            }
        }

        logger.info(f"Embedding generation completed successfully")
        return response

    except Exception as e:
        logger.error(f"Error in embedding generation: {str(e)}")
        return {
            'statusCode': 500,
            'body': {
                'error': str(e),
                'message': 'Failed to generate embedding'
            }
        }