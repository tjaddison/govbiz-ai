"""
HTTP response formatting utilities.
"""
import json
from datetime import datetime
from typing import Dict, Any, Optional

def format_response(status_code: int, body: Dict[str, Any],
                   headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Format a successful Lambda response."""
    default_headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }

    if headers:
        default_headers.update(headers)

    return {
        'statusCode': status_code,
        'headers': default_headers,
        'body': json.dumps(body, default=str)
    }

def format_error_response(status_code: int, error_message: str,
                         error_code: Optional[str] = None,
                         details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Format an error Lambda response."""
    error_body = {
        'error': {
            'message': error_message,
            'code': error_code or 'INTERNAL_ERROR',
            'timestamp': str(datetime.utcnow().isoformat())
        }
    }

    if details:
        error_body['error']['details'] = details

    return format_response(status_code, error_body)