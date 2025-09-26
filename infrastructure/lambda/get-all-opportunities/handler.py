import json
import boto3
import os
from typing import Dict, Any, List
import logging
from boto3.dynamodb.conditions import Attr
from datetime import datetime, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')

OPPORTUNITIES_TABLE = os.environ['OPPORTUNITIES_TABLE']

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Get active opportunities for batch matching (returns only IDs to avoid size limits).

    Args:
        event: Input containing any filters
        context: Lambda context

    Returns:
        List of opportunity IDs for Step Functions to process
    """
    try:
        logger.info(f"Getting all opportunities with event: {json.dumps(event)}")

        opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE)

        # Set up scan parameters with projection to get only essential fields
        scan_kwargs = {
            'ProjectionExpression': 'notice_id, title, naics_code, set_aside_code, archive_date, posted_date'
        }

        # Filter out archived opportunities (older than archive date)
        current_date = datetime.utcnow().strftime('%Y-%m-%d')

        # Only get active opportunities that haven't been archived
        scan_kwargs['FilterExpression'] = (
            Attr('archive_date').not_exists() |
            Attr('archive_date').gte(current_date)
        )

        # Apply any additional filters from the event
        opportunity_filters = event.get('opportunity_filters', {})

        # NAICS code filter
        if opportunity_filters.get('naics_codes'):
            naics_filter = None
            for naics in opportunity_filters['naics_codes']:
                if naics_filter is None:
                    naics_filter = Attr('naics_code').eq(naics)
                else:
                    naics_filter = naics_filter | Attr('naics_code').eq(naics)

            if 'FilterExpression' in scan_kwargs:
                scan_kwargs['FilterExpression'] = scan_kwargs['FilterExpression'] & naics_filter
            else:
                scan_kwargs['FilterExpression'] = naics_filter

        # Set-aside filter
        if opportunity_filters.get('set_aside_codes'):
            set_aside_filter = None
            for set_aside in opportunity_filters['set_aside_codes']:
                if set_aside_filter is None:
                    set_aside_filter = Attr('set_aside_code').eq(set_aside)
                else:
                    set_aside_filter = set_aside_filter | Attr('set_aside_code').eq(set_aside)

            if 'FilterExpression' in scan_kwargs:
                scan_kwargs['FilterExpression'] = scan_kwargs['FilterExpression'] & set_aside_filter
            else:
                scan_kwargs['FilterExpression'] = set_aside_filter

        # Perform paginated scan to get all opportunities
        opportunities = []
        response = opportunities_table.scan(**scan_kwargs)
        opportunities.extend(response.get('Items', []))

        # Handle pagination
        while 'LastEvaluatedKey' in response:
            scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
            response = opportunities_table.scan(**scan_kwargs)
            opportunities.extend(response.get('Items', []))

        logger.info(f"Retrieved {len(opportunities)} active opportunities")

        # Return only essential opportunity identifiers for Step Functions processing
        # The matching engine will retrieve full opportunity details separately
        formatted_opportunities = []
        for opp in opportunities:
            formatted_opp = {
                'notice_id': opp.get('notice_id', ''),
                'title': opp.get('title', '')[:100],  # Truncate title for size
                'naics_code': opp.get('naics_code', ''),
                'set_aside_code': opp.get('set_aside_code', ''),
                'posted_date': opp.get('posted_date', '')
            }
            formatted_opportunities.append(formatted_opp)

        # For now, limit to first 10 opportunities to avoid Step Functions size limits
        # TODO: Implement proper pagination for production
        limited_opportunities = formatted_opportunities[:10]

        # Preserve company_profile from input if it exists
        company_profile = event.get('company_profile', {})

        return {
            'statusCode': 200,
            'opportunities': limited_opportunities,
            'total_count': len(limited_opportunities),
            'total_available': len(formatted_opportunities),
            'company_profile': company_profile
        }

    except Exception as e:
        logger.error(f"Error getting opportunities: {str(e)}")
        return {
            'statusCode': 500,
            'error': str(e),
            'opportunities': [],
            'total_count': 0
        }