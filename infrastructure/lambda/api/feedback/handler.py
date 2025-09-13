import json
import boto3
import os
from typing import Dict, Any
import logging
from datetime import datetime
import uuid
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')

FEEDBACK_TABLE_NAME = os.environ['FEEDBACK_TABLE_NAME']
MATCHES_TABLE_NAME = os.environ['MATCHES_TABLE_NAME']

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle feedback operations for the matching system.
    Supports: submit feedback, get feedback history
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
        if http_method == 'POST' and path_parameters.get('id') and path.endswith('/feedback'):
            # Submit feedback for a specific opportunity
            return handle_submit_opportunity_feedback(company_id, path_parameters['id'], body)
        elif http_method == 'POST' and not path_parameters.get('id'):
            # Submit general feedback
            return handle_submit_general_feedback(company_id, body)
        elif http_method == 'GET':
            # Get feedback history
            return handle_get_feedback_history(company_id, query_parameters)
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

    except Exception as e:
        logger.error(f"Feedback operations error: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_submit_opportunity_feedback(company_id: str, opportunity_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Submit feedback for a specific opportunity match"""
    try:
        rating = body.get('rating')  # 1-5 scale
        feedback_type = body.get('type', 'match_quality')  # match_quality, relevance, accuracy
        comments = body.get('comments', '')
        helpful = body.get('helpful')  # Boolean
        suggestions = body.get('suggestions', '')

        # Validate rating
        if rating is not None and (not isinstance(rating, int) or rating < 1 or rating > 5):
            return create_error_response(400, 'INVALID_RATING', 'Rating must be an integer between 1 and 5')

        # Validate feedback type
        valid_types = ['match_quality', 'relevance', 'accuracy', 'recommendation_quality', 'general']
        if feedback_type not in valid_types:
            return create_error_response(400, 'INVALID_FEEDBACK_TYPE',
                                       f'Feedback type must be one of: {", ".join(valid_types)}')

        feedback_table = dynamodb.Table(FEEDBACK_TABLE_NAME)

        # Create feedback record
        feedback_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + 'Z'

        feedback_item = {
            'feedback_id': feedback_id,
            'company_id': company_id,
            'opportunity_id': opportunity_id,
            'feedback_type': feedback_type,
            'timestamp': timestamp,
            'created_at': timestamp
        }

        if rating is not None:
            feedback_item['rating'] = rating

        if comments:
            feedback_item['comments'] = comments

        if helpful is not None:
            feedback_item['helpful'] = helpful

        if suggestions:
            feedback_item['suggestions'] = suggestions

        # Store feedback
        feedback_table.put_item(Item=feedback_item)

        # Update match record with feedback reference
        try:
            matches_table = dynamodb.Table(MATCHES_TABLE_NAME)
            matches_table.update_item(
                Key={
                    'company_id': company_id,
                    'opportunity_id': opportunity_id
                },
                UpdateExpression="SET feedback_provided = :feedback_provided, feedback_id = :feedback_id, updated_at = :updated_at",
                ExpressionAttributeValues={
                    ':feedback_provided': True,
                    ':feedback_id': feedback_id,
                    ':updated_at': timestamp
                }
            )
        except Exception as e:
            logger.warning(f"Failed to update match record with feedback: {str(e)}")

        # Trigger learning algorithm update
        trigger_feedback_learning(company_id, opportunity_id, feedback_item)

        return {
            'statusCode': 201,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Feedback submitted successfully',
                'feedback_id': feedback_id,
                'timestamp': timestamp
            })
        }

    except Exception as e:
        logger.error(f"Error submitting opportunity feedback: {str(e)}")
        return create_error_response(500, 'FEEDBACK_SUBMISSION_FAILED', 'Failed to submit feedback')

