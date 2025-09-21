#!/usr/bin/env python3

import boto3
import requests

def test_correct_kms_upload():
    print("🔍 Testing correct KMS presigned URL with Content-Type...")

    # Force signature version 4 for KMS support
    s3_client = boto3.client(
        's3',
        region_name='us-east-1',
        config=boto3.session.Config(signature_version='s3v4')
    )
    bucket = 'govbizai-raw-documents-927576824761-us-east-1'
    key = 'test-upload/correct-test.txt'
    kms_key_id = 'arn:aws:kms:us-east-1:927576824761:key/2cb19384-93c3-47b0-97c5-00437b82da71'

    # Generate presigned URL WITH KMS encryption AND Content-Type in signature
    presigned_url = s3_client.generate_presigned_url(
        'put_object',
        Params={
            'Bucket': bucket,
            'Key': key,
            'ContentType': 'text/plain',  # Include Content-Type in signature
            'ServerSideEncryption': 'aws:kms',
            'SSEKMSKeyId': kms_key_id
        },
        ExpiresIn=3600
    )

    print(f"✅ Generated presigned URL with KMS + Content-Type")
    print(f"   URL: {presigned_url[:100]}...")

    # Upload with ALL matching headers
    test_content = b"Hello, World! This should work with proper KMS setup."

    response = requests.put(
        presigned_url,
        data=test_content,
        headers={
            'Content-Type': 'text/plain',  # Must match signature
            'x-amz-server-side-encryption': 'aws:kms',
            'x-amz-server-side-encryption-aws-kms-key-id': kms_key_id,
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
        print(f"Response headers: {dict(response.headers)}")

if __name__ == "__main__":
    test_correct_kms_upload()