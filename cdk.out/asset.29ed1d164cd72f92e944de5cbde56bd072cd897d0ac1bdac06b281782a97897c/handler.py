"""
Upload Progress Tracking Handler
Tracks and manages document upload progress with real-time status updates.
"""

import json
import boto3
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from decimal import Decimal
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

# Upload status constants
UPLOAD_STATUS = {
    'INITIATED': 'initiated',
    'IN_PROGRESS': 'in_progress',
    'COMPLETED': 'completed',
    'FAILED': 'failed',
    'CANCELLED': 'cancelled'
}

# TTL for upload tracking records (7 days)
UPLOAD_TRACKING_TTL = 7 * 24 * 60 * 60


class UploadTracker:
    """Handles upload progress tracking operations."""

    def __init__(self):
        """Initialize the upload tracker."""
        # Create a separate table for upload tracking if it doesn't exist
        # In production, this would be created via CDK
        self.upload_table_name = 'govbizai-upload-tracking'
        try:
            self.upload_table = dynamodb.Table(self.upload_table_name)
        except Exception:
            # For demo purposes, we'll store upload tracking in the audit log table
            self.upload_table = audit_log_table

    def create_upload_record(self, user_info: Dict[str, str], upload_data: Dict[str, Any]) -> str:
        """Create a new upload tracking record."""
        upload_id = upload_data.get('upload_id', str(uuid.uuid4()))

        record = {
            'tenant_id': user_info['tenant_id'],
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'action_type': 'UPLOAD_TRACKING',
            'user_id': user_info['user_id'],
            'company_id': user_info['company_id'],
            'resource_type': 'UPLOAD_PROGRESS',
            'resource_id': upload_id,
            'details': {
                'upload_id': upload_id,
                's3_key': upload_data.get('s3_key', ''),
                'filename': upload_data.get('filename', ''),
                'file_size': upload_data.get('file_size', 0),
                'content_type': upload_data.get('content_type', ''),
                'category': upload_data.get('category', ''),
                'upload_type': upload_data.get('upload_type', 'single'),
                'status': UPLOAD_STATUS['INITIATED'],
                'progress': Decimal('0'),
                'bytes_uploaded': 0,
                'parts_completed': 0 if upload_data.get('upload_type') == 'multipart' else None,
                'total_parts': upload_data.get('total_parts', None),
                'created_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat(),
                'error_message': None
            },
            'ttl': int((datetime.now(timezone.utc).timestamp() + UPLOAD_TRACKING_TTL))
        }

        try:
            self.upload_table.put_item(Item=record)
            logger.info(f"Created upload tracking record for {upload_id}")
            return upload_id
        except Exception as e:
            logger.error(f"Error creating upload record: {str(e)}")
            raise

    def update_upload_progress(self, user_info: Dict[str, str], upload_id: str, progress_data: Dict[str, Any]) -> bool:
        """Update upload progress."""
        try:
            # First, get the existing record
            response = self.upload_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('tenant_id').eq(user_info['tenant_id']),
                FilterExpression=boto3.dynamodb.conditions.Attr('resource_id').eq(upload_id) &
                               boto3.dynamodb.conditions.Attr('action_type').eq('UPLOAD_TRACKING')
            )

            if not response['Items']:
                logger.warning(f"Upload record not found for {upload_id}")
                return False

            record = response['Items'][0]

            # Verify user access
            if record['user_id'] != user_info['user_id']:
                logger.warning(f"User {user_info['user_id']} attempted to update upload {upload_id} owned by {record['user_id']}")
                return False

            # Calculate new progress
            current_details = record['details']
            file_size = current_details.get('file_size', 0)

            if file_size > 0:
                bytes_uploaded = progress_data.get('bytes_uploaded', current_details.get('bytes_uploaded', 0))
                progress = min(Decimal('100'), Decimal(str((bytes_uploaded / file_size) * 100)))
            else:
                progress = progress_data.get('progress', current_details.get('progress', Decimal('0')))

            # Update record
            update_expression = "SET details.progress = :progress, details.bytes_uploaded = :bytes_uploaded, details.updated_at = :updated_at"
            expression_attribute_values = {
                ':progress': progress,
                ':bytes_uploaded': progress_data.get('bytes_uploaded', current_details.get('bytes_uploaded', 0)),
                ':updated_at': datetime.now(timezone.utc).isoformat()
            }

            # Update status if provided
            if 'status' in progress_data:
                update_expression += ", details.status = :status"
                expression_attribute_values[':status'] = progress_data['status']

            # Update parts completed if multipart
            if 'parts_completed' in progress_data:
                update_expression += ", details.parts_completed = :parts_completed"
                expression_attribute_values[':parts_completed'] = progress_data['parts_completed']

            # Update error message if provided
            if 'error_message' in progress_data:
                update_expression += ", details.error_message = :error_message"
                expression_attribute_values[':error_message'] = progress_data['error_message']

            self.upload_table.update_item(
                Key={
                    'tenant_id': record['tenant_id'],
                    'timestamp': record['timestamp']
                },
                UpdateExpression=update_expression,
                ExpressionAttributeValues=expression_attribute_values
            )

            logger.info(f"Updated upload progress for {upload_id}: {progress}%")
            return True

        except Exception as e:
            logger.error(f"Error updating upload progress: {str(e)}")
            return False

    def get_upload_status(self, user_info: Dict[str, str], upload_id: str) -> Optional[Dict[str, Any]]:
        """Get current upload status."""
        try:
            response = self.upload_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('tenant_id').eq(user_info['tenant_id']),
                FilterExpression=boto3.dynamodb.conditions.Attr('resource_id').eq(upload_id) &
                               boto3.dynamodb.conditions.Attr('action_type').eq('UPLOAD_TRACKING')
            )

            if not response['Items']:
                return None

            record = response['Items'][0]

            # Verify user access
            if record['user_id'] != user_info['user_id']:
                logger.warning(f"User {user_info['user_id']} attempted to access upload {upload_id} owned by {record['user_id']}")
                return None

            return record['details']

        except Exception as e:
            logger.error(f"Error getting upload status: {str(e)}")
            return None

    def list_user_uploads(self, user_info: Dict[str, str], limit: int = 50, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """List uploads for a user."""
        try:
            # Query uploads for the tenant
            response = self.upload_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('tenant_id').eq(user_info['tenant_id']),
                FilterExpression=boto3.dynamodb.conditions.Attr('action_type').eq('UPLOAD_TRACKING') &
                               boto3.dynamodb.conditions.Attr('user_id').eq(user_info['user_id']),
                Limit=limit,
                ScanIndexForward=False  # Latest first
            )

            uploads = []
            for record in response['Items']:
                details = record['details']

                # Apply status filter if provided
                if status_filter and details.get('status') != status_filter:
                    continue

                uploads.append({
                    'upload_id': details['upload_id'],
                    'filename': details['filename'],
                    'file_size': details['file_size'],
                    'content_type': details['content_type'],
                    'category': details['category'],
                    'upload_type': details['upload_type'],
                    'status': details['status'],
                    'progress': float(details['progress']),
                    'bytes_uploaded': details['bytes_uploaded'],
                    'created_at': details['created_at'],
                    'updated_at': details['updated_at'],
                    'error_message': details.get('error_message'),
                    'parts_completed': details.get('parts_completed'),
                    'total_parts': details.get('total_parts')
                })

            return uploads

        except Exception as e:
            logger.error(f"Error listing user uploads: {str(e)}")
            return []

    def cancel_upload(self, user_info: Dict[str, str], upload_id: str) -> bool:
        """Cancel an ongoing upload."""
        try:
            # Update the status to cancelled
            success = self.update_upload_progress(user_info, upload_id, {
                'status': UPLOAD_STATUS['CANCELLED'],
                'error_message': 'Upload cancelled by user'
            })

            if success:
                logger.info(f"Upload {upload_id} cancelled by user {user_info['user_id']}")

            return success

        except Exception as e:
            logger.error(f"Error cancelling upload: {str(e)}")
            return False


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


