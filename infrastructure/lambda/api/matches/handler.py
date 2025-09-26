import json
import boto3
import os
from typing import Dict, Any, List
import logging
from datetime import datetime, timedelta
from decimal import Decimal
import uuid
import jwt

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')
stepfunctions_client = boto3.client('stepfunctions')

MATCHES_TABLE_NAME = os.environ['MATCHES_TABLE']
COMPANIES_TABLE_NAME = os.environ['COMPANIES_TABLE']
OPPORTUNITIES_TABLE_NAME = os.environ['OPPORTUNITIES_TABLE']
MATCHING_ENGINE_FUNCTION_ARN = os.environ.get('MATCHING_ENGINE_FUNCTION_ARN')
PROCESSING_STATE_MACHINE_ARN = os.environ.get('PROCESSING_STATE_MACHINE_ARN')

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
        elif http_method == 'GET' and path_parameters.get('id') and not path.endswith('/pursue') and not path.endswith('/outcome') and not path.endswith('/status'):
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
        elif http_method == 'POST' and path.endswith('/batch'):
            # Start batch matching
            return handle_batch_matching(company_id, body)
        elif http_method == 'GET' and '/batch/' in path and path.endswith('/status'):
            # Get batch status
            job_id = path_parameters.get('id')
            return handle_get_batch_status(company_id, job_id)
        elif http_method == 'POST' and path.endswith('/manual'):
            # Manual single match
            return handle_manual_match(company_id, body)
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

    except Exception as e:
        logger.error(f"Matching operations error: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_list_matches(company_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """List matches for a company with filtering and sorting"""
    try:
        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

        # Try to scan for all matches for this company (since we don't have proper indexes)
        scan_kwargs = {
            'FilterExpression': 'company_id = :company_id',
            'ExpressionAttributeValues': {':company_id': company_id}
        }

        # Parse filters from query params
        filters = query_params.get('filters')
        if filters:
            try:
                filters_obj = json.loads(filters)

                # Confidence level filtering
                confidence_levels = filters_obj.get('confidenceLevel', [])
                if confidence_levels:
                    conf_filter = ' OR '.join([f'confidence_level = :conf{i}' for i in range(len(confidence_levels))])
                    if 'FilterExpression' in scan_kwargs:
                        scan_kwargs['FilterExpression'] = scan_kwargs['FilterExpression'] + f' AND ({conf_filter})'
                    else:
                        scan_kwargs['FilterExpression'] = f'({conf_filter})'

                    for i, conf in enumerate(confidence_levels):
                        scan_kwargs['ExpressionAttributeValues'][f':conf{i}'] = conf.upper()

                # Score range filtering
                min_score = filters_obj.get('minScore')
                max_score = filters_obj.get('maxScore')
                if min_score is not None:
                    scan_kwargs['FilterExpression'] = scan_kwargs['FilterExpression'] + ' AND total_score >= :min_score'
                    scan_kwargs['ExpressionAttributeValues'][':min_score'] = Decimal(str(min_score))
                if max_score is not None:
                    scan_kwargs['FilterExpression'] = scan_kwargs['FilterExpression'] + ' AND total_score <= :max_score'
                    scan_kwargs['ExpressionAttributeValues'][':max_score'] = Decimal(str(max_score))

                # Pursued status filtering
                pursued = filters_obj.get('pursued')
                if pursued is not None:
                    if 'FilterExpression' in scan_kwargs:
                        scan_kwargs['FilterExpression'] = scan_kwargs['FilterExpression'] + ' AND pursued = :pursued'
                    else:
                        scan_kwargs['FilterExpression'] = 'pursued = :pursued'
                    scan_kwargs['ExpressionAttributeValues'][':pursued'] = pursued

            except json.JSONDecodeError:
                logger.warning(f"Invalid filters JSON: {filters}")

        # Execute scan
        response = matches_table.scan(**scan_kwargs)
        items = response.get('Items', [])

        # Parse sort options
        sort = query_params.get('sort')
        if sort:
            try:
                sort_obj = json.loads(sort)
                sort_field = sort_obj.get('field', 'total_score')
                sort_direction = sort_obj.get('direction', 'desc')
                reverse = sort_direction == 'desc'

                if sort_field == 'total_score':
                    items.sort(key=lambda x: float(x.get('total_score', 0)), reverse=reverse)
                elif sort_field == 'created_at':
                    items.sort(key=lambda x: x.get('created_at', ''), reverse=reverse)
                elif sort_field == 'confidence_level':
                    conf_order = {'HIGH': 3, 'MEDIUM': 2, 'LOW': 1}
                    items.sort(key=lambda x: conf_order.get(x.get('confidence_level', 'LOW'), 1), reverse=reverse)
            except json.JSONDecodeError:
                # Default sort by total_score desc
                items.sort(key=lambda x: float(x.get('total_score', 0)), reverse=True)
        else:
            # Default sort by total_score desc
            items.sort(key=lambda x: float(x.get('total_score', 0)), reverse=True)

        # Apply pagination
        page = int(query_params.get('page', '1'))
        pageSize = int(query_params.get('pageSize', '10'))
        start_idx = (page - 1) * pageSize
        end_idx = start_idx + pageSize
        paginated_items = items[start_idx:end_idx]

        # Transform to match frontend expected format and enrich with opportunity details
        transformed_items = []
        for item in paginated_items:
            # Generate a match_id if not present
            match_id = item.get('match_id') or f"{item.get('company_id', '')}-{item.get('opportunity_id', '')}"

            # Get opportunity details
            opportunity_details = get_opportunity_details(item.get('opportunity_id', ''))

            transformed_match = {
                'match_id': match_id,
                'opportunity_id': item.get('opportunity_id', ''),
                'company_id': item.get('company_id', ''),
                'tenant_id': item.get('tenant_id'),
                'total_score': float(item.get('total_score', 0)),
                'confidence_level': item.get('confidence_level', 'LOW'),
                'component_scores': extract_component_scores(item.get('component_scores', {})),
                'match_reasons': item.get('match_reasons', []),
                'recommendations': item.get('recommendations', []),
                'action_items': item.get('action_items', []),
                'created_at': item.get('created_at') or item.get('timestamp', datetime.utcnow().isoformat() + 'Z'),
                'updated_at': item.get('updated_at') or item.get('timestamp', datetime.utcnow().isoformat() + 'Z'),
                'user_feedback': {
                    'pursued': item.get('pursued', False),
                    'outcome': item.get('outcome'),
                    'quality_rating': item.get('quality_rating'),
                    'comments': item.get('feedback_notes')
                } if item.get('pursued') is not None else None
            }

            # Add opportunity details if found
            if opportunity_details:
                transformed_match['opportunity'] = opportunity_details

            transformed_items.append(transformed_match)

        # Calculate total count for pagination
        totalCount = len(items)
        totalPages = (totalCount + pageSize - 1) // pageSize if totalCount > 0 else 1

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'success': True,
                'data': {
                    'items': transformed_items,
                    'totalCount': totalCount,
                    'pageSize': pageSize,
                    'currentPage': page,
                    'totalPages': totalPages
                }
            }, default=decimal_default)
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

        # Get opportunity details using the same method as list matches
        opportunity_details = get_opportunity_details(match.get('opportunity_id', ''))

        # Combine match data with opportunity details
        detailed_match = dict(match)
        if opportunity_details:
            detailed_match['opportunity'] = opportunity_details

        # Convert Decimal to float for JSON serialization
        detailed_match = json.loads(json.dumps(detailed_match, default=decimal_default))

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(detailed_match, default=decimal_default)
        }

    except Exception as e:
        logger.error(f"Error getting match: {str(e)}")
        return create_error_response(500, 'GET_MATCH_FAILED', 'Failed to get match details')

def handle_pursue_opportunity(company_id: str, opportunity_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Record pursuit decision for an opportunity"""
    try:
        pursued = body.get('pursued', True)  # Default to True when pursue endpoint is called
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
                'success': True,
                'data': {
                    'message': 'Pursuit decision recorded successfully',
                    'match': updated_match
                }
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

        # Scan for all matches for this company
        response = matches_table.scan(
            FilterExpression='company_id = :company_id',
            ExpressionAttributeValues={':company_id': company_id}
        )

        matches = response.get('Items', [])

        # Calculate comprehensive statistics
        stats = calculate_detailed_stats(matches)

        # Transform stats to match frontend Analytics interface
        analytics_response = {
            'totalMatches': stats.get('total_matches', 0),
            'highConfidenceMatches': stats.get('by_confidence', {}).get('HIGH', 0),
            'mediumConfidenceMatches': stats.get('by_confidence', {}).get('MEDIUM', 0),
            'lowConfidenceMatches': stats.get('by_confidence', {}).get('LOW', 0),
            'pursuedOpportunities': stats.get('pursued_count', 0),
            'wonOpportunities': stats.get('won_count', 0),
            'winRate': round(stats.get('win_rate', 0) * 100, 1),  # Convert to percentage
            'avgMatchScore': round(stats.get('average_score', 0), 3)
        }

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'success': True,
                'data': analytics_response
            }, default=decimal_default)
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

        # JWT already imported at module level

        # Decode JWT token without verification to get claims (API Gateway already verified it)
        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        logger.info(f"Unverified token payload: {json.dumps(unverified_payload, default=str)}")

        # Use sub (Cognito user ID) as company_id since custom attributes can't be added to existing pools
        company_id = unverified_payload.get('sub')

        if company_id:
            logger.info(f"Successfully extracted company_id from token: {company_id}")
            return company_id
        else:
            logger.error("No sub found in token payload")
            return None

    except Exception as e:
        logger.error(f"Error extracting company_id: {str(e)}")
        return None

def extract_component_scores(component_scores: Dict) -> Dict[str, float]:
    """Extract actual float scores from nested component score structure"""
    try:
        def get_score_value(component_data):
            if isinstance(component_data, (int, float)):
                return float(component_data)
            elif isinstance(component_data, Decimal):
                return float(component_data)
            elif isinstance(component_data, dict):
                # Try different score field names that might exist
                for score_field in ['overall_score', 'score', 'weighted_average_similarity', 'primary_alignment']:
                    if score_field in component_data:
                        score_val = component_data[score_field]
                        if isinstance(score_val, dict) and 'score' in score_val:
                            # Handle nested score structures
                            return float(score_val.get('score', 0))
                        elif isinstance(score_val, (int, float, Decimal)):
                            return float(score_val)
                # If no specific score field found, return 0
                return 0.0
            else:
                return 0.0

        result = {}
        component_mapping = {
            'semantic_similarity': 'semantic_similarity',
            'keyword_matching': 'keyword_match',
            'naics_alignment': 'naics_alignment',
            'past_performance': 'past_performance',
            'certification_bonus': 'certification_bonus',
            'geographic_match': 'geographic_match',
            'capacity_fit': 'capacity_fit',
            'recency_factor': 'recency_factor'
        }

        for db_key, api_key in component_mapping.items():
            component_data = component_scores.get(db_key, {})
            result[api_key] = get_score_value(component_data)

        return result

    except Exception as e:
        logger.warning(f"Error extracting component scores: {str(e)}, falling back to zeros")
        # Return default scores if extraction fails
        return {
            'semantic_similarity': 0.0,
            'keyword_match': 0.0,
            'naics_alignment': 0.0,
            'past_performance': 0.0,
            'certification_bonus': 0.0,
            'geographic_match': 0.0,
            'capacity_fit': 0.0,
            'recency_factor': 0.0
        }

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

