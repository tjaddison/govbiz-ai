"""
Lambda handlers for all GovBiz.ai agents
Consolidated Lambda wrappers for all agents in the multi-agent system
"""

import json
import asyncio
import logging
from typing import Dict, Any, Optional, Union, Callable
from datetime import datetime, timezone

from .opportunity_finder import OpportunityFinderAgent
from .analyzer import AnalyzerAgent
from .response_generator import ResponseGeneratorAgent
from .relationship_manager import RelationshipManagerAgent
from .email_manager import EmailManagerAgent
from .human_loop import HumanLoopAgent
from ..core.config import config
from ..utils.logger import get_logger

# Configure logging for Lambda
logging.basicConfig(level=logging.INFO)
logger = get_logger("lambda_handlers")

# Global agent instances for container reuse
_agents: Dict[str, Any] = {}


def get_agent(agent_name: str) -> Any:
    """Get or create agent instance"""
    global _agents
    
    if agent_name not in _agents:
        if agent_name == "opportunity_finder":
            _agents[agent_name] = OpportunityFinderAgent()
        elif agent_name == "analyzer":
            _agents[agent_name] = AnalyzerAgent()
        elif agent_name == "response_generator":
            _agents[agent_name] = ResponseGeneratorAgent()
        elif agent_name == "relationship_manager":
            _agents[agent_name] = RelationshipManagerAgent()
        elif agent_name == "email_manager":
            _agents[agent_name] = EmailManagerAgent()
        elif agent_name == "human_loop":
            _agents[agent_name] = HumanLoopAgent()
        else:
            raise ValueError(f"Unknown agent: {agent_name}")
    
    return _agents[agent_name]


def parse_lambda_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Lambda event data from different sources"""
    
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
    
    return task_data


def create_lambda_handler(agent_name: str) -> Callable:
    """Create a Lambda handler for a specific agent"""
    
    def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
        """
        Generic AWS Lambda handler for agents
        
        Args:
            event: Lambda event data
            context: Lambda context object
            
        Returns:
            Dict with success status and results
        """
        
        start_time = datetime.now(timezone.utc)
        logger.info(f"Starting {agent_name} lambda - Request ID: {context.aws_request_id}")
        
        try:
            # Parse event data
            task_data = parse_lambda_event(event)
            
            # Validate required fields for certain agents
            if agent_name in ["analyzer", "response_generator", "relationship_manager", "email_manager"]:
                if not task_data.get('opportunity_id') and not task_data.get('action'):
                    logger.error("Missing required fields: opportunity_id or action")
                    return {
                        "statusCode": 400,
                        "body": json.dumps({
                            "success": False,
                            "error": "Missing required fields: opportunity_id or action",
                            "request_id": context.aws_request_id
                        })
                    }
            
            # Get agent instance
            agent = get_agent(agent_name)
            
            # Execute agent task
            logger.info(f"Executing {agent_name} task")
            result = asyncio.run(agent.execute(task_data))
            
            # Calculate execution time
            execution_time = (datetime.now(timezone.utc) - start_time).total_seconds()
            
            if result.success:
                logger.info(f"{agent_name} completed successfully in {execution_time:.2f}s")
                
                response = {
                    "statusCode": 200,
                    "body": json.dumps({
                        "success": True,
                        "data": result.data,
                        "message": result.message,
                        "execution_time": execution_time,
                        "request_id": context.aws_request_id,
                        "agent": agent_name
                    })
                }
                
            else:
                logger.error(f"{agent_name} failed: {result.error}")
                
                response = {
                    "statusCode": 500,
                    "body": json.dumps({
                        "success": False,
                        "error": result.error,
                        "message": result.message,
                        "execution_time": execution_time,
                        "request_id": context.aws_request_id,
                        "agent": agent_name
                    })
                }
            
            # Log metrics
            logger.info(f"Lambda execution completed - Duration: {execution_time:.2f}s, "
                       f"Memory used: {context.memory_limit_in_mb}MB, "
                       f"Remaining time: {context.get_remaining_time_in_millis()}ms")
            
            return response
            
        except Exception as e:
            execution_time = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.error(f"Unexpected error in {agent_name} lambda handler: {e}", exc_info=True)
            
            return {
                "statusCode": 500,
                "body": json.dumps({
                    "success": False,
                    "error": str(e),
                    "message": "Internal server error",
                    "execution_time": execution_time,
                    "request_id": context.aws_request_id,
                    "agent": agent_name
                })
            }
    
    return lambda_handler


def health_check(agent_name: str) -> Dict[str, Any]:
    """Health check endpoint for Lambda functions"""
    
    try:
        # Test agent initialization
        agent = get_agent(agent_name)
        
        # Test configuration
        config_valid = bool(config.aws.region and config.database.opportunities_table)
        
        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "healthy",
                "agent_name": agent_name,
                "config_valid": config_valid,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        }
        
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({
                "status": "unhealthy",
                "agent_name": agent_name,
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        }


# Create individual Lambda handlers for each agent
opportunity_finder_handler = create_lambda_handler("opportunity_finder")
analyzer_handler = create_lambda_handler("analyzer")
response_generator_handler = create_lambda_handler("response_generator")
relationship_manager_handler = create_lambda_handler("relationship_manager")
email_manager_handler = create_lambda_handler("email_manager")
human_loop_handler = create_lambda_handler("human_loop")


# For testing locally
if __name__ == "__main__":
    # Test the lambda handlers
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
    
    # Test opportunity finder
    result = opportunity_finder_handler(test_event, MockContext())
    print("Opportunity Finder Result:")
    print(json.dumps(result, indent=2))
    
    # Test analyzer
    analyzer_event = {
        "Records": [{
            "eventSource": "aws:sqs",
            "body": json.dumps({
                "action": "analyze_opportunity",
                "opportunity_id": "test-opportunity-123"
            })
        }]
    }
    
    result = analyzer_handler(analyzer_event, MockContext())
    print("\nAnalyzer Result:")
    print(json.dumps(result, indent=2))