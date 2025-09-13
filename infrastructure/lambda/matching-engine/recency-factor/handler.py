"""
GovBizAI Recency Factor Scorer
Phase 7: Matching Engine - Stub Implementation
"""

import json
import logging
import time
from datetime import datetime

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """Recency Factor Scorer Lambda handler"""
    try:
        opportunity = event['opportunity']
        company_profile = event['company_profile']

        # Extract past performance dates
        past_performance = company_profile.get('past_performance', [])
        current_year = datetime.now().year

        score = 0.5  # Default moderate recency

        if past_performance:
            # Look for recent work (simplified)
            recent_work = 0
            for perf in past_performance:
                # This is simplified - in production would parse actual dates
                perf_str = str(perf).lower()
                if any(str(year) in perf_str for year in [current_year, current_year-1, current_year-2]):
                    recent_work += 1

            if recent_work >= 3:
                score = 1.0  # High recency
            elif recent_work >= 1:
                score = 0.7  # Good recency

        result = {
            'score': score,
            'overall_score': score,
            'recent_work_count': len([p for p in past_performance if str(current_year) in str(p)]),
            'processing_time_ms': 2.0
        }

        return {
            'statusCode': 200,
            'body': json.dumps({
                'recency_score': result,
                'component': 'recency_factor',
                'weight': 0.05,
                'timestamp': int(time.time())
            })
        }
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}