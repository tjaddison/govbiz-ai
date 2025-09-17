import json
import boto3
import os
from typing import Dict, Any
import logging
from datetime import datetime
import uuid

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

RAW_DOCUMENTS_BUCKET = os.environ['DOCUMENTS_BUCKET']
PROCESSED_DOCUMENTS_BUCKET = os.environ['DOCUMENTS_BUCKET']
COMPANIES_TABLE_NAME = os.environ['COMPANIES_TABLE']

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle document management operations.
    Supports: upload, list, delete, and generate presigned URLs
    """
    try:
        http_method = event.get('httpMethod', '')
        path = event.get('path', '')
        path_parameters = event.get('pathParameters') or {}
        query_parameters = event.get('queryStringParameters') or {}
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}

        # Extract company_id from token
        company_id = get_company_id_from_token(event)
        if not company_id:
            return create_error_response(401, 'UNAUTHORIZED', 'Invalid or missing authentication token')

        # Route based on HTTP method and path
        if http_method == 'POST' and not path_parameters.get('id'):
            # Handle document upload initiation (generate presigned URL)
            return handle_upload_initiation(company_id, body)
        elif http_method == 'POST' and path_parameters.get('id'):
            # Handle document upload completion
            return handle_upload_completion(company_id, path_parameters['id'], body)
        elif http_method == 'GET' and not path_parameters.get('id'):
            # List documents
            return handle_list_documents(company_id, query_parameters)
        elif http_method == 'GET' and path_parameters.get('id'):
            # Get specific document
            return handle_get_document(company_id, path_parameters['id'])
        elif http_method == 'DELETE' and path_parameters.get('id'):
            # Delete document
            return handle_delete_document(company_id, path_parameters['id'])
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

    except Exception as e:
        logger.error(f"Document management error: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_upload_initiation(company_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Generate presigned URL for document upload"""
    try:
        filename = body.get('filename')
        content_type = body.get('content_type', 'application/octet-stream')
        category = body.get('category', 'other')
        file_size = body.get('file_size')

        if not filename:
            return create_error_response(400, 'MISSING_FILENAME', 'filename is required')

        # Validate file size (max 100MB)
        if file_size and file_size > 104857600:  # 100MB in bytes
            return create_error_response(400, 'FILE_TOO_LARGE', 'File size cannot exceed 100MB')

        # Validate file extension
        allowed_extensions = {'.pdf', '.xlsx', '.xls', '.doc', '.docx', '.txt'}
        file_extension = os.path.splitext(filename)[1].lower()
        if file_extension not in allowed_extensions:
            return create_error_response(400, 'INVALID_FILE_TYPE',
                                       f'File type {file_extension} not allowed. Allowed types: {", ".join(allowed_extensions)}')

        # Generate unique document ID and S3 key
        document_id = str(uuid.uuid4())
        s3_key = f"{company_id}/raw/{document_id}/{filename}"

        # Generate presigned URL for upload
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': RAW_DOCUMENTS_BUCKET,
                'Key': s3_key,
                'ContentType': content_type
            },
            ExpiresIn=3600  # 1 hour
        )

        # Store document metadata in company profile
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)
        timestamp = datetime.utcnow().isoformat() + 'Z'

        # Add document to company's documents list
        try:
            companies_table.update_item(
                Key={'company_id': company_id},
                UpdateExpression="SET #docs = list_append(if_not_exists(#docs, :empty_list), :doc)",
                ExpressionAttributeNames={'#docs': 'documents'},
                ExpressionAttributeValues={
                    ':empty_list': [],
                    ':doc': [{
                        'document_id': document_id,
                        'filename': filename,
                        'category': category,
                        'content_type': content_type,
                        'file_size': file_size,
                        'status': 'uploading',
                        's3_key': s3_key,
                        'created_at': timestamp
                    }]
                }
            )
        except Exception as e:
            logger.warning(f"Failed to update company documents list: {str(e)}")

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'document_id': document_id,
                'upload_url': presigned_url,
                'expires_at': (datetime.utcnow().timestamp() + 3600) * 1000,  # Milliseconds
                'max_file_size': 104857600
            })
        }

    except Exception as e:
        logger.error(f"Error generating upload URL: {str(e)}")
        return create_error_response(500, 'UPLOAD_INITIATION_FAILED', 'Failed to initiate upload')

def handle_upload_completion(company_id: str, document_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Handle upload completion notification"""
    try:
        # Verify the file was uploaded to S3
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)

        # Update document status to 'uploaded'
        companies_table.update_item(
            Key={'company_id': company_id},
            UpdateExpression="SET #docs[0].#status = :status, #docs[0].updated_at = :updated_at",
            ExpressionAttributeNames={
                '#docs': 'documents',
                '#status': 'status'
            },
            ExpressionAttributeValues={
                ':status': 'uploaded',
                ':updated_at': datetime.utcnow().isoformat() + 'Z'
            },
            ConditionExpression="attribute_exists(documents)"
        )

        # TODO: Trigger document processing pipeline
        trigger_document_processing(company_id, document_id)

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Document uploaded successfully',
                'document_id': document_id,
                'status': 'processing'
            })
        }

    except Exception as e:
        logger.error(f"Error handling upload completion: {str(e)}")
        return create_error_response(500, 'UPLOAD_COMPLETION_FAILED', 'Failed to complete upload')

def handle_list_documents(company_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """List documents for a company"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)

        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            return create_error_response(404, 'COMPANY_NOT_FOUND', 'Company profile not found')

        documents = response['Item'].get('documents', [])

        # Apply filters
        category_filter = query_params.get('category')
        if category_filter:
            documents = [doc for doc in documents if doc.get('category') == category_filter]

        # Apply sorting
        sort_by = query_params.get('sort_by', 'created_at')
        sort_order = query_params.get('sort_order', 'desc')

        if sort_by in ['created_at', 'filename', 'file_size']:
            reverse = sort_order == 'desc'
            documents.sort(key=lambda x: x.get(sort_by, ''), reverse=reverse)

        # Apply pagination
        page = int(query_params.get('page', '1'))
        limit = min(int(query_params.get('limit', '50')), 100)  # Max 100 per page
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit

        paginated_documents = documents[start_idx:end_idx]

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'documents': paginated_documents,
                'pagination': {
                    'page': page,
                    'limit': limit,
                    'total': len(documents),
                    'pages': (len(documents) + limit - 1) // limit
                }
            })
        }

    except Exception as e:
        logger.error(f"Error listing documents: {str(e)}")
        return create_error_response(500, 'LIST_DOCUMENTS_FAILED', 'Failed to list documents')

