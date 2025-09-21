#!/usr/bin/env python3

import requests
import boto3
from urllib.parse import urlparse, parse_qs

# First, let's get a presigned URL from our Lambda function
def get_presigned_url():
    # Use AWS credentials to generate a presigned URL directly, similar to our Lambda
    s3_client = boto3.client('s3', region_name='us-east-1')
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

        return presigned_url
    except Exception as e:
        print(f"Error generating presigned URL: {e}")
        return None

def test_upload(presigned_url):
    # Test upload with presigned URL
    test_content = b"Hello, World! This is a test upload."

    print("\n--- Testing upload with Content-Type ---")
    response = requests.put(
        presigned_url,
        data=test_content,
        headers={'Content-Type': 'text/plain'}
    )

    print(f"Upload response status: {response.status_code}")
    if response.status_code != 200:
        print(f"Upload failed: {response.text}")
        print(f"Response headers: {dict(response.headers)}")
    else:
        print("Upload successful!")

    print("\n--- Testing upload without Content-Type ---")
    response2 = requests.put(
        presigned_url,
        data=test_content
    )

    print(f"Upload response status: {response2.status_code}")
    if response2.status_code != 200:
        print(f"Upload failed: {response2.text}")
        print(f"Response headers: {dict(response2.headers)}")
    else:
        print("Upload successful!")

if __name__ == "__main__":
    print("Testing S3 presigned URL upload...")
    presigned_url = get_presigned_url()
    if presigned_url:
        test_upload(presigned_url)