def handle_batch_matching(company_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Start batch matching process for a company"""
    try:
        logger.info(f"🚀 [BATCH_START] Starting batch matching for company: {company_id}")

        # Extract batch options
        opportunity_filters = body.get('opportunity_filters', {})
        force_refresh = body.get('force_refresh', False)
        batch_size = body.get('batch_size', 100)

        # Generate a unique job ID
        job_id = str(uuid.uuid4())
        logger.info(f"🔧 [BATCH_SETUP] Generated job ID: {job_id}")

        # Get company profile info for validation
        company_info = get_company_profile_info(company_id)
        logger.info(f"👤 [COMPANY_INFO] Company profile found: {company_info.get('company_name', 'Unknown')} with {len(company_info.get('documents', []))} documents")

        # Get current opportunities count
        opportunities_count = get_total_opportunities_count()
        logger.info(f"🎯 [OPPORTUNITIES] Found {opportunities_count} total opportunities to process")

        # Clear old matches before generating new ones to ensure fresh results
        cleared_count = clear_old_matches(company_id)
        logger.info(f"🧹 [CLEANUP] Cleared {cleared_count} old matches")

        # Prepare execution input for Step Functions
        execution_input = {
            'company_id': company_id,
            'job_id': job_id,
            'processing_type': 'batch_matching',
            'batch_size': batch_size,
            'force_refresh': force_refresh,
            'opportunity_filters': opportunity_filters,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'company_profile': company_info,  # Include profile for processing
            'total_opportunities': opportunities_count
        }

        # Start Step Functions execution
        if PROCESSING_STATE_MACHINE_ARN:
            try:
                logger.info(f"⚙️ [STEP_FUNCTIONS] Using state machine: {PROCESSING_STATE_MACHINE_ARN}")

                # Truncate execution name to meet 80 character limit
                execution_name = f"batch-{company_id[:8]}-{job_id[:8]}"
                logger.info(f"📝 [EXECUTION] Starting execution with name: {execution_name}")

                response = stepfunctions_client.start_execution(
                    stateMachineArn=PROCESSING_STATE_MACHINE_ARN,
                    name=execution_name,
                    input=json.dumps(execution_input, default=decimal_default)
                )

                execution_arn = response['executionArn']
                logger.info(f"✅ [SUCCESS] Started batch matching execution: {execution_arn}")
                logger.info(f"📊 [METRICS] Processing {opportunities_count} opportunities against company profile with {len(company_info.get('documents', []))} documents")

                # Store job info in DynamoDB for tracking
                store_batch_job_info(company_id, job_id, execution_arn, execution_input)

                return {
                    'statusCode': 200,
                    'headers': get_cors_headers(),
                    'body': json.dumps({
                        'success': True,
                        'data': {
                            'job_id': job_id,
                            'message': f'Batch matching started successfully - processing {opportunities_count} opportunities',
                            'estimated_time': '5-15 minutes',
                            'execution_arn': execution_arn,
                            'opportunities_count': opportunities_count,
                            'company_documents': len(company_info.get('documents', [])),
                            'old_matches_cleared': cleared_count
                        }
                    })
                }

            except Exception as sf_error:
                logger.error(f"❌ [ERROR] Step Functions execution failed: {str(sf_error)}")
                return create_error_response(500, 'STEP_FUNCTIONS_ERROR', f'Failed to start batch processing: {str(sf_error)}')
        else:
            # Step Functions is required for batch processing
            logger.error("❌ [ERROR] PROCESSING_STATE_MACHINE_ARN not configured")
            return create_error_response(501, 'BATCH_PROCESSING_NOT_CONFIGURED', 'Batch processing Step Functions not configured')

    except Exception as e:
        logger.error(f"💥 [FATAL_ERROR] Error starting batch matching: {str(e)}")
        return create_error_response(500, 'BATCH_MATCHING_FAILED', 'Failed to start batch matching')

def handle_get_batch_status(company_id: str, job_id: str) -> Dict[str, Any]:
    """Get status of a batch matching job"""
    try:
        logger.info(f"📊 [STATUS_CHECK] Checking batch status for company: {company_id}, job: {job_id}")

        # Try to get job info from DynamoDB
        job_info = get_batch_job_info(company_id, job_id)

        if not job_info:
            logger.warning(f"❌ [JOB_NOT_FOUND] Job not found: {job_id}")
            return create_error_response(404, 'JOB_NOT_FOUND', 'Batch job not found')

        logger.info(f"✅ [JOB_FOUND] Job info retrieved for {job_id}")

        # Get current match count for this company
        current_matches = get_current_match_count(company_id)
        logger.info(f"📈 [CURRENT_MATCHES] Company currently has {current_matches} matches")

        # If we have an execution ARN, check Step Functions status
        execution_arn = job_info.get('execution_arn')
        if execution_arn:
            try:
                logger.info(f"🔍 [CHECKING_EXECUTION] Checking Step Functions execution: {execution_arn}")

                response = stepfunctions_client.describe_execution(
                    executionArn=execution_arn
                )

                status = response['status']  # RUNNING, SUCCEEDED, FAILED, TIMED_OUT, ABORTED
                logger.info(f"📝 [EXECUTION_STATUS] Step Functions status: {status}")

                # Map Step Functions status to our status
                status_mapping = {
                    'RUNNING': 'running',
                    'SUCCEEDED': 'completed',
                    'FAILED': 'failed',
                    'TIMED_OUT': 'failed',
                    'ABORTED': 'failed'
                }

                mapped_status = status_mapping.get(status, 'unknown')

                # Try to parse output for progress info
                progress_info = {
                    'current_matches': current_matches,
                    'execution_status': status
                }

                if status == 'SUCCEEDED' and 'output' in response:
                    try:
                        output = json.loads(response['output'])
                        progress_info.update({
                            'processed_count': output.get('processed_count', 0),
                            'total_count': output.get('total_count', 0),
                            'matches_found': output.get('matches_found', 0)
                        })
                        logger.info(f"🏁 [EXECUTION_COMPLETE] Processed: {progress_info.get('processed_count', 0)}, Matches: {progress_info.get('matches_found', 0)}")
                    except Exception as parse_error:
                        logger.warning(f"⚠️ [PARSE_WARNING] Could not parse execution output: {str(parse_error)}")
                        pass

                # Check if we have errors
                if status == 'FAILED' and 'error' in response:
                    logger.error(f"❌ [EXECUTION_FAILED] Execution failed with error: {response.get('error', 'Unknown error')}")
                    progress_info['error'] = response.get('error')
                    progress_info['cause'] = response.get('cause', 'Unknown cause')

                return {
                    'statusCode': 200,
                    'headers': get_cors_headers(),
                    'body': json.dumps({
                        'success': True,
                        'data': {
                            'status': mapped_status,
                            'job_id': job_id,
                            'started_at': job_info.get('started_at'),
                            'execution_arn': execution_arn,
                            **progress_info
                        }
                    })
                }

            except Exception as sf_error:
                logger.error(f"❌ [SF_ERROR] Failed to check Step Functions status: {str(sf_error)}")
                # Return job info without Step Functions status
                pass

        # Job not found or invalid
        logger.error(f"❌ [ERROR] Batch job {job_id} not found or invalid")
        return create_error_response(404, 'BATCH_JOB_NOT_FOUND', f'Batch job {job_id} not found')

    except Exception as e:
        logger.error(f"💥 [STATUS_ERROR] Error getting batch status: {str(e)}")
        return create_error_response(500, 'BATCH_STATUS_FAILED', 'Failed to get batch status')


def get_current_match_count(company_id: str) -> int:
    """Get the current number of matches for a company"""
    try:
        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

        response = matches_table.scan(
            FilterExpression='company_id = :company_id',
            ExpressionAttributeValues={':company_id': company_id},
            Select='COUNT'
        )

        count = response.get('Count', 0)
        logger.info(f"📊 [MATCH_COUNT] Company {company_id} has {count} current matches")
        return count

    except Exception as e:
        logger.error(f"❌ [COUNT_ERROR] Error counting matches for {company_id}: {str(e)}")
        return 0

def handle_manual_match(company_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Trigger manual matching for a single opportunity"""
    try:
        opportunity_id = body.get('opportunity_id')
        if not opportunity_id:
            return create_error_response(400, 'MISSING_OPPORTUNITY_ID', 'opportunity_id is required')

        # Invoke the actual matching engine for this specific opportunity
        if MATCHING_ENGINE_FUNCTION_ARN:
            try:
                # Call the matching engine Lambda function
                response = lambda_client.invoke(
                    FunctionName=MATCHING_ENGINE_FUNCTION_ARN,
                    InvocationType='RequestResponse',
                    Payload=json.dumps({
                        'company_id': company_id,
                        'opportunity_id': opportunity_id,
                        'manual_trigger': True
                    })
                )

                result = json.loads(response['Payload'].read())

                if result.get('statusCode') == 200:
                    match_data = json.loads(result['body'])
                    return {
                        'statusCode': 200,
                        'headers': get_cors_headers(),
                        'body': json.dumps({
                            'success': True,
                            'data': match_data.get('data', {})
                        })
                    }
                else:
                    return create_error_response(500, 'MATCHING_ENGINE_ERROR', 'Matching engine returned an error')

            except Exception as engine_error:
                logger.error(f"Error calling matching engine: {str(engine_error)}")
                return create_error_response(500, 'MATCHING_ENGINE_FAILED', 'Failed to invoke matching engine')
        else:
            return create_error_response(501, 'MATCHING_ENGINE_NOT_CONFIGURED', 'Matching engine is not configured')

    except Exception as e:
        logger.error(f"Error in manual matching: {str(e)}")
        return create_error_response(500, 'MANUAL_MATCH_FAILED', 'Failed to perform manual match')

def store_batch_job_info(company_id: str, job_id: str, execution_arn: str, execution_input: Dict) -> None:
    """Store batch job information in DynamoDB"""
    try:
        # We'll use the matches table with a special prefix for batch jobs
        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

        matches_table.put_item(
            Item={
                'company_id': f"BATCH_JOB#{company_id}",
                'opportunity_id': job_id,
                'job_type': 'batch_matching',
                'execution_arn': execution_arn,
                'execution_input': execution_input,
                'started_at': datetime.utcnow().isoformat() + 'Z',
                'status': 'running'
            }
        )

    except Exception as e:
        logger.warning(f"Failed to store batch job info: {str(e)}")

def get_batch_job_info(company_id: str, job_id: str) -> Dict[str, Any]:
    """Retrieve batch job information from DynamoDB"""
    try:
        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

        response = matches_table.get_item(
            Key={
                'company_id': f"BATCH_JOB#{company_id}",
                'opportunity_id': job_id
            }
        )

        return response.get('Item', {})

    except Exception as e:
        logger.warning(f"Failed to get batch job info: {str(e)}")
        return {}

def get_opportunity_details(opportunity_id: str) -> Dict[str, Any]:
    """Get opportunity details from DynamoDB using notice_id query since table has composite key"""
    if not opportunity_id:
        return None

    try:
        opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE_NAME)

        # Since the table has a composite key (notice_id, posted_date), we need to query instead of get_item
        response = opportunities_table.query(
            KeyConditionExpression='notice_id = :notice_id',
            ExpressionAttributeValues={':notice_id': opportunity_id},
            Limit=1  # Get the most recent if multiple exist
        )

        items = response.get('Items', [])
        if not items:
            logger.warning(f"Opportunity not found: {opportunity_id}")
            return None

        opportunity = items[0]  # Get first (most recent) item

        # Extract and transform opportunity details to match frontend expectations
        # Using the actual field names from DynamoDB (lowercase)
        return {
            'title': opportunity.get('title', ''),
            'description': opportunity.get('description', ''),
            'department': opportunity.get('department', ''),
            'sub_tier': opportunity.get('sub_tier', ''),
            'office': opportunity.get('office', ''),
            'response_deadline': opportunity.get('response_deadline', ''),
            'posted_date': opportunity.get('posted_date', ''),
            'set_aside': opportunity.get('set_aside', ''),
            'set_aside_code': opportunity.get('set_aside_code', ''),
            'naics_code': opportunity.get('naics_code', ''),
            'type': opportunity.get('notice_type', ''),
            'award_amount': opportunity.get('award_amount', ''),
            'sam_gov_link': opportunity.get('link', f"https://sam.gov/opp/{opportunity_id}"),
            'pop_city': opportunity.get('pop_city', ''),
            'pop_state': opportunity.get('pop_state', '')
        }

    except Exception as e:
        logger.error(f"Error fetching opportunity details for {opportunity_id}: {str(e)}")
        return None


