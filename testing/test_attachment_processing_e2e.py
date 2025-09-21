#!/usr/bin/env python3
"""
End-to-end test for attachment processing and embedding generation.

This test verifies that:
1. Real SAM.gov opportunities with attachments are downloaded
2. Attachments are processed for text extraction
3. Text content is embedded
4. Opportunity processing includes attachment content
5. The complete matching pipeline works with attachment data

IMPORTANT: This is a production test - clean up test data when complete.
"""

import json
import boto3
import time
import os
from datetime import datetime, timedelta
from typing import Dict, Any, List
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# AWS clients
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# Environment configuration
AWS_REGION = 'us-east-1'
OPPORTUNITIES_TABLE = 'govbizai-opportunities'
TEMP_BUCKET = 'govbizai-temp-processing'
PROCESSED_BUCKET = 'govbizai-processed-documents'
EMBEDDINGS_BUCKET = 'govbizai-embeddings'

# Lambda function names
SAMGOV_ORCHESTRATOR = 'govbizai-samgov-orchestrator'
TEXT_EXTRACTION_FUNCTION = 'govbizai-text-extraction'
OPPORTUNITY_PROCESSOR = 'govbizai-opportunity-processor'

class AttachmentProcessingE2ETest:
    """End-to-end test for attachment processing functionality."""

    def __init__(self):
        self.test_run_id = f"e2e_test_{int(datetime.utcnow().timestamp())}"
        self.test_opportunities = []
        self.cleanup_items = []

    def run_complete_test(self):
        """Run the complete end-to-end test."""
        logger.info(f"Starting E2E test for attachment processing: {self.test_run_id}")

        try:
            # Step 1: Find a real opportunity with attachments
            logger.info("Step 1: Finding real SAM.gov opportunity with attachments")
            test_opportunity = self.find_opportunity_with_attachments()

            if not test_opportunity:
                logger.error("No opportunity with attachments found - skipping test")
                return False

            # Step 2: Process the opportunity through the complete pipeline
            logger.info(f"Step 2: Processing opportunity {test_opportunity['notice_id']} through pipeline")
            processing_result = self.process_opportunity_complete(test_opportunity)

            # Step 3: Validate attachment download and storage
            logger.info("Step 3: Validating attachment download and storage")
            attachment_validation = self.validate_attachment_download(test_opportunity['notice_id'])

            # Step 4: Validate text extraction
            logger.info("Step 4: Validating text extraction from attachments")
            text_extraction_validation = self.validate_text_extraction(test_opportunity['notice_id'])

            # Step 5: Validate embedding generation
            logger.info("Step 5: Validating embedding generation")
            embedding_validation = self.validate_embedding_generation(test_opportunity['notice_id'])

            # Step 6: Validate DynamoDB storage
            logger.info("Step 6: Validating DynamoDB storage with attachment data")
            dynamodb_validation = self.validate_dynamodb_storage(test_opportunity['notice_id'])

            # Step 7: Validate search functionality with attachment content
            logger.info("Step 7: Validating search functionality with attachment content")
            search_validation = self.validate_search_functionality(test_opportunity['notice_id'])

            # Compile results
            results = {
                'test_run_id': self.test_run_id,
                'opportunity_id': test_opportunity['notice_id'],
                'processing_result': processing_result,
                'attachment_download': attachment_validation,
                'text_extraction': text_extraction_validation,
                'embedding_generation': embedding_validation,
                'dynamodb_storage': dynamodb_validation,
                'search_functionality': search_validation,
                'overall_success': all([
                    processing_result.get('success', False),
                    attachment_validation.get('success', False),
                    text_extraction_validation.get('success', False),
                    embedding_validation.get('success', False),
                    dynamodb_validation.get('success', False),
                    search_validation.get('success', False)
                ])
            }

            logger.info(f"E2E Test Results: {json.dumps(results, indent=2, default=str)}")

            return results

        except Exception as e:
            logger.error(f"E2E test failed: {str(e)}")
            return {
                'test_run_id': self.test_run_id,
                'error': str(e),
                'overall_success': False
            }
        finally:
            # Always clean up test data
            logger.info("Cleaning up test data")
            self.cleanup_test_data()

    def find_opportunity_with_attachments(self) -> Dict[str, Any]:
        """Find a real SAM.gov opportunity that has attachments."""
        try:
            # Use the CSV processor to get recent opportunities
            response = lambda_client.invoke(
                FunctionName='govbizai-csv-processor',
                InvocationType='RequestResponse',
                Payload=json.dumps({
                    'operation': 'test_mode',
                    'max_opportunities': 50,  # Check more opportunities to find one with attachments
                    'test_mode': True
                })
            )

            result = json.loads(response['Payload'].read().decode('utf-8'))
            if result.get('statusCode') != 200:
                logger.error(f"CSV processor failed: {result}")
                return None

            body = json.loads(result['body'])
            opportunities = body.get('opportunities', [])

            logger.info(f"Found {len(opportunities)} recent opportunities")

            # Check each opportunity for attachments
            for opp in opportunities:
                notice_id = opp.get('NoticeId')
                if not notice_id:
                    continue

                # Check if this opportunity has attachments
                attachments = self.get_opportunity_attachments(notice_id)
                if attachments and len(attachments) > 0:
                    logger.info(f"Found opportunity {notice_id} with {len(attachments)} attachments")
                    opp['attachments'] = attachments
                    return {
                        'notice_id': notice_id,
                        'opportunity_data': opp,
                        'attachments': attachments
                    }

            logger.warning("No opportunities with attachments found in recent data")
            return None

        except Exception as e:
            logger.error(f"Error finding opportunity with attachments: {str(e)}")
            return None

    def get_opportunity_attachments(self, notice_id: str) -> List[Dict[str, Any]]:
        """Get attachments for a specific opportunity."""
        try:
            response = lambda_client.invoke(
                FunctionName='govbizai-samgov-api-client',
                InvocationType='RequestResponse',
                Payload=json.dumps({
                    'operation': 'get_attachments',
                    'notice_id': notice_id
                })
            )

            result = json.loads(response['Payload'].read().decode('utf-8'))
            if result.get('statusCode') != 200:
                return []

            body = json.loads(result['body'])
            return body.get('attachments', [])

        except Exception as e:
            logger.warning(f"Error getting attachments for {notice_id}: {str(e)}")
            return []

    def process_opportunity_complete(self, test_opportunity: Dict[str, Any]) -> Dict[str, Any]:
        """Process the opportunity through the complete pipeline."""
        try:
            notice_id = test_opportunity['notice_id']
            opportunity_data = test_opportunity['opportunity_data']

            # Use the orchestrator to process the single opportunity
            response = lambda_client.invoke(
                FunctionName=SAMGOV_ORCHESTRATOR,
                InvocationType='RequestResponse',
                Payload=json.dumps({
                    'operation': 'process_opportunity',
                    'opportunity_data': opportunity_data,
                    'skip_attachments': False  # Ensure attachments are processed
                })
            )

            result = json.loads(response['Payload'].read().decode('utf-8'))

            # Track for cleanup
            self.cleanup_items.append({
                'type': 'opportunity',
                'notice_id': notice_id
            })

            return {
                'success': result.get('statusCode') == 200,
                'result': result,
                'notice_id': notice_id
            }

        except Exception as e:
            logger.error(f"Error processing opportunity: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def validate_attachment_download(self, notice_id: str) -> Dict[str, Any]:
        """Validate that attachments were downloaded and stored in S3."""
        try:
            # List objects in temp bucket for this opportunity
            date_prefix = datetime.utcnow().strftime('%Y-%m-%d')
            prefix = f"attachments/{date_prefix}/{notice_id}/"

            response = s3_client.list_objects_v2(
                Bucket=TEMP_BUCKET,
                Prefix=prefix
            )

            attachments = response.get('Contents', [])

            # Track for cleanup
            for attachment in attachments:
                self.cleanup_items.append({
                    'type': 's3_object',
                    'bucket': TEMP_BUCKET,
                    'key': attachment['Key']
                })

            return {
                'success': len(attachments) > 0,
                'attachment_count': len(attachments),
                'attachments': [{'key': obj['Key'], 'size': obj['Size']} for obj in attachments]
            }

        except Exception as e:
            logger.error(f"Error validating attachment download: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def validate_text_extraction(self, notice_id: str) -> Dict[str, Any]:
        """Validate that text extraction was performed on attachments."""
        try:
            # Check for extracted text files in processed bucket
            date_prefix = datetime.utcnow().strftime('%Y-%m-%d')
            prefix = f"extracted-text/{date_prefix}/{notice_id}/"

            response = s3_client.list_objects_v2(
                Bucket=PROCESSED_BUCKET,
                Prefix=prefix
            )

            extracted_files = response.get('Contents', [])

            # Examine one of the extracted files for content
            text_content_sample = None
            if extracted_files:
                # Get the first full_text file
                for file in extracted_files:
                    if 'full_text_' in file['Key']:
                        obj_response = s3_client.get_object(
                            Bucket=PROCESSED_BUCKET,
                            Key=file['Key']
                        )
                        text_data = json.loads(obj_response['Body'].read().decode('utf-8'))
                        text_content = text_data.get('text_content', {}).get('full_text', '')
                        text_content_sample = text_content[:500] if text_content else None
                        break

            # Track for cleanup
            for file in extracted_files:
                self.cleanup_items.append({
                    'type': 's3_object',
                    'bucket': PROCESSED_BUCKET,
                    'key': file['Key']
                })

            return {
                'success': len(extracted_files) > 0 and text_content_sample is not None,
                'extracted_files_count': len(extracted_files),
                'text_sample_length': len(text_content_sample) if text_content_sample else 0,
                'text_sample': text_content_sample
            }

        except Exception as e:
            logger.error(f"Error validating text extraction: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def validate_embedding_generation(self, notice_id: str) -> Dict[str, Any]:
        """Validate that embeddings were generated for opportunity and attachments."""
        try:
            # Check for embeddings in embeddings bucket
            date_prefix = datetime.utcnow().strftime('%Y-%m-%d')

            # Check main opportunity embeddings
            opportunity_prefix = f"opportunities/{date_prefix}/{notice_id}/"
            opp_response = s3_client.list_objects_v2(
                Bucket=EMBEDDINGS_BUCKET,
                Prefix=opportunity_prefix
            )

            # Check chunk embeddings
            chunk_prefix = f"chunk-embeddings/{date_prefix}/{notice_id}/"
            chunk_response = s3_client.list_objects_v2(
                Bucket=EMBEDDINGS_BUCKET,
                Prefix=chunk_prefix
            )

            opportunity_embeddings = opp_response.get('Contents', [])
            chunk_embeddings = chunk_response.get('Contents', [])

            # Validate one embedding file
            embedding_validation = None
            if opportunity_embeddings:
                obj_response = s3_client.get_object(
                    Bucket=EMBEDDINGS_BUCKET,
                    Key=opportunity_embeddings[0]['Key']
                )
                embedding_data = json.loads(obj_response['Body'].read().decode('utf-8'))
                embedding_vector = embedding_data.get('embedding_vector', [])
                embedding_validation = {
                    'dimensions': len(embedding_vector),
                    'sample_values': embedding_vector[:5] if embedding_vector else []
                }

            # Track for cleanup
            all_embeddings = opportunity_embeddings + chunk_embeddings
            for embedding in all_embeddings:
                self.cleanup_items.append({
                    'type': 's3_object',
                    'bucket': EMBEDDINGS_BUCKET,
                    'key': embedding['Key']
                })

            return {
                'success': len(opportunity_embeddings) > 0,
                'opportunity_embeddings_count': len(opportunity_embeddings),
                'chunk_embeddings_count': len(chunk_embeddings),
                'total_embeddings': len(all_embeddings),
                'embedding_validation': embedding_validation
            }

        except Exception as e:
            logger.error(f"Error validating embedding generation: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def validate_dynamodb_storage(self, notice_id: str) -> Dict[str, Any]:
        """Validate that opportunity was stored in DynamoDB with attachment metadata."""
        try:
            table = dynamodb.Table(OPPORTUNITIES_TABLE)

            response = table.get_item(
                Key={'notice_id': notice_id}
            )

            if 'Item' not in response:
                return {
                    'success': False,
                    'error': 'Opportunity not found in DynamoDB'
                }

            item = response['Item']

            # Track for cleanup
            self.cleanup_items.append({
                'type': 'dynamodb_item',
                'table': OPPORTUNITIES_TABLE,
                'key': {'notice_id': notice_id}
            })

            # Validate attachment information is present
            has_attachments = 'attachments' in item and len(item['attachments']) > 0
            has_embedding_metadata = 'embedding_metadata' in item
            has_chunk_embeddings = (
                has_embedding_metadata and
                'attachment_chunk_embeddings' in item['embedding_metadata']
            )

            return {
                'success': has_attachments and has_embedding_metadata,
                'has_attachments': has_attachments,
                'attachment_count': len(item.get('attachments', [])),
                'has_embedding_metadata': has_embedding_metadata,
                'has_chunk_embeddings': has_chunk_embeddings,
                'chunk_embeddings_count': len(item.get('embedding_metadata', {}).get('attachment_chunk_embeddings', [])),
                'processing_status': item.get('processing_status', 'unknown')
            }

        except Exception as e:
            logger.error(f"Error validating DynamoDB storage: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def validate_search_functionality(self, notice_id: str) -> Dict[str, Any]:
        """Validate that search functionality works with attachment content."""
        try:
            # Try searching for content that should be in the attachments
            # This is a basic validation - in a real test, we'd use more specific terms

            response = lambda_client.invoke(
                FunctionName='govbizai-semantic-search',
                InvocationType='RequestResponse',
                Payload=json.dumps({
                    'query': 'requirements specifications',
                    'entity_type': 'opportunities',
                    'limit': 10,
                    'notice_id_filter': notice_id  # Search only our test opportunity
                })
            )

            result = json.loads(response['Payload'].read().decode('utf-8'))

            if result.get('statusCode') != 200:
                return {
                    'success': False,
                    'error': f"Search function returned {result.get('statusCode')}"
                }

            body = json.loads(result['body'])
            results = body.get('results', [])

            # Check if our opportunity appears in search results
            found_opportunity = any(
                res.get('notice_id') == notice_id
                for res in results
            )

            return {
                'success': found_opportunity,
                'search_results_count': len(results),
                'found_test_opportunity': found_opportunity,
                'sample_scores': [res.get('score', 0) for res in results[:3]]
            }

        except Exception as e:
            logger.error(f"Error validating search functionality: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def cleanup_test_data(self):
        """Clean up all test data created during the test."""
        logger.info(f"Cleaning up {len(self.cleanup_items)} test items")

        for item in self.cleanup_items:
            try:
                if item['type'] == 'opportunity':
                    # Remove from DynamoDB
                    table = dynamodb.Table(OPPORTUNITIES_TABLE)
                    table.delete_item(Key={'notice_id': item['notice_id']})
                    logger.info(f"Deleted opportunity {item['notice_id']} from DynamoDB")

                elif item['type'] == 's3_object':
                    # Remove from S3
                    s3_client.delete_object(
                        Bucket=item['bucket'],
                        Key=item['key']
                    )
                    logger.debug(f"Deleted S3 object s3://{item['bucket']}/{item['key']}")

                elif item['type'] == 'dynamodb_item':
                    # Remove from DynamoDB
                    table = dynamodb.Table(item['table'])
                    table.delete_item(Key=item['key'])
                    logger.info(f"Deleted item {item['key']} from {item['table']}")

            except Exception as e:
                logger.warning(f"Failed to cleanup item {item}: {str(e)}")

def main():
    """Run the end-to-end test."""
    test = AttachmentProcessingE2ETest()
    results = test.run_complete_test()

    print("\n" + "="*80)
    print("ATTACHMENT PROCESSING E2E TEST RESULTS")
    print("="*80)
    print(json.dumps(results, indent=2, default=str))
    print("="*80)

    if results.get('overall_success'):
        print("✅ ALL TESTS PASSED - Attachment processing is working correctly!")
        return 0
    else:
        print("❌ SOME TESTS FAILED - Check the results above for details")
        return 1

if __name__ == '__main__':
    exit(main())