"""
AWS Lambda Function: Schedule Manager
Manages EventBridge schedules for batch processing operations.
"""

import json
import boto3
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
events = boto3.client('events')
stepfunctions = boto3.client('stepfunctions')
dynamodb = boto3.resource('dynamodb')

# Configuration
SCHEDULE_TABLE = 'govbizai-schedule-management'
DEFAULT_STATE_MACHINE_ARN = 'arn:aws:states:us-east-1:ACCOUNT:stateMachine:govbizai-processing-state-machine'

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main handler for schedule management operations.

    Args:
        event: Schedule management event
        context: Lambda context object

    Returns:
        Schedule management result
    """
    try:
        logger.info(f"Processing schedule management event: {json.dumps(event)}")

        # Determine operation type
        operation = event.get('operation', 'create_schedule')

        if operation == 'create_schedule':
            return create_schedule(event, context)
        elif operation == 'update_schedule':
            return update_schedule(event, context)
        elif operation == 'delete_schedule':
            return delete_schedule(event, context)
        elif operation == 'list_schedules':
            return list_schedules(event, context)
        elif operation == 'get_schedule':
            return get_schedule(event, context)
        elif operation == 'trigger_on_demand':
            return trigger_on_demand_execution(event, context)
        else:
            raise ValueError(f"Unknown operation: {operation}")

    except Exception as e:
        logger.error(f"Schedule management failed: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }

def create_schedule(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Create a new EventBridge schedule.

    Args:
        event: Schedule creation event
        context: Lambda context

    Returns:
        Schedule creation result
    """
    try:
        # Parse schedule parameters
        schedule_name = event.get('schedule_name')
        if not schedule_name:
            schedule_name = f"govbizai-schedule-{str(uuid.uuid4())[:8]}"

        schedule_config = {
            'schedule_name': schedule_name,
            'description': event.get('description', 'GovBizAI batch processing schedule'),
            'cron_expression': event.get('cron_expression'),
            'rate_expression': event.get('rate_expression'),
            'target_arn': event.get('target_arn', DEFAULT_STATE_MACHINE_ARN),
            'target_input': event.get('target_input', {}),
            'enabled': event.get('enabled', True),
            'timezone': event.get('timezone', 'UTC')
        }

        # Validate schedule expression
        schedule_expression = validate_schedule_expression(
            schedule_config.get('cron_expression'),
            schedule_config.get('rate_expression')
        )

        # Create EventBridge rule
        rule_response = events.put_rule(
            Name=schedule_name,
            ScheduleExpression=schedule_expression,
            Description=schedule_config['description'],
            State='ENABLED' if schedule_config['enabled'] else 'DISABLED'
        )

        # Add target to the rule
        target_config = create_target_config(
            schedule_config['target_arn'],
            schedule_config['target_input']
        )

        events.put_targets(
            Rule=schedule_name,
            Targets=[target_config]
        )

        # Store schedule configuration in DynamoDB
        schedule_record = store_schedule_config(schedule_config)

        result = {
            'statusCode': 201,
            'schedule_name': schedule_name,
            'schedule_arn': rule_response['RuleArn'],
            'schedule_config': schedule_record,
            'created_at': datetime.utcnow().isoformat()
        }

        logger.info(f"Schedule created successfully: {schedule_name}")
        return result

    except Exception as e:
        logger.error(f"Failed to create schedule: {str(e)}")
        raise

def update_schedule(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Update an existing EventBridge schedule.

    Args:
        event: Schedule update event
        context: Lambda context

    Returns:
        Schedule update result
    """
    schedule_name = event.get('schedule_name')
    if not schedule_name:
        raise ValueError("schedule_name is required for update operation")

    try:
        # Get existing schedule configuration
        existing_config = get_schedule_config(schedule_name)
        if not existing_config:
            return {
                'statusCode': 404,
                'error': f"Schedule not found: {schedule_name}"
            }

        # Merge updates with existing configuration
        updated_config = existing_config.copy()
        for key in ['description', 'cron_expression', 'rate_expression', 'target_arn', 'target_input', 'enabled', 'timezone']:
            if key in event:
                updated_config[key] = event[key]

        # Validate schedule expression
        schedule_expression = validate_schedule_expression(
            updated_config.get('cron_expression'),
            updated_config.get('rate_expression')
        )

        # Update EventBridge rule
        events.put_rule(
            Name=schedule_name,
            ScheduleExpression=schedule_expression,
            Description=updated_config['description'],
            State='ENABLED' if updated_config['enabled'] else 'DISABLED'
        )

        # Update targets if target configuration changed
        if 'target_arn' in event or 'target_input' in event:
            # Remove existing targets
            events.remove_targets(
                Rule=schedule_name,
                Ids=['1']
            )

            # Add updated target
            target_config = create_target_config(
                updated_config['target_arn'],
                updated_config['target_input']
            )

            events.put_targets(
                Rule=schedule_name,
                Targets=[target_config]
            )

        # Update schedule configuration in DynamoDB
        updated_record = store_schedule_config(updated_config)

        result = {
            'statusCode': 200,
            'schedule_name': schedule_name,
            'schedule_config': updated_record,
            'updated_at': datetime.utcnow().isoformat()
        }

        logger.info(f"Schedule updated successfully: {schedule_name}")
        return result

    except Exception as e:
        logger.error(f"Failed to update schedule: {str(e)}")
        raise

def delete_schedule(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Delete an EventBridge schedule.

    Args:
        event: Schedule deletion event
        context: Lambda context

    Returns:
        Schedule deletion result
    """
    schedule_name = event.get('schedule_name')
    if not schedule_name:
        raise ValueError("schedule_name is required for delete operation")

    try:
        # Remove targets from the rule
        events.remove_targets(
            Rule=schedule_name,
            Ids=['1']
        )

        # Delete the rule
        events.delete_rule(Name=schedule_name)

        # Delete schedule configuration from DynamoDB
        delete_schedule_config(schedule_name)

        result = {
            'statusCode': 200,
            'schedule_name': schedule_name,
            'deleted_at': datetime.utcnow().isoformat()
        }

        logger.info(f"Schedule deleted successfully: {schedule_name}")
        return result

    except Exception as e:
        logger.error(f"Failed to delete schedule: {str(e)}")
        if "ResourceNotFoundException" in str(e):
            return {
                'statusCode': 404,
                'error': f"Schedule not found: {schedule_name}"
            }
        raise

def list_schedules(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    List all scheduled processing jobs.

    Args:
        event: Schedule listing event
        context: Lambda context

    Returns:
        List of schedules
    """
    try:
        # Get schedules from DynamoDB
        table = dynamodb.Table(SCHEDULE_TABLE)
        response = table.scan()

        schedules = response['Items']

        # Enhance with current EventBridge rule status
        enhanced_schedules = []
        for schedule in schedules:
            schedule_name = schedule['schedule_name']

            try:
                # Get current rule status from EventBridge
                rule_response = events.describe_rule(Name=schedule_name)
                schedule['current_state'] = rule_response['State']
                schedule['rule_arn'] = rule_response['Arn']
            except Exception as e:
                logger.warning(f"Could not get current status for schedule {schedule_name}: {str(e)}")
                schedule['current_state'] = 'UNKNOWN'

            enhanced_schedules.append(schedule)

        result = {
            'statusCode': 200,
            'schedules': enhanced_schedules,
            'count': len(enhanced_schedules)
        }

        return result

    except Exception as e:
        logger.error(f"Failed to list schedules: {str(e)}")
        raise

def get_schedule(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Get details of a specific schedule.

    Args:
        event: Schedule retrieval event
        context: Lambda context

    Returns:
        Schedule details
    """
    schedule_name = event.get('schedule_name')
    if not schedule_name:
        raise ValueError("schedule_name is required")

    try:
        # Get schedule configuration from DynamoDB
        schedule_config = get_schedule_config(schedule_name)

        if not schedule_config:
            return {
                'statusCode': 404,
                'error': f"Schedule not found: {schedule_name}"
            }

        # Get current EventBridge rule details
        try:
            rule_response = events.describe_rule(Name=schedule_name)
            targets_response = events.list_targets_by_rule(Rule=schedule_name)

            schedule_config['current_state'] = rule_response['State']
            schedule_config['rule_arn'] = rule_response['Arn']
            schedule_config['targets'] = targets_response['Targets']

        except Exception as e:
            logger.warning(f"Could not get current EventBridge details for {schedule_name}: {str(e)}")
            schedule_config['current_state'] = 'UNKNOWN'

        return {
            'statusCode': 200,
            'schedule': schedule_config
        }

    except Exception as e:
        logger.error(f"Failed to get schedule: {str(e)}")
        raise

def trigger_on_demand_execution(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Trigger an on-demand execution of a processing workflow.

    Args:
        event: On-demand trigger event
        context: Lambda context

    Returns:
        Execution trigger result
    """
    try:
        # Get execution parameters
        target_arn = event.get('target_arn', DEFAULT_STATE_MACHINE_ARN)
        execution_input = event.get('execution_input', {})
        execution_name = event.get('execution_name')

        if not execution_name:
            execution_name = f"on-demand-{int(datetime.utcnow().timestamp())}"

        # Start Step Functions execution
        response = stepfunctions.start_execution(
            stateMachineArn=target_arn,
            name=execution_name,
            input=json.dumps(execution_input)
        )

        result = {
            'statusCode': 200,
            'execution_arn': response['executionArn'],
            'execution_name': execution_name,
            'started_at': response['startDate'].isoformat(),
            'execution_input': execution_input
        }

        logger.info(f"On-demand execution started: {execution_name}")
        return result

    except Exception as e:
        logger.error(f"Failed to trigger on-demand execution: {str(e)}")
        raise

def validate_schedule_expression(
    cron_expression: Optional[str],
    rate_expression: Optional[str]
) -> str:
    """
    Validate and return the appropriate schedule expression.

    Args:
        cron_expression: Cron expression
        rate_expression: Rate expression

    Returns:
        Validated schedule expression

    Raises:
        ValueError: If neither or both expressions are provided
    """
    if cron_expression and rate_expression:
        raise ValueError("Provide either cron_expression or rate_expression, not both")

    if not cron_expression and not rate_expression:
        raise ValueError("Either cron_expression or rate_expression is required")

    if cron_expression:
        # Validate cron expression format
        if not cron_expression.startswith('cron('):
            cron_expression = f"cron({cron_expression})"
        return cron_expression

    if rate_expression:
        # Validate rate expression format
        if not rate_expression.startswith('rate('):
            rate_expression = f"rate({rate_expression})"
        return rate_expression

def create_target_config(target_arn: str, target_input: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create target configuration for EventBridge rule.

    Args:
        target_arn: ARN of the target resource
        target_input: Input to pass to the target

    Returns:
        Target configuration
    """
    target_config = {
        'Id': '1',
        'Arn': target_arn
    }

    if target_input:
        target_config['Input'] = json.dumps(target_input)

    # Add role ARN for Step Functions targets
    if ':states:' in target_arn:
        # In production, this should be a proper IAM role ARN
        target_config['RoleArn'] = 'arn:aws:iam::ACCOUNT:role/service-role/StatesExecutionRole'

    return target_config

def store_schedule_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Store schedule configuration in DynamoDB.

    Args:
        config: Schedule configuration

    Returns:
        Stored schedule record
    """
    try:
        table = dynamodb.Table(SCHEDULE_TABLE)

        schedule_record = {
            'schedule_name': config['schedule_name'],
            'description': config['description'],
            'cron_expression': config.get('cron_expression'),
            'rate_expression': config.get('rate_expression'),
            'target_arn': config['target_arn'],
            'target_input': config['target_input'],
            'enabled': config['enabled'],
            'timezone': config['timezone'],
            'created_at': config.get('created_at', datetime.utcnow().isoformat()),
            'updated_at': datetime.utcnow().isoformat(),
            'ttl': int((datetime.utcnow() + timedelta(days=365)).timestamp())
        }

        table.put_item(Item=schedule_record)
        return schedule_record

    except Exception as e:
        logger.error(f"Failed to store schedule config: {str(e)}")
        raise

def get_schedule_config(schedule_name: str) -> Optional[Dict[str, Any]]:
    """
    Get schedule configuration from DynamoDB.

    Args:
        schedule_name: Name of the schedule

    Returns:
        Schedule configuration or None if not found
    """
    try:
        table = dynamodb.Table(SCHEDULE_TABLE)

        response = table.get_item(
            Key={'schedule_name': schedule_name}
        )

        return response.get('Item')

    except Exception as e:
        logger.error(f"Failed to get schedule config: {str(e)}")
        return None

def delete_schedule_config(schedule_name: str) -> None:
    """
    Delete schedule configuration from DynamoDB.

    Args:
        schedule_name: Name of the schedule to delete
    """
    try:
        table = dynamodb.Table(SCHEDULE_TABLE)

        table.delete_item(
            Key={'schedule_name': schedule_name}
        )

    except Exception as e:
        logger.error(f"Failed to delete schedule config: {str(e)}")
        raise