def clear_old_matches(company_id: str) -> int:
    """Clear old match results for a company before generating new ones"""
    try:
        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

        logger.info(f"🧹 [CLEANUP] Clearing old matches for company: {company_id}")

        # Scan for all matches for this company
        response = matches_table.scan(
            FilterExpression='company_id = :company_id',
            ExpressionAttributeValues={':company_id': company_id}
        )

        matches = response.get('Items', [])
        deleted_count = 0

        # Delete matches in batches to avoid throttling
        for match in matches:
            # Skip batch job records (they have different structure)
            if match.get('company_id', '').startswith('BATCH_JOB#'):
                continue

            try:
                matches_table.delete_item(
                    Key={
                        'company_id': match['company_id'],
                        'opportunity_id': match['opportunity_id']
                    }
                )
                deleted_count += 1
            except Exception as delete_error:
                logger.warning(f"⚠️ [DELETE_WARNING] Failed to delete match {match.get('opportunity_id')}: {str(delete_error)}")

        logger.info(f"✅ [CLEANUP_SUCCESS] Successfully cleared {deleted_count} old matches for company: {company_id}")
        return deleted_count

    except Exception as e:
        logger.error(f"❌ [CLEANUP_ERROR] Error clearing old matches for company {company_id}: {str(e)}")
        return 0  # Return 0 if cleanup fails


