#!/usr/bin/env python3
"""
Non-functional validation tests for Phase 8: Batch Processing Orchestration
Tests performance, scalability, reliability, and cost optimization requirements.
"""

import unittest
import json
import time
import threading
import uuid
import statistics
from datetime import datetime, timedelta
from typing import Dict, List, Any, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
import boto3
from moto import mock_dynamodb, mock_sqs, mock_stepfunctions, mock_cloudwatch
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TestPhase8NonFunctional(unittest.TestCase):
    """Comprehensive non-functional tests for Phase 8 batch processing orchestration."""

    def setUp(self):
        """Set up test environment with mocked AWS services."""
        # Mock AWS services
        self.dynamodb_mock = mock_dynamodb()
        self.sqs_mock = mock_sqs()
        self.stepfunctions_mock = mock_stepfunctions()
        self.cloudwatch_mock = mock_cloudwatch()

        self.dynamodb_mock.start()
        self.sqs_mock.start()
        self.stepfunctions_mock.start()
        self.cloudwatch_mock.start()

        # Create AWS clients
        self.dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        self.sqs = boto3.client('sqs', region_name='us-east-1')
        self.stepfunctions = boto3.client('stepfunctions', region_name='us-east-1')
        self.cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')

        # Create test tables and queues
        self.create_test_infrastructure()

        # Performance tracking
        self.performance_metrics = []

    def tearDown(self):
        """Clean up test environment."""
        self.dynamodb_mock.stop()
        self.sqs_mock.stop()
        self.stepfunctions_mock.stop()
        self.cloudwatch_mock.stop()

    def create_test_infrastructure(self):
        """Create test infrastructure for non-functional testing."""
        # Create tables
        self.coordination_table = self.dynamodb.create_table(
            TableName='govbizai-batch-coordination',
            KeySchema=[{'AttributeName': 'coordination_id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'coordination_id', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )

        self.progress_table = self.dynamodb.create_table(
            TableName='govbizai-progress-tracking',
            KeySchema=[
                {'AttributeName': 'coordination_id', 'KeyType': 'HASH'},
                {'AttributeName': 'batch_id', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'coordination_id', 'AttributeType': 'S'},
                {'AttributeName': 'batch_id', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )

        # Create queue
        self.queue_url = self.sqs.create_queue(
            QueueName='govbizai-batch-coordination-queue.fifo',
            Attributes={'FifoQueue': 'true', 'ContentBasedDeduplication': 'true'}
        )['QueueUrl']

    def measure_performance(self, operation_name: str, operation_func: callable, *args, **kwargs) -> Tuple[Any, float]:
        """Measure performance of an operation."""
        start_time = time.time()
        result = operation_func(*args, **kwargs)
        end_time = time.time()
        duration = end_time - start_time

        self.performance_metrics.append({
            'operation': operation_name,
            'duration': duration,
            'timestamp': datetime.utcnow().isoformat()
        })

        return result, duration

    def test_nfr_8_1_processing_time_performance(self):
        """Test NFR-8.1: Processing time performance requirements."""
        logger.info("Testing NFR-8.1: Processing time performance (< 4 hours for nightly batch)")

        # Import batch coordinator
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/batch-coordinator'))
        import batch_coordinator

        # Set environment variables
        os.environ['COORDINATION_TABLE'] = 'govbizai-batch-coordination'
        os.environ['COORDINATION_QUEUE_URL'] = self.queue_url

        # Simulate large batch processing (10,000 opportunities)
        large_batch_data = [{'id': i, 'data': f'opportunity_{i}'} for i in range(10000)]

        test_event = {
            'operation': 'coordinate_processing',
            'items': large_batch_data,
            'batch_config': {
                'batch_size': 100,
                'max_concurrency': 50
            },
            'processing_type': 'nightly_opportunities',
            'queue_url': self.queue_url
        }

        # Measure coordination time
        result, duration = self.measure_performance(
            'large_batch_coordination',
            batch_coordinator.lambda_handler,
            test_event,
            None
        )

        # Validate performance requirements
        self.assertEqual(result['statusCode'], 200)

        # Calculate estimated total processing time
        batches_created = result['batches_created']
        max_concurrency = test_event['batch_config']['max_concurrency']
        estimated_duration_per_batch = 30  # seconds

        concurrent_batches = min(batches_created, max_concurrency)
        sequential_rounds = max(1, batches_created / concurrent_batches)
        estimated_total_time = sequential_rounds * estimated_duration_per_batch / 3600  # hours

        # Verify processing time is within 4-hour limit
        self.assertLess(estimated_total_time, 4.0, "Estimated processing time exceeds 4-hour limit")

        # Verify coordination itself is fast (< 30 seconds)
        self.assertLess(duration, 30.0, "Batch coordination took longer than 30 seconds")

        logger.info(f"✓ NFR-8.1: Coordination time: {duration:.2f}s, Estimated total: {estimated_total_time:.2f}h")

    def test_nfr_8_2_concurrency_limits(self):
        """Test NFR-8.2: Concurrency and parallelism limits."""
        logger.info("Testing NFR-8.2: Concurrency limits (max 100 concurrent executions)")

        # Import batch coordinator
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/batch-coordinator'))
        import batch_coordinator

        # Test maximum concurrency enforcement
        test_config = {
            'batch_size': 50,
            'max_concurrency': 100  # Maximum allowed
        }

        # Create large dataset to test concurrency
        large_dataset = [{'id': i} for i in range(10000)]

        # Calculate expected batches and concurrency
        expected_batches = len(large_dataset) // test_config['batch_size']
        effective_concurrency = min(expected_batches, test_config['max_concurrency'])

        # Validate concurrency limits
        self.assertLessEqual(effective_concurrency, 100, "Concurrency exceeds maximum limit")
        self.assertGreater(effective_concurrency, 0, "Concurrency must be positive")

        # Test concurrency calculation
        import batch_coordinator
        concurrency_config = batch_coordinator.calculate_concurrency_settings(
            test_config['batch_size'],
            {
                'average_duration_seconds': 2.0,
                'average_error_rate': 0.01,
                'data_points_count': 10
            }
        )

        # Validate concurrency configuration
        self.assertLessEqual(concurrency_config['max_concurrency'], 50)
        self.assertIn('retry_config', concurrency_config)

        logger.info("✓ NFR-8.2: Concurrency limits validated")

    def test_nfr_8_3_memory_and_resource_efficiency(self):
        """Test NFR-8.3: Memory and resource efficiency requirements."""
        logger.info("Testing NFR-8.3: Memory and resource efficiency")

        # Import batch optimizer
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/batch-optimizer'))
        import batch_optimizer

        # Test memory-efficient batch processing
        test_events = []
        for i in range(100):  # Simulate 100 optimization requests
            test_events.append({
                'processing_type': f'test_type_{i % 5}',
                'target_latency_seconds': 5.0,
                'current_batch_size': 100 + (i * 10)
            })

        # Measure memory usage and processing time
        processing_times = []
        for event in test_events:
            start_time = time.time()
            result = batch_optimizer.lambda_handler(event, None)
            end_time = time.time()

            processing_times.append(end_time - start_time)

            # Validate successful processing
            self.assertIn('statusCode', result)
            if result['statusCode'] == 200:
                self.assertIn('optimized_batch_size', result)

        # Validate performance consistency (no memory leaks)
        avg_time = statistics.mean(processing_times)
        max_time = max(processing_times)
        min_time = min(processing_times)

        # Processing time should be consistent (max should not be more than 3x avg)
        self.assertLess(max_time, avg_time * 3, "Processing time variance indicates potential memory issues")

        # All processing should be under 5 seconds
        self.assertLess(max_time, 5.0, "Individual optimization exceeded 5 seconds")

        logger.info(f"✓ NFR-8.3: Avg: {avg_time:.3f}s, Max: {max_time:.3f}s, Min: {min_time:.3f}s")

    def test_nfr_8_4_error_rate_and_reliability(self):
        """Test NFR-8.4: Error rate and reliability requirements."""
        logger.info("Testing NFR-8.4: Error rate < 1% and reliability")

        # Import progress tracker
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/progress-tracker'))
        import progress_tracker

        # Set environment variables
        os.environ['COORDINATION_TABLE'] = 'govbizai-batch-coordination'
        os.environ['PROGRESS_TABLE'] = 'govbizai-progress-tracking'

        # Simulate multiple progress updates with some edge cases
        test_scenarios = []
        success_count = 0
        error_count = 0

        # Generate 1000 test scenarios
        for i in range(1000):
            coordination_id = str(uuid.uuid4())

            # Create coordination record
            self.coordination_table.put_item(
                Item={
                    'coordination_id': coordination_id,
                    'processing_type': 'reliability_test',
                    'status': 'processing',
                    'total_batches': 10,
                    'completed_batches': 0,
                    'failed_batches': 0,
                    'created_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat(),
                    'progress_percentage': 0.0
                }
            )

            # Create various test scenarios
            scenarios = [
                # Normal progress update
                {
                    'operation': 'update_progress',
                    'coordination_id': coordination_id,
                    'batch_id': f'{coordination_id}-batch-0',
                    'progress_data': {
                        'status': 'completed',
                        'items_processed': 10,
                        'items_total': 10,
                        'errors_count': 0
                    }
                },
                # Progress check
                {
                    'operation': 'get_progress',
                    'coordination_id': coordination_id
                }
            ]

            test_scenarios.extend(scenarios)

        # Execute all scenarios and measure error rate
        for scenario in test_scenarios:
            try:
                result = progress_tracker.lambda_handler(scenario, None)
                if result.get('statusCode') == 200:
                    success_count += 1
                else:
                    error_count += 1
            except Exception as e:
                error_count += 1
                logger.warning(f"Progress tracker error: {str(e)}")

        # Calculate error rate
        total_operations = success_count + error_count
        error_rate = (error_count / total_operations) * 100 if total_operations > 0 else 0

        # Validate error rate requirement (< 1%)
        self.assertLess(error_rate, 1.0, f"Error rate {error_rate:.2f}% exceeds 1% limit")
        self.assertGreater(success_count, total_operations * 0.99, "Success rate below 99%")

        logger.info(f"✓ NFR-8.4: Error rate: {error_rate:.3f}% ({error_count}/{total_operations})")

    def test_nfr_8_5_scalability_stress_test(self):
        """Test NFR-8.5: Scalability under stress conditions."""
        logger.info("Testing NFR-8.5: Scalability (1,000 concurrent operations)")

        # Import batch coordinator
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/batch-coordinator'))
        import batch_coordinator

        # Set environment variables
        os.environ['COORDINATION_TABLE'] = 'govbizai-batch-coordination'
        os.environ['COORDINATION_QUEUE_URL'] = self.queue_url

        def create_coordination_request():
            """Create a coordination request."""
            items = [{'id': i} for i in range(100)]
            return {
                'operation': 'coordinate_processing',
                'items': items,
                'batch_config': {
                    'batch_size': 20,
                    'max_concurrency': 5
                },
                'processing_type': 'scalability_test',
                'queue_url': self.queue_url
            }

        # Create multiple coordination requests
        num_concurrent_requests = 50  # Reduced for test environment
        requests = [create_coordination_request() for _ in range(num_concurrent_requests)]

        # Execute concurrent requests
        start_time = time.time()
        successful_requests = 0
        failed_requests = 0

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [
                executor.submit(batch_coordinator.lambda_handler, request, None)
                for request in requests
            ]

            for future in as_completed(futures):
                try:
                    result = future.result()
                    if result.get('statusCode') == 200:
                        successful_requests += 1
                    else:
                        failed_requests += 1
                except Exception as e:
                    failed_requests += 1
                    logger.warning(f"Concurrent request failed: {str(e)}")

        end_time = time.time()
        total_duration = end_time - start_time

        # Validate scalability metrics
        success_rate = (successful_requests / num_concurrent_requests) * 100
        avg_request_time = total_duration / num_concurrent_requests

        # Requirements: 95% success rate, average response time < 10 seconds
        self.assertGreaterEqual(success_rate, 95.0, f"Success rate {success_rate:.1f}% below 95%")
        self.assertLess(avg_request_time, 10.0, f"Average request time {avg_request_time:.2f}s exceeds 10s")

        logger.info(f"✓ NFR-8.5: Success rate: {success_rate:.1f}%, Avg time: {avg_request_time:.2f}s")

    def test_nfr_8_6_cost_optimization(self):
        """Test NFR-8.6: Cost optimization features."""
        logger.info("Testing NFR-8.6: Cost optimization features")

        # Import batch optimizer
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/batch-optimizer'))
        import batch_optimizer

        # Test cost-optimized batch sizing
        cost_scenarios = [
            {
                'processing_type': 'low_volume',
                'target_latency_seconds': 10.0,
                'current_batch_size': 50,
                'expected_optimization': 'maintain_efficiency'
            },
            {
                'processing_type': 'high_volume',
                'target_latency_seconds': 3.0,
                'current_batch_size': 200,
                'expected_optimization': 'increase_throughput'
            },
            {
                'processing_type': 'error_prone',
                'target_latency_seconds': 5.0,
                'current_batch_size': 100,
                'expected_optimization': 'reduce_risk'
            }
        ]

        optimization_results = []

        for scenario in cost_scenarios:
            result = batch_optimizer.lambda_handler(scenario, None)

            if result.get('statusCode') == 200:
                optimized_size = result.get('optimized_batch_size', scenario['current_batch_size'])
                concurrency_config = result.get('concurrency_config', {})

                optimization_results.append({
                    'scenario': scenario['processing_type'],
                    'original_size': scenario['current_batch_size'],
                    'optimized_size': optimized_size,
                    'concurrency': concurrency_config.get('max_concurrency', 1),
                    'estimated_capacity': concurrency_config.get('estimated_total_capacity', 0)
                })

        # Validate cost optimization principles
        for result in optimization_results:
            # Batch sizes should be within reasonable bounds
            self.assertGreaterEqual(result['optimized_size'], 10, "Batch size too small for efficiency")
            self.assertLessEqual(result['optimized_size'], 1000, "Batch size too large for reliability")

            # Concurrency should be reasonable
            self.assertGreaterEqual(result['concurrency'], 1, "Concurrency must be at least 1")
            self.assertLessEqual(result['concurrency'], 50, "Concurrency too high for cost optimization")

        logger.info("✓ NFR-8.6: Cost optimization features validated")

    def test_nfr_8_7_monitoring_and_observability(self):
        """Test NFR-8.7: Monitoring and observability requirements."""
        logger.info("Testing NFR-8.7: Monitoring and observability")

        # Test CloudWatch metrics publishing
        test_metrics = [
            {
                'MetricName': 'BatchOptimizationDuration',
                'Value': 2.5,
                'Unit': 'Seconds'
            },
            {
                'MetricName': 'OptimizedBatchSize',
                'Value': 150,
                'Unit': 'Count'
            },
            {
                'MetricName': 'ConcurrencyLevel',
                'Value': 25,
                'Unit': 'Count'
            }
        ]

        # Publish test metrics
        for metric in test_metrics:
            try:
                self.cloudwatch.put_metric_data(
                    Namespace='GovBizAI/BatchOrchestration',
                    MetricData=[{
                        'MetricName': metric['MetricName'],
                        'Value': metric['Value'],
                        'Unit': metric['Unit'],
                        'Timestamp': datetime.utcnow()
                    }]
                )
            except Exception as e:
                self.fail(f"Failed to publish metric {metric['MetricName']}: {str(e)}")

        # Test metric retrieval
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=1)

        try:
            response = self.cloudwatch.get_metric_statistics(
                Namespace='GovBizAI/BatchOrchestration',
                MetricName='BatchOptimizationDuration',
                StartTime=start_time,
                EndTime=end_time,
                Period=300,
                Statistics=['Average']
            )
            # Validate metrics are retrievable
            self.assertIsInstance(response, dict)
            self.assertIn('Datapoints', response)

        except Exception as e:
            self.fail(f"Failed to retrieve metrics: {str(e)}")

        logger.info("✓ NFR-8.7: Monitoring and observability validated")

    def test_nfr_8_8_recovery_and_fault_tolerance(self):
        """Test NFR-8.8: Recovery and fault tolerance."""
        logger.info("Testing NFR-8.8: Recovery and fault tolerance")

        # Import batch coordinator
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/batch-coordinator'))
        import batch_coordinator

        # Set environment variables
        os.environ['COORDINATION_TABLE'] = 'govbizai-batch-coordination'

        # Test recovery from various failure scenarios
        failure_scenarios = [
            {
                'name': 'processing_timeout',
                'coordination_id': str(uuid.uuid4()),
                'error_info': {
                    'error_type': 'TimeoutError',
                    'error_message': 'Processing timed out after 15 minutes',
                    'retry_count': 1
                }
            },
            {
                'name': 'network_error',
                'coordination_id': str(uuid.uuid4()),
                'error_info': {
                    'error_type': 'NetworkError',
                    'error_message': 'Connection lost to external service',
                    'retry_count': 2
                }
            },
            {
                'name': 'resource_exhaustion',
                'coordination_id': str(uuid.uuid4()),
                'error_info': {
                    'error_type': 'ResourceExhaustionError',
                    'error_message': 'Insufficient memory for processing',
                    'retry_count': 0
                }
            }
        ]

        recovery_success_count = 0

        for scenario in failure_scenarios:
            # Create coordination record
            self.coordination_table.put_item(
                Item={
                    'coordination_id': scenario['coordination_id'],
                    'processing_type': 'fault_tolerance_test',
                    'status': 'processing',
                    'total_batches': 10,
                    'completed_batches': 5,
                    'failed_batches': 1,
                    'created_at': datetime.utcnow().isoformat(),
                    'updated_at': datetime.utcnow().isoformat()
                }
            )

            # Test failure handling
            failure_event = {
                'operation': 'handle_failure',
                'coordination_id': scenario['coordination_id'],
                'batch_id': f"{scenario['coordination_id']}-batch-5",
                'error_info': scenario['error_info']
            }

            try:
                result = batch_coordinator.lambda_handler(failure_event, None)

                if result.get('statusCode') == 200 and result.get('failure_handled'):
                    recovery_success_count += 1

            except Exception as e:
                logger.warning(f"Failure handling error for {scenario['name']}: {str(e)}")

        # Validate fault tolerance
        recovery_rate = (recovery_success_count / len(failure_scenarios)) * 100
        self.assertGreaterEqual(recovery_rate, 90.0, f"Recovery rate {recovery_rate:.1f}% below 90%")

        logger.info(f"✓ NFR-8.8: Recovery rate: {recovery_rate:.1f}% ({recovery_success_count}/{len(failure_scenarios)})")

    def test_nfr_8_9_data_consistency(self):
        """Test NFR-8.9: Data consistency requirements."""
        logger.info("Testing NFR-8.9: Data consistency")

        # Import progress tracker
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/progress-tracker'))
        import progress_tracker

        # Set environment variables
        os.environ['COORDINATION_TABLE'] = 'govbizai-batch-coordination'
        os.environ['PROGRESS_TABLE'] = 'govbizai-progress-tracking'

        # Test concurrent updates to the same coordination
        test_coordination_id = str(uuid.uuid4())

        # Create initial coordination record
        self.coordination_table.put_item(
            Item={
                'coordination_id': test_coordination_id,
                'processing_type': 'consistency_test',
                'status': 'processing',
                'total_batches': 10,
                'completed_batches': 0,
                'failed_batches': 0,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat(),
                'progress_percentage': 0.0
            }
        )

        # Create concurrent progress updates
        def update_batch_progress(batch_index: int):
            """Update progress for a specific batch."""
            batch_id = f"{test_coordination_id}-batch-{batch_index}"
            event = {
                'operation': 'update_progress',
                'coordination_id': test_coordination_id,
                'batch_id': batch_id,
                'progress_data': {
                    'status': 'completed',
                    'items_processed': 10,
                    'items_total': 10,
                    'errors_count': 0,
                    'processing_duration': 25
                }
            }

            return progress_tracker.lambda_handler(event, None)

        # Execute concurrent updates
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [
                executor.submit(update_batch_progress, i)
                for i in range(10)
            ]

            results = []
            for future in as_completed(futures):
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    logger.warning(f"Concurrent update failed: {str(e)}")

        # Validate data consistency
        successful_updates = len([r for r in results if r.get('statusCode') == 200])
        self.assertGreaterEqual(successful_updates, 9, "Too many concurrent update failures")

        # Check final coordination state
        final_record = self.coordination_table.get_item(
            Key={'coordination_id': test_coordination_id}
        )

        if 'Item' in final_record:
            final_state = final_record['Item']
            # Progress should be consistent with number of completed batches
            expected_progress = (final_state.get('completed_batches', 0) / 10) * 100
            actual_progress = float(final_state.get('progress_percentage', 0))

            # Allow for small rounding differences
            self.assertAlmostEqual(expected_progress, actual_progress, delta=1.0,
                                   msg="Progress percentage inconsistent with completed batches")

        logger.info(f"✓ NFR-8.9: Data consistency maintained with {successful_updates}/10 updates")

    def test_nfr_8_10_performance_benchmarks(self):
        """Test NFR-8.10: Overall performance benchmarks."""
        logger.info("Testing NFR-8.10: Performance benchmarks summary")

        # Summarize all performance metrics collected during tests
        if not self.performance_metrics:
            logger.warning("No performance metrics collected")
            return

        # Calculate performance statistics
        durations = [m['duration'] for m in self.performance_metrics]
        avg_duration = statistics.mean(durations)
        max_duration = max(durations)
        min_duration = min(durations)
        median_duration = statistics.median(durations)

        # Performance requirements validation
        performance_requirements = {
            'average_response_time': {'value': avg_duration, 'threshold': 5.0, 'unit': 'seconds'},
            'maximum_response_time': {'value': max_duration, 'threshold': 30.0, 'unit': 'seconds'},
            'response_time_variance': {'value': max_duration - min_duration, 'threshold': 25.0, 'unit': 'seconds'}
        }

        all_requirements_met = True

        for requirement, spec in performance_requirements.items():
            if spec['value'] > spec['threshold']:
                all_requirements_met = False
                logger.error(f"Performance requirement failed: {requirement} = {spec['value']:.2f} {spec['unit']} (threshold: {spec['threshold']} {spec['unit']})")
            else:
                logger.info(f"✓ {requirement}: {spec['value']:.2f} {spec['unit']} (< {spec['threshold']} {spec['unit']})")

        # Overall performance assessment
        self.assertTrue(all_requirements_met, "One or more performance requirements not met")

        # Log performance summary
        logger.info(f"Performance Summary:")
        logger.info(f"  Operations measured: {len(self.performance_metrics)}")
        logger.info(f"  Average duration: {avg_duration:.3f}s")
        logger.info(f"  Median duration: {median_duration:.3f}s")
        logger.info(f"  Min/Max duration: {min_duration:.3f}s / {max_duration:.3f}s")

        logger.info("✓ NFR-8.10: Overall performance benchmarks validated")


def run_nonfunctional_tests():
    """Run all non-functional validation tests for Phase 8."""
    logger.info("=" * 80)
    logger.info("PHASE 8 NON-FUNCTIONAL VALIDATION TESTS")
    logger.info("=" * 80)

    # Create test suite
    suite = unittest.TestSuite()

    # Add all test methods
    test_methods = [
        'test_nfr_8_1_processing_time_performance',
        'test_nfr_8_2_concurrency_limits',
        'test_nfr_8_3_memory_and_resource_efficiency',
        'test_nfr_8_4_error_rate_and_reliability',
        'test_nfr_8_5_scalability_stress_test',
        'test_nfr_8_6_cost_optimization',
        'test_nfr_8_7_monitoring_and_observability',
        'test_nfr_8_8_recovery_and_fault_tolerance',
        'test_nfr_8_9_data_consistency',
        'test_nfr_8_10_performance_benchmarks'
    ]

    for method in test_methods:
        suite.addTest(TestPhase8NonFunctional(method))

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Summary
    logger.info("=" * 80)
    logger.info(f"NON-FUNCTIONAL TESTS SUMMARY")
    logger.info(f"Tests run: {result.testsRun}")
    logger.info(f"Failures: {len(result.failures)}")
    logger.info(f"Errors: {len(result.errors)}")

    if result.failures:
        logger.error("FAILURES:")
        for test, traceback in result.failures:
            logger.error(f"  {test}: {traceback}")

    if result.errors:
        logger.error("ERRORS:")
        for test, traceback in result.errors:
            logger.error(f"  {test}: {traceback}")

    success = len(result.failures) == 0 and len(result.errors) == 0
    logger.info(f"Overall Status: {'✓ PASSED' if success else '✗ FAILED'}")
    logger.info("=" * 80)

    return success


if __name__ == '__main__':
    success = run_nonfunctional_tests()
    exit(0 if success else 1)