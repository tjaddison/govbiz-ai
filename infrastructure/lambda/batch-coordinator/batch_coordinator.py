"""
AWS Lambda Function: Batch Processing Coordinator
Coordinates parallel batch processing with intelligent distribution and monitoring.
"""

import json
import boto3
import uuid
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import logging
import math
from decimal import Decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
sqs = boto3.client('sqs')
stepfunctions = boto3.client('stepfunctions')
dynamodb = boto3.resource('dynamodb')
cloudwatch = boto3.client('cloudwatch')

# Configuration
MAX_SQS_BATCH_SIZE = 10
MAX_PROCESSING_TIME_MINUTES = 240  # 4 hours
COORDINATION_TABLE = 'govbizai-batch-coordination'

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main handler for batch processing coordination.

    Args:
        event: Input event with batch processing parameters
        context: Lambda context object

    Returns:
        Batch coordination result
    """
    try:
        logger.info(f"Starting batch coordination with event: {json.dumps(event)}")

        # Parse input parameters
        operation = event.get('operation', 'coordinate_processing')

        if operation == 'coordinate_processing':
            return coordinate_processing(event, context)
        elif operation == 'check_progress':
            return check_batch_progress(event, context)
        elif operation == 'handle_failure':
            return handle_batch_failure(event, context)
        else:
            raise ValueError(f"Unknown operation: {operation}")

    except Exception as e:
        logger.error(f"Batch coordination failed: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }

def coordinate_processing(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Coordinate the distribution of work across parallel processing units.

    Args:
        event: Processing coordination event
        context: Lambda context

    Returns:
        Coordination result
    """
    # Extract parameters
    items_to_process = event.get('items', [])
    batch_config = event.get('batch_config', {})
    processing_type = event.get('processing_type', 'opportunities')

    batch_size = batch_config.get('batch_size', 100)
    max_concurrency = batch_config.get('max_concurrency', 10)
    queue_url = event.get('queue_url')

    # Generate coordination ID
    coordination_id = str(uuid.uuid4())

    # Create batches
    batches = create_batches(items_to_process, batch_size)

    # Initialize coordination record
    coordination_record = initialize_coordination(
        coordination_id,
        processing_type,
        len(batches),
        max_concurrency
    )

    # Distribute batches to processing queue
    distribution_result = distribute_batches_to_queue(
        batches,
        queue_url,
        coordination_id,
        max_concurrency
    )

    # Update coordination record with distribution results
    update_coordination_status(
        coordination_id,
        'distributing',
        {
            'batches_created': len(batches),
            'batches_queued': distribution_result['batches_queued'],
            'total_items': len(items_to_process)
        }
    )

    result = {
        'statusCode': 200,
        'coordination_id': coordination_id,
        'batches_created': len(batches),
        'batches_queued': distribution_result['batches_queued'],
        'total_items': len(items_to_process),
        'estimated_completion_time': calculate_estimated_completion(
            len(batches),
            max_concurrency,
            batch_config.get('estimated_duration_per_batch', 30)
        ),
        'coordination_record': coordination_record
    }

    logger.info(f"Coordination initiated: {json.dumps(result)}")
    return result

def create_batches(items: List[Any], batch_size: int) -> List[List[Any]]:
    """
    Create batches from list of items.

    Args:
        items: List of items to batch
        batch_size: Size of each batch

    Returns:
        List of batches
    """
    batches = []
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        batches.append(batch)

    logger.info(f"Created {len(batches)} batches from {len(items)} items")
    return batches

def initialize_coordination(
    coordination_id: str,
    processing_type: str,
    total_batches: int,
    max_concurrency: int
) -> Dict[str, Any]:
    """
    Initialize coordination record in DynamoDB.

    Args:
        coordination_id: Unique coordination identifier
        processing_type: Type of processing
        total_batches: Total number of batches
        max_concurrency: Maximum concurrent processing

    Returns:
        Coordination record
    """
    try:
        table = dynamodb.Table(COORDINATION_TABLE)

        coordination_record = {
            'coordination_id': coordination_id,
            'processing_type': processing_type,
            'status': 'initializing',
            'total_batches': total_batches,
            'max_concurrency': max_concurrency,
            'completed_batches': 0,
            'failed_batches': 0,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            'ttl': int((datetime.utcnow() + timedelta(days=7)).timestamp()),
            'progress_percentage': Decimal('0.0'),
            'estimated_completion': None,
            'actual_completion': None,
            'processing_errors': []
        }

        table.put_item(Item=coordination_record)
        logger.info(f"Initialized coordination record: {coordination_id}")

        return coordination_record

    except Exception as e:
        logger.error(f"Failed to initialize coordination: {str(e)}")
        raise

def distribute_batches_to_queue(
    batches: List[List[Any]],
    queue_url: str,
    coordination_id: str,
    max_concurrency: int
) -> Dict[str, Any]:
    """
    Distribute batches to SQS queue for processing.

    Args:
        batches: List of batches to distribute
        queue_url: SQS queue URL
        coordination_id: Coordination identifier
        max_concurrency: Maximum concurrent processing

    Returns:
        Distribution result
    """
    try:
        if not queue_url:
            raise ValueError("Queue URL is required for batch distribution")

        batches_queued = 0
        failed_batches = 0

        # Process batches in groups to respect SQS batch limits
        for i in range(0, len(batches), MAX_SQS_BATCH_SIZE):
            batch_group = batches[i:i + MAX_SQS_BATCH_SIZE]

            # Prepare SQS batch messages
            sqs_entries = []
            for idx, batch in enumerate(batch_group):
                batch_id = f"{coordination_id}-batch-{i + idx}"

                message_body = {
                    'coordination_id': coordination_id,
                    'batch_id': batch_id,
                    'batch_index': i + idx,
                    'batch_data': batch,
                    'processing_metadata': {
                        'created_at': datetime.utcnow().isoformat(),
                        'max_concurrency': max_concurrency
                    }
                }

                sqs_entries.append({
                    'Id': str(i + idx),
                    'MessageBody': json.dumps(message_body),
                    'MessageGroupId': coordination_id,  # For FIFO queues
                    'MessageDeduplicationId': batch_id
                })

            # Send batch to SQS
            try:
                response = sqs.send_message_batch(
                    QueueUrl=queue_url,
                    Entries=sqs_entries
                )

                successful = len(response.get('Successful', []))
                failed = len(response.get('Failed', []))

                batches_queued += successful
                failed_batches += failed

                if failed > 0:
                    logger.warning(f"Failed to queue {failed} batches: {response.get('Failed', [])}")

            except Exception as e:
                logger.error(f"Failed to send batch group to SQS: {str(e)}")
                failed_batches += len(batch_group)

        result = {
            'batches_queued': batches_queued,
            'failed_batches': failed_batches,
            'total_batches': len(batches)
        }

        logger.info(f"Distribution complete: {json.dumps(result)}")
        return result

    except Exception as e:
        logger.error(f"Batch distribution failed: {str(e)}")
        raise

