import json
import boto3
import requests
import time
import logging
import os
from typing import Dict, List, Any, Optional
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')

# Environment variables
TEMP_BUCKET = os.environ['TEMP_PROCESSING_BUCKET']

# SAM.gov API base URLs
SAMGOV_API_BASE = "https://sam.gov/api/prod/opps/v3/opportunities"
ATTACHMENT_API_BASE = "https://sam.gov/api/prod/opps/v3/opportunities/resources/files"

class SamGovAPIClient:
    """SAM.gov API client with retry logic and rate limiting."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'GovBizAI/1.0 (contact: support@govbizai.com)',
            'Accept': 'application/json'
        })
        self.rate_limit_delay = 0.5  # 500ms between requests
        self.last_request_time = 0

    def _rate_limit(self):
        """Apply rate limiting between requests."""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        if time_since_last < self.rate_limit_delay:
            time.sleep(self.rate_limit_delay - time_since_last)
        self.last_request_time = time.time()

    @retry(
        retry=retry_if_exception_type((requests.exceptions.RequestException, requests.exceptions.Timeout)),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        stop=stop_after_attempt(3)
    )
    def get_opportunity_attachments(self, notice_id: str) -> List[Dict[str, Any]]:
        """
        Get attachment metadata for a specific opportunity.

        Args:
            notice_id: The NoticeId of the opportunity

        Returns:
            List of attachment dictionaries
        """
        self._rate_limit()

        try:
            url = f"{SAMGOV_API_BASE}/{notice_id}/resources"

            logger.info(f"Retrieving attachments for opportunity: {notice_id}")

            response = self.session.get(url, timeout=30)

            # Handle different response codes
            if response.status_code == 404:
                logger.warning(f"Opportunity {notice_id} not found (404)")
                return []
            elif response.status_code == 429:
                logger.warning(f"Rate limited for opportunity {notice_id}, retrying...")
                raise requests.exceptions.RequestException("Rate limited")
            elif response.status_code != 200:
                logger.error(f"API request failed with status {response.status_code} for {notice_id}")
                response.raise_for_status()

            data = response.json()

            # Extract attachments from the nested structure
            attachments = []
            embedded = data.get('_embedded', {})
            attachment_list = embedded.get('opportunityAttachmentList', [])

            for attachment_group in attachment_list:
                group_attachments = attachment_group.get('attachments', [])
                for attachment in group_attachments:
                    # Extract relevant metadata
                    attachment_info = {
                        'resourceId': attachment.get('resourceId'),
                        'name': attachment.get('name', '').strip(),
                        'type': attachment.get('type', '').strip(),
                        'sizeBytes': attachment.get('sizeBytes', 0),
                        'mimeType': attachment.get('mimeType', '').strip(),
                        'lastModified': attachment.get('lastModified'),
                        'downloadUrl': f"{ATTACHMENT_API_BASE}/{attachment.get('resourceId')}/download?&token="
                    }

                    # Skip if no resourceId (can't download)
                    if not attachment_info['resourceId']:
                        logger.warning(f"Attachment for {notice_id} missing resourceId: {attachment}")
                        continue

                    attachments.append(attachment_info)

            logger.info(f"Found {len(attachments)} attachments for opportunity {notice_id}")
            return attachments

        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed for opportunity {notice_id}: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error retrieving attachments for {notice_id}: {str(e)}")
            return []

    @retry(
        retry=retry_if_exception_type((requests.exceptions.RequestException, requests.exceptions.Timeout)),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        stop=stop_after_attempt(3)
    )
    def download_attachment(self, resource_id: str, filename: str) -> bytes:
        """
        Download an attachment file.

        Args:
            resource_id: The resourceId of the attachment
            filename: The filename for logging purposes

        Returns:
            File content as bytes
        """
        self._rate_limit()

        try:
            url = f"{ATTACHMENT_API_BASE}/{resource_id}/download?&token="

            logger.info(f"Downloading attachment: {filename} (Resource ID: {resource_id})")

            response = self.session.get(url, timeout=300, stream=True)  # 5 minute timeout for large files

            if response.status_code == 404:
                logger.warning(f"Attachment {resource_id} not found (404)")
                raise requests.exceptions.RequestException("Attachment not found")
            elif response.status_code == 429:
                logger.warning(f"Rate limited for attachment {resource_id}, retrying...")
                raise requests.exceptions.RequestException("Rate limited")
            elif response.status_code != 200:
                logger.error(f"Download failed with status {response.status_code} for {resource_id}")
                response.raise_for_status()

            # Download in chunks to handle large files
            content = b''
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    content += chunk

            size_mb = len(content) / (1024 * 1024)
            logger.info(f"Successfully downloaded {filename}: {size_mb:.2f} MB")

            return content

        except requests.exceptions.RequestException as e:
            logger.error(f"Download failed for {resource_id}: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error downloading {resource_id}: {str(e)}")
            raise

def lambda_handler(event, context):
    """
    Main handler for SAM.gov API client operations.

    Expected event structure:
    {
        "operation": "get_attachments" | "download_attachment",
        "notice_id": "string",  # For get_attachments
        "resource_id": "string",  # For download_attachment
        "filename": "string"  # For download_attachment
    }
    """
    try:
        logger.info(f"Processing API request: {json.dumps(event)}")

        operation = event.get('operation')
        if not operation:
            raise ValueError("Missing required 'operation' parameter")

        client = SamGovAPIClient()

        if operation == 'get_attachments':
            notice_id = event.get('notice_id')
            if not notice_id:
                raise ValueError("Missing required 'notice_id' parameter for get_attachments operation")

            attachments = client.get_opportunity_attachments(notice_id)

            # Store attachment metadata in S3 for later processing
            if attachments:
                store_attachment_metadata(notice_id, attachments)

            return {
                'statusCode': 200,
                'body': json.dumps({
                    'operation': 'get_attachments',
                    'notice_id': notice_id,
                    'attachments_found': len(attachments),
                    'attachments': attachments
                })
            }

        elif operation == 'download_attachment':
            resource_id = event.get('resource_id')
            filename = event.get('filename', resource_id)
            notice_id = event.get('notice_id')

            if not resource_id:
                raise ValueError("Missing required 'resource_id' parameter for download_attachment operation")

            content = client.download_attachment(resource_id, filename)

            # Store downloaded file in S3
            s3_key = store_attachment_file(notice_id, resource_id, filename, content)

            return {
                'statusCode': 200,
                'body': json.dumps({
                    'operation': 'download_attachment',
                    'resource_id': resource_id,
                    'filename': filename,
                    'size_bytes': len(content),
                    's3_location': f"s3://{TEMP_BUCKET}/{s3_key}"
                })
            }

        else:
            raise ValueError(f"Unsupported operation: {operation}")

    except Exception as e:
        logger.error(f"API client error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'API client operation failed',
                'message': str(e)
            })
        }

def store_attachment_metadata(notice_id: str, attachments: List[Dict[str, Any]]) -> str:
    """Store attachment metadata in S3."""
    try:
        from datetime import datetime

        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        date_prefix = datetime.utcnow().strftime('%Y-%m-%d')
        s3_key = f"attachments-metadata/{date_prefix}/{notice_id}/attachments_{timestamp}.json"

        metadata = {
            'notice_id': notice_id,
            'retrieved_at': datetime.utcnow().isoformat(),
            'attachment_count': len(attachments),
            'attachments': attachments
        }

        s3_client.put_object(
            Bucket=TEMP_BUCKET,
            Key=s3_key,
            Body=json.dumps(metadata, indent=2).encode('utf-8'),
            ContentType='application/json',
            ServerSideEncryption='aws:kms'
        )

        logger.info(f"Stored attachment metadata at: s3://{TEMP_BUCKET}/{s3_key}")
        return s3_key

    except Exception as e:
        logger.error(f"Failed to store attachment metadata: {str(e)}")
        raise

def store_attachment_file(notice_id: str, resource_id: str, filename: str, content: bytes) -> str:
    """Store downloaded attachment file in S3."""
    try:
        from datetime import datetime
        import mimetypes

        date_prefix = datetime.utcnow().strftime('%Y-%m-%d')

        # Clean filename for S3 key
        clean_filename = filename.replace(' ', '_').replace('/', '_')
        s3_key = f"attachments/{date_prefix}/{notice_id}/{clean_filename}"

        # Determine content type
        content_type, _ = mimetypes.guess_type(filename)
        if not content_type:
            content_type = 'application/octet-stream'

        s3_client.put_object(
            Bucket=TEMP_BUCKET,
            Key=s3_key,
            Body=content,
            ContentType=content_type,
            ServerSideEncryption='aws:kms',
            Metadata={
                'notice_id': notice_id,
                'resource_id': resource_id,
                'original_filename': filename,
                'downloaded_at': datetime.utcnow().isoformat()
            }
        )

        logger.info(f"Stored attachment file at: s3://{TEMP_BUCKET}/{s3_key}")
        return s3_key

    except Exception as e:
        logger.error(f"Failed to store attachment file: {str(e)}")
        raise