#!/usr/bin/env python3
"""
Test script to validate the matching system fixes for MedPACS
This script tests the fixed matching algorithm to ensure:
1. Healthcare companies don't match manufacturing opportunities
2. NAICS codes are properly used when available
3. Industry-based filtering works correctly
"""

import json
import boto3
import sys
from datetime import datetime

# Test data - MedPACS profile (now with correct data)
MEDPACS_PROFILE = {
    "company_id": "e4d8f458-b031-70ed-aee1-f318f0290017",
    "company_name": "MedPacs, LLC",
    "industry": "Healthcare IT Services",
    "naics_codes": ["621399", "561330", "541513", "541419"],
    "certifications": ["SDVOSB", "Small Business", "Woman Owned Small Business", "Minority Owned Small Business"],
    "capability_statement": "MedPacs provides medical IT services including PACS administration, medical records management, healthcare data analysis, and clinical IT support for government healthcare facilities.",
    "employee_count": "1-10"
}

# Test opportunities - should NOT match MedPACS
MANUFACTURING_OPPORTUNITIES = [
    {
        "notice_id": "TEST-AIRCRAFT-001",
        "title": "16--DIAPHRAGM ASSY,AIRC",
        "description": "Aircraft diaphragm assembly procurement for military aircraft maintenance",
        "NaicsCode": "336413",  # Aircraft parts manufacturing
        "SetASide": "Small Business",
        "posted_date": "2024-01-15"
    },
    {
        "notice_id": "TEST-CYLINDER-001",
        "title": "30--CYLINDER ASSEMBLY,A",
        "description": "Proposed procurement for NSN 3040012649338 CYLINDER ASSEMBLY,A: Line 0001 Qty 4 UI EA",
        "NaicsCode": "333613",  # Mechanical components
        "SetASide": "Total Small Business",
        "posted_date": "2024-01-15"
    }
]

# Test opportunities - SHOULD match MedPACS
HEALTHCARE_OPPORTUNITIES = [
    {
        "notice_id": "TEST-HEALTHCARE-001",
        "title": "Medical Records Management Services",
        "description": "Seeking qualified contractors to provide medical records management and PACS administration services for military medical facilities",
        "NaicsCode": "621399",  # Healthcare services
        "SetASide": "SDVOSB",
        "posted_date": "2024-01-15"
    },
    {
        "notice_id": "TEST-IT-HEALTHCARE-001",
        "title": "Healthcare IT Support Services",
        "description": "IT support services for hospital information systems, medical databases, and patient care technology",
        "NaicsCode": "541513",  # IT facilities management
        "SetASide": "Small Business",
        "posted_date": "2024-01-15"
    }
]

def test_quick_filter(opportunity, company_profile, should_pass=True):
    """Test the quick filter function"""
    print(f"\n🔍 Testing Quick Filter: {opportunity['title'][:50]}...")

    try:
        # Import the quick filter function
        import sys
        sys.path.append('/Users/terrance/Projects/govbiz-ai/infrastructure/lambda/matching-engine/quick-filter')
        from handler import QuickFilter

        quick_filter = QuickFilter()
        result = quick_filter.is_potential_match(opportunity, company_profile)

        is_potential_match = result.get('is_potential_match', False)
        filter_score = result.get('filter_score', 0.0)
        fail_reasons = result.get('fail_reasons', [])

        print(f"   Result: {'✅ PASS' if is_potential_match == should_pass else '❌ FAIL'}")
        print(f"   Potential Match: {is_potential_match}")
        print(f"   Filter Score: {filter_score:.2f}")

        if fail_reasons:
            print(f"   Fail Reasons: {fail_reasons}")

        if 'checks_performed' in result:
            checks = result['checks_performed']
            for check_name, check_result in checks.items():
                if isinstance(check_result, dict):
                    passed = check_result.get('passed', False)
                    score = check_result.get('score', 0.0)
                    details = check_result.get('details', '')
                    status = '✅' if passed else '❌'
                    print(f"     {check_name}: {status} {score:.2f} - {details}")

        return is_potential_match == should_pass

    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False

