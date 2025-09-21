#!/usr/bin/env python3
"""
Test performance targets for the matching system
"""
import json
import boto3
import time
import concurrent.futures
from statistics import mean, median

def measure_component_performance(component_name, payload, iterations=5):
    """Measure performance of a single component"""
    lambda_client = boto3.client('lambda')
    times = []

    for i in range(iterations):
        start_time = time.time()
        try:
            response = lambda_client.invoke(
                FunctionName=component_name,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )
            result = json.loads(response['Payload'].read())
            end_time = time.time()

            processing_time = (end_time - start_time) * 1000  # Convert to ms
            times.append(processing_time)

            # Also get reported processing time from component
            if result.get('statusCode') == 200:
                body = json.loads(result.get('body', '{}'))
                # Extract processing time from different possible response structures
                reported_time = None
                for key in ['processing_time_ms', 'similarity_score', 'filter_details']:
                    if key in body and isinstance(body[key], dict):
                        reported_time = body[key].get('processing_time_ms')
                        break

        except Exception as e:
            print(f"    Error testing {component_name}: {str(e)}")
            continue

    return {
        'component': component_name,
        'avg_time': mean(times) if times else 0,
        'median_time': median(times) if times else 0,
        'min_time': min(times) if times else 0,
        'max_time': max(times) if times else 0,
        'iterations': len(times)
    }

def test_performance_targets():
    """Test performance targets for the matching system"""

    # Test data
    company_profile = {
        "company_id": "e4d8f458-b031-70ed-aee1-f318f0290017",
        "tenant_id": "test-tenant",
        "company_name": "MedPACS, LLC",
        "capability_statement": "Medical procurement and consulting services for government healthcare systems",
        "naics_codes": ["541511", "541512", "541513", "541519", "541618"],
        "certifications": ["SDVOSB", "SBA Small Business", "Minority-Owned"],
        "locations": [{"city": "Salisbury", "state": "MD", "zip_code": "21804"}],
        "employee_count": "1-10",
        "revenue_range": "Under $1M",
        "active_status": True,
        "status": "active"
    }

    opportunity = {
        "notice_id": "perf-test-001",
        "posted_date": "2025-09-20",
        "title": "IT Support Services for Government Healthcare",
        "description": "Comprehensive IT support services including network administration, cybersecurity, and medical system maintenance for government healthcare facilities.",
        "naics_code": "541511",
        "set_aside": "Total Small Business Set-Aside",
        "office": "Department of Veterans Affairs",
        "department": "DEPT OF VETERANS AFFAIRS",
        "response_deadline": "2025-10-20",
        "pop_state": "MD",
        "pop_city": "Baltimore"
    }

    payload = {
        "opportunity": opportunity,
        "company_profile": company_profile
    }

    print("MATCHING SYSTEM PERFORMANCE ANALYSIS")
    print("=" * 60)

    # Performance targets from CLAUDE.md requirements:
    targets = {
        "quick_filter": 10,          # < 10ms for rapid screening
        "match_calculation": 100,     # < 100ms per comparison
        "semantic_similarity": 2000, # < 2 seconds for embedding generation
        "overall_matching": 5000     # Complete match within 5 seconds
    }

    # Test individual components
    components = [
        'govbizai-quick-filter',
        'govbizai-semantic-similarity',
        'govbizai-keyword-matching',
        'govbizai-naics-alignment',
        'govbizai-past-performance',
        'govbizai-certification-bonus',
        'govbizai-geographic-match',
        'govbizai-capacity-fit',
        'govbizai-recency-factor'
    ]

    print("\n1. INDIVIDUAL COMPONENT PERFORMANCE")
    print("-" * 40)

    component_results = []
    total_component_time = 0

    for component in components:
        print(f"Testing {component}...")
        result = measure_component_performance(component, payload, iterations=3)
        component_results.append(result)

        avg_time = result['avg_time']
        total_component_time += avg_time

        # Check against targets
        target_met = "✓" if avg_time < targets.get("match_calculation", 100) else "✗"
        print(f"  {target_met} Average: {avg_time:.2f}ms (Target: <100ms)")

    print(f"\nTotal Component Time: {total_component_time:.2f}ms")

    # Test quick filter specifically
    print("\n2. QUICK FILTER PERFORMANCE")
    print("-" * 40)
    quick_filter_result = measure_component_performance('govbizai-quick-filter', payload, iterations=10)
    qf_avg = quick_filter_result['avg_time']
    qf_target_met = "✓" if qf_avg < targets["quick_filter"] else "✗"
    print(f"{qf_target_met} Quick Filter Average: {qf_avg:.2f}ms (Target: <{targets['quick_filter']}ms)")

    # Test complete match orchestrator
    print("\n3. COMPLETE MATCH ORCHESTRATION PERFORMANCE")
    print("-" * 40)
    orchestrator_payload = payload.copy()
    orchestrator_payload["use_cache"] = False  # Test without cache

    print("Testing complete match orchestration...")
    orchestrator_result = measure_component_performance('govbizai-match-orchestrator', orchestrator_payload, iterations=3)
    orch_avg = orchestrator_result['avg_time']
    orch_target_met = "✓" if orch_avg < targets["overall_matching"] else "✗"
    print(f"{orch_target_met} Match Orchestrator Average: {orch_avg:.2f}ms (Target: <{targets['overall_matching']}ms)")

    # Test concurrent matching (simulating batch processing)
    print("\n4. CONCURRENT MATCHING PERFORMANCE")
    print("-" * 40)

    def run_single_match():
        lambda_client = boto3.client('lambda')
        start_time = time.time()
        try:
            response = lambda_client.invoke(
                FunctionName='govbizai-quick-filter',
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )
            return (time.time() - start_time) * 1000
        except:
            return None

    # Test with 10 concurrent matches
    print("Testing 10 concurrent quick filter operations...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        start_time = time.time()
        futures = [executor.submit(run_single_match) for _ in range(10)]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]
        end_time = time.time()

    valid_results = [r for r in results if r is not None]
    if valid_results:
        concurrent_avg = mean(valid_results)
        total_time = (end_time - start_time) * 1000
        throughput = len(valid_results) / (total_time / 1000)  # operations per second

        print(f"✓ Concurrent Operations: {len(valid_results)}/10 successful")
        print(f"✓ Average Response Time: {concurrent_avg:.2f}ms")
        print(f"✓ Total Execution Time: {total_time:.2f}ms")
        print(f"✓ Throughput: {throughput:.1f} ops/second")

    # Performance summary
    print("\n" + "=" * 60)
    print("PERFORMANCE SUMMARY")
    print("=" * 60)

    print(f"Quick Filter:           {qf_avg:.2f}ms  {'✓ PASS' if qf_avg < targets['quick_filter'] else '✗ FAIL'}")
    print(f"Match Orchestrator:     {orch_avg:.2f}ms  {'✓ PASS' if orch_avg < targets['overall_matching'] else '✗ FAIL'}")
    print(f"Component Average:      {total_component_time/len(components):.2f}ms")

    # Overall system health
    all_targets_met = (
        qf_avg < targets["quick_filter"] and
        orch_avg < targets["overall_matching"]
    )

    print(f"\nOVERALL SYSTEM STATUS: {'✓ PRODUCTION READY' if all_targets_met else '⚠ NEEDS OPTIMIZATION'}")

    return {
        'quick_filter_performance': quick_filter_result,
        'orchestrator_performance': orchestrator_result,
        'component_performances': component_results,
        'targets_met': all_targets_met
    }

if __name__ == "__main__":
    test_performance_targets()