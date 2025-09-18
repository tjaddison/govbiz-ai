import json
import boto3
import os
from typing import Dict, Any
import logging
from datetime import datetime
import uuid
import jwt  # This is PyJWT
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Configure S3 client with signature version 4 for KMS support
s3_client = boto3.client(
    's3',
    region_name=os.environ.get('AWS_REGION', 'us-east-1'),
    config=boto3.session.Config(signature_version='s3v4')
)
dynamodb = boto3.resource('dynamodb')

RAW_DOCUMENTS_BUCKET = os.environ['DOCUMENTS_BUCKET']
PROCESSED_DOCUMENTS_BUCKET = os.environ['DOCUMENTS_BUCKET']
COMPANIES_TABLE_NAME = os.environ['COMPANIES_TABLE']

class DecimalEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle Decimal objects from DynamoDB"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

def json_dumps_safe(data):
    """Safe JSON dumps that handles Decimal objects"""
    return json.dumps(data, cls=DecimalEncoder)

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

        # Debug routing information
        logger.info(f"Routing: method={http_method}, path='{path}', path_params={path_parameters}")
        logger.info(f"Checking conditions:")
        logger.info(f"  POST + upload-url: {http_method == 'POST' and path.endswith('/upload-url')}")
        logger.info(f"  POST + confirm: {http_method == 'POST' and (path_parameters and path_parameters.get('id')) and path.endswith('/confirm')}")
        logger.info(f"  GET + list: {http_method == 'GET' and not (path_parameters and path_parameters.get('id'))}")
        logger.info(f"  GET + specific: {http_method == 'GET' and (path_parameters and path_parameters.get('id'))}")

        # Route based on HTTP method and path
        if http_method == 'POST' and path.endswith('/upload-url'):
            # Handle document upload initiation (generate presigned URL)
            logger.info("Routing to handle_upload_initiation")
            return handle_upload_initiation(company_id, body)
        elif http_method == 'POST' and path_parameters and path_parameters.get('id') and path.endswith('/confirm'):
            # Handle document upload completion
            logger.info("Routing to handle_upload_completion")
            return handle_upload_completion(company_id, path_parameters['id'], body)
        elif http_method == 'GET' and path_parameters and path_parameters.get('id') and path.endswith('/download-url'):
            # Get presigned download URL
            logger.info("Routing to handle_get_download_url")
            return handle_get_download_url(company_id, path_parameters['id'])
        elif http_method == 'GET' and not (path_parameters and path_parameters.get('id')):
            # List documents
            logger.info("Routing to handle_list_documents")
            return handle_list_documents(company_id, query_parameters)
        elif http_method == 'GET' and path_parameters and path_parameters.get('id'):
            # Get specific document
            logger.info("Routing to handle_get_document")
            return handle_get_document(company_id, path_parameters['id'])
        elif http_method == 'DELETE' and path_parameters and path_parameters.get('id'):
            # Delete document
            logger.info("Routing to handle_delete_document")
            return handle_delete_document(company_id, path_parameters['id'])
        else:
            logger.info("No matching route found - returning METHOD_NOT_ALLOWED")
            return create_error_response(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

    except Exception as e:
        logger.error(f"Document management error: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_upload_initiation(company_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Generate presigned URL for document upload"""
    logger.info(f"handle_upload_initiation called with company_id: {company_id}, body: {body}")
    try:
        filename = body.get('filename')
        content_type = body.get('file_type', body.get('content_type', 'application/octet-stream'))
        category = body.get('document_type', body.get('category', 'other'))
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

        # Generate presigned URL for upload without ContentType in signature
        # This allows the client to set the Content-Type header
        logger.info(f"Generating presigned URL for bucket: {RAW_DOCUMENTS_BUCKET}, key: {s3_key}")

        try:
            # Get current credentials for debugging
            import boto3
            session = boto3.Session()
            credentials = session.get_credentials()
            logger.info(f"Using credentials - Access Key: {credentials.access_key[:10]}..., Session Token: {'Yes' if credentials.token else 'No'}")

            # Generate presigned URL with Content-Type and KMS encryption headers
            # Include KMS encryption headers in signature to match frontend upload
            presigned_url = s3_client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': RAW_DOCUMENTS_BUCKET,
                    'Key': s3_key,
                    'ContentType': content_type,
                    'ServerSideEncryption': 'aws:kms',
                    'SSEKMSKeyId': 'alias/govbizai-encryption-key',
                },
                ExpiresIn=3600  # 1 hour
            )
            logger.info(f"Successfully generated presigned URL: {presigned_url[:100]}...")

            # Log the signature details for debugging
            from urllib.parse import urlparse, parse_qs
            parsed_url = urlparse(presigned_url)
            params = parse_qs(parsed_url.query)
            logger.info(f"Presigned URL details - AccessKeyId: {params.get('AWSAccessKeyId', ['N/A'])[0][:10]}..., Expires: {params.get('Expires', ['N/A'])[0]}")

        except Exception as e:
            logger.error(f"Failed to generate presigned URL: {str(e)}")
            return create_error_response(500, 'PRESIGNED_URL_FAILED', f'Failed to generate presigned URL: {str(e)}')

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
                'success': True,
                'data': {
                    'uploadUrl': presigned_url,
                    'key': s3_key,
                    'document_id': document_id
                }
            })
        }

    except Exception as e:
        logger.error(f"Error generating upload URL: {str(e)}")
        return create_error_response(500, 'UPLOAD_INITIATION_FAILED', 'Failed to initiate upload')

def handle_upload_completion(company_id: str, document_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Handle upload completion notification"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)

        # First get the current document list to find the index of the document to update
        response = companies_table.get_item(Key={'company_id': company_id})
        if 'Item' not in response:
            return create_error_response(404, 'COMPANY_NOT_FOUND', 'Company profile not found')

        documents = response['Item'].get('documents', [])
        document_index = None

        # Find the index of the document with matching document_id
        for i, doc in enumerate(documents):
            if doc.get('document_id') == document_id:
                document_index = i
                break

        if document_index is None:
            return create_error_response(404, 'DOCUMENT_NOT_FOUND', 'Document not found')

        # Update the specific document's status to 'uploaded'
        companies_table.update_item(
            Key={'company_id': company_id},
            UpdateExpression=f"SET #docs[{document_index}].#status = :status, #docs[{document_index}].updated_at = :updated_at",
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

        # Update the document in our local copy and return it
        documents[document_index]['status'] = 'uploaded'
        documents[document_index]['updated_at'] = datetime.utcnow().isoformat() + 'Z'

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json_dumps_safe({
                'success': True,
                'data': documents[document_index]
            })
        }

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'success': True,
                'data': {
                    'document_id': document_id,
                    'status': 'uploaded'
                }
            })
        }

    except Exception as e:
        logger.error(f"Error handling upload completion: {str(e)}")
        return create_error_response(500, 'UPLOAD_COMPLETION_FAILED', 'Failed to complete upload')

