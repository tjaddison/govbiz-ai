#!/usr/bin/env python3
"""
Test the caching system for match scores
"""
import json
import boto3
import time
import hashlib

def test_cache_system():
    """Test storing and retrieving cached match results"""

    dynamodb = boto3.resource('dynamodb')
    cache_table = dynamodb.Table('govbizai-match-cache')

    # Sample data for cache key generation
    opportunity = {
        "notice_id": "test-cache-001",
        "title": "Test Opportunity",
        "naics_code": "541511"
    }

    company_profile = {
        "company_id": "e4d8f458-b031-70ed-aee1-f318f0290017",
        "company_name": "MedPACS, LLC"
    }

    weights = {
        "semantic_similarity": 0.25,
        "keyword_matching": 0.15,
        "naics_alignment": 0.15,
        "past_performance": 0.20,
        "certification_bonus": 0.10,
        "geographic_match": 0.05,
        "capacity_fit": 0.05,
        "recency_factor": 0.05
    }

    # Generate cache key similar to the orchestrator
    key_data = {
        'opp_id': opportunity.get('notice_id', ''),
        'company_id': company_profile.get('company_id', ''),
        'opp_hash': hashlib.md5(json.dumps(opportunity, sort_keys=True).encode()).hexdigest()[:8],
        'company_hash': hashlib.md5(json.dumps(company_profile, sort_keys=True).encode()).hexdigest()[:8],
        'weights_hash': hashlib.md5(json.dumps(weights, sort_keys=True).encode()).hexdigest()[:8]
    }

    cache_key = f"match_{key_data['opp_id']}_{key_data['company_id']}_{key_data['opp_hash']}_{key_data['company_hash']}_{key_data['weights_hash']}"

    # Sample match result for caching
    match_data = {
        'opportunity_id': opportunity['notice_id'],
        'company_id': company_profile['company_id'],
        'total_score': 0.75,
        'confidence_level': 'HIGH',
        'component_scores': {
            'semantic_similarity': 0.80,
            'keyword_matching': 0.70,
            'naics_alignment': 1.00,
            'past_performance': 0.60,
            'certification_bonus': 0.50,
            'geographic_match': 1.00,
            'capacity_fit': 0.85,
            'recency_factor': 0.70
        },
        'match_reasons': ['Strong overall match with high compatibility'],
        'recommendations': ['High priority opportunity for bid preparation'],
        'action_items': ['Review full solicitation document'],
        'processing_time_ms': 950.5
    }

    print("Testing cache system...")
    print(f"Cache Key: {cache_key}")
    print(f"Opportunity: {opportunity['title']}")
    print(f"Company: {company_profile['company_name']}")
    print("-" * 60)

    try:
        # Store in cache
        current_time = int(time.time())
        ttl = current_time + 86400  # 24 hours TTL

        cache_item = {
            'cache_key': cache_key,
            'match_data': json.dumps(match_data),
            'timestamp': current_time,
            'ttl': ttl
        }

        cache_table.put_item(Item=cache_item)
        print("✓ Match result cached successfully")

        # Retrieve from cache
        response = cache_table.get_item(Key={'cache_key': cache_key})

        if 'Item' in response:
            cached_item = response['Item']
            cached_timestamp = cached_item.get('timestamp', 0)

            # Check if cache is still valid (24 hour TTL)
            cache_age = current_time - cached_timestamp
            is_valid = cache_age < 86400

            print("✓ Cache item retrieved successfully")
            print(f"  Cache Age: {cache_age} seconds")
            print(f"  Cache Valid: {is_valid}")
            print(f"  TTL: {cached_item.get('ttl', 0)}")

            # Deserialize cached data
            cached_match_data = json.loads(cached_item['match_data'])
            print(f"  Cached Total Score: {cached_match_data['total_score']:.4f}")
            print(f"  Cached Confidence: {cached_match_data['confidence_level']}")

            # Test cache expiration
            print("\n--- Testing Cache Expiration ---")
            expired_item = cache_item.copy()
            expired_item['timestamp'] = current_time - 90000  # Make it expired
            expired_item['cache_key'] = cache_key + "_expired"

            cache_table.put_item(Item=expired_item)

            # Retrieve expired item
            expired_response = cache_table.get_item(Key={'cache_key': expired_item['cache_key']})
            if 'Item' in expired_response:
                expired_cached = expired_response['Item']
                expired_age = current_time - expired_cached.get('timestamp', 0)
                expired_valid = expired_age < 86400

                print(f"✓ Expired cache test: Age {expired_age}s, Valid: {expired_valid}")

        else:
            print("✗ Failed to retrieve cached item")

        # Test cache performance
        print("\n--- Cache Performance Test ---")
        start_time = time.time()

        # Simulate 10 cache retrievals
        for i in range(10):
            cache_table.get_item(Key={'cache_key': cache_key})

        end_time = time.time()
        avg_time = ((end_time - start_time) / 10) * 1000  # Convert to ms

        print(f"✓ Average cache retrieval time: {avg_time:.2f}ms")

        return True

    except Exception as e:
        print(f"✗ Error testing cache system: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_cache_system()