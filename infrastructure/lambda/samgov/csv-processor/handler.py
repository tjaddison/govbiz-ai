import json
import boto3
import requests
import csv
from datetime import datetime, timedelta
from io import StringIO
import logging
import os
from typing import List, Dict, Any

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
sqs_client = boto3.client('sqs')

# Environment variables
TEMP_BUCKET = os.environ['TEMP_PROCESSING_BUCKET']
PROCESSING_QUEUE_URL = os.environ['PROCESSING_QUEUE_URL']

# SAM.gov CSV URL
SAMGOV_CSV_URL = "https://s3.amazonaws.com/falextracts/Contract%20Opportunities/datagov/ContractOpportunitiesFullCSV.csv"

def lambda_handler(event, context):
    """
    Main handler for CSV download and processing.
    Downloads SAM.gov CSV, filters for yesterday's opportunities, and queues for processing.
    """
    try:
        logger.info("Starting SAM.gov CSV processing")

        # Calculate yesterday's date for filtering
        yesterday = (datetime.utcnow() - timedelta(days=1)).strftime('%Y-%m-%d')
        logger.info(f"Processing opportunities posted on: {yesterday}")

        # Download CSV file
        csv_content = download_csv_file()

        # Parse and filter CSV content
        filtered_opportunities = parse_and_filter_csv(csv_content, yesterday)

        # Store filtered data in S3
        filtered_file_key = store_filtered_data(filtered_opportunities, yesterday)

        # Queue opportunities for processing
        queued_count = queue_opportunities_for_processing(filtered_opportunities)

        logger.info(f"Processing complete. {len(filtered_opportunities)} opportunities found, {queued_count} queued.")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'CSV processing completed successfully',
                'opportunities_found': len(filtered_opportunities),
                'opportunities_queued': queued_count,
                'processed_date': yesterday,
                'filtered_file_location': f"s3://{TEMP_BUCKET}/{filtered_file_key}",
                'opportunities': [{'notice_id': opp['NoticeId'], 'title': opp['Title']} for opp in filtered_opportunities[:10]]  # First 10 for visibility
            })
        }

    except Exception as e:
        logger.error(f"Error processing CSV: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'CSV processing failed',
                'message': str(e)
            })
        }

def download_csv_file() -> str:
    """
    Download the CSV file from SAM.gov.
    Returns the CSV content as string.
    """
    logger.info(f"Downloading CSV from: {SAMGOV_CSV_URL}")

    try:
        response = requests.get(SAMGOV_CSV_URL, timeout=300)  # 5 minute timeout
        response.raise_for_status()

        csv_size_mb = len(response.content) / (1024 * 1024)
        logger.info(f"CSV downloaded successfully. Size: {csv_size_mb:.2f} MB")

        return response.text

    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to download CSV: {str(e)}")
        raise Exception(f"CSV download failed: {str(e)}")

def parse_and_filter_csv(csv_content: str, target_date: str) -> List[Dict[str, Any]]:
    """
    Parse CSV content and filter for opportunities posted on target date.
    Returns list of filtered opportunity dictionaries.
    """
    logger.info("Parsing and filtering CSV content")

    try:
        # Read CSV using built-in csv module
        csv_file = StringIO(csv_content)
        reader = csv.DictReader(csv_file)

        total_opportunities = 0
        opportunities = []

        for row in reader:
            total_opportunities += 1

            # Parse the posted date
            posted_date_str = row.get('PostedDate', '').strip()
            if not posted_date_str:
                continue

            try:
                # Try to parse the date (assume YYYY-MM-DD format)
                posted_date = datetime.strptime(posted_date_str[:10], '%Y-%m-%d').date()
                target_date_obj = datetime.strptime(target_date, '%Y-%m-%d').date()

                if posted_date != target_date_obj:
                    continue

            except ValueError:
                logger.warning(f"Could not parse date: {posted_date_str}")
                continue

            # Create opportunity dictionary
            opportunity = {}
            for key, value in row.items():
                # Clean up the values
                if value is None or value == '':
                    opportunity[key] = '' if key in ['Description', 'Title'] else None
                else:
                    opportunity[key] = str(value).strip()

            # Ensure required fields are present
            if not opportunity.get('NoticeId'):
                logger.warning("Skipping opportunity with missing NoticeId")
                continue

            opportunities.append(opportunity)

        logger.info(f"Total opportunities in CSV: {total_opportunities}")
        logger.info(f"Opportunities posted on {target_date}: {len(opportunities)}")

        return opportunities

    except Exception as e:
        logger.error(f"Error parsing CSV: {str(e)}")
        raise Exception(f"CSV parsing failed: {str(e)}")

