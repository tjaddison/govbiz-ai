import json
import boto3
import os
from typing import Dict, Any, List
import logging
from datetime import datetime
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

MATCHES_TABLE_NAME = os.environ['MATCHES_TABLE']
COMPANIES_TABLE_NAME = os.environ['COMPANIES_TABLE']
OPPORTUNITIES_TABLE_NAME = os.environ['OPPORTUNITIES_TABLE']
MATCHING_ENGINE_FUNCTION_ARN = os.environ.get('MATCHING_ENGINE_FUNCTION_ARN')

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle matching operations and related endpoints.
    Supports: list matches, get match details, pursue opportunity, record outcome
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
        if http_method == 'GET' and not path_parameters.get('id'):
            # List matches
            return handle_list_matches(company_id, query_parameters)
        elif http_method == 'GET' and path_parameters.get('id') and not path.endswith('/pursue') and not path.endswith('/outcome'):
            # Get specific match
            return handle_get_match(company_id, path_parameters['id'])
        elif http_method == 'POST' and path_parameters.get('id') and path.endswith('/pursue'):
            # Record pursuit decision
            return handle_pursue_opportunity(company_id, path_parameters['id'], body)
        elif http_method == 'POST' and path_parameters.get('id') and path.endswith('/outcome'):
            # Record outcome
            return handle_record_outcome(company_id, path_parameters['id'], body)
        elif http_method == 'GET' and path.endswith('/stats'):
            # Get match statistics
            return handle_get_match_stats(company_id, query_parameters)
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

    except Exception as e:
        logger.error(f"Matching operations error: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_list_matches(company_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """List matches for a company with filtering and sorting"""
    try:
        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

        # Build query parameters
        query_kwargs = {
            'IndexName': 'company-confidence-index',  # GSI for company-based queries
            'KeyConditionExpression': 'company_id = :company_id',
            'ExpressionAttributeValues': {':company_id': company_id}
        }

        # Confidence level filtering
        confidence_level = query_params.get('confidence_level')
        if confidence_level and confidence_level.upper() in ['HIGH', 'MEDIUM', 'LOW']:
            query_kwargs['FilterExpression'] = 'confidence_level = :confidence'
            query_kwargs['ExpressionAttributeValues'][':confidence'] = confidence_level.upper()

        # Date range filtering
        posted_after = query_params.get('posted_after')
        if posted_after:
            if 'FilterExpression' in query_kwargs:
                query_kwargs['FilterExpression'] = query_kwargs['FilterExpression'] + ' AND posted_date >= :posted_after'
            else:
                query_kwargs['FilterExpression'] = 'posted_date >= :posted_after'
            query_kwargs['ExpressionAttributeValues'][':posted_after'] = posted_after

        # Pursuit status filtering
        pursued_only = query_params.get('pursued_only')
        if pursued_only:
            pursued_value = pursued_only.lower() == 'true'
            if 'FilterExpression' in query_kwargs:
                query_kwargs['FilterExpression'] = query_kwargs['FilterExpression'] + ' AND pursued = :pursued'
            else:
                query_kwargs['FilterExpression'] = 'pursued = :pursued'
            query_kwargs['ExpressionAttributeValues'][':pursued'] = pursued_value

        # Execute query
        response = matches_table.query(**query_kwargs)
        items = response.get('Items', [])

        # Sort by total score (highest first) or match timestamp (most recent first)
        sort_by = query_params.get('sort_by', 'total_score')
        if sort_by == 'total_score':
            items.sort(key=lambda x: float(x.get('total_score', 0)), reverse=True)
        elif sort_by == 'timestamp':
            items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        elif sort_by == 'posted_date':
            items.sort(key=lambda x: x.get('posted_date', ''), reverse=True)

        # Apply pagination
        page = int(query_params.get('page', '1'))
        limit = min(int(query_params.get('limit', '50')), 100)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_items = items[start_idx:end_idx]

        # Convert Decimal to float for JSON serialization
        paginated_items = json.loads(json.dumps(paginated_items, default=decimal_default))

        # Add summary statistics
        stats = calculate_match_stats(items)

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'matches': paginated_items,
                'pagination': {
                    'page': page,
                    'limit': limit,
                    'total': len(items),
                    'pages': (len(items) + limit - 1) // limit if items else 1
                },
                'statistics': stats,
                'filters_applied': {
                    'confidence_level': confidence_level,
                    'posted_after': posted_after,
                    'pursued_only': pursued_only,
                    'sort_by': sort_by
                }
            })
        }

    except Exception as e:
        logger.error(f"Error listing matches: {str(e)}")
        return create_error_response(500, 'LIST_MATCHES_FAILED', 'Failed to list matches')

def handle_get_match(company_id: str, match_id: str) -> Dict[str, Any]:
    """Get detailed information for a specific match"""
    try:
        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

        # Get match details
        response = matches_table.get_item(
            Key={
                'company_id': company_id,
                'opportunity_id': match_id
            }
        )

        if 'Item' not in response:
            return create_error_response(404, 'MATCH_NOT_FOUND', 'Match not found')

        match = response['Item']

        # Get detailed opportunity information
        opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE_NAME)
        opp_response = opportunities_table.query(
            KeyConditionExpression="notice_id = :notice_id",
            ExpressionAttributeValues={":notice_id": match['opportunity_id']},
            ScanIndexForward=False,
            Limit=1
        )

        opportunity_details = opp_response.get('Items', [{}])[0] if opp_response.get('Items') else {}

        # Combine match data with opportunity details
        detailed_match = dict(match)
        detailed_match['opportunity_details'] = opportunity_details

        # Convert Decimal to float for JSON serialization
        detailed_match = json.loads(json.dumps(detailed_match, default=decimal_default))

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(detailed_match)
        }

    except Exception as e:
        logger.error(f"Error getting match: {str(e)}")
        return create_error_response(500, 'GET_MATCH_FAILED', 'Failed to get match details')

def handle_pursue_opportunity(company_id: str, opportunity_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Record pursuit decision for an opportunity"""
    try:
        pursued = body.get('pursued', False)
        notes = body.get('notes', '')
        team_members = body.get('team_members', [])

        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

        # Update match record with pursuit information
        update_expression = "SET pursued = :pursued, pursuit_date = :pursuit_date, updated_at = :updated_at"
        expression_values = {
            ':pursued': pursued,
            ':pursuit_date': datetime.utcnow().isoformat() + 'Z',
            ':updated_at': datetime.utcnow().isoformat() + 'Z'
        }

        if notes:
            update_expression += ", notes = :notes"
            expression_values[':notes'] = notes

        if team_members:
            update_expression += ", team_members = :team_members"
            expression_values[':team_members'] = team_members

        response = matches_table.update_item(
            Key={
                'company_id': company_id,
                'opportunity_id': opportunity_id
            },
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values,
            ReturnValues="ALL_NEW"
        )

        updated_match = json.loads(json.dumps(response['Attributes'], default=decimal_default))

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Pursuit decision recorded successfully',
                'match': updated_match
            })
        }

    except Exception as e:
        logger.error(f"Error recording pursuit decision: {str(e)}")
        return create_error_response(500, 'PURSUE_FAILED', 'Failed to record pursuit decision')

