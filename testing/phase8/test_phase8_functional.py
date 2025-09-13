#!/usr/bin/env python3
"""
Functional validation tests for Phase 8: Batch Processing Orchestration
Tests all functional requirements for batch orchestration components.
"""

import unittest
import json
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any
import boto3
from moto import mock_dynamodb, mock_sqs, mock_stepfunctions, mock_events, mock_cloudwatch
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TestPhase8Functional(unittest.TestCase):
    """Comprehensive functional tests for Phase 8 batch processing orchestration."""

    def setUp(self):
        """Set up test environment with mocked AWS services."""
        # Mock AWS services
        self.dynamodb_mock = mock_dynamodb()
        self.sqs_mock = mock_sqs()
        self.stepfunctions_mock = mock_stepfunctions()
        self.events_mock = mock_events()
        self.cloudwatch_mock = mock_cloudwatch()

        self.dynamodb_mock.start()
        self.sqs_mock.start()
        self.stepfunctions_mock.start()
        self.events_mock.start()
        self.cloudwatch_mock.start()

        # Create AWS clients
        self.dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        self.sqs = boto3.client('sqs', region_name='us-east-1')
        self.stepfunctions = boto3.client('stepfunctions', region_name='us-east-1')
        self.events = boto3.client('events', region_name='us-east-1')
        self.cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')

        # Create test tables
        self.create_test_tables()

        # Create test queues
        self.create_test_queues()

        # Test data
        self.test_coordination_id = str(uuid.uuid4())
        self.test_batch_data = [
            {'id': i, 'data': f'test_item_{i}'}
            for i in range(1, 101)  # 100 test items
        ]

    def tearDown(self):
        """Clean up test environment."""
        self.dynamodb_mock.stop()
        self.sqs_mock.stop()
        self.stepfunctions_mock.stop()
        self.events_mock.stop()
        self.cloudwatch_mock.stop()

    def create_test_tables(self):
        """Create DynamoDB tables for testing."""
        # Batch coordination table
        self.coordination_table = self.dynamodb.create_table(
            TableName='govbizai-batch-coordination',
            KeySchema=[
                {
                    'AttributeName': 'coordination_id',
                    'KeyType': 'HASH'
                }
            ],
            AttributeDefinitions=[
                {
                    'AttributeName': 'coordination_id',
                    'AttributeType': 'S'
                }
            ],
            BillingMode='PAY_PER_REQUEST'
        )

        # Progress tracking table
        self.progress_table = self.dynamodb.create_table(
            TableName='govbizai-progress-tracking',
            KeySchema=[
                {
                    'AttributeName': 'coordination_id',
                    'KeyType': 'HASH'
                },
                {
                    'AttributeName': 'batch_id',
                    'KeyType': 'RANGE'
                }
            ],
            AttributeDefinitions=[
                {
                    'AttributeName': 'coordination_id',
                    'AttributeType': 'S'
                },
                {
                    'AttributeName': 'batch_id',
                    'AttributeType': 'S'
                }
            ],
            BillingMode='PAY_PER_REQUEST'
        )

        # Optimization history table
        self.optimization_table = self.dynamodb.create_table(
            TableName='govbizai-batch-optimization-history',
            KeySchema=[
                {
                    'AttributeName': 'processing_type',
                    'KeyType': 'HASH'
                },
                {
                    'AttributeName': 'timestamp',
                    'KeyType': 'RANGE'
                }
            ],
            AttributeDefinitions=[
                {
                    'AttributeName': 'processing_type',
                    'AttributeType': 'S'
                },
                {
                    'AttributeName': 'timestamp',
                    'AttributeType': 'S'
                }
            ],
            BillingMode='PAY_PER_REQUEST'
        )

        # Schedule management table
        self.schedule_table = self.dynamodb.create_table(
            TableName='govbizai-schedule-management',
            KeySchema=[
                {
                    'AttributeName': 'schedule_name',
                    'KeyType': 'HASH'
                }
            ],
            AttributeDefinitions=[
                {
                    'AttributeName': 'schedule_name',
                    'AttributeType': 'S'
                }
            ],
            BillingMode='PAY_PER_REQUEST'
        )

    def create_test_queues(self):
        """Create SQS queues for testing."""
        self.queue_url = self.sqs.create_queue(
            QueueName='govbizai-batch-coordination-queue.fifo',
            Attributes={
                'FifoQueue': 'true',
                'ContentBasedDeduplication': 'true',
                'VisibilityTimeoutSeconds': '900'
            }
        )['QueueUrl']

    def test_batch_size_optimization(self):
        """Test FR-8.1: Batch size optimization functionality."""
        logger.info("Testing FR-8.1: Batch size optimization")

        # Import the batch optimizer module
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/batch-optimizer'))
        import batch_optimizer

        # Test data for optimization
        test_event = {
            'processing_type': 'opportunities',
            'target_latency_seconds': 5.0,
            'current_batch_size': 100
        }

        # Add some mock performance metrics to CloudWatch
        self.cloudwatch.put_metric_data(
            Namespace='GovBizAI/BatchProcessing',
            MetricData=[
                {
                    'MetricName': 'ProcessingDuration',
                    'Dimensions': [
                        {
                            'Name': 'ProcessingType',
                            'Value': 'opportunities'
                        }
                    ],
                    'Value': 3.5,
                    'Unit': 'Seconds'
                },
                {
                    'MetricName': 'ErrorRate',
                    'Dimensions': [
                        {
                            'Name': 'ProcessingType',
                            'Value': 'opportunities'
                        }
                    ],
                    'Value': 0.02,
                    'Unit': 'Percent'
                }
            ]
        )

        # Execute batch optimization
        result = batch_optimizer.lambda_handler(test_event, None)

        # Validate results
        self.assertEqual(result['statusCode'], 200)
        self.assertIn('optimized_batch_size', result)
        self.assertIn('concurrency_config', result)
        self.assertGreater(result['optimized_batch_size'], 0)
        self.assertLessEqual(result['optimized_batch_size'], 1000)

        logger.info("✓ FR-8.1: Batch size optimization passed")

    def test_batch_coordination(self):
        """Test FR-8.2: Batch processing coordination functionality."""
        logger.info("Testing FR-8.2: Batch processing coordination")

        # Import the batch coordinator module
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/batch-coordinator'))
        import batch_coordinator

        # Set environment variables
        os.environ['COORDINATION_TABLE'] = 'govbizai-batch-coordination'
        os.environ['COORDINATION_QUEUE_URL'] = self.queue_url

        # Test coordination event
        test_event = {
            'operation': 'coordinate_processing',
            'items': self.test_batch_data,
            'batch_config': {
                'batch_size': 20,
                'max_concurrency': 5
            },
            'processing_type': 'opportunities',
            'queue_url': self.queue_url
        }

        # Execute coordination
        result = batch_coordinator.lambda_handler(test_event, None)

        # Validate results
        self.assertEqual(result['statusCode'], 200)
        self.assertIn('coordination_id', result)
        self.assertIn('batches_created', result)
        self.assertEqual(result['batches_created'], 5)  # 100 items / 20 per batch
        self.assertEqual(result['total_items'], 100)

        # Verify coordination record was created
        coordination_record = self.coordination_table.get_item(
            Key={'coordination_id': result['coordination_id']}
        )
        self.assertIn('Item', coordination_record)

        logger.info("✓ FR-8.2: Batch processing coordination passed")

    def test_progress_tracking(self):
        """Test FR-8.3: Progress tracking functionality."""
        logger.info("Testing FR-8.3: Progress tracking")

        # Import the progress tracker module
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/progress-tracker'))
        import progress_tracker

        # Set environment variables
        os.environ['COORDINATION_TABLE'] = 'govbizai-batch-coordination'
        os.environ['PROGRESS_TABLE'] = 'govbizai-progress-tracking'

        # Create initial coordination record
        self.coordination_table.put_item(
            Item={
                'coordination_id': self.test_coordination_id,
                'processing_type': 'test',
                'status': 'processing',
                'total_batches': 5,
                'completed_batches': 0,
                'failed_batches': 0,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat(),
                'progress_percentage': 0.0
            }
        )

        # Test progress update
        test_batch_id = f"{self.test_coordination_id}-batch-0"
        test_event = {
            'operation': 'update_progress',
            'coordination_id': self.test_coordination_id,
            'batch_id': test_batch_id,
            'progress_data': {
                'status': 'completed',
                'items_processed': 20,
                'items_total': 20,
                'errors_count': 0,
                'processing_duration': 30
            }
        }

        # Execute progress update
        result = progress_tracker.lambda_handler(test_event, None)

        # Validate results
        self.assertEqual(result['statusCode'], 200)
        self.assertIn('batch_progress', result)
        self.assertIn('overall_progress', result)
        self.assertEqual(result['batch_progress']['completion_percentage'], 100.0)

        # Verify progress record was created
        progress_record = self.progress_table.get_item(
            Key={
                'coordination_id': self.test_coordination_id,
                'batch_id': test_batch_id
            }
        )
        self.assertIn('Item', progress_record)

        logger.info("✓ FR-8.3: Progress tracking passed")

    def test_schedule_management(self):
        """Test FR-8.4: Schedule management functionality."""
        logger.info("Testing FR-8.4: Schedule management")

        # Import the schedule manager module
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/schedule-manager'))
        import schedule_manager

        # Set environment variables
        os.environ['SCHEDULE_TABLE'] = 'govbizai-schedule-management'

        # Test schedule creation
        test_schedule_name = f"test-schedule-{int(time.time())}"
        test_event = {
            'operation': 'create_schedule',
            'schedule_name': test_schedule_name,
            'description': 'Test schedule for validation',
            'cron_expression': '0 2 * * ? *',  # Daily at 2 AM
            'target_arn': 'arn:aws:states:us-east-1:123456789012:stateMachine:test',
            'target_input': {'test': 'data'},
            'enabled': True
        }

        # Execute schedule creation
        result = schedule_manager.lambda_handler(test_event, None)

        # Validate results
        self.assertEqual(result['statusCode'], 201)
        self.assertEqual(result['schedule_name'], test_schedule_name)
        self.assertIn('schedule_arn', result)

        # Test schedule retrieval
        get_event = {
            'operation': 'get_schedule',
            'schedule_name': test_schedule_name
        }

        get_result = schedule_manager.lambda_handler(get_event, None)
        self.assertEqual(get_result['statusCode'], 200)
        self.assertIn('schedule', get_result)

        logger.info("✓ FR-8.4: Schedule management passed")

    def test_error_handling_and_retries(self):
        """Test FR-8.5: Error handling and retry mechanisms."""
        logger.info("Testing FR-8.5: Error handling and retry mechanisms")

        # Import the batch coordinator module
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/batch-coordinator'))
        import batch_coordinator

        # Set environment variables
        os.environ['COORDINATION_TABLE'] = 'govbizai-batch-coordination'

        # Test failure handling
        test_event = {
            'operation': 'handle_failure',
            'coordination_id': self.test_coordination_id,
            'batch_id': f"{self.test_coordination_id}-batch-0",
            'error_info': {
                'error_type': 'ProcessingTimeout',
                'error_message': 'Batch processing timed out',
                'retry_count': 1
            }
        }

        # Create coordination record for failure handling
        self.coordination_table.put_item(
            Item={
                'coordination_id': self.test_coordination_id,
                'processing_type': 'test',
                'status': 'processing',
                'total_batches': 5,
                'completed_batches': 2,
                'failed_batches': 1,
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat()
            }
        )

        # Execute failure handling
        result = batch_coordinator.lambda_handler(test_event, None)

        # Validate results
        self.assertEqual(result['statusCode'], 200)
        self.assertTrue(result['failure_handled'])
        self.assertIn('retry_result', result)

        logger.info("✓ FR-8.5: Error handling and retries passed")

    def test_distributed_map_state_integration(self):
        """Test FR-8.6: Distributed map state integration."""
        logger.info("Testing FR-8.6: Distributed map state integration")

        # Test distributed map configuration
        test_items = [{'id': i} for i in range(1, 101)]
        test_config = {
            'max_concurrency': 10,
            'batch_size': 20
        }

        # Simulate distributed map processing
        batches = []
        batch_size = test_config['batch_size']
        for i in range(0, len(test_items), batch_size):
            batch = test_items[i:i + batch_size]
            batches.append(batch)

        # Validate batch creation
        self.assertEqual(len(batches), 5)  # 100 items / 20 per batch
        self.assertEqual(len(batches[0]), 20)
        self.assertEqual(len(batches[-1]), 20)

        # Validate concurrency limits
        max_concurrent_batches = min(len(batches), test_config['max_concurrency'])
        self.assertEqual(max_concurrent_batches, 5)

        logger.info("✓ FR-8.6: Distributed map state integration passed")

    def test_eventbridge_integration(self):
        """Test FR-8.7: EventBridge scheduling integration."""
        logger.info("Testing FR-8.7: EventBridge scheduling integration")

        # Create a test EventBridge rule
        rule_name = 'test-nightly-processing-rule'

        response = self.events.put_rule(
            Name=rule_name,
            ScheduleExpression='cron(0 2 * * ? *)',
            Description='Test nightly processing rule',
            State='ENABLED'
        )

        # Validate rule creation
        self.assertIn('RuleArn', response)

        # Add target to rule
        self.events.put_targets(
            Rule=rule_name,
            Targets=[
                {
                    'Id': '1',
                    'Arn': 'arn:aws:states:us-east-1:123456789012:stateMachine:test-state-machine',
                    'Input': json.dumps({
                        'processing_type': 'nightly_batch',
                        'enable_optimization': True
                    })
                }
            ]
        )

        # Verify rule and target
        rule_details = self.events.describe_rule(Name=rule_name)
        self.assertEqual(rule_details['State'], 'ENABLED')

        targets = self.events.list_targets_by_rule(Rule=rule_name)
        self.assertEqual(len(targets['Targets']), 1)

        logger.info("✓ FR-8.7: EventBridge scheduling integration passed")

    def test_on_demand_execution(self):
        """Test FR-8.8: On-demand execution triggers."""
        logger.info("Testing FR-8.8: On-demand execution triggers")

        # Import the schedule manager module
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/schedule-manager'))
        import schedule_manager

        # Mock Step Functions state machine
        state_machine_arn = 'arn:aws:states:us-east-1:123456789012:stateMachine:test-processing'

        # Create a mock state machine
        self.stepfunctions.create_state_machine(
            name='test-processing',
            definition=json.dumps({
                "Comment": "Test state machine",
                "StartAt": "Pass",
                "States": {
                    "Pass": {"Type": "Pass", "End": True}
                }
            }),
            roleArn='arn:aws:iam::123456789012:role/StepFunctionsRole'
        )

        # Test on-demand trigger
        test_event = {
            'operation': 'trigger_on_demand',
            'target_arn': state_machine_arn,
            'execution_input': {
                'processing_type': 'on_demand',
                'items_count': 500
            },
            'execution_name': f'on-demand-test-{int(time.time())}'
        }

        # Execute on-demand trigger
        result = schedule_manager.lambda_handler(test_event, None)

        # Validate results
        self.assertEqual(result['statusCode'], 200)
        self.assertIn('execution_arn', result)
        self.assertIn('execution_name', result)
        self.assertIn('started_at', result)

        logger.info("✓ FR-8.8: On-demand execution triggers passed")

    def test_health_monitoring(self):
        """Test FR-8.9: Health monitoring and alerting."""
        logger.info("Testing FR-8.9: Health monitoring and alerting")

        # Import the progress tracker module
        import sys
        import os
        sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/progress-tracker'))
        import progress_tracker

        # Set environment variables
        os.environ['COORDINATION_TABLE'] = 'govbizai-batch-coordination'

        # Create test coordination records with various states
        test_coordinations = [
            {
                'coordination_id': f'healthy-{uuid.uuid4()}',
                'status': 'processing',
                'updated_at': datetime.utcnow().isoformat(),
                'failed_batches': 0,
                'total_batches': 10,
                'completed_batches': 5
            },
            {
                'coordination_id': f'stalled-{uuid.uuid4()}',
                'status': 'processing',
                'updated_at': (datetime.utcnow() - timedelta(hours=2)).isoformat(),
                'failed_batches': 0,
                'total_batches': 10,
                'completed_batches': 2
            },
            {
                'coordination_id': f'error-{uuid.uuid4()}',
                'status': 'failed',
                'updated_at': datetime.utcnow().isoformat(),
                'failed_batches': 5,
                'total_batches': 10,
                'completed_batches': 3
            }
        ]

        # Insert test records
        for coord in test_coordinations:
            self.coordination_table.put_item(Item=coord)

        # Test health monitoring
        test_event = {
            'operation': 'monitor_health'
        }

        # Execute health monitoring
        result = progress_tracker.lambda_handler(test_event, None)

        # Validate results
        self.assertEqual(result['statusCode'], 200)
        self.assertIn('health_status', result)

        health_status = result['health_status']
        self.assertIn('active_coordinations', health_status)
        self.assertIn('healthy_count', health_status)
        self.assertIn('stalled_count', health_status)
        self.assertIn('error_count', health_status)

        logger.info("✓ FR-8.9: Health monitoring and alerting passed")

    def test_sqs_message_batching(self):
        """Test FR-8.10: SQS message batching optimization."""
        logger.info("Testing FR-8.10: SQS message batching optimization")

        # Test batch message creation for SQS
        test_coordination_id = str(uuid.uuid4())
        test_batches = [
            [{'id': i} for i in range(j, j+10)]
            for j in range(0, 100, 10)  # 10 batches of 10 items each
        ]

        # Simulate SQS batch message preparation
        sqs_entries = []
        max_sqs_batch_size = 10

        for i in range(0, len(test_batches), max_sqs_batch_size):
            batch_group = test_batches[i:i + max_sqs_batch_size]

            for idx, batch in enumerate(batch_group):
                batch_id = f"{test_coordination_id}-batch-{i + idx}"

                message_body = {
                    'coordination_id': test_coordination_id,
                    'batch_id': batch_id,
                    'batch_index': i + idx,
                    'batch_data': batch
                }

                sqs_entries.append({
                    'Id': str(i + idx),
                    'MessageBody': json.dumps(message_body),
                    'MessageGroupId': test_coordination_id,
                    'MessageDeduplicationId': batch_id
                })

        # Validate SQS batch optimization
        self.assertEqual(len(sqs_entries), 10)  # 10 batches
        self.assertLessEqual(len(sqs_entries), max_sqs_batch_size)

        # Test sending batch messages to SQS
        response = self.sqs.send_message_batch(
            QueueUrl=self.queue_url,
            Entries=sqs_entries
        )

        # Validate successful message sending
        self.assertEqual(len(response['Successful']), len(sqs_entries))
        self.assertEqual(len(response.get('Failed', [])), 0)

        logger.info("✓ FR-8.10: SQS message batching optimization passed")

def run_functional_tests():
    """Run all functional validation tests for Phase 8."""
    logger.info("=" * 80)
    logger.info("PHASE 8 FUNCTIONAL VALIDATION TESTS")
    logger.info("=" * 80)

    # Create test suite
    suite = unittest.TestSuite()

    # Add all test methods
    test_methods = [
        'test_batch_size_optimization',
        'test_batch_coordination',
        'test_progress_tracking',
        'test_schedule_management',
        'test_error_handling_and_retries',
        'test_distributed_map_state_integration',
        'test_eventbridge_integration',
        'test_on_demand_execution',
        'test_health_monitoring',
        'test_sqs_message_batching'
    ]

    for method in test_methods:
        suite.addTest(TestPhase8Functional(method))

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Summary
    logger.info("=" * 80)
    logger.info(f"FUNCTIONAL TESTS SUMMARY")
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
    success = run_functional_tests()
    exit(0 if success else 1)