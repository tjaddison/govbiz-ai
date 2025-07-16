"""
Simple Lambda server for API Gateway without complex dependencies
"""

import json
import logging
import os
from datetime import datetime, timezone

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """
    Simple Lambda handler for API Gateway
    """
    try:
        # Log the incoming event
        logger.info(f"Received event: {json.dumps(event)}")
        
        # Get HTTP method and path
        http_method = event.get('httpMethod', 'GET')
        path = event.get('path', '/')
        
        # Route based on path
        if path == '/health' or path == '/dev/health':
            return handle_health()
        elif path.startswith('/api/opportunities') or path.startswith('/dev/api/opportunities'):
            return handle_opportunities()
        elif path.startswith('/api/dashboard') or path.startswith('/dev/api/dashboard'):
            return handle_dashboard()
        else:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
                },
                'body': json.dumps({
                    'error': 'Not Found',
                    'message': f'Path {path} not found'
                })
            }
            
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
            },
            'body': json.dumps({
                'error': 'Internal Server Error',
                'message': str(e)
            })
        }

def handle_health():
    """Handle health check endpoint"""
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        'body': json.dumps({
            'status': 'healthy',
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'service': 'govbiz-ai-api',
            'version': '1.0.0',
            'environment': os.environ.get('ENVIRONMENT', 'dev')
        })
    }

def handle_opportunities():
    """Handle opportunities endpoint"""
    mock_opportunities = [
        {
            'id': 'opp-001',
            'title': 'Cloud Infrastructure Services for Healthcare Systems',
            'agency': 'Department of Veterans Affairs',
            'deadline': '2024-02-15',
            'matchScore': 92,
            'status': 'pending_review'
        },
        {
            'id': 'opp-002', 
            'title': 'Cybersecurity Assessment and Monitoring Services',
            'agency': 'Department of Homeland Security',
            'deadline': '2024-02-20',
            'matchScore': 85,
            'status': 'approved'
        },
        {
            'id': 'opp-003',
            'title': 'Data Analytics Platform for Financial Operations',
            'agency': 'General Services Administration',
            'deadline': '2024-02-25',
            'matchScore': 78,
            'status': 'submitted'
        }
    ]
    
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        'body': json.dumps({
            'opportunities': mock_opportunities,
            'total': len(mock_opportunities),
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
    }

def handle_dashboard():
    """Handle dashboard endpoint"""
    mock_stats = {
        'total_opportunities': 15,
        'pending_review': 5,
        'approved': 3,
        'submitted': 4,
        'no_bid': 3,
        'this_week': 8,
        'this_month': 15,
        'avg_match_score': 78.5
    }
    
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        'body': json.dumps({
            'stats': mock_stats,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
    }