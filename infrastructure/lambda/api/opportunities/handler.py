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

        # Extract company_id from token - required for company-specific opportunity matching
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
    """List only opportunities that have matches for this company"""
    try:
        logger.info(f"handle_list_opportunities called with company_id={company_id}, query_params={query_params}")

        # First, get all matches for this company from the matches table
        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)
        opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE_NAME)

        # Build filter for matches table
        scan_kwargs = {
            'FilterExpression': 'company_id = :company_id',
            'ExpressionAttributeValues': {':company_id': company_id}
        }

        # Apply additional filters to matches
        confidence_filter = query_params.get('confidence_level')
        if confidence_filter and confidence_filter != 'ALL':
            scan_kwargs['FilterExpression'] += ' AND confidence_level = :confidence'
            scan_kwargs['ExpressionAttributeValues'][':confidence'] = confidence_filter.upper()

        min_score = query_params.get('min_score')
        if min_score:
            scan_kwargs['FilterExpression'] += ' AND total_score >= :min_score'
            scan_kwargs['ExpressionAttributeValues'][':min_score'] = Decimal(str(min_score))

        # Get all matches for this company
        logger.info(f"Querying matches table with: {scan_kwargs}")
        matches_response = matches_table.scan(**scan_kwargs)
        matches = matches_response.get('Items', [])

        # Continue scanning if there are more matches
        while 'LastEvaluatedKey' in matches_response:
            scan_kwargs['ExclusiveStartKey'] = matches_response['LastEvaluatedKey']
            matches_response = matches_table.scan(**scan_kwargs)
            matches.extend(matches_response.get('Items', []))

        logger.info(f"Found {len(matches)} matches for company {company_id}")

        if not matches:
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'success': True,
                    'data': {
                        'items': [],
                        'totalCount': 0,
                        'pageSize': int(query_params.get('pageSize', '50')),
                        'currentPage': int(query_params.get('page', '1')),
                        'totalPages': 0
                    },
                    'message': 'No matched opportunities found for this company'
                })
            }

        # Sort matches by score (highest first) then by created date
        matches.sort(key=lambda x: (float(x.get('total_score', 0)), x.get('created_at', '')), reverse=True)

        # Apply pagination to matches
        page = int(query_params.get('page', '1'))
        page_size = min(int(query_params.get('pageSize', '50')), 100)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_matches = matches[start_idx:end_idx]

        # Get opportunity details for the paginated matches
        opportunity_ids = [match.get('opportunity_id') for match in paginated_matches if match.get('opportunity_id')]

        # Batch get opportunity details
        opportunities_with_matches = []

        # Process in batches of 100 (DynamoDB batch_get_item limit)
        for i in range(0, len(opportunity_ids), 100):
            batch_ids = opportunity_ids[i:i+100]

            if not batch_ids:
                continue

            # Build batch get request
            request_items = []
            for opp_id in batch_ids:
                # Try to find the opportunity by notice_id (partition key)
                request_items.append({'notice_id': opp_id})

            if request_items:
                try:
                    batch_response = dynamodb.batch_get_item(
                        RequestItems={
                            OPPORTUNITIES_TABLE_NAME: {
                                'Keys': request_items
                            }
                        }
                    )

                    batch_opportunities = batch_response.get('Responses', {}).get(OPPORTUNITIES_TABLE_NAME, [])

                    # Create a map of opportunity_id to opportunity details
                    opp_map = {opp.get('notice_id'): opp for opp in batch_opportunities}

                    # Match opportunities with their match data
                    for match in paginated_matches[i:i+100]:
                        opportunity_id = match.get('opportunity_id')
                        if opportunity_id in opp_map:
                            opportunity = opp_map[opportunity_id]

                            # Convert DynamoDB types
                            opportunity = json.loads(json.dumps(opportunity, default=decimal_default))

                            # Add computed fields
                            opportunity['is_expired'] = is_opportunity_expired(opportunity.get('response_deadline'))
                            opportunity['days_until_deadline'] = get_days_until_deadline(opportunity.get('response_deadline'))

                            # Ensure SAM.gov URL is properly formatted
                            if 'sam_url' not in opportunity and opportunity.get('notice_id'):
                                opportunity['sam_url'] = f"https://sam.gov/opp/{opportunity['notice_id']}"

                            # Add match explanation from the match record
                            match_explanation = {
                                'total_score': float(match.get('total_score', 0)),
                                'confidence_level': match.get('confidence_level', 'LOW'),
                                'component_scores': {
                                    'semantic_similarity': float(match.get('component_scores', {}).get('semantic_similarity', 0)),
                                    'keyword_match': float(match.get('component_scores', {}).get('keyword_matching', 0)),
                                    'naics_alignment': float(match.get('component_scores', {}).get('naics_alignment', 0)),
                                    'past_performance': float(match.get('component_scores', {}).get('past_performance', 0)),
                                    'certification_bonus': float(match.get('component_scores', {}).get('certification_bonus', 0)),
                                    'geographic_match': float(match.get('component_scores', {}).get('geographic_match', 0)),
                                    'capacity_fit': float(match.get('component_scores', {}).get('capacity_fit', 0)),
                                    'recency_factor': float(match.get('component_scores', {}).get('recency_factor', 0))
                                },
                                'match_reasons': match.get('match_reasons', []),
                                'non_match_reasons': match.get('non_match_reasons', []),
                                'recommendations': match.get('recommendations', []),
                                'action_items': match.get('action_items', [])
                            }

                            opportunity['match_explanation'] = match_explanation
                            opportunity['match_id'] = match.get('match_id', f"{company_id}-{opportunity_id}")
                            opportunity['deep_analysis_url'] = f"/app/matches/{opportunity['match_id']}"

                            opportunities_with_matches.append(opportunity)

                except Exception as e:
                    logger.error(f"Error batch getting opportunities: {str(e)}")
                    continue

        # Apply additional opportunity-level filters if needed
        search = query_params.get('search')
        if search:
            search_lower = search.lower()
            filtered_opportunities = []
            for opp in opportunities_with_matches:
                title = opp.get('title', '').lower()
                description = opp.get('description', '').lower()
                sol_number = opp.get('sol_number', '').lower()

                if (search_lower in title or search_lower in description or search_lower in sol_number):
                    filtered_opportunities.append(opp)

            opportunities_with_matches = filtered_opportunities

        # Apply department filter
        department = query_params.get('department')
        if department and department != 'All Departments':
            opportunities_with_matches = [
                opp for opp in opportunities_with_matches
                if opp.get('department') == department
            ]

        # Apply NAICS filter
        naics_code = query_params.get('naics_code')
        if naics_code and naics_code != 'All NAICS':
            opportunities_with_matches = [
                opp for opp in opportunities_with_matches
                if opp.get('naics_code', '').startswith(naics_code)
            ]

        # Apply set-aside filter
        set_aside = query_params.get('set_aside')
        if set_aside and set_aside != 'All Types':
            opportunities_with_matches = [
                opp for opp in opportunities_with_matches
                if opp.get('set_aside') == set_aside or opp.get('set_aside_code') == set_aside
            ]

        # Calculate pagination info
        total_matched_count = len(matches)
        total_filtered_count = len(opportunities_with_matches)
        total_pages = (total_matched_count + page_size - 1) // page_size if total_matched_count > 0 else 1

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'success': True,
                'data': {
                    'items': opportunities_with_matches,
                    'totalCount': total_matched_count,  # Total matches available
                    'filteredCount': total_filtered_count,  # After additional filtering
                    'pageSize': page_size,
                    'currentPage': page,
                    'totalPages': total_pages
                },
                'message': f'Retrieved {len(opportunities_with_matches)} matched opportunities'
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