def create_upload_tracking(event: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new upload tracking record."""
    try:
        body = json.loads(event.get('body', '{}'))
        user_info = get_user_info(event)
        tracker = UploadTracker()

        upload_id = tracker.create_upload_record(user_info, body)

        return create_success_response({
            'upload_id': upload_id,
            'status': UPLOAD_STATUS['INITIATED'],
            'message': 'Upload tracking initiated'
        })

    except ValueError as e:
        return create_error_response(400, 'VALIDATION_ERROR', str(e))
    except Exception as e:
        logger.error(f"Error creating upload tracking: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to create upload tracking')


def update_upload_tracking(event: Dict[str, Any]) -> Dict[str, Any]:
    """Update upload progress."""
    try:
        body = json.loads(event.get('body', '{}'))
        user_info = get_user_info(event)
        path_params = event.get('pathParameters', {})
        upload_id = path_params.get('upload_id')

        if not upload_id:
            raise ValueError("Missing upload_id in path parameters")

        tracker = UploadTracker()
        success = tracker.update_upload_progress(user_info, upload_id, body)

        if not success:
            return create_error_response(404, 'UPLOAD_NOT_FOUND', 'Upload not found or access denied')

        return create_success_response({
            'upload_id': upload_id,
            'message': 'Upload progress updated'
        })

    except ValueError as e:
        return create_error_response(400, 'VALIDATION_ERROR', str(e))
    except Exception as e:
        logger.error(f"Error updating upload tracking: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to update upload progress')


def get_upload_tracking(event: Dict[str, Any]) -> Dict[str, Any]:
    """Get upload status."""
    try:
        user_info = get_user_info(event)
        path_params = event.get('pathParameters', {})
        upload_id = path_params.get('upload_id')

        if not upload_id:
            raise ValueError("Missing upload_id in path parameters")

        tracker = UploadTracker()
        status = tracker.get_upload_status(user_info, upload_id)

        if not status:
            return create_error_response(404, 'UPLOAD_NOT_FOUND', 'Upload not found or access denied')

        return create_success_response(status)

    except ValueError as e:
        return create_error_response(400, 'VALIDATION_ERROR', str(e))
    except Exception as e:
        logger.error(f"Error getting upload tracking: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to get upload status')


def list_upload_tracking(event: Dict[str, Any]) -> Dict[str, Any]:
    """List user uploads."""
    try:
        user_info = get_user_info(event)
        query_params = event.get('queryStringParameters') or {}

        limit = int(query_params.get('limit', 50))
        status_filter = query_params.get('status')

        if limit < 1 or limit > 100:
            limit = 50

        tracker = UploadTracker()
        uploads = tracker.list_user_uploads(user_info, limit, status_filter)

        return create_success_response({
            'uploads': uploads,
            'count': len(uploads)
        })

    except Exception as e:
        logger.error(f"Error listing upload tracking: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to list uploads')


def cancel_upload_tracking(event: Dict[str, Any]) -> Dict[str, Any]:
    """Cancel an upload."""
    try:
        user_info = get_user_info(event)
        path_params = event.get('pathParameters', {})
        upload_id = path_params.get('upload_id')

        if not upload_id:
            raise ValueError("Missing upload_id in path parameters")

        tracker = UploadTracker()
        success = tracker.cancel_upload(user_info, upload_id)

        if not success:
            return create_error_response(404, 'UPLOAD_NOT_FOUND', 'Upload not found or access denied')

        return create_success_response({
            'upload_id': upload_id,
            'status': UPLOAD_STATUS['CANCELLED'],
            'message': 'Upload cancelled successfully'
        })

    except ValueError as e:
        return create_error_response(400, 'VALIDATION_ERROR', str(e))
    except Exception as e:
        logger.error(f"Error cancelling upload: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to cancel upload')


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
        'body': json.dumps(data, default=str)
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
    """Main Lambda handler for upload progress tracking."""
    try:
        logger.info("Processing upload progress request")

        http_method = event.get('httpMethod', '').upper()
        path_parameters = event.get('pathParameters', {})
        upload_id = path_parameters.get('upload_id')

        # Route based on HTTP method and path
        if http_method == 'POST' and not upload_id:
            return create_upload_tracking(event)
        elif http_method == 'PUT' and upload_id:
            return update_upload_tracking(event)
        elif http_method == 'GET' and upload_id:
            return get_upload_tracking(event)
        elif http_method == 'GET' and not upload_id:
            return list_upload_tracking(event)
        elif http_method == 'DELETE' and upload_id:
            return cancel_upload_tracking(event)
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

    except Exception as e:
        logger.error(f"Unexpected error in upload progress handler: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'An internal error occurred while processing the request')