"""
Multipart Upload Handler for Large Documents
Handles initiation, completion, and abortion of multipart uploads to S3.
"""

import json
import boto3
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Any, List
import uuid

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Environment variables
RAW_DOCUMENTS_BUCKET = os.environ['RAW_DOCUMENTS_BUCKET']
COMPANIES_TABLE_NAME = os.environ['COMPANIES_TABLE_NAME']
AUDIT_LOG_TABLE_NAME = os.environ['AUDIT_LOG_TABLE_NAME']

# Get DynamoDB tables
companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)
audit_log_table = dynamodb.Table(AUDIT_LOG_TABLE_NAME)

# Constants
MIN_PART_SIZE = 5 * 1024 * 1024  # 5MB minimum part size (AWS requirement)
MAX_PARTS = 10000  # Maximum number of parts allowed by AWS
PRESIGNED_URL_EXPIRATION = 3600  # 1 hour


def get_user_info(event: Dict[str, Any]) -> Dict[str, str]:
    """Extract user information from the request context."""
    request_context = event.get('requestContext', {})
    authorizer = request_context.get('authorizer', {})
    claims = authorizer.get('claims', {})

    return {
        'user_id': claims.get('sub', 'unknown'),
        'tenant_id': claims.get('custom:tenant_id', 'unknown'),
        'company_id': claims.get('custom:company_id', 'unknown')
    }


def verify_company_access(company_id: str, user_info: Dict[str, str]) -> bool:
    """Verify that the user has access to the company."""
    try:
        if user_info['company_id'] != company_id:
            return False

        response = companies_table.get_item(Key={'company_id': company_id})
        if 'Item' not in response:
            return False

        company = response['Item']
        return company.get('tenant_id') == user_info['tenant_id']

    except Exception as e:
        logger.error(f"Error verifying company access: {str(e)}")
        return False


