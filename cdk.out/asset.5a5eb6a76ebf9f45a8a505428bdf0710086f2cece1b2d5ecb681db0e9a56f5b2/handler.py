import json
import boto3
import logging
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from decimal import Decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
bedrock_runtime = boto3.client('bedrock-runtime')
s3_client = boto3.client('s3')

# Environment variables
OPPORTUNITIES_TABLE_NAME = os.environ['OPPORTUNITIES_TABLE']
EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']
TEMP_BUCKET = os.environ['TEMP_PROCESSING_BUCKET']

# Initialize DynamoDB tables
opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE_NAME)
vector_index_table = dynamodb.Table('govbizai-vector-index')

# Bedrock model configuration
BEDROCK_MODEL_ID = "amazon.titan-embed-text-v2:0"
EMBEDDING_DIMENSIONS = 1024

def lambda_handler(event, context):
    """
    Main handler for processing opportunities and generating embeddings.

    Expected event structure from SQS:
    {
        "Records": [
            {
                "body": "{\"notice_id\": \"string\", \"opportunity_data\": {...}, \"attachments\": [...]}"
            }
        ]
    }
    """
    try:
        logger.info(f"Processing opportunity: {json.dumps(event, default=str)}")

        # Handle SQS event format
        if 'Records' in event:
            # Process each record in the SQS batch
            results = []
            for record in event['Records']:
                try:
                    # Parse the SQS message body
                    message_body = json.loads(record['body'])

                    # Extract parameters from message
                    notice_id = message_body.get('notice_id')
                    if not notice_id:
                        raise ValueError("Missing required 'notice_id' parameter in SQS message")

                    opportunity_data = message_body.get('opportunity_data', {})
                    if not opportunity_data:
                        raise ValueError("Missing required 'opportunity_data' parameter in SQS message")

                    attachments_info = message_body.get('attachments', [])

                    # Process this individual opportunity
                    result = process_single_opportunity(notice_id, opportunity_data, attachments_info)
                    results.append(result)

                except Exception as e:
                    logger.error(f"Failed to process SQS record: {str(e)}")
                    results.append({
                        'statusCode': 500,
                        'error': str(e),
                        'record': record.get('messageId', 'unknown')
                    })

            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': f'Processed {len(results)} records',
                    'results': results
                })
            }

        else:
            # Direct invocation format (legacy support)
            notice_id = event.get('notice_id')
            if not notice_id:
                raise ValueError("Missing required 'notice_id' parameter")

            opportunity_data = event.get('opportunity_data', {})
            if not opportunity_data:
                raise ValueError("Missing required 'opportunity_data' parameter")

            attachments_info = event.get('attachments', [])

            # Process single opportunity (direct invocation)
            result = process_single_opportunity(notice_id, opportunity_data, attachments_info)
            return result

    except Exception as e:
        logger.error(f"Opportunity processing error: {str(e)}", exc_info=True)

        # Try to store error status in DynamoDB
        try:
            if event.get('notice_id') and event.get('opportunity_data'):
                store_processing_error(event['notice_id'], event['opportunity_data'], str(e))
        except Exception as db_error:
            logger.error(f"Failed to store error status: {str(db_error)}")

        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Opportunity processing failed',
                'message': str(e),
                'notice_id': event.get('notice_id')
            })
        }