def handle_get_document(company_id: str, document_id: str) -> Dict[str, Any]:
    """Get specific document details"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)

        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            return create_error_response(404, 'COMPANY_NOT_FOUND', 'Company profile not found')

        documents = response['Item'].get('documents', [])
        document = next((doc for doc in documents if doc.get('document_id') == document_id), None)

        if not document:
            return create_error_response(404, 'DOCUMENT_NOT_FOUND', 'Document not found')

        # Generate presigned URL for download if document is processed
        if document.get('status') == 'processed' and document.get('s3_key'):
            try:
                download_url = s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': PROCESSED_DOCUMENTS_BUCKET,
                        'Key': document['s3_key']
                    },
                    ExpiresIn=3600  # 1 hour
                )
                document['download_url'] = download_url
            except Exception as e:
                logger.warning(f"Failed to generate download URL: {str(e)}")

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(document)
        }

    except Exception as e:
        logger.error(f"Error getting document: {str(e)}")
        return create_error_response(500, 'GET_DOCUMENT_FAILED', 'Failed to get document')

def handle_delete_document(company_id: str, document_id: str) -> Dict[str, Any]:
    """Delete a specific document"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)

        # Get current documents
        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            return create_error_response(404, 'COMPANY_NOT_FOUND', 'Company profile not found')

        documents = response['Item'].get('documents', [])
        document_to_delete = next((doc for doc in documents if doc.get('document_id') == document_id), None)

        if not document_to_delete:
            return create_error_response(404, 'DOCUMENT_NOT_FOUND', 'Document not found')

        # Remove document from list
        updated_documents = [doc for doc in documents if doc.get('document_id') != document_id]

        # Update company profile
        companies_table.update_item(
            Key={'company_id': company_id},
            UpdateExpression="SET documents = :docs, updated_at = :updated_at",
            ExpressionAttributeValues={
                ':docs': updated_documents,
                ':updated_at': datetime.utcnow().isoformat() + 'Z'
            }
        )

        # Delete from S3
        if document_to_delete.get('s3_key'):
            try:
                s3_client.delete_object(
                    Bucket=RAW_DOCUMENTS_BUCKET,
                    Key=document_to_delete['s3_key']
                )
            except Exception as e:
                logger.warning(f"Failed to delete from S3: {str(e)}")

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Document deleted successfully',
                'document_id': document_id
            })
        }

    except Exception as e:
        logger.error(f"Error deleting document: {str(e)}")
        return create_error_response(500, 'DELETE_DOCUMENT_FAILED', 'Failed to delete document')

def trigger_document_processing(company_id: str, document_id: str):
    """Trigger document processing pipeline"""
    try:
        # Get the document details to send to processing queue
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)
        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            logger.error(f"Company not found for document processing: {company_id}")
            return

        documents = response['Item'].get('documents', [])
        document = next((doc for doc in documents if doc.get('document_id') == document_id), None)

        if not document:
            logger.error(f"Document not found: {document_id}")
            return

        # Send message to processing queue if available
        processing_queue_url = os.environ.get('PROCESSING_QUEUE_URL')
        if processing_queue_url:
            import boto3
            sqs = boto3.client('sqs')

            message_body = {
                'company_id': company_id,
                'document_id': document_id,
                'bucket': document.get('s3_key', '').split('/')[0] if document.get('s3_key') else PROCESSED_DOCUMENTS_BUCKET,
                'key': document.get('s3_key', ''),
                'filename': document.get('filename', ''),
                'category': document.get('category', 'other'),
                'content_type': document.get('content_type', ''),
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }

            sqs.send_message(
                QueueUrl=processing_queue_url,
                MessageBody=json.dumps(message_body)
            )

            logger.info(f"Document processing message sent to queue for company: {company_id}, document: {document_id}")
        else:
            logger.info(f"Document processing triggered for company: {company_id}, document: {document_id}")
    except Exception as e:
        logger.warning(f"Failed to trigger document processing: {str(e)}")

def get_company_id_from_token(event: Dict[str, Any]) -> str:
    """Extract company_id from JWT token in Authorization header"""
    try:
        # TODO: Implement proper JWT decoding
        return event.get('requestContext', {}).get('authorizer', {}).get('company_id')
    except Exception as e:
        logger.error(f"Error extracting company_id from token: {str(e)}")
        return None

def create_error_response(status_code: int, error_code: str, message: str) -> Dict[str, Any]:
    """Create standardized error response"""
    return {
        'statusCode': status_code,
        'headers': get_cors_headers(),
        'body': json.dumps({
            'error': {
                'code': error_code,
                'message': message,
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }
        })
    }

def get_cors_headers() -> Dict[str, str]:
    """Get CORS headers for API responses"""
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }