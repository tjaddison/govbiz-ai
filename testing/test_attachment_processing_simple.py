#!/usr/bin/env python3
"""
Simple test for attachment processing and embedding generation.
This creates a test opportunity with a mock PDF attachment to validate the pipeline.
"""

import json
import boto3
import io
import base64
from datetime import datetime, timedelta
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# AWS clients
lambda_client = boto3.client('lambda')
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Environment configuration
TEMP_BUCKET = 'govbizai-temp-processing-927576824761-us-east-1'
PROCESSED_BUCKET = 'govbizai-processed-documents-927576824761-us-east-1'
EMBEDDINGS_BUCKET = 'govbizai-embeddings-927576824761-us-east-1'
OPPORTUNITIES_TABLE = 'govbizai-opportunities'

def create_test_pdf():
    """Create a test PDF with some content for text extraction testing."""
    buffer = io.BytesIO()

    # Create PDF with reportlab
    c = canvas.Canvas(buffer, pagesize=letter)
    c.drawString(100, 750, "TEST SOLICITATION DOCUMENT")
    c.drawString(100, 730, "Contract Number: TEST-123-2025")
    c.drawString(100, 700, "")
    c.drawString(100, 680, "STATEMENT OF WORK:")
    c.drawString(100, 660, "The contractor shall provide software development services")
    c.drawString(100, 640, "including but not limited to:")
    c.drawString(120, 620, "- Python programming and development")
    c.drawString(120, 600, "- AWS cloud infrastructure management")
    c.drawString(120, 580, "- Database design and optimization")
    c.drawString(120, 560, "- API development and integration")
    c.drawString(100, 530, "")
    c.drawString(100, 510, "TECHNICAL REQUIREMENTS:")
    c.drawString(120, 490, "- Minimum 5 years experience with Python")
    c.drawString(120, 470, "- AWS certifications preferred")
    c.drawString(120, 450, "- Experience with PostgreSQL databases")
    c.drawString(120, 430, "- RESTful API development experience")
    c.drawString(100, 400, "")
    c.drawString(100, 380, "CONTRACT PERIOD: 12 months with 2 option years")
    c.drawString(100, 360, "ESTIMATED VALUE: $500,000 - $750,000")
    c.drawString(100, 340, "")
    c.drawString(100, 320, "This is a test document for validating attachment processing")
    c.drawString(100, 300, "and text extraction in the GovBizAI system.")

    c.save()
    buffer.seek(0)
    return buffer.getvalue()

def upload_test_attachment(notice_id: str):
    """Upload a test PDF attachment to S3."""
    try:
        # Create test PDF
        pdf_content = create_test_pdf()

        # Upload to S3 in the expected location
        date_prefix = datetime.utcnow().strftime('%Y-%m-%d')
        s3_key = f"attachments/{date_prefix}/{notice_id}/test_solicitation.pdf"

        s3_client.put_object(
            Bucket=TEMP_BUCKET,
            Key=s3_key,
            Body=pdf_content,
            ContentType='application/pdf'
        )

        s3_uri = f"s3://{TEMP_BUCKET}/{s3_key}"
        logger.info(f"Uploaded test attachment to {s3_uri}")

        return {
            's3_location': s3_uri,
            'attachment': {
                'name': 'test_solicitation.pdf',
                'resourceId': 'test-resource-123',
                'sizeBytes': len(pdf_content)
            }
        }

    except Exception as e:
        logger.error(f"Failed to upload test attachment: {str(e)}")
        return None

def test_text_extraction():
    """Test the text extraction Lambda function directly."""
    logger.info("Testing text extraction function")

    # Create test data
    test_notice_id = f"TEST-NOTICE-{int(datetime.utcnow().timestamp())}"

    # Upload test attachment
    attachment_info = upload_test_attachment(test_notice_id)
    if not attachment_info:
        return {'success': False, 'error': 'Failed to upload test attachment'}

    try:
        # Call text extraction function
        response = lambda_client.invoke(
            FunctionName='govbizai-text-extraction',
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'operation': 'extract_text',
                'source_s3_uri': attachment_info['s3_location'],
                'notice_id': test_notice_id,
                'filename': 'test_solicitation.pdf',
                'attachment_metadata': attachment_info['attachment']
            })
        )

        result = json.loads(response['Payload'].read().decode('utf-8'))

        logger.info(f"Text extraction result: {json.dumps(result, indent=2, default=str)}")

        # Validate response
        if result.get('statusCode') == 200:
            body = json.loads(result['body'])
            text_length = body.get('text_length', 0)
            chunk_count = body.get('chunk_count', 0)

            return {
                'success': True,
                'notice_id': test_notice_id,
                'text_length': text_length,
                'chunk_count': chunk_count,
                'extraction_details': body,
                'attachment_info': attachment_info
            }
        else:
            return {
                'success': False,
                'error': result.get('body', 'Unknown error'),
                'notice_id': test_notice_id
            }

    except Exception as e:
        logger.error(f"Text extraction test failed: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'notice_id': test_notice_id
        }

def test_opportunity_processing():
    """Test the complete opportunity processing with attachment."""
    logger.info("Testing complete opportunity processing with attachment")

    test_notice_id = f"TEST-OPP-{int(datetime.utcnow().timestamp())}"

    # Create test opportunity data
    test_opportunity = {
        'NoticeId': test_notice_id,
        'Title': 'Test Software Development Services',
        'Description': 'This is a test opportunity for software development services including Python, AWS, and database work.',
        'Department': 'Department of Test',
        'Office': 'Test Office',
        'NaicsCode': '541511',
        'SetAside': 'Total Small Business',
        'PostedDate': datetime.utcnow().strftime('%Y-%m-%d'),
        'ResponseDeadLine': (datetime.utcnow() + timedelta(days=30)).strftime('%Y-%m-%d'),
        'ArchiveDate': (datetime.utcnow() + timedelta(days=60)).strftime('%Y-%m-%d'),
        'PopCity': 'Washington',
        'PopState': 'DC',
        'PopZip': '20001'
    }

    # Upload test attachment first
    attachment_info = upload_test_attachment(test_notice_id)
    if not attachment_info:
        return {'success': False, 'error': 'Failed to upload test attachment'}

    try:
        # Process through opportunity processor
        response = lambda_client.invoke(
            FunctionName='govbizai-opportunity-processor',
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'notice_id': test_notice_id,
                'opportunity_data': test_opportunity,
                'attachments': [attachment_info]
            })
        )

        result = json.loads(response['Payload'].read().decode('utf-8'))

        logger.info(f"Opportunity processing result: {json.dumps(result, indent=2, default=str)}")

        # Validate response
        if result.get('statusCode') == 200:
            body = json.loads(result['body'])

            # Check DynamoDB for the stored opportunity
            table = dynamodb.Table(OPPORTUNITIES_TABLE)
            db_response = table.get_item(Key={'notice_id': test_notice_id})

            if 'Item' in db_response:
                item = db_response['Item']
                has_attachments = 'attachments' in item and len(item['attachments']) > 0
                has_embeddings = 'embedding_metadata' in item
                has_chunk_embeddings = (
                    has_embeddings and
                    'attachment_chunk_embeddings' in item['embedding_metadata']
                )

                return {
                    'success': True,
                    'notice_id': test_notice_id,
                    'processing_details': body,
                    'dynamodb_validation': {
                        'found_in_db': True,
                        'has_attachments': has_attachments,
                        'attachment_count': len(item.get('attachments', [])),
                        'has_embeddings': has_embeddings,
                        'has_chunk_embeddings': has_chunk_embeddings,
                        'chunk_embeddings_count': len(item.get('embedding_metadata', {}).get('attachment_chunk_embeddings', [])),
                        'embedding_keys_count': len(item.get('embedding_metadata', {}).get('embedding_keys', []))
                    }
                }
            else:
                return {
                    'success': False,
                    'error': 'Opportunity not found in DynamoDB',
                    'notice_id': test_notice_id
                }
        else:
            return {
                'success': False,
                'error': result.get('body', 'Unknown error'),
                'notice_id': test_notice_id
            }

    except Exception as e:
        logger.error(f"Opportunity processing test failed: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'notice_id': test_notice_id
        }

