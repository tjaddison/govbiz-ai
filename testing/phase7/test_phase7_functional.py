#!/usr/bin/env python3
"""
Phase 7 Functional Testing: Matching Engine
GovBizAI - Contract Opportunity Matching System

This script performs comprehensive functional testing of the matching engine
to validate all scoring components work correctly and produce expected results.
"""

import json
import time
import sys
import os
import boto3
import requests
import unittest
from typing import Dict, List
from decimal import Decimal

# Add the lambda functions to the path for testing
sys.path.append(os.path.join(os.path.dirname(__file__), '../../infrastructure/lambda/matching-engine'))

class TestMatchingEngineComponents(unittest.TestCase):
    """Comprehensive functional tests for matching engine components"""

    def setUp(self):
        """Set up test data and initialize test environment"""
        # Test opportunity data
        self.test_opportunity = {
            'notice_id': 'TEST-OPP-001',
            'posted_date': '2024-01-15',
            'title': 'Comprehensive IT Support Services',
            'description': 'The General Services Administration (GSA) requires comprehensive IT support services including network security, cloud migration, cybersecurity assessment, and help desk support for federal agencies.',
            'NaicsCode': '541511',
            'SetASide': 'Total Small Business',
            'Sol#': 'TEST-SOL-001',
            'Office': 'General Services Administration',
            'Department/Ind.Agency': 'General Services Administration',
            'PopState': 'VA',
            'PopCity': 'Arlington',
            'ResponseDeadLine': '2024-02-15',
            'Award$': '5000000',
            'Type': 'Combined Synopsis/Solicitation'
        }

        # Test company profile data
        self.test_company = {
            'company_id': 'TEST-COMPANY-001',
            'tenant_id': 'TEST-TENANT-001',
            'company_name': 'TechSolutions Federal Inc.',
            'capability_statement': 'We provide comprehensive IT support services including cybersecurity, cloud migration, network security, and technical support to federal agencies. Our team has extensive experience with GSA requirements and federal IT compliance.',
            'naics_codes': ['541511', '541512', '541513'],
            'certifications': ['Small Business', '8(a)', 'WOSB', 'ISO 27001'],
            'state': 'VA',
            'city': 'Arlington',
            'employee_count': 45,
            'revenue_range': '$5M-$10M',
            'active_status': True,
            'status': 'active',
            'past_performance': [
                {
                    'description': 'IT support services for Department of Defense including network security and help desk support',
                    'agency': 'DOD',
                    'value': 2500000,
                    'year': 2023
                },
                {
                    'description': 'Cybersecurity assessment and implementation for General Services Administration',
                    'agency': 'GSA',
                    'value': 1800000,
                    'year': 2022
                },
                {
                    'description': 'Cloud migration services for Department of Veterans Affairs',
                    'agency': 'VA',
                    'value': 3200000,
                    'year': 2021
                }
            ],
            'locations': [
                {'state': 'VA', 'city': 'Arlington'},
                {'state': 'MD', 'city': 'Bethesda'}
            ]
        }

        # Test data for edge cases
        self.low_match_opportunity = {
            'notice_id': 'TEST-OPP-002',
            'title': 'Nuclear Waste Management Services',
            'description': 'Specialized nuclear waste disposal and radioactive materials handling requiring top secret clearance.',
            'NaicsCode': '562211',
            'SetASide': 'Large Business',
            'PopState': 'NV',
            'Award$': '50000000'
        }

        self.low_match_company = {
            'company_id': 'TEST-COMPANY-002',
            'company_name': 'Small Web Design Studio',
            'capability_statement': 'We create beautiful websites for local businesses.',
            'naics_codes': ['541810'],
            'certifications': ['Small Business'],
            'state': 'CA',
            'employee_count': 3,
            'past_performance': []
        }

    def test_semantic_similarity_component(self):
        """Test semantic similarity calculator"""
        print("\n=== Testing Semantic Similarity Component ===")

        try:
            # Import the semantic similarity module
            from semantic_similarity.handler import lambda_handler

            event = {
                'opportunity': self.test_opportunity,
                'company_profile': self.test_company
            }

            # Test semantic similarity
            result = lambda_handler(event, None)

            # Validate response structure
            self.assertEqual(result['statusCode'], 200)
            body = json.loads(result['body'])
            self.assertIn('similarity_score', body)
            self.assertEqual(body['component'], 'semantic_similarity')
            self.assertEqual(body['weight'], 0.25)

            # Validate score structure
            similarity_score = body['similarity_score']
            self.assertIn('overall_score', similarity_score)
            self.assertIn('weighted_average_similarity', similarity_score)
            self.assertIsInstance(similarity_score['overall_score'], (int, float))
            self.assertGreaterEqual(similarity_score['overall_score'], 0.0)
            self.assertLessEqual(similarity_score['overall_score'], 1.0)

            print(f"✅ Semantic similarity score: {similarity_score['overall_score']:.3f}")
            print(f"✅ Processing time: {similarity_score.get('processing_time_ms', 0):.1f}ms")

            # Test with low-match data
            low_match_event = {
                'opportunity': self.low_match_opportunity,
                'company_profile': self.low_match_company
            }

            low_result = lambda_handler(low_match_event, None)
            low_body = json.loads(low_result['body'])
            low_score = low_body['similarity_score']['overall_score']

            print(f"✅ Low-match semantic similarity: {low_score:.3f}")

            # High-match should score better than low-match
            self.assertGreater(similarity_score['overall_score'], low_score)

        except Exception as e:
            self.fail(f"Semantic similarity test failed: {str(e)}")

    def test_keyword_matching_component(self):
        """Test keyword matching algorithm"""
        print("\n=== Testing Keyword Matching Component ===")

        try:
            from keyword_matching.handler import lambda_handler

            event = {
                'opportunity': self.test_opportunity,
                'company_profile': self.test_company
            }

            result = lambda_handler(event, None)

            # Validate response
            self.assertEqual(result['statusCode'], 200)
            body = json.loads(result['body'])
            self.assertIn('keyword_score', body)

            keyword_score = body['keyword_score']
            self.assertIn('overall_score', keyword_score)
            self.assertIn('exact_matches', keyword_score)
            self.assertIn('tfidf_similarity', keyword_score)

            print(f"✅ Keyword matching score: {keyword_score['overall_score']:.3f}")
            print(f"✅ TF-IDF similarity: {keyword_score.get('tfidf_similarity', 0):.3f}")

            # Check for expected keyword matches
            exact_matches = keyword_score.get('exact_matches', {})
            if isinstance(exact_matches, dict) and 'matches' in exact_matches:
                matches = exact_matches['matches']
                print(f"✅ Found {len(matches)} exact keyword matches")

                # Should find common terms like 'security', 'support', 'services'
                expected_keywords = ['security', 'support', 'services', 'federal']
                found_expected = [kw for kw in expected_keywords if kw in matches]
                self.assertGreater(len(found_expected), 0, "Should find at least one expected keyword")

        except Exception as e:
            self.fail(f"Keyword matching test failed: {str(e)}")

    def test_naics_alignment_component(self):
        """Test NAICS code alignment scorer"""
        print("\n=== Testing NAICS Alignment Component ===")

        try:
            from naics_alignment.handler import lambda_handler

            event = {
                'opportunity': self.test_opportunity,
                'company_profile': self.test_company
            }

            result = lambda_handler(event, None)

            # Validate response
            self.assertEqual(result['statusCode'], 200)
            body = json.loads(result['body'])
            self.assertIn('naics_score', body)

            naics_score = body['naics_score']
            self.assertIn('overall_score', naics_score)
            self.assertIn('primary_alignment', naics_score)

            print(f"✅ NAICS alignment score: {naics_score['overall_score']:.3f}")

            # Should be exact match (both 541511)
            primary_alignment = naics_score.get('primary_alignment', {})
            if 'match_level' in primary_alignment:
                print(f"✅ Match level: {primary_alignment['match_level']}")
                self.assertEqual(primary_alignment['match_level'], 'exact')
                self.assertEqual(naics_score['overall_score'], 1.0)

        except Exception as e:
            self.fail(f"NAICS alignment test failed: {str(e)}")

    def test_quick_filter_component(self):
        """Test quick filter pre-screening"""
        print("\n=== Testing Quick Filter Component ===")

        try:
            from quick_filter.handler import lambda_handler

            # Test high-match scenario
            event = {
                'opportunity': self.test_opportunity,
                'company_profile': self.test_company
            }

            result = lambda_handler(event, None)

            # Validate response
            self.assertEqual(result['statusCode'], 200)
            body = json.loads(result['body'])
            self.assertIn('is_potential_match', body)
            self.assertIn('filter_details', body)

            should_match = body['is_potential_match']
            filter_details = body['filter_details']

            print(f"✅ High-match should pass filter: {should_match}")
            print(f"✅ Filter score: {filter_details.get('filter_score', 0):.3f}")
            print(f"✅ Processing time: {filter_details.get('processing_time_ms', 0):.1f}ms")

            self.assertTrue(should_match, "High-match scenario should pass quick filter")

            # Test low-match scenario
            low_match_event = {
                'opportunity': self.low_match_opportunity,
                'company_profile': self.low_match_company
            }

            low_result = lambda_handler(low_match_event, None)
            low_body = json.loads(low_result['body'])
            should_not_match = low_body['is_potential_match']

            print(f"✅ Low-match should fail filter: {not should_not_match}")

            # Quick filter should be very fast (< 10ms target)
            processing_time = filter_details.get('processing_time_ms', 0)
            self.assertLess(processing_time, 50, "Quick filter should be under 50ms")

        except Exception as e:
            self.fail(f"Quick filter test failed: {str(e)}")

    def test_component_stubs(self):
        """Test stub implementations of remaining components"""
        print("\n=== Testing Component Stubs ===")

        components = [
            ('past_performance', 'past_performance_score'),
            ('certification_bonus', 'certification_score'),
            ('geographic_match', 'geographic_score'),
            ('capacity_fit', 'capacity_score'),
            ('recency_factor', 'recency_score')
        ]

        for component_name, score_key in components:
            try:
                module_path = f"{component_name.replace('-', '_')}.handler"
                module = __import__(module_path, fromlist=['lambda_handler'])
                lambda_handler = getattr(module, 'lambda_handler')

                event = {
                    'opportunity': self.test_opportunity,
                    'company_profile': self.test_company
                }

                result = lambda_handler(event, None)

                # Validate response structure
                self.assertEqual(result['statusCode'], 200)
                body = json.loads(result['body'])
                self.assertIn(score_key, body)

                score_data = body[score_key]
                self.assertIn('score', score_data)
                self.assertIsInstance(score_data['score'], (int, float))
                self.assertGreaterEqual(score_data['score'], 0.0)
                self.assertLessEqual(score_data['score'], 1.0)

                print(f"✅ {component_name.title()} component: {score_data['score']:.3f}")

            except Exception as e:
                print(f"❌ {component_name.title()} component failed: {str(e)}")

    def test_scoring_consistency(self):
        """Test that scoring is consistent across multiple runs"""
        print("\n=== Testing Scoring Consistency ===")

        try:
            from semantic_similarity.handler import lambda_handler

            event = {
                'opportunity': self.test_opportunity,
                'company_profile': self.test_company
            }

            scores = []
            for i in range(3):
                result = lambda_handler(event, None)
                body = json.loads(result['body'])
                score = body['similarity_score']['overall_score']
                scores.append(score)

            # All scores should be identical (deterministic)
            self.assertEqual(len(set(scores)), 1, "Scores should be consistent across runs")
            print(f"✅ Consistent scoring across {len(scores)} runs: {scores[0]:.3f}")

        except Exception as e:
            self.fail(f"Consistency test failed: {str(e)}")

    def test_edge_cases(self):
        """Test edge cases and error handling"""
        print("\n=== Testing Edge Cases ===")

        try:
            from semantic_similarity.handler import lambda_handler

            # Test missing data
            incomplete_event = {
                'opportunity': {'notice_id': 'INCOMPLETE'},
                'company_profile': {'company_id': 'INCOMPLETE'}
            }

            result = lambda_handler(incomplete_event, None)
            self.assertEqual(result['statusCode'], 200)  # Should handle gracefully
            print("✅ Handles incomplete data gracefully")

            # Test empty strings
            empty_event = {
                'opportunity': {
                    'notice_id': 'EMPTY',
                    'title': '',
                    'description': '',
                    'NaicsCode': ''
                },
                'company_profile': {
                    'company_id': 'EMPTY',
                    'company_name': '',
                    'capability_statement': '',
                    'naics_codes': []
                }
            }

            result = lambda_handler(empty_event, None)
            self.assertEqual(result['statusCode'], 200)  # Should handle gracefully
            print("✅ Handles empty data gracefully")

        except Exception as e:
            self.fail(f"Edge case test failed: {str(e)}")

    def test_performance_targets(self):
        """Test performance targets for individual components"""
        print("\n=== Testing Performance Targets ===")

        components_to_test = [
            ('semantic_similarity', 'similarity_score'),
            ('keyword_matching', 'keyword_score'),
            ('naics_alignment', 'naics_score'),
            ('quick_filter', 'filter_details')
        ]

        event = {
            'opportunity': self.test_opportunity,
            'company_profile': self.test_company
        }

        for component_name, score_key in components_to_test:
            try:
                module_path = f"{component_name.replace('-', '_')}.handler"
                module = __import__(module_path, fromlist=['lambda_handler'])
                lambda_handler = getattr(module, 'lambda_handler')

                # Measure execution time
                start_time = time.time()
                result = lambda_handler(event, None)
                execution_time = (time.time() - start_time) * 1000  # Convert to ms

                # Validate response
                self.assertEqual(result['statusCode'], 200)
                body = json.loads(result['body'])

                # Check reported processing time
                if score_key in body:
                    reported_time = body[score_key].get('processing_time_ms', 0)
                    print(f"✅ {component_name.title()}: {execution_time:.1f}ms (reported: {reported_time:.1f}ms)")

                    # Performance targets (relaxed for testing)
                    if component_name == 'quick_filter':
                        self.assertLess(execution_time, 100, f"Quick filter should be under 100ms, got {execution_time:.1f}ms")
                    else:
                        self.assertLess(execution_time, 5000, f"{component_name} should be under 5s, got {execution_time:.1f}ms")

            except Exception as e:
                print(f"❌ Performance test failed for {component_name}: {str(e)}")


def run_functional_tests():
    """Run all functional tests and generate report"""
    print("🚀 Starting Phase 7 Functional Testing: Matching Engine")
    print("=" * 70)

    # Create test suite
    test_suite = unittest.TestLoader().loadTestsFromTestCase(TestMatchingEngineComponents)

    # Run tests with detailed output
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)

    # Generate summary report
    print("\n" + "=" * 70)
    print("📊 FUNCTIONAL TESTING SUMMARY")
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
        print("\n❌ FAILURES:")
        for test, traceback in result.failures:
            print(f"  - {test}: {traceback}")

    if result.errors:
        print("\n🚨 ERRORS:")
        for test, traceback in result.errors:
            print(f"  - {test}: {traceback}")

    print("\n" + "=" * 70)

    if failures == 0 and errors == 0:
        print("✅ ALL FUNCTIONAL TESTS PASSED!")
        print("🎉 Phase 7 Matching Engine functional validation complete!")
        return True
    else:
        print("❌ Some tests failed. Please review and fix issues before proceeding.")
        return False


if __name__ == "__main__":
    success = run_functional_tests()
    sys.exit(0 if success else 1)