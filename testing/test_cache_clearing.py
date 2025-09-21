#!/usr/bin/env python3
"""
Test script to validate cache clearing functionality in batch matching
"""

import json
import boto3
import time
from datetime import datetime
from decimal import Decimal

# AWS clients
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

# Table reference
MATCHES_TABLE_NAME = 'govbizai-matches'
matches_table = dynamodb.Table(MATCHES_TABLE_NAME)

# Test company ID (MedPACS)
COMPANY_ID = "e4d8f458-b031-70ed-aee1-f318f0290017"

def create_test_match():
    """Create a test match record to verify it gets cleared"""
    try:
        test_match = {
            'company_id': COMPANY_ID,
            'opportunity_id': 'TEST-CACHE-CLEAR-001',
            'total_score': Decimal('0.85'),
            'confidence_level': 'HIGH',
            'created_at': datetime.utcnow().isoformat() + 'Z',
            'match_reasons': ['Test match for cache clearing validation'],
            'component_scores': {
                'semantic_similarity': Decimal('0.80'),
                'keyword_matching': Decimal('0.70'),
                'naics_alignment': Decimal('1.0'),
                'past_performance': Decimal('0.60'),
                'certification_bonus': Decimal('0.50'),
                'geographic_match': Decimal('0.90'),
                'capacity_fit': Decimal('0.80'),
                'recency_factor': Decimal('0.70')
            }
        }

        matches_table.put_item(Item=test_match)
        print(f"✅ Created test match: {test_match['opportunity_id']}")
        return True
    except Exception as e:
        print(f"❌ Failed to create test match: {str(e)}")
        return False

def check_matches_exist():
    """Check if any matches exist for the company"""
    try:
        response = matches_table.scan(
            FilterExpression='company_id = :company_id',
            ExpressionAttributeValues={':company_id': COMPANY_ID}
        )

        matches = [m for m in response.get('Items', []) if not m.get('company_id', '').startswith('BATCH_JOB#')]
        print(f"📊 Found {len(matches)} matches for company: {COMPANY_ID}")

        for match in matches:
            print(f"   - {match.get('opportunity_id', 'Unknown')} (Score: {match.get('total_score', 0)})")

        return len(matches)
    except Exception as e:
        print(f"❌ Failed to check matches: {str(e)}")
        return -1

def trigger_batch_matching():
    """Trigger batch matching to test cache clearing"""
    try:
        # Call the batch matching API endpoint
        payload = {
            'httpMethod': 'POST',
            'path': '/api/matches/batch',
            'headers': {
                'Authorization': 'Bearer dummy-token-for-testing'  # In real usage, this would be a valid Cognito token
            },
            'body': json.dumps({
                'opportunity_filters': {
                    'posted_after': '2024-01-01T00:00:00Z'
                },
                'batch_size': 10
            })
        }

        print("🚀 Triggering batch matching...")
        response = lambda_client.invoke(
            FunctionName='govbizai-api-matches',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        result = json.loads(response['Payload'].read())
        print(f"📋 Batch matching response: {result.get('statusCode', 'Unknown status')}")

        if result.get('statusCode') == 200:
            body = json.loads(result.get('body', '{}'))
            if body.get('success'):
                job_id = body.get('data', {}).get('job_id')
                print(f"✅ Batch matching started successfully! Job ID: {job_id}")
                return True

        print(f"⚠️  Batch matching response: {result}")
        return False

    except Exception as e:
        print(f"❌ Failed to trigger batch matching: {str(e)}")
        return False

def main():
    print("🧪 Testing Cache Clearing Functionality")
    print("=" * 50)

    # Step 1: Check initial state
    print("\n📋 Step 1: Check initial matches")
    initial_count = check_matches_exist()

    # Step 2: Create a test match
    print("\n📋 Step 2: Create test match")
    if not create_test_match():
        print("❌ Failed to create test match - aborting test")
        return 1

    # Step 3: Verify test match was created
    print("\n📋 Step 3: Verify test match exists")
    after_create_count = check_matches_exist()

    if after_create_count <= initial_count:
        print("❌ Test match was not created properly - aborting test")
        return 1

    print(f"✅ Test match created successfully! Match count increased from {initial_count} to {after_create_count}")

    # Step 4: Trigger batch matching (which should clear old matches)
    print("\n📋 Step 4: Trigger batch matching to test cache clearing")
    if not trigger_batch_matching():
        print("❌ Failed to trigger batch matching")
        return 1

    # Step 5: Wait a moment and check if matches were cleared
    print("\n📋 Step 5: Wait and check if matches were cleared")
    time.sleep(3)  # Give the function time to execute

    final_count = check_matches_exist()

    # The count should be 0 or much lower if clearing worked
    if final_count < after_create_count:
        print(f"✅ SUCCESS! Cache clearing worked! Match count reduced from {after_create_count} to {final_count}")
        print("🎉 Cache clearing functionality is working correctly!")
        return 0
    else:
        print(f"⚠️  Cache clearing may not have worked. Match count: {after_create_count} → {final_count}")
        print("💡 This could be due to authorization issues or the function not executing the clear logic")
        return 1

if __name__ == "__main__":
    exit(main())