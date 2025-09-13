"""
AWS Lambda Function: Progress Tracker
Tracks and reports real-time progress of batch processing operations.
"""

import json
import boto3
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import logging
from decimal import Decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
cloudwatch = boto3.client('cloudwatch')
sns = boto3.client('sns')
stepfunctions = boto3.client('stepfunctions')

# Configuration
PROGRESS_TABLE = 'govbizai-progress-tracking'
COORDINATION_TABLE = 'govbizai-batch-coordination'
NOTIFICATION_THRESHOLDS = [25, 50, 75, 90, 100]  # Progress percentages for notifications

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main handler for progress tracking.

    Args:
        event: Progress tracking event
        context: Lambda context object

    Returns:
        Progress tracking result
    """
    try:
        logger.info(f"Processing progress tracking event: {json.dumps(event)}")

        # Determine operation type
        operation = event.get('operation', 'update_progress')

        if operation == 'update_progress':
            return update_batch_progress(event, context)
        elif operation == 'get_progress':
            return get_progress_status(event, context)
        elif operation == 'monitor_health':
            return monitor_processing_health(event, context)
        elif operation == 'send_notifications':
            return send_progress_notifications(event, context)
        else:
            raise ValueError(f"Unknown operation: {operation}")

    except Exception as e:
        logger.error(f"Progress tracking failed: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }

def update_batch_progress(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Update progress information for a batch processing operation.

    Args:
        event: Progress update event
        context: Lambda context

    Returns:
        Progress update result
    """
    coordination_id = event.get('coordination_id')
    batch_id = event.get('batch_id')
    progress_data = event.get('progress_data', {})

    if not coordination_id or not batch_id:
        raise ValueError("coordination_id and batch_id are required")

    try:
        # Update individual batch progress
        batch_progress = update_batch_record(coordination_id, batch_id, progress_data)

        # Update overall coordination progress
        overall_progress = update_coordination_progress(coordination_id)

        # Check for notification triggers
        notification_result = check_notification_triggers(
            coordination_id,
            overall_progress['progress_percentage']
        )

        # Publish metrics
        publish_progress_metrics(coordination_id, batch_progress, overall_progress)

        result = {
            'statusCode': 200,
            'coordination_id': coordination_id,
            'batch_id': batch_id,
            'batch_progress': batch_progress,
            'overall_progress': overall_progress,
            'notifications_sent': notification_result
        }

        logger.info(f"Progress updated successfully: {coordination_id}")
        return result

    except Exception as e:
        logger.error(f"Failed to update progress: {str(e)}")
        raise

