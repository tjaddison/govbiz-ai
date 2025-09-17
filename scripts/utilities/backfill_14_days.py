#!/usr/bin/env python3
"""
14-day backfill script for SAM.gov opportunities.
This script will process opportunities for the last 14 days using the existing infrastructure.
"""

import boto3
import json
import logging
from datetime import datetime, timedelta
from typing import List

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize AWS clients
lambda_client = boto3.client('lambda')

# Lambda function names
CSV_PROCESSOR_FUNCTION = 'govbizai-csv-processor'

def generate_date_range(days_back: int = 14) -> List[str]:
    """Generate list of dates for the last N days (excluding today)."""
    dates = []
    today = datetime.utcnow().date()

    for i in range(1, days_back + 1):  # Start from 1 to exclude today
        target_date = today - timedelta(days=i)
        # Include weekends since we want complete data
        dates.append(target_date.strftime('%Y-%m-%d'))

    # Sort dates chronologically (oldest first)
    dates.reverse()
    return dates

def process_date(target_date: str) -> dict:
    """Process opportunities for a specific date."""
    logger.info(f"Processing opportunities for date: {target_date}")

    try:
        # Invoke CSV processor with target date
        event = {
            'target_date': target_date,
            'test_run': False,
            'backfill': True
        }

        response = lambda_client.invoke(
            FunctionName=CSV_PROCESSOR_FUNCTION,
            InvocationType='RequestResponse',  # Synchronous
            Payload=json.dumps(event)
        )

        # Parse response
        response_payload = json.loads(response['Payload'].read())

        if response.get('StatusCode') == 200:
            body = json.loads(response_payload.get('body', '{}'))
            opportunities_found = body.get('opportunities_found', 0)
            opportunities_queued = body.get('opportunities_queued', 0)

            logger.info(f"Date {target_date}: {opportunities_found} found, {opportunities_queued} queued")

            return {
                'date': target_date,
                'success': True,
                'opportunities_found': opportunities_found,
                'opportunities_queued': opportunities_queued,
                'message': body.get('message', '')
            }
        else:
            error_msg = response_payload.get('body', {})
            logger.error(f"Failed to process date {target_date}: {error_msg}")
            return {
                'date': target_date,
                'success': False,
                'error': error_msg
            }

    except Exception as e:
        logger.error(f"Error processing date {target_date}: {str(e)}")
        return {
            'date': target_date,
            'success': False,
            'error': str(e)
        }

def main():
    """Main backfill execution."""
    logger.info("Starting 14-day backfill process")

    # Generate date range
    dates = generate_date_range(14)
    logger.info(f"Processing dates: {dates}")

    results = []
    total_found = 0
    total_queued = 0

    # Process each date
    for date in dates:
        result = process_date(date)
        results.append(result)

        if result['success']:
            total_found += result.get('opportunities_found', 0)
            total_queued += result.get('opportunities_queued', 0)

        # Small delay between requests to avoid overwhelming the system
        import time
        time.sleep(2)

    # Summary
    successful_dates = [r for r in results if r['success']]
    failed_dates = [r for r in results if not r['success']]

    logger.info("\n" + "="*60)
    logger.info("BACKFILL SUMMARY")
    logger.info("="*60)
    logger.info(f"Total dates processed: {len(dates)}")
    logger.info(f"Successful: {len(successful_dates)}")
    logger.info(f"Failed: {len(failed_dates)}")
    logger.info(f"Total opportunities found: {total_found}")
    logger.info(f"Total opportunities queued: {total_queued}")

    if failed_dates:
        logger.warning("Failed dates:")
        for failed in failed_dates:
            logger.warning(f"  {failed['date']}: {failed.get('error', 'Unknown error')}")

    # Detailed results
    logger.info("\nDetailed Results:")
    for result in results:
        if result['success']:
            logger.info(f"  {result['date']}: {result['opportunities_found']} found, {result['opportunities_queued']} queued")
        else:
            logger.error(f"  {result['date']}: FAILED - {result.get('error', 'Unknown error')}")

    return {
        'total_dates': len(dates),
        'successful_dates': len(successful_dates),
        'failed_dates': len(failed_dates),
        'total_opportunities_found': total_found,
        'total_opportunities_queued': total_queued,
        'results': results
    }

if __name__ == "__main__":
    summary = main()

    # Save results to file
    with open('/tmp/backfill_results.json', 'w') as f:
        json.dump(summary, f, indent=2)

    logger.info(f"\nBackfill results saved to: /tmp/backfill_results.json")