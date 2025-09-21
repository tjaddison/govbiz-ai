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
MATCHES_TABLE_NAME = os.environ['MATCHES_TABLE']
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

        # Extract company_id from token for audit logging (optional for demo)
        company_id = get_company_id_from_token(event)
        if not company_id:
            # For demo purposes, allow anonymous access
            company_id = 'demo-user'

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
        logger.info(f"handle_list_opportunities called with company_id={company_id}, query_params={query_params}")
        opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE_NAME)

        # Match explanations are now stored separately and joined via match results table
        include_match_explanations = False

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

        # Search filtering (title, description, sol_number)
        search = query_params.get('search')
        if search:
            search_lower = search.lower()
            filter_expression = add_filter(
                filter_expression,
                "(contains(lower(title), :search) OR contains(lower(description), :search) OR contains(lower(sol_number), :search))",
                expression_attribute_names,
                expression_attribute_values,
                {},
                {":search": search_lower}
            )

        # Department filtering
        department = query_params.get('department')
        if department:
            filter_expression = add_filter(
                filter_expression,
                "#department = :department",
                expression_attribute_names,
                expression_attribute_values,
                {"#department": "department"},
                {":department": department}
            )

        # Active status filtering - DISABLED because active field is null in actual data
        # active_only = query_params.get('active_only', 'true').lower() == 'true'
        # if active_only:
        #     filter_expression = add_filter(
        #         filter_expression,
        #         "#active = :active",
        #         expression_attribute_names,
        #         expression_attribute_values,
        #         {"#active": "active"},
        #         {":active": "Active"}
        #     )

        # Response deadline filtering (only show unexpired) - DISABLED for now to get all data
        # Data has various date formats: "2025-09-19", "2025-09-15T12:00:00-04:00", need to handle properly
        # unexpired_only = query_params.get('unexpired_only', 'true').lower() == 'true'
        # if unexpired_only:
        #     current_date = datetime.utcnow().strftime('%Y-%m-%d')  # Changed to match actual format
        #     filter_expression = add_filter(
        #         filter_expression,
        #         "response_deadline >= :current_date",
        #         expression_attribute_names,
        #         expression_attribute_values,
        #         {},
        #         {":current_date": current_date}
        #     )

        # Pagination
        page = int(query_params.get('page', '1'))
        limit = min(int(query_params.get('limit', '50')), 100)  # Max 100 per page

        # Use efficient DynamoDB pagination with GSI or optimized scan
        scan_kwargs = {
            'Limit': limit * 3,  # Get a bit more to account for filtering
        }

        if filter_expression:
            scan_kwargs['FilterExpression'] = filter_expression
            if expression_attribute_names:
                scan_kwargs['ExpressionAttributeNames'] = expression_attribute_names
            if expression_attribute_values:
                scan_kwargs['ExpressionAttributeValues'] = expression_attribute_values

        # For pagination beyond page 1, we need to calculate skip
        items_to_skip = (page - 1) * limit
        items = []
        items_scanned = 0
        total_count_estimate = 0

        logger.info(f"DynamoDB scan kwargs: {scan_kwargs}")

        response = opportunities_table.scan(**scan_kwargs)

        # Process response and handle pagination
        while True:
            batch_items = response.get('Items', [])
            items_scanned += response.get('Count', 0)

            # Sort this batch by posted date (most recent first)
            def get_sort_date(item):
                date_str = item.get('posted_date', '')
                try:
                    return date_str.split(' ')[0] if date_str else '0000-00-00'
                except:
                    return '0000-00-00'

            batch_items.sort(key=get_sort_date, reverse=True)

            # Add items based on pagination
            for item in batch_items:
                if len(items) < items_to_skip:
                    # Skip items for previous pages
                    continue
                elif len(items) < items_to_skip + limit:
                    # Add items for current page
                    items.append(item)
                else:
                    # We have enough items for this page
                    break

            # Check if we have enough items or if there are more pages
            if len(items) >= items_to_skip + limit or 'LastEvaluatedKey' not in response:
                break

            # Continue scanning for more items
            scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
            response = opportunities_table.scan(**scan_kwargs)

            # Safety break to prevent infinite loops
            if items_scanned >= 10000:
                logger.warning(f"Hit safety limit of 10k scanned items, stopping at {items_scanned}")
                break

        # Get final paginated items (remove skipped items from our collection)
        paginated_items = items[items_to_skip:items_to_skip + limit] if len(items) > items_to_skip else []

        # Estimate total count
        total_count_estimate = max(items_scanned, len(items) + items_to_skip)

        # Get match explanations for these opportunities
        match_explanations = get_match_explanations_for_opportunities(company_id, [item.get('notice_id') for item in paginated_items])

        # Convert Decimal to float for JSON serialization and add computed fields
        processed_items = []
        for item in paginated_items:
            # Convert DynamoDB types
            opportunity = json.loads(json.dumps(item, default=decimal_default))

            # Add computed fields
            opportunity['is_expired'] = is_opportunity_expired(opportunity.get('response_deadline'))
            opportunity['days_until_deadline'] = get_days_until_deadline(opportunity.get('response_deadline'))

            # Ensure SAM.gov URL is properly formatted
            if 'sam_url' not in opportunity and opportunity.get('notice_id'):
                opportunity['sam_url'] = f"https://sam.gov/opp/{opportunity['notice_id']}"

            # Add match explanation if available
            notice_id = opportunity.get('notice_id')
            if notice_id in match_explanations:
                opportunity['match_explanation'] = match_explanations[notice_id]

            processed_items.append(opportunity)

        paginated_items = processed_items

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'success': True,
                'data': {
                    'items': paginated_items,
                    'totalCount': total_count_estimate,
                    'pageSize': limit,
                    'currentPage': page,
                    'totalPages': (total_count_estimate + limit - 1) // limit if total_count_estimate > 0 else 1
                },
                'message': f'Retrieved {len(paginated_items)} opportunities'
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
            'body': json.dumps({
                'success': True,
                'data': opportunity,
                'message': f'Retrieved opportunity {notice_id}'
            })
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
                'success': True,
                'data': attachments_with_urls,
                'message': f'Retrieved {len(attachments_with_urls)} attachments for opportunity {notice_id}'
            })
        }

    except Exception as e:
        logger.error(f"Error getting opportunity attachments: {str(e)}")
        return create_error_response(500, 'GET_ATTACHMENTS_FAILED', 'Failed to get opportunity attachments')

