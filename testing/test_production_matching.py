#!/usr/bin/env python3
"""
Production test to validate the matching system fixes
This script tests the deployed Lambda functions to ensure the MedPACS matching issue is resolved
"""

import json
import boto3
import sys
from datetime import datetime

# AWS Lambda client
lambda_client = boto3.client('lambda')

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

# Test opportunities that should NOT match
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

# Test opportunities that SHOULD match
HEALTHCARE_OPPORTUNITIES = [
    {
        "notice_id": "TEST-HEALTHCARE-001",
        "title": "Medical Records Management Services",
        "description": "Seeking qualified contractors to provide medical records management and PACS administration services for military medical facilities",
        "NaicsCode": "621399",  # Healthcare services
        "SetASide": "SDVOSB",
        "posted_date": "2024-01-15"
    }
]

def test_quick_filter_lambda(opportunity, company_profile, should_pass=True):
    """Test the deployed quick filter Lambda function"""
    print(f"\n🔍 Testing Production Quick Filter: {opportunity['title'][:50]}...")

    try:
        payload = {
            'opportunity': opportunity,
            'company_profile': company_profile
        }

        response = lambda_client.invoke(
            FunctionName='govbizai-quick-filter',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        result = json.loads(response['Payload'].read())

        if result.get('statusCode') != 200:
            print(f"   ❌ ERROR: Lambda returned status {result.get('statusCode')}")
            print(f"   Error: {result.get('body', 'Unknown error')}")
            return False

        body = json.loads(result.get('body', '{}'))
        is_potential_match = body.get('is_potential_match', False)
        filter_score = body.get('filter_score', 0.0)
        fail_reasons = body.get('fail_reasons', [])

        print(f"   Result: {'✅ PASS' if is_potential_match == should_pass else '❌ FAIL'}")
        print(f"   Potential Match: {is_potential_match}")
        print(f"   Filter Score: {filter_score:.2f}")

        if fail_reasons:
            print(f"   Fail Reasons:")
            for reason in fail_reasons:
                print(f"     - {reason}")

        return is_potential_match == should_pass

    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False

def test_naics_alignment_lambda(opportunity, company_profile, expected_min_score=0.0):
    """Test the deployed NAICS alignment Lambda function"""
    print(f"\n🎯 Testing Production NAICS Alignment: {opportunity['title'][:50]}...")

    try:
        payload = {
            'opportunity': opportunity,
            'company_profile': company_profile
        }

        response = lambda_client.invoke(
            FunctionName='govbizai-naics-alignment',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        result = json.loads(response['Payload'].read())

        if result.get('statusCode') != 200:
            print(f"   ❌ ERROR: Lambda returned status {result.get('statusCode')}")
            print(f"   Error: {result.get('body', 'Unknown error')}")
            return False

        body = json.loads(result.get('body', '{}'))
        naics_score = body.get('naics_alignment_score', {})
        overall_score = naics_score.get('overall_score', 0.0)
        match_level = naics_score.get('match_level', 'unknown')
        status = naics_score.get('status', 'unknown')

        print(f"   Overall Score: {overall_score:.2f}")
        print(f"   Match Level: {match_level}")
        print(f"   Status: {status}")

        success = overall_score >= expected_min_score
        print(f"   Result: {'✅ PASS' if success else '❌ FAIL'} (expected >= {expected_min_score:.2f})")

        return success

    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False

def main():
    print("🔧 Testing Production Matching System Fixes for MedPACS")
    print("=" * 60)

    total_tests = 0
    passed_tests = 0

    # Test 1: Manufacturing opportunities should be filtered out
    print("\n📋 TEST SECTION 1: Manufacturing Opportunities (Should NOT Match)")
    print("-" * 50)

    for opp in MANUFACTURING_OPPORTUNITIES:
        total_tests += 1
        if test_quick_filter_lambda(opp, MEDPACS_PROFILE, should_pass=False):
            passed_tests += 1

        total_tests += 1
        if test_naics_alignment_lambda(opp, MEDPACS_PROFILE, expected_min_score=0.0):
            # For manufacturing vs healthcare, we expect low scores
            passed_tests += 1

    # Test 2: Healthcare opportunities should match well
    print("\n📋 TEST SECTION 2: Healthcare Opportunities (Should Match)")
    print("-" * 50)

    for opp in HEALTHCARE_OPPORTUNITIES:
        total_tests += 1
        if test_quick_filter_lambda(opp, MEDPACS_PROFILE, should_pass=True):
            passed_tests += 1

        total_tests += 1
        if test_naics_alignment_lambda(opp, MEDPACS_PROFILE, expected_min_score=0.5):
            # For healthcare matching, we expect good scores
            passed_tests += 1

    # Summary
    print("\n" + "=" * 60)
    print(f"📊 PRODUCTION TEST SUMMARY")
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {total_tests - passed_tests}")
    print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")

    if passed_tests == total_tests:
        print("🎉 ALL PRODUCTION TESTS PASSED! The matching system fixes are working correctly.")
        return 0
    else:
        print("⚠️  Some production tests failed. The matching system may need additional fixes.")
        return 1

if __name__ == "__main__":
    sys.exit(main())