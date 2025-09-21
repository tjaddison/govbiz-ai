#!/usr/bin/env python3

import boto3
import requests
from urllib.parse import urlparse, parse_qs

# Create S3 client with same configuration as Lambda
s3_client = boto3.client('s3', region_name='us-east-1')

# Test credentials
session = boto3.Session()
credentials = session.get_credentials()
print(f"Access Key: {credentials.access_key_id[:10]}...")
print(f"Has session token: {'Yes' if credentials.token else 'No'}")

# Generate presigned URL just like the Lambda function
bucket = 'govbizai-raw-documents-927576824761-us-east-1'
key = 'test-upload/test-file.txt'

try:
    presigned_url = s3_client.generate_presigned_url(
        'put_object',
        Params={
            'Bucket': bucket,
            'Key': key
        },
        ExpiresIn=3600  # 1 hour
    )

    print(f"Generated presigned URL: {presigned_url[:100]}...")

    # Parse URL details
    parsed_url = urlparse(presigned_url)
    params = parse_qs(parsed_url.query)
    print(f"AccessKeyId: {params.get('AWSAccessKeyId', ['N/A'])[0][:10]}...")
    print(f"Expires: {params.get('Expires', ['N/A'])[0]}")

    # Test upload with presigned URL
    test_content = b"Hello, World! This is a test upload."

    response = requests.put(
        presigned_url,
        data=test_content,
        headers={'Content-Type': 'text/plain'}
    )

    print(f"Upload response status: {response.status_code}")
    if response.status_code != 200:
        print(f"Upload failed: {response.text}")
    else:
        print("Upload successful!")

        # Clean up test file
        try:
            s3_client.delete_object(Bucket=bucket, Key=key)
            print("Test file cleaned up")
        except Exception as e:
            print(f"Cleanup failed: {e}")

except Exception as e:
    print(f"Error: {e}")