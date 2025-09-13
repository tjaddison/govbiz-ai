"""
Unified Document Processing Interface for GovBizAI
Orchestrates the complete document processing pipeline:
1. File type detection
2. Text extraction (appropriate method)
3. Text cleaning
4. Document chunking
5. Error handling and recovery
"""

import json
import logging
import boto3
from botocore.exceptions import ClientError
from typing import Dict, Any, List, Optional
import os
import time
from document_utils import (
    setup_logging, create_response, generate_correlation_id,
    validate_tenant_access, extract_metadata_from_s3_key,
    get_file_type_from_extension, validate_file_size,
    get_processing_priority, create_processing_metadata
)

# Initialize AWS clients
s3_client = boto3.client('s3')
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')
sns_client = boto3.client('sns')

# Environment variables
RAW_DOCUMENTS_BUCKET = os.environ['RAW_DOCUMENTS_BUCKET']
PROCESSED_DOCUMENTS_BUCKET = os.environ['PROCESSED_DOCUMENTS_BUCKET']
COMPANIES_TABLE = os.environ['COMPANIES_TABLE']

# Lambda function names
FILE_HANDLERS_FUNCTION = os.environ.get('FILE_HANDLERS_FUNCTION', 'govbizai-file-handlers')
TEXT_EXTRACTION_FUNCTION = os.environ.get('TEXT_EXTRACTION_FUNCTION', 'govbizai-text-extraction')
TEXTRACT_PROCESSOR_FUNCTION = os.environ.get('TEXTRACT_PROCESSOR_FUNCTION', 'govbizai-textract-processor')
TEXT_CLEANER_FUNCTION = os.environ.get('TEXT_CLEANER_FUNCTION', 'govbizai-text-cleaner')
DOCUMENT_CHUNKER_FUNCTION = os.environ.get('DOCUMENT_CHUNKER_FUNCTION', 'govbizai-document-chunker')

# Optional SNS topic for notifications
PROCESSING_NOTIFICATIONS_TOPIC = os.environ.get('PROCESSING_NOTIFICATIONS_TOPIC')

# Setup logging
setup_logging('unified-processor')
logger = logging.getLogger(__name__)

# Processing pipeline configuration
PIPELINE_CONFIG = {
    'max_file_size_mb': 100,
    'supported_file_types': ['pdf', 'word', 'excel', 'text', 'html', 'csv'],
    'default_cleaning_level': 'basic',
    'default_chunk_size': 1000,
    'default_overlap': 200,
    'retry_attempts': 3,
    'retry_delay_seconds': 5
}


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main handler for unified document processing

    Event types:
    1. S3 trigger:
       {
         "Records": [{"s3": {"bucket": {"name": "..."}, "object": {"key": "..."}}}]
       }

    2. Direct invocation:
       {
         "action": "process_document",
         "bucket": "bucket-name",
         "key": "file-key",
         "tenant_id": "tenant-uuid",
         "processing_options": {
           "cleaning_level": "basic|aggressive",
           "chunking_strategy": "semantic|fixed",
           "chunk_size": 1000,
           "overlap": 200,
           "skip_textract": false
         }
       }

    3. Pipeline status check:
       {
         "action": "get_status",
         "correlation_id": "correlation-id"
       }
    """
    correlation_id = generate_correlation_id()
    logger.info(f"Starting unified document processing - Correlation ID: {correlation_id}")

    try:
        action = event.get('action', 'process_document')

        if action == 'process_document':
            return process_document_pipeline(event, correlation_id)
        elif action == 'get_status':
            return get_processing_status(event, correlation_id)
        elif 'Records' in event:
            # S3 trigger event
            return handle_s3_trigger(event, correlation_id)
        else:
            return create_response(400, {
                'message': f'Unknown action: {action}',
                'correlation_id': correlation_id
            }, correlation_id)

    except Exception as e:
        logger.error(f"Error in unified document processing: {str(e)}")
        return create_response(500, {
            'message': 'Internal server error',
            'error': str(e),
            'correlation_id': correlation_id
        }, correlation_id)


def handle_s3_trigger(event: Dict[str, Any], correlation_id: str) -> Dict[str, Any]:
    """
    Handle S3 trigger events for automatic document processing
    """
    try:
        record = event['Records'][0]
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']

        logger.info(f"Processing S3 trigger for s3://{bucket}/{key}")

        # Extract tenant_id from key path
        metadata = extract_metadata_from_s3_key(key)
        tenant_id = metadata.get('tenant_id')

        if not tenant_id:
            logger.error(f"No tenant_id found in S3 key path: {key}")
            return create_response(400, {
                'message': 'Missing tenant_id in file path',
                'key': key
            }, correlation_id)

        # Start processing pipeline
        return process_document_pipeline({
            'bucket': bucket,
            'key': key,
            'tenant_id': tenant_id,
            'processing_options': {}
        }, correlation_id)

    except Exception as e:
        logger.error(f"Error handling S3 trigger: {str(e)}")
        raise


def process_document_pipeline(event: Dict[str, Any], correlation_id: str) -> Dict[str, Any]:
    """
    Execute the complete document processing pipeline
    """
    try:
        bucket = event['bucket']
        key = event['key']
        tenant_id = event['tenant_id']
        processing_options = event.get('processing_options', {})

        logger.info(f"Starting pipeline for s3://{bucket}/{key}, tenant: {tenant_id}")

        # Initialize pipeline state
        pipeline_state = {
            'correlation_id': correlation_id,
            'tenant_id': tenant_id,
            'source_bucket': bucket,
            'source_key': key,
            'steps_completed': [],
            'processing_options': processing_options,
            'start_time': time.time(),
            'current_step': 'validation'
        }

        # Step 1: Validate file and tenant access
        validation_result = validate_processing_request(bucket, key, tenant_id, correlation_id)
        if not validation_result['valid']:
            return create_response(400, validation_result, correlation_id)

        pipeline_state['file_info'] = validation_result['file_info']
        pipeline_state['steps_completed'].append('validation')
        pipeline_state['current_step'] = 'file_type_detection'

        # Step 2: Detect file type
        file_type = get_file_type_from_extension(key)
        if file_type == 'unknown':
            file_type = 'text'  # Default fallback

        pipeline_state['file_type'] = file_type
        pipeline_state['steps_completed'].append('file_type_detection')
        pipeline_state['current_step'] = 'text_extraction'

        logger.info(f"Processing file type: {file_type}")

        # Step 3: Text extraction
        extraction_result = execute_text_extraction(
            bucket, key, tenant_id, file_type, processing_options, correlation_id
        )

        pipeline_state['extraction_result'] = extraction_result
        pipeline_state['steps_completed'].append('text_extraction')
        pipeline_state['current_step'] = 'text_cleaning'

        # Step 4: Text cleaning (if extraction was successful)
        if extraction_result['success']:
            cleaning_result = execute_text_cleaning(
                extraction_result['output_location'],
                tenant_id,
                processing_options,
                correlation_id
            )

            pipeline_state['cleaning_result'] = cleaning_result
            pipeline_state['steps_completed'].append('text_cleaning')
            pipeline_state['current_step'] = 'document_chunking'

            # Step 5: Document chunking
            chunking_result = execute_document_chunking(
                cleaning_result['output_location'],
                tenant_id,
                processing_options,
                correlation_id
            )

            pipeline_state['chunking_result'] = chunking_result
            pipeline_state['steps_completed'].append('document_chunking')
            pipeline_state['current_step'] = 'completed'

        else:
            pipeline_state['current_step'] = 'failed'
            pipeline_state['error'] = extraction_result.get('error', 'Text extraction failed')

        # Step 6: Update processing metadata and send notifications
        pipeline_state['end_time'] = time.time()
        pipeline_state['total_duration'] = pipeline_state['end_time'] - pipeline_state['start_time']

        # Store pipeline result
        store_pipeline_result(pipeline_state)

        # Send completion notification
        if PROCESSING_NOTIFICATIONS_TOPIC:
            send_processing_notification(pipeline_state)

        # Return final result
        if pipeline_state['current_step'] == 'completed':
            return create_response(200, {
                'message': 'Document processing pipeline completed successfully',
                'correlation_id': correlation_id,
                'tenant_id': tenant_id,
                'file_type': file_type,
                'steps_completed': pipeline_state['steps_completed'],
                'total_duration': round(pipeline_state['total_duration'], 2),
                'extraction_result': extraction_result,
                'cleaning_result': pipeline_state.get('cleaning_result', {}),
                'chunking_result': pipeline_state.get('chunking_result', {}),
                'final_output': pipeline_state.get('chunking_result', {}).get('output_location')
            }, correlation_id)
        else:
            return create_response(500, {
                'message': 'Document processing pipeline failed',
                'correlation_id': correlation_id,
                'error': pipeline_state.get('error', 'Unknown error'),
                'steps_completed': pipeline_state['steps_completed'],
                'failed_at': pipeline_state['current_step']
            }, correlation_id)

    except Exception as e:
        logger.error(f"Error in processing pipeline: {str(e)}")
        raise


def validate_processing_request(
    bucket: str,
    key: str,
    tenant_id: str,
    correlation_id: str
) -> Dict[str, Any]:
    """
    Validate the processing request
    """
    try:
        # Check if file exists and get metadata
        try:
            head_response = s3_client.head_object(Bucket=bucket, Key=key)
            file_size = head_response['ContentLength']
            last_modified = head_response['LastModified']
        except ClientError as e:
            return {
                'valid': False,
                'message': 'File not found',
                'error': str(e)
            }

        # Validate file size
        size_valid, size_message = validate_file_size(file_size, PIPELINE_CONFIG['max_file_size_mb'])
        if not size_valid:
            return {
                'valid': False,
                'message': size_message,
                'file_size': file_size
            }

        # Check file type support
        file_type = get_file_type_from_extension(key)
        if file_type not in PIPELINE_CONFIG['supported_file_types'] and file_type != 'unknown':
            return {
                'valid': False,
                'message': f'Unsupported file type: {file_type}',
                'supported_types': PIPELINE_CONFIG['supported_file_types']
            }

        # Validate tenant exists (simplified check)
        companies_table = dynamodb.Table(COMPANIES_TABLE)
        try:
            response = companies_table.get_item(
                Key={'company_id': tenant_id}
            )
            if 'Item' not in response:
                return {
                    'valid': False,
                    'message': 'Invalid tenant_id',
                    'tenant_id': tenant_id
                }
        except ClientError:
            # If table doesn't exist or other error, continue (dev environment)
            logger.warning(f"Could not validate tenant {tenant_id} - continuing anyway")

        return {
            'valid': True,
            'file_info': {
                'size': file_size,
                'last_modified': str(last_modified),
                'type': file_type,
                'priority': get_processing_priority({
                    'size': file_size,
                    'type': file_type
                })
            }
        }

    except Exception as e:
        return {
            'valid': False,
            'message': 'Validation error',
            'error': str(e)
        }


def execute_text_extraction(
    bucket: str,
    key: str,
    tenant_id: str,
    file_type: str,
    processing_options: Dict[str, Any],
    correlation_id: str
) -> Dict[str, Any]:
    """
    Execute text extraction based on file type
    """
    logger.info(f"Executing text extraction for file type: {file_type}")

    try:
        if file_type == 'pdf':
            # Use dedicated PDF extraction function
            function_name = TEXT_EXTRACTION_FUNCTION
            payload = {
                'bucket': bucket,
                'key': key,
                'tenant_id': tenant_id
            }
        else:
            # Use file handlers for other types
            function_name = FILE_HANDLERS_FUNCTION
            payload = {
                'bucket': bucket,
                'key': key,
                'tenant_id': tenant_id,
                'file_type': file_type
            }

        response = invoke_lambda_with_retry(function_name, payload)

        if response['StatusCode'] == 200:
            result = json.loads(response['Payload'].read())
            if 'body' in result:
                body = json.loads(result['body']) if isinstance(result['body'], str) else result['body']
                return {
                    'success': True,
                    'output_location': body.get('processing_result', {}).get('output_location') or
                                     body.get('output_location'),
                    'details': body
                }
            else:
                return {
                    'success': True,
                    'output_location': result.get('output_location'),
                    'details': result
                }
        else:
            return {
                'success': False,
                'error': f"Lambda function failed with status {response['StatusCode']}"
            }

    except Exception as e:
        logger.error(f"Text extraction failed: {str(e)}")

        # If PDF extraction failed, try Textract as fallback
        if file_type == 'pdf' and not processing_options.get('skip_textract', False):
            logger.info("Trying Textract as fallback for PDF")
            return execute_textract_fallback(bucket, key, tenant_id, correlation_id)

        return {
            'success': False,
            'error': str(e)
        }


def execute_textract_fallback(
    bucket: str,
    key: str,
    tenant_id: str,
    correlation_id: str
) -> Dict[str, Any]:
    """
    Execute Textract as fallback for failed PDF extraction
    """
    try:
        payload = {
            'action': 'sync_process',
            'bucket': bucket,
            'key': key,
            'tenant_id': tenant_id
        }

        response = invoke_lambda_with_retry(TEXTRACT_PROCESSOR_FUNCTION, payload)

        if response['StatusCode'] == 200:
            result = json.loads(response['Payload'].read())
            if 'body' in result:
                body = json.loads(result['body']) if isinstance(result['body'], str) else result['body']
                return {
                    'success': True,
                    'output_location': body.get('output_location'),
                    'details': body,
                    'method': 'textract_fallback'
                }

        return {
            'success': False,
            'error': "Textract fallback also failed"
        }

    except Exception as e:
        logger.error(f"Textract fallback failed: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }


def execute_text_cleaning(
    document_location: str,
    tenant_id: str,
    processing_options: Dict[str, Any],
    correlation_id: str
) -> Dict[str, Any]:
    """
    Execute text cleaning step
    """
    logger.info(f"Executing text cleaning for: {document_location}")

    try:
        # Parse S3 location
        if document_location.startswith('s3://'):
            s3_parts = document_location[5:].split('/', 1)
            bucket = s3_parts[0]
            key = s3_parts[1]
        else:
            raise ValueError(f"Invalid S3 location: {document_location}")

        payload = {
            'bucket': bucket,
            'key': key,
            'tenant_id': tenant_id,
            'cleaning_level': processing_options.get('cleaning_level', PIPELINE_CONFIG['default_cleaning_level']),
            'preserve_formatting': processing_options.get('preserve_formatting', False)
        }

        response = invoke_lambda_with_retry(TEXT_CLEANER_FUNCTION, payload)

        if response['StatusCode'] == 200:
            result = json.loads(response['Payload'].read())
            if 'body' in result:
                body = json.loads(result['body']) if isinstance(result['body'], str) else result['body']
                return {
                    'success': True,
                    'output_location': body.get('output_location'),
                    'details': body
                }

        return {
            'success': False,
            'error': f"Text cleaning failed with status {response['StatusCode']}"
        }

    except Exception as e:
        logger.error(f"Text cleaning failed: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }


def execute_document_chunking(
    document_location: str,
    tenant_id: str,
    processing_options: Dict[str, Any],
    correlation_id: str
) -> Dict[str, Any]:
    """
    Execute document chunking step
    """
    logger.info(f"Executing document chunking for: {document_location}")

    try:
        # Parse S3 location
        if document_location.startswith('s3://'):
            s3_parts = document_location[5:].split('/', 1)
            bucket = s3_parts[0]
            key = s3_parts[1]
        else:
            raise ValueError(f"Invalid S3 location: {document_location}")

        payload = {
            'bucket': bucket,
            'key': key,
            'tenant_id': tenant_id,
            'chunking_strategy': processing_options.get('chunking_strategy', 'semantic'),
            'chunk_size': processing_options.get('chunk_size', PIPELINE_CONFIG['default_chunk_size']),
            'overlap': processing_options.get('overlap', PIPELINE_CONFIG['default_overlap']),
            'preserve_sections': processing_options.get('preserve_sections', True)
        }

        response = invoke_lambda_with_retry(DOCUMENT_CHUNKER_FUNCTION, payload)

        if response['StatusCode'] == 200:
            result = json.loads(response['Payload'].read())
            if 'body' in result:
                body = json.loads(result['body']) if isinstance(result['body'], str) else result['body']
                return {
                    'success': True,
                    'output_location': body.get('output_location'),
                    'details': body
                }

        return {
            'success': False,
            'error': f"Document chunking failed with status {response['StatusCode']}"
        }

    except Exception as e:
        logger.error(f"Document chunking failed: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }


def invoke_lambda_with_retry(function_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Invoke Lambda function with retry logic
    """
    for attempt in range(PIPELINE_CONFIG['retry_attempts']):
        try:
            response = lambda_client.invoke(
                FunctionName=function_name,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )
            return response

        except ClientError as e:
            logger.warning(f"Lambda invocation attempt {attempt + 1} failed: {str(e)}")
            if attempt < PIPELINE_CONFIG['retry_attempts'] - 1:
                time.sleep(PIPELINE_CONFIG['retry_delay_seconds'] * (attempt + 1))
            else:
                raise


def store_pipeline_result(pipeline_state: Dict[str, Any]) -> None:
    """
    Store pipeline processing result for tracking
    """
    try:
        output_key = f"tenants/{pipeline_state['tenant_id']}/pipeline-results/{pipeline_state['correlation_id']}.json"

        s3_client.put_object(
            Bucket=PROCESSED_DOCUMENTS_BUCKET,
            Key=output_key,
            Body=json.dumps(pipeline_state, default=str, indent=2),
            ContentType='application/json',
            ServerSideEncryption='AES256',
            Metadata={
                'tenant-id': pipeline_state['tenant_id'],
                'correlation-id': pipeline_state['correlation_id'],
                'pipeline-status': pipeline_state['current_step']
            }
        )

        logger.info(f"Pipeline result stored: s3://{PROCESSED_DOCUMENTS_BUCKET}/{output_key}")

    except Exception as e:
        logger.error(f"Failed to store pipeline result: {str(e)}")


def send_processing_notification(pipeline_state: Dict[str, Any]) -> None:
    """
    Send processing completion notification
    """
    try:
        if not PROCESSING_NOTIFICATIONS_TOPIC:
            return

        message = {
            'correlation_id': pipeline_state['correlation_id'],
            'tenant_id': pipeline_state['tenant_id'],
            'source_file': pipeline_state['source_key'],
            'status': pipeline_state['current_step'],
            'duration': pipeline_state['total_duration'],
            'steps_completed': pipeline_state['steps_completed']
        }

        sns_client.publish(
            TopicArn=PROCESSING_NOTIFICATIONS_TOPIC,
            Message=json.dumps(message),
            Subject=f"Document Processing {'Completed' if pipeline_state['current_step'] == 'completed' else 'Failed'}"
        )

        logger.info(f"Processing notification sent for {pipeline_state['correlation_id']}")

    except Exception as e:
        logger.error(f"Failed to send notification: {str(e)}")


def get_processing_status(event: Dict[str, Any], correlation_id: str) -> Dict[str, Any]:
    """
    Get processing status for a correlation ID
    """
    try:
        request_correlation_id = event['correlation_id']

        # Look for pipeline result in S3
        try:
            response = s3_client.get_object(
                Bucket=PROCESSED_DOCUMENTS_BUCKET,
                Key=f"pipeline-results/{request_correlation_id}.json"
            )
            pipeline_state = json.loads(response['Body'].read())

            return create_response(200, {
                'correlation_id': request_correlation_id,
                'status': pipeline_state['current_step'],
                'steps_completed': pipeline_state['steps_completed'],
                'duration': pipeline_state.get('total_duration'),
                'last_updated': pipeline_state.get('end_time', pipeline_state.get('start_time'))
            }, correlation_id)

        except ClientError:
            return create_response(404, {
                'message': 'Processing status not found',
                'correlation_id': request_correlation_id
            }, correlation_id)

    except Exception as e:
        logger.error(f"Error getting processing status: {str(e)}")
        return create_response(500, {
            'message': 'Error retrieving status',
            'error': str(e)
        }, correlation_id)