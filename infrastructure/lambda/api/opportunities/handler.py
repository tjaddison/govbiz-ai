import json
import boto3
import os
from typing import Dict, Any, List
import logging
from datetime import datetime, timedelta
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

OPPORTUNITIES_TABLE_NAME = os.environ['OPPORTUNITIES_TABLE']
RAW_DOCUMENTS_BUCKET = os.environ['DOCUMENTS_BUCKET']

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle opportunity retrieval operations.
    Supports: list opportunities, get opportunity details, get attachments
    """
    try:
        http_method = event.get('httpMethod', '')
        path = event.get('path', '')
        path_parameters = event.get('pathParameters') or {}
        query_parameters = event.get('queryStringParameters') or {}

        # Extract company_id from token for audit logging
        company_id = get_company_id_from_token(event)
        if not company_id:
            return create_error_response(401, 'UNAUTHORIZED', 'Invalid or missing authentication token')

        # Route based on HTTP method and path
        if http_method == 'GET' and not path_parameters.get('id'):
            # List opportunities
            return handle_list_opportunities(company_id, query_parameters)
        elif http_method == 'GET' and path_parameters.get('id') and not path.endswith('/attachments'):
            # Get specific opportunity
            return handle_get_opportunity(company_id, path_parameters['id'])
        elif http_method == 'GET' and path_parameters.get('id') and path.endswith('/attachments'):
            # Get opportunity attachments
            return handle_get_opportunity_attachments(company_id, path_parameters['id'])
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

    except Exception as e:
        logger.error(f"Opportunity retrieval error: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_list_opportunities(company_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """List opportunities with filtering and pagination"""
    try:
        opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE_NAME)

        # Build filter parameters
        filter_expression = None
        expression_attribute_names = {}
        expression_attribute_values = {}

        # Date range filtering
        posted_after = query_params.get('posted_after')
        posted_before = query_params.get('posted_before')

        if posted_after:
            filter_expression = add_filter(
                filter_expression,
                "#posted_date >= :posted_after",
                expression_attribute_names,
                expression_attribute_values,
                {"#posted_date": "posted_date"},
                {":posted_after": posted_after}
            )

        if posted_before:
            filter_expression = add_filter(
                filter_expression,
                "#posted_date <= :posted_before",
                expression_attribute_names,
                expression_attribute_values,
                {"#posted_date": "posted_date"},
                {":posted_before": posted_before}
            )

        # NAICS code filtering
        naics_code = query_params.get('naics_code')
        if naics_code:
            filter_expression = add_filter(
                filter_expression,
                "begins_with(naics_code, :naics)",
                expression_attribute_names,
                expression_attribute_values,
                {},
                {":naics": naics_code}
            )

        # Set-aside filtering
        set_aside = query_params.get('set_aside')
        if set_aside:
            filter_expression = add_filter(
                filter_expression,
                "set_aside_code = :set_aside",
                expression_attribute_names,
                expression_attribute_values,
                {},
                {":set_aside": set_aside}
            )

        # Active status filtering (default to active only)
        active_only = query_params.get('active_only', 'true').lower() == 'true'
        if active_only:
            filter_expression = add_filter(
                filter_expression,
                "#active = :active",
                expression_attribute_names,
                expression_attribute_values,
                {"#active": "active"},
                {":active": "Active"}
            )

        # Response deadline filtering (only show unexpired)
        unexpired_only = query_params.get('unexpired_only', 'true').lower() == 'true'
        if unexpired_only:
            current_date = datetime.utcnow().strftime('%m/%d/%Y')
            filter_expression = add_filter(
                filter_expression,
                "response_deadline >= :current_date",
                expression_attribute_names,
                expression_attribute_values,
                {},
                {":current_date": current_date}
            )

        # Pagination
        page = int(query_params.get('page', '1'))
        limit = min(int(query_params.get('limit', '50')), 100)  # Max 100 per page

        # Scan with filters
        scan_kwargs = {
            'Limit': limit * page,  # Get more to handle pagination
        }

        if filter_expression:
            scan_kwargs['FilterExpression'] = filter_expression
            if expression_attribute_names:
                scan_kwargs['ExpressionAttributeNames'] = expression_attribute_names
            if expression_attribute_values:
                scan_kwargs['ExpressionAttributeValues'] = expression_attribute_values

        response = opportunities_table.scan(**scan_kwargs)
        items = response.get('Items', [])

        # Sort by posted date (most recent first)
        items.sort(key=lambda x: x.get('posted_date', ''), reverse=True)

        # Apply pagination
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_items = items[start_idx:end_idx]

        # Convert Decimal to float for JSON serialization
        paginated_items = json.loads(json.dumps(paginated_items, default=decimal_default))

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'opportunities': paginated_items,
                'pagination': {
                    'page': page,
                    'limit': limit,
                    'total': len(items),
                    'pages': (len(items) + limit - 1) // limit if items else 1
                },
                'filters_applied': {
                    'posted_after': posted_after,
                    'posted_before': posted_before,
                    'naics_code': naics_code,
                    'set_aside': set_aside,
                    'active_only': active_only,
                    'unexpired_only': unexpired_only
                }
            })
        }

    except Exception as e:
        logger.error(f"Error listing opportunities: {str(e)}")
        return create_error_response(500, 'LIST_OPPORTUNITIES_FAILED', 'Failed to list opportunities')

def handle_get_opportunity(company_id: str, notice_id: str) -> Dict[str, Any]:
    """Get specific opportunity details"""
    try:
        opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE_NAME)

        # Get opportunity by notice_id
        response = opportunities_table.query(
            KeyConditionExpression="notice_id = :notice_id",
            ExpressionAttributeValues={":notice_id": notice_id},
            ScanIndexForward=False,  # Get most recent version
            Limit=1
        )

        items = response.get('Items', [])
        if not items:
            return create_error_response(404, 'OPPORTUNITY_NOT_FOUND', 'Opportunity not found')

        opportunity = items[0]

        # Convert Decimal to float for JSON serialization
        opportunity = json.loads(json.dumps(opportunity, default=decimal_default))

        # Add computed fields
        opportunity['is_expired'] = is_opportunity_expired(opportunity.get('response_deadline'))
        opportunity['days_until_deadline'] = get_days_until_deadline(opportunity.get('response_deadline'))

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(opportunity)
        }

    except Exception as e:
        logger.error(f"Error getting opportunity: {str(e)}")
        return create_error_response(500, 'GET_OPPORTUNITY_FAILED', 'Failed to get opportunity')

def handle_get_opportunity_attachments(company_id: str, notice_id: str) -> Dict[str, Any]:
    """Get opportunity attachments with download URLs"""
    try:
        opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE_NAME)

        # Get opportunity
        response = opportunities_table.query(
            KeyConditionExpression="notice_id = :notice_id",
            ExpressionAttributeValues={":notice_id": notice_id},
            ScanIndexForward=False,
            Limit=1
        )

        items = response.get('Items', [])
        if not items:
            return create_error_response(404, 'OPPORTUNITY_NOT_FOUND', 'Opportunity not found')

        opportunity = items[0]
        attachments = opportunity.get('attachments', [])

        # Generate download URLs for attachments
        attachments_with_urls = []
        for attachment in attachments:
            attachment_data = dict(attachment)

            # Generate presigned URL for download
            s3_key = attachment.get('s3_key')
            if s3_key:
                try:
                    download_url = s3_client.generate_presigned_url(
                        'get_object',
                        Params={
                            'Bucket': RAW_DOCUMENTS_BUCKET,
                            'Key': s3_key
                        },
                        ExpiresIn=3600  # 1 hour
                    )
                    attachment_data['download_url'] = download_url
                    attachment_data['download_expires_at'] = (datetime.utcnow().timestamp() + 3600) * 1000
                except Exception as e:
                    logger.warning(f"Failed to generate download URL for attachment: {str(e)}")

            attachments_with_urls.append(attachment_data)

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'notice_id': notice_id,
                'attachments': attachments_with_urls,
                'total_attachments': len(attachments_with_urls)
            })
        }

    except Exception as e:
        logger.error(f"Error getting opportunity attachments: {str(e)}")
        return create_error_response(500, 'GET_ATTACHMENTS_FAILED', 'Failed to get opportunity attachments')

def add_filter(current_filter, new_condition, attr_names, attr_values, new_names, new_values):
    """Helper to build DynamoDB filter expressions"""
    attr_names.update(new_names)
    attr_values.update(new_values)

    if current_filter:
        return f"{current_filter} AND {new_condition}"
    return new_condition

def is_opportunity_expired(response_deadline: str) -> bool:
    """Check if opportunity response deadline has passed"""
    if not response_deadline:
        return False

    try:
        deadline = datetime.strptime(response_deadline, '%m/%d/%Y')
        return datetime.utcnow() > deadline
    except ValueError:
        return False

def get_days_until_deadline(response_deadline: str) -> int:
    """Get number of days until response deadline"""
    if not response_deadline:
        return -1

    try:
        deadline = datetime.strptime(response_deadline, '%m/%d/%Y')
        days = (deadline - datetime.utcnow()).days
        return max(days, 0)
    except ValueError:
        return -1

def get_company_id_from_token(event: Dict[str, Any]) -> str:
    """Extract company_id from JWT token in Authorization header"""
    try:
        # TODO: Implement proper JWT decoding
        return event.get('requestContext', {}).get('authorizer', {}).get('company_id')
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