def update_batch_record(
    coordination_id: str,
    batch_id: str,
    progress_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Update individual batch progress record.

    Args:
        coordination_id: Coordination identifier
        batch_id: Batch identifier
        progress_data: Progress data to update

    Returns:
        Updated batch progress
    """
    try:
        progress_table = dynamodb.Table(PROGRESS_TABLE)

        # Prepare progress record
        progress_record = {
            'coordination_id': coordination_id,
            'batch_id': batch_id,
            'updated_at': datetime.utcnow().isoformat(),
            'status': progress_data.get('status', 'processing'),
            'items_processed': progress_data.get('items_processed', 0),
            'items_total': progress_data.get('items_total', 0),
            'errors_count': progress_data.get('errors_count', 0),
            'processing_duration': progress_data.get('processing_duration', 0),
            'ttl': int((datetime.utcnow() + timedelta(days=7)).timestamp())
        }

        # Calculate batch completion percentage
        if progress_record['items_total'] > 0:
            progress_record['completion_percentage'] = (
                progress_record['items_processed'] / progress_record['items_total'] * 100
            )
        else:
            progress_record['completion_percentage'] = 0

        # Add additional metadata if provided
        if 'metadata' in progress_data:
            progress_record['metadata'] = progress_data['metadata']

        # Store or update the record
        progress_table.put_item(Item=progress_record)

        logger.info(f"Updated batch progress: {batch_id} - {progress_record['completion_percentage']:.1f}%")
        return progress_record

    except Exception as e:
        logger.error(f"Failed to update batch record: {str(e)}")
        raise

def update_coordination_progress(coordination_id: str) -> Dict[str, Any]:
    """
    Update overall coordination progress by aggregating batch progress.

    Args:
        coordination_id: Coordination identifier

    Returns:
        Updated coordination progress
    """
    try:
        progress_table = dynamodb.Table(PROGRESS_TABLE)
        coordination_table = dynamodb.Table(COORDINATION_TABLE)

        # Get all batch progress records for this coordination
        response = progress_table.query(
            KeyConditionExpression='coordination_id = :coord_id',
            ExpressionAttributeValues={':coord_id': coordination_id}
        )

        batch_records = response['Items']

        if not batch_records:
            logger.warning(f"No batch records found for coordination: {coordination_id}")
            return {}

        # Calculate aggregated progress
        total_items_processed = sum(record.get('items_processed', 0) for record in batch_records)
        total_items = sum(record.get('items_total', 0) for record in batch_records)
        total_errors = sum(record.get('errors_count', 0) for record in batch_records)

        completed_batches = len([r for r in batch_records if r.get('status') == 'completed'])
        failed_batches = len([r for r in batch_records if r.get('status') == 'failed'])
        processing_batches = len([r for r in batch_records if r.get('status') == 'processing'])

        # Calculate overall progress percentage
        if total_items > 0:
            progress_percentage = (total_items_processed / total_items * 100)
        else:
            progress_percentage = 0

        # Determine overall status
        if completed_batches + failed_batches == len(batch_records):
            overall_status = 'completed' if failed_batches == 0 else 'completed_with_errors'
        elif processing_batches > 0:
            overall_status = 'processing'
        else:
            overall_status = 'pending'

        # Update coordination table
        coordination_table.update_item(
            Key={'coordination_id': coordination_id},
            UpdateExpression='''SET
                updated_at = :updated_at,
                progress_percentage = :progress_pct,
                completed_batches = :completed,
                failed_batches = :failed,
                processing_batches = :processing,
                total_items_processed = :total_processed,
                total_errors = :total_errors,
                #status = :status''',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':updated_at': datetime.utcnow().isoformat(),
                ':progress_pct': Decimal(str(progress_percentage)),
                ':completed': completed_batches,
                ':failed': failed_batches,
                ':processing': processing_batches,
                ':total_processed': total_items_processed,
                ':total_errors': total_errors,
                ':status': overall_status
            }
        )

        coordination_progress = {
            'coordination_id': coordination_id,
            'progress_percentage': progress_percentage,
            'overall_status': overall_status,
            'completed_batches': completed_batches,
            'failed_batches': failed_batches,
            'processing_batches': processing_batches,
            'total_items_processed': total_items_processed,
            'total_errors': total_errors,
            'batch_count': len(batch_records)
        }

        logger.info(f"Updated coordination progress: {coordination_id} - {progress_percentage:.1f}%")
        return coordination_progress

    except Exception as e:
        logger.error(f"Failed to update coordination progress: {str(e)}")
        raise

def get_progress_status(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Get current progress status for a coordination or batch.

    Args:
        event: Progress status request event
        context: Lambda context

    Returns:
        Progress status information
    """
    coordination_id = event.get('coordination_id')
    batch_id = event.get('batch_id')

    if not coordination_id:
        raise ValueError("coordination_id is required")

    try:
        if batch_id:
            # Get specific batch progress
            progress_table = dynamodb.Table(PROGRESS_TABLE)
            response = progress_table.get_item(
                Key={
                    'coordination_id': coordination_id,
                    'batch_id': batch_id
                }
            )

            if 'Item' not in response:
                return {
                    'statusCode': 404,
                    'error': f"Batch progress not found: {batch_id}"
                }

            return {
                'statusCode': 200,
                'batch_progress': response['Item']
            }

        else:
            # Get overall coordination progress
            coordination_table = dynamodb.Table(COORDINATION_TABLE)
            response = coordination_table.get_item(
                Key={'coordination_id': coordination_id}
            )

            if 'Item' not in response:
                return {
                    'statusCode': 404,
                    'error': f"Coordination not found: {coordination_id}"
                }

            coordination_record = response['Item']

            # Get detailed batch progress
            progress_table = dynamodb.Table(PROGRESS_TABLE)
            batch_response = progress_table.query(
                KeyConditionExpression='coordination_id = :coord_id',
                ExpressionAttributeValues={':coord_id': coordination_id}
            )

            return {
                'statusCode': 200,
                'coordination_progress': coordination_record,
                'batch_details': batch_response['Items']
            }

    except Exception as e:
        logger.error(f"Failed to get progress status: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e)
        }

def monitor_processing_health(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Monitor the health of active batch processing operations.

    Args:
        event: Health monitoring event
        context: Lambda context

    Returns:
        Health monitoring result
    """
    try:
        coordination_table = dynamodb.Table(COORDINATION_TABLE)

        # Find active coordinations
        current_time = datetime.utcnow()
        cutoff_time = current_time - timedelta(hours=6)  # Check last 6 hours

        # Scan for active coordinations (in production, use a better query pattern)
        response = coordination_table.scan(
            FilterExpression='attribute_exists(coordination_id) AND updated_at > :cutoff',
            ExpressionAttributeValues={
                ':cutoff': cutoff_time.isoformat()
            }
        )

        active_coordinations = response['Items']

        health_status = {
            'active_coordinations': len(active_coordinations),
            'healthy_count': 0,
            'stalled_count': 0,
            'error_count': 0,
            'coordination_details': []
        }

        for coordination in active_coordinations:
            coordination_health = assess_coordination_health(coordination, current_time)
            health_status['coordination_details'].append(coordination_health)

            if coordination_health['health_status'] == 'healthy':
                health_status['healthy_count'] += 1
            elif coordination_health['health_status'] == 'stalled':
                health_status['stalled_count'] += 1
            else:
                health_status['error_count'] += 1

        # Publish health metrics
        publish_health_metrics(health_status)

        return {
            'statusCode': 200,
            'health_status': health_status,
            'timestamp': current_time.isoformat()
        }

    except Exception as e:
        logger.error(f"Health monitoring failed: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e)
        }

def assess_coordination_health(
    coordination: Dict[str, Any],
    current_time: datetime
) -> Dict[str, Any]:
    """
    Assess the health of a specific coordination.

    Args:
        coordination: Coordination record
        current_time: Current timestamp

    Returns:
        Health assessment
    """
    coordination_id = coordination['coordination_id']
    updated_at = datetime.fromisoformat(coordination['updated_at'].replace('Z', '+00:00'))
    time_since_update = (current_time - updated_at).total_seconds() / 60  # minutes

    # Determine health status based on various factors
    if time_since_update > 60:  # No update for over 1 hour
        health_status = 'stalled'
    elif coordination.get('status', '') == 'failed':
        health_status = 'error'
    elif coordination.get('failed_batches', 0) > coordination.get('total_batches', 0) * 0.1:
        health_status = 'degraded'  # More than 10% batch failures
    else:
        health_status = 'healthy'

    return {
        'coordination_id': coordination_id,
        'health_status': health_status,
        'progress_percentage': float(coordination.get('progress_percentage', 0)),
        'time_since_update_minutes': int(time_since_update),
        'failed_batches': coordination.get('failed_batches', 0),
        'completed_batches': coordination.get('completed_batches', 0),
        'total_batches': coordination.get('total_batches', 0)
    }

def check_notification_triggers(
    coordination_id: str,
    progress_percentage: float
) -> List[Dict[str, Any]]:
    """
    Check if progress percentage triggers notifications.

    Args:
        coordination_id: Coordination identifier
        progress_percentage: Current progress percentage

    Returns:
        List of notifications sent
    """
    notifications_sent = []

    try:
        # Check which thresholds have been crossed
        for threshold in NOTIFICATION_THRESHOLDS:
            if progress_percentage >= threshold:
                notification = send_progress_notification(
                    coordination_id,
                    threshold,
                    progress_percentage
                )
                if notification:
                    notifications_sent.append(notification)

    except Exception as e:
        logger.error(f"Failed to check notification triggers: {str(e)}")

    return notifications_sent

def send_progress_notification(
    coordination_id: str,
    threshold: int,
    actual_progress: float
) -> Optional[Dict[str, Any]]:
    """
    Send a progress notification.

    Args:
        coordination_id: Coordination identifier
        threshold: Progress threshold that was crossed
        actual_progress: Actual progress percentage

    Returns:
        Notification details if sent, None otherwise
    """
    try:
        # For now, just log the notification
        # In production, this would integrate with SNS or other notification services
        logger.info(f"Progress notification: {coordination_id} reached {threshold}% (actual: {actual_progress:.1f}%)")

        return {
            'coordination_id': coordination_id,
            'threshold': threshold,
            'actual_progress': actual_progress,
            'notification_sent_at': datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to send progress notification: {str(e)}")
        return None

def send_progress_notifications(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Send progress notifications based on event triggers.

    Args:
        event: Notification event
        context: Lambda context

    Returns:
        Notification result
    """
    # Implementation for sending various types of progress notifications
    notification_type = event.get('notification_type', 'progress')
    recipients = event.get('recipients', [])
    message = event.get('message', '')

    try:
        # Implementation would send actual notifications via SNS, email, etc.
        logger.info(f"Sending {notification_type} notification to {len(recipients)} recipients")

        return {
            'statusCode': 200,
            'notifications_sent': len(recipients),
            'notification_type': notification_type
        }

    except Exception as e:
        logger.error(f"Failed to send notifications: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e)
        }

def publish_progress_metrics(
    coordination_id: str,
    batch_progress: Dict[str, Any],
    overall_progress: Dict[str, Any]
) -> None:
    """
    Publish progress metrics to CloudWatch.

    Args:
        coordination_id: Coordination identifier
        batch_progress: Batch-level progress data
        overall_progress: Overall progress data
    """
    try:
        metric_data = [
            {
                'MetricName': 'BatchCompletionPercentage',
                'Dimensions': [
                    {'Name': 'CoordinationId', 'Value': coordination_id},
                    {'Name': 'BatchId', 'Value': batch_progress.get('batch_id', '')}
                ],
                'Value': batch_progress.get('completion_percentage', 0),
                'Unit': 'Percent'
            },
            {
                'MetricName': 'OverallProgressPercentage',
                'Dimensions': [
                    {'Name': 'CoordinationId', 'Value': coordination_id}
                ],
                'Value': overall_progress.get('progress_percentage', 0),
                'Unit': 'Percent'
            },
            {
                'MetricName': 'ProcessingErrors',
                'Dimensions': [
                    {'Name': 'CoordinationId', 'Value': coordination_id}
                ],
                'Value': overall_progress.get('total_errors', 0),
                'Unit': 'Count'
            }
        ]

        cloudwatch.put_metric_data(
            Namespace='GovBizAI/ProgressTracking',
            MetricData=metric_data
        )

    except Exception as e:
        logger.warning(f"Failed to publish progress metrics: {str(e)}")

def publish_health_metrics(health_status: Dict[str, Any]) -> None:
    """
    Publish health monitoring metrics to CloudWatch.

    Args:
        health_status: Health status data
    """
    try:
        metric_data = [
            {
                'MetricName': 'ActiveCoordinations',
                'Value': health_status['active_coordinations'],
                'Unit': 'Count'
            },
            {
                'MetricName': 'HealthyCoordinations',
                'Value': health_status['healthy_count'],
                'Unit': 'Count'
            },
            {
                'MetricName': 'StalledCoordinations',
                'Value': health_status['stalled_count'],
                'Unit': 'Count'
            },
            {
                'MetricName': 'ErrorCoordinations',
                'Value': health_status['error_count'],
                'Unit': 'Count'
            }
        ]

        cloudwatch.put_metric_data(
            Namespace='GovBizAI/ProcessingHealth',
            MetricData=metric_data
        )

    except Exception as e:
        logger.warning(f"Failed to publish health metrics: {str(e)}")