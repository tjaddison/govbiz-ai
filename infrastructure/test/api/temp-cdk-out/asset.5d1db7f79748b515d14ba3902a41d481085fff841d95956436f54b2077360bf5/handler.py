"""
GovBizAI Capacity Fit Calculator
Phase 7: Matching Engine - Stub Implementation
"""

import json
import logging
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """Capacity Fit Calculator Lambda handler"""
    try:
        opportunity = event['opportunity']
        company_profile = event['company_profile']

        # Extract contract value and company size
        award_value = opportunity.get('Award$', '')
        employee_count = company_profile.get('employee_count', 50)  # Default assumption

        # Simple capacity scoring
        score = 0.8  # Default good fit

        if award_value:
            try:
                value = float(str(award_value).replace('$', '').replace(',', ''))
                if isinstance(employee_count, (int, str)):
                    emp_count = int(employee_count) if isinstance(employee_count, str) else employee_count

                    # Very rough capacity assessment
                    if value > 10000000 and emp_count < 20:  # Large contract, small company
                        score = 0.3
                    elif value < 100000 and emp_count > 100:  # Small contract, large company
                        score = 0.6
            except (ValueError, TypeError):
                pass

        result = {
            'score': score,
            'overall_score': score,
            'contract_value': award_value,
            'company_size': employee_count,
            'processing_time_ms': 2.0
        }

        return {
            'statusCode': 200,
            'body': json.dumps({
                'capacity_score': result,
                'component': 'capacity_fit',
                'weight': 0.05,
                'timestamp': int(time.time())
            })
        }
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}