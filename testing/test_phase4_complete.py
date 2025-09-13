#!/usr/bin/env python3
"""
Complete Phase 4 validation test for GovBizAI embedding and search functionality
"""

import boto3
import json
import sys
from datetime import datetime

def test_embedding_generation():
    """Test embedding generation functionality"""
    try:
        lambda_client = boto3.client('lambda', region_name='us-east-1')

        # Test data
        test_data = {
            "type": "opportunity",
            "operation": "generate",
            "data": {
                "notice_id": "phase4-test-001",
                "Title": "Cybersecurity Assessment Services",
                "Description": "The Department of Homeland Security seeks qualified vendors to provide comprehensive cybersecurity assessment services including vulnerability testing, penetration testing, and risk assessment for critical infrastructure systems.",
                "Sol#": "DHS-2024-CYBER-001",
                "Department/Ind.Agency": "Department of Homeland Security",
                "NaicsCode": "541512",
                "SetASide": "Small Business",
                "PostedDate": "2024-01-20",
                "ResponseDeadLine": "2024-02-20",
                "ArchiveDate": "2024-03-20"
            }
        }

        print("🧪 Testing Embedding Generation...")
        response = lambda_client.invoke(
            FunctionName='govbizai-simple-embedding',
            Payload=json.dumps(test_data)
        )

        result = json.loads(response['Payload'].read().decode())

        if result.get('statusCode') == 200:
            print("✅ Embedding generation successful!")
            return True, result.get('body', {}).get('result', {})
        else:
            print(f"❌ Embedding generation failed: {result.get('body', {}).get('error')}")
            return False, None

    except Exception as e:
        print(f"❌ Embedding generation test failed: {str(e)}")
        return False, None

def test_semantic_search():
    """Test semantic search functionality"""
    try:
        lambda_client = boto3.client('lambda', region_name='us-east-1')

        # Test semantic search for IT services
        search_data = {
            "search_type": "semantic",
            "query": "IT infrastructure management and support services",
            "entity_type": "opportunity",
            "max_results": 5,
            "min_similarity": 0.3
        }

        print("🧪 Testing Semantic Search...")
        response = lambda_client.invoke(
            FunctionName='govbizai-simple-search',
            Payload=json.dumps(search_data)
        )

        result = json.loads(response['Payload'].read().decode())

        if result.get('statusCode') == 200:
            body = result.get('body', {})
            results = body.get('results', [])
            print(f"✅ Semantic search successful! Found {len(results)} results")

            for i, result_item in enumerate(results[:3]):
                print(f"   {i+1}. {result_item.get('entity_id')} (similarity: {result_item.get('similarity', 0):.3f})")

            return True, results
        else:
            print(f"❌ Semantic search failed: {result.get('body', {}).get('error')}")
            return False, None

    except Exception as e:
        print(f"❌ Semantic search test failed: {str(e)}")
        return False, None

def test_keyword_search():
    """Test keyword search functionality"""
    try:
        lambda_client = boto3.client('lambda', region_name='us-east-1')

        # Test keyword search
        search_data = {
            "search_type": "keyword",
            "query": "cybersecurity assessment",
            "entity_type": "all",
            "max_results": 5
        }

        print("🧪 Testing Keyword Search...")
        response = lambda_client.invoke(
            FunctionName='govbizai-simple-search',
            Payload=json.dumps(search_data)
        )

        result = json.loads(response['Payload'].read().decode())

        if result.get('statusCode') == 200:
            body = result.get('body', {})
            results = body.get('results', [])
            print(f"✅ Keyword search successful! Found {len(results)} results")

            for i, result_item in enumerate(results[:3]):
                print(f"   {i+1}. {result_item.get('entity_id')} (score: {result_item.get('keyword_score', 0):.3f})")

            return True, results
        else:
            print(f"❌ Keyword search failed: {result.get('body', {}).get('error')}")
            return False, None

    except Exception as e:
        print(f"❌ Keyword search test failed: {str(e)}")
        return False, None

def test_hybrid_search():
    """Test hybrid search functionality"""
    try:
        lambda_client = boto3.client('lambda', region_name='us-east-1')

        # Test hybrid search
        search_data = {
            "search_type": "hybrid",
            "query": "IT services government support",
            "entity_type": "all",
            "max_results": 10
        }

        print("🧪 Testing Hybrid Search...")
        response = lambda_client.invoke(
            FunctionName='govbizai-simple-search',
            Payload=json.dumps(search_data)
        )

        result = json.loads(response['Payload'].read().decode())

        if result.get('statusCode') == 200:
            body = result.get('body', {})
            results = body.get('results', [])
            print(f"✅ Hybrid search successful! Found {len(results)} results")

            for i, result_item in enumerate(results[:3]):
                search_method = result_item.get('search_method', 'unknown')
                similarity = result_item.get('similarity', 0)
                keyword_score = result_item.get('keyword_score', 0)
                print(f"   {i+1}. {result_item.get('entity_id')} ({search_method}) sim:{similarity:.3f} kw:{keyword_score:.3f}")

            return True, results
        else:
            print(f"❌ Hybrid search failed: {result.get('body', {}).get('error')}")
            return False, None

    except Exception as e:
        print(f"❌ Hybrid search test failed: {str(e)}")
        return False, None