def cleanup_test_data(test_ids: list):
    """Clean up test data from all storage locations."""
    logger.info(f"Cleaning up test data for IDs: {test_ids}")

    for test_id in test_ids:
        try:
            # Clean up DynamoDB
            table = dynamodb.Table(OPPORTUNITIES_TABLE)
            table.delete_item(Key={'notice_id': test_id})
            logger.info(f"Deleted {test_id} from DynamoDB")

            # Clean up S3 attachments
            date_prefix = datetime.utcnow().strftime('%Y-%m-%d')

            # Delete from temp bucket
            temp_prefix = f"attachments/{date_prefix}/{test_id}/"
            temp_response = s3_client.list_objects_v2(Bucket=TEMP_BUCKET, Prefix=temp_prefix)
            for obj in temp_response.get('Contents', []):
                s3_client.delete_object(Bucket=TEMP_BUCKET, Key=obj['Key'])
                logger.debug(f"Deleted temp file: {obj['Key']}")

            # Delete from processed bucket
            processed_prefix = f"extracted-text/{date_prefix}/{test_id}/"
            processed_response = s3_client.list_objects_v2(Bucket=PROCESSED_BUCKET, Prefix=processed_prefix)
            for obj in processed_response.get('Contents', []):
                s3_client.delete_object(Bucket=PROCESSED_BUCKET, Key=obj['Key'])
                logger.debug(f"Deleted processed file: {obj['Key']}")

            # Delete from embeddings bucket
            embeddings_prefixes = [
                f"opportunities/{date_prefix}/{test_id}/",
                f"chunk-embeddings/{date_prefix}/{test_id}/"
            ]
            for prefix in embeddings_prefixes:
                embeddings_response = s3_client.list_objects_v2(Bucket=EMBEDDINGS_BUCKET, Prefix=prefix)
                for obj in embeddings_response.get('Contents', []):
                    s3_client.delete_object(Bucket=EMBEDDINGS_BUCKET, Key=obj['Key'])
                    logger.debug(f"Deleted embedding file: {obj['Key']}")

        except Exception as e:
            logger.warning(f"Error cleaning up {test_id}: {str(e)}")

def main():
    """Run the attachment processing tests."""
    logger.info("Starting Attachment Processing Validation Tests")

    test_ids = []

    try:
        # Test 1: Direct text extraction
        logger.info("\n" + "="*60)
        logger.info("TEST 1: Direct Text Extraction")
        logger.info("="*60)

        text_extraction_result = test_text_extraction()
        if text_extraction_result.get('success'):
            test_ids.append(text_extraction_result['notice_id'])
            logger.info("✅ Text extraction test PASSED")
        else:
            logger.error(f"❌ Text extraction test FAILED: {text_extraction_result.get('error')}")

        # Test 2: Complete opportunity processing
        logger.info("\n" + "="*60)
        logger.info("TEST 2: Complete Opportunity Processing")
        logger.info("="*60)

        opportunity_processing_result = test_opportunity_processing()
        if opportunity_processing_result.get('success'):
            test_ids.append(opportunity_processing_result['notice_id'])
            logger.info("✅ Opportunity processing test PASSED")
        else:
            logger.error(f"❌ Opportunity processing test FAILED: {opportunity_processing_result.get('error')}")

        # Summary
        logger.info("\n" + "="*80)
        logger.info("ATTACHMENT PROCESSING VALIDATION SUMMARY")
        logger.info("="*80)

        results = {
            'text_extraction_test': text_extraction_result,
            'opportunity_processing_test': opportunity_processing_result,
            'overall_success': (
                text_extraction_result.get('success', False) and
                opportunity_processing_result.get('success', False)
            )
        }

        print(json.dumps(results, indent=2, default=str))

        if results['overall_success']:
            logger.info("🎉 ALL TESTS PASSED! Attachment processing is working correctly!")
            return 0
        else:
            logger.error("💥 SOME TESTS FAILED! Check the results above.")
            return 1

    except Exception as e:
        logger.error(f"Test execution failed: {str(e)}")
        return 1
    finally:
        # Always clean up test data
        if test_ids:
            cleanup_test_data(test_ids)

if __name__ == '__main__':
    exit(main())