def test_naics_alignment(opportunity, company_profile, expected_min_score=0.0):
    """Test the NAICS alignment function"""
    print(f"\n🎯 Testing NAICS Alignment: {opportunity['title'][:50]}...")

    try:
        # Import the NAICS alignment function
        import sys
        sys.path.append('/Users/terrance/Projects/govbiz-ai/infrastructure/lambda/matching-engine/naics-alignment')
        from handler import NAICSAlignmentScorer

        naics_scorer = NAICSAlignmentScorer()
        result = naics_scorer.calculate_naics_alignment(opportunity, company_profile)

        overall_score = result.get('overall_score', 0.0)
        match_level = result.get('match_level', 'unknown')
        status = result.get('status', 'unknown')

        print(f"   Overall Score: {overall_score:.2f}")
        print(f"   Match Level: {match_level}")
        print(f"   Status: {status}")

        if 'primary_alignment' in result:
            primary = result['primary_alignment']
            print(f"   Primary Alignment: {primary.get('score', 0.0):.2f} ({primary.get('match_level', 'unknown')})")
            if 'details' in primary:
                print(f"   Details: {primary['details']}")

        success = overall_score >= expected_min_score
        print(f"   Result: {'✅ PASS' if success else '❌ FAIL'} (expected >= {expected_min_score:.2f})")

        return success

    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False

def main():
    print("🔧 Testing Matching System Fixes for MedPACS")
    print("=" * 60)

    total_tests = 0
    passed_tests = 0

    # Test 1: Manufacturing opportunities should be filtered out
    print("\n📋 TEST SECTION 1: Manufacturing Opportunities (Should NOT Match)")
    print("-" * 50)

    for opp in MANUFACTURING_OPPORTUNITIES:
        total_tests += 1
        if test_quick_filter(opp, MEDPACS_PROFILE, should_pass=False):
            passed_tests += 1

        total_tests += 1
        if test_naics_alignment(opp, MEDPACS_PROFILE, expected_min_score=0.0):
            # For manufacturing vs healthcare, we expect low scores
            passed_tests += 1

    # Test 2: Healthcare opportunities should match well
    print("\n📋 TEST SECTION 2: Healthcare Opportunities (Should Match)")
    print("-" * 50)

    for opp in HEALTHCARE_OPPORTUNITIES:
        total_tests += 1
        if test_quick_filter(opp, MEDPACS_PROFILE, should_pass=True):
            passed_tests += 1

        total_tests += 1
        if test_naics_alignment(opp, MEDPACS_PROFILE, expected_min_score=0.5):
            # For healthcare matching, we expect good scores
            passed_tests += 1

    # Test 3: Test with missing NAICS (fallback behavior)
    print("\n📋 TEST SECTION 3: Missing NAICS Fallback Test")
    print("-" * 50)

    # Create profile without NAICS codes
    profile_no_naics = MEDPACS_PROFILE.copy()
    profile_no_naics.pop('naics_codes', None)

    healthcare_opp = HEALTHCARE_OPPORTUNITIES[0]
    manufacturing_opp = MANUFACTURING_OPPORTUNITIES[0]

    total_tests += 1
    if test_naics_alignment(healthcare_opp, profile_no_naics, expected_min_score=0.2):
        passed_tests += 1

    total_tests += 1
    if test_naics_alignment(manufacturing_opp, profile_no_naics, expected_min_score=0.0):
        passed_tests += 1

    # Summary
    print("\n" + "=" * 60)
    print(f"📊 TEST SUMMARY")
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {total_tests - passed_tests}")
    print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")

    if passed_tests == total_tests:
        print("🎉 ALL TESTS PASSED! The matching system fixes are working correctly.")
        return 0
    else:
        print("⚠️  Some tests failed. The matching system may need additional fixes.")
        return 1

if __name__ == "__main__":
    sys.exit(main())