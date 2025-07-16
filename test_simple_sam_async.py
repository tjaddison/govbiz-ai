#!/usr/bin/env python3
"""
Test the simple SAM downloader Lambda function with async invocation
"""

import boto3
import json
import time
from datetime import datetime

def test_simple_sam_lambda_async():
    """Test the simple SAM downloader Lambda function with async invocation"""
    
    # Initialize AWS clients
    lambda_client = boto3.client('lambda', region_name='us-east-1')
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    
    # Test event for the lambda
    test_event = {
        'task_type': 'test_discovery',
        'source': 'manual_test',
        'timestamp': datetime.utcnow().isoformat()
    }
    
    lambda_function_name = 'govbiz-ai-dev-simple-sam-downloader'
    
    print("=" * 60)
    print("TESTING SIMPLE SAM CSV DOWNLOADER (ASYNC)")
    print("=" * 60)
    
    # Test 1: Invoke the Lambda function asynchronously
    print(f"1. Invoking Lambda function asynchronously: {lambda_function_name}")
    
    try:
        response = lambda_client.invoke(
            FunctionName=lambda_function_name,
            InvocationType='Event',  # Async invocation
            Payload=json.dumps(test_event)
        )
        
        if response['StatusCode'] == 202:
            print("✓ Lambda function invoked asynchronously")
            print(f"Request ID: {response['ResponseMetadata']['RequestId']}")
        else:
            print(f"✗ Lambda function invocation failed with status: {response['StatusCode']}")
            return False
            
    except Exception as e:
        print(f"✗ Error invoking Lambda function: {e}")
        return False
    
    # Test 2: Wait a bit and check DynamoDB for any results
    print("\n2. Waiting 30 seconds for processing...")
    time.sleep(30)
    
    try:
        opportunities_table = dynamodb.Table('govbiz-ai-dev-opportunities')
        
        # Scan for any opportunities
        response = opportunities_table.scan(
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
            print(f"    - Source: {sample_opportunity.get('source', 'N/A')}")
            print(f"    - Processed At: {sample_opportunity.get('processed_at', 'N/A')}")
            
        else:
            print("⚠ No opportunities found in DynamoDB yet")
            
    except Exception as e:
        print(f"✗ Error checking DynamoDB: {e}")
        return False
    
    # Test 3: Check CloudWatch logs for function execution
    print("\n3. Checking CloudWatch logs...")
    
    try:
        logs_client = boto3.client('logs', region_name='us-east-1')
        
        log_group_name = f'/aws/lambda/{lambda_function_name}'
        
        # Get recent log streams
        streams_response = logs_client.describe_log_streams(
            logGroupName=log_group_name,
            orderBy='LastEventTime',
            descending=True,
            limit=1
        )
        
        if streams_response['logStreams']:
            latest_stream = streams_response['logStreams'][0]
            print(f"✓ Latest log stream: {latest_stream['logStreamName']}")
            print(f"  - Last event: {datetime.fromtimestamp(latest_stream.get('lastEventTime', 0)/1000)}")
            
            # Get some log events
            events_response = logs_client.get_log_events(
                logGroupName=log_group_name,
                logStreamName=latest_stream['logStreamName'],
                limit=10
            )
            
            if events_response['events']:
                print("  - Recent log messages:")
                for event in events_response['events'][-5:]:  # Last 5 events
                    timestamp = datetime.fromtimestamp(event['timestamp']/1000)
                    message = event['message'].strip()
                    print(f"    [{timestamp}] {message}")
            else:
                print("  - No recent log events found")
        else:
            print("⚠ No log streams found")
            
    except Exception as e:
        print(f"✗ Error checking CloudWatch logs: {e}")
        return False
    
    # Test 4: Check EventBridge rule configuration
    print("\n4. Checking EventBridge rule configuration...")
    
    try:
        events_client = boto3.client('events', region_name='us-east-1')
        
        rule_name = 'govbiz-ai-dev-opportunity-finder-schedule'
        rule_response = events_client.describe_rule(Name=rule_name)
        
        if rule_response:
            print(f"✓ EventBridge rule exists: {rule_name}")
            print(f"  - Schedule: {rule_response.get('ScheduleExpression', 'N/A')}")
            print(f"  - State: {rule_response.get('State', 'N/A')}")
            
            # Check targets
            targets_response = events_client.list_targets_by_rule(Rule=rule_name)
            targets = targets_response.get('Targets', [])
            
            if targets:
                for target in targets:
                    if lambda_function_name in target.get('Arn', ''):
                        print(f"  - ✓ Correctly targets: {lambda_function_name}")
                        break
                else:
                    print(f"  - ⚠ Does not target {lambda_function_name}")
            else:
                print("  - ⚠ No targets configured")
                
        else:
            print("✗ EventBridge rule not found")
            
    except Exception as e:
        print(f"✗ Error checking EventBridge rule: {e}")
        return False
    
    print("\n" + "=" * 60)
    print("ASYNC TEST SUMMARY")
    print("=" * 60)
    print("✅ Simple SAM CSV downloader async test completed!")
    print("\nStatus:")
    print(f"  - Lambda function: {lambda_function_name} (invoked asynchronously)")
    print(f"  - DynamoDB table: govbiz-ai-dev-opportunities")
    print(f"  - EventBridge rule: {rule_name}")
    print(f"  - Schedule: cron(0 8 * * ? *) - Daily at 8 AM UTC")
    print("\nNote: The function is processing the SAM CSV file in the background.")
    print("Check CloudWatch logs and DynamoDB after a few minutes for full results.")
    
    return True

if __name__ == "__main__":
    success = test_simple_sam_lambda_async()
    exit(0 if success else 1)