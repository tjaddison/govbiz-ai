#!/usr/bin/env python3
"""
Verify that the name/phone separation fix is working in the deployed system
"""

import boto3
import json

def verify_name_phone_fix():
    """Check DynamoDB for opportunities with properly separated names and phones"""
    
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    table = dynamodb.Table('govbiz-ai-dev-opportunities')
    
    print("Checking DynamoDB for name/phone separation results...")
    print("=" * 70)
    
    # Get a sample of opportunities
    response = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('source').eq('sam_csv_simple'),
        Limit=20
    )
    
    items = response.get('Items', [])
    
    issues_found = 0
    fixed_count = 0
    
    for item in items:
        contact = item.get('primary_contact', {})
        name = contact.get('name', '')
        phone = contact.get('phone', '')
        email = contact.get('email', '')
        title = item.get('title', '')[:50] + "..." if len(item.get('title', '')) > 50 else item.get('title', '')
        
        # Check for phone numbers still in name field
        import re
        phone_pattern = r'\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\d{10}'
        has_phone_in_name = bool(re.search(phone_pattern, name))
        
        print(f"\nTitle: {title}")
        print(f"Name: '{name}'")
        print(f"Phone: '{phone}'")
        print(f"Email: '{email}'")
        
        if has_phone_in_name:
            print("❌ ISSUE: Phone number still in name field")
            issues_found += 1
        elif phone and not has_phone_in_name:
            print("✅ FIXED: Phone properly separated")
            fixed_count += 1
        elif not phone and not has_phone_in_name:
            print("✓ OK: No phone number (normal)")
        
        print("-" * 50)
    
    print(f"\nSummary:")
    print(f"  - Opportunities checked: {len(items)}")
    print(f"  - Issues found (phone in name): {issues_found}")
    print(f"  - Properly fixed (separated): {fixed_count}")
    print(f"  - Normal (no phone): {len(items) - issues_found - fixed_count}")
    
    if issues_found == 0:
        print(f"\n✅ SUCCESS: No concatenated name/phone issues found!")
        print(f"The fix is working correctly.")
    else:
        print(f"\n⚠️ WARNING: {issues_found} opportunities still have phone numbers in name field")
        print(f"This may indicate the fix needs adjustment or these are edge cases.")
    
    return issues_found == 0

if __name__ == "__main__":
    verify_name_phone_fix()