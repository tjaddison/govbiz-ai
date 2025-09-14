import json
import boto3
import os
from typing import Dict, Any, List
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from collections import defaultdict

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')

MATCHES_TABLE_NAME = os.environ['MATCHES_TABLE']
FEEDBACK_TABLE_NAME = os.environ['FEEDBACK_TABLE']
OPPORTUNITIES_TABLE_NAME = os.environ['OPPORTUNITIES_TABLE']

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle analytics and reporting endpoints.
    Supports: dashboard data, performance metrics, trend analysis
    """
    try:
        http_method = event.get('httpMethod', '')
        path = event.get('path', '')
        query_parameters = event.get('queryStringParameters') or {}

        # Extract company_id from token
        company_id = get_company_id_from_token(event)
        if not company_id:
            return create_error_response(401, 'UNAUTHORIZED', 'Invalid or missing authentication token')

        # Route based on path
        if path.endswith('/dashboard'):
            return handle_get_dashboard_data(company_id, query_parameters)
        elif path.endswith('/performance'):
            return handle_get_performance_metrics(company_id, query_parameters)
        elif path.endswith('/trends'):
            return handle_get_trend_analysis(company_id, query_parameters)
        else:
            return create_error_response(404, 'ENDPOINT_NOT_FOUND', 'Analytics endpoint not found')

    except Exception as e:
        logger.error(f"Analytics error: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_get_dashboard_data(company_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """Get comprehensive dashboard data"""
    try:
        time_period = query_params.get('period', '30d')  # 7d, 30d, 90d, 1y

        # Get time range
        start_date, end_date = get_time_range(time_period)

        # Fetch all relevant data
        matches_data = get_matches_data(company_id, start_date, end_date)
        feedback_data = get_feedback_data(company_id, start_date, end_date)

        # Calculate dashboard metrics
        dashboard_data = {
            'time_period': time_period,
            'date_range': {
                'start': start_date.isoformat() + 'Z',
                'end': end_date.isoformat() + 'Z'
            },
            'overview': calculate_overview_metrics(matches_data),
            'match_quality': calculate_match_quality_metrics(matches_data, feedback_data),
            'pursuit_analysis': calculate_pursuit_analysis(matches_data),
            'win_loss_analysis': calculate_win_loss_analysis(matches_data),
            'recent_activity': get_recent_activity(matches_data, limit=10),
            'top_opportunities': get_top_opportunities(matches_data, limit=5),
            'feedback_summary': calculate_feedback_summary(feedback_data)
        }

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(dashboard_data, default=decimal_default)
        }

    except Exception as e:
        logger.error(f"Error getting dashboard data: {str(e)}")
        return create_error_response(500, 'DASHBOARD_DATA_FAILED', 'Failed to get dashboard data')

def handle_get_performance_metrics(company_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """Get detailed performance metrics"""
    try:
        time_period = query_params.get('period', '90d')

        start_date, end_date = get_time_range(time_period)
        matches_data = get_matches_data(company_id, start_date, end_date)

        # Calculate detailed performance metrics
        performance_data = {
            'time_period': time_period,
            'algorithm_performance': calculate_algorithm_performance(matches_data),
            'confidence_level_analysis': calculate_confidence_analysis(matches_data),
            'component_score_analysis': calculate_component_analysis(matches_data),
            'win_rate_trends': calculate_win_rate_trends(matches_data),
            'roi_analysis': calculate_roi_analysis(matches_data),
            'recommendation_effectiveness': calculate_recommendation_effectiveness(matches_data)
        }

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(performance_data, default=decimal_default)
        }

    except Exception as e:
        logger.error(f"Error getting performance metrics: {str(e)}")
        return create_error_response(500, 'PERFORMANCE_METRICS_FAILED', 'Failed to get performance metrics')

def handle_get_trend_analysis(company_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """Get trend analysis data"""
    try:
        time_period = query_params.get('period', '1y')
        granularity = query_params.get('granularity', 'weekly')  # daily, weekly, monthly

        start_date, end_date = get_time_range(time_period)
        matches_data = get_matches_data(company_id, start_date, end_date)

        # Calculate trend data
        trend_data = {
            'time_period': time_period,
            'granularity': granularity,
            'match_volume_trend': calculate_match_volume_trend(matches_data, granularity),
            'score_trend': calculate_score_trend(matches_data, granularity),
            'pursuit_rate_trend': calculate_pursuit_rate_trend(matches_data, granularity),
            'win_rate_trend': calculate_win_rate_trend(matches_data, granularity),
            'confidence_distribution_trend': calculate_confidence_distribution_trend(matches_data, granularity),
            'seasonal_patterns': calculate_seasonal_patterns(matches_data)
        }

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(trend_data, default=decimal_default)
        }

    except Exception as e:
        logger.error(f"Error getting trend analysis: {str(e)}")
        return create_error_response(500, 'TREND_ANALYSIS_FAILED', 'Failed to get trend analysis')

def get_matches_data(company_id: str, start_date: datetime, end_date: datetime) -> List[Dict]:
    """Fetch matches data for the specified time range"""
    try:
        matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

        response = matches_table.query(
            IndexName='company-timestamp-index',
            KeyConditionExpression='company_id = :company_id AND #timestamp BETWEEN :start_date AND :end_date',
            ExpressionAttributeNames={'#timestamp': 'timestamp'},
            ExpressionAttributeValues={
                ':company_id': company_id,
                ':start_date': start_date.isoformat() + 'Z',
                ':end_date': end_date.isoformat() + 'Z'
            }
        )

        return response.get('Items', [])
    except Exception as e:
        logger.error(f"Error fetching matches data: {str(e)}")
        return []

def get_feedback_data(company_id: str, start_date: datetime, end_date: datetime) -> List[Dict]:
    """Fetch feedback data for the specified time range"""
    try:
        feedback_table = dynamodb.Table(FEEDBACK_TABLE_NAME)

        response = feedback_table.query(
            IndexName='company-timestamp-index',
            KeyConditionExpression='company_id = :company_id AND #timestamp BETWEEN :start_date AND :end_date',
            ExpressionAttributeNames={'#timestamp': 'timestamp'},
            ExpressionAttributeValues={
                ':company_id': company_id,
                ':start_date': start_date.isoformat() + 'Z',
                ':end_date': end_date.isoformat() + 'Z'
            }
        )

        return response.get('Items', [])
    except Exception as e:
        logger.error(f"Error fetching feedback data: {str(e)}")
        return []

def get_time_range(period: str) -> tuple:
    """Get start and end datetime for the specified period"""
    end_date = datetime.utcnow()

    if period == '7d':
        start_date = end_date - timedelta(days=7)
    elif period == '30d':
        start_date = end_date - timedelta(days=30)
    elif period == '90d':
        start_date = end_date - timedelta(days=90)
    elif period == '1y':
        start_date = end_date - timedelta(days=365)
    else:
        start_date = end_date - timedelta(days=30)

    return start_date, end_date

def calculate_overview_metrics(matches_data: List[Dict]) -> Dict[str, Any]:
    """Calculate overview metrics for dashboard"""
    total_matches = len(matches_data)
    pursued_matches = [m for m in matches_data if m.get('pursued')]
    won_matches = [m for m in matches_data if m.get('outcome') == 'won']

    total_award_value = sum(float(m.get('award_amount', 0)) for m in won_matches)
    avg_score = sum(float(m.get('total_score', 0)) for m in matches_data) / total_matches if total_matches > 0 else 0

    return {
        'total_matches': total_matches,
        'pursued_count': len(pursued_matches),
        'won_count': len(won_matches),
        'total_award_value': total_award_value,
        'average_match_score': avg_score,
        'pursuit_rate': len(pursued_matches) / total_matches if total_matches > 0 else 0,
        'win_rate': len(won_matches) / len(pursued_matches) if pursued_matches else 0
    }

def calculate_match_quality_metrics(matches_data: List[Dict], feedback_data: List[Dict]) -> Dict[str, Any]:
    """Calculate match quality metrics"""
    confidence_distribution = defaultdict(int)
    score_distribution = defaultdict(int)

    for match in matches_data:
        confidence = match.get('confidence_level', 'LOW')
        confidence_distribution[confidence] += 1

        score = float(match.get('total_score', 0))
        score_bucket = f"{int(score * 10) * 10}-{int(score * 10) * 10 + 10}%"
        score_distribution[score_bucket] += 1

    # Calculate feedback-based quality metrics
    feedback_ratings = [f.get('rating') for f in feedback_data if f.get('rating')]
    avg_feedback_rating = sum(feedback_ratings) / len(feedback_ratings) if feedback_ratings else 0

    return {
        'confidence_distribution': dict(confidence_distribution),
        'score_distribution': dict(score_distribution),
        'average_feedback_rating': avg_feedback_rating,
        'total_feedback_count': len(feedback_data)
    }

def calculate_pursuit_analysis(matches_data: List[Dict]) -> Dict[str, Any]:
    """Calculate pursuit analysis metrics"""
    pursued_by_confidence = defaultdict(lambda: {'pursued': 0, 'total': 0})

    for match in matches_data:
        confidence = match.get('confidence_level', 'LOW')
        pursued_by_confidence[confidence]['total'] += 1
        if match.get('pursued'):
            pursued_by_confidence[confidence]['pursued'] += 1

    pursuit_rates = {}
    for confidence, data in pursued_by_confidence.items():
        pursuit_rates[confidence] = data['pursued'] / data['total'] if data['total'] > 0 else 0

    return {
        'pursuit_rates_by_confidence': pursuit_rates,
        'total_pursued': sum(1 for m in matches_data if m.get('pursued')),
        'average_pursuit_rate': sum(pursuit_rates.values()) / len(pursuit_rates) if pursuit_rates else 0
    }

def calculate_win_loss_analysis(matches_data: List[Dict]) -> Dict[str, Any]:
    """Calculate win/loss analysis"""
    pursued_matches = [m for m in matches_data if m.get('pursued')]

    outcomes = defaultdict(int)
    win_rates_by_confidence = defaultdict(lambda: {'won': 0, 'total': 0})

    for match in pursued_matches:
        outcome = match.get('outcome', 'pending')
        outcomes[outcome] += 1

        confidence = match.get('confidence_level', 'LOW')
        win_rates_by_confidence[confidence]['total'] += 1
        if outcome == 'won':
            win_rates_by_confidence[confidence]['won'] += 1

    win_rates = {}
    for confidence, data in win_rates_by_confidence.items():
        win_rates[confidence] = data['won'] / data['total'] if data['total'] > 0 else 0

    return {
        'outcomes_distribution': dict(outcomes),
        'win_rates_by_confidence': win_rates,
        'overall_win_rate': outcomes['won'] / len(pursued_matches) if pursued_matches else 0
    }

def get_recent_activity(matches_data: List[Dict], limit: int = 10) -> List[Dict]:
    """Get recent match activity"""
    sorted_matches = sorted(matches_data, key=lambda x: x.get('timestamp', ''), reverse=True)
    return sorted_matches[:limit]

def get_top_opportunities(matches_data: List[Dict], limit: int = 5) -> List[Dict]:
    """Get top scoring opportunities"""
    sorted_matches = sorted(matches_data, key=lambda x: float(x.get('total_score', 0)), reverse=True)
    return sorted_matches[:limit]

def calculate_feedback_summary(feedback_data: List[Dict]) -> Dict[str, Any]:
    """Calculate feedback summary metrics"""
    if not feedback_data:
        return {'total_feedback': 0, 'average_rating': 0, 'feedback_by_type': {}}

    ratings = [f.get('rating') for f in feedback_data if f.get('rating')]
    feedback_by_type = defaultdict(int)

    for feedback in feedback_data:
        feedback_type = feedback.get('feedback_type', 'general')
        feedback_by_type[feedback_type] += 1

    return {
        'total_feedback': len(feedback_data),
        'average_rating': sum(ratings) / len(ratings) if ratings else 0,
        'feedback_by_type': dict(feedback_by_type)
    }

def calculate_algorithm_performance(matches_data: List[Dict]) -> Dict[str, Any]:
    """Calculate algorithm performance metrics"""
    # Implementation for algorithm performance analysis
    return {
        'precision': 0.0,  # TODO: Calculate precision
        'recall': 0.0,     # TODO: Calculate recall
        'f1_score': 0.0    # TODO: Calculate F1 score
    }

def calculate_confidence_analysis(matches_data: List[Dict]) -> Dict[str, Any]:
    """Calculate confidence level analysis"""
    # Implementation for confidence analysis
    return {}

def calculate_component_analysis(matches_data: List[Dict]) -> Dict[str, Any]:
    """Calculate component score analysis"""
    # Implementation for component analysis
    return {}

def calculate_win_rate_trends(matches_data: List[Dict]) -> List[Dict]:
    """Calculate win rate trends over time"""
    # Implementation for win rate trends
    return []

def calculate_roi_analysis(matches_data: List[Dict]) -> Dict[str, Any]:
    """Calculate ROI analysis"""
    # Implementation for ROI analysis
    return {}

def calculate_recommendation_effectiveness(matches_data: List[Dict]) -> Dict[str, Any]:
    """Calculate recommendation effectiveness"""
    # Implementation for recommendation effectiveness
    return {}

def calculate_match_volume_trend(matches_data: List[Dict], granularity: str) -> List[Dict]:
    """Calculate match volume trend"""
    # Implementation for match volume trend
    return []

def calculate_score_trend(matches_data: List[Dict], granularity: str) -> List[Dict]:
    """Calculate score trend"""
    # Implementation for score trend
    return []

def calculate_pursuit_rate_trend(matches_data: List[Dict], granularity: str) -> List[Dict]:
    """Calculate pursuit rate trend"""
    # Implementation for pursuit rate trend
    return []

def calculate_win_rate_trend(matches_data: List[Dict], granularity: str) -> List[Dict]:
    """Calculate win rate trend"""
    # Implementation for win rate trend
    return []

def calculate_confidence_distribution_trend(matches_data: List[Dict], granularity: str) -> List[Dict]:
    """Calculate confidence distribution trend"""
    # Implementation for confidence distribution trend
    return []

def calculate_seasonal_patterns(matches_data: List[Dict]) -> Dict[str, Any]:
    """Calculate seasonal patterns"""
    # Implementation for seasonal patterns
    return {}

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