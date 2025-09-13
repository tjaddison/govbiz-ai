import json
import boto3
import logging
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any
from decimal import Decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# Environment variables
OPPORTUNITIES_TABLE_NAME = os.environ['OPPORTUNITIES_TABLE']
RAW_DOCUMENTS_BUCKET = os.environ['RAW_DOCUMENTS_BUCKET']
PROCESSED_DOCUMENTS_BUCKET = os.environ['PROCESSED_DOCUMENTS_BUCKET']
TEMP_BUCKET = os.environ['TEMP_PROCESSING_BUCKET']
EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']

# Initialize DynamoDB table
opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE_NAME)

# Retention settings
RETENTION_DAYS = 14  # Delete opportunities 14 days after archive date

def lambda_handler(event, context):
    """
    Main handler for data retention and cleanup.
    Removes expired opportunities and associated data.
    """
    try:
        logger.info("Starting data retention cleanup process")

        # Calculate cutoff date
        cutoff_date = datetime.utcnow() - timedelta(days=RETENTION_DAYS)
        cutoff_date_str = cutoff_date.strftime('%Y-%m-%d')

        logger.info(f"Cleaning up opportunities with archive_date before: {cutoff_date_str}")

        # Find expired opportunities
        expired_opportunities = find_expired_opportunities(cutoff_date_str)

        if not expired_opportunities:
            logger.info("No expired opportunities found")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'No expired opportunities found',
                    'cutoff_date': cutoff_date_str,
                    'opportunities_deleted': 0
                })
            }

        logger.info(f"Found {len(expired_opportunities)} expired opportunities")

        # Process deletions
        deletion_results = process_deletions(expired_opportunities)

        # Clean up orphaned files
        orphaned_cleanup_results = cleanup_orphaned_files(cutoff_date_str)

        logger.info(f"Data retention cleanup completed: {deletion_results['successful']} deleted")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Data retention cleanup completed',
                'cutoff_date': cutoff_date_str,
                'opportunities_found': len(expired_opportunities),
                'opportunities_deleted': deletion_results['successful'],
                'opportunities_failed': deletion_results['failed'],
                'orphaned_files_cleaned': orphaned_cleanup_results.get('files_deleted', 0),
                'deletion_details': deletion_results['details']
            })
        }

    except Exception as e:
        logger.error(f"Data retention error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Data retention failed',
                'message': str(e)
            })
        }

def find_expired_opportunities(cutoff_date: str) -> List[Dict[str, Any]]:
    """Find opportunities that have passed their retention period."""
    logger.info(f"Scanning for opportunities with archive_date < {cutoff_date}")

    expired_opportunities = []

    try:
        # Use GSI to query by archive_date efficiently
        response = opportunities_table.scan(
            FilterExpression='archive_date < :cutoff_date AND archive_date <> :empty',
            ExpressionAttributeValues={
                ':cutoff_date': cutoff_date,
                ':empty': ''
            },
            ProjectionExpression='notice_id, posted_date, archive_date, title, embedding_metadata, attachment_count'
        )

        expired_opportunities.extend(response.get('Items', []))

        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = opportunities_table.scan(
                FilterExpression='archive_date < :cutoff_date AND archive_date <> :empty',
                ExpressionAttributeValues={
                    ':cutoff_date': cutoff_date,
                    ':empty': ''
                },
                ProjectionExpression='notice_id, posted_date, archive_date, title, embedding_metadata, attachment_count',
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            expired_opportunities.extend(response.get('Items', []))

        logger.info(f"Found {len(expired_opportunities)} expired opportunities")
        return expired_opportunities

    except Exception as e:
        logger.error(f"Error finding expired opportunities: {str(e)}")
        raise

def process_deletions(opportunities: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Process deletion of expired opportunities and associated data."""
    logger.info(f"Processing deletion of {len(opportunities)} opportunities")

    successful = 0
    failed = 0
    details = []

    for opportunity in opportunities:
        try:
            notice_id = opportunity['notice_id']
            logger.info(f"Deleting opportunity: {notice_id}")

            deletion_detail = {
                'notice_id': notice_id,
                'title': opportunity.get('title', 'Unknown'),
                'archive_date': opportunity.get('archive_date', ''),
                'files_deleted': 0,
                'embeddings_deleted': 0,
                'dynamodb_deleted': False,
                'errors': []
            }

            # Delete attachments and related files from S3
            files_deleted = delete_opportunity_files(notice_id, opportunity.get('posted_date', ''))
            deletion_detail['files_deleted'] = files_deleted

            # Delete embeddings
            embeddings_deleted = delete_opportunity_embeddings(notice_id, opportunity.get('embedding_metadata', {}))
            deletion_detail['embeddings_deleted'] = embeddings_deleted

            # Delete from DynamoDB
            delete_from_dynamodb(notice_id, opportunity.get('posted_date', ''))
            deletion_detail['dynamodb_deleted'] = True

            successful += 1
            details.append(deletion_detail)

            logger.info(f"Successfully deleted opportunity {notice_id}")

        except Exception as e:
            failed += 1
            error_detail = {
                'notice_id': opportunity.get('notice_id', 'unknown'),
                'title': opportunity.get('title', 'Unknown'),
                'error': str(e),
                'files_deleted': 0,
                'embeddings_deleted': 0,
                'dynamodb_deleted': False
            }
            details.append(error_detail)
            logger.error(f"Failed to delete opportunity {opportunity.get('notice_id', 'unknown')}: {str(e)}")

    return {
        'successful': successful,
        'failed': failed,
        'details': details
    }

def delete_opportunity_files(notice_id: str, posted_date: str) -> int:
    """Delete all S3 files associated with an opportunity."""
    files_deleted = 0

    # Extract date for S3 path construction
    try:
        if posted_date:
            date_obj = datetime.fromisoformat(posted_date.replace('Z', '+00:00'))
            date_prefix = date_obj.strftime('%Y-%m-%d')
        else:
            # If no posted date, we'll need to search more broadly
            date_prefix = None
    except Exception:
        date_prefix = None

    buckets_to_clean = [
        RAW_DOCUMENTS_BUCKET,
        PROCESSED_DOCUMENTS_BUCKET,
        TEMP_BUCKET
    ]

    for bucket_name in buckets_to_clean:
        try:
            if date_prefix:
                # More targeted deletion with date prefix
                prefixes = [
                    f"opportunities/{date_prefix}/{notice_id}/",
                    f"attachments/{date_prefix}/{notice_id}/",
                    f"attachments-metadata/{date_prefix}/{notice_id}/",
                    f"download-summaries/{date_prefix}/{notice_id}/"
                ]
            else:
                # Broader search if no date available
                prefixes = [
                    f"opportunities/{notice_id}/",
                    f"attachments/{notice_id}/",
                    f"attachments-metadata/{notice_id}/",
                    f"download-summaries/{notice_id}/"
                ]

            for prefix in prefixes:
                files_deleted += delete_s3_objects_with_prefix(bucket_name, prefix)

        except Exception as e:
            logger.error(f"Error deleting files from bucket {bucket_name}: {str(e)}")

    return files_deleted

def delete_opportunity_embeddings(notice_id: str, embedding_metadata: Dict[str, Any]) -> int:
    """Delete embedding files for an opportunity."""
    embeddings_deleted = 0

    try:
        # Delete specific embedding files if metadata is available
        if embedding_metadata and embedding_metadata.get('embedding_keys'):
            for embedding_info in embedding_metadata['embedding_keys']:
                s3_key = embedding_info.get('s3_key')
                if s3_key:
                    try:
                        s3_client.delete_object(Bucket=EMBEDDINGS_BUCKET, Key=s3_key)
                        embeddings_deleted += 1
                        logger.debug(f"Deleted embedding: {s3_key}")
                    except Exception as e:
                        logger.error(f"Failed to delete embedding {s3_key}: {str(e)}")

        # Also clean up any other embedding files for this opportunity
        prefix = f"opportunities/{notice_id}/"
        embeddings_deleted += delete_s3_objects_with_prefix(EMBEDDINGS_BUCKET, prefix)

    except Exception as e:
        logger.error(f"Error deleting embeddings for {notice_id}: {str(e)}")

    return embeddings_deleted

def delete_s3_objects_with_prefix(bucket_name: str, prefix: str) -> int:
    """Delete all S3 objects with a given prefix."""
    deleted_count = 0

    try:
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=bucket_name, Prefix=prefix)

        for page in pages:
            objects = page.get('Contents', [])
            if not objects:
                continue

            # Prepare delete request
            delete_keys = [{'Key': obj['Key']} for obj in objects]

            # Delete in batches of 1000 (S3 limit)
            for i in range(0, len(delete_keys), 1000):
                batch = delete_keys[i:i + 1000]
                response = s3_client.delete_objects(
                    Bucket=bucket_name,
                    Delete={'Objects': batch}
                )

                deleted_count += len(response.get('Deleted', []))

                # Log any errors
                for error in response.get('Errors', []):
                    logger.error(f"Failed to delete {error['Key']}: {error['Message']}")

        if deleted_count > 0:
            logger.info(f"Deleted {deleted_count} objects with prefix {prefix} from {bucket_name}")

    except Exception as e:
        logger.error(f"Error deleting objects with prefix {prefix} from {bucket_name}: {str(e)}")

    return deleted_count

def delete_from_dynamodb(notice_id: str, posted_date: str):
    """Delete opportunity from DynamoDB."""
    try:
        opportunities_table.delete_item(
            Key={
                'notice_id': notice_id,
                'posted_date': posted_date
            }
        )
        logger.debug(f"Deleted opportunity {notice_id} from DynamoDB")

    except Exception as e:
        logger.error(f"Failed to delete {notice_id} from DynamoDB: {str(e)}")
        raise

def cleanup_orphaned_files(cutoff_date: str) -> Dict[str, Any]:
    """Clean up orphaned files that may not be associated with specific opportunities."""
    logger.info("Cleaning up orphaned files")

    files_deleted = 0
    buckets_to_clean = [TEMP_BUCKET]

    try:
        for bucket_name in buckets_to_clean:
            # Clean up old CSV processing files
            prefix = "csv-processing/"
            files_deleted += cleanup_old_files_by_date(bucket_name, prefix, cutoff_date)

            # Clean up old processing logs and temporary files
            for prefix in ["processing-logs/", "temp-files/", "error-logs/"]:
                files_deleted += cleanup_old_files_by_date(bucket_name, prefix, cutoff_date)

    except Exception as e:
        logger.error(f"Error during orphaned file cleanup: {str(e)}")

    return {'files_deleted': files_deleted}

def cleanup_old_files_by_date(bucket_name: str, prefix: str, cutoff_date: str) -> int:
    """Clean up files older than cutoff date."""
    deleted_count = 0

    try:
        cutoff_datetime = datetime.strptime(cutoff_date, '%Y-%m-%d')

        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=bucket_name, Prefix=prefix)

        for page in pages:
            objects = page.get('Contents', [])
            old_objects = []

            for obj in objects:
                # Check if object is older than cutoff
                if obj['LastModified'].replace(tzinfo=None) < cutoff_datetime:
                    old_objects.append({'Key': obj['Key']})

            if old_objects:
                # Delete in batches
                for i in range(0, len(old_objects), 1000):
                    batch = old_objects[i:i + 1000]
                    response = s3_client.delete_objects(
                        Bucket=bucket_name,
                        Delete={'Objects': batch}
                    )
                    deleted_count += len(response.get('Deleted', []))

    except Exception as e:
        logger.error(f"Error cleaning up old files with prefix {prefix}: {str(e)}")

    return deleted_count