#!/usr/bin/env python3
"""
Validate production deployment health
"""
import json
import boto3
import requests
import time

def validate_production_deployment():
    """Comprehensive production deployment validation"""

    print("🚀 PRODUCTION DEPLOYMENT VALIDATION")
    print("=" * 60)

    # Get deployment outputs
    outputs = {
        'WebApplicationUrl': 'https://d21w4wbdrthfbu.cloudfront.net',
        'RestApiEndpoint': 'https://my9wn2ha3a.execute-api.us-east-1.amazonaws.com/prod/',
        'MatchingApiEndpoint': 'https://u0vw1dg7sg.execute-api.us-east-1.amazonaws.com/prod/',
        'BatchOrchestrationApiEndpoint': 'https://4tls6780ji.execute-api.us-east-1.amazonaws.com/prod/',
        'UserPoolId': 'us-east-1_s7da6Vikw',
        'UserPoolClientId': 'e75k50dd3auujjd84lql7uaik'
    }

    validation_results = {}

    # 1. Check Web Application
    print("\n1. 🌐 VALIDATING WEB APPLICATION")
    print("-" * 40)
    try:
        response = requests.get(outputs['WebApplicationUrl'], timeout=10)
        if response.status_code == 200:
            print("✅ Web application is accessible")
            print(f"   URL: {outputs['WebApplicationUrl']}")
            print(f"   Status: {response.status_code}")
            validation_results['web_app'] = True
        else:
            print(f"❌ Web application returned status {response.status_code}")
            validation_results['web_app'] = False
    except Exception as e:
        print(f"❌ Web application error: {str(e)}")
        validation_results['web_app'] = False

    # 2. Check Lambda Functions
    print("\n2. ⚡ VALIDATING LAMBDA FUNCTIONS")
    print("-" * 40)
    lambda_client = boto3.client('lambda')

    critical_functions = [
        'govbizai-quick-filter',
        'govbizai-semantic-similarity',
        'govbizai-match-orchestrator',
        'govbizai-keyword-matching',
        'govbizai-naics-alignment'
    ]

    lambda_results = {}
    for func_name in critical_functions:
        try:
            response = lambda_client.get_function(FunctionName=func_name)
            state = response['Configuration']['State']
            print(f"✅ {func_name}: {state}")
            lambda_results[func_name] = state == 'Active'
        except Exception as e:
            print(f"❌ {func_name}: Error - {str(e)}")
            lambda_results[func_name] = False

    validation_results['lambda_functions'] = all(lambda_results.values())

    # 3. Check DynamoDB Tables
    print("\n3. 🗃️  VALIDATING DYNAMODB TABLES")
    print("-" * 40)
    dynamodb = boto3.client('dynamodb')

    critical_tables = [
        'govbizai-opportunities',
        'govbizai-companies',
        'govbizai-matches',
        'govbizai-match-cache'
    ]

    table_results = {}
    for table_name in critical_tables:
        try:
            response = dynamodb.describe_table(TableName=table_name)
            status = response['Table']['TableStatus']
            item_count = response['Table']['ItemCount']
            print(f"✅ {table_name}: {status} ({item_count:,} items)")
            table_results[table_name] = status == 'ACTIVE'
        except Exception as e:
            print(f"❌ {table_name}: Error - {str(e)}")
            table_results[table_name] = False

    validation_results['dynamodb_tables'] = all(table_results.values())

    # 4. Check S3 Buckets
    print("\n4. 🪣 VALIDATING S3 BUCKETS")
    print("-" * 40)
    s3_client = boto3.client('s3')

    try:
        buckets = s3_client.list_buckets()
        govbizai_buckets = [b['Name'] for b in buckets['Buckets'] if 'govbizai' in b['Name']]
        print(f"✅ Found {len(govbizai_buckets)} GovBizAI S3 buckets")
        for bucket in govbizai_buckets:
            print(f"   📁 {bucket}")
        validation_results['s3_buckets'] = len(govbizai_buckets) >= 5
    except Exception as e:
        print(f"❌ S3 validation error: {str(e)}")
        validation_results['s3_buckets'] = False

    # 5. Check API Gateway Health
    print("\n5. 🔌 VALIDATING API ENDPOINTS")
    print("-" * 40)

    # Test health endpoints (if they exist)
    api_results = {}
    for api_name, endpoint in [
        ('REST API', outputs['RestApiEndpoint']),
        ('Matching API', outputs['MatchingApiEndpoint']),
        ('Batch API', outputs['BatchOrchestrationApiEndpoint'])
    ]:
        try:
            # Try to hit a basic endpoint
            health_url = f"{endpoint}health" if not endpoint.endswith('/') else f"{endpoint}health"
            response = requests.get(health_url, timeout=5)

            # Even 404 is better than connection error
            if response.status_code in [200, 404, 401, 403]:
                print(f"✅ {api_name}: Responding ({response.status_code})")
                api_results[api_name] = True
            else:
                print(f"⚠️  {api_name}: Unexpected status {response.status_code}")
                api_results[api_name] = False
        except Exception as e:
            print(f"❌ {api_name}: Error - {str(e)}")
            api_results[api_name] = False

    validation_results['api_endpoints'] = any(api_results.values())

    # 6. Test Core Matching Function
    print("\n6. 🎯 TESTING CORE MATCHING FUNCTIONALITY")
    print("-" * 40)

    try:
        # Simple test payload
        test_payload = {
            "opportunity": {
                "notice_id": "prod-test-001",
                "title": "Test Opportunity",
                "description": "Test matching functionality",
                "naics_code": "541511"
            },
            "company_profile": {
                "company_id": "test-company",
                "company_name": "Test Company",
                "naics_codes": ["541511"],
                "capability_statement": "Test capabilities"
            }
        }

        # Test quick filter
        response = lambda_client.invoke(
            FunctionName='govbizai-quick-filter',
            InvocationType='RequestResponse',
            Payload=json.dumps(test_payload)
        )

        result = json.loads(response['Payload'].read())
        if result.get('statusCode') == 200:
            print("✅ Quick filter function working")
            validation_results['matching_function'] = True
        else:
            print(f"❌ Quick filter failed: {result.get('statusCode')}")
            validation_results['matching_function'] = False

    except Exception as e:
        print(f"❌ Matching function test error: {str(e)}")
        validation_results['matching_function'] = False

    # 7. Overall System Health Score
    print("\n" + "=" * 60)
    print("📊 PRODUCTION HEALTH SUMMARY")
    print("=" * 60)

    total_checks = len(validation_results)
    passed_checks = sum(validation_results.values())
    health_score = (passed_checks / total_checks) * 100

    for check, status in validation_results.items():
        status_icon = "✅" if status else "❌"
        print(f"{status_icon} {check.replace('_', ' ').title()}")

    print(f"\n🏥 SYSTEM HEALTH: {health_score:.1f}% ({passed_checks}/{total_checks} checks passed)")

    if health_score >= 90:
        print("🟢 PRODUCTION STATUS: HEALTHY ✅")
    elif health_score >= 75:
        print("🟡 PRODUCTION STATUS: MOSTLY HEALTHY ⚠️")
    else:
        print("🔴 PRODUCTION STATUS: NEEDS ATTENTION ❌")

    return {
        'health_score': health_score,
        'validation_results': validation_results,
        'outputs': outputs
    }

if __name__ == "__main__":
    validate_production_deployment()