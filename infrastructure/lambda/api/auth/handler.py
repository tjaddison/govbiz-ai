import json
import boto3
import os
# import jwt  # Temporarily commented out for testing
from typing import Dict, Any
import logging
from datetime import datetime, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

cognito_client = boto3.client('cognito-idp')
dynamodb = boto3.resource('dynamodb')

USER_POOL_ID = os.environ['USER_POOL_ID']
USER_POOL_CLIENT_ID = os.environ['USER_POOL_CLIENT_ID']
TENANTS_TABLE_NAME = os.environ['TENANTS_TABLE_NAME']

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle authentication endpoints for the GovBizAI API.
    Supports: login, logout, refresh, register
    """
    try:
        http_method = event.get('httpMethod', '')
        path = event.get('path', '')
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}

        # Handle health check or test requests
        if body.get('action') == 'test':
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'status': 'success',
                    'message': 'Auth API is working',
                    'timestamp': datetime.utcnow().isoformat()
                })
            }

        # Route to appropriate handler based on path
        if path.endswith('/login'):
            return handle_login(body)
        elif path.endswith('/logout'):
            return handle_logout(event, body)
        elif path.endswith('/refresh'):
            return handle_refresh(body)
        elif path.endswith('/register'):
            return handle_register(body)
        else:
            return create_error_response(400, 'INVALID_ENDPOINT', 'Invalid authentication endpoint')

    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_login(body: Dict[str, Any]) -> Dict[str, Any]:
    """Handle user login"""
    try:
        email = body.get('email')
        password = body.get('password')

        if not email or not password:
            return create_error_response(400, 'MISSING_CREDENTIALS', 'Email and password are required')

        # Authenticate with Cognito
        response = cognito_client.initiate_auth(
            ClientId=USER_POOL_CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': email,
                'PASSWORD': password
            }
        )

        # Get user attributes including company_id
        user_response = cognito_client.get_user(
            AccessToken=response['AuthenticationResult']['AccessToken']
        )

        # Extract user info
        user_attributes = {attr['Name']: attr['Value'] for attr in user_response['UserAttributes']}
        company_id = user_attributes.get('custom:company_id')

        # Get tenant information
        tenant_info = None
        if company_id:
            tenants_table = dynamodb.Table(TENANTS_TABLE_NAME)
            tenant_response = tenants_table.get_item(Key={'tenant_id': company_id})
            tenant_info = tenant_response.get('Item')

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'access_token': response['AuthenticationResult']['AccessToken'],
                'refresh_token': response['AuthenticationResult']['RefreshToken'],
                'id_token': response['AuthenticationResult']['IdToken'],
                'expires_in': response['AuthenticationResult']['ExpiresIn'],
                'token_type': response['AuthenticationResult']['TokenType'],
                'user': {
                    'email': user_attributes.get('email'),
                    'name': user_attributes.get('name'),
                    'company_id': company_id,
                    'role': user_attributes.get('custom:role', 'user'),
                    'subscription_tier': user_attributes.get('custom:subscription_tier', 'basic')
                },
                'tenant': tenant_info
            })
        }

    except cognito_client.exceptions.NotAuthorizedException:
        return create_error_response(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
    except cognito_client.exceptions.UserNotFoundException:
        return create_error_response(404, 'USER_NOT_FOUND', 'User does not exist')
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return create_error_response(500, 'LOGIN_FAILED', 'Login failed')

def handle_logout(event: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    """Handle user logout"""
    try:
        # Get access token from Authorization header
        auth_header = event.get('headers', {}).get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return create_error_response(401, 'MISSING_TOKEN', 'Access token required')

        access_token = auth_header[7:]  # Remove 'Bearer ' prefix

        # Globally sign out the user
        cognito_client.global_sign_out(AccessToken=access_token)

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({'message': 'Successfully logged out'})
        }

    except cognito_client.exceptions.NotAuthorizedException:
        return create_error_response(401, 'INVALID_TOKEN', 'Invalid or expired access token')
    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        return create_error_response(500, 'LOGOUT_FAILED', 'Logout failed')

def handle_refresh(body: Dict[str, Any]) -> Dict[str, Any]:
    """Handle token refresh"""
    try:
        refresh_token = body.get('refresh_token')

        if not refresh_token:
            return create_error_response(400, 'MISSING_REFRESH_TOKEN', 'Refresh token is required')

        # Refresh the access token
        response = cognito_client.initiate_auth(
            ClientId=USER_POOL_CLIENT_ID,
            AuthFlow='REFRESH_TOKEN_AUTH',
            AuthParameters={
                'REFRESH_TOKEN': refresh_token
            }
        )

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'access_token': response['AuthenticationResult']['AccessToken'],
                'id_token': response['AuthenticationResult']['IdToken'],
                'expires_in': response['AuthenticationResult']['ExpiresIn'],
                'token_type': response['AuthenticationResult']['TokenType']
            })
        }

    except cognito_client.exceptions.NotAuthorizedException:
        return create_error_response(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token')
    except Exception as e:
        logger.error(f"Token refresh error: {str(e)}")
        return create_error_response(500, 'REFRESH_FAILED', 'Token refresh failed')

def handle_register(body: Dict[str, Any]) -> Dict[str, Any]:
    """Handle user registration"""
    try:
        email = body.get('email')
        password = body.get('password')
        name = body.get('name')
        company_name = body.get('company_name')
        phone = body.get('phone', '')

        if not all([email, password, name, company_name]):
            return create_error_response(400, 'MISSING_FIELDS', 'Email, password, name, and company_name are required')

        # Create user in Cognito
        response = cognito_client.sign_up(
            ClientId=USER_POOL_CLIENT_ID,
            Username=email,
            Password=password,
            UserAttributes=[
                {'Name': 'email', 'Value': email},
                {'Name': 'name', 'Value': name},
                {'Name': 'phone_number', 'Value': phone} if phone else {'Name': 'email_verified', 'Value': 'false'}
            ]
        )

        return {
            'statusCode': 201,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'user_sub': response['UserSub'],
                'message': 'User registered successfully. Please check your email for verification.',
                'confirmation_required': not response.get('UserConfirmed', False)
            })
        }

    except cognito_client.exceptions.UsernameExistsException:
        return create_error_response(409, 'USER_EXISTS', 'User with this email already exists')
    except cognito_client.exceptions.InvalidPasswordException as e:
        return create_error_response(400, 'INVALID_PASSWORD', str(e))
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        return create_error_response(500, 'REGISTRATION_FAILED', 'User registration failed')

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