def handle_list_documents(company_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """List documents for a company"""
    logger.info(f"handle_list_documents called with company_id: {company_id}, query_params: {query_params}")
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)
        logger.info(f"Querying DynamoDB table {COMPANIES_TABLE_NAME} for company_id: {company_id}")

        response = companies_table.get_item(Key={'company_id': company_id})
        logger.info(f"DynamoDB response: {response}")

        if 'Item' not in response:
            logger.info("Company not found in DynamoDB")
            return create_error_response(404, 'COMPANY_NOT_FOUND', 'Company profile not found')

        documents = response['Item'].get('documents', [])
        logger.info(f"Found {len(documents)} documents for company {company_id}")

        # Transform documents to match frontend interface
        transformed_documents = []
        for doc in documents:
            transformed_doc = {
                'document_id': doc.get('document_id', ''),
                'tenant_id': company_id,  # Use company_id as tenant_id
                'company_id': company_id,
                'document_name': doc.get('filename', ''),
                'document_type': doc.get('category', 'other'),
                'file_size': doc.get('file_size') or 0,
                'mime_type': doc.get('content_type', ''),
                'upload_date': doc.get('created_at', ''),
                's3_bucket': 'govbizai-raw-documents-927576824761-us-east-1',  # From environment
                's3_key': doc.get('s3_key', ''),
                'processing_status': doc.get('status', 'uploading'),
                'embedding_id': doc.get('embedding_id'),
                'tags': doc.get('tags', []),  # Default to empty array if no tags
                'version': doc.get('version', 1)
            }
            transformed_documents.append(transformed_doc)

        logger.info(f"Transformed {len(transformed_documents)} documents to frontend format")

        # Apply filters
        category_filter = query_params.get('category')
        if category_filter:
            transformed_documents = [doc for doc in transformed_documents if doc.get('document_type') == category_filter]

        # Apply sorting
        sort_by = query_params.get('sort_by', 'upload_date')
        sort_order = query_params.get('sort_order', 'desc')

        if sort_by in ['upload_date', 'document_name', 'file_size']:
            reverse = sort_order == 'desc'
            transformed_documents.sort(key=lambda x: x.get(sort_by, ''), reverse=reverse)

        # Apply pagination
        page = int(query_params.get('page', '1'))
        limit = min(int(query_params.get('limit', '50')), 100)  # Max 100 per page
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit

        paginated_documents = transformed_documents[start_idx:end_idx]

        logger.info(f"📋 [LAMBDA] Final response summary:")
        logger.info(f"📋 [LAMBDA] - Company ID: {company_id}")
        logger.info(f"📋 [LAMBDA] - Total documents in DB: {len(documents)}")
        logger.info(f"📋 [LAMBDA] - Transformed documents: {len(transformed_documents)}")
        logger.info(f"📋 [LAMBDA] - Filtered documents: {len(paginated_documents)}")
        logger.info(f"📋 [LAMBDA] - Page: {page}, Limit: {limit}")
        logger.info(f"📋 [LAMBDA] - Sample document structure: {paginated_documents[0] if paginated_documents else 'No documents'}")

        response_body = {
            'success': True,
            'data': paginated_documents,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': len(transformed_documents),
                'pages': (len(transformed_documents) + limit - 1) // limit
            },
            'error': None
        }

        logger.info(f"📋 [LAMBDA] Response body preview: success={response_body['success']}, data_length={len(response_body['data'])}")

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json_dumps_safe(response_body)
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