def process_single_opportunity(notice_id: str, opportunity_data: Dict[str, Any], attachments_info: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Process a single opportunity through the complete pipeline with idempotency."""
    try:
        # Check if opportunity already exists (idempotency check)
        existing_opportunity = check_opportunity_exists(notice_id)
        if existing_opportunity:
            logger.info(f"Opportunity {notice_id} already exists, skipping processing")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'notice_id': notice_id,
                    'title': existing_opportunity.get('title'),
                    'processing_status': 'already_exists',
                    'embedding_generated': bool(existing_opportunity.get('embedding_metadata')),
                    'embeddings_stored': len(existing_opportunity.get('embedding_metadata', {}).get('embedding_keys', [])),
                    'attachments_processed': existing_opportunity.get('attachment_count', 0),
                    'dynamodb_stored': True
                })
            }

        # Validate and process opportunity data
        processed_opportunity = validate_and_process_opportunity(opportunity_data)

        # Generate text content for embedding
        text_content = extract_text_content(processed_opportunity)

        # Generate embeddings (with idempotency checks)
        embedding_metadata = generate_and_store_embeddings(notice_id, text_content, processed_opportunity)

        # Store opportunity in DynamoDB (upsert operation)
        store_opportunity_in_dynamodb(processed_opportunity, embedding_metadata, attachments_info)

        # Update vector index (with idempotency checks)
        if embedding_metadata:
            update_vector_index(notice_id, processed_opportunity, embedding_metadata)

        logger.info(f"Successfully processed opportunity {notice_id}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'notice_id': notice_id,
                'title': processed_opportunity.get('title'),
                'processing_status': 'completed',
                'embedding_generated': bool(embedding_metadata),
                'embeddings_stored': len(embedding_metadata.get('embedding_keys', [])),
                'attachments_processed': len(attachments_info),
                'dynamodb_stored': True
            })
        }

    except Exception as e:
        logger.error(f"Failed to process opportunity {notice_id}: {str(e)}")

        # Try to store error status in DynamoDB
        try:
            store_processing_error(notice_id, opportunity_data, str(e))
        except Exception as db_error:
            logger.error(f"Failed to store error status: {str(db_error)}")

        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Opportunity processing failed',
                'message': str(e),
                'notice_id': notice_id
            })
        }

def check_opportunity_exists(notice_id: str) -> Optional[Dict[str, Any]]:
    """Check if opportunity already exists in DynamoDB."""
    try:
        response = opportunities_table.get_item(
            Key={'notice_id': notice_id}
        )
        if 'Item' in response:
            logger.info(f"Found existing opportunity: {notice_id}")
            return response['Item']
        return None
    except Exception as e:
        logger.error(f"Error checking opportunity existence: {str(e)}")
        return None

def validate_and_process_opportunity(opportunity_data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and normalize opportunity data."""
    logger.info("Validating and processing opportunity data")

    # Required fields validation
    required_fields = ['NoticeId', 'Title', 'PostedDate']
    for field in required_fields:
        if not opportunity_data.get(field):
            raise ValueError(f"Missing required field: {field}")

    # Process and normalize the opportunity data
    processed = {
        # Core identification
        'notice_id': str(opportunity_data['NoticeId']).strip(),
        'title': str(opportunity_data.get('Title', '')).strip(),
        'solicitation_number': str(opportunity_data.get('Sol#', '')).strip(),

        # Dates
        'posted_date': opportunity_data.get('PostedDate', ''),
        'response_deadline': opportunity_data.get('ResponseDeadLine', ''),
        'archive_date': opportunity_data.get('ArchiveDate', ''),

        # Agency/Department info
        'department': str(opportunity_data.get('Department/Ind.Agency', '')).strip(),
        'office': str(opportunity_data.get('Office', '')).strip(),
        'cgac': str(opportunity_data.get('CGAC', '')).strip(),
        'sub_tier': str(opportunity_data.get('Sub-Tier', '')).strip(),

        # Classification
        'notice_type': str(opportunity_data.get('Type', '')).strip(),
        'base_type': str(opportunity_data.get('BaseType', '')).strip(),
        'naics_code': str(opportunity_data.get('NaicsCode', '')).strip(),
        'classification_code': str(opportunity_data.get('ClassificationCode', '')).strip(),

        # Set-aside information
        'set_aside_code': str(opportunity_data.get('SetASideCode', '')).strip(),
        'set_aside': str(opportunity_data.get('SetASide', '')).strip(),

        # Location
        'pop_address': str(opportunity_data.get('PopStreetAddress', '')).strip(),
        'pop_city': str(opportunity_data.get('PopCity', '')).strip(),
        'pop_state': str(opportunity_data.get('PopState', '')).strip(),
        'pop_zip': str(opportunity_data.get('PopZip', '')).strip(),
        'pop_country': str(opportunity_data.get('PopCountry', '')).strip(),

        # Award information (if applicable)
        'award_number': str(opportunity_data.get('AwardNumber', '')).strip(),
        'award_date': opportunity_data.get('AwardDate', ''),
        'award_amount': opportunity_data.get('Award$', 0),
        'awardee': str(opportunity_data.get('Awardee', '')).strip(),

        # Contact information
        'primary_contact_name': str(opportunity_data.get('PrimaryContactFullname', '')).strip(),
        'primary_contact_email': str(opportunity_data.get('PrimaryContactEmail', '')).strip(),
        'primary_contact_phone': str(opportunity_data.get('PrimaryContactPhone', '')).strip(),

        # Links
        'additional_info_link': str(opportunity_data.get('AdditionalInfoLink', '')).strip(),
        'link': str(opportunity_data.get('Link', '')).strip(),

        # Description
        'description': str(opportunity_data.get('Description', '')).strip(),

        # Status
        'active': opportunity_data.get('Active', '') == 'Yes',

        # Processing metadata
        'processed_at': datetime.utcnow().isoformat(),
        'processing_status': 'completed'
    }

    # Convert numeric fields
    try:
        if opportunity_data.get('Award$'):
            award_str = str(opportunity_data['Award$']).replace('$', '').replace(',', '').strip()
            if award_str and award_str != '0':
                processed['award_amount'] = float(award_str)
            else:
                processed['award_amount'] = 0.0
    except (ValueError, TypeError):
        processed['award_amount'] = 0.0

    logger.info(f"Processed opportunity: {processed['notice_id']} - {processed['title']}")
    return processed

def extract_text_content(opportunity: Dict[str, Any]) -> Dict[str, str]:
    """Extract and organize text content for embedding generation."""
    logger.info("Extracting text content for embeddings")

    content = {
        # Main content (for primary embedding)
        'main': f"""
Title: {opportunity.get('title', '')}
Description: {opportunity.get('description', '')}
Department: {opportunity.get('department', '')}
Office: {opportunity.get('office', '')}
NAICS Code: {opportunity.get('naics_code', '')}
Set Aside: {opportunity.get('set_aside', '')}
Location: {opportunity.get('pop_city', '')}, {opportunity.get('pop_state', '')}
""".strip(),

        # Title only (for title-specific matching)
        'title': opportunity.get('title', ''),

        # Description only (for detailed content matching)
        'description': opportunity.get('description', ''),

        # Agency/department context
        'agency': f"{opportunity.get('department', '')} - {opportunity.get('office', '')}".strip(' -'),

        # Location context
        'location': f"{opportunity.get('pop_city', '')}, {opportunity.get('pop_state', '')} {opportunity.get('pop_zip', '')}".strip(', '),

        # Classification context
        'classification': f"NAICS: {opportunity.get('naics_code', '')} - {opportunity.get('set_aside', '')}".strip(' -')
    }

    # Clean empty content
    content = {key: value for key, value in content.items() if value and value.strip()}

    logger.info(f"Extracted {len(content)} content segments for embedding")
    return content

def generate_and_store_embeddings(notice_id: str, content: Dict[str, str], opportunity: Dict[str, Any]) -> Dict[str, Any]:
    """Generate embeddings using Bedrock and store in S3."""
    logger.info(f"Generating embeddings for opportunity {notice_id}")

    embedding_metadata = {
        'notice_id': notice_id,
        'generated_at': datetime.utcnow().isoformat(),
        'model_id': BEDROCK_MODEL_ID,
        'dimensions': EMBEDDING_DIMENSIONS,
        'embedding_keys': []
    }

    try:
        for content_type, text in content.items():
            if not text or len(text.strip()) < 10:  # Skip very short content
                logger.warning(f"Skipping short content for {content_type}: {len(text)} chars")
                continue

            # Generate embedding
            embedding_vector = generate_embedding(text)

            # Store embedding in S3
            s3_key = store_embedding_vector(notice_id, content_type, embedding_vector, opportunity)

            embedding_metadata['embedding_keys'].append({
                'content_type': content_type,
                's3_key': s3_key,
                'text_length': len(text),
                'vector_length': len(embedding_vector)
            })

            logger.info(f"Generated and stored {content_type} embedding for {notice_id}")

        logger.info(f"Generated {len(embedding_metadata['embedding_keys'])} embeddings for {notice_id}")
        return embedding_metadata

    except Exception as e:
        logger.error(f"Failed to generate embeddings for {notice_id}: {str(e)}")
        return {}

def generate_embedding(text: str) -> List[float]:
    """Generate embedding vector using Amazon Bedrock Titan."""
    try:
        # Prepare the request
        request_body = {
            "inputText": text,
            "dimensions": EMBEDDING_DIMENSIONS,
            "normalize": True
        }

        # Call Bedrock
        response = bedrock_runtime.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(request_body)
        )

        # Parse response
        response_body = json.loads(response['body'].read())
        embedding = response_body.get('embedding', [])

        if not embedding:
            raise ValueError("Empty embedding returned from Bedrock")

        return embedding

    except Exception as e:
        logger.error(f"Failed to generate embedding: {str(e)}")
        raise