def initiate_multipart_upload(event: Dict[str, Any]) -> Dict[str, Any]:
    """Initiate a multipart upload."""
    try:
        body = json.loads(event.get('body', '{}'))
        user_info = get_user_info(event)

        # Validate required fields
        required_fields = ['filename', 'content_type', 'file_size', 'category']
        for field in required_fields:
            if field not in body:
                raise ValueError(f"Missing required field: {field}")

        # Verify company access
        if not verify_company_access(user_info['company_id'], user_info):
            return create_error_response(403, 'ACCESS_DENIED', 'Access denied to company resources')

        # Generate S3 key
        file_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).strftime('%Y/%m/%d')
        _, ext = os.path.splitext(body['filename'])
        s3_key = f"tenants/{user_info['company_id']}/documents/{body['category']}/{timestamp}/{file_id}{ext}"

        # Calculate number of parts needed
        file_size = body['file_size']
        part_size = max(MIN_PART_SIZE, (file_size + MAX_PARTS - 1) // MAX_PARTS)
        num_parts = (file_size + part_size - 1) // part_size

        if num_parts > MAX_PARTS:
            return create_error_response(400, 'FILE_TOO_LARGE', f'File too large. Maximum {MAX_PARTS} parts allowed.')

        # Initiate multipart upload
        response = s3_client.create_multipart_upload(
            Bucket=RAW_DOCUMENTS_BUCKET,
            Key=s3_key,
            ContentType=body['content_type'],
            ACL='bucket-owner-full-control',
            Metadata={
                'tenant-id': user_info['tenant_id'],
                'company-id': user_info['company_id'],
                'user-id': user_info['user_id'],
                'category': body['category'],
                'original-filename': body['filename']
            }
        )

        upload_id = response['UploadId']

        # Log initiation
        log_multipart_action(user_info, 'INITIATE', {
            's3_key': s3_key,
            'upload_id': upload_id,
            'filename': body['filename'],
            'file_size': file_size,
            'num_parts': num_parts
        })

        return create_success_response({
            'upload_id': upload_id,
            's3_key': s3_key,
            'part_size': part_size,
            'num_parts': num_parts,
            'expires_in': PRESIGNED_URL_EXPIRATION
        })

    except ValueError as e:
        return create_error_response(400, 'VALIDATION_ERROR', str(e))
    except Exception as e:
        logger.error(f"Error initiating multipart upload: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to initiate multipart upload')


def get_presigned_part_urls(event: Dict[str, Any]) -> Dict[str, Any]:
    """Generate presigned URLs for uploading parts."""
    try:
        body = json.loads(event.get('body', '{}'))
        user_info = get_user_info(event)

        # Validate required fields
        required_fields = ['upload_id', 's3_key', 'part_numbers']
        for field in required_fields:
            if field not in body:
                raise ValueError(f"Missing required field: {field}")

        upload_id = body['upload_id']
        s3_key = body['s3_key']
        part_numbers = body['part_numbers']

        # Verify company access (extract company_id from s3_key)
        if not s3_key.startswith(f"tenants/{user_info['company_id']}/"):
            return create_error_response(403, 'ACCESS_DENIED', 'Access denied to resource')

        # Validate part numbers
        if not isinstance(part_numbers, list) or not part_numbers:
            raise ValueError("part_numbers must be a non-empty list")

        for part_num in part_numbers:
            if not isinstance(part_num, int) or part_num < 1 or part_num > MAX_PARTS:
                raise ValueError(f"Invalid part number: {part_num}")

        # Generate presigned URLs for each part
        presigned_urls = []
        for part_number in part_numbers:
            url = s3_client.generate_presigned_url(
                'upload_part',
                Params={
                    'Bucket': RAW_DOCUMENTS_BUCKET,
                    'Key': s3_key,
                    'PartNumber': part_number,
                    'UploadId': upload_id
                },
                ExpiresIn=PRESIGNED_URL_EXPIRATION
            )
            presigned_urls.append({
                'part_number': part_number,
                'url': url
            })

        return create_success_response({
            'upload_id': upload_id,
            's3_key': s3_key,
            'presigned_urls': presigned_urls,
            'expires_in': PRESIGNED_URL_EXPIRATION
        })

    except ValueError as e:
        return create_error_response(400, 'VALIDATION_ERROR', str(e))
    except Exception as e:
        logger.error(f"Error generating presigned part URLs: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to generate presigned URLs')


def complete_multipart_upload(event: Dict[str, Any]) -> Dict[str, Any]:
    """Complete a multipart upload."""
    try:
        body = json.loads(event.get('body', '{}'))
        user_info = get_user_info(event)

        # Validate required fields
        required_fields = ['upload_id', 's3_key', 'parts']
        for field in required_fields:
            if field not in body:
                raise ValueError(f"Missing required field: {field}")

        upload_id = body['upload_id']
        s3_key = body['s3_key']
        parts = body['parts']

        # Verify company access
        if not s3_key.startswith(f"tenants/{user_info['company_id']}/"):
            return create_error_response(403, 'ACCESS_DENIED', 'Access denied to resource')

        # Validate parts format
        if not isinstance(parts, list) or not parts:
            raise ValueError("parts must be a non-empty list")

        multipart_upload = {'Parts': []}
        for part in parts:
            if not isinstance(part, dict) or 'PartNumber' not in part or 'ETag' not in part:
                raise ValueError("Each part must have PartNumber and ETag")

            multipart_upload['Parts'].append({
                'ETag': part['ETag'],
                'PartNumber': part['PartNumber']
            })

        # Sort parts by part number
        multipart_upload['Parts'].sort(key=lambda x: x['PartNumber'])

        # Complete the multipart upload
        response = s3_client.complete_multipart_upload(
            Bucket=RAW_DOCUMENTS_BUCKET,
            Key=s3_key,
            UploadId=upload_id,
            MultipartUpload=multipart_upload
        )

        # Log completion
        log_multipart_action(user_info, 'COMPLETE', {
            's3_key': s3_key,
            'upload_id': upload_id,
            'num_parts': len(parts),
            'e_tag': response.get('ETag')
        })

        return create_success_response({
            'upload_id': upload_id,
            's3_key': s3_key,
            'location': response['Location'],
            'e_tag': response['ETag'],
            'parts_count': len(parts),
            'status': 'COMPLETED'
        })

    except ValueError as e:
        return create_error_response(400, 'VALIDATION_ERROR', str(e))
    except Exception as e:
        logger.error(f"Error completing multipart upload: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to complete multipart upload')


def abort_multipart_upload(event: Dict[str, Any]) -> Dict[str, Any]:
    """Abort a multipart upload."""
    try:
        body = json.loads(event.get('body', '{}'))
        user_info = get_user_info(event)

        # Validate required fields
        required_fields = ['upload_id', 's3_key']
        for field in required_fields:
            if field not in body:
                raise ValueError(f"Missing required field: {field}")

        upload_id = body['upload_id']
        s3_key = body['s3_key']

        # Verify company access
        if not s3_key.startswith(f"tenants/{user_info['company_id']}/"):
            return create_error_response(403, 'ACCESS_DENIED', 'Access denied to resource')

        # Abort the multipart upload
        s3_client.abort_multipart_upload(
            Bucket=RAW_DOCUMENTS_BUCKET,
            Key=s3_key,
            UploadId=upload_id
        )

        # Log abortion
        log_multipart_action(user_info, 'ABORT', {
            's3_key': s3_key,
            'upload_id': upload_id,
            'reason': body.get('reason', 'User requested abort')
        })

        return create_success_response({
            'upload_id': upload_id,
            's3_key': s3_key,
            'status': 'ABORTED'
        })

    except ValueError as e:
        return create_error_response(400, 'VALIDATION_ERROR', str(e))
    except Exception as e:
        logger.error(f"Error aborting multipart upload: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to abort multipart upload')


def list_multipart_uploads(event: Dict[str, Any]) -> Dict[str, Any]:
    """List active multipart uploads for a company."""
    try:
        user_info = get_user_info(event)

        # Verify company access
        if not verify_company_access(user_info['company_id'], user_info):
            return create_error_response(403, 'ACCESS_DENIED', 'Access denied to company resources')

        # List multipart uploads with company prefix
        prefix = f"tenants/{user_info['company_id']}/"

        response = s3_client.list_multipart_uploads(
            Bucket=RAW_DOCUMENTS_BUCKET,
            Prefix=prefix,
            MaxUploads=100
        )

        uploads = []
        for upload in response.get('Uploads', []):
            uploads.append({
                'upload_id': upload['UploadId'],
                's3_key': upload['Key'],
                'initiated': upload['Initiated'].isoformat(),
                'storage_class': upload.get('StorageClass', 'STANDARD')
            })

        return create_success_response({
            'uploads': uploads,
            'count': len(uploads)
        })

    except Exception as e:
        logger.error(f"Error listing multipart uploads: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to list multipart uploads')


def log_multipart_action(user_info: Dict[str, str], action: str, details: Dict[str, Any]):
    """Log multipart upload actions for audit purposes."""
    try:
        audit_log_table.put_item(
            Item={
                'tenant_id': user_info['tenant_id'],
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'action_type': f'MULTIPART_UPLOAD_{action}',
                'user_id': user_info['user_id'],
                'company_id': user_info['company_id'],
                'resource_type': 'DOCUMENT',
                'resource_id': details.get('s3_key', 'unknown'),
                'details': details,
                'ttl': int((datetime.now(timezone.utc).timestamp() + 7776000))  # 90 days
            }
        )
    except Exception as e:
        logger.error(f"Error logging multipart action: {str(e)}")


def create_success_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a successful response."""
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        'body': json.dumps(data)
    }


def create_error_response(status_code: int, error_code: str, message: str) -> Dict[str, Any]:
    """Create an error response."""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        'body': json.dumps({
            'error': error_code,
            'message': message
        })
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Main Lambda handler for multipart upload operations."""
    try:
        logger.info("Processing multipart upload request")

        # Get the action from path parameters
        path_parameters = event.get('pathParameters', {})
        action = path_parameters.get('action', '')

        # Route to appropriate handler based on action
        if action == 'initiate':
            return initiate_multipart_upload(event)
        elif action == 'presigned-urls':
            return get_presigned_part_urls(event)
        elif action == 'complete':
            return complete_multipart_upload(event)
        elif action == 'abort':
            return abort_multipart_upload(event)
        elif action == 'list':
            return list_multipart_uploads(event)
        else:
            return create_error_response(400, 'INVALID_ACTION', f'Invalid action: {action}')

    except Exception as e:
        logger.error(f"Unexpected error in multipart upload handler: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'An internal error occurred while processing the request')