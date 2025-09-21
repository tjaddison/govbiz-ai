#!/usr/bin/env python3
"""
Comprehensive end-to-end test of the matching system
"""
import json
import boto3
import time
from decimal import Decimal

def test_end_to_end_workflow():
    """Test complete end-to-end matching workflow"""

    print("COMPREHENSIVE END-TO-END MATCHING SYSTEM TEST")
    print("=" * 60)

    # Step 1: Verify data exists
    print("\n1. VERIFYING PRODUCTION DATA")
    print("-" * 40)

    dynamodb = boto3.resource('dynamodb')

    # Check opportunities
    opportunities_table = dynamodb.Table('govbizai-opportunities')
    opp_count = opportunities_table.item_count
    print(f"✓ Opportunities in system: {opp_count:,}")

    # Check companies
    companies_table = dynamodb.Table('govbizai-companies')
    company_count = companies_table.item_count
    print(f"✓ Companies in system: {company_count}")

    # Get a real company
    company_response = companies_table.get_item(
        Key={'company_id': 'e4d8f458-b031-70ed-aee1-f318f0290017'}
    )

    if 'Item' not in company_response:
        print("✗ Test company not found")
        return False

    real_company = company_response['Item']
    print(f"✓ Test company: {real_company.get('company_name', 'Unknown')}")

    # Get a real opportunity
    opp_scan = opportunities_table.scan(Limit=1)
    if not opp_scan['Items']:
        print("✗ No opportunities found")
        return False

    real_opportunity = opp_scan['Items'][0]
    print(f"✓ Test opportunity: {real_opportunity.get('title', 'Unknown')}")

    # Step 2: Test complete matching pipeline
    print("\n2. TESTING COMPLETE MATCHING PIPELINE")
    print("-" * 40)

    # Convert DynamoDB format to Lambda format
    def convert_dynamodb_to_dict(item):
        """Convert DynamoDB item format to regular dict"""
        result = {}
        for key, value in item.items():
            if isinstance(value, dict):
                if 'S' in value:
                    result[key] = value['S']
                elif 'N' in value:
                    result[key] = value['N']
                elif 'L' in value:
                    result[key] = [convert_dynamodb_to_dict({'item': v})['item'] for v in value['L']]
                elif 'M' in value:
                    result[key] = convert_dynamodb_to_dict(value['M'])
                elif 'BOOL' in value:
                    result[key] = value['BOOL']
                elif 'NULL' in value:
                    result[key] = None
            else:
                result[key] = value
        return result

    # Convert to proper format
    company_data = convert_dynamodb_to_dict(real_company)
    opportunity_data = convert_dynamodb_to_dict(real_opportunity)

    # Prepare payload for matching
    match_payload = {
        "opportunity": {
            "notice_id": opportunity_data.get('notice_id', 'unknown'),
            "title": opportunity_data.get('title', ''),
            "description": opportunity_data.get('description', ''),
            "naics_code": opportunity_data.get('naics_code', ''),
            "set_aside": opportunity_data.get('set_aside', ''),
            "office": opportunity_data.get('office', ''),
            "department": opportunity_data.get('department', ''),
            "response_deadline": opportunity_data.get('response_deadline', ''),
            "posted_date": opportunity_data.get('posted_date', '')
        },
        "company_profile": {
            "company_id": company_data.get('company_id', ''),
            "company_name": company_data.get('company_name', ''),
            "capability_statement": company_data.get('capability_statement', ''),
            "naics_codes": company_data.get('naics_codes', []),
            "certifications": company_data.get('certifications', []),
            "locations": company_data.get('locations', []),
            "employee_count": company_data.get('employee_count', ''),
            "revenue_range": company_data.get('revenue_range', ''),
            "active_status": True,
            "status": "active"
        },
        "use_cache": False
    }

    lambda_client = boto3.client('lambda')

    # Test each stage of the pipeline
    stages = [
        ("Quick Filter", "govbizai-quick-filter"),
        ("Semantic Similarity", "govbizai-semantic-similarity"),
        ("Keyword Matching", "govbizai-keyword-matching"),
        ("NAICS Alignment", "govbizai-naics-alignment"),
        ("Match Orchestrator", "govbizai-match-orchestrator")
    ]

    results = {}
    total_pipeline_time = 0

    for stage_name, function_name in stages:
        print(f"\nTesting {stage_name}...")
        start_time = time.time()

        try:
            response = lambda_client.invoke(
                FunctionName=function_name,
                InvocationType='RequestResponse',
                Payload=json.dumps(match_payload)
            )

            result = json.loads(response['Payload'].read())
            end_time = time.time()
            processing_time = (end_time - start_time) * 1000

            if result.get('statusCode') == 200:
                print(f"  ✓ {stage_name}: Success ({processing_time:.2f}ms)")
                results[stage_name] = {
                    'success': True,
                    'time': processing_time,
                    'result': result
                }
                total_pipeline_time += processing_time
            else:
                print(f"  ✗ {stage_name}: Failed - {result.get('statusCode')}")
                results[stage_name] = {
                    'success': False,
                    'time': processing_time,
                    'error': result.get('body', 'Unknown error')
                }

        except Exception as e:
            print(f"  ✗ {stage_name}: Error - {str(e)}")
            results[stage_name] = {
                'success': False,
                'error': str(e)
            }

    # Step 3: Store match result
    print("\n3. STORING MATCH RESULT")
    print("-" * 40)

    if 'Match Orchestrator' in results and results['Match Orchestrator']['success']:
        orchestrator_result = results['Match Orchestrator']['result']
        body = json.loads(orchestrator_result.get('body', '{}'))
        match_result = body.get('match_result', {})

        # Store in matches table
        matches_table = dynamodb.Table('govbizai-matches')

        match_record = {
            "company_id": match_result.get('company_id', ''),
            "opportunity_id": match_result.get('opportunity_id', ''),
            "total_score": Decimal(str(match_result.get('total_score', 0.0))),
            "confidence_level": match_result.get('confidence_level', 'LOW'),
            "component_scores": {k: Decimal(str(v)) if isinstance(v, (int, float)) else v
                               for k, v in match_result.get('component_scores', {}).items()},
            "match_reasons": match_result.get('match_reasons', []),
            "recommendations": match_result.get('recommendations', []),
            "action_items": match_result.get('action_items', []),
            "processing_time_ms": Decimal(str(match_result.get('processing_time_ms', 0.0))),
            "cached": match_result.get('cached', False),
            "created_at": int(time.time()),
            "updated_at": int(time.time()),
            "ttl": int(time.time()) + (90 * 24 * 60 * 60)  # 90 days
        }

        try:
            matches_table.put_item(Item=match_record)
            print(f"✓ Match result stored successfully")
            print(f"  Total Score: {float(match_record['total_score']):.4f}")
            print(f"  Confidence: {match_record['confidence_level']}")
        except Exception as e:
            print(f"✗ Failed to store match result: {str(e)}")

    # Step 4: Final summary
    print("\n" + "=" * 60)
    print("END-TO-END TEST RESULTS")
    print("=" * 60)

    successful_stages = sum(1 for r in results.values() if r.get('success', False))
    total_stages = len(results)

    print(f"Pipeline Success Rate: {successful_stages}/{total_stages} ({successful_stages/total_stages*100:.1f}%)")
    print(f"Total Pipeline Time: {total_pipeline_time:.2f}ms")

    for stage_name, result in results.items():
        if result.get('success'):
            print(f"✓ {stage_name}: {result.get('time', 0):.2f}ms")
        else:
            print(f"✗ {stage_name}: Failed")

    # Overall system status
    system_healthy = successful_stages >= 4  # At least 4 out of 5 stages should work
    print(f"\nSYSTEM STATUS: {'✓ PRODUCTION READY' if system_healthy else '✗ NEEDS ATTENTION'}")

    return {
        'success_rate': successful_stages / total_stages,
        'total_time': total_pipeline_time,
        'system_healthy': system_healthy,
        'results': results
    }

if __name__ == "__main__":
    test_end_to_end_workflow()