def check_batch_progress(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Check progress of batch processing coordination.

    Args:
        event: Progress check event
        context: Lambda context

    Returns:
        Progress status
    """
    coordination_id = event.get('coordination_id')
    if not coordination_id:
        raise ValueError("coordination_id is required for progress check")

    try:
        table = dynamodb.Table(COORDINATION_TABLE)

        response = table.get_item(
            Key={'coordination_id': coordination_id}
        )

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'error': f"Coordination record not found: {coordination_id}"
            }

        coordination_record = response['Item']

        # Calculate current progress
        total_batches = coordination_record['total_batches']
        completed_batches = coordination_record['completed_batches']
        failed_batches = coordination_record['failed_batches']

        progress_percentage = Decimal(str(completed_batches / total_batches * 100)) if total_batches > 0 else Decimal('0')

        # Check if processing is complete
        is_complete = (completed_batches + failed_batches) >= total_batches

        status = {
            'coordination_id': coordination_id,
            'status': coordination_record['status'],
            'progress_percentage': progress_percentage,
            'total_batches': total_batches,
            'completed_batches': completed_batches,
            'failed_batches': failed_batches,
            'is_complete': is_complete,
            'created_at': coordination_record['created_at'],
            'updated_at': coordination_record['updated_at']
        }

        if is_complete:
            status['completed_at'] = datetime.utcnow().isoformat()
            status['status'] = 'completed' if failed_batches == 0 else 'completed_with_errors'

        return {
            'statusCode': 200,
            'progress': status
        }

    except Exception as e:
        logger.error(f"Progress check failed: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e)
        }

def handle_batch_failure(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle batch processing failures and implement retry logic.

    Args:
        event: Failure handling event
        context: Lambda context

    Returns:
        Failure handling result
    """
    coordination_id = event.get('coordination_id')
    batch_id = event.get('batch_id')
    error_info = event.get('error_info', {})

    try:
        # Update coordination record with failure
        update_coordination_status(
            coordination_id,
            'processing_with_errors',
            {
                'failed_batch_id': batch_id,
                'error_info': error_info,
                'failure_timestamp': datetime.utcnow().isoformat()
            }
        )

        # Implement retry logic if applicable
        retry_result = attempt_batch_retry(coordination_id, batch_id, error_info)

        return {
            'statusCode': 200,
            'coordination_id': coordination_id,
            'batch_id': batch_id,
            'failure_handled': True,
            'retry_result': retry_result
        }

    except Exception as e:
        logger.error(f"Failure handling failed: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e)
        }

def attempt_batch_retry(
    coordination_id: str,
    batch_id: str,
    error_info: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Attempt to retry a failed batch with exponential backoff.

    Args:
        coordination_id: Coordination identifier
        batch_id: Failed batch identifier
        error_info: Error information

    Returns:
        Retry attempt result
    """
    # Implementation would include retry logic with exponential backoff
    # For now, return a placeholder result
    return {
        'retry_attempted': False,
        'reason': 'Retry logic not yet implemented',
        'retry_schedule': None
    }

def update_coordination_status(
    coordination_id: str,
    status: str,
    additional_data: Optional[Dict[str, Any]] = None
) -> None:
    """
    Update coordination record status.

    Args:
        coordination_id: Coordination identifier
        status: New status
        additional_data: Additional data to update
    """
    try:
        table = dynamodb.Table(COORDINATION_TABLE)

        update_expression = "SET #status = :status, updated_at = :updated_at"
        expression_attribute_names = {'#status': 'status'}
        expression_attribute_values = {
            ':status': status,
            ':updated_at': datetime.utcnow().isoformat()
        }

        if additional_data:
            for key, value in additional_data.items():
                update_expression += f", {key} = :{key}"
                expression_attribute_values[f":{key}"] = value

        table.update_item(
            Key={'coordination_id': coordination_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values
        )

        logger.info(f"Updated coordination status: {coordination_id} -> {status}")

    except Exception as e:
        logger.error(f"Failed to update coordination status: {str(e)}")
        raise

def calculate_estimated_completion(
    total_batches: int,
    max_concurrency: int,
    estimated_duration_per_batch: int
) -> str:
    """
    Calculate estimated completion time.

    Args:
        total_batches: Total number of batches
        max_concurrency: Maximum concurrent processing
        estimated_duration_per_batch: Estimated duration per batch in seconds

    Returns:
        Estimated completion time ISO string
    """
    # Calculate estimated total time
    concurrent_batches = min(total_batches, max_concurrency)
    sequential_rounds = math.ceil(total_batches / concurrent_batches)
    estimated_seconds = sequential_rounds * estimated_duration_per_batch

    estimated_completion = datetime.utcnow() + timedelta(seconds=estimated_seconds)
    return estimated_completion.isoformat()

def publish_coordination_metrics(
    coordination_id: str,
    processing_type: str,
    metrics: Dict[str, Any]
) -> None:
    """
    Publish coordination metrics to CloudWatch.

    Args:
        coordination_id: Coordination identifier
        processing_type: Type of processing
        metrics: Metrics to publish
    """
    try:
        metric_data = []

        for metric_name, value in metrics.items():
            if isinstance(value, (int, float)):
                metric_data.append({
                    'MetricName': metric_name,
                    'Dimensions': [
                        {
                            'Name': 'ProcessingType',
                            'Value': processing_type
                        },
                        {
                            'Name': 'CoordinationId',
                            'Value': coordination_id
                        }
                    ],
                    'Value': value,
                    'Unit': 'Count'
                })

        if metric_data:
            cloudwatch.put_metric_data(
                Namespace='GovBizAI/BatchCoordination',
                MetricData=metric_data
            )

    except Exception as e:
        logger.warning(f"Failed to publish coordination metrics: {str(e)}")