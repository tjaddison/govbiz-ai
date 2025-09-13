"""
PyMuPDF Text Extraction Lambda Function for GovBizAI
Extracts text from PDF documents using PyMuPDF (fitz)
Fallback to Textract for scanned/image PDFs
"""

import json
import logging
import boto3
# PyMuPDF not available, using Textract for all PDF processing
from botocore.exceptions import ClientError
from typing import Dict, Any, Optional, Tuple, List
import os
import tempfile
from document_utils import (
    setup_logging, create_response, generate_correlation_id,
    validate_tenant_access, extract_metadata_from_s3_key,
    clean_extracted_text, extract_document_sections,
    create_processing_metadata, calculate_file_hash
)

# Initialize AWS clients
s3_client = boto3.client('s3')
textract_client = boto3.client('textract')
dynamodb = boto3.resource('dynamodb')

# Environment variables
PROCESSED_DOCUMENTS_BUCKET = os.environ['PROCESSED_DOCUMENTS_BUCKET']
TEMP_PROCESSING_BUCKET = os.environ['TEMP_PROCESSING_BUCKET']
COMPANIES_TABLE = os.environ['COMPANIES_TABLE']

# Setup logging
setup_logging('text-extraction')
logger = logging.getLogger(__name__)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main handler for text extraction from PDF documents

    Expected event structure:
    {
        "Records": [
            {
                "s3": {
                    "bucket": {"name": "bucket-name"},
                    "object": {"key": "file-key"}
                }
            }
        ]
    }

    Or direct invocation:
    {
        "bucket": "bucket-name",
        "key": "file-key",
        "tenant_id": "tenant-uuid",
        "document_id": "doc-uuid"
    }
    """
    correlation_id = generate_correlation_id()
    logger.info(f"Starting text extraction - Correlation ID: {correlation_id}")

    try:
        # Parse event
        if 'Records' in event:
            # S3 trigger event
            record = event['Records'][0]
            bucket = record['s3']['bucket']['name']
            key = record['s3']['object']['key']

            # Extract metadata from key
            metadata = extract_metadata_from_s3_key(key)
            tenant_id = metadata.get('tenant_id')

            if not tenant_id:
                logger.error("No tenant_id found in S3 key path")
                raise ValueError("Missing tenant_id in file path")

        else:
            # Direct invocation
            bucket = event['bucket']
            key = event['key']
            tenant_id = event['tenant_id']

        logger.info(f"Processing file: s3://{bucket}/{key} for tenant: {tenant_id}")

        # Validate file extension
        if not key.lower().endswith('.pdf'):
            logger.warning(f"File {key} is not a PDF, skipping text extraction")
            return create_response(400, {
                'message': 'File is not a PDF document',
                'file_key': key
            }, correlation_id)

        # Use Textract for PDF processing (PyMuPDF not available)
        extraction_result = extract_text_with_textract(bucket, key, tenant_id, correlation_id)

        if not extraction_result['success']:
            logger.error(f"Text extraction failed: {extraction_result['error']}")
            return create_response(500, {
                'message': 'Text extraction failed',
                'error': extraction_result['error'],
                'file_key': key
            }, correlation_id)

        # Process and store results
        processed_result = process_extracted_text(
            extraction_result,
            bucket,
            key,
            tenant_id,
            correlation_id
        )

        logger.info(f"Text extraction completed successfully - {processed_result['pages_processed']} pages")

        return create_response(200, {
            'message': 'Text extraction completed successfully',
            'file_key': key,
            'tenant_id': tenant_id,
            'pages_processed': processed_result['pages_processed'],
            'total_characters': processed_result['total_characters'],
            'sections_found': processed_result['sections_found'],
            'output_location': processed_result['output_location'],
            'correlation_id': correlation_id
        }, correlation_id)

    except Exception as e:
        logger.error(f"Error in text extraction: {str(e)}")
        return create_response(500, {
            'message': 'Internal server error',
            'error': str(e),
            'correlation_id': correlation_id
        }, correlation_id)


def extract_text_with_textract(bucket: str, key: str, tenant_id: str, correlation_id: str) -> Dict[str, Any]:
    """
    Extract text from PDF using Amazon Textract
    Returns dict with success status and extracted content
    """
    try:
        logger.info(f"Using Textract to process PDF: s3://{bucket}/{key}")

        # Check file size for sync vs async processing
        try:
            head_response = s3_client.head_object(Bucket=bucket, Key=key)
            file_size = head_response['ContentLength']
        except ClientError as e:
            return {
                'success': False,
                'error': f"Could not get file info: {str(e)}",
                'pages': [],
                'metadata': {},
                'total_characters': 0
            }

        # Use sync processing for small files (< 5MB)
        if file_size < 5 * 1024 * 1024:
            logger.info(f"File size {file_size} bytes, using synchronous Textract")
            return extract_with_textract_sync(bucket, key, file_size)
        else:
            logger.info(f"File size {file_size} bytes, using asynchronous Textract")
            return extract_with_textract_async(bucket, key, tenant_id, correlation_id)

    except Exception as e:
        logger.error(f"Error with Textract processing: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'pages': [],
            'metadata': {},
            'total_characters': 0
        }


def extract_with_textract_sync(bucket: str, key: str, file_size: int) -> Dict[str, Any]:
    """
    Extract text using synchronous Textract
    """
    try:
        response = textract_client.detect_document_text(
            Document={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            }
        )

        # Extract text from response
        extracted_text = ""
        pages = []
        current_page = 1
        page_text = ""

        for block in response.get('Blocks', []):
            if block['BlockType'] == 'PAGE':
                if page_text:
                    pages.append({
                        'page_number': current_page,
                        'text': clean_extracted_text(page_text),
                        'character_count': len(page_text)
                    })
                    current_page += 1
                    page_text = ""
            elif block['BlockType'] == 'LINE':
                page_text += block['Text'] + '\n'
                extracted_text += block['Text'] + '\n'

        # Add final page
        if page_text:
            pages.append({
                'page_number': current_page,
                'text': clean_extracted_text(page_text),
                'character_count': len(page_text)
            })

        return {
            'success': True,
            'pages': pages,
            'metadata': {
                'page_count': len(pages),
                'file_size': file_size,
                'processing_method': 'textract_sync'
            },
            'total_characters': len(extracted_text),
            'is_scanned': False,  # Textract handles scanned docs
            'suggest_textract': False
        }

    except ClientError as e:
        return {
            'success': False,
            'error': str(e),
            'pages': [],
            'metadata': {},
            'total_characters': 0
        }


def extract_with_textract_async(bucket: str, key: str, tenant_id: str, correlation_id: str) -> Dict[str, Any]:
    """
    Start asynchronous Textract job for large files
    """
    try:
        # Start async Textract job
        response = textract_client.start_document_text_detection(
            DocumentLocation={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            },
            JobTag=f"govbizai-{tenant_id}-{correlation_id}",
            ClientRequestToken=correlation_id
        )

        job_id = response['JobId']
        logger.info(f"Started Textract async job: {job_id}")

        # Poll for completion (simplified for demo)
        import time
        max_wait_time = 300  # 5 minutes
        wait_interval = 10  # 10 seconds
        total_wait = 0

        while total_wait < max_wait_time:
            time.sleep(wait_interval)
            total_wait += wait_interval

            try:
                result_response = textract_client.get_document_text_detection(JobId=job_id)
                status = result_response['JobStatus']

                if status == 'SUCCEEDED':
                    # Process results
                    blocks = result_response.get('Blocks', [])

                    # Get all pages if there are more
                    next_token = result_response.get('NextToken')
                    while next_token:
                        next_response = textract_client.get_document_text_detection(
                            JobId=job_id,
                            NextToken=next_token
                        )
                        blocks.extend(next_response.get('Blocks', []))
                        next_token = next_response.get('NextToken')

                    # Extract text from blocks
                    extracted_text = ""
                    pages = []
                    current_page = 1
                    page_text = ""

                    for block in blocks:
                        if block['BlockType'] == 'PAGE':
                            if page_text:
                                pages.append({
                                    'page_number': current_page,
                                    'text': clean_extracted_text(page_text),
                                    'character_count': len(page_text)
                                })
                                current_page += 1
                                page_text = ""
                        elif block['BlockType'] == 'LINE':
                            page_text += block['Text'] + '\n'
                            extracted_text += block['Text'] + '\n'

                    # Add final page
                    if page_text:
                        pages.append({
                            'page_number': current_page,
                            'text': clean_extracted_text(page_text),
                            'character_count': len(page_text)
                        })

                    return {
                        'success': True,
                        'pages': pages,
                        'metadata': {
                            'page_count': len(pages),
                            'processing_method': 'textract_async',
                            'job_id': job_id
                        },
                        'total_characters': len(extracted_text),
                        'is_scanned': False,
                        'suggest_textract': False
                    }

                elif status == 'FAILED':
                    return {
                        'success': False,
                        'error': f"Textract job failed: {job_id}",
                        'pages': [],
                        'metadata': {},
                        'total_characters': 0
                    }

            except ClientError as e:
                logger.warning(f"Error checking Textract job status: {str(e)}")

        # Timeout
        return {
            'success': False,
            'error': f"Textract job timed out after {max_wait_time} seconds",
            'pages': [],
            'metadata': {},
            'total_characters': 0
        }

    except ClientError as e:
        return {
            'success': False,
            'error': str(e),
            'pages': [],
            'metadata': {},
            'total_characters': 0
        }


def process_extracted_text(
    extraction_result: Dict[str, Any],
    source_bucket: str,
    source_key: str,
    tenant_id: str,
    correlation_id: str
) -> Dict[str, Any]:
    """
    Process extracted text and store results
    """
    try:
        # Combine all page text
        full_text = ""
        pages_processed = len(extraction_result['pages'])

        for page in extraction_result['pages']:
            full_text += f"\\n\\n--- Page {page['page_number']} ---\\n\\n"
            full_text += page['text']

        # Clean the full text
        cleaned_text = clean_extracted_text(full_text)

        # Extract document sections
        sections = extract_document_sections(cleaned_text)

        # Create processed document data
        processed_data = {
            'tenant_id': tenant_id,
            'source_bucket': source_bucket,
            'source_key': source_key,
            'processing_type': 'pymupdf_extraction',
            'correlation_id': correlation_id,
            'extraction_metadata': extraction_result['metadata'],
            'full_text': cleaned_text,
            'pages': extraction_result['pages'],
            'sections': sections,
            'statistics': {
                'total_pages': pages_processed,
                'total_characters': len(cleaned_text),
                'total_words': len(cleaned_text.split()),
                'sections_found': len(sections),
                'is_scanned': extraction_result.get('is_scanned', False),
                'suggest_textract': extraction_result.get('suggest_textract', False)
            },
            'processing_metadata': create_processing_metadata(
                {
                    'bucket': source_bucket,
                    'key': source_key,
                    'size': 0,  # Could add file size if needed
                    'type': 'pdf'
                },
                'text_extraction',
                tenant_id,
                {
                    'extraction_method': 'pymupdf',
                    'pages_processed': pages_processed,
                    'correlation_id': correlation_id
                }
            )
        }

        # Store processed results in S3
        output_key = f"tenants/{tenant_id}/processed/{os.path.splitext(os.path.basename(source_key))[0]}_extracted.json"

        s3_client.put_object(
            Bucket=PROCESSED_DOCUMENTS_BUCKET,
            Key=output_key,
            Body=json.dumps(processed_data, default=str, indent=2),
            ContentType='application/json',
            ServerSideEncryption='AES256',
            Metadata={
                'tenant-id': tenant_id,
                'processing-type': 'text-extraction',
                'correlation-id': correlation_id,
                'source-key': source_key
            }
        )

        logger.info(f"Processed text stored at s3://{PROCESSED_DOCUMENTS_BUCKET}/{output_key}")

        return {
            'pages_processed': pages_processed,
            'total_characters': len(cleaned_text),
            'sections_found': len(sections),
            'output_location': f"s3://{PROCESSED_DOCUMENTS_BUCKET}/{output_key}",
            'suggest_textract': extraction_result.get('suggest_textract', False)
        }

    except Exception as e:
        logger.error(f"Error processing extracted text: {str(e)}")
        raise


def should_use_textract(extraction_result: Dict[str, Any]) -> bool:
    """
    Determine if Textract should be used based on extraction results
    """
    # Use Textract if document appears to be scanned
    if extraction_result.get('is_scanned', False):
        return True

    # Use Textract if very little text was extracted
    if extraction_result.get('total_characters', 0) < 200:
        return True

    # Use Textract if extraction failed
    if not extraction_result.get('success', False):
        return True

    return False