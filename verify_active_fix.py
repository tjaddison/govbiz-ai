#!/usr/bin/env python3
"""
Quick verification that the active field logic is working correctly
"""

import boto3
from datetime import datetime, timezone

def verify_active_fix():
    """Check if archived opportunities now have active=false"""
    
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table('govbiz-ai-dev-opportunities')
    
    # Get a few archived opportunities
    response = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('status').eq('archived'),
        Limit=10
    )
    
    items = response.get('Items', [])
    
    print(f"Found {len(items)} archived opportunities")
    print("=" * 60)
    
    current_time = datetime.now(timezone.utc)
    
    for item in items:
        archive_date_str = item.get('archive_date', '')
        active = item.get('active', False)
        status = item.get('status', '')
        title = item.get('title', '')[:50] + "..." if len(item.get('title', '')) > 50 else item.get('title', '')
        
        print(f"Title: {title}")
        print(f"Archive Date: {archive_date_str}")
        print(f"Status: {status}")
        print(f"Active: {active}")
        
        if archive_date_str:
            try:
                archive_date = datetime.fromisoformat(archive_date_str.replace('Z', '+00:00'))
                if current_time >= archive_date:
                    expected_active = False
                else:
                    expected_active = True
                    
                if active == expected_active:
                    print("✅ Active field is CORRECT")
                else:
                    print(f"❌ Active field is WRONG (expected {expected_active}, got {active})")
            except:
                print("⚠️ Could not parse archive date")
        else:
            print("⚠️ No archive date found")
        
        print("-" * 40)
    
    print("\nNote: If active=true for archived items, they were processed with old logic.")
    print("The fix will apply to new data or when the Lambda runs again and detects changes.")

if __name__ == "__main__":
    verify_active_fix()