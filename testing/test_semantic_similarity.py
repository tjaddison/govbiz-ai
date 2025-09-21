#!/usr/bin/env python3
"""
Test the semantic similarity function with real production data
"""
import json
import boto3

def test_semantic_similarity():
    """Test the semantic similarity Lambda function"""

    # Real company data (MedPACS, LLC)
    company_profile = {
        "company_id": "e4d8f458-b031-70ed-aee1-f318f0290017",
        "tenant_id": "test-tenant",
        "company_name": "MedPACS, LLC",
        "capability_statement": "Medical procurement and consulting services for government healthcare systems and medical facilities",
        "naics_codes": ["541511", "541512", "541513", "541519", "541618"],
        "certifications": ["SDVOSB", "SBA Small Business", "Minority-Owned", "Veteran-Owned", "Disabled Veteran-Owned", "Service-Disabled Veteran-Owned"]
    }

    # Real opportunity data - let's try with an IT-related opportunity to match company's NAICS
    opportunity = {
        "notice_id": "test-opportunity-001",
        "posted_date": "2025-09-20",
        "title": "IT Services and Medical Systems Support",
        "description": "Comprehensive IT support services including network administration, cybersecurity, and medical system maintenance for government healthcare facilities. The contractor will provide technical support for medical procurement systems and healthcare IT infrastructure.",
        "naics_code": "541511",
        "set_aside": "Total Small Business Set-Aside",
        "office": "Department of Veterans Affairs",
        "sol_number": "TEST-SOL-001"
    }

    # Prepare payload
    payload = {
        "opportunity": opportunity,
        "company_profile": company_profile
    }

    # Invoke Lambda function
    lambda_client = boto3.client('lambda')

    print("Testing semantic similarity with real data...")
    print(f"Company: {company_profile['company_name']}")
    print(f"Company Capability: {company_profile['capability_statement']}")
    print(f"Opportunity: {opportunity['title']}")
    print(f"Opportunity Description: {opportunity['description'][:100]}...")
    print("-" * 60)

    try:
        response = lambda_client.invoke(
            FunctionName='govbizai-semantic-similarity',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        result = json.loads(response['Payload'].read())
        print("Semantic Similarity Response:")
        print(json.dumps(result, indent=2))

        if result.get('statusCode') == 200:
            body = json.loads(result.get('body', '{}'))
            similarity_score = body.get('similarity_score', {})

            print("\n" + "=" * 60)
            print("SEMANTIC SIMILARITY ANALYSIS")
            print("=" * 60)
            print(f"Full Document Similarity: {similarity_score.get('full_document_similarity', 0.0):.4f}")
            print(f"Best Chunk Similarity: {similarity_score.get('best_chunk_similarity', {}).get('max_similarity', 0.0):.4f}")
            print(f"Weighted Average: {similarity_score.get('weighted_average_similarity', 0.0):.4f}")
            print(f"Processing Time: {similarity_score.get('processing_time_ms', 0.0):.2f}ms")
            print(f"Status: {similarity_score.get('status', 'unknown')}")

            # Section similarities
            section_sims = similarity_score.get('section_similarities', {})
            if section_sims:
                print("\nSection Similarities:")
                for section, matches in section_sims.items():
                    if isinstance(matches, dict):
                        for doc_type, score in matches.items():
                            print(f"  {section} -> {doc_type}: {score:.4f}")

            # Confidence indicators
            confidence = similarity_score.get('confidence_indicators', {})
            if confidence:
                print("\nConfidence Indicators:")
                for indicator, value in confidence.items():
                    print(f"  {indicator}: {value:.4f}")

        return result

    except Exception as e:
        print(f"Error testing semantic similarity: {str(e)}")
        return None

if __name__ == "__main__":
    test_semantic_similarity()