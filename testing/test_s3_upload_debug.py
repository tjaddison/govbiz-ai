#!/usr/bin/env python3

import boto3
import requests
import json
from urllib.parse import urlparse, parse_qs

# Test script to debug S3 presigned URL upload issues
def test_s3_upload():
    print("🔍 Testing S3 presigned URL upload...")

    # Create S3 client with same configuration as Lambda
    s3_client = boto3.client('s3', region_name='us-east-1')

    # Test credentials
    session = boto3.Session()
    credentials = session.get_credentials()
    print(f"✅ AWS Credentials: {credentials.access_key[:10]}...")
    print(f"✅ Has session token: {'Yes' if credentials.token else 'No'}")

    # Same configuration as Lambda
    bucket = 'govbizai-raw-documents-927576824761-us-east-1'
    key = 'test-upload/debug-test.txt'
    kms_key_id = 'alias/govbizai-encryption-key'

    print(f"📍 Bucket: {bucket}")
    print(f"📍 Key: {key}")
    print(f"📍 KMS Key: {kms_key_id}")

    try:
        # Test 1: Generate presigned URL with KMS (current approach)
        print("\n🧪 Test 1: Presigned URL with KMS encryption")
        presigned_url_kms = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket,
                'Key': key,
                'ServerSideEncryption': 'aws:kms',
                'SSEKMSKeyId': kms_key_id
            },
            ExpiresIn=3600
        )

        # Parse URL to see what's included
        parsed_url = urlparse(presigned_url_kms)
        params = parse_qs(parsed_url.query)
        print(f"✅ Generated KMS presigned URL")
        print(f"   URL length: {len(presigned_url_kms)}")
        print(f"   Signature: {params.get('X-Amz-Signature', ['N/A'])[0][:20]}...")

        # Test upload with KMS headers
        test_content = b"Hello, World! This is a KMS test upload."

        response = requests.put(
            presigned_url_kms,
            data=test_content,
            headers={
                'Content-Type': 'text/plain',
                'x-amz-server-side-encryption': 'aws:kms',
                'x-amz-server-side-encryption-aws-kms-key-id': kms_key_id,
            }
        )

        print(f"   Status: {response.status_code}")
        if response.status_code != 200:
            print(f"   Error: {response.text}")
            print(f"   Headers: {dict(response.headers)}")
        else:
            print("   ✅ Upload successful with KMS!")

        print("\n🧪 Test 2: Presigned URL without KMS encryption (current approach)")
        # Test 2: Generate presigned URL without KMS (this matches our Lambda function)
        presigned_url_plain = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': bucket,
                'Key': f'{key}-plain'
            },
            ExpiresIn=3600
        )

        print(f"✅ Generated plain presigned URL")
        print(f"   URL length: {len(presigned_url_plain)}")

        response2 = requests.put(
            presigned_url_plain,
            data=test_content,
            headers={
                'Content-Type': 'text/plain'
            }
        )

        print(f"   Status: {response2.status_code}")
        if response2.status_code != 200:
            print(f"   Error: {response2.text}")
        else:
            print("   ✅ Upload successful without KMS!")

        print("\n🧪 Test 3: KMS presigned URL without KMS headers")
        # Test 3: Use KMS presigned URL but without KMS headers
        response3 = requests.put(
            presigned_url_kms,
            data=test_content,
            headers={
                'Content-Type': 'text/plain'
            }
        )

        print(f"   Status: {response3.status_code}")
        if response3.status_code != 200:
            print(f"   Error: {response3.text}")
        else:
            print("   ✅ KMS URL works without KMS headers!")

        print("\n🧪 Test 4: Plain presigned URL with KMS headers")
        # Test 4: Use plain presigned URL but with KMS headers
        response4 = requests.put(
            presigned_url_plain,
            data=test_content,
            headers={
                'Content-Type': 'text/plain',
                'x-amz-server-side-encryption': 'aws:kms',
                'x-amz-server-side-encryption-aws-kms-key-id': kms_key_id,
            }
        )

        print(f"   Status: {response4.status_code}")
        if response4.status_code != 200:
            print(f"   Error: {response4.text}")
        else:
            print("   ✅ Plain URL works with KMS headers!")

        # Cleanup successful uploads
        print("\n🧹 Cleaning up test files...")
        try:
            s3_client.delete_object(Bucket=bucket, Key=key)
            print("   Deleted KMS test file")
        except:
            pass
        try:
            s3_client.delete_object(Bucket=bucket, Key=f'{key}-plain')
            print("   Deleted plain test file")
        except:
            pass

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_s3_upload()