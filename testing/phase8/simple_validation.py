#!/usr/bin/env python3
"""
Simple Phase 8 Validation - Infrastructure and Code Quality Check
Basic validation without external dependencies.
"""

import os
import sys
import json
import logging
from datetime import datetime
from typing import Dict, List, Any

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SimplePhase8Validator:
    """Simple validator for Phase 8 implementation."""

    def __init__(self):
        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.project_root = os.path.join(self.script_dir, '../..')
        self.infrastructure_dir = os.path.join(self.project_root, 'infrastructure')
        self.results = {'passed': [], 'failed': [], 'warnings': []}

    def run_validation(self) -> bool:
        """Run simple validation checks."""
        logger.info("=" * 60)
        logger.info("PHASE 8 SIMPLE VALIDATION")
        logger.info("=" * 60)

        checks = [
            ('Infrastructure Stack', self.check_infrastructure_stack),
            ('Lambda Functions', self.check_lambda_functions),
            ('Batch Optimizer', self.check_batch_optimizer),
            ('Batch Coordinator', self.check_batch_coordinator),
            ('Progress Tracker', self.check_progress_tracker),
            ('Schedule Manager', self.check_schedule_manager),
            ('Test Files', self.check_test_files)
        ]

        for check_name, check_func in checks:
            logger.info(f"Running {check_name} check...")
            try:
                result = check_func()
                if result:
                    self.results['passed'].append(check_name)
                    logger.info(f"✓ {check_name}: PASSED")
                else:
                    self.results['failed'].append(check_name)
                    logger.error(f"✗ {check_name}: FAILED")
            except Exception as e:
                self.results['failed'].append(check_name)
                logger.error(f"✗ {check_name}: ERROR - {str(e)}")

        # Print summary
        self.print_summary()
        return len(self.results['failed']) == 0

    def check_infrastructure_stack(self) -> bool:
        """Check infrastructure stack implementation."""
        stack_file = os.path.join(self.infrastructure_dir, 'lib/infrastructure-stack.ts')

        if not os.path.exists(stack_file):
            logger.error("Infrastructure stack file not found")
            return False

        with open(stack_file, 'r') as f:
            content = f.read()

        # Check for Phase 8 components
        required_components = [
            'createBatchOrchestrationComponents',
            'createEnhancedProcessingStateMachine',
            'BatchOptimizerFunction',
            'BatchCoordinatorFunction',
            'ProgressTrackerFunction',
            'ScheduleManagerFunction',
            'govbizai-batch-coordination',
            'govbizai-progress-tracking',
            'govbizai-batch-optimization-history',
            'govbizai-schedule-management'
        ]

        missing = [comp for comp in required_components if comp not in content]

        if missing:
            logger.error(f"Missing infrastructure components: {missing}")
            return False

        return True

    def check_lambda_functions(self) -> bool:
        """Check Lambda function directory structure."""
        lambda_dir = os.path.join(self.infrastructure_dir, 'lambda')

        required_functions = [
            'batch-optimizer',
            'batch-coordinator',
            'progress-tracker',
            'schedule-manager'
        ]

        missing_functions = []
        for func in required_functions:
            func_dir = os.path.join(lambda_dir, func)
            if not os.path.exists(func_dir):
                missing_functions.append(func)

        if missing_functions:
            logger.error(f"Missing Lambda function directories: {missing_functions}")
            return False

        return True

    def check_batch_optimizer(self) -> bool:
        """Check batch optimizer implementation."""
        optimizer_file = os.path.join(self.infrastructure_dir, 'lambda/batch-optimizer/batch_optimizer.py')

        if not os.path.exists(optimizer_file):
            logger.error("Batch optimizer file not found")
            return False

        with open(optimizer_file, 'r') as f:
            content = f.read()

        # Check for key functions
        required_functions = [
            'lambda_handler',
            'get_performance_metrics',
            'calculate_optimal_batch_size',
            'calculate_concurrency_settings',
            'store_optimization_decision'
        ]

        missing = [func for func in required_functions if func not in content]

        if missing:
            logger.error(f"Missing functions in batch optimizer: {missing}")
            return False

        # Check for proper imports
        required_imports = ['boto3', 'json', 'logging']
        for imp in required_imports:
            if imp not in content:
                logger.warning(f"Missing import in batch optimizer: {imp}")

        return True

    def check_batch_coordinator(self) -> bool:
        """Check batch coordinator implementation."""
        coordinator_file = os.path.join(self.infrastructure_dir, 'lambda/batch-coordinator/batch_coordinator.py')

        if not os.path.exists(coordinator_file):
            logger.error("Batch coordinator file not found")
            return False

        with open(coordinator_file, 'r') as f:
            content = f.read()

        # Check for key functions
        required_functions = [
            'lambda_handler',
            'coordinate_processing',
            'create_batches',
            'distribute_batches_to_queue',
            'check_batch_progress',
            'handle_batch_failure'
        ]

        missing = [func for func in required_functions if func not in content]

        if missing:
            logger.error(f"Missing functions in batch coordinator: {missing}")
            return False

        return True

    def check_progress_tracker(self) -> bool:
        """Check progress tracker implementation."""
        tracker_file = os.path.join(self.infrastructure_dir, 'lambda/progress-tracker/progress_tracker.py')

        if not os.path.exists(tracker_file):
            logger.error("Progress tracker file not found")
            return False

        with open(tracker_file, 'r') as f:
            content = f.read()

        # Check for key functions
        required_functions = [
            'lambda_handler',
            'update_batch_progress',
            'get_progress_status',
            'monitor_processing_health',
            'publish_progress_metrics'
        ]

        missing = [func for func in required_functions if func not in content]

        if missing:
            logger.error(f"Missing functions in progress tracker: {missing}")
            return False

        return True

    def check_schedule_manager(self) -> bool:
        """Check schedule manager implementation."""
        manager_file = os.path.join(self.infrastructure_dir, 'lambda/schedule-manager/schedule_manager.py')

        if not os.path.exists(manager_file):
            logger.error("Schedule manager file not found")
            return False

        with open(manager_file, 'r') as f:
            content = f.read()

        # Check for key functions
        required_functions = [
            'lambda_handler',
            'create_schedule',
            'update_schedule',
            'delete_schedule',
            'trigger_on_demand_execution'
        ]

        missing = [func for func in required_functions if func not in content]

        if missing:
            logger.error(f"Missing functions in schedule manager: {missing}")
            return False

        return True

    def check_test_files(self) -> bool:
        """Check test files exist."""
        test_files = [
            'test_phase8_functional.py',
            'test_phase8_nonfunctional.py',
            'run_phase8_validation.py'
        ]

        missing_tests = []
        for test_file in test_files:
            test_path = os.path.join(self.script_dir, test_file)
            if not os.path.exists(test_path):
                missing_tests.append(test_file)

        if missing_tests:
            logger.error(f"Missing test files: {missing_tests}")
            return False

        return True

    def print_summary(self):
        """Print validation summary."""
        logger.info("=" * 60)
        logger.info("VALIDATION SUMMARY")
        logger.info("=" * 60)

        total_checks = len(self.results['passed']) + len(self.results['failed'])
        passed_checks = len(self.results['passed'])

        logger.info(f"Total Checks: {total_checks}")
        logger.info(f"Passed: {passed_checks}")
        logger.info(f"Failed: {len(self.results['failed'])}")
        logger.info(f"Warnings: {len(self.results['warnings'])}")

        if self.results['passed']:
            logger.info("\nPASSED CHECKS:")
            for check in self.results['passed']:
                logger.info(f"  ✓ {check}")

        if self.results['failed']:
            logger.info("\nFAILED CHECKS:")
            for check in self.results['failed']:
                logger.info(f"  ✗ {check}")

        if self.results['warnings']:
            logger.info("\nWARNINGS:")
            for warning in self.results['warnings']:
                logger.info(f"  ⚠ {warning}")

        success_rate = (passed_checks / total_checks * 100) if total_checks > 0 else 0
        logger.info(f"\nSuccess Rate: {success_rate:.1f}%")

        overall_status = "PASSED" if len(self.results['failed']) == 0 else "FAILED"
        status_symbol = "🎉" if overall_status == "PASSED" else "❌"

        logger.info(f"Overall Status: {status_symbol} {overall_status}")
        logger.info("=" * 60)


def main():
    """Main validation function."""
    validator = SimplePhase8Validator()
    success = validator.run_validation()
    return 0 if success else 1


if __name__ == '__main__':
    exit(main())