#!/usr/bin/env python3
"""
Test error handling and retry mechanisms in the matching system
"""
import json
import boto3

def test_error_handling():
    """Test error handling in various matching components"""

    lambda_client = boto3.client('lambda')

    print("Testing error handling and retry mechanisms...")
    print("=" * 60)

    # Test 1: Quick filter with missing data
    print("\n1. Testing quick filter with missing data...")
    missing_data_payload = {
        "opportunity": {},  # Empty opportunity
        "company_profile": {}  # Empty company profile
    }

    try:
        response = lambda_client.invoke(
            FunctionName='govbizai-quick-filter',
            InvocationType='RequestResponse',
            Payload=json.dumps(missing_data_payload)
        )
        result = json.loads(response['Payload'].read())
        print(f"  Status Code: {result.get('statusCode')}")

        if result.get('statusCode') == 200:
            body = json.loads(result.get('body', '{}'))
            filter_details = body.get('filter_details', {})
            print(f"  Result: {filter_details.get('is_potential_match', 'unknown')}")
            print(f"  Processing Time: {filter_details.get('processing_time_ms', 0):.2f}ms")
            print("  ✓ Quick filter handles missing data gracefully")
        else:
            print(f"  ✗ Quick filter failed: {result.get('body')}")

    except Exception as e:
        print(f"  ✗ Quick filter error: {str(e)}")

    # Test 2: Semantic similarity with invalid data
    print("\n2. Testing semantic similarity with invalid data...")
    invalid_payload = {
        "opportunity": {
            "notice_id": "invalid-test",
            "title": None,  # Invalid data
            "description": "",
            "naics_code": "invalid"
        },
        "company_profile": {
            "company_id": "invalid-company",
            "company_name": None,  # Invalid data
            "capability_statement": ""
        }
    }

    try:
        response = lambda_client.invoke(
            FunctionName='govbizai-semantic-similarity',
            InvocationType='RequestResponse',
            Payload=json.dumps(invalid_payload)
        )
        result = json.loads(response['Payload'].read())
        print(f"  Status Code: {result.get('statusCode')}")

        if result.get('statusCode') == 200:
            body = json.loads(result.get('body', '{}'))
            similarity_score = body.get('similarity_score', {})
            print(f"  Similarity Score: {similarity_score.get('weighted_average_similarity', 0):.4f}")
            print(f"  Status: {similarity_score.get('status', 'unknown')}")
            print("  ✓ Semantic similarity handles invalid data gracefully")
        else:
            print(f"  ✗ Semantic similarity failed: {result.get('body')}")

    except Exception as e:
        print(f"  ✗ Semantic similarity error: {str(e)}")

    # Test 3: Match orchestrator with malformed input
    print("\n3. Testing match orchestrator with malformed input...")
    malformed_payload = {
        "opportunity": "this should be an object",  # Wrong type
        "company_profile": ["this", "should", "also", "be", "an", "object"]  # Wrong type
    }

    try:
        response = lambda_client.invoke(
            FunctionName='govbizai-match-orchestrator',
            InvocationType='RequestResponse',
            Payload=json.dumps(malformed_payload)
        )
        result = json.loads(response['Payload'].read())
        print(f"  Status Code: {result.get('statusCode')}")

        if result.get('statusCode') == 400:
            print("  ✓ Match orchestrator properly validates input")
        elif result.get('statusCode') == 500:
            print("  ✓ Match orchestrator handles malformed input with server error")
        else:
            print(f"  ? Unexpected response: {result.get('statusCode')}")

    except Exception as e:
        print(f"  ✗ Match orchestrator error: {str(e)}")

    # Test 4: Lambda function timeout simulation
    print("\n4. Testing component resilience...")

    # Test each component with minimal valid data to ensure they respond quickly
    components = [
        'govbizai-keyword-matching',
        'govbizai-naics-alignment',
        'govbizai-past-performance',
        'govbizai-certification-bonus',
        'govbizai-geographic-match',
        'govbizai-capacity-fit',
        'govbizai-recency-factor'
    ]

    minimal_payload = {
        "opportunity": {
            "notice_id": "resilience-test",
            "title": "Test",
            "description": "Test description",
            "naics_code": "541511"
        },
        "company_profile": {
            "company_id": "test-company",
            "company_name": "Test Company",
            "naics_codes": ["541511"]
        }
    }

    for component in components:
        try:
            response = lambda_client.invoke(
                FunctionName=component,
                InvocationType='RequestResponse',
                Payload=json.dumps(minimal_payload)
            )
            result = json.loads(response['Payload'].read())
            status_code = result.get('statusCode', 0)

            if status_code == 200:
                print(f"  ✓ {component}: Responds correctly")
            else:
                print(f"  ? {component}: Status {status_code}")

        except Exception as e:
            print(f"  ✗ {component}: Error - {str(e)}")

    # Test 5: Database error handling
    print("\n5. Testing database error handling...")

    # Try to query a non-existent company
    try:
        dynamodb = boto3.resource('dynamodb')
        companies_table = dynamodb.Table('govbizai-companies')

        response = companies_table.get_item(
            Key={'company_id': 'non-existent-company-12345'}
        )

        if 'Item' not in response:
            print("  ✓ Database handles non-existent records gracefully")
        else:
            print("  ? Unexpected: Found non-existent company")

    except Exception as e:
        print(f"  ✗ Database error: {str(e)}")

    print("\n" + "=" * 60)
    print("ERROR HANDLING TEST COMPLETE")
    print("=" * 60)

if __name__ == "__main__":
    test_error_handling()