def handle_record_outcome(company_id: str, opportunity_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Record the outcome of a pursued opportunity"""
    try:
        outcome = body.get('outcome')  # 'won', 'lost', 'no-decision'
        award_amount = body.get('award_amount')
        feedback_notes = body.get('feedback_notes', '')
        lessons_learned = body.get('lessons_learned', '')

        if not outcome or outcome not in ['won', 'lost', 'no-decision']:
            return create_error_response(400, 'INVALID_OUTCOME', 'outcome must be one of: won, lost, no-decision')

        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

        # Update match record with outcome
        update_expression = "SET outcome = :outcome, outcome_date = :outcome_date, updated_at = :updated_at"
        expression_values = {
            ':outcome': outcome,
            ':outcome_date': datetime.utcnow().isoformat() + 'Z',
            ':updated_at': datetime.utcnow().isoformat() + 'Z'
        }

        if award_amount is not None:
            update_expression += ", award_amount = :award_amount"
            expression_values[':award_amount'] = Decimal(str(award_amount))

        if feedback_notes:
            update_expression += ", feedback_notes = :feedback_notes"
            expression_values[':feedback_notes'] = feedback_notes

        if lessons_learned:
            update_expression += ", lessons_learned = :lessons_learned"
            expression_values[':lessons_learned'] = lessons_learned

        response = matches_table.update_item(
            Key={
                'company_id': company_id,
                'opportunity_id': opportunity_id
            },
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values,
            ReturnValues="ALL_NEW"
        )

        updated_match = json.loads(json.dumps(response['Attributes'], default=decimal_default))

        # TODO: Trigger learning algorithm update with this feedback
        trigger_learning_update(company_id, opportunity_id, outcome, updated_match)

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Outcome recorded successfully',
                'match': updated_match
            })
        }

    except Exception as e:
        logger.error(f"Error recording outcome: {str(e)}")
        return create_error_response(500, 'OUTCOME_FAILED', 'Failed to record outcome')

def handle_get_match_stats(company_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """Get matching statistics for a company"""
    try:
        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

        # Get all matches for the company
        response = matches_table.query(
            IndexName='company-confidence-index',
            KeyConditionExpression='company_id = :company_id',
            ExpressionAttributeValues={':company_id': company_id}
        )

        matches = response.get('Items', [])

        # Calculate comprehensive statistics
        stats = calculate_detailed_stats(matches)

        # Add time-based filtering if requested
        time_filter = query_params.get('time_period')  # '7d', '30d', '90d', '1y'
        if time_filter:
            filtered_matches = filter_matches_by_time(matches, time_filter)
            stats['filtered_period'] = {
                'period': time_filter,
                'stats': calculate_detailed_stats(filtered_matches)
            }

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(stats)
        }

    except Exception as e:
        logger.error(f"Error getting match stats: {str(e)}")
        return create_error_response(500, 'STATS_FAILED', 'Failed to get match statistics')

def calculate_match_stats(matches: List[Dict]) -> Dict[str, Any]:
    """Calculate basic match statistics"""
    if not matches:
        return {
            'total_matches': 0,
            'by_confidence': {'HIGH': 0, 'MEDIUM': 0, 'LOW': 0},
            'pursued_count': 0,
            'won_count': 0,
            'average_score': 0.0
        }

    total_matches = len(matches)
    confidence_counts = {'HIGH': 0, 'MEDIUM': 0, 'LOW': 0}
    pursued_count = 0
    won_count = 0
    total_score = 0.0

    for match in matches:
        confidence = match.get('confidence_level', 'LOW')
        confidence_counts[confidence] = confidence_counts.get(confidence, 0) + 1

        if match.get('pursued'):
            pursued_count += 1

        if match.get('outcome') == 'won':
            won_count += 1

        total_score += float(match.get('total_score', 0))

    return {
        'total_matches': total_matches,
        'by_confidence': confidence_counts,
        'pursued_count': pursued_count,
        'won_count': won_count,
        'average_score': total_score / total_matches if total_matches > 0 else 0.0
    }

def calculate_detailed_stats(matches: List[Dict]) -> Dict[str, Any]:
    """Calculate detailed statistics including win rates and performance metrics"""
    basic_stats = calculate_match_stats(matches)

    pursued_matches = [m for m in matches if m.get('pursued')]
    outcomes = [m.get('outcome') for m in pursued_matches if m.get('outcome')]

    win_rate = 0.0
    if pursued_matches:
        wins = len([m for m in pursued_matches if m.get('outcome') == 'won'])
        win_rate = wins / len(pursued_matches) if pursued_matches else 0.0

    # Win rate by confidence level
    win_rate_by_confidence = {}
    for confidence in ['HIGH', 'MEDIUM', 'LOW']:
        conf_matches = [m for m in pursued_matches if m.get('confidence_level') == confidence]
        conf_wins = [m for m in conf_matches if m.get('outcome') == 'won']
        win_rate_by_confidence[confidence] = len(conf_wins) / len(conf_matches) if conf_matches else 0.0

    return {
        **basic_stats,
        'win_rate': win_rate,
        'win_rate_by_confidence': win_rate_by_confidence,
        'total_award_amount': sum(float(m.get('award_amount', 0)) for m in matches if m.get('award_amount')),
        'pursuit_rate': len(pursued_matches) / len(matches) if matches else 0.0
    }

def filter_matches_by_time(matches: List[Dict], time_period: str) -> List[Dict]:
    """Filter matches by time period"""
    if not time_period:
        return matches

    days_map = {'7d': 7, '30d': 30, '90d': 90, '1y': 365}
    days = days_map.get(time_period, 30)

    cutoff_date = datetime.utcnow() - timedelta(days=days)
    cutoff_str = cutoff_date.isoformat() + 'Z'

    return [m for m in matches if m.get('timestamp', '') >= cutoff_str]

def trigger_learning_update(company_id: str, opportunity_id: str, outcome: str, match_data: Dict):
    """Trigger the learning algorithm to update based on feedback"""
    try:
        # TODO: Send to learning queue or invoke learning function
        logger.info(f"Learning update triggered for company: {company_id}, opportunity: {opportunity_id}, outcome: {outcome}")
    except Exception as e:
        logger.warning(f"Failed to trigger learning update: {str(e)}")

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