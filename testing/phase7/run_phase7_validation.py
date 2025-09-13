#!/usr/bin/env python3
"""
Phase 7 Validation Runner: Matching Engine
GovBizAI - Contract Opportunity Matching System

This script orchestrates comprehensive validation of Phase 7: Matching Engine
including functional testing, performance testing, and validation reporting.
"""

import sys
import os
import time
import json
from datetime import datetime

def run_validation():
    """Run comprehensive Phase 7 validation"""
    print("🚀 Phase 7 Validation: Matching Engine")
    print("=" * 80)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)

    validation_results = {
        'phase': 'Phase 7 - Matching Engine',
        'start_time': datetime.now().isoformat(),
        'functional_tests': None,
        'performance_tests': None,
        'overall_success': False
    }

    try:
        # Step 1: Functional Testing
        print("\n📋 Step 1: Running Functional Tests...")
        print("-" * 50)

        try:
            from test_phase7_functional import run_functional_tests
            functional_success = run_functional_tests()
            validation_results['functional_tests'] = {
                'success': functional_success,
                'timestamp': datetime.now().isoformat()
            }

            if functional_success:
                print("✅ Functional tests completed successfully!")
            else:
                print("❌ Functional tests failed!")

        except ImportError as e:
            print(f"❌ Could not import functional tests: {e}")
            functional_success = False
            validation_results['functional_tests'] = {
                'success': False,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }

        # Step 2: Performance Testing
        print("\n🚀 Step 2: Running Performance Tests...")
        print("-" * 50)

        try:
            from test_phase7_performance import run_performance_tests
            performance_success = run_performance_tests()
            validation_results['performance_tests'] = {
                'success': performance_success,
                'timestamp': datetime.now().isoformat()
            }

            if performance_success:
                print("✅ Performance tests completed successfully!")
            else:
                print("❌ Performance tests failed!")

        except ImportError as e:
            print(f"❌ Could not import performance tests: {e}")
            performance_success = False
            validation_results['performance_tests'] = {
                'success': False,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }

        # Step 3: Overall Assessment
        print("\n📊 Step 3: Overall Assessment...")
        print("-" * 50)

        overall_success = functional_success and performance_success
        validation_results['overall_success'] = overall_success
        validation_results['end_time'] = datetime.now().isoformat()

        # Generate Validation Report
        print("\n📋 PHASE 7 VALIDATION REPORT")
        print("=" * 80)
        print(f"Phase: {validation_results['phase']}")
        print(f"Start Time: {validation_results['start_time']}")
        print(f"End Time: {validation_results['end_time']}")
        print("-" * 80)

        # Functional Tests Results
        func_result = validation_results['functional_tests']
        if func_result:
            status = "✅ PASSED" if func_result['success'] else "❌ FAILED"
            print(f"Functional Tests: {status}")
            if 'error' in func_result:
                print(f"  Error: {func_result['error']}")
        else:
            print("Functional Tests: ❌ NOT RUN")

        # Performance Tests Results
        perf_result = validation_results['performance_tests']
        if perf_result:
            status = "✅ PASSED" if perf_result['success'] else "❌ FAILED"
            print(f"Performance Tests: {status}")
            if 'error' in perf_result:
                print(f"  Error: {perf_result['error']}")
        else:
            print("Performance Tests: ❌ NOT RUN")

        print("-" * 80)

        if overall_success:
            print("🎉 OVERALL RESULT: ✅ PHASE 7 VALIDATION SUCCESSFUL!")
            print("\n✅ All matching engine components are validated and ready!")
            print("✅ Performance targets are met for production deployment!")
            print("✅ The 8-component scoring algorithm is working correctly!")
            print("✅ Quick filter efficiency enables scalable batch processing!")
        else:
            print("❌ OVERALL RESULT: ❌ PHASE 7 VALIDATION FAILED!")
            print("\n❌ Issues found that need to be addressed before production!")
            print("❌ Review test results and fix identified problems!")

        print("=" * 80)

        # Save validation report
        report_filename = f"phase7_validation_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        report_path = os.path.join(os.path.dirname(__file__), '../../reports', report_filename)

        try:
            os.makedirs(os.path.dirname(report_path), exist_ok=True)
            with open(report_path, 'w') as f:
                json.dump(validation_results, f, indent=2)
            print(f"📄 Validation report saved: {report_path}")
        except Exception as e:
            print(f"⚠️  Could not save validation report: {e}")

        return overall_success

    except Exception as e:
        print(f"\n🚨 CRITICAL ERROR during validation: {e}")
        validation_results['critical_error'] = str(e)
        validation_results['overall_success'] = False
        validation_results['end_time'] = datetime.now().isoformat()
        return False


def validate_prerequisites():
    """Validate that prerequisites are met for testing"""
    print("🔍 Validating Prerequisites...")

    # Check if Lambda function files exist
    lambda_base_path = os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/matching-engine')

    required_components = [
        'semantic-similarity',
        'keyword-matching',
        'naics-alignment',
        'quick-filter',
        'match-orchestrator'
    ]

    missing_components = []
    for component in required_components:
        handler_path = os.path.join(lambda_base_path, component, 'handler.py')
        if not os.path.exists(handler_path):
            missing_components.append(component)

    if missing_components:
        print(f"❌ Missing components: {', '.join(missing_components)}")
        print("   Please ensure all Lambda functions are implemented before testing.")
        return False

    print("✅ All required components found!")
    return True


def main():
    """Main validation orchestrator"""
    print("🏗️  GovBizAI Phase 7 Validation")
    print("   Matching Engine - Contract Opportunity Matching System")
    print("=" * 80)

    # Validate prerequisites
    if not validate_prerequisites():
        print("❌ Prerequisites not met. Exiting.")
        return False

    # Run comprehensive validation
    success = run_validation()

    print("\n" + "=" * 80)
    if success:
        print("🎊 PHASE 7 VALIDATION COMPLETE - SUCCESS! 🎊")
        print("\nThe matching engine is ready for:")
        print("  • Production deployment")
        print("  • Integration with web application")
        print("  • Batch processing workflows")
        print("  • Real-world opportunity matching")
        print("\nNext steps:")
        print("  1. Deploy infrastructure with CDK")
        print("  2. Configure API Gateway and authentication")
        print("  3. Integrate with web application")
        print("  4. Begin Phase 8: Batch Processing Pipeline")
    else:
        print("❌ PHASE 7 VALIDATION FAILED")
        print("\nPlease review test results and address issues before proceeding.")
        print("Check the validation report for detailed error information.")

    print("=" * 80)
    return success


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)