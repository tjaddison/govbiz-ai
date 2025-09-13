#!/usr/bin/env python3
"""
Simple test for Bedrock Titan Text Embeddings V2
"""

import boto3
import json
import sys

def test_bedrock_direct():
    """Test direct Bedrock access"""
    try:
        bedrock_runtime = boto3.client('bedrock-runtime', region_name='us-east-1')

        # Test simple embedding generation
        body = {
            "inputText": "This is a test document for embedding generation",
            "dimensions": 1024,
            "normalize": True
        }

        response = bedrock_runtime.invoke_model(
            modelId="amazon.titan-embed-text-v2:0",
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json"
        )

        response_body = json.loads(response['body'].read())
        embedding = response_body.get('embedding', [])

        print(f"✅ Bedrock access successful! Generated embedding with {len(embedding)} dimensions")
        print(f"First few values: {embedding[:5]}")

        return True

    except Exception as e:
        print(f"❌ Bedrock access failed: {str(e)}")
        return False

def test_dynamodb_access():
    """Test DynamoDB access"""
    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table('govbizai-vector-index')

        # Test putting an item
        test_item = {
            'entity_type': 'test',
            'entity_id': 'test-001',
            's3_uri': 's3://test-bucket/test-key',
            'embedding_count': 1,
            'total_tokens': 10,
            'metadata': {
                'test': True
            },
            'created_at': '2024-01-01T00:00:00Z'
        }

        table.put_item(Item=test_item)
        print("✅ DynamoDB write successful!")

        # Test reading the item back
        response = table.get_item(
            Key={
                'entity_type': 'test',
                'entity_id': 'test-001'
            }
        )

        if 'Item' in response:
            print("✅ DynamoDB read successful!")

            # Clean up test item
            table.delete_item(
                Key={
                    'entity_type': 'test',
                    'entity_id': 'test-001'
                }
            )
            print("✅ DynamoDB cleanup successful!")

        return True

    except Exception as e:
        print(f"❌ DynamoDB access failed: {str(e)}")
        return False

def test_s3_access():
    """Test S3 access"""
    try:
        s3_client = boto3.client('s3', region_name='us-east-1')
        bucket_name = 'govbizai-embeddings-927576824761-us-east-1'

        # Test putting an object
        test_data = {
            'test': True,
            'message': 'This is a test embedding file'
        }

        s3_client.put_object(
            Bucket=bucket_name,
            Key='test/test-embedding.json',
            Body=json.dumps(test_data),
            ContentType='application/json'
        )
        print("✅ S3 write successful!")

        # Test reading the object back
        response = s3_client.get_object(
            Bucket=bucket_name,
            Key='test/test-embedding.json'
        )

        data = json.loads(response['Body'].read().decode('utf-8'))
        if data.get('test'):
            print("✅ S3 read successful!")

        # Clean up test object
        s3_client.delete_object(
            Bucket=bucket_name,
            Key='test/test-embedding.json'
        )
        print("✅ S3 cleanup successful!")

        return True

    except Exception as e:
        print(f"❌ S3 access failed: {str(e)}")
        return False

def main():
    """Main test function"""
    print("🧪 Testing Phase 4 Infrastructure Access")
    print("=" * 50)

    success_count = 0
    total_tests = 3

    # Test Bedrock access
    if test_bedrock_direct():
        success_count += 1

    print()

    # Test DynamoDB access
    if test_dynamodb_access():
        success_count += 1

    print()

    # Test S3 access
    if test_s3_access():
        success_count += 1

    print()
    print("=" * 50)
    print(f"Tests passed: {success_count}/{total_tests}")

    if success_count == total_tests:
        print("🎉 All infrastructure access tests passed!")
    else:
        print(f"⚠️  {total_tests - success_count} tests failed")

    return success_count == total_tests

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)