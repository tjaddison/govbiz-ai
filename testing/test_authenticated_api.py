#!/usr/bin/env python3
"""
Test the documents API with authentication to verify the fix works
"""

import requests
import json

# API endpoint
API_ENDPOINT = "https://my9wn2ha3a.execute-api.us-east-1.amazonaws.com/prod"

def test_with_fake_token():
    """Test with a fake token to see if we get proper error response format"""

    headers = {
        "Authorization": "Bearer fake-token-123",
        "Content-Type": "application/json"
    }

    try:
        response = requests.get(f"{API_ENDPOINT}/api/documents", headers=headers)

        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {response.text}")

        if response.status_code == 401:
            # Parse the response to check format
            try:
                data = response.json()
                print("Response parsed as JSON:")
                print(f"  - success: {data.get('success')}")
                print(f"  - data: {data.get('data')}")
                print(f"  - error: {data.get('error')}")

                if 'success' in data and 'error' in data:
                    print("✅ Error response format is correct!")
                else:
                    print("❌ Error response format is wrong!")

            except json.JSONDecodeError:
                print("❌ Response is not valid JSON")

        return response.status_code == 401

    except Exception as e:
        print(f"❌ Error testing API: {e}")
        return False

def check_company_in_dynamodb():
    """Check if the company exists in DynamoDB"""

    try:
        import boto3

        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        companies_table = dynamodb.Table('govbizai-companies')

        company_id = "e4d8f458-b031-70ed-aee1-f318f0290017"

        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' in response:
            item = response['Item']
            documents = item.get('documents', [])
            print(f"✅ Company found in DynamoDB!")
            print(f"  - Company ID: {company_id}")
            print(f"  - Documents count: {len(documents)}")

            for i, doc in enumerate(documents):
                print(f"  - Document {i+1}:")
                print(f"    - ID: {doc.get('document_id', 'N/A')}")
                print(f"    - Name: {doc.get('filename', 'N/A')}")
                print(f"    - Status: {doc.get('status', 'N/A')}")
                print(f"    - Type: {doc.get('document_type', 'N/A')}")

            return len(documents) > 0
        else:
            print(f"❌ Company {company_id} not found in DynamoDB")
            return False

    except Exception as e:
        print(f"❌ Error checking DynamoDB: {e}")
        return False

if __name__ == "__main__":
    print("Testing Documents API with Authentication")
    print("=" * 60)

    print("\n1. Testing API response format...")
    test_with_fake_token()

    print("\n2. Checking company data in DynamoDB...")
    check_company_in_dynamodb()

    print(f"\n3. API Endpoint: {API_ENDPOINT}/api/documents")
    print("\nNext steps:")
    print("- Check browser Network tab for failed requests")
    print("- Look for JavaScript errors in browser Console")
    print("- Verify frontend is actually calling the API")