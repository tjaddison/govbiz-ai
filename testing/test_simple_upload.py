#!/usr/bin/env python3

import boto3
import requests

def test_simple_presigned_url():
    print("🔍 Testing presigned URL with Content-Type in signature...")

    s3_client = boto3.client('s3', region_name='us-east-1')
    bucket = 'govbizai-raw-documents-927576824761-us-east-1'
    key = 'test-upload/simple-test.txt'

    # Generate presigned URL WITH Content-Type in the signature
    presigned_url = s3_client.generate_presigned_url(
        'put_object',
        Params={
            'Bucket': bucket,
            'Key': key,
            'ContentType': 'text/plain'  # Include Content-Type in signature
        },
        ExpiresIn=3600
    )

    print(f"✅ Generated presigned URL with Content-Type")
    print(f"   URL: {presigned_url[:100]}...")

    # Upload with matching Content-Type header
    test_content = b"Hello, World! This should work now."

    response = requests.put(
        presigned_url,
        data=test_content,
        headers={
            'Content-Type': 'text/plain'  # Must match the signature
        }
    )

    print(f"📍 Upload Status: {response.status_code}")
    if response.status_code == 200:
        print("✅ Upload successful!")

        # Clean up
        try:
            s3_client.delete_object(Bucket=bucket, Key=key)
            print("🧹 Cleaned up test file")
        except Exception as e:
            print(f"⚠️ Cleanup failed: {e}")
    else:
        print(f"❌ Upload failed: {response.text}")

if __name__ == "__main__":
    test_simple_presigned_url()