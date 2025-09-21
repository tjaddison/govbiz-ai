#!/usr/bin/env python3
"""
Test the quick filter function with real production data
"""
import json
import boto3

def test_quick_filter():
    """Test the quick filter Lambda function"""

    # Real company data (MedPACS, LLC)
    company_profile = {
        "company_id": "e4d8f458-b031-70ed-aee1-f318f0290017",
        "company_name": "MedPACS, LLC",
        "naics_codes": ["541511", "541512", "541513", "541519", "541618"],
        "certifications": ["SDVOSB", "SBA Small Business", "Minority-Owned", "Veteran-Owned", "Disabled Veteran-Owned", "Service-Disabled Veteran-Owned"],
        "capability_statement": "Medical procurement and consulting services",
        "active_status": True,
        "status": "active",
        "locations": [{"city": "Salisbury", "state": "MD", "zip_code": "21804"}],
        "employee_count": "1-10",
        "revenue_range": "Under $1M"
    }

    # Real opportunity data
    opportunity = {
        "notice_id": "9fbe7f8d1de14ed7a3d5b7f4be40cef4",
        "title": "30--CYLINDER ASSEMBLY,A",
        "description": "Proposed procurement for NSN 3040012649338 CYLINDER ASSEMBLY,A: Line 0001 Qty 4 UI EA Deliver To: W1A8 DLA DISTRIBUTION By: 0136 DAYS ADO Approved sources are 12190 PD41047-500; 78069 P-84444. The solicitation is an RFQ and will be available at the link provided in this notice. Hard copies of this solicitation are not available. Specifications, plans, or drawings are not available. All responsible sources may submit a quote which, if timely received, shall be considered. Quotes must be submitted electronically.",
        "naics_code": "333613",
        "set_aside": "Total Small Business Set-Aside (FAR 19.5)",
        "office": "DLA LAND AND MARITIME",
        "department": "DEPT OF DEFENSE",
        "response_deadline": "2025-09-19",
        "posted_date": "2025-09-08 16:42:36.686-04"
    }

    # Prepare payload
    payload = {
        "opportunity": opportunity,
        "company_profile": company_profile
    }

    # Invoke Lambda function
    lambda_client = boto3.client('lambda')

    print("Testing quick filter with real data...")
    print(f"Company: {company_profile['company_name']}")
    print(f"Opportunity: {opportunity['title']}")
    print(f"Company NAICS: {company_profile['naics_codes']}")
    print(f"Opportunity NAICS: {opportunity['naics_code']}")
    print(f"Set-aside: {opportunity['set_aside']}")
    print(f"Company Certifications: {company_profile['certifications']}")
    print("-" * 60)

    try:
        response = lambda_client.invoke(
            FunctionName='govbizai-quick-filter',
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        result = json.loads(response['Payload'].read())
        print("Quick Filter Response:")
        print(json.dumps(result, indent=2))

        if result.get('statusCode') == 200:
            body = json.loads(result.get('body', '{}'))
            filter_result = body.get('filter_details', {})

            print("\n" + "=" * 60)
            print("QUICK FILTER ANALYSIS")
            print("=" * 60)
            print(f"Is Potential Match: {filter_result.get('is_potential_match', False)}")
            print(f"Filter Score: {filter_result.get('filter_score', 0.0):.3f}")
            print(f"Processing Time: {filter_result.get('processing_time_ms', 0.0):.2f}ms")

            print("\nPass Reasons:")
            for reason in filter_result.get('pass_reasons', []):
                print(f"  ✓ {reason}")

            print("\nFail Reasons:")
            for reason in filter_result.get('fail_reasons', []):
                print(f"  ✗ {reason}")

            print("\nChecks Performed:")
            checks = filter_result.get('checks_performed', {})
            for check_name, check_result in checks.items():
                if isinstance(check_result, dict):
                    passed = check_result.get('passed', False)
                    score = check_result.get('score', 0.0)
                    details = check_result.get('details', '')
                    status = "✓" if passed else "✗"
                    print(f"  {status} {check_name}: {score:.3f} - {details}")

        return result

    except Exception as e:
        print(f"Error testing quick filter: {str(e)}")
        return None

if __name__ == "__main__":
    test_quick_filter()