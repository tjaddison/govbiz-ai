import json
import boto3
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from decimal import Decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# Environment variables
OPPORTUNITIES_TABLE = os.environ['OPPORTUNITIES_TABLE']
VECTOR_INDEX_TABLE = os.environ.get('VECTOR_INDEX_TABLE', 'govbizai-vector-index')
EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']
RAW_DOCUMENTS_BUCKET = os.environ['RAW_DOCUMENTS_BUCKET']
PROCESSED_DOCUMENTS_BUCKET = os.environ['PROCESSED_DOCUMENTS_BUCKET']

# Initialize DynamoDB tables
opportunities_table = dynamodb.Table(OPPORTUNITIES_TABLE)
vector_index_table = dynamodb.Table(VECTOR_INDEX_TABLE)

def lambda_handler(event, context):
    """
    Retention policy handler for 14-day cleanup of expired opportunities.

    This function implements the retention policy specified in the technical requirements:
    - Query DynamoDB for records where current_date > archive_date + 14 days
    - For each expired record:
      - Delete from DynamoDB
      - Delete JSON from S3
      - Delete attachments from S3
      - Delete embeddings from S3 Vectors
      - Log deletion in audit table
    """
    try:
        logger.info("Starting retention policy cleanup")

        # Calculate cutoff date (14 days ago)
        cutoff_date = datetime.utcnow() - timedelta(days=14)
        cutoff_date_str = cutoff_date.strftime('%Y-%m-%d')

        logger.info(f"Cleaning up opportunities older than: {cutoff_date_str}")

        # Find expired opportunities
        expired_opportunities = find_expired_opportunities(cutoff_date_str)

        if not expired_opportunities:
            logger.info("No expired opportunities found")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'No expired opportunities found',
                    'cleaned_up_count': 0,
                    'cutoff_date': cutoff_date_str
                })
            }

        logger.info(f"Found {len(expired_opportunities)} expired opportunities")

        # Clean up expired opportunities
        cleanup_results = []
        for opportunity in expired_opportunities:
            result = cleanup_opportunity(opportunity)
            cleanup_results.append(result)

            # Log cleanup action
            log_cleanup_action(opportunity, result)

        # Summary
        successful_cleanups = [r for r in cleanup_results if r['success']]
        failed_cleanups = [r for r in cleanup_results if not r['success']]

        logger.info(f"Cleanup complete: {len(successful_cleanups)} successful, {len(failed_cleanups)} failed")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Retention cleanup completed',
                'total_opportunities': len(expired_opportunities),
                'successful_cleanups': len(successful_cleanups),
                'failed_cleanups': len(failed_cleanups),
                'cutoff_date': cutoff_date_str,
                'cleanup_results': cleanup_results
            })
        }

    except Exception as e:
        logger.error(f"Retention cleanup error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Retention cleanup failed',
                'message': str(e)
            })
        }

def find_expired_opportunities(cutoff_date: str) -> List[Dict[str, Any]]:
    """Find opportunities that have passed their archive date + 14 days."""
    try:
        expired_opportunities = []

        # Use boto3 resource scan instead of low-level client
        response = opportunities_table.scan(
            FilterExpression='archive_date < :cutoff_date',
            ExpressionAttributeValues={
                ':cutoff_date': cutoff_date
            }
        )

        while True:
            for item in response.get('Items', []):
                # item is already a regular Python dict with boto3 resource
                opportunity = {
                    'notice_id': item.get('notice_id', ''),
                    'archive_date': item.get('archive_date', ''),
                    'posted_date': item.get('posted_date', ''),
                    'title': item.get('title', '')
                }

                # Additional validation - check if really expired
                try:
                    if opportunity['archive_date']:
                        archive_date = datetime.strptime(opportunity['archive_date'], '%Y-%m-%d')
                        expiry_date = archive_date + timedelta(days=14)

                        if datetime.utcnow() > expiry_date:
                            expired_opportunities.append(opportunity)
                            logger.info(f"Found expired opportunity: {opportunity['notice_id']} (archived: {opportunity['archive_date']})")
                except (ValueError, TypeError):
                    logger.warning(f"Invalid archive_date for opportunity {opportunity['notice_id']}: {opportunity['archive_date']}")
                    continue

            # Handle pagination
            if 'LastEvaluatedKey' in response:
                response = opportunities_table.scan(
                    FilterExpression='archive_date < :cutoff_date',
                    ExpressionAttributeValues={
                        ':cutoff_date': cutoff_date
                    },
                    ExclusiveStartKey=response['LastEvaluatedKey']
                )
            else:
                break

        return expired_opportunities

    except Exception as e:
        logger.error(f"Error finding expired opportunities: {str(e)}")
        raise