def store_filtered_data(opportunities: List[Dict[str, Any]], date: str) -> str:
    """
    Store filtered opportunities data in S3.
    Returns the S3 key where data was stored.
    """
    logger.info("Storing filtered data in S3")

    try:
        # Create filename with timestamp
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        file_key = f"csv-processing/{date}/filtered_opportunities_{timestamp}.json"

        # Convert to JSON and upload to S3
        json_content = json.dumps(opportunities, indent=2, default=str)

        s3_client.put_object(
            Bucket=TEMP_BUCKET,
            Key=file_key,
            Body=json_content.encode('utf-8'),
            ContentType='application/json',
            ServerSideEncryption='aws:kms'
        )

        logger.info(f"Filtered data stored at: s3://{TEMP_BUCKET}/{file_key}")
        return file_key

    except Exception as e:
        logger.error(f"Error storing filtered data: {str(e)}")
        raise Exception(f"Failed to store filtered data: {str(e)}")

def queue_opportunities_for_processing(opportunities: List[Dict[str, Any]]) -> int:
    """
    Queue opportunities for processing by sending messages to SQS.
    Returns the number of opportunities successfully queued.
    """
    logger.info("Queueing opportunities for processing")

    queued_count = 0
    batch_size = 10  # SQS batch limit

    try:
        # Process in batches
        for i in range(0, len(opportunities), batch_size):
            batch = opportunities[i:i + batch_size]

            # Prepare batch messages
            entries = []
            for j, opportunity in enumerate(batch):
                message_body = {
                    'notice_id': opportunity['NoticeId'],
                    'opportunity_data': opportunity,
                    'processing_type': 'new_opportunity',
                    'timestamp': datetime.utcnow().isoformat()
                }

                entries.append({
                    'Id': str(i + j),
                    'MessageBody': json.dumps(message_body),
                    'MessageAttributes': {
                        'NoticeId': {
                            'StringValue': opportunity['NoticeId'],
                            'DataType': 'String'
                        },
                        'ProcessingType': {
                            'StringValue': 'new_opportunity',
                            'DataType': 'String'
                        }
                    }
                })

            # Send batch to SQS
            response = sqs_client.send_message_batch(
                QueueUrl=PROCESSING_QUEUE_URL,
                Entries=entries
            )

            # Count successful messages
            successful = len(response.get('Successful', []))
            failed = len(response.get('Failed', []))

            queued_count += successful

            if failed > 0:
                logger.warning(f"Failed to queue {failed} opportunities in batch {i//batch_size + 1}")
                for failure in response.get('Failed', []):
                    logger.error(f"Failed to queue message {failure['Id']}: {failure.get('Message', 'Unknown error')}")

            logger.info(f"Batch {i//batch_size + 1}: {successful} queued, {failed} failed")

        logger.info(f"Total opportunities queued: {queued_count}")
        return queued_count

    except Exception as e:
        logger.error(f"Error queueing opportunities: {str(e)}")
        raise Exception(f"Failed to queue opportunities: {str(e)}")

def validate_opportunity_data(opportunity: Dict[str, Any]) -> bool:
    """
    Validate that opportunity has required fields for processing.
    """
    required_fields = ['NoticeId', 'Title', 'PostedDate']

    for field in required_fields:
        if not opportunity.get(field):
            logger.warning(f"Opportunity missing required field: {field}")
            return False

    return True