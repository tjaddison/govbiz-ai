#!/usr/bin/env python3
"""
Test storing match results in DynamoDB
"""
import json
import boto3
import time
from decimal import Decimal

def test_match_storage():
    """Test storing match results in the matches table"""

    dynamodb = boto3.resource('dynamodb')
    matches_table = dynamodb.Table('govbizai-matches')

    # Sample match result
    match_result = {
        "company_id": "e4d8f458-b031-70ed-aee1-f318f0290017",
        "opportunity_id": "test-match-001",
        "total_score": Decimal("0.3393"),
        "confidence_level": "LOW",
        "component_scores": {
            "semantic_similarity": Decimal("0.7411"),
            "keyword_matching": Decimal("0.4951"),
            "naics_alignment": Decimal("1.0"),
            "past_performance": Decimal("0.0"),
            "certification_bonus": Decimal("0.0"),
            "geographic_match": Decimal("1.0"),
            "capacity_fit": Decimal("0.8"),
            "recency_factor": Decimal("0.5")
        },
        "match_reasons": [
            "Moderate alignment with 33.9% compatibility score",
            "Strong naics alignment",
            "Exact NAICS code match indicates perfect industry alignment"
        ],
        "recommendations": [
            "Moderate fit - consider partnership or subcontracting opportunities",
            "Develop capability statement emphasizing relevant experience"
        ],
        "action_items": [
            "Review full solicitation document for detailed requirements",
            "Assess competitive landscape and pricing strategy"
        ],
        "processing_time_ms": Decimal("1274.54"),
        "cached": False,
        "tenant_id": "test-tenant",
        "created_at": int(time.time()),
        "updated_at": int(time.time()),
        "ttl": int(time.time()) + (90 * 24 * 60 * 60)  # 90 days TTL
    }

    print("Testing match result storage...")
    print(f"Company ID: {match_result['company_id']}")
    print(f"Opportunity ID: {match_result['opportunity_id']}")
    print(f"Total Score: {float(match_result['total_score']):.4f}")
    print(f"Confidence Level: {match_result['confidence_level']}")
    print("-" * 60)

    try:
        # Store the match result
        response = matches_table.put_item(Item=match_result)
        print("✓ Match result stored successfully")

        # Retrieve the stored result
        get_response = matches_table.get_item(
            Key={
                'company_id': match_result['company_id'],
                'opportunity_id': match_result['opportunity_id']
            }
        )

        if 'Item' in get_response:
            stored_item = get_response['Item']
            print("✓ Match result retrieved successfully")
            print(f"  Stored Total Score: {float(stored_item['total_score']):.4f}")
            print(f"  Stored Confidence: {stored_item['confidence_level']}")
            print(f"  Component Scores Count: {len(stored_item['component_scores'])}")
            print(f"  Match Reasons Count: {len(stored_item['match_reasons'])}")
            print(f"  Recommendations Count: {len(stored_item['recommendations'])}")

            # Test querying by company
            company_matches = matches_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('company_id').eq(match_result['company_id'])
            )
            print(f"✓ Company matches query returned {company_matches['Count']} results")

            # Test querying by confidence level GSI
            confidence_index = matches_table.query(
                IndexName='confidence-level-index',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('confidence_level').eq('LOW')
            )
            print(f"✓ Confidence level query returned {confidence_index['Count']} results")

        else:
            print("✗ Failed to retrieve stored match result")

        return True

    except Exception as e:
        print(f"✗ Error testing match storage: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_match_storage()