def store_embedding_vector(notice_id: str, content_type: str, embedding: List[float], opportunity: Dict[str, Any]) -> str:
    """Store embedding vector in S3 with metadata and idempotency."""
    try:
        # Use posted_date for deterministic key generation (not current date)
        posted_date = opportunity.get('posted_date', '')
        if posted_date:
            try:
                # Parse posted_date to get consistent date format
                parsed_date = datetime.strptime(posted_date, '%Y-%m-%d')
                date_prefix = parsed_date.strftime('%Y-%m-%d')
            except (ValueError, TypeError):
                # Fallback to current date if posted_date is malformed
                date_prefix = datetime.utcnow().strftime('%Y-%m-%d')
        else:
            date_prefix = datetime.utcnow().strftime('%Y-%m-%d')

        # Use deterministic key for idempotency (based on posted_date, not current time)
        s3_key = f"opportunities/{date_prefix}/{notice_id}/embedding_{content_type}.json"

        # Check if embedding already exists
        try:
            s3_client.head_object(Bucket=EMBEDDINGS_BUCKET, Key=s3_key)
            logger.info(f"Embedding already exists: {s3_key}")
            return s3_key
        except Exception as e:
            # Embedding doesn't exist or other S3 error, proceed with creation
            logger.debug(f"S3 head_object check failed (expected for new objects): {str(e)}")
            pass

        embedding_data = {
            'notice_id': notice_id,
            'content_type': content_type,
            'embedding_vector': embedding,
            'metadata': {
                'title': opportunity.get('title'),
                'naics_code': opportunity.get('naics_code'),
                'set_aside': opportunity.get('set_aside'),
                'department': opportunity.get('department'),
                'posted_date': opportunity.get('posted_date'),
                'archive_date': opportunity.get('archive_date'),
                'pop_state': opportunity.get('pop_state'),
                'pop_city': opportunity.get('pop_city')
            },
            'generated_at': datetime.utcnow().isoformat(),
            'model_id': BEDROCK_MODEL_ID,
            'dimensions': len(embedding)
        }

        s3_client.put_object(
            Bucket=EMBEDDINGS_BUCKET,
            Key=s3_key,
            Body=json.dumps(embedding_data).encode('utf-8'),
            ContentType='application/json',
            ServerSideEncryption='aws:kms'
        )

        logger.info(f"Stored {content_type} embedding at: s3://{EMBEDDINGS_BUCKET}/{s3_key}")
        return s3_key

    except Exception as e:
        logger.error(f"Failed to store embedding: {str(e)}")
        raise

