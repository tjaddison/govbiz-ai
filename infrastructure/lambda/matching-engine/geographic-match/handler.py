"""
GovBizAI Geographic Matching Logic
Phase 7: Matching Engine - Stub Implementation
"""

import json
import logging

# Add the config management directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'config-management'))

try:
    from config_client import ConfigurationClient
except ImportError:
    # Fallback if config client is not available
    logger = logging.getLogger()
    logger.warning("Configuration client not available, using default weights")
    ConfigurationClient = Noneimport time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """Geographic Matching Lambda handler"""
    try:
        opportunity = event['opportunity']
        company_profile = event['company_profile']

        opp_state = opportunity.get('PopState', opportunity.get('State', '')).upper()
        company_state = company_profile.get('state', '').upper()

        score = 0.0
        if not opp_state:  # No geographic restriction
            score = 1.0
        elif company_state == opp_state:  # Same state
            score = 1.0
        else:  # Different state
            score = 0.4  # Remote work possible

        result = {
            'score': score,
            'overall_score': score,
            'opportunity_state': opp_state,
            'company_state': company_state,
            'processing_time_ms': 2.0
        }

        return {
            'statusCode': 200,
            'body': json.dumps({
                'geographic_score': result,
                'component': 'geographic_match',
                'weight': weight,
                'timestamp': int(time.time())
            })
        }
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}