def handle_submit_general_feedback(company_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Submit general system feedback"""
    try:
        feedback_type = body.get('type', 'general')
        rating = body.get('rating')
        subject = body.get('subject', '')
        comments = body.get('comments', '')
        category = body.get('category', 'general')  # ui, performance, features, bugs, general

        # Validate category
        valid_categories = ['ui', 'performance', 'features', 'bugs', 'general', 'api', 'matching_algorithm']
        if category not in valid_categories:
            return create_error_response(400, 'INVALID_CATEGORY',
                                       f'Category must be one of: {", ".join(valid_categories)}')

        feedback_table = dynamodb.Table(FEEDBACK_TABLE_NAME)

        # Create feedback record
        feedback_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + 'Z'

        feedback_item = {
            'feedback_id': feedback_id,
            'company_id': company_id,
            'feedback_type': feedback_type,
            'category': category,
            'timestamp': timestamp,
            'created_at': timestamp
        }

        if rating is not None:
            feedback_item['rating'] = rating

        if subject:
            feedback_item['subject'] = subject

        if comments:
            feedback_item['comments'] = comments

        # Store feedback
        feedback_table.put_item(Item=feedback_item)

        return {
            'statusCode': 201,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'message': 'Feedback submitted successfully',
                'feedback_id': feedback_id,
                'timestamp': timestamp
            })
        }

    except Exception as e:
        logger.error(f"Error submitting general feedback: {str(e)}")
        return create_error_response(500, 'FEEDBACK_SUBMISSION_FAILED', 'Failed to submit feedback')

def handle_get_feedback_history(company_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """Get feedback history for a company"""
    try:
        feedback_table = dynamodb.Table(FEEDBACK_TABLE_NAME)

        # Build query parameters
        query_kwargs = {
            'IndexName': 'company-timestamp-index',
            'KeyConditionExpression': 'company_id = :company_id',
            'ExpressionAttributeValues': {':company_id': company_id},
            'ScanIndexForward': False  # Most recent first
        }

        # Filter by feedback type
        feedback_type = query_params.get('type')
        if feedback_type:
            query_kwargs['FilterExpression'] = 'feedback_type = :feedback_type'
            query_kwargs['ExpressionAttributeValues'][':feedback_type'] = feedback_type

        # Filter by category
        category = query_params.get('category')
        if category:
            if 'FilterExpression' in query_kwargs:
                query_kwargs['FilterExpression'] = query_kwargs['FilterExpression'] + ' AND category = :category'
            else:
                query_kwargs['FilterExpression'] = 'category = :category'
            query_kwargs['ExpressionAttributeValues'][':category'] = category

        # Execute query
        response = feedback_table.query(**query_kwargs)
        items = response.get('Items', [])

        # Apply pagination
        page = int(query_params.get('page', '1'))
        limit = min(int(query_params.get('limit', '50')), 100)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_items = items[start_idx:end_idx]

        # Convert Decimal to float for JSON serialization
        paginated_items = json.loads(json.dumps(paginated_items, default=decimal_default))

        # Calculate feedback statistics
        stats = calculate_feedback_stats(items)

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'feedback': paginated_items,
                'pagination': {
                    'page': page,
                    'limit': limit,
                    'total': len(items),
                    'pages': (len(items) + limit - 1) // limit if items else 1
                },
                'statistics': stats,
                'filters_applied': {
                    'type': feedback_type,
                    'category': category
                }
            })
        }

    except Exception as e:
        logger.error(f"Error getting feedback history: {str(e)}")
        return create_error_response(500, 'FEEDBACK_HISTORY_FAILED', 'Failed to get feedback history')

def calculate_feedback_stats(feedback_items: list) -> Dict[str, Any]:
    """Calculate feedback statistics"""
    if not feedback_items:
        return {
            'total_feedback': 0,
            'average_rating': 0.0,
            'by_type': {},
            'by_category': {},
            'helpful_percentage': 0.0
        }

    total_feedback = len(feedback_items)
    ratings = [item.get('rating') for item in feedback_items if item.get('rating') is not None]
    helpful_responses = [item.get('helpful') for item in feedback_items if item.get('helpful') is not None]

    # Count by type
    by_type = {}
    for item in feedback_items:
        feedback_type = item.get('feedback_type', 'unknown')
        by_type[feedback_type] = by_type.get(feedback_type, 0) + 1

    # Count by category
    by_category = {}
    for item in feedback_items:
        category = item.get('category', 'general')
        by_category[category] = by_category.get(category, 0) + 1

    return {
        'total_feedback': total_feedback,
        'average_rating': sum(ratings) / len(ratings) if ratings else 0.0,
        'rating_distribution': {i: ratings.count(i) for i in range(1, 6)} if ratings else {},
        'by_type': by_type,
        'by_category': by_category,
        'helpful_percentage': (sum(helpful_responses) / len(helpful_responses) * 100) if helpful_responses else 0.0
    }

def trigger_feedback_learning(company_id: str, opportunity_id: str, feedback_data: Dict):
    """Trigger learning algorithm update based on feedback"""
    try:
        # TODO: Send to feedback processing queue
        logger.info(f"Feedback learning triggered for company: {company_id}, opportunity: {opportunity_id}")
    except Exception as e:
        logger.warning(f"Failed to trigger feedback learning: {str(e)}")

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