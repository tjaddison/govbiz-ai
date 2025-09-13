"""
Amazon Textract Processing Lambda Function for GovBizAI
Handles asynchronous text extraction using Amazon Textract
Used as fallback for scanned PDFs or when PyMuPDF extraction fails
"""

import json
import logging
import boto3
from botocore.exceptions import ClientError
from typing import Dict, Any, Optional, List
import os
import time
from document_utils import (
    setup_logging, create_response, generate_correlation_id,
    validate_tenant_access, extract_metadata_from_s3_key,
    clean_extracted_text, extract_document_sections,
    create_processing_metadata
)

# Initialize AWS clients
s3_client = boto3.client('s3')
textract_client = boto3.client('textract')
sqs_client = boto3.client('sqs')
dynamodb = boto3.resource('dynamodb')

# Environment variables
PROCESSED_DOCUMENTS_BUCKET = os.environ['PROCESSED_DOCUMENTS_BUCKET']
TEMP_PROCESSING_BUCKET = os.environ['TEMP_PROCESSING_BUCKET']
TEXTRACT_RESULTS_QUEUE = os.environ.get('TEXTRACT_RESULTS_QUEUE')
TEXTRACT_ROLE_ARN = os.environ['TEXTRACT_ROLE_ARN']

# Setup logging
setup_logging('textract-processor')
logger = logging.getLogger(__name__)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main handler for Textract processing

    Event types:
    1. Start Textract job:
       {
         "action": "start_job",
         "bucket": "bucket-name",
         "key": "file-key",
         "tenant_id": "tenant-uuid",
         "job_type": "text" or "analysis"
       }

    2. Process Textract results (from SQS/SNS):
       {
         "action": "process_results",
         "job_id": "textract-job-id",
         "status": "SUCCEEDED" or "FAILED",
         "bucket": "bucket-name",
         "key": "file-key"
       }

    3. Direct invocation for small documents:
       {
         "action": "sync_process",
         "bucket": "bucket-name",
         "key": "file-key",
         "tenant_id": "tenant-uuid"
       }
    """
    correlation_id = generate_correlation_id()
    logger.info(f"Starting Textract processing - Correlation ID: {correlation_id}")

    try:
        action = event.get('action', 'start_job')

        if action == 'start_job':
            return start_textract_job(event, correlation_id)
        elif action == 'process_results':
            return process_textract_results(event, correlation_id)
        elif action == 'sync_process':
            return sync_textract_process(event, correlation_id)
        else:
            return create_response(400, {
                'message': f'Unknown action: {action}',
                'correlation_id': correlation_id
            }, correlation_id)

    except Exception as e:
        logger.error(f"Error in Textract processing: {str(e)}")
        return create_response(500, {
            'message': 'Internal server error',
            'error': str(e),
            'correlation_id': correlation_id
        }, correlation_id)


def start_textract_job(event: Dict[str, Any], correlation_id: str) -> Dict[str, Any]:
    """
    Start asynchronous Textract job for large documents
    """
    try:
        bucket = event['bucket']
        key = event['key']
        tenant_id = event['tenant_id']
        job_type = event.get('job_type', 'text')  # 'text' or 'analysis'

        logger.info(f"Starting Textract {job_type} job for s3://{bucket}/{key}")

        # Configure job parameters
        job_params = {
            'DocumentLocation': {
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            },
            'JobTag': f"govbizai-{tenant_id}-{correlation_id}",
            'ClientRequestToken': correlation_id
        }

        # Add notification configuration if SQS queue is available
        if TEXTRACT_RESULTS_QUEUE:
            job_params['NotificationChannel'] = {
                'RoleArn': TEXTRACT_ROLE_ARN,
                'SNSTopicArn': TEXTRACT_RESULTS_QUEUE  # Would be SNS topic in production
            }

        # Start appropriate job type
        if job_type == 'analysis':
            response = textract_client.start_document_analysis(
                **job_params,
                FeatureTypes=['TABLES', 'FORMS']
            )
        else:
            response = textract_client.start_document_text_detection(**job_params)

        job_id = response['JobId']

        logger.info(f"Textract job started successfully: {job_id}")

        # Store job metadata for tracking
        job_metadata = {
            'job_id': job_id,
            'tenant_id': tenant_id,
            'source_bucket': bucket,
            'source_key': key,
            'job_type': job_type,
            'correlation_id': correlation_id,
            'status': 'IN_PROGRESS',
            'started_at': int(time.time())
        }

        # Store in temp bucket for job tracking
        tracking_key = f"textract-jobs/{job_id}/metadata.json"
        s3_client.put_object(
            Bucket=TEMP_PROCESSING_BUCKET,
            Key=tracking_key,
            Body=json.dumps(job_metadata, default=str),
            ContentType='application/json',
            ServerSideEncryption='AES256'
        )

        return create_response(200, {
            'message': 'Textract job started successfully',
            'job_id': job_id,
            'job_type': job_type,
            'tenant_id': tenant_id,
            'correlation_id': correlation_id
        }, correlation_id)

    except ClientError as e:
        logger.error(f"AWS error starting Textract job: {str(e)}")
        return create_response(500, {
            'message': 'Failed to start Textract job',
            'error': str(e),
            'correlation_id': correlation_id
        }, correlation_id)


def process_textract_results(event: Dict[str, Any], correlation_id: str) -> Dict[str, Any]:
    """
    Process completed Textract job results
    """
    try:
        job_id = event['job_id']
        status = event['status']

        logger.info(f"Processing Textract job results: {job_id}, Status: {status}")

        # Retrieve job metadata
        tracking_key = f"textract-jobs/{job_id}/metadata.json"
        try:
            response = s3_client.get_object(
                Bucket=TEMP_PROCESSING_BUCKET,
                Key=tracking_key
            )
            job_metadata = json.loads(response['Body'].read())
        except ClientError:
            logger.error(f"Could not retrieve job metadata for {job_id}")
            return create_response(404, {
                'message': 'Job metadata not found',
                'job_id': job_id
            }, correlation_id)

        if status != 'SUCCEEDED':
            logger.error(f"Textract job {job_id} failed with status: {status}")
            return create_response(500, {
                'message': f'Textract job failed with status: {status}',
                'job_id': job_id
            }, correlation_id)

        # Get job results
        job_type = job_metadata['job_type']

        if job_type == 'analysis':
            results = get_document_analysis_results(job_id)
        else:
            results = get_document_text_detection_results(job_id)

        # Process and store results
        processed_result = process_and_store_textract_results(
            results,
            job_metadata,
            correlation_id
        )

        logger.info(f"Textract results processed successfully for job {job_id}")

        return create_response(200, {
            'message': 'Textract results processed successfully',
            'job_id': job_id,
            'pages_processed': processed_result['pages_processed'],
            'total_characters': processed_result['total_characters'],
            'output_location': processed_result['output_location']
        }, correlation_id)

    except Exception as e:
        logger.error(f"Error processing Textract results: {str(e)}")
        return create_response(500, {
            'message': 'Failed to process Textract results',
            'error': str(e),
            'job_id': job_id
        }, correlation_id)


def sync_textract_process(event: Dict[str, Any], correlation_id: str) -> Dict[str, Any]:
    """
    Synchronous Textract processing for small documents (< 5MB)
    """
    try:
        bucket = event['bucket']
        key = event['key']
        tenant_id = event['tenant_id']

        logger.info(f"Starting synchronous Textract processing for s3://{bucket}/{key}")

        # Check file size first
        try:
            head_response = s3_client.head_object(Bucket=bucket, Key=key)
            file_size = head_response['ContentLength']

            # Textract sync limit is 5MB
            if file_size > 5 * 1024 * 1024:
                logger.warning(f"File too large for sync processing: {file_size} bytes")
                return create_response(400, {
                    'message': 'File too large for synchronous processing, use async instead',
                    'file_size': file_size,
                    'max_size': 5 * 1024 * 1024
                }, correlation_id)

        except ClientError as e:
            logger.error(f"Could not get file size: {str(e)}")
            return create_response(404, {
                'message': 'File not found',
                'error': str(e)
            }, correlation_id)

        # Process with synchronous Textract
        response = textract_client.detect_document_text(
            Document={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            }
        )

        # Extract text from response
        extracted_text = extract_text_from_textract_response(response)

        # Process and store results
        processed_data = {
            'tenant_id': tenant_id,
            'source_bucket': bucket,
            'source_key': key,
            'processing_type': 'textract_sync',
            'correlation_id': correlation_id,
            'full_text': clean_extracted_text(extracted_text),
            'blocks': response.get('Blocks', []),
            'statistics': {
                'total_characters': len(extracted_text),
                'total_words': len(extracted_text.split()),
                'processing_method': 'textract_sync'
            },
            'processing_metadata': create_processing_metadata(
                {
                    'bucket': bucket,
                    'key': key,
                    'size': file_size,
                    'type': 'pdf'
                },
                'textract_sync',
                tenant_id,
                {
                    'correlation_id': correlation_id,
                    'file_size': file_size
                }
            )
        }

        # Store results
        output_key = f"tenants/{tenant_id}/processed/{os.path.splitext(os.path.basename(key))[0]}_textract.json"

        s3_client.put_object(
            Bucket=PROCESSED_DOCUMENTS_BUCKET,
            Key=output_key,
            Body=json.dumps(processed_data, default=str, indent=2),
            ContentType='application/json',
            ServerSideEncryption='AES256',
            Metadata={
                'tenant-id': tenant_id,
                'processing-type': 'textract-sync',
                'correlation-id': correlation_id,
                'source-key': key
            }
        )

        logger.info(f"Sync Textract processing completed successfully")

        return create_response(200, {
            'message': 'Synchronous Textract processing completed',
            'total_characters': len(extracted_text),
            'total_words': len(extracted_text.split()),
            'output_location': f"s3://{PROCESSED_DOCUMENTS_BUCKET}/{output_key}",
            'correlation_id': correlation_id
        }, correlation_id)

    except ClientError as e:
        logger.error(f"AWS error in sync Textract processing: {str(e)}")
        return create_response(500, {
            'message': 'Textract processing failed',
            'error': str(e)
        }, correlation_id)


def get_document_text_detection_results(job_id: str) -> Dict[str, Any]:
    """
    Retrieve complete results from Textract text detection job
    """
    logger.info(f"Retrieving text detection results for job: {job_id}")

    blocks = []
    next_token = None

    while True:
        kwargs = {'JobId': job_id}
        if next_token:
            kwargs['NextToken'] = next_token

        response = textract_client.get_document_text_detection(**kwargs)

        blocks.extend(response.get('Blocks', []))

        next_token = response.get('NextToken')
        if not next_token:
            break

    return {
        'JobStatus': response['JobStatus'],
        'Blocks': blocks,
        'DocumentMetadata': response.get('DocumentMetadata', {})
    }


def get_document_analysis_results(job_id: str) -> Dict[str, Any]:
    """
    Retrieve complete results from Textract document analysis job
    """
    logger.info(f"Retrieving document analysis results for job: {job_id}")

    blocks = []
    next_token = None

    while True:
        kwargs = {'JobId': job_id}
        if next_token:
            kwargs['NextToken'] = next_token

        response = textract_client.get_document_analysis(**kwargs)

        blocks.extend(response.get('Blocks', []))

        next_token = response.get('NextToken')
        if not next_token:
            break

    return {
        'JobStatus': response['JobStatus'],
        'Blocks': blocks,
        'DocumentMetadata': response.get('DocumentMetadata', {})
    }


def extract_text_from_textract_response(response: Dict[str, Any]) -> str:
    """
    Extract plain text from Textract response blocks
    """
    text_lines = []
    blocks = response.get('Blocks', [])

    for block in blocks:
        if block['BlockType'] == 'LINE':
            text_lines.append(block['Text'])

    return '\\n'.join(text_lines)


def process_and_store_textract_results(
    results: Dict[str, Any],
    job_metadata: Dict[str, Any],
    correlation_id: str
) -> Dict[str, Any]:
    """
    Process Textract results and store in S3
    """
    try:
        # Extract text from blocks
        extracted_text = extract_text_from_textract_response(results)
        cleaned_text = clean_extracted_text(extracted_text)

        # Extract document sections
        sections = extract_document_sections(cleaned_text)

        # Process pages information
        pages_info = []
        current_page = 1
        page_text = ""

        for block in results.get('Blocks', []):
            if block['BlockType'] == 'PAGE':
                if page_text:
                    pages_info.append({
                        'page_number': current_page,
                        'text': clean_extracted_text(page_text),
                        'character_count': len(page_text)
                    })
                    current_page += 1
                    page_text = ""
            elif block['BlockType'] == 'LINE':
                page_text += block['Text'] + '\\n'

        # Add final page
        if page_text:
            pages_info.append({
                'page_number': current_page,
                'text': clean_extracted_text(page_text),
                'character_count': len(page_text)
            })

        # Create processed document data
        processed_data = {
            'tenant_id': job_metadata['tenant_id'],
            'source_bucket': job_metadata['source_bucket'],
            'source_key': job_metadata['source_key'],
            'processing_type': 'textract_async',
            'correlation_id': correlation_id,
            'job_id': job_metadata['job_id'],
            'full_text': cleaned_text,
            'pages': pages_info,
            'sections': sections,
            'textract_blocks': results.get('Blocks', []),
            'document_metadata': results.get('DocumentMetadata', {}),
            'statistics': {
                'total_pages': len(pages_info),
                'total_characters': len(cleaned_text),
                'total_words': len(cleaned_text.split()),
                'sections_found': len(sections),
                'processing_method': 'textract_async'
            },
            'processing_metadata': create_processing_metadata(
                {
                    'bucket': job_metadata['source_bucket'],
                    'key': job_metadata['source_key'],
                    'type': 'pdf'
                },
                'textract_processing',
                job_metadata['tenant_id'],
                {
                    'job_id': job_metadata['job_id'],
                    'correlation_id': correlation_id,
                    'job_type': job_metadata['job_type']
                }
            )
        }

        # Store processed results
        output_key = f"tenants/{job_metadata['tenant_id']}/processed/{os.path.splitext(os.path.basename(job_metadata['source_key']))[0]}_textract.json"

        s3_client.put_object(
            Bucket=PROCESSED_DOCUMENTS_BUCKET,
            Key=output_key,
            Body=json.dumps(processed_data, default=str, indent=2),
            ContentType='application/json',
            ServerSideEncryption='AES256',
            Metadata={
                'tenant-id': job_metadata['tenant_id'],
                'processing-type': 'textract-async',
                'correlation-id': correlation_id,
                'job-id': job_metadata['job_id']
            }
        )

        logger.info(f"Textract results stored at s3://{PROCESSED_DOCUMENTS_BUCKET}/{output_key}")

        # Clean up job tracking data
        try:
            tracking_key = f"textract-jobs/{job_metadata['job_id']}/metadata.json"
            s3_client.delete_object(
                Bucket=TEMP_PROCESSING_BUCKET,
                Key=tracking_key
            )
        except ClientError as e:
            logger.warning(f"Could not clean up job tracking data: {str(e)}")

        return {
            'pages_processed': len(pages_info),
            'total_characters': len(cleaned_text),
            'sections_found': len(sections),
            'output_location': f"s3://{PROCESSED_DOCUMENTS_BUCKET}/{output_key}"
        }

    except Exception as e:
        logger.error(f"Error processing Textract results: {str(e)}")
        raise