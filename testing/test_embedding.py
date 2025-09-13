#!/usr/bin/env python3
"""
Test script to validate Phase 4: Embedding Generation and Vector Storage

This script tests the embedding generation Lambda function with sample data.
"""

import boto3
import json
import sys

def test_embedding_generation():
    """Test embedding generation with sample data"""
    lambda_client = boto3.client('lambda', region_name='us-east-1')

    # Sample opportunity data
    sample_opportunity = {
        "type": "opportunity",
        "data": {
            "notice_id": "test-opp-001",
            "Title": "Cloud Computing Infrastructure Services",
            "Description": "The Department of Defense is seeking a contractor to provide cloud computing infrastructure services including compute, storage, and networking capabilities. The solution must be FedRAMP authorized and support hybrid cloud deployments.",
            "Sol#": "TEST-SOL-2024-001",
            "Department/Ind.Agency": "Department of Defense",
            "NaicsCode": "541511",
            "SetASideCode": "SBA",
            "SetASide": "Small Business Set Aside",
            "PostedDate": "2024-01-15",
            "ResponseDeadLine": "2024-02-15",
            "ArchiveDate": "2024-02-20"
        }
    }

    # Sample company data
    sample_company = {
        "type": "company",
        "data": {
            "company_id": "test-comp-001",
            "company_name": "TechFlow Solutions",
            "tenant_id": "tenant-001",
            "capability_statement": "TechFlow Solutions specializes in cloud infrastructure, cybersecurity, and software development for government agencies. We are an 8(a) certified small business with expertise in AWS, Microsoft Azure, and hybrid cloud solutions.",
            "industry_naics": ["541511", "541512", "541519"],
            "certifications": ["8(a)", "WOSB", "HUBZone"],
            "past_performance": "Successfully delivered cloud migration services for multiple federal agencies including DOD, DHS, and VA."
        }
    }

    try:
        print("Testing opportunity embedding generation...")
        response = lambda_client.invoke(
            FunctionName='govbizai-embedding-generation',
            InvocationType='RequestResponse',
            Payload=json.dumps(sample_opportunity)
        )

        result = json.loads(response['Payload'].read())
        print(f"Opportunity embedding result: {json.dumps(result, indent=2)}")

        if result.get('statusCode') == 200:
            print("✅ Opportunity embedding generation successful!")
        else:
            print(f"❌ Opportunity embedding generation failed: {result}")

    except Exception as e:
        print(f"❌ Error testing opportunity embedding: {str(e)}")

    try:
        print("\nTesting company embedding generation...")
        response = lambda_client.invoke(
            FunctionName='govbizai-embedding-generation',
            InvocationType='RequestResponse',
            Payload=json.dumps(sample_company)
        )

        result = json.loads(response['Payload'].read())
        print(f"Company embedding result: {json.dumps(result, indent=2)}")

        if result.get('statusCode') == 200:
            print("✅ Company embedding generation successful!")
        else:
            print(f"❌ Company embedding generation failed: {result}")

    except Exception as e:
        print(f"❌ Error testing company embedding: {str(e)}")

def test_semantic_search():
    """Test semantic search functionality"""
    lambda_client = boto3.client('lambda', region_name='us-east-1')

    # Test opportunity search
    opportunity_search = {
        "operation": "search_opportunities",
        "query": "cloud computing infrastructure services",
        "max_results": 5,
        "filters": {
            "naics_code": "541511"
        }
    }

    # Test company search
    company_search = {
        "operation": "search_companies",
        "query": "8(a) certified cybersecurity",
        "max_results": 5,
        "filters": {}
    }

    try:
        print("\nTesting semantic search for opportunities...")
        response = lambda_client.invoke(
            FunctionName='govbizai-semantic-search',
            InvocationType='RequestResponse',
            Payload=json.dumps(opportunity_search)
        )

        result = json.loads(response['Payload'].read())
        print(f"Opportunity search result: {json.dumps(result, indent=2)}")

        if result.get('statusCode') == 200:
            print("✅ Opportunity semantic search successful!")
        else:
            print(f"❌ Opportunity semantic search failed: {result}")

    except Exception as e:
        print(f"❌ Error testing opportunity search: {str(e)}")

    try:
        print("\nTesting semantic search for companies...")
        response = lambda_client.invoke(
            FunctionName='govbizai-semantic-search',
            InvocationType='RequestResponse',
            Payload=json.dumps(company_search)
        )

        result = json.loads(response['Payload'].read())
        print(f"Company search result: {json.dumps(result, indent=2)}")

        if result.get('statusCode') == 200:
            print("✅ Company semantic search successful!")
        else:
            print(f"❌ Company semantic search failed: {result}")

    except Exception as e:
        print(f"❌ Error testing company search: {str(e)}")

def test_hybrid_search():
    """Test hybrid search functionality"""
    lambda_client = boto3.client('lambda', region_name='us-east-1')

    # Test hybrid opportunity search
    hybrid_search = {
        "operation": "hybrid_search_opportunities",
        "query": "cloud infrastructure security",
        "max_results": 10,
        "filters": {},
        "semantic_weight": 0.7,
        "keyword_weight": 0.3
    }

    try:
        print("\nTesting hybrid search for opportunities...")
        response = lambda_client.invoke(
            FunctionName='govbizai-hybrid-search',
            InvocationType='RequestResponse',
            Payload=json.dumps(hybrid_search)
        )

        result = json.loads(response['Payload'].read())
        print(f"Hybrid search result: {json.dumps(result, indent=2)}")

        if result.get('statusCode') == 200:
            print("✅ Hybrid search successful!")
        else:
            print(f"❌ Hybrid search failed: {result}")

    except Exception as e:
        print(f"❌ Error testing hybrid search: {str(e)}")

def main():
    """Main test function"""
    print("🚀 Starting Phase 4 Validation: Embedding Generation and Vector Storage")
    print("=" * 70)

    # Test embedding generation
    test_embedding_generation()

    # Test semantic search (after some embeddings exist)
    test_semantic_search()

    # Test hybrid search
    test_hybrid_search()

    print("\n" + "=" * 70)
    print("Phase 4 validation completed!")

if __name__ == "__main__":
    main()