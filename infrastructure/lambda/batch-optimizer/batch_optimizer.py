"""
AWS Lambda Function: Batch Size Optimizer
Dynamically optimizes batch sizes based on processing performance and AWS limits.
"""

import json
import boto3
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Tuple
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
cloudwatch = boto3.client('cloudwatch')
dynamodb = boto3.resource('dynamodb')
stepfunctions = boto3.client('stepfunctions')

# Configuration
METRICS_RETENTION_DAYS = 7
MIN_BATCH_SIZE = 10
MAX_BATCH_SIZE = 1000
DEFAULT_BATCH_SIZE = 100
PERFORMANCE_THRESHOLD_SECONDS = 5.0
ERROR_RATE_THRESHOLD = 0.05

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main handler for batch size optimization.

    Args:
        event: Input event with optimization parameters
        context: Lambda context object

    Returns:
        Optimized batch configuration
    """
    try:
        logger.info(f"Starting batch optimization with event: {json.dumps(event)}")

        # Extract parameters
        processing_type = event.get('processing_type', 'opportunities')
        target_latency = event.get('target_latency_seconds', PERFORMANCE_THRESHOLD_SECONDS)
        current_batch_size = event.get('current_batch_size', DEFAULT_BATCH_SIZE)

        # Get historical performance metrics
        performance_metrics = get_performance_metrics(processing_type)

        # Calculate optimal batch size
        optimal_batch_size = calculate_optimal_batch_size(
            performance_metrics,
            target_latency,
            current_batch_size
        )

        # Determine concurrency settings
        concurrency_config = calculate_concurrency_settings(
            optimal_batch_size,
            performance_metrics
        )

        # Store optimization decision
        store_optimization_decision(processing_type, optimal_batch_size, concurrency_config)

        result = {
            'statusCode': 200,
            'optimized_batch_size': optimal_batch_size,
            'concurrency_config': concurrency_config,
            'performance_metrics': performance_metrics,
            'optimization_timestamp': datetime.utcnow().isoformat(),
            'processing_type': processing_type
        }

        logger.info(f"Optimization complete: {json.dumps(result)}")
        return result

    except Exception as e:
        logger.error(f"Batch optimization failed: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e),
            'fallback_batch_size': DEFAULT_BATCH_SIZE,
            'fallback_concurrency': 10
        }

def get_performance_metrics(processing_type: str) -> Dict[str, Any]:
    """
    Retrieve historical performance metrics from CloudWatch.

    Args:
        processing_type: Type of processing to get metrics for

    Returns:
        Performance metrics dictionary
    """
    try:
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(days=METRICS_RETENTION_DAYS)

        # Get average processing duration
        duration_response = cloudwatch.get_metric_statistics(
            Namespace='GovBizAI/BatchProcessing',
            MetricName='ProcessingDuration',
            Dimensions=[
                {
                    'Name': 'ProcessingType',
                    'Value': processing_type
                }
            ],
            StartTime=start_time,
            EndTime=end_time,
            Period=3600,  # 1 hour
            Statistics=['Average', 'Maximum']
        )

        # Get error rate
        error_response = cloudwatch.get_metric_statistics(
            Namespace='GovBizAI/BatchProcessing',
            MetricName='ErrorRate',
            Dimensions=[
                {
                    'Name': 'ProcessingType',
                    'Value': processing_type
                }
            ],
            StartTime=start_time,
            EndTime=end_time,
            Period=3600,
            Statistics=['Average']
        )

        # Get throughput metrics
        throughput_response = cloudwatch.get_metric_statistics(
            Namespace='GovBizAI/BatchProcessing',
            MetricName='ItemsProcessedPerSecond',
            Dimensions=[
                {
                    'Name': 'ProcessingType',
                    'Value': processing_type
                }
            ],
            StartTime=start_time,
            EndTime=end_time,
            Period=3600,
            Statistics=['Average', 'Maximum']
        )

        # Process metrics
        avg_duration = calculate_average_metric(duration_response['Datapoints'], 'Average')
        max_duration = calculate_average_metric(duration_response['Datapoints'], 'Maximum')
        avg_error_rate = calculate_average_metric(error_response['Datapoints'], 'Average')
        avg_throughput = calculate_average_metric(throughput_response['Datapoints'], 'Average')

        return {
            'average_duration_seconds': avg_duration,
            'maximum_duration_seconds': max_duration,
            'average_error_rate': avg_error_rate,
            'average_throughput_items_per_second': avg_throughput,
            'data_points_count': len(duration_response['Datapoints']),
            'metrics_period_days': METRICS_RETENTION_DAYS
        }

    except Exception as e:
        logger.warning(f"Failed to get performance metrics: {str(e)}")
        return {
            'average_duration_seconds': PERFORMANCE_THRESHOLD_SECONDS,
            'maximum_duration_seconds': PERFORMANCE_THRESHOLD_SECONDS * 2,
            'average_error_rate': 0.0,
            'average_throughput_items_per_second': 1.0,
            'data_points_count': 0,
            'metrics_period_days': 0
        }

def calculate_average_metric(datapoints: List[Dict], statistic: str) -> float:
    """Calculate average value from CloudWatch datapoints."""
    if not datapoints:
        return 0.0

    values = [dp[statistic] for dp in datapoints if statistic in dp]
    return sum(values) / len(values) if values else 0.0

def calculate_optimal_batch_size(
    metrics: Dict[str, Any],
    target_latency: float,
    current_batch_size: int
) -> int:
    """
    Calculate optimal batch size based on performance metrics.

    Args:
        metrics: Historical performance metrics
        target_latency: Target processing latency in seconds
        current_batch_size: Current batch size

    Returns:
        Optimal batch size
    """
    avg_duration = metrics['average_duration_seconds']
    error_rate = metrics['average_error_rate']
    throughput = metrics['average_throughput_items_per_second']

    # If no historical data, return default
    if metrics['data_points_count'] == 0:
        return DEFAULT_BATCH_SIZE

    # If error rate is too high, reduce batch size
    if error_rate > ERROR_RATE_THRESHOLD:
        new_batch_size = max(MIN_BATCH_SIZE, current_batch_size // 2)
        logger.info(f"High error rate ({error_rate:.3f}), reducing batch size to {new_batch_size}")
        return new_batch_size

    # If processing is too slow, reduce batch size
    if avg_duration > target_latency:
        reduction_factor = target_latency / avg_duration
        new_batch_size = max(MIN_BATCH_SIZE, int(current_batch_size * reduction_factor))
        logger.info(f"Slow processing ({avg_duration:.2f}s), reducing batch size to {new_batch_size}")
        return new_batch_size

    # If processing is fast and error rate is low, try to increase batch size
    if avg_duration < target_latency * 0.7 and error_rate < ERROR_RATE_THRESHOLD * 0.5:
        increase_factor = min(1.5, target_latency / avg_duration)
        new_batch_size = min(MAX_BATCH_SIZE, int(current_batch_size * increase_factor))
        logger.info(f"Fast processing ({avg_duration:.2f}s), increasing batch size to {new_batch_size}")
        return new_batch_size

    # Current batch size is optimal
    logger.info(f"Current batch size ({current_batch_size}) is optimal")
    return current_batch_size

def calculate_concurrency_settings(
    batch_size: int,
    metrics: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Calculate optimal concurrency settings based on batch size and performance.

    Args:
        batch_size: Optimized batch size
        metrics: Performance metrics

    Returns:
        Concurrency configuration
    """
    # Base concurrency on batch size and throughput
    base_concurrency = max(1, min(50, batch_size // 20))

    # Adjust based on error rate
    error_rate = metrics['average_error_rate']
    if error_rate > ERROR_RATE_THRESHOLD:
        concurrency_adjustment = 0.5
    elif error_rate < ERROR_RATE_THRESHOLD * 0.5:
        concurrency_adjustment = 1.2
    else:
        concurrency_adjustment = 1.0

    max_concurrency = max(1, int(base_concurrency * concurrency_adjustment))

    return {
        'max_concurrency': max_concurrency,
        'batch_size': batch_size,
        'estimated_parallel_batches': max_concurrency,
        'estimated_total_capacity': max_concurrency * batch_size,
        'retry_config': {
            'max_attempts': 3,
            'backoff_rate': 2.0,
            'interval_seconds': 2
        }
    }

def store_optimization_decision(
    processing_type: str,
    batch_size: int,
    concurrency_config: Dict[str, Any]
) -> None:
    """
    Store optimization decision for audit and monitoring.

    Args:
        processing_type: Type of processing
        batch_size: Optimized batch size
        concurrency_config: Concurrency configuration
    """
    try:
        table = dynamodb.Table('govbizai-batch-optimization-history')

        item = {
            'processing_type': processing_type,
            'timestamp': datetime.utcnow().isoformat(),
            'batch_size': batch_size,
            'concurrency_config': concurrency_config,
            'ttl': int((datetime.utcnow() + timedelta(days=30)).timestamp())
        }

        table.put_item(Item=item)
        logger.info(f"Stored optimization decision for {processing_type}")

    except Exception as e:
        logger.warning(f"Failed to store optimization decision: {str(e)}")

def publish_metrics(processing_type: str, batch_size: int, duration: float) -> None:
    """
    Publish optimization metrics to CloudWatch.

    Args:
        processing_type: Type of processing
        batch_size: Current batch size
        duration: Processing duration
    """
    try:
        cloudwatch.put_metric_data(
            Namespace='GovBizAI/BatchOptimization',
            MetricData=[
                {
                    'MetricName': 'OptimizedBatchSize',
                    'Dimensions': [
                        {
                            'Name': 'ProcessingType',
                            'Value': processing_type
                        }
                    ],
                    'Value': batch_size,
                    'Unit': 'Count'
                },
                {
                    'MetricName': 'OptimizationDuration',
                    'Dimensions': [
                        {
                            'Name': 'ProcessingType',
                            'Value': processing_type
                        }
                    ],
                    'Value': duration,
                    'Unit': 'Seconds'
                }
            ]
        )
    except Exception as e:
        logger.warning(f"Failed to publish metrics: {str(e)}")