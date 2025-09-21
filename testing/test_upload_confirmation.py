#!/usr/bin/env python3
"""
Test script to verify the upload confirmation flow works correctly.
This simulates the flow after a document has been uploaded to S3.
"""

import requests
import json
import os

# API endpoint from deployment output
API_ENDPOINT = "https://my9wn2ha3a.execute-api.us-east-1.amazonaws.com/prod"

# Test user credentials - you'll need to provide these
TEST_USER_TOKEN = "YOUR_JWT_TOKEN_HERE"  # Replace with actual JWT token

def test_upload_confirmation():
    """Test the upload confirmation endpoint"""

    # Example document_id and user_id for testing
    test_document_id = "test-doc-123"
    test_user_id = "test-user"

    # Headers with authentication
    headers = {
        "Authorization": f"Bearer {TEST_USER_TOKEN}",
        "Content-Type": "application/json"
    }

    # Test data for upload confirmation
    confirmation_data = {
        "document_id": test_document_id,
        "user_id": test_user_id
    }

    try:
        # Make the upload confirmation request
        response = requests.post(
            f"{API_ENDPOINT}/documents/upload-complete",
            headers=headers,
            json=confirmation_data
        )

        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")

        if response.status_code == 200:
            print("✅ Upload confirmation successful!")
            return True
        else:
            print("❌ Upload confirmation failed!")
            return False

    except Exception as e:
        print(f"❌ Error testing upload confirmation: {e}")
        return False

def test_list_documents():
    """Test listing documents to see status"""

    headers = {
        "Authorization": f"Bearer {TEST_USER_TOKEN}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.get(
            f"{API_ENDPOINT}/documents",
            headers=headers
        )

        print(f"List Documents Status: {response.status_code}")
        print(f"Documents Response: {response.text}")

        if response.status_code == 200:
            documents = response.json()
            print(f"Found {len(documents)} documents")

            for doc in documents:
                status = doc.get('status', 'unknown')
                name = doc.get('name', 'unnamed')
                print(f"  - {name}: {status}")

            return True
        else:
            print("❌ Failed to list documents!")
            return False

    except Exception as e:
        print(f"❌ Error listing documents: {e}")
        return False

if __name__ == "__main__":
    print("Testing Upload Confirmation Flow")
    print("=" * 50)

    # First list existing documents
    print("\n1. Listing existing documents...")
    test_list_documents()

    # Then test upload confirmation
    print("\n2. Testing upload confirmation...")
    if TEST_USER_TOKEN == "YOUR_JWT_TOKEN_HERE":
        print("⚠️  Please replace TEST_USER_TOKEN with actual JWT token to test")
    else:
        test_upload_confirmation()

        # List documents again to see changes
        print("\n3. Listing documents after confirmation...")
        test_list_documents()