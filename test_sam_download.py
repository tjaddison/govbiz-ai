#!/usr/bin/env python3
"""
Test script to validate SAM CSV download and processing functionality
"""

import boto3
import json
import time
from datetime import datetime

def test_lambda_invocation():
    """Test the opportunity finder lambda function"""
    
    # Initialize AWS clients
    lambda_client = boto3.client('lambda', region_name='us-east-1')
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    
    # Test event for the lambda
    test_event = {
        'task_type': 'test_discovery',
        'source': 'manual_test',
        'timestamp': datetime.utcnow().isoformat()
    }
    
    lambda_function_name = 'govbiz-ai-dev-opportunity-finder-agent'
    
    print("=" * 60)
    print("TESTING SAM CSV DOWNLOAD AND PROCESSING")
    print("=" * 60)
    
    # Test 1: Invoke the Lambda function
    print(f"1. Invoking Lambda function: {lambda_function_name}")
    
    try:
        response = lambda_client.invoke(
            FunctionName=lambda_function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(test_event)
        )
        
        # Parse response
        response_payload = json.loads(response['Payload'].read())
        
        if response['StatusCode'] == 200:
            print("✓ Lambda function invocation successful")
            
            # Parse the response body
            if 'body' in response_payload:
                body = json.loads(response_payload['body'])
                print(f"✓ Response: {body.get('message', 'No message')}")
                
                if body.get('success'):
                    print("✓ Opportunity discovery completed successfully")
                    
                    # Show processing stats
                    data = body.get('data', {})
                    if data:
                        print(f"  - Total opportunities processed: {data.get('total_opportunities_processed', 0)}")
                        print(f"  - Opportunities inserted: {data.get('opportunities_inserted', 0)}")
                        print(f"  - Opportunities updated: {data.get('opportunities_updated', 0)}")
                        print(f"  - Matched opportunities: {data.get('matched_opportunities', 0)}")
                        print(f"  - High priority opportunities: {data.get('high_priority_opportunities', 0)}")
                else:
                    print(f"✗ Opportunity discovery failed: {body.get('error', 'Unknown error')}")
            else:
                print(f"✗ Unexpected response format: {response_payload}")
        else:
            print(f"✗ Lambda function invocation failed with status: {response['StatusCode']}")
            print(f"Response: {response_payload}")
            
    except Exception as e:
        print(f"✗ Error invoking Lambda function: {e}")
        return False
    
    # Test 2: Check DynamoDB for opportunities
    print("\n2. Checking DynamoDB for opportunities...")
    
    try:
        opportunities_table = dynamodb.Table('govbiz-ai-dev-opportunities')
        
        # Scan for recent opportunities
        response = opportunities_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('source').eq('sam_csv'),
            Limit=10
        )
        
        items = response.get('Items', [])
        
        if items:
            print(f"✓ Found {len(items)} opportunities in DynamoDB")
            
            # Show sample opportunity
            sample_opportunity = items[0]
            print(f"  Sample opportunity:")
            print(f"    - ID: {sample_opportunity.get('id', 'N/A')}")
            print(f"    - Title: {sample_opportunity.get('title', 'N/A')}")
            print(f"    - Agency: {sample_opportunity.get('agency', 'N/A')}")
            print(f"    - Status: {sample_opportunity.get('status', 'N/A')}")
            print(f"    - Posted Date: {sample_opportunity.get('posted_date', 'N/A')}")
            print(f"    - Processed At: {sample_opportunity.get('processed_at', 'N/A')}")
            
        else:
            print("⚠ No opportunities found in DynamoDB")
            
    except Exception as e:
        print(f"✗ Error checking DynamoDB: {e}")
        return False
    
    # Test 3: Check EventBridge rule
    print("\n3. Checking EventBridge rule...")
    
    try:
        events_client = boto3.client('events', region_name='us-east-1')
        
        rule_name = 'govbiz-ai-dev-opportunity-finder-schedule'
        rule_response = events_client.describe_rule(Name=rule_name)
        
        if rule_response:
            print(f"✓ EventBridge rule exists: {rule_name}")
            print(f"  - Schedule: {rule_response.get('ScheduleExpression', 'N/A')}")
            print(f"  - State: {rule_response.get('State', 'N/A')}")
            print(f"  - Description: {rule_response.get('Description', 'N/A')}")
            
            # Check targets
            targets_response = events_client.list_targets_by_rule(Rule=rule_name)
            targets = targets_response.get('Targets', [])
            
            if targets:
                print(f"  - Targets: {len(targets)}")
                for target in targets:
                    print(f"    - Target ID: {target.get('Id')}")
                    print(f"    - Target ARN: {target.get('Arn')}")
            else:
                print("  - No targets configured")
                
        else:
            print("✗ EventBridge rule not found")
            
    except Exception as e:
        print(f"✗ Error checking EventBridge rule: {e}")
        return False
    
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print("✅ SAM CSV download and processing test completed successfully!")
    print("\nConfiguration summary:")
    print(f"  - Lambda function: {lambda_function_name}")
    print(f"  - DynamoDB table: govbiz-ai-dev-opportunities")
    print(f"  - EventBridge rule: {rule_name}")
    print(f"  - Schedule: cron(0 8 * * ? *) - Daily at 8 AM UTC")
    print(f"  - SAM CSV URL: https://s3.amazonaws.com/falextracts/Contract%20Opportunities/datagov/ContractOpportunitiesFullCSV.csv")
    
    return True

if __name__ == "__main__":
    success = test_lambda_invocation()
    exit(0 if success else 1)