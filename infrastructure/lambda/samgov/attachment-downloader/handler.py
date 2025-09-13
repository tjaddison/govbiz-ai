import json
import boto3
import logging
import os
from datetime import datetime
from typing import Dict, List, Any, Optional

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
lambda_client = boto3.client('lambda')
s3_client = boto3.client('s3')

# Environment variables
API_CLIENT_FUNCTION = os.environ.get('API_CLIENT_FUNCTION', 'govbizai-samgov-api-client')
RAW_DOCUMENTS_BUCKET = os.environ['RAW_DOCUMENTS_BUCKET']
TEMP_BUCKET = os.environ['TEMP_PROCESSING_BUCKET']

def lambda_handler(event, context):
    """
    Main handler for downloading opportunity attachments.

    Expected event structure:
    {
        "notice_id": "string",
        "opportunity_data": {...},  # Full opportunity data
        "attachments": [...],  # List of attachment metadata (optional, will fetch if not provided)
        "max_attachments": 10,  # Optional limit on attachments to download
        "max_size_mb": 50  # Optional size limit per attachment
    }
    """
    try:
        logger.info(f"Processing attachment download request: {json.dumps(event, default=str)}")

        # Extract parameters
        notice_id = event.get('notice_id')
        if not notice_id:
            raise ValueError("Missing required 'notice_id' parameter")

        opportunity_data = event.get('opportunity_data', {})
        attachments = event.get('attachments')
        max_attachments = event.get('max_attachments', 10)
        max_size_mb = event.get('max_size_mb', 50)

        # Get attachment metadata if not provided
        if not attachments:
            attachments = get_attachment_metadata(notice_id)

        if not attachments:
            logger.info(f"No attachments found for opportunity {notice_id}")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'notice_id': notice_id,
                    'attachments_found': 0,
                    'attachments_downloaded': 0,
                    'message': 'No attachments found'
                })
            }

        # Filter and prioritize attachments
        filtered_attachments = filter_attachments(attachments, max_attachments, max_size_mb)

        # Download attachments
        download_results = download_attachments(notice_id, filtered_attachments)

        # Store download summary
        summary = store_download_summary(notice_id, opportunity_data, download_results)

        logger.info(f"Attachment processing complete for {notice_id}: {len(download_results['successful'])} downloaded")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'notice_id': notice_id,
                'attachments_found': len(attachments),
                'attachments_downloaded': len(download_results['successful']),
                'attachments_failed': len(download_results['failed']),
                'download_summary': summary,
                'successful_downloads': download_results['successful'],
                'failed_downloads': download_results['failed']
            })
        }

    except Exception as e:
        logger.error(f"Attachment download error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Attachment download failed',
                'message': str(e),
                'notice_id': event.get('notice_id')
            })
        }

