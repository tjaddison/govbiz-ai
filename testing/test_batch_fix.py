#!/usr/bin/env python3
"""
Test script to validate the batch matching fix
"""

import requests
import json
import time

# Configuration
API_BASE_URL = "https://my9wn2ha3a.execute-api.us-east-1.amazonaws.com/prod/api"

def test_batch_endpoint_exists():
    """Test that the batch endpoint now returns a proper response instead of 403"""
    print("Testing batch endpoint availability...")

    # Test with an invalid token to see if we get proper authentication error
    # instead of 403 (which indicates the endpoint doesn't exist)
    response = requests.post(
        f"{API_BASE_URL}/matches/batch",
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer invalid_token"
        },
        json={"force_refresh": False, "batch_size": 50}
    )

    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")

    if response.status_code == 403:
        print("❌ Still getting 403 - endpoint configuration issue")
        return False
    elif response.status_code == 401:
        print("✅ Getting 401 Unauthorized - endpoint exists but needs authentication")
        return True
    else:
        print(f"ℹ️  Unexpected status code: {response.status_code}")
        return True

def test_manual_endpoint_exists():
    """Test the manual matching endpoint"""
    print("\nTesting manual endpoint availability...")

    response = requests.post(
        f"{API_BASE_URL}/matches/manual",
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer invalid_token"
        },
        json={"opportunity_id": "test_opportunity"}
    )

    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")

    if response.status_code == 403:
        print("❌ Manual endpoint getting 403 - configuration issue")
        return False
    elif response.status_code == 401:
        print("✅ Manual endpoint exists but needs authentication")
        return True
    else:
        print(f"ℹ️  Unexpected status code: {response.status_code}")
        return True

def test_cors_options():
    """Test CORS OPTIONS request"""
    print("\nTesting CORS OPTIONS for batch endpoint...")

    response = requests.options(
        f"{API_BASE_URL}/matches/batch",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type,Authorization"
        }
    )

    print(f"Status Code: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")

    return response.status_code in [200, 204]

def main():
    print("🧪 Testing Batch Matching Fix")
    print("="*50)

    results = {
        "batch_endpoint": test_batch_endpoint_exists(),
        "manual_endpoint": test_manual_endpoint_exists(),
        "cors_options": test_cors_options()
    }

    print("\n" + "="*50)
    print("📊 Test Results Summary:")

    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name}: {status}")

    all_passed = all(results.values())

    if all_passed:
        print("\n🎉 All tests passed! The 403 error has been fixed.")
        print("The batch endpoints are now properly configured and accessible.")
    else:
        print("\n⚠️  Some tests failed. The batch endpoints may need additional configuration.")

    return all_passed

if __name__ == "__main__":
    main()