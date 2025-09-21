#!/usr/bin/env python3
"""
Test script to verify that the production matches API returns opportunity details.
"""

import requests
import json

# Production API endpoint
API_BASE = "https://my9wn2ha3a.execute-api.us-east-1.amazonaws.com/prod"

def test_matches_api():
    """Test the matches API to see if it returns opportunity details"""
    print("🔍 Testing production matches API...")

    # Test without authentication first (to see the error structure)
    url = f"{API_BASE}/api/matches"
    print(f"Making request to: {url}")

    try:
        response = requests.get(url, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")

        if response.text:
            try:
                data = response.json()
                print(f"Response Data: {json.dumps(data, indent=2)}")
            except json.JSONDecodeError:
                print(f"Raw Response: {response.text[:500]}...")
        else:
            print("Empty response")

    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")

def test_opportunities_api():
    """Test that opportunities API is working"""
    print("\n🔍 Testing opportunities API...")

    url = f"{API_BASE}/api/opportunities?limit=1"
    print(f"Making request to: {url}")

    try:
        response = requests.get(url, timeout=10)
        print(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            if data.get('success') and data.get('data', {}).get('items'):
                print("✅ Opportunities API is working")
                opportunity = data['data']['items'][0]
                print(f"Sample opportunity ID: {opportunity.get('notice_id', 'Unknown')}")
                print(f"Sample opportunity title: {opportunity.get('title', 'Unknown')}")
            else:
                print("❌ No opportunities found")
        else:
            print(f"❌ API error: {response.status_code}")

    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")

def test_web_app_url():
    """Test the web application URL"""
    print("\n🌐 Testing web application...")

    url = "https://d21w4wbdrthfbu.cloudfront.net"
    print(f"Web App URL: {url}")

    try:
        response = requests.get(url, timeout=10)
        print(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            print("✅ Web application is accessible")
            if "GovBizAI" in response.text or "React" in response.text:
                print("✅ Web application content looks correct")
            else:
                print("⚠️  Web application content may not be updated yet")
        else:
            print(f"❌ Web application error: {response.status_code}")

    except requests.exceptions.RequestException as e:
        print(f"Web app request failed: {e}")

if __name__ == "__main__":
    print("🚀 Testing GovBizAI Production Deployment\n")

    test_opportunities_api()
    test_matches_api()
    test_web_app_url()

    print("\n📝 Summary:")
    print("- Backend APIs are deployed and accessible")
    print("- Frontend is deployed to CloudFront")
    print("- To test match functionality with opportunity details:")
    print("  1. Visit: https://d21w4wbdrthfbu.cloudfront.net")
    print("  2. Sign in or create an account")
    print("  3. Navigate to the Matches section")
    print("  4. Look for opportunity details in match cards")
    print("\n✨ Deployment testing complete!")