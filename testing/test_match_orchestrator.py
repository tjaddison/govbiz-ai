#!/usr/bin/env python3
"""
Test the match orchestrator with real production data
"""
import json
import boto3

def test_match_orchestrator():
    """Test the match orchestrator Lambda function"""

    # Real company data (MedPACS, LLC)
    company_profile = {
        "company_id": "e4d8f458-b031-70ed-aee1-f318f0290017",
        "tenant_id": "test-tenant",
        "company_name": "MedPACS, LLC",
        "capability_statement": "Medical procurement and consulting services for government healthcare systems and medical facilities",
        "naics_codes": ["541511", "541512", "541513", "541519", "541618"],
        "certifications": ["SDVOSB", "SBA Small Business", "Minority-Owned", "Veteran-Owned", "Disabled Veteran-Owned", "Service-Disabled Veteran-Owned"],
        "locations": [{"city": "Salisbury", "state": "MD", "zip_code": "21804"}],
        "employee_count": "1-10",
        "revenue_range": "Under $1M",
        "active_status": True,
        "status": "active"
    }

    # IT/Medical related opportunity that should match well
    opportunity = {
        "notice_id": "test-match-001",
        "posted_date": "2025-09-20",
        "title": "Medical IT Support Services",
        "description": "Comprehensive IT support services for medical facilities including network administration, cybersecurity, and medical procurement system support. Seeking qualified small business contractors with experience in government healthcare systems.",
        "naics_code": "541511",
        "set_aside": "Total Small Business Set-Aside",
        "office": "Department of Veterans Affairs",
        "department": "DEPT OF VETERANS AFFAIRS",
        "response_deadline": "2025-10-20",
        "pop_state": "MD",
        "pop_city": "Baltimore",
        "sol_number": "TEST-SOL-001"
    }

    # Prepare payload
    payload = {
        "opportunity": opportunity,
        "company_profile": company_profile,
        "use_cache": False  # Don't use cache for testing
    }

    # Invoke Lambda function
    lambda_client = boto3.client('lambda')

    print("Testing match orchestrator with real data...")
    print(f"Company: {company_profile['company_name']}")
    print(f"Company NAICS: {company_profile['naics_codes']}")
    print(f"Company Certs: {company_profile['certifications']}")
    print(f"Opportunity: {opportunity['title']}")
    print(f"Opportunity NAICS: {opportunity['naics_code']}")
    print(f"Set-aside: {opportunity['set_aside']}")
    print("-" * 60)

    try:
        response = lambda_client.invoke(
            FunctionName='govbizai-match-orchestrator',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        result = json.loads(response['Payload'].read())
        print("Match Orchestrator Response:")
        print(json.dumps(result, indent=2))

        if result.get('statusCode') == 200:
            body = json.loads(result.get('body', '{}'))
            match_result = body.get('match_result', {})

            print("\n" + "=" * 60)
            print("COMPLETE MATCH ANALYSIS")
            print("=" * 60)
            print(f"Total Score: {match_result.get('total_score', 0.0):.4f}")
            print(f"Confidence Level: {match_result.get('confidence_level', 'UNKNOWN')}")
            print(f"Processing Time: {match_result.get('processing_time_ms', 0.0):.2f}ms")
            print(f"Cached: {match_result.get('cached', False)}")

            # Component scores
            component_scores = match_result.get('component_scores', {})
            if component_scores:
                print("\nComponent Scores:")
                for component, score_data in component_scores.items():
                    if isinstance(score_data, dict):
                        score = score_data.get('overall_score', score_data.get('score', 0.0))
                        print(f"  {component.replace('_', ' ').title()}: {score:.4f}")
                    else:
                        print(f"  {component.replace('_', ' ').title()}: {score_data:.4f}")

            # Match reasons
            match_reasons = match_result.get('match_reasons', [])
            if match_reasons:
                print("\nMatch Reasons:")
                for reason in match_reasons:
                    print(f"  • {reason}")

            # Recommendations
            recommendations = match_result.get('recommendations', [])
            if recommendations:
                print("\nRecommendations:")
                for rec in recommendations:
                    print(f"  → {rec}")

            # Action items
            action_items = match_result.get('action_items', [])
            if action_items:
                print("\nAction Items:")
                for item in action_items:
                    print(f"  ☐ {item}")

        return result

    except Exception as e:
        print(f"Error testing match orchestrator: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    test_match_orchestrator()