def get_company_profile_info(company_id: str) -> Dict[str, Any]:
    """Get comprehensive company profile information for batch processing"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)

        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            logger.warning(f"⚠️ [COMPANY_WARNING] Company profile not found: {company_id}")
            return {'company_id': company_id, 'documents': [], 'company_name': 'Unknown'}

        company_profile = response['Item']
        documents = company_profile.get('documents', [])

        # Count documents by status
        uploaded_docs = [doc for doc in documents if doc.get('status') == 'uploaded']
        processed_docs = [doc for doc in documents if doc.get('status') == 'processed']

        profile_info = {
            'company_id': company_id,
            'company_name': company_profile.get('company_name', 'Unknown'),
            'capability_statement': company_profile.get('capability_statement', ''),
            'naics_codes': company_profile.get('naics_codes', []),
            'certifications': company_profile.get('certifications', []),
            'documents': documents,
            'uploaded_documents_count': len(uploaded_docs),
            'processed_documents_count': len(processed_docs),
            'total_documents': len(documents),
            'past_performance': company_profile.get('past_performance', []),
            'revenue_range': company_profile.get('revenue_range', ''),
            'employee_count': company_profile.get('employee_count', ''),
            'locations': company_profile.get('locations', [])
        }

        logger.info(f"📋 [PROFILE_INFO] Company: {profile_info['company_name']}, Documents: {len(documents)}, NAICS: {len(profile_info['naics_codes'])}")

        return profile_info

    except Exception as e:
        logger.error(f"❌ [PROFILE_ERROR] Error getting company profile {company_id}: {str(e)}")
        return {'company_id': company_id, 'documents': [], 'company_name': 'Unknown'}


def get_total_opportunities_count() -> int:
    """Get the total number of opportunities available for matching"""
    try:
        opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE_NAME)

        # Count all opportunities in the database
        response = opportunities_table.scan(
            Select='COUNT',
            FilterExpression='attribute_exists(notice_id)'
        )

        count = response.get('Count', 0)
        logger.info(f"📊 [OPPORTUNITIES_COUNT] Found {count} total opportunities in database")

        return count

    except Exception as e:
        logger.error(f"❌ [COUNT_ERROR] Error counting opportunities: {str(e)}")
        return 0

def get_cors_headers() -> Dict[str, str]:
    """Get CORS headers for API responses"""
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }