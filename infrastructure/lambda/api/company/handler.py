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
        update_expression = "SET updated_at = :updated_at"
        expression_attribute_values = {':updated_at': datetime.utcnow().isoformat() + 'Z'}
        expression_attribute_names = {}

        for key, value in profile_data.items():
            if key not in ['company_id', 'created_at']:  # Don't update these fields
                attr_key = f":{key.replace('-', '_')}"
                name_key = f"#{key.replace('-', '_')}"
                update_expression += f", {name_key} = {attr_key}"
                expression_attribute_values[attr_key] = value
                expression_attribute_names[name_key] = key

        # Check if profile exists, if not create it
        try:
            companies_table.get_item(Key={'company_id': company_id})['Item']
        except KeyError:
            # Profile doesn't exist, set created_at
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

        # TODO: Trigger website scraping Lambda function
        # For now, return a placeholder response

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
        # TODO: Send message to SQS queue to trigger re-processing
        logger.info(f"Profile reprocessing triggered for company: {company_id}")
    except Exception as e:
        logger.warning(f"Failed to trigger profile reprocessing: {str(e)}")

def get_company_id_from_token(event: Dict[str, Any]) -> str:
    """Extract company_id from JWT token in Authorization header"""
    try:
        auth_header = event.get('headers', {}).get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            logger.error("Missing or invalid Authorization header")
            return None

        token = auth_header[7:]  # Remove 'Bearer ' prefix

        # Decode JWT token without verification first to get the header
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get('kid')

        if not kid:
            logger.error("Missing 'kid' in JWT header")
            return None

        # Get JWKS URL for Cognito User Pool
        jwks_url = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"

        # Get signing key
        jwks_client = PyJWKClient(jwks_url)
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        # Decode and verify JWT
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=None,  # We'll verify token_use instead
            options={"verify_aud": False}
        )

        # Verify this is an access token
        if payload.get('token_use') != 'access':
            logger.error(f"Invalid token_use: {payload.get('token_use')}")
            return None

        # Extract company_id from custom claims
        company_id = payload.get('custom:company_id')

        if not company_id:
            logger.error("Missing custom:company_id in token")
            return None

        logger.info(f"Successfully extracted company_id: {company_id}")
        return company_id

    except jwt.ExpiredSignatureError:
        logger.error("JWT token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.error(f"Invalid JWT token: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Error extracting company_id from token: {str(e)}")
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
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }