import json
import boto3
import os
from typing import Dict, Any
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')

COMPANIES_TABLE = os.environ['COMPANIES_TABLE']

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Get company profile information for batch matching.

    Args:
        event: Input containing company_id
        context: Lambda context

    Returns:
        Company profile data
    """
    try:
        logger.info(f"Getting company profile with event: {json.dumps(event)}")

        company_id = event.get('company_id')
        if not company_id:
            raise ValueError("company_id is required")

        companies_table = dynamodb.Table(COMPANIES_TABLE)

        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            logger.warning(f"Company profile not found: {company_id}")
            return {
                'statusCode': 404,
                'company_profile': {
                    'company_id': company_id,
                    'company_name': 'Unknown',
                    'documents': [],
                    'naics_codes': [],
                    'certifications': []
                }
            }

        company_profile = response['Item']

        # Transform to ensure all required fields exist
        profile_data = {
            'company_id': company_id,
            'company_name': company_profile.get('company_name', 'Unknown'),
            'capability_statement': company_profile.get('capability_statement', ''),
            'naics_codes': company_profile.get('naics_codes', []),
            'certifications': company_profile.get('certifications', []),
            'documents': company_profile.get('documents', []),
            'past_performance': company_profile.get('past_performance', []),
            'revenue_range': company_profile.get('revenue_range', ''),
            'employee_count': company_profile.get('employee_count', ''),
            'locations': company_profile.get('locations', []),
            'created_at': company_profile.get('created_at', ''),
            'updated_at': company_profile.get('updated_at', '')
        }

        logger.info(f"Successfully retrieved company profile: {profile_data['company_name']}")

        return {
            'statusCode': 200,
            'company_profile': profile_data
        }

    except Exception as e:
        logger.error(f"Error getting company profile: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e),
            'company_profile': {
                'company_id': event.get('company_id', 'unknown'),
                'company_name': 'Error',
                'documents': [],
                'naics_codes': [],
                'certifications': []
            }
        }