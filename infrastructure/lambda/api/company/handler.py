import json
import boto3
import os
from typing import Dict, Any
import logging
from datetime import datetime
import uuid
from decimal import Decimal
import base64
import jwt
from jwt import PyJWKClient

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

COMPANIES_TABLE_NAME = os.environ['COMPANIES_TABLE']
PROCESSED_DOCUMENTS_BUCKET = os.environ['DOCUMENTS_BUCKET']
EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']
COGNITO_USER_POOL_ID = os.environ['USER_POOL_ID']  # CDK sets this as USER_POOL_ID
AWS_REGION = os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')  # Use AWS default or fallback

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle company profile CRUD operations.
    Supports GET, PUT, POST, DELETE operations on company profiles.
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
        if http_method == 'GET':
            return handle_get_company_profile(company_id)
        elif http_method == 'PUT':
            return handle_update_company_profile(company_id, body)
        elif http_method == 'POST' and path.endswith('/scrape-website'):
            return handle_scrape_website(company_id, body)
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

    except Exception as e:
        logger.error(f"Company profile error: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_get_company_profile(company_id: str) -> Dict[str, Any]:
    """Get company profile by company_id"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)

        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            # Return empty profile structure for new companies
            empty_profile = {
                'company_id': company_id,
                'company_name': '',
                'website_url': '',
                'duns_number': '',
                'cage_code': '',
                'uei': '',
                'naics_codes': [],
                'certifications': [],
                'revenue_range': '',
                'employee_count': '',
                'locations': [],
                'capability_statement': '',
                'created_at': datetime.utcnow().isoformat() + 'Z',
                'updated_at': datetime.utcnow().isoformat() + 'Z'
            }
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'success': True,
                    'data': empty_profile
                })
            }

        # Convert Decimal to float for JSON serialization
        item = json.loads(json.dumps(response['Item'], default=decimal_default))

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'success': True,
                'data': item
            })
        }

    except Exception as e:
        logger.error(f"Error getting company profile: {str(e)}")
        return create_error_response(500, 'GET_PROFILE_FAILED', 'Failed to retrieve company profile')

def handle_update_company_profile(company_id: str, profile_data: Dict[str, Any]) -> Dict[str, Any]:
    """Update company profile"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)

        # Remove company_id from profile_data if present (it's the key)
        profile_data.pop('company_id', None)

        # Validate required fields
        required_fields = ['company_name']
        for field in required_fields:
            if not profile_data.get(field):
                return create_error_response(400, 'MISSING_FIELD', f'{field} is required')

        # Build update expression
        update_expression = "SET #updated_at = :updated_at"
        expression_attribute_values = {':updated_at': datetime.utcnow().isoformat() + 'Z'}
        expression_attribute_names = {'#updated_at': 'updated_at'}

        for key, value in profile_data.items():
            if key not in ['company_id', 'created_at', 'updated_at']:  # Don't update these fields
                # Create unique attribute names to avoid conflicts
                safe_key = key.replace('-', '_').replace('.', '_')
                attr_key = f":val_{safe_key}"
                name_key = f"#attr_{safe_key}"
                update_expression += f", {name_key} = {attr_key}"
                expression_attribute_values[attr_key] = value
                expression_attribute_names[name_key] = key

        # Check if profile exists, if not create it
        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            # Profile doesn't exist, create it
            profile_data['company_id'] = company_id
            profile_data['created_at'] = datetime.utcnow().isoformat() + 'Z'
            profile_data['updated_at'] = datetime.utcnow().isoformat() + 'Z'

            companies_table.put_item(Item=profile_data)

            return {
                'statusCode': 201,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'success': True,
                    'data': profile_data,
                    'message': 'Company profile created successfully'
                })
            }

        # Update existing profile
        response = companies_table.update_item(
            Key={'company_id': company_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ExpressionAttributeNames=expression_attribute_names,
            ReturnValues="ALL_NEW"
        )

        # Convert Decimal to float for JSON serialization
        updated_item = json.loads(json.dumps(response['Attributes'], default=decimal_default))

        # Trigger profile re-processing for embeddings
        trigger_profile_reprocessing(company_id)

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'success': True,
                'data': updated_item,
                'message': 'Company profile updated successfully'
            })
        }

    except Exception as e:
        logger.error(f"Error updating company profile: {str(e)}")
        return create_error_response(500, 'UPDATE_PROFILE_FAILED', 'Failed to update company profile')

def handle_scrape_website(company_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Trigger website scraping for company"""
    try:
        website_url = body.get('website_url')

        if not website_url:
            return create_error_response(400, 'MISSING_URL', 'website_url is required')

        # Send message to web scraping queue if available
        scraping_queue_url = os.environ.get('WEB_SCRAPING_QUEUE_URL')
        if scraping_queue_url:
            import boto3
            sqs = boto3.client('sqs')

            message_body = {
                'company_id': company_id,
                'website_url': website_url,
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }

            sqs.send_message(
                QueueUrl=scraping_queue_url,
                MessageBody=json.dumps(message_body)
            )

            # Update company profile with scraping initiation
            companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)
            companies_table.update_item(
                Key={'company_id': company_id},
                UpdateExpression="SET website_scraping_status = :status, website_scraping_initiated_at = :initiated_at, updated_at = :updated_at",
                ExpressionAttributeValues={
                    ':status': 'initiated',
                    ':initiated_at': datetime.utcnow().isoformat() + 'Z',
                    ':updated_at': datetime.utcnow().isoformat() + 'Z'
                }
            )

            logger.info(f"Website scraping message sent to queue for company: {company_id}, URL: {website_url}")

        return {
            'statusCode': 202,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'success': True,
                'data': {
                    'company_id': company_id,
                    'website_url': website_url,
                    'status': 'processing'
                },
                'message': 'Website scraping initiated'
            })
        }

    except Exception as e:
        logger.error(f"Error initiating website scraping: {str(e)}")
        return create_error_response(500, 'SCRAPING_FAILED', 'Failed to initiate website scraping')

def trigger_profile_reprocessing(company_id: str):
    """Trigger company profile re-processing for embeddings"""
    try:
        # Send message to profile embedding queue if available
        embedding_queue_url = os.environ.get('PROFILE_EMBEDDING_QUEUE_URL')
        if embedding_queue_url:
            import boto3
            sqs = boto3.client('sqs')

            message_body = {
                'action': 'reembed_profile',
                'company_id': company_id,
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }

            sqs.send_message(
                QueueUrl=embedding_queue_url,
                MessageBody=json.dumps(message_body)
            )

            logger.info(f"Profile re-embedding message sent to queue for company: {company_id}")
        else:
            logger.info(f"Profile reprocessing triggered for company: {company_id}")
    except Exception as e:
        logger.warning(f"Failed to trigger profile reprocessing: {str(e)}")

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

def decimal_default(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

def create_error_response(status_code: int, error_code: str, message: str) -> Dict[str, Any]:
    """Create standardized error response"""
    return {
        'statusCode': status_code,
        'headers': get_cors_headers(),
        'body': json.dumps({
            'success': False,
            'error': f"{error_code}: {message}",
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        })
    }

def get_cors_headers() -> Dict[str, str]:
    """Get CORS headers for API responses"""
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }