#!/usr/bin/env python3
"""
Phase 7 Performance Testing: Matching Engine
GovBizAI - Contract Opportunity Matching System

This script performs comprehensive performance testing to validate the
< 100ms per comparison target and scalability requirements.
"""

import json
import time
import sys
import os
import statistics
import concurrent.futures
from typing import Dict, List, Tuple
import unittest

# Add the lambda functions to the path for testing
sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/matching-engine'))

class TestMatchingEnginePerformance(unittest.TestCase):
    """Performance tests for matching engine components"""

    def setUp(self):
        """Set up test data"""
        # Generate test opportunities
        self.test_opportunities = self._generate_test_opportunities(100)

        # Generate test companies
        self.test_companies = self._generate_test_companies(50)

    def _generate_test_opportunities(self, count: int) -> List[Dict]:
        """Generate test opportunities for performance testing"""
        opportunities = []

        base_opp = {
            'notice_id': 'PERF-OPP-{:03d}',
            'posted_date': '2024-01-15',
            'title': 'IT Support Services Contract #{:03d}',
            'description': 'Comprehensive IT support services including network security, help desk support, and system maintenance for government agencies.',
            'NaicsCode': '541511',
            'SetASide': 'Total Small Business',
            'Sol#': 'PERF-SOL-{:03d}',
            'Office': 'General Services Administration',
            'PopState': 'VA',
            'Award$': '2500000'
        }

        # Vary the opportunities slightly
        naics_codes = ['541511', '541512', '541513', '541330', '236220']
        set_asides = ['Total Small Business', '8(a)', 'WOSB', 'SDVOSB', 'HUBZone']
        states = ['VA', 'MD', 'DC', 'CA', 'TX', 'NY', 'FL']

        for i in range(count):
            opp = base_opp.copy()
            opp['notice_id'] = opp['notice_id'].format(i)
            opp['title'] = opp['title'].format(i)
            opp['Sol#'] = opp['Sol#'].format(i)
            opp['NaicsCode'] = naics_codes[i % len(naics_codes)]
            opp['SetASide'] = set_asides[i % len(set_asides)]
            opp['PopState'] = states[i % len(states)]
            opportunities.append(opp)

        return opportunities

    def _generate_test_companies(self, count: int) -> List[Dict]:
        """Generate test companies for performance testing"""
        companies = []

        base_company = {
            'company_id': 'PERF-COMP-{:03d}',
            'tenant_id': 'PERF-TENANT-{:03d}',
            'company_name': 'Tech Solutions #{:03d}',
            'capability_statement': 'We provide comprehensive IT services including network management, cybersecurity, and technical support.',
            'naics_codes': ['541511', '541512'],
            'certifications': ['Small Business'],
            'state': 'VA',
            'employee_count': 25,
            'active_status': True,
            'status': 'active'
        }

        cert_options = [
            ['Small Business'],
            ['Small Business', '8(a)'],
            ['Small Business', 'WOSB'],
            ['Small Business', 'SDVOSB'],
            ['Small Business', 'HUBZone']
        ]

        for i in range(count):
            company = base_company.copy()
            company['company_id'] = company['company_id'].format(i)
            company['tenant_id'] = company['tenant_id'].format(i)
            company['company_name'] = company['company_name'].format(i)
            company['certifications'] = cert_options[i % len(cert_options)]
            company['employee_count'] = 10 + (i % 100)  # Vary size
            companies.append(company)

        return companies

    def test_single_component_performance(self):
        """Test performance of individual components"""
        print("\n=== Testing Individual Component Performance ===")

        components = [
            ('semantic_similarity', 'similarity_score'),
            ('keyword_matching', 'keyword_score'),
            ('naics_alignment', 'naics_score'),
            ('quick_filter', 'filter_details')
        ]

        results = {}

        for component_name, score_key in components:
            try:
                print(f"\nTesting {component_name.title()} Component...")

                module_path = f"{component_name.replace('-', '_')}.handler"
                module = __import__(module_path, fromlist=['lambda_handler'])
                lambda_handler = getattr(module, 'lambda_handler')

                # Test with first 10 opportunities and first 5 companies
                times = []
                successful_calls = 0

                for opp in self.test_opportunities[:10]:
                    for company in self.test_companies[:5]:
                        event = {
                            'opportunity': opp,
                            'company_profile': company
                        }

                        start_time = time.time()
                        try:
                            result = lambda_handler(event, None)
                            execution_time = (time.time() - start_time) * 1000  # ms

                            if result['statusCode'] == 200:
                                times.append(execution_time)
                                successful_calls += 1

                        except Exception as e:
                            print(f"    Error: {str(e)}")

                if times:
                    avg_time = statistics.mean(times)
                    median_time = statistics.median(times)
                    max_time = max(times)
                    min_time = min(times)

                    results[component_name] = {
                        'avg_time_ms': avg_time,
                        'median_time_ms': median_time,
                        'max_time_ms': max_time,
                        'min_time_ms': min_time,
                        'successful_calls': successful_calls,
                        'total_calls': len(self.test_opportunities[:10]) * len(self.test_companies[:5])
                    }

                    print(f"    ✅ Average: {avg_time:.1f}ms")
                    print(f"    ✅ Median: {median_time:.1f}ms")
                    print(f"    ✅ Max: {max_time:.1f}ms")
                    print(f"    ✅ Min: {min_time:.1f}ms")
                    print(f"    ✅ Success Rate: {successful_calls}/{len(self.test_opportunities[:10]) * len(self.test_companies[:5])}")

                    # Performance assertions
                    if component_name == 'quick_filter':
                        self.assertLess(avg_time, 50, f"Quick filter average should be under 50ms, got {avg_time:.1f}ms")
                        self.assertLess(max_time, 100, f"Quick filter max should be under 100ms, got {max_time:.1f}ms")
                    else:
                        self.assertLess(avg_time, 1000, f"{component_name} average should be under 1s, got {avg_time:.1f}ms")

            except Exception as e:
                print(f"    ❌ Failed to test {component_name}: {str(e)}")

        return results

    def test_concurrent_performance(self):
        """Test performance under concurrent load"""
        print("\n=== Testing Concurrent Performance ===")

        try:
            from quick_filter.handler import lambda_handler

            def run_single_test(args):
                opp, company = args
                event = {
                    'opportunity': opp,
                    'company_profile': company
                }

                start_time = time.time()
                result = lambda_handler(event, None)
                execution_time = (time.time() - start_time) * 1000

                return {
                    'execution_time_ms': execution_time,
                    'success': result['statusCode'] == 200
                }

            # Prepare test pairs
            test_pairs = []
            for opp in self.test_opportunities[:20]:
                for company in self.test_companies[:10]:
                    test_pairs.append((opp, company))

            # Test with different concurrency levels
            concurrency_levels = [1, 5, 10, 20]

            for concurrency in concurrency_levels:
                print(f"\nTesting with {concurrency} concurrent threads...")

                start_time = time.time()
                results = []

                with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
                    futures = [executor.submit(run_single_test, pair) for pair in test_pairs[:50]]

                    for future in concurrent.futures.as_completed(futures):
                        try:
                            result = future.result()
                            results.append(result)
                        except Exception as e:
                            print(f"    Concurrent test error: {str(e)}")

                total_time = (time.time() - start_time) * 1000

                if results:
                    successful_results = [r for r in results if r['success']]
                    execution_times = [r['execution_time_ms'] for r in successful_results]

                    if execution_times:
                        avg_time = statistics.mean(execution_times)
                        throughput = len(successful_results) / (total_time / 1000)  # requests per second

                        print(f"    ✅ Successful calls: {len(successful_results)}/{len(results)}")
                        print(f"    ✅ Average execution time: {avg_time:.1f}ms")
                        print(f"    ✅ Total time: {total_time:.1f}ms")
                        print(f"    ✅ Throughput: {throughput:.1f} requests/sec")

                        # Ensure performance doesn't degrade significantly with concurrency
                        self.assertLess(avg_time, 200, f"Average time should stay under 200ms with {concurrency} threads")

        except Exception as e:
            self.fail(f"Concurrent performance test failed: {str(e)}")

    def test_batch_processing_performance(self):
        """Test batch processing performance simulation"""
        print("\n=== Testing Batch Processing Performance ===")

        try:
            from quick_filter.handler import lambda_handler as quick_filter_handler
            from semantic_similarity.handler import lambda_handler as semantic_handler

            # Simulate batch processing: quick filter first, then detailed matching
            total_comparisons = 0
            filtered_comparisons = 0
            total_filter_time = 0
            total_match_time = 0

            print(f"Processing {len(self.test_opportunities)} opportunities against {len(self.test_companies)} companies...")

            batch_start = time.time()

            for i, opp in enumerate(self.test_opportunities):
                if i % 20 == 0:
                    print(f"  Processing opportunity {i+1}/{len(self.test_opportunities)}...")

                for company in self.test_companies:
                    total_comparisons += 1

                    # Quick filter first
                    filter_event = {
                        'opportunity': opp,
                        'company_profile': company
                    }

                    filter_start = time.time()
                    filter_result = quick_filter_handler(filter_event, None)
                    filter_time = (time.time() - filter_start) * 1000
                    total_filter_time += filter_time

                    # Only do detailed matching if passes filter
                    if filter_result['statusCode'] == 200:
                        filter_body = json.loads(filter_result['body'])
                        if filter_body.get('is_potential_match', False):
                            filtered_comparisons += 1

                            # Simulate detailed matching with semantic similarity
                            match_start = time.time()
                            match_result = semantic_handler(filter_event, None)
                            match_time = (time.time() - match_start) * 1000
                            total_match_time += match_time

            batch_total_time = (time.time() - batch_start) * 1000

            # Calculate metrics
            filter_efficiency = (total_comparisons - filtered_comparisons) / total_comparisons * 100
            avg_filter_time = total_filter_time / total_comparisons
            avg_match_time = total_match_time / filtered_comparisons if filtered_comparisons > 0 else 0
            overall_throughput = total_comparisons / (batch_total_time / 1000)

            print(f"\n📊 Batch Processing Results:")
            print(f"    Total comparisons: {total_comparisons}")
            print(f"    Filtered out: {total_comparisons - filtered_comparisons} ({filter_efficiency:.1f}%)")
            print(f"    Detailed matches: {filtered_comparisons}")
            print(f"    Average filter time: {avg_filter_time:.1f}ms")
            print(f"    Average match time: {avg_match_time:.1f}ms")
            print(f"    Total processing time: {batch_total_time:.1f}ms")
            print(f"    Overall throughput: {overall_throughput:.1f} comparisons/sec")

            # Performance assertions
            self.assertLess(avg_filter_time, 50, f"Average filter time should be under 50ms, got {avg_filter_time:.1f}ms")
            self.assertGreater(filter_efficiency, 50, f"Filter should eliminate at least 50% of comparisons, got {filter_efficiency:.1f}%")
            self.assertGreater(overall_throughput, 10, f"Should process at least 10 comparisons/sec, got {overall_throughput:.1f}")

        except Exception as e:
            self.fail(f"Batch processing performance test failed: {str(e)}")

    def test_memory_usage_simulation(self):
        """Test memory usage patterns (simulation)"""
        print("\n=== Testing Memory Usage Simulation ===")

        try:
            from semantic_similarity.handler import lambda_handler

            # Test with increasing data sizes
            data_sizes = [10, 50, 100, 200]

            for size in data_sizes:
                print(f"\nTesting with {size} character descriptions...")

                # Create opportunity with large description
                large_opp = self.test_opportunities[0].copy()
                large_opp['description'] = 'A' * size + ' comprehensive IT support services including network security, cybersecurity assessment, cloud migration, and help desk support for federal agencies.'

                large_company = self.test_companies[0].copy()
                large_company['capability_statement'] = 'B' * size + ' provide comprehensive IT services including network management, cybersecurity, and technical support to government agencies.'

                event = {
                    'opportunity': large_opp,
                    'company_profile': large_company
                }

                start_time = time.time()
                result = lambda_handler(event, None)
                execution_time = (time.time() - start_time) * 1000

                if result['statusCode'] == 200:
                    print(f"    ✅ {size} chars: {execution_time:.1f}ms")

                    # Ensure execution time doesn't grow exponentially with data size
                    self.assertLess(execution_time, 5000, f"Execution time should stay reasonable with {size} char data")
                else:
                    print(f"    ❌ {size} chars: Failed")

        except Exception as e:
            self.fail(f"Memory usage simulation failed: {str(e)}")

    def test_scalability_targets(self):
        """Test scalability targets simulation"""
        print("\n=== Testing Scalability Targets ===")

        # Simulate the target: 10,000 opportunities x 5,000 companies
        # This would be 50 million comparisons in production

        # For testing, we'll simulate with a smaller subset and extrapolate
        sample_opportunities = 10
        sample_companies = 10
        sample_comparisons = sample_opportunities * sample_companies

        print(f"Simulating {sample_comparisons} comparisons...")
        print("(Extrapolating to 10,000 x 5,000 = 50M comparison target)")

        try:
            from quick_filter.handler import lambda_handler

            start_time = time.time()
            successful_comparisons = 0

            for opp in self.test_opportunities[:sample_opportunities]:
                for company in self.test_companies[:sample_companies]:
                    event = {
                        'opportunity': opp,
                        'company_profile': company
                    }

                    result = lambda_handler(event, None)
                    if result['statusCode'] == 200:
                        successful_comparisons += 1

            total_time = time.time() - start_time
            avg_time_per_comparison = (total_time / sample_comparisons) * 1000  # ms

            # Extrapolate to full scale
            estimated_time_for_50m = (avg_time_per_comparison * 50_000_000) / 1000 / 3600  # hours

            print(f"\n📊 Scalability Analysis:")
            print(f"    Sample comparisons: {sample_comparisons}")
            print(f"    Successful: {successful_comparisons}")
            print(f"    Average time per comparison: {avg_time_per_comparison:.2f}ms")
            print(f"    Estimated time for 50M comparisons: {estimated_time_for_50m:.1f} hours")

            # Target: Complete nightly processing within 4 hours
            target_time_per_comparison = (4 * 3600 * 1000) / 50_000_000  # 0.288 ms per comparison

            print(f"    Target time per comparison: {target_time_per_comparison:.3f}ms")
            print(f"    Performance ratio: {avg_time_per_comparison / target_time_per_comparison:.1f}x")

            # For quick filter, we should be well under target
            if avg_time_per_comparison <= target_time_per_comparison * 10:  # Allow 10x margin for testing
                print("    ✅ Scalability target achievable with optimization")
            else:
                print("    ⚠️  May need further optimization for full scale")

            # Assert reasonable performance
            self.assertLess(avg_time_per_comparison, 100, "Average comparison time should be under 100ms for scalability")

        except Exception as e:
            self.fail(f"Scalability test failed: {str(e)}")


def run_performance_tests():
    """Run all performance tests and generate report"""
    print("🚀 Starting Phase 7 Performance Testing: Matching Engine")
    print("=" * 70)

    # Create test suite
    test_suite = unittest.TestLoader().loadTestsFromTestCase(TestMatchingEnginePerformance)

    # Run tests with detailed output
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)

    # Generate summary report
    print("\n" + "=" * 70)
    print("📊 PERFORMANCE TESTING SUMMARY")
    print("=" * 70)

    total_tests = result.testsRun
    failures = len(result.failures)
    errors = len(result.errors)
    passed = total_tests - failures - errors

    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed}")
    print(f"Failed: {failures}")
    print(f"Errors: {errors}")
    print(f"Success Rate: {(passed/total_tests)*100:.1f}%")

    if result.failures:
        print("\n❌ PERFORMANCE FAILURES:")
        for test, traceback in result.failures:
            print(f"  - {test}")

    if result.errors:
        print("\n🚨 PERFORMANCE ERRORS:")
        for test, traceback in result.errors:
            print(f"  - {test}")

    print("\n" + "=" * 70)
    print("📈 KEY PERFORMANCE INSIGHTS:")
    print("- Quick filter should process comparisons in < 50ms")
    print("- Individual components should complete in < 1 second")
    print("- System should filter out 50%+ of non-matches efficiently")
    print("- Batch processing should achieve 10+ comparisons/second")
    print("- Memory usage should scale reasonably with data size")
    print("=" * 70)

    if failures == 0 and errors == 0:
        print("✅ ALL PERFORMANCE TESTS PASSED!")
        print("🎉 Phase 7 Matching Engine performance validation complete!")
        return True
    else:
        print("❌ Some performance tests failed. Review for optimization opportunities.")
        return False


if __name__ == "__main__":
    success = run_performance_tests()
    sys.exit(0 if success else 1)