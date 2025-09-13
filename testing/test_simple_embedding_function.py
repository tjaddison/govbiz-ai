#!/usr/bin/env python3
"""
Test the simple embedding generation Lambda function
"""

import boto3
import json
import sys
from datetime import datetime

def test_embedding_generation():
    """Test the embedding generation function"""
    try:
        lambda_client = boto3.client('lambda', region_name='us-east-1')

        # Test opportunity embedding
        opportunity_test_data = {
            "type": "opportunity",
            "operation": "generate",
            "data": {
                "notice_id": "test-opp-001",
                "Title": "IT Services for Government Agency",
                "Description": "Seeking comprehensive IT support services including system maintenance, help desk support, and network administration for a federal agency.",
                "Sol#": "TEST-SOL-2024-001",
                "Department/Ind.Agency": "Department of Defense",
                "NaicsCode": "541512",
                "SetASide": "Small Business",
                "PostedDate": "2024-01-15",
                "ResponseDeadLine": "2024-02-15",
                "ArchiveDate": "2024-03-15"
            }
        }

        print("🧪 Testing Opportunity Embedding Generation...")
        response = lambda_client.invoke(
            FunctionName='govbizai-simple-embedding',
            Payload=json.dumps(opportunity_test_data)
        )

        result = json.loads(response['Payload'].read().decode())

        if result.get('statusCode') == 200:
            print("✅ Opportunity embedding generation successful!")
            body = result.get('body', {})
            opp_result = body.get('result', {})
            print(f"   - Notice ID: {opp_result.get('notice_id')}")
            print(f"   - S3 URI: {opp_result.get('s3_uri')}")
            print(f"   - Token Count: {opp_result.get('total_tokens')}")
        else:
            print(f"❌ Opportunity embedding generation failed: {result.get('body', {}).get('error')}")
            return False

        print()

        # Test company embedding
        company_test_data = {
            "type": "company",
            "operation": "generate",
            "data": {
                "company_id": "test-company-001",
                "tenant_id": "test-tenant-001",
                "company_name": "TechCorp Solutions",
                "capability_statement": "TechCorp Solutions is a veteran-owned small business specializing in IT infrastructure management, cybersecurity, and cloud migration services for federal agencies.",
                "industry_naics": ["541511", "541512", "541519"],
                "certifications": ["8(a)", "SDVOSB", "ISO 27001"],
                "past_performance": "Successfully delivered 15 IT modernization projects for DoD agencies over the past 5 years, with an average CPARS rating of 4.8/5.0."
            }
        }

        print("🧪 Testing Company Embedding Generation...")
        response = lambda_client.invoke(
            FunctionName='govbizai-simple-embedding',
            Payload=json.dumps(company_test_data)
        )

        result = json.loads(response['Payload'].read().decode())

        if result.get('statusCode') == 200:
            print("✅ Company embedding generation successful!")
            body = result.get('body', {})
            comp_result = body.get('result', {})
            print(f"   - Company ID: {comp_result.get('company_id')}")
            print(f"   - S3 URI: {comp_result.get('s3_uri')}")
            print(f"   - Token Count: {comp_result.get('total_tokens')}")
        else:
            print(f"❌ Company embedding generation failed: {result.get('body', {}).get('error')}")
            return False

        return True

    except Exception as e:
        print(f"❌ Test execution failed: {str(e)}")
        return False

def verify_s3_storage():
    """Verify that embeddings are stored in S3"""
    try:
        s3_client = boto3.client('s3', region_name='us-east-1')
        bucket_name = 'govbizai-embeddings-927576824761-us-east-1'

        print("🧪 Verifying S3 Storage...")

        # List objects in the bucket
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='opportunities/test-opp-001/',
            MaxKeys=10
        )

        if 'Contents' in response and len(response['Contents']) > 0:
            print("✅ Opportunity embedding found in S3!")
            for obj in response['Contents']:
                print(f"   - {obj['Key']} (Size: {obj['Size']} bytes)")
        else:
            print("❌ No opportunity embeddings found in S3")
            return False

        # Check company embeddings
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='companies/test-company-001/',
            MaxKeys=10
        )

        if 'Contents' in response and len(response['Contents']) > 0:
            print("✅ Company embedding found in S3!")
            for obj in response['Contents']:
                print(f"   - {obj['Key']} (Size: {obj['Size']} bytes)")
        else:
            print("❌ No company embeddings found in S3")
            return False

        return True

    except Exception as e:
        print(f"❌ S3 verification failed: {str(e)}")
        return False

def verify_dynamodb_index():
    """Verify that vector index entries are stored in DynamoDB"""
    try:
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        table = dynamodb.Table('govbizai-vector-index')

        print("🧪 Verifying DynamoDB Vector Index...")

        # Check opportunity index entry
        response = table.get_item(
            Key={
                'entity_type': 'opportunity',
                'entity_id': 'test-opp-001'
            }
        )

        if 'Item' in response:
            item = response['Item']
            print("✅ Opportunity index entry found in DynamoDB!")
            print(f"   - Entity Type: {item.get('entity_type')}")
            print(f"   - Entity ID: {item.get('entity_id')}")
            print(f"   - S3 URI: {item.get('s3_uri')}")
            print(f"   - Token Count: {item.get('total_tokens')}")
        else:
            print("❌ No opportunity index entry found in DynamoDB")
            return False

        # Check company index entry
        response = table.get_item(
            Key={
                'entity_type': 'company',
                'entity_id': 'test-company-001'
            }
        )

        if 'Item' in response:
            item = response['Item']
            print("✅ Company index entry found in DynamoDB!")
            print(f"   - Entity Type: {item.get('entity_type')}")
            print(f"   - Entity ID: {item.get('entity_id')}")
            print(f"   - S3 URI: {item.get('s3_uri')}")
            print(f"   - Token Count: {item.get('total_tokens')}")
        else:
            print("❌ No company index entry found in DynamoDB")
            return False

        return True

    except Exception as e:
        print(f"❌ DynamoDB verification failed: {str(e)}")
        return False

def main():
    """Main test function"""
    print("🧪 Testing Simple Embedding Function")
    print("=" * 50)

    success_count = 0
    total_tests = 3

    # Test embedding generation
    if test_embedding_generation():
        success_count += 1

    print()

    # Verify S3 storage
    if verify_s3_storage():
        success_count += 1

    print()

    # Verify DynamoDB index
    if verify_dynamodb_index():
        success_count += 1

    print()
    print("=" * 50)
    print(f"Tests passed: {success_count}/{total_tests}")

    if success_count == total_tests:
        print("🎉 All embedding function tests passed!")
    else:
        print(f"⚠️  {total_tests - success_count} tests failed")

    return success_count == total_tests

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)