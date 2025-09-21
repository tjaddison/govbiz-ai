#!/usr/bin/env python3
"""
Test the documents API endpoint directly to verify it's working
"""

import requests
import json

# API endpoint from deployment output
API_ENDPOINT = "https://my9wn2ha3a.execute-api.us-east-1.amazonaws.com/prod"

def test_documents_api_unauthenticated():
    """Test the documents API without authentication to see what error we get"""

    try:
        # Test without auth header
        response = requests.get(f"{API_ENDPOINT}/api/documents")

        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        print(f"Response Body: {response.text}")

        return response.status_code == 401  # Should be unauthorized

    except Exception as e:
        print(f"Error testing API: {e}")
        return False

def test_documents_api_options():
    """Test CORS preflight request"""

    try:
        # Test OPTIONS request for CORS
        response = requests.options(
            f"{API_ENDPOINT}/api/documents",
            headers={
                "Origin": "https://d21w4wbdrthfbu.cloudfront.net",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type"
            }
        )

        print(f"OPTIONS Status Code: {response.status_code}")
        print(f"CORS Headers: {dict(response.headers)}")

        return response.status_code == 200

    except Exception as e:
        print(f"Error testing CORS: {e}")
        return False

if __name__ == "__main__":
    print("Testing Documents API Endpoint")
    print("=" * 50)

    print("\n1. Testing unauthorized request...")
    test_documents_api_unauthenticated()

    print("\n2. Testing CORS preflight...")
    test_documents_api_options()

    print(f"\n3. API Endpoint being tested: {API_ENDPOINT}/api/documents")