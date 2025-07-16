"""
Lambda handler for OpportunityFinder Agent
AWS Lambda wrapper for the opportunity discovery agent
"""

import json
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from .opportunity_finder import OpportunityFinderAgent
from ..utils.logger import get_logger

# Configure logging for Lambda
logging.basicConfig(level=logging.INFO)
logger = get_logger("opportunity_finder_lambda")

# Global agent instance for container reuse
_agent: Optional[OpportunityFinderAgent] = None


def get_agent() -> OpportunityFinderAgent:
    """Get or create agent instance"""
    global _agent
    if _agent is None:
        _agent = OpportunityFinderAgent()
    return _agent


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler for opportunity discovery
    
    Args:
        event: Lambda event data
        context: Lambda context object
        
    Returns:
        Dict with success status and results
    """
    
    start_time = datetime.now(timezone.utc)
    logger.info(f"Starting opportunity discovery lambda - Request ID: {context.aws_request_id}")
    
    try:
        # Import config locally to avoid circular imports
        from ..core.config import config
        # Parse event data
        task_data = {}
        
        # Handle different event sources
        if 'Records' in event:
            # SQS event source
            for record in event['Records']:
                if record.get('eventSource') == 'aws:sqs':
                    try:
                        message_body = json.loads(record['body'])
                        task_data.update(message_body)
                    except json.JSONDecodeError:
                        logger.error(f"Invalid JSON in SQS message: {record['body']}")
                        continue
        
        elif 'source' in event and event['source'] == 'aws.events':
            # EventBridge (CloudWatch Events) source
            task_data = {
                "source": "scheduled",
                "detail": event.get('detail', {})
            }
        
        else:
            # Direct invocation or API Gateway
            task_data = event.get('body', {})
            if isinstance(task_data, str):
                task_data = json.loads(task_data)
        
        # Get agent instance
        agent = get_agent()
        
        # Execute opportunity discovery
        logger.info("Executing opportunity discovery task")
        result = asyncio.run(agent.execute(task_data))
        
        # Calculate execution time
        execution_time = (datetime.now(timezone.utc) - start_time).total_seconds()
        
        if result.success:
            logger.info(f"Opportunity discovery completed successfully in {execution_time:.2f}s")
            
            response = {
                "statusCode": 200,
                "body": json.dumps({
                    "success": True,
                    "data": result.data,
                    "message": result.message,
                    "execution_time": execution_time,
                    "request_id": context.aws_request_id
                })
            }
            
        else:
            logger.error(f"Opportunity discovery failed: {result.error}")
            
            response = {
                "statusCode": 500,
                "body": json.dumps({
                    "success": False,
                    "error": result.error,
                    "message": result.message,
                    "execution_time": execution_time,
                    "request_id": context.aws_request_id
                })
            }
        
        # Log metrics
        logger.info(f"Lambda execution completed - Duration: {execution_time:.2f}s, "
                   f"Memory used: {context.memory_limit_in_mb}MB, "
                   f"Remaining time: {context.get_remaining_time_in_millis()}ms")
        
        return response
        
    except Exception as e:
        execution_time = (datetime.now(timezone.utc) - start_time).total_seconds()
        logger.error(f"Unexpected error in lambda handler: {e}", exc_info=True)
        
        return {
            "statusCode": 500,
            "body": json.dumps({
                "success": False,
                "error": str(e),
                "message": "Internal server error",
                "execution_time": execution_time,
                "request_id": context.aws_request_id
            })
        }


def health_check() -> Dict[str, Any]:
    """Health check endpoint for the Lambda function"""
    
    try:
        # Import config locally to avoid circular imports
        from ..core.config import config
        
        # Test agent initialization
        agent = get_agent()
        
        # Test configuration
        config_valid = bool(config.aws.region and config.database.opportunities_table)
        
        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "healthy",
                "agent_name": agent.name,
                "config_valid": config_valid,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        }
        
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        }


# For testing locally
if __name__ == "__main__":
    # Test the lambda handler
    test_event = {
        "source": "test",
        "detail": {}
    }
    
    class MockContext:
        def __init__(self):
            self.aws_request_id = "test-request-123"
            self.memory_limit_in_mb = 1024
            
        def get_remaining_time_in_millis(self):
            return 300000  # 5 minutes
    
    result = lambda_handler(test_event, MockContext())
    print(json.dumps(result, indent=2))