def get_attachment_metadata(notice_id: str) -> List[Dict[str, Any]]:
    """Get attachment metadata using the API client function."""
    try:
        logger.info(f"Retrieving attachment metadata for opportunity {notice_id}")

        payload = {
            'operation': 'get_attachments',
            'notice_id': notice_id
        }

        response = lambda_client.invoke(
            FunctionName=API_CLIENT_FUNCTION,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        response_payload = json.loads(response['Payload'].read().decode('utf-8'))

        if response_payload.get('statusCode') != 200:
            error_msg = json.loads(response_payload.get('body', '{}')).get('message', 'Unknown error')
            logger.error(f"API client returned error: {error_msg}")
            return []

        body = json.loads(response_payload['body'])
        attachments = body.get('attachments', [])

        logger.info(f"Retrieved {len(attachments)} attachments for opportunity {notice_id}")
        return attachments

    except Exception as e:
        logger.error(f"Failed to get attachment metadata: {str(e)}")
        return []

def filter_attachments(attachments: List[Dict[str, Any]], max_count: int, max_size_mb: int) -> List[Dict[str, Any]]:
    """Filter and prioritize attachments based on type and size."""
    logger.info(f"Filtering {len(attachments)} attachments (max: {max_count}, max size: {max_size_mb}MB)")

    # Define priority order for attachment types
    priority_types = [
        'solicitation', 'rfp', 'request for proposal',
        'statement of work', 'sow', 'scope of work',
        'requirements', 'specification', 'specs',
        'amendment', 'modification', 'addendum',
        'attachment', 'document'
    ]

    max_size_bytes = max_size_mb * 1024 * 1024

    # Filter by size first
    size_filtered = []
    for attachment in attachments:
        size_bytes = attachment.get('sizeBytes', 0)
        if size_bytes == 0:
            logger.warning(f"Attachment {attachment.get('name', 'unknown')} has no size information")
            size_filtered.append(attachment)  # Include anyway, might be small
        elif size_bytes <= max_size_bytes:
            size_filtered.append(attachment)
        else:
            size_mb = size_bytes / (1024 * 1024)
            logger.info(f"Skipping large attachment: {attachment.get('name', 'unknown')} ({size_mb:.2f}MB)")

    if len(size_filtered) != len(attachments):
        logger.info(f"Size filtering: {len(size_filtered)} of {len(attachments)} attachments remain")

    # Priority sort
    def get_priority(attachment):
        name = attachment.get('name', '').lower()
        attachment_type = attachment.get('type', '').lower()

        # Check for priority keywords in name or type
        for i, keyword in enumerate(priority_types):
            if keyword in name or keyword in attachment_type:
                return i

        # Default priority for unknown types
        return len(priority_types)

    # Sort by priority and take top N
    prioritized = sorted(size_filtered, key=get_priority)
    filtered = prioritized[:max_count]

    if len(filtered) != len(size_filtered):
        logger.info(f"Priority filtering: {len(filtered)} of {len(size_filtered)} attachments selected")

    # Log selected attachments
    for attachment in filtered:
        name = attachment.get('name', 'unknown')
        size_mb = attachment.get('sizeBytes', 0) / (1024 * 1024)
        logger.info(f"Selected attachment: {name} ({size_mb:.2f}MB)")

    return filtered

def download_attachments(notice_id: str, attachments: List[Dict[str, Any]]) -> Dict[str, List]:
    """Download all attachments using the API client."""
    logger.info(f"Downloading {len(attachments)} attachments for opportunity {notice_id}")

    successful = []
    failed = []

    for attachment in attachments:
        try:
            resource_id = attachment.get('resourceId')
            filename = attachment.get('name', resource_id)

            if not resource_id:
                logger.error(f"Attachment missing resourceId: {attachment}")
                failed.append({
                    'attachment': attachment,
                    'error': 'Missing resourceId'
                })
                continue

            # Call API client to download
            payload = {
                'operation': 'download_attachment',
                'notice_id': notice_id,
                'resource_id': resource_id,
                'filename': filename
            }

            response = lambda_client.invoke(
                FunctionName=API_CLIENT_FUNCTION,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )

            response_payload = json.loads(response['Payload'].read().decode('utf-8'))

            if response_payload.get('statusCode') == 200:
                body = json.loads(response_payload['body'])
                successful.append({
                    'attachment': attachment,
                    'download_info': body,
                    's3_location': body.get('s3_location')
                })
                logger.info(f"Successfully downloaded: {filename}")
            else:
                error_body = json.loads(response_payload.get('body', '{}'))
                error_msg = error_body.get('message', 'Unknown error')
                failed.append({
                    'attachment': attachment,
                    'error': error_msg
                })
                logger.error(f"Failed to download {filename}: {error_msg}")

        except Exception as e:
            logger.error(f"Error downloading attachment {attachment.get('name', 'unknown')}: {str(e)}")
            failed.append({
                'attachment': attachment,
                'error': str(e)
            })

    logger.info(f"Download complete: {len(successful)} successful, {len(failed)} failed")

    return {
        'successful': successful,
        'failed': failed
    }

def store_download_summary(notice_id: str, opportunity_data: Dict[str, Any], download_results: Dict[str, List]) -> str:
    """Store a summary of the download process."""
    try:
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        date_prefix = datetime.utcnow().strftime('%Y-%m-%d')
        s3_key = f"download-summaries/{date_prefix}/{notice_id}/summary_{timestamp}.json"

        summary = {
            'notice_id': notice_id,
            'opportunity_title': opportunity_data.get('Title', 'Unknown'),
            'processed_at': datetime.utcnow().isoformat(),
            'attachments_successful': len(download_results['successful']),
            'attachments_failed': len(download_results['failed']),
            'successful_downloads': [
                {
                    'filename': result['attachment'].get('name'),
                    'resource_id': result['attachment'].get('resourceId'),
                    's3_location': result.get('s3_location'),
                    'size_bytes': result['attachment'].get('sizeBytes', 0)
                }
                for result in download_results['successful']
            ],
            'failed_downloads': [
                {
                    'filename': result['attachment'].get('name'),
                    'resource_id': result['attachment'].get('resourceId'),
                    'error': result.get('error'),
                    'size_bytes': result['attachment'].get('sizeBytes', 0)
                }
                for result in download_results['failed']
            ]
        }

        s3_client.put_object(
            Bucket=TEMP_BUCKET,
            Key=s3_key,
            Body=json.dumps(summary, indent=2).encode('utf-8'),
            ContentType='application/json',
            ServerSideEncryption='aws:kms'
        )

        logger.info(f"Stored download summary at: s3://{TEMP_BUCKET}/{s3_key}")
        return f"s3://{TEMP_BUCKET}/{s3_key}"

    except Exception as e:
        logger.error(f"Failed to store download summary: {str(e)}")
        return ""