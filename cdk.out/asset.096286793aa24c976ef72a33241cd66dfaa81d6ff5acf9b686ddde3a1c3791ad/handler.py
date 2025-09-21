import json
import boto3
import logging
import os
from datetime import datetime
from typing import Dict, List, Any, Optional

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
lambda_client = boto3.client('lambda')
stepfunctions_client = boto3.client('stepfunctions')

# Environment variables
CSV_PROCESSOR_FUNCTION = os.environ['CSV_PROCESSOR_FUNCTION']
API_CLIENT_FUNCTION = os.environ['API_CLIENT_FUNCTION']
ATTACHMENT_DOWNLOADER_FUNCTION = os.environ['ATTACHMENT_DOWNLOADER_FUNCTION']
OPPORTUNITY_PROCESSOR_FUNCTION = os.environ['OPPORTUNITY_PROCESSOR_FUNCTION']

def lambda_handler(event, context):
    """
    Main orchestrator for SAM.gov nightly processing.

    This function can be invoked directly or as part of a Step Functions workflow.

    Event structure:
    {
        "operation": "full_process" | "process_csv" | "process_opportunity",
        "opportunity_data": {...},  # For single opportunity processing
        "max_opportunities": 100,   # Optional limit for testing
        "skip_attachments": false   # Optional flag to skip attachment downloads
    }
    """
    try:
        logger.info(f"Starting SAM.gov orchestration: {json.dumps(event, default=str)}")

        operation = event.get('operation', 'full_process')

        if operation == 'full_process':
            return handle_full_process(event)
        elif operation == 'process_csv':
            return handle_csv_processing(event)
        elif operation == 'process_opportunity':
            return handle_single_opportunity(event)
        else:
            raise ValueError(f"Unsupported operation: {operation}")

    except Exception as e:
        logger.error(f"Orchestration error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Orchestration failed',
                'message': str(e),
                'operation': event.get('operation', 'unknown')
            })
        }