def cleanup_opportunity(opportunity: Dict[str, Any]) -> Dict[str, Any]:
    """Clean up all data for a single expired opportunity."""
    notice_id = opportunity['notice_id']
    posted_date = opportunity.get('posted_date', '')
    archive_date = opportunity.get('archive_date', '')

    logger.info(f"Cleaning up opportunity: {notice_id}")

    cleanup_result = {
        'notice_id': notice_id,
        'success': True,
        'errors': [],
        'deleted_items': []
    }

    try:
        # 1. Delete from DynamoDB opportunities table
        try:
            opportunities_table.delete_item(
                Key={'notice_id': notice_id}
            )
            cleanup_result['deleted_items'].append('dynamodb_opportunity')
            logger.info(f"Deleted DynamoDB record for {notice_id}")
        except Exception as e:
            cleanup_result['errors'].append(f"DynamoDB deletion error: {str(e)}")
            logger.error(f"Failed to delete DynamoDB record for {notice_id}: {str(e)}")

        # 2. Delete from vector index table
        try:
            # Query vector index entries for this opportunity
            vector_response = vector_index_table.query(
                IndexName='entity-index',  # Assuming we have a GSI on entity_id
                KeyConditionExpression='entity_id = :entity_id',
                ExpressionAttributeValues={':entity_id': notice_id}
            )

            for vector_item in vector_response.get('Items', []):
                vector_index_table.delete_item(
                    Key={'vector_id': vector_item['vector_id']}
                )
                cleanup_result['deleted_items'].append(f"vector_index_{vector_item['vector_id']}")

            logger.info(f"Deleted {len(vector_response.get('Items', []))} vector index entries for {notice_id}")
        except Exception as e:
            cleanup_result['errors'].append(f"Vector index deletion error: {str(e)}")
            logger.error(f"Failed to delete vector index for {notice_id}: {str(e)}")

        # 3. Delete S3 objects (JSON files and attachments)
        try:
            # Generate S3 key prefix based on posted_date
            if posted_date:
                try:
                    parsed_date = datetime.strptime(posted_date, '%Y-%m-%d')
                    date_prefix = parsed_date.strftime('%Y-%m-%d')
                except (ValueError, TypeError):
                    date_prefix = archive_date or 'unknown'
            else:
                date_prefix = archive_date or 'unknown'

            # Delete from all relevant buckets
            buckets_to_clean = [
                (RAW_DOCUMENTS_BUCKET, f"opportunities/{date_prefix}/{notice_id}/"),
                (PROCESSED_DOCUMENTS_BUCKET, f"opportunities/{date_prefix}/{notice_id}/"),
                (EMBEDDINGS_BUCKET, f"opportunities/{date_prefix}/{notice_id}/")
            ]

            for bucket_name, prefix in buckets_to_clean:
                deleted_count = delete_s3_objects_with_prefix(bucket_name, prefix)
                if deleted_count > 0:
                    cleanup_result['deleted_items'].append(f"s3_{bucket_name}_{deleted_count}_objects")
                    logger.info(f"Deleted {deleted_count} objects from s3://{bucket_name}/{prefix}")

        except Exception as e:
            cleanup_result['errors'].append(f"S3 deletion error: {str(e)}")
            logger.error(f"Failed to delete S3 objects for {notice_id}: {str(e)}")

        # Mark as failed if there were any errors
        if cleanup_result['errors']:
            cleanup_result['success'] = False

        return cleanup_result

    except Exception as e:
        logger.error(f"Unexpected error cleaning up {notice_id}: {str(e)}")
        return {
            'notice_id': notice_id,
            'success': False,
            'errors': [f"Unexpected error: {str(e)}"],
            'deleted_items': cleanup_result.get('deleted_items', [])
        }

def delete_s3_objects_with_prefix(bucket_name: str, prefix: str) -> int:
    """Delete all S3 objects with the given prefix."""
    try:
        deleted_count = 0

        # List objects with prefix
        paginator = s3_client.get_paginator('list_objects_v2')
        page_iterator = paginator.paginate(Bucket=bucket_name, Prefix=prefix)

        for page in page_iterator:
            objects = page.get('Contents', [])

            if objects:
                # Prepare delete request
                delete_request = {
                    'Objects': [{'Key': obj['Key']} for obj in objects]
                }

                # Delete objects
                s3_client.delete_objects(
                    Bucket=bucket_name,
                    Delete=delete_request
                )

                deleted_count += len(objects)
                logger.info(f"Deleted {len(objects)} objects from s3://{bucket_name}/{prefix}")

        return deleted_count

    except Exception as e:
        logger.error(f"Error deleting S3 objects from s3://{bucket_name}/{prefix}: {str(e)}")
        raise

def log_cleanup_action(opportunity: Dict[str, Any], result: Dict[str, Any]):
    """Log cleanup action for audit purposes."""
    try:
        # Create audit log entry
        audit_entry = {
            'action': 'retention_cleanup',
            'notice_id': opportunity['notice_id'],
            'archive_date': opportunity.get('archive_date', ''),
            'posted_date': opportunity.get('posted_date', ''),
            'title': opportunity.get('title', ''),
            'cleanup_timestamp': datetime.utcnow().isoformat(),
            'success': result['success'],
            'deleted_items': result.get('deleted_items', []),
            'errors': result.get('errors', [])
        }

        # Store in a simple audit log (could be enhanced to use a dedicated audit table)
        logger.info(f"AUDIT_LOG: {json.dumps(audit_entry)}")

    except Exception as e:
        logger.error(f"Failed to log cleanup action: {str(e)}")