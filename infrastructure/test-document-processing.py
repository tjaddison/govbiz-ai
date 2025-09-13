#!/usr/bin/env python3
"""
Test script for Phase 3: Document Processing Pipeline
Tests the document processing Lambda functions
"""

import json
import boto3
import logging
from typing import Dict, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# AWS clients
lambda_client = boto3.client('lambda')
s3_client = boto3.client('s3')

# Test configuration
TEST_TENANT_ID = 'test-tenant-123'
TEST_BUCKET = 'govbizai-processed-documents-927576824761-us-east-1'

def test_lambda_function(function_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Test a Lambda function with given payload"""
    try:
        logger.info(f"Testing Lambda function: {function_name}")

        response = lambda_client.invoke(
            FunctionName=function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )

        result = json.loads(response['Payload'].read())

        logger.info(f"Response status: {response['StatusCode']}")
        logger.info(f"Response: {json.dumps(result, indent=2)}")

        return result

    except Exception as e:
        logger.error(f"Error testing {function_name}: {str(e)}")
        return {'error': str(e)}


def test_text_cleaner():
    """Test the text cleaner function"""
    logger.info("=== Testing Text Cleaner Function ===")

    # Create a sample processed document in S3 for testing
    sample_doc = {
        'tenant_id': TEST_TENANT_ID,
        'full_text': '''
        This is a sample document with    excessive    whitespace.



        It contains multiple line breaks and formatting issues.

        Page 1 of 50

        SECTION 1: INTRODUCTION

        This document describes the requirements...
        ''',
        'processing_type': 'test'
    }

    # Upload test document
    test_key = f'test/sample_document.json'
    try:
        s3_client.put_object(
            Bucket=TEST_BUCKET,
            Key=test_key,
            Body=json.dumps(sample_doc),
            ContentType='application/json'
        )
        logger.info(f"Uploaded test document to s3://{TEST_BUCKET}/{test_key}")
    except Exception as e:
        logger.error(f"Failed to upload test document: {str(e)}")
        return

    # Test text cleaner
    payload = {
        'bucket': TEST_BUCKET,
        'key': test_key,
        'tenant_id': TEST_TENANT_ID,
        'cleaning_level': 'basic',
        'preserve_formatting': False
    }

    result = test_lambda_function('govbizai-text-cleaner', payload)

    # Clean up
    try:
        s3_client.delete_object(Bucket=TEST_BUCKET, Key=test_key)
        logger.info("Cleaned up test document")
    except Exception as e:
        logger.warning(f"Failed to clean up test document: {str(e)}")

    return result


def test_document_chunker():
    """Test the document chunker function"""
    logger.info("=== Testing Document Chunker Function ===")

    # Create a sample cleaned document
    sample_doc = {
        'tenant_id': TEST_TENANT_ID,
        'cleaned_text': '''
        This is a sample document for testing the chunking functionality.

        SECTION 1: INTRODUCTION

        This section introduces the main concepts and provides background information.
        It contains several sentences to demonstrate the chunking process.
        The chunking algorithm should split this text into manageable segments.

        SECTION 2: TECHNICAL DETAILS

        This section provides technical details about the implementation.
        It includes various technical terms and specifications.
        The content should be chunked while preserving context and meaning.
        ''',
        'processing_type': 'text_cleaning'
    }

    # Upload test document
    test_key = f'test/cleaned_document.json'
    try:
        s3_client.put_object(
            Bucket=TEST_BUCKET,
            Key=test_key,
            Body=json.dumps(sample_doc),
            ContentType='application/json'
        )
        logger.info(f"Uploaded test document to s3://{TEST_BUCKET}/{test_key}")
    except Exception as e:
        logger.error(f"Failed to upload test document: {str(e)}")
        return

    # Test document chunker
    payload = {
        'bucket': TEST_BUCKET,
        'key': test_key,
        'tenant_id': TEST_TENANT_ID,
        'chunking_strategy': 'semantic',
        'chunk_size': 500,
        'overlap': 100
    }

    result = test_lambda_function('govbizai-document-chunker', payload)

    # Clean up
    try:
        s3_client.delete_object(Bucket=TEST_BUCKET, Key=test_key)
        logger.info("Cleaned up test document")
    except Exception as e:
        logger.warning(f"Failed to clean up test document: {str(e)}")

    return result


def test_unified_processor():
    """Test the unified processor orchestrator"""
    logger.info("=== Testing Unified Processor Function ===")

    # Test with a simple text file
    payload = {
        'action': 'process_document',
        'bucket': 'govbizai-raw-documents-927576824761-us-east-1',
        'key': 'test/sample.txt',  # Would need to exist for real test
        'tenant_id': TEST_TENANT_ID,
        'processing_options': {
            'cleaning_level': 'basic',
            'chunking_strategy': 'semantic',
            'chunk_size': 1000,
            'overlap': 200
        }
    }

    # Note: This test would fail without an actual file, but tests the function exists
    result = test_lambda_function('govbizai-unified-processor', payload)

    return result


def check_lambda_functions():
    """Check if all Lambda functions are deployed and accessible"""
    logger.info("=== Checking Lambda Function Deployment ===")

    functions = [
        'govbizai-text-extraction',
        'govbizai-textract-processor',
        'govbizai-text-cleaner',
        'govbizai-document-chunker',
        'govbizai-file-handlers',
        'govbizai-unified-processor'
    ]

    for function_name in functions:
        try:
            response = lambda_client.get_function(FunctionName=function_name)
            state = response['Configuration']['State']
            logger.info(f"✓ {function_name}: {state}")
        except Exception as e:
            logger.error(f"✗ {function_name}: {str(e)}")


def main():
    """Main test function"""
    logger.info("Starting Phase 3 Document Processing Pipeline Tests")

    # Check function deployment
    check_lambda_functions()

    # Test individual functions
    test_text_cleaner()
    test_document_chunker()

    # Test orchestrator (will fail without file but tests function exists)
    test_unified_processor()

    logger.info("Phase 3 tests completed!")


if __name__ == '__main__':
    main()