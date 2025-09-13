"""
S3 Presigned URL Generator for Company Document Uploads
Handles secure document upload with validation and progress tracking.
"""

import json
import boto3
import uuid
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Any, List
import mimetypes

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

# Supported file types and categories
SUPPORTED_MIME_TYPES = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'text/plain': 'txt',
    'text/html': 'html',
    'text/csv': 'csv'
}

DOCUMENT_CATEGORIES = {
    'capability-statements': 'Capability Statements',
    'past-performance': 'Past Performance/CPARS',
    'team-resumes': 'Team Resumes',
    'past-proposals': 'Past Proposals',
    'certifications': 'Certifications',
    'financial-documents': 'Financial Documents',
    'technical-documents': 'Technical Documents',
    'other': 'Other'
}

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
PRESIGNED_URL_EXPIRATION = 3600  # 1 hour


def validate_request(event: Dict[str, Any]) -> Dict[str, Any]:
    """Validate the incoming request."""
    try:
        body = json.loads(event.get('body', '{}'))
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON in request body")

    # Required fields
    required_fields = ['filename', 'file_size', 'content_type', 'category']
    for field in required_fields:
        if field not in body:
            raise ValueError(f"Missing required field: {field}")

    # Validate file size
    file_size = body.get('file_size', 0)
    if file_size <= 0:
        raise ValueError("File size must be greater than 0")
    if file_size > MAX_FILE_SIZE:
        raise ValueError(f"File size exceeds maximum limit of {MAX_FILE_SIZE} bytes")

    # Validate content type
    content_type = body.get('content_type', '')
    if content_type not in SUPPORTED_MIME_TYPES:
        supported_types = list(SUPPORTED_MIME_TYPES.keys())
        raise ValueError(f"Unsupported content type: {content_type}. Supported types: {supported_types}")

    # Validate category
    category = body.get('category', '')
    if category not in DOCUMENT_CATEGORIES:
        valid_categories = list(DOCUMENT_CATEGORIES.keys())
        raise ValueError(f"Invalid category: {category}. Valid categories: {valid_categories}")

    # Validate filename
    filename = body.get('filename', '')
    if not filename or len(filename.strip()) == 0:
        raise ValueError("Filename cannot be empty")

    # Sanitize filename
    sanitized_filename = sanitize_filename(filename)

    return {
        'filename': sanitized_filename,
        'file_size': file_size,
        'content_type': content_type,
        'category': category,
        'description': body.get('description', ''),
        'tags': body.get('tags', [])
    }


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent directory traversal and other issues."""
    # Remove path separators and special characters
    import re
    sanitized = re.sub(r'[^\w\-_\. ]', '', filename)
    # Remove leading/trailing spaces and dots
    sanitized = sanitized.strip('. ')
    # Ensure not empty
    if not sanitized:
        sanitized = 'untitled_document'
    return sanitized


def get_user_info(event: Dict[str, Any]) -> Dict[str, str]:
    """Extract user information from the request context."""
    request_context = event.get('requestContext', {})
    authorizer = request_context.get('authorizer', {})

    # For Cognito authorizer
    claims = authorizer.get('claims', {})

    user_id = claims.get('sub', 'unknown')
    tenant_id = claims.get('custom:tenant_id', 'unknown')
    company_id = claims.get('custom:company_id', 'unknown')

    return {
        'user_id': user_id,
        'tenant_id': tenant_id,
        'company_id': company_id
    }


def verify_company_access(company_id: str, user_info: Dict[str, str]) -> bool:
    """Verify that the user has access to the company."""
    try:
        # Check if user's company_id matches the requested company_id
        if user_info['company_id'] != company_id:
            logger.warning(f"User {user_info['user_id']} attempted to access company {company_id} but belongs to {user_info['company_id']}")
            return False

        # Verify company exists
        response = companies_table.get_item(
            Key={'company_id': company_id}
        )

        if 'Item' not in response:
            logger.warning(f"Company {company_id} not found")
            return False

        # Verify tenant_id matches
        company = response['Item']
        if company.get('tenant_id') != user_info['tenant_id']:
            logger.warning(f"Company {company_id} tenant mismatch")
            return False

        return True

    except Exception as e:
        logger.error(f"Error verifying company access: {str(e)}")
        return False


def generate_upload_key(company_id: str, category: str, filename: str) -> str:
    """Generate S3 key for the uploaded file."""
    file_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).strftime('%Y/%m/%d')

    # Include file extension
    _, ext = os.path.splitext(filename)

    return f"tenants/{company_id}/documents/{category}/{timestamp}/{file_id}{ext}"


def create_presigned_post_url(bucket: str, key: str, content_type: str, file_size: int) -> Dict[str, Any]:
    """Create a presigned POST URL for S3 upload."""
    conditions = [
        ["content-length-range", 1, file_size],
        {"Content-Type": content_type},
        {"acl": "bucket-owner-full-control"}
    ]

    fields = {
        "Content-Type": content_type,
        "acl": "bucket-owner-full-control"
    }

    try:
        response = s3_client.generate_presigned_post(
            Bucket=bucket,
            Key=key,
            Fields=fields,
            Conditions=conditions,
            ExpiresIn=PRESIGNED_URL_EXPIRATION
        )

        return response

    except Exception as e:
        logger.error(f"Error generating presigned URL: {str(e)}")
        raise


def log_upload_request(user_info: Dict[str, str], file_info: Dict[str, Any], s3_key: str):
    """Log the upload request for audit purposes."""
    try:
        audit_log_table.put_item(
            Item={
                'tenant_id': user_info['tenant_id'],
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'action_type': 'DOCUMENT_UPLOAD_INITIATED',
                'user_id': user_info['user_id'],
                'company_id': user_info['company_id'],
                'resource_type': 'DOCUMENT',
                'resource_id': s3_key,
                'details': {
                    'filename': file_info['filename'],
                    'file_size': file_info['file_size'],
                    'content_type': file_info['content_type'],
                    'category': file_info['category'],
                    's3_key': s3_key
                },
                'ttl': int((datetime.now(timezone.utc).timestamp() + 7776000))  # 90 days
            }
        )
    except Exception as e:
        logger.error(f"Error logging upload request: {str(e)}")
        # Don't fail the request if logging fails


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Main Lambda handler for generating presigned upload URLs."""
    try:
        logger.info("Processing presigned URL request")

        # Extract user information
        user_info = get_user_info(event)
        logger.info(f"Request from user {user_info['user_id']} for company {user_info['company_id']}")

        # Validate request
        file_info = validate_request(event)
        logger.info(f"Validated file upload request: {file_info['filename']}")

        # Verify company access
        if not verify_company_access(user_info['company_id'], user_info):
            return {
                'statusCode': 403,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                },
                'body': json.dumps({
                    'error': 'ACCESS_DENIED',
                    'message': 'Access denied to company resources'
                })
            }

        # Generate S3 key
        s3_key = generate_upload_key(
            user_info['company_id'],
            file_info['category'],
            file_info['filename']
        )

        # Create presigned POST URL
        presigned_data = create_presigned_post_url(
            RAW_DOCUMENTS_BUCKET,
            s3_key,
            file_info['content_type'],
            file_info['file_size']
        )

        # Log the upload request
        log_upload_request(user_info, file_info, s3_key)

        # Prepare response
        response_data = {
            'upload_url': presigned_data['url'],
            'upload_fields': presigned_data['fields'],
            's3_key': s3_key,
            'expires_in': PRESIGNED_URL_EXPIRATION,
            'max_file_size': MAX_FILE_SIZE,
            'supported_types': list(SUPPORTED_MIME_TYPES.keys()),
            'upload_metadata': {
                'filename': file_info['filename'],
                'category': file_info['category'],
                'content_type': file_info['content_type'],
                'file_size': file_info['file_size'],
                'description': file_info.get('description', ''),
                'tags': file_info.get('tags', [])
            }
        }

        logger.info(f"Generated presigned URL for {s3_key}")

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': json.dumps(response_data)
        }

    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return {
            'statusCode': 400,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': json.dumps({
                'error': 'VALIDATION_ERROR',
                'message': str(e)
            })
        }

    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': json.dumps({
                'error': 'INTERNAL_ERROR',
                'message': 'An internal error occurred while processing the request'
            })
        }