def store_opportunity_in_dynamodb(opportunity: Dict[str, Any], embedding_metadata: Dict[str, Any], attachments_info: List[Dict[str, Any]]):
    """Store opportunity data in DynamoDB with idempotency (upsert behavior)."""
    logger.info(f"Storing opportunity {opportunity['notice_id']} in DynamoDB")

    try:
        # Convert float values to Decimal for DynamoDB
        def convert_floats(obj):
            if isinstance(obj, float):
                return Decimal(str(obj))
            elif isinstance(obj, dict):
                return {k: convert_floats(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_floats(v) for v in obj]
            return obj

        # Prepare DynamoDB item
        item = convert_floats(opportunity.copy())

        # Add processing metadata
        item['processing_status'] = 'completed'
        item['processed_at'] = datetime.utcnow().isoformat()
        item['updated_at'] = datetime.utcnow().isoformat()

        # Add embedding metadata
        if embedding_metadata:
            item['embedding_metadata'] = convert_floats(embedding_metadata)

        # Add attachment information
        if attachments_info:
            item['attachments'] = convert_floats(attachments_info)
            item['attachment_count'] = len(attachments_info)
        else:
            item['attachment_count'] = 0

        # Add search indexes
        item['naics_code'] = opportunity.get('naics_code', '')
        item['archive_date'] = opportunity.get('archive_date', '')

        # Use put_item which acts as upsert (insert or update)
        # This ensures idempotency - if record exists it will be updated
        opportunities_table.put_item(Item=item)

        logger.info(f"Successfully stored/updated opportunity {opportunity['notice_id']} in DynamoDB")

    except Exception as e:
        logger.error(f"Failed to store opportunity in DynamoDB: {str(e)}")
        raise

def store_processing_error(notice_id: str, opportunity_data: Dict[str, Any], error_message: str):
    """Store processing error in DynamoDB for tracking."""
    try:
        logger.info(f"Storing processing error for opportunity {notice_id}")

        item = {
            'notice_id': notice_id,
            'posted_date': opportunity_data.get('PostedDate', ''),
            'title': str(opportunity_data.get('Title', 'Unknown')),
            'processing_status': 'error',
            'error_message': error_message,
            'error_timestamp': datetime.utcnow().isoformat(),
            'retry_count': 0
        }

        opportunities_table.put_item(Item=item)
        logger.info(f"Stored error status for opportunity {notice_id}")

    except Exception as e:
        logger.error(f"Failed to store processing error: {str(e)}")

def update_vector_index(notice_id: str, opportunity: Dict[str, Any], embedding_metadata: Dict[str, Any]):
    """Update the vector index table with embedding information (idempotent)."""
    try:
        logger.info(f"Updating vector index for opportunity {notice_id}")

        for embedding_info in embedding_metadata.get('embedding_keys', []):
            # Use the actual table schema: entity_type (HASH) + entity_id (RANGE)
            entity_type = 'opportunity'
            entity_id = f"{notice_id}_{embedding_info['content_type']}"

            # Check if vector index entry already exists using the correct key schema
            try:
                existing_response = vector_index_table.get_item(
                    Key={
                        'entity_type': entity_type,
                        'entity_id': entity_id
                    }
                )
                if 'Item' in existing_response:
                    logger.info(f"Vector index entry already exists: {entity_type}/{entity_id}")
                    continue
            except Exception as e:
                logger.warning(f"Error checking existing vector index entry: {str(e)}")

            item = {
                'entity_type': entity_type,
                'entity_id': entity_id,
                'notice_id': notice_id,
                's3_uri': f"s3://{EMBEDDINGS_BUCKET}/{embedding_info['s3_key']}",
                'content_type': embedding_info['content_type'],
                'created_at': embedding_metadata['generated_at'],
                'updated_at': datetime.utcnow().isoformat(),
                'total_tokens': embedding_info['text_length'],
                'embedding_count': 1,
                'metadata': {
                    'title': opportunity.get('title'),
                    'agency': opportunity.get('department'),
                    'naics_code': opportunity.get('naics_code'),
                    'set_aside': opportunity.get('set_aside'),
                    'posted_date': opportunity.get('posted_date'),
                    'response_deadline': opportunity.get('response_deadline'),
                    'archive_date': opportunity.get('archive_date')
                }
            }

            vector_index_table.put_item(Item=item)
            logger.info(f"Updated vector index for {notice_id} - {embedding_info['content_type']}")

    except Exception as e:
        logger.error(f"Failed to update vector index for {notice_id}: {str(e)}")
        # Don't fail the entire processing if vector index update fails
        pass