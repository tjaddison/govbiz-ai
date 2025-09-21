#!/usr/bin/env python3
"""
Test the matches API endpoint
"""
import json
import boto3

def test_matches_api():
    """Test the matches API Lambda function"""

    # Test payload for getting matches for a company
    test_event = {
        "httpMethod": "GET",
        "pathParameters": {
            "company_id": "e4d8f458-b031-70ed-aee1-f318f0290017"
        },
        "queryStringParameters": {
            "limit": "10"
        },
        "headers": {
            "Authorization": "Bearer test-token",
            "Content-Type": "application/json"
        },
        "requestContext": {
            "httpMethod": "GET",
            "resourcePath": "/matches/{company_id}"
        }
    }

    lambda_client = boto3.client('lambda')

    print("Testing matches API endpoint...")
    print(f"HTTP Method: {test_event['httpMethod']}")
    print(f"Company ID: {test_event['pathParameters']['company_id']}")
    print("-" * 60)

    try:
        response = lambda_client.invoke(
            FunctionName='govbizai-api-matches',
            InvocationType='RequestResponse',
            Payload=json.dumps(test_event)
        )

        result = json.loads(response['Payload'].read())
        print("Matches API Response:")
        print(json.dumps(result, indent=2))

        if result.get('statusCode') == 200:
            body = json.loads(result.get('body', '{}'))
            matches = body.get('matches', [])

            print("\n" + "=" * 60)
            print("MATCHES API ANALYSIS")
            print("=" * 60)
            print(f"Status Code: {result.get('statusCode')}")
            print(f"Number of Matches: {len(matches)}")

            for i, match in enumerate(matches):
                print(f"\nMatch {i + 1}:")
                print(f"  Opportunity ID: {match.get('opportunity_id', 'unknown')}")
                print(f"  Total Score: {match.get('total_score', 0.0):.4f}")
                print(f"  Confidence Level: {match.get('confidence_level', 'unknown')}")
                print(f"  Created: {match.get('created_at', 'unknown')}")

        return result

    except Exception as e:
        print(f"Error testing matches API: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    test_matches_api()