def get_match_explanations_for_opportunities(company_id: str, opportunity_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """Get match explanations for a list of opportunities from the matches table"""
    try:
        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)
        match_explanations = {}

        # Batch get items from matches table
        # DynamoDB batch_get_item supports up to 100 items per request
        for i in range(0, len(opportunity_ids), 100):
            batch_opportunity_ids = opportunity_ids[i:i+100]

            # Build request items
            request_items = []
            for opportunity_id in batch_opportunity_ids:
                if opportunity_id:  # Skip None/empty IDs
                    request_items.append({
                        'company_id': company_id,
                        'opportunity_id': opportunity_id
                    })

            if not request_items:
                continue

            # Execute batch get
            response = dynamodb.batch_get_item(
                RequestItems={
                    MATCHES_TABLE_NAME: {
                        'Keys': request_items
                    }
                }
            )

            # Process results
            items = response.get('Responses', {}).get(MATCHES_TABLE_NAME, [])
            for item in items:
                opportunity_id = item.get('opportunity_id')
                if opportunity_id:
                    # Convert DynamoDB types and extract match explanation fields
                    match_explanation = json.loads(json.dumps(item, default=decimal_default))
                    # Remove keys that aren't part of the match explanation
                    match_explanation.pop('company_id', None)
                    match_explanation.pop('opportunity_id', None)
                    match_explanations[opportunity_id] = match_explanation

        return match_explanations

    except Exception as e:
        logger.error(f"Error getting match explanations: {str(e)}")
        return {}

def add_filter(current_filter, new_condition, attr_names, attr_values, new_names, new_values):
    """Helper to build DynamoDB filter expressions"""
    attr_names.update(new_names)
    attr_values.update(new_values)

    if current_filter:
        return f"{current_filter} AND {new_condition}"
    return new_condition

def is_opportunity_expired(response_deadline: str) -> bool:
    """Check if opportunity response deadline has passed"""
    if not response_deadline or response_deadline.lower() in ['none', 'null', '']:
        return False

    try:
        # Try to parse different date formats
        if ' ' in response_deadline:
            # Format like "2025-09-08 16:42:36.686-04"
            date_part = response_deadline.split(' ')[0]
            deadline = datetime.strptime(date_part, '%Y-%m-%d')
        else:
            # Try original format
            deadline = datetime.strptime(response_deadline, '%m/%d/%Y')
        return datetime.utcnow() > deadline
    except ValueError:
        return False

def get_days_until_deadline(response_deadline: str) -> int:
    """Get number of days until response deadline"""
    if not response_deadline or response_deadline.lower() in ['none', 'null', '']:
        return -1

    try:
        # Try to parse different date formats
        if ' ' in response_deadline:
            # Format like "2025-09-08 16:42:36.686-04"
            date_part = response_deadline.split(' ')[0]
            deadline = datetime.strptime(date_part, '%Y-%m-%d')
        else:
            # Try original format
            deadline = datetime.strptime(response_deadline, '%m/%d/%Y')
        days = (deadline - datetime.utcnow()).days
        return max(days, 0)
    except ValueError:
        return -1

def get_company_id_from_token(event: Dict[str, Any]) -> str:
    """Extract company_id from JWT token in Authorization header"""
    try:
        # Check for company_id in request context from authorizer
        company_id = event.get('requestContext', {}).get('authorizer', {}).get('company_id')
        if company_id:
            return company_id

        # Check for company_id in custom attributes if available
        custom_attributes = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        if custom_attributes and 'custom:company_id' in custom_attributes:
            return custom_attributes['custom:company_id']

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
            'error': message,
            'message': message
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