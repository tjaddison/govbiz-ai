#!/usr/bin/env python3
"""
Test script to simulate the complete browser upload flow.
This tests the presigned URL generation and S3 upload without needing browser authentication.
"""

import boto3
import json
import requests
import tempfile
import os
from datetime import datetime

def test_lambda_presigned_url_generation():
    """Test presigned URL generation by invoking Lambda directly"""
    print("🔧 Testing Lambda Presigned URL Generation")
    print("=" * 60)

    # Create Lambda client
    lambda_client = boto3.client('lambda', region_name='us-east-1')

    # Simulate the API Gateway event that would be sent to Lambda
    test_event = {
        "httpMethod": "POST",
        "path": "/api/documents/upload-url",
        "headers": {
            "Content-Type": "application/json"
        },
        "requestContext": {
            "authorizer": {
                "claims": {
                    "sub": "e4d8f458-b031-70ed-aee1-f318f0290017",
                    "custom:company_id": "e4d8f458-b031-70ed-aee1-f318f0290017",
                    "email": "terrance@xenvya.com"
                }
            }
        },
        "body": json.dumps({
            "filename": "test_upload.txt",
            "file_type": "text/plain",
            "document_type": "capability_statement",
            "file_size": 50
        })
    }

    try:
        print("📤 Invoking Lambda function to generate presigned URL...")
        response = lambda_client.invoke(
            FunctionName='govbizai-api-documents',
            Payload=json.dumps(test_event)
        )

        # Parse the response
        payload = response['Payload'].read().decode('utf-8')
        lambda_response = json.loads(payload)

        print(f"📥 Lambda Response Status: {lambda_response.get('statusCode')}")

        if lambda_response.get('statusCode') == 200:
            body = json.loads(lambda_response['body'])
            if 'data' in body and 'uploadUrl' in body['data']:
                presigned_url = body['data']['uploadUrl']
                s3_key = body['data']['key']
                document_id = body['data']['document_id']

                print(f"✅ Presigned URL generated successfully!")
                print(f"📄 Document ID: {document_id}")
                print(f"🗂️  S3 Key: {s3_key}")
                print(f"🔗 Presigned URL: {presigned_url[:100]}...")

                return presigned_url, s3_key, document_id
            else:
                print(f"❌ Unexpected response format: {body}")
                return None, None, None
        else:
            print(f"❌ Lambda function returned error: {lambda_response}")
            return None, None, None

    except Exception as e:
        print(f"❌ Error invoking Lambda: {str(e)}")
        return None, None, None

def test_s3_upload_with_presigned_url(presigned_url, s3_key):
    """Test uploading a file using the presigned URL"""
    print(f"\n🔧 Testing S3 Upload with Presigned URL")
    print("=" * 60)

    # Create test file content
    test_content = f"""Test Document Upload
Date: {datetime.now().isoformat()}
Content: This is a test file to verify S3 upload functionality.
Status: Testing upload with presigned URL (no KMS headers required)
"""

    try:
        print("📤 Uploading test file to S3...")

        # Make the PUT request exactly like a browser would
        headers = {
            'Content-Type': 'text/plain'
        }

        response = requests.put(
            presigned_url,
            data=test_content.encode('utf-8'),
            headers=headers
        )

        print(f"📥 S3 Upload Response Status: {response.status_code}")

        if response.status_code == 200:
            print("✅ File uploaded successfully to S3!")
            return True
        else:
            print(f"❌ S3 upload failed!")
            print(f"Response: {response.text}")
            print(f"Headers: {response.headers}")
            return False

    except Exception as e:
        print(f"❌ Error uploading to S3: {str(e)}")
        return False

def verify_s3_upload(s3_key):
    """Verify the file was actually uploaded to S3"""
    print(f"\n🔧 Verifying File Exists in S3")
    print("=" * 60)

    try:
        s3_client = boto3.client('s3', region_name='us-east-1')
        bucket_name = 'govbizai-raw-documents-927576824761-us-east-1'

        print(f"🔍 Checking for file: s3://{bucket_name}/{s3_key}")

        # Check if object exists
        response = s3_client.head_object(
            Bucket=bucket_name,
            Key=s3_key
        )

        print(f"✅ File verified in S3!")
        print(f"📊 File size: {response.get('ContentLength')} bytes")
        print(f"🕒 Last modified: {response.get('LastModified')}")
        print(f"🔐 Server-side encryption: {response.get('ServerSideEncryption', 'None')}")

        # Download and verify content
        obj_response = s3_client.get_object(
            Bucket=bucket_name,
            Key=s3_key
        )

        content = obj_response['Body'].read().decode('utf-8')
        print(f"📄 File content preview: {content[:100]}...")

        return True

    except Exception as e:
        print(f"❌ Error verifying S3 upload: {str(e)}")
        return False

def cleanup_test_file(s3_key):
    """Clean up the test file from S3"""
    print(f"\n🧹 Cleaning up test file")
    print("=" * 60)

    try:
        s3_client = boto3.client('s3', region_name='us-east-1')
        bucket_name = 'govbizai-raw-documents-927576824761-us-east-1'

        s3_client.delete_object(
            Bucket=bucket_name,
            Key=s3_key
        )

        print("✅ Test file cleaned up successfully")

    except Exception as e:
        print(f"⚠️  Error cleaning up test file: {str(e)}")

def main():
    """Run the complete upload test simulation"""
    print("🚀 Browser Upload Flow Simulation")
    print("=" * 60)
    print("This test simulates exactly what a browser does:")
    print("1. Get presigned URL from Lambda (with authentication)")
    print("2. Use presigned URL to upload file to S3")
    print("3. Verify upload succeeded")
    print("")

    # Step 1: Generate presigned URL
    presigned_url, s3_key, document_id = test_lambda_presigned_url_generation()

    if not presigned_url:
        print("❌ Failed to generate presigned URL. Aborting test.")
        return False

    # Step 2: Upload file using presigned URL
    upload_success = test_s3_upload_with_presigned_url(presigned_url, s3_key)

    if not upload_success:
        print("❌ S3 upload failed. The 403 error is still present.")
        return False

    # Step 3: Verify upload
    verification_success = verify_s3_upload(s3_key)

    # Step 4: Cleanup
    if s3_key:
        cleanup_test_file(s3_key)

    # Final result
    print(f"\n🎯 Final Test Result")
    print("=" * 60)

    if upload_success and verification_success:
        print("✅ SUCCESS: Complete upload flow works perfectly!")
        print("✅ The 403 Forbidden error has been completely resolved!")
        print("✅ Browser uploads should now work without issues!")
        return True
    else:
        print("❌ FAILURE: Upload flow still has issues")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)