def handle_full_process(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle the full nightly processing workflow."""
    logger.info("Starting full SAM.gov processing workflow")

    try:
        # Step 1: Process CSV file
        logger.info("Step 1: Processing CSV file")
        csv_result = invoke_csv_processor()

        if csv_result.get('statusCode') != 200:
            raise Exception(f"CSV processing failed: {csv_result}")

        csv_body = json.loads(csv_result['body'])
        opportunities_found = csv_body.get('opportunities_found', 0)
        opportunities_queued = csv_body.get('opportunities_queued', 0)

        logger.info(f"CSV processing complete: {opportunities_found} found, {opportunities_queued} queued")

        if opportunities_found == 0:
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'No new opportunities found',
                    'opportunities_processed': 0,
                    'workflow_status': 'completed_no_work'
                })
            }

        # Step 2: For full processing, we would typically trigger Step Functions
        # or process opportunities in batches. For now, we'll return success.

        logger.info("Full processing workflow initiated successfully")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Full processing workflow completed',
                'opportunities_found': opportunities_found,
                'opportunities_queued': opportunities_queued,
                'workflow_status': 'completed',
                'next_steps': 'Opportunities queued for distributed processing'
            })
        }

    except Exception as e:
        logger.error(f"Full process workflow error: {str(e)}")
        raise

def handle_csv_processing(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle CSV processing only."""
    logger.info("Processing CSV file only")

    try:
        result = invoke_csv_processor()

        if result.get('statusCode') == 200:
            body = json.loads(result['body'])
            logger.info(f"CSV processing successful: {body.get('opportunities_found', 0)} opportunities found")

        return result

    except Exception as e:
        logger.error(f"CSV processing error: {str(e)}")
        raise

def handle_single_opportunity(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle processing of a single opportunity."""
    logger.info("Processing single opportunity")

    try:
        opportunity_data = event.get('opportunity_data')
        if not opportunity_data:
            raise ValueError("Missing opportunity_data for single opportunity processing")

        notice_id = opportunity_data.get('NoticeId')
        if not notice_id:
            raise ValueError("Missing NoticeId in opportunity_data")

        skip_attachments = event.get('skip_attachments', False)

        logger.info(f"Processing opportunity: {notice_id}")

        # Step 1: Process the opportunity (generate embeddings, store in DynamoDB)
        logger.info(f"Step 1: Processing opportunity data for {notice_id}")

        process_result = invoke_opportunity_processor({
            'notice_id': notice_id,
            'opportunity_data': opportunity_data
        })

        if process_result.get('statusCode') != 200:
            raise Exception(f"Opportunity processing failed: {process_result}")

        process_body = json.loads(process_result['body'])
        logger.info(f"Opportunity processing successful: {process_body.get('processing_status')}")

        # Step 2: Download attachments (if not skipped)
        attachment_result = None
        if not skip_attachments:
            logger.info(f"Step 2: Downloading attachments for {notice_id}")

            attachment_result = invoke_attachment_downloader({
                'notice_id': notice_id,
                'opportunity_data': opportunity_data
            })

            if attachment_result.get('statusCode') != 200:
                logger.warning(f"Attachment download failed for {notice_id}: {attachment_result}")
                # Don't fail the whole process for attachment issues
                attachment_result = None

        # Prepare final result
        result = {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Single opportunity processing completed',
                'notice_id': notice_id,
                'title': opportunity_data.get('Title', 'Unknown'),
                'opportunity_processed': True,
                'attachments_processed': attachment_result is not None,
                'processing_details': {
                    'opportunity_result': process_body,
                    'attachment_result': json.loads(attachment_result['body']) if attachment_result else None
                }
            })
        }

        logger.info(f"Single opportunity processing completed for {notice_id}")
        return result

    except Exception as e:
        logger.error(f"Single opportunity processing error: {str(e)}")
        raise

def invoke_csv_processor() -> Dict[str, Any]:
    """Invoke the CSV processor function."""
    logger.info("Invoking CSV processor function")

    try:
        response = lambda_client.invoke(
            FunctionName=CSV_PROCESSOR_FUNCTION,
            InvocationType='RequestResponse',
            Payload=json.dumps({})
        )

        result = json.loads(response['Payload'].read().decode('utf-8'))
        logger.info("CSV processor invocation completed")

        return result

    except Exception as e:
        logger.error(f"Failed to invoke CSV processor: {str(e)}")
        raise

def invoke_opportunity_processor(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Invoke the opportunity processor function."""
    logger.info(f"Invoking opportunity processor for {payload.get('notice_id')}")

    try:
        response = lambda_client.invoke(
            FunctionName=OPPORTUNITY_PROCESSOR_FUNCTION,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        result = json.loads(response['Payload'].read().decode('utf-8'))
        logger.info(f"Opportunity processor invocation completed for {payload.get('notice_id')}")

        return result

    except Exception as e:
        logger.error(f"Failed to invoke opportunity processor: {str(e)}")
        raise

def invoke_attachment_downloader(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Invoke the attachment downloader function."""
    logger.info(f"Invoking attachment downloader for {payload.get('notice_id')}")

    try:
        response = lambda_client.invoke(
            FunctionName=ATTACHMENT_DOWNLOADER_FUNCTION,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        result = json.loads(response['Payload'].read().decode('utf-8'))
        logger.info(f"Attachment downloader invocation completed for {payload.get('notice_id')}")

        return result

    except Exception as e:
        logger.error(f"Failed to invoke attachment downloader: {str(e)}")
        raise

def process_opportunities_batch(opportunities: List[Dict[str, Any]],
                              skip_attachments: bool = False) -> Dict[str, Any]:
    """Process a batch of opportunities."""
    logger.info(f"Processing batch of {len(opportunities)} opportunities")

    successful = 0
    failed = 0
    results = []

    for opportunity in opportunities:
        try:
            notice_id = opportunity.get('NoticeId')
            logger.info(f"Processing opportunity {notice_id} in batch")

            result = handle_single_opportunity({
                'operation': 'process_opportunity',
                'opportunity_data': opportunity,
                'skip_attachments': skip_attachments
            })

            if result.get('statusCode') == 200:
                successful += 1
            else:
                failed += 1

            results.append({
                'notice_id': notice_id,
                'status': 'success' if result.get('statusCode') == 200 else 'failed',
                'result': result
            })

        except Exception as e:
            failed += 1
            logger.error(f"Failed to process opportunity {opportunity.get('NoticeId', 'unknown')}: {str(e)}")
            results.append({
                'notice_id': opportunity.get('NoticeId', 'unknown'),
                'status': 'failed',
                'error': str(e)
            })

    logger.info(f"Batch processing completed: {successful} successful, {failed} failed")

    return {
        'successful': successful,
        'failed': failed,
        'total': len(opportunities),
        'results': results
    }

def create_processing_report(workflow_results: Dict[str, Any]) -> str:
    """Create a processing report and store it in S3."""
    try:
        from datetime import datetime

        report = {
            'processing_date': datetime.utcnow().isoformat(),
            'workflow_type': 'samgov_nightly_processing',
            'results': workflow_results,
            'summary': {
                'total_opportunities': workflow_results.get('opportunities_found', 0),
                'queued_for_processing': workflow_results.get('opportunities_queued', 0),
                'status': workflow_results.get('workflow_status', 'unknown')
            }
        }

        logger.info(f"Created processing report: {report['summary']}")

        # In a full implementation, we would store this report in S3
        # For now, we'll just return the report content
        return json.dumps(report, indent=2)

    except Exception as e:
        logger.error(f"Failed to create processing report: {str(e)}")
        return f"Failed to create report: {str(e)}"