def handle_get_download_url(company_id: str, document_id: str) -> Dict[str, Any]:
    """Get presigned download URL for a document"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)

        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            return create_error_response(404, 'COMPANY_NOT_FOUND', 'Company profile not found')

        documents = response['Item'].get('documents', [])
        document = next((doc for doc in documents if doc.get('document_id') == document_id), None)

        if not document:
            return create_error_response(404, 'DOCUMENT_NOT_FOUND', 'Document not found')

        if document.get('status') != 'uploaded' and document.get('status') != 'processed':
            return create_error_response(400, 'DOCUMENT_NOT_READY', 'Document is not ready for download')

        # Generate presigned URL for download
        if document.get('s3_key'):
            try:
                download_url = s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': RAW_DOCUMENTS_BUCKET,
                        'Key': document['s3_key']
                    },
                    ExpiresIn=3600  # 1 hour
                )

                return {
                    'statusCode': 200,
                    'headers': get_cors_headers(),
                    'body': json.dumps({
                        'success': True,
                        'data': {
                            'downloadUrl': download_url
                        }
                    })
                }
            except Exception as e:
                logger.error(f"Failed to generate download URL: {str(e)}")
                return create_error_response(500, 'DOWNLOAD_URL_FAILED', 'Failed to generate download URL')
        else:
            return create_error_response(400, 'NO_FILE_KEY', 'Document has no associated file')

    except Exception as e:
        logger.error(f"Error getting download URL: {str(e)}")
        return create_error_response(500, 'GET_DOWNLOAD_URL_FAILED', 'Failed to get download URL')

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

        # Delete associated embeddings and trigger profile re-embedding
        cleanup_document_embeddings(company_id, document_id)
        trigger_profile_reembedding(company_id)

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

def cleanup_document_embeddings(company_id: str, document_id: str):
    """Delete embeddings associated with a document"""
    try:
        # List all embedding files for this document
        s3_prefix = f"{company_id}/embeddings/documents/{document_id}/"

        response = s3_client.list_objects_v2(
            Bucket=os.environ.get('EMBEDDINGS_BUCKET', PROCESSED_DOCUMENTS_BUCKET),
            Prefix=s3_prefix
        )

        if 'Contents' in response:
            # Delete each embedding file
            for obj in response['Contents']:
                s3_client.delete_object(
                    Bucket=os.environ.get('EMBEDDINGS_BUCKET', PROCESSED_DOCUMENTS_BUCKET),
                    Key=obj['Key']
                )
                logger.info(f"Deleted embedding: {obj['Key']}")

            logger.info(f"Cleaned up {len(response['Contents'])} embeddings for document {document_id}")
        else:
            logger.info(f"No embeddings found for document {document_id}")

    except Exception as e:
        logger.warning(f"Failed to cleanup document embeddings: {str(e)}")

def trigger_profile_reembedding(company_id: str):
    """Trigger company profile re-embedding after document changes"""
    try:
        processing_queue_url = os.environ.get('PROCESSING_QUEUE_URL')
        if processing_queue_url:
            import boto3
            sqs = boto3.client('sqs')

            message_body = {
                'action': 'reembed_profile',
                'company_id': company_id,
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }

            sqs.send_message(
                QueueUrl=processing_queue_url,
                MessageBody=json.dumps(message_body)
            )

            logger.info(f"Triggered profile re-embedding for company: {company_id}")
        else:
            logger.warning("PROCESSING_QUEUE_URL not configured for profile re-embedding")
    except Exception as e:
        logger.warning(f"Failed to trigger profile re-embedding: {str(e)}")

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
    """Extract company_id from Cognito context provided by API Gateway"""
    try:
        # Log the entire event for debugging
        logger.info(f"Lambda event received: {json.dumps(event, default=str)}")

        # API Gateway passes Cognito claims in requestContext.authorizer.claims
        request_context = event.get('requestContext', {})
        authorizer = request_context.get('authorizer', {})
        claims = authorizer.get('claims', {})

        logger.info(f"Cognito claims from API Gateway: {json.dumps(claims, default=str)}")

        if claims:
            # Use sub (Cognito user ID) as company_id since custom attributes can't be added to existing pools
            company_id = claims.get('sub')

            if company_id:
                logger.info(f"Successfully extracted company_id from claims (using sub): {company_id}")
                return company_id
            else:
                logger.warning("No sub found in claims, trying manual token parsing...")

        # Fallback to manual token parsing if claims are not available
        auth_header = event.get('headers', {}).get('Authorization', '') or event.get('headers', {}).get('authorization', '')
        if not auth_header.startswith('Bearer '):
            logger.error("Missing or invalid Authorization header")
            return None

        token = auth_header[7:]  # Remove 'Bearer ' prefix
        logger.info(f"Attempting to parse token manually: {token[:50]}...")

        # Decode JWT token without verification to get claims (API Gateway already verified it)
        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        logger.info(f"Unverified token payload: {json.dumps(unverified_payload, default=str)}")

        # Use sub (Cognito user ID) as company_id since custom attributes can't be added to existing pools
        company_id = unverified_payload.get('sub')

        if company_id:
            logger.info(f"Successfully extracted company_id from token: {company_id}")
            return company_id
        else:
            logger.error("No company_id found in token payload")
            return None

    except Exception as e:
        logger.error(f"Error extracting company_id: {str(e)}")
        return None

def create_error_response(status_code: int, error_code: str, message: str) -> Dict[str, Any]:
    """Create standardized error response"""
    return {
        'statusCode': status_code,
        'headers': get_cors_headers(),
        'body': json.dumps({
            'success': False,
            'data': None,
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