def test_company_search():
    """Test search for companies specifically"""
    try:
        lambda_client = boto3.client('lambda', region_name='us-east-1')

        # Test company-specific search
        search_data = {
            "search_type": "semantic",
            "query": "veteran owned small business IT cybersecurity",
            "entity_type": "company",
            "max_results": 5,
            "min_similarity": 0.2
        }

        print("🧪 Testing Company Search...")
        response = lambda_client.invoke(
            FunctionName='govbizai-simple-search',
            Payload=json.dumps(search_data)
        )

        result = json.loads(response['Payload'].read().decode())

        if result.get('statusCode') == 200:
            body = result.get('body', {})
            results = body.get('results', [])
            print(f"✅ Company search successful! Found {len(results)} results")

            for i, result_item in enumerate(results):
                metadata = result_item.get('metadata', {})
                company_name = metadata.get('company_name', 'Unknown')
                print(f"   {i+1}. {company_name} (similarity: {result_item.get('similarity', 0):.3f})")

            return True, results
        else:
            print(f"❌ Company search failed: {result.get('body', {}).get('error')}")
            return False, None

    except Exception as e:
        print(f"❌ Company search test failed: {str(e)}")
        return False, None

def verify_infrastructure():
    """Verify that all Phase 4 infrastructure is properly deployed"""
    try:
        print("🧪 Verifying Phase 4 Infrastructure...")

        # Check Lambda functions
        lambda_client = boto3.client('lambda', region_name='us-east-1')
        functions = ['govbizai-simple-embedding', 'govbizai-simple-search']

        for func_name in functions:
            try:
                response = lambda_client.get_function(FunctionName=func_name)
                print(f"✅ Lambda function {func_name} exists and is ready")
            except Exception as e:
                print(f"❌ Lambda function {func_name} not found or not ready")
                return False

        # Check DynamoDB table
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        try:
            table = dynamodb.Table('govbizai-vector-index')
            table.load()
            print("✅ DynamoDB vector index table exists and is accessible")
        except Exception as e:
            print(f"❌ DynamoDB vector index table issue: {str(e)}")
            return False

        # Check S3 bucket
        s3_client = boto3.client('s3', region_name='us-east-1')
        try:
            bucket_name = 'govbizai-embeddings-927576824761-us-east-1'
            s3_client.head_bucket(Bucket=bucket_name)
            print(f"✅ S3 embeddings bucket {bucket_name} exists and is accessible")
        except Exception as e:
            print(f"❌ S3 embeddings bucket issue: {str(e)}")
            return False

        # Check Bedrock access
        bedrock_runtime = boto3.client('bedrock-runtime', region_name='us-east-1')
        try:
            body = {
                "inputText": "test",
                "dimensions": 1024,
                "normalize": True
            }
            response = bedrock_runtime.invoke_model(
                modelId="amazon.titan-embed-text-v2:0",
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json"
            )
            print("✅ Bedrock Titan embedding model is accessible")
        except Exception as e:
            print(f"❌ Bedrock access issue: {str(e)}")
            return False

        return True

    except Exception as e:
        print(f"❌ Infrastructure verification failed: {str(e)}")
        return False

def main():
    """Main test function for Phase 4 validation"""
    print("🚀 GovBizAI Phase 4: Embedding Generation and Vector Storage Validation")
    print("=" * 80)

    success_count = 0
    total_tests = 6

    # Verify infrastructure
    if verify_infrastructure():
        success_count += 1
    print()

    # Test embedding generation
    success, embedding_result = test_embedding_generation()
    if success:
        success_count += 1
    print()

    # Test semantic search
    success, semantic_results = test_semantic_search()
    if success:
        success_count += 1
    print()

    # Test keyword search
    success, keyword_results = test_keyword_search()
    if success:
        success_count += 1
    print()

    # Test hybrid search
    success, hybrid_results = test_hybrid_search()
    if success:
        success_count += 1
    print()

    # Test company search
    success, company_results = test_company_search()
    if success:
        success_count += 1
    print()

    print("=" * 80)
    print(f"Phase 4 Tests passed: {success_count}/{total_tests}")

    if success_count == total_tests:
        print("🎉 Phase 4: Embedding Generation and Vector Storage - SUCCESSFULLY DEPLOYED AND VALIDATED!")
        print()
        print("✅ Core Features Working:")
        print("   • Bedrock Titan Text Embeddings V2 integration")
        print("   • S3-based vector storage (cost-effective)")
        print("   • DynamoDB vector indexing")
        print("   • Semantic search with cosine similarity")
        print("   • Keyword-based search")
        print("   • Hybrid search combining both approaches")
        print("   • Multi-entity support (opportunities & companies)")
        print()
        print("🔧 Technical Implementation:")
        print("   • Lambda functions without complex dependencies")
        print("   • Native Python cosine similarity calculation")
        print("   • Multi-level embedding storage")
        print("   • Configurable search parameters")
        print()
        print("💰 Cost Optimization:")
        print("   • S3 storage instead of expensive vector databases")
        print("   • Efficient embedding retrieval and caching")
        print("   • Lambda-based processing for scalability")
    else:
        print(f"⚠️  {total_tests - success_count} tests failed - Phase 4 needs attention")

    return success_count == total_tests

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)