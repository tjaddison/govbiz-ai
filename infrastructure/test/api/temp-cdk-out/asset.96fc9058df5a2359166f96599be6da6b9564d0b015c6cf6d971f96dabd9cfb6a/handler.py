"""
Text Cleaning Lambda Function for GovBizAI
Cleans and normalizes extracted text from various document sources
Removes artifacts, normalizes whitespace, and performs text preprocessing
"""

import json
import logging
import boto3
import re
from botocore.exceptions import ClientError
from typing import Dict, Any, List, Optional, Tuple
import os
import unicodedata
import html
from document_utils import (
    setup_logging, create_response, generate_correlation_id,
    validate_tenant_access, extract_metadata_from_s3_key,
    clean_extracted_text, create_processing_metadata
)

# Initialize AWS clients
s3_client = boto3.client('s3')

# Environment variables
PROCESSED_DOCUMENTS_BUCKET = os.environ['PROCESSED_DOCUMENTS_BUCKET']

# Setup logging
setup_logging('text-cleaner')
logger = logging.getLogger(__name__)

# Text cleaning patterns
CLEANING_PATTERNS = {
    # Remove common document artifacts
    'page_numbers': [
        r'\\bPage\\s+\\d+\\s+of\\s+\\d+\\b',
        r'\\b\\d+\\s+of\\s+\\d+\\b',
        r'^\\s*\\d+\\s*$',  # Standalone numbers on lines
    ],

    # Remove headers/footers patterns
    'headers_footers': [
        r'^.*?confidential.*?$',
        r'^.*?proprietary.*?$',
        r'^.*?copyright.*?$',
        r'^.*?\\(c\\).*?$',
    ],

    # Remove excessive whitespace
    'whitespace': [
        r'\\s{3,}',  # 3+ spaces
        r'\\t{2,}',  # Multiple tabs
        r'\\n{4,}',  # 4+ newlines
    ],

    # Remove common OCR artifacts
    'ocr_artifacts': [
        r'[|]{2,}',  # Multiple vertical bars
        r'[-]{5,}',  # Multiple dashes
        r'[_]{3,}',  # Multiple underscores
        r'\\s+[\\.,;:!\\?]\\s+',  # Spaced punctuation
    ],

    # Fix common spacing issues
    'spacing_fixes': [
        (r'([a-z])([A-Z])', r'\\1 \\2'),  # camelCase to spaced
        (r'([\\.])(\\w)', r'\\1 \\2'),    # Period without space
        (r'(\\w)([\\(\\)])', r'\\1 \\2'), # Parentheses without space
    ]
}

# Common boilerplate patterns to remove
BOILERPLATE_PATTERNS = [
    r'this page intentionally left blank',
    r'continued on next page',
    r'end of page',
    r'begin page',
    r'\\[page break\\]',
    r'\\[end of document\\]',
    r'document continues',
]


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main handler for text cleaning

    Expected event structure:
    {
        "bucket": "bucket-name",
        "key": "processed-file-key",
        "tenant_id": "tenant-uuid",
        "cleaning_level": "basic" | "aggressive",
        "preserve_formatting": true/false
    }
    """
    correlation_id = generate_correlation_id()
    logger.info(f"Starting text cleaning - Correlation ID: {correlation_id}")

    try:
        # Parse event parameters
        bucket = event['bucket']
        key = event['key']
        tenant_id = event['tenant_id']
        cleaning_level = event.get('cleaning_level', 'basic')
        preserve_formatting = event.get('preserve_formatting', False)

        logger.info(f"Cleaning text from s3://{bucket}/{key} for tenant: {tenant_id}")
        logger.info(f"Cleaning level: {cleaning_level}, Preserve formatting: {preserve_formatting}")

        # Load processed document
        try:
            response = s3_client.get_object(Bucket=bucket, Key=key)
            document_data = json.loads(response['Body'].read())
        except ClientError as e:
            logger.error(f"Could not load document: {str(e)}")
            return create_response(404, {
                'message': 'Document not found',
                'error': str(e)
            }, correlation_id)

        # Perform text cleaning
        cleaned_result = clean_document_text(
            document_data,
            cleaning_level,
            preserve_formatting,
            correlation_id
        )

        # Store cleaned results
        output_result = store_cleaned_document(
            cleaned_result,
            bucket,
            key,
            tenant_id,
            correlation_id
        )

        logger.info(f"Text cleaning completed successfully")

        return create_response(200, {
            'message': 'Text cleaning completed successfully',
            'tenant_id': tenant_id,
            'original_characters': cleaned_result['original_stats']['total_characters'],
            'cleaned_characters': cleaned_result['cleaned_stats']['total_characters'],
            'reduction_percentage': cleaned_result['reduction_percentage'],
            'artifacts_removed': cleaned_result['artifacts_removed'],
            'output_location': output_result['output_location'],
            'correlation_id': correlation_id
        }, correlation_id)

    except Exception as e:
        logger.error(f"Error in text cleaning: {str(e)}")
        return create_response(500, {
            'message': 'Internal server error',
            'error': str(e),
            'correlation_id': correlation_id
        }, correlation_id)


def clean_document_text(
    document_data: Dict[str, Any],
    cleaning_level: str,
    preserve_formatting: bool,
    correlation_id: str
) -> Dict[str, Any]:
    """
    Clean the text content of a document based on specified parameters
    """
    logger.info(f"Starting text cleaning with level: {cleaning_level}")

    original_text = document_data.get('full_text', '')
    original_stats = calculate_text_stats(original_text)

    # Track cleaning operations
    cleaning_operations = []
    artifacts_removed = {}

    # Start with the original text
    cleaned_text = original_text

    # Apply cleaning operations based on level
    if cleaning_level in ['basic', 'aggressive']:
        cleaned_text, ops = apply_basic_cleaning(cleaned_text)
        cleaning_operations.extend(ops)

    if cleaning_level == 'aggressive':
        cleaned_text, ops = apply_aggressive_cleaning(cleaned_text)
        cleaning_operations.extend(ops)

    # Apply formatting preservation if requested
    if preserve_formatting:
        cleaned_text = preserve_document_structure(cleaned_text)

    # Clean page-level text if present
    cleaned_pages = []
    if 'pages' in document_data:
        for page in document_data['pages']:
            if 'text' in page:
                page_text = page['text']

                # Apply same cleaning to page text
                if cleaning_level in ['basic', 'aggressive']:
                    page_text, _ = apply_basic_cleaning(page_text)

                if cleaning_level == 'aggressive':
                    page_text, _ = apply_aggressive_cleaning(page_text)

                if preserve_formatting:
                    page_text = preserve_document_structure(page_text)

                cleaned_page = page.copy()
                cleaned_page['text'] = page_text
                cleaned_page['character_count'] = len(page_text)
                cleaned_pages.append(cleaned_page)

    # Clean section text if present
    cleaned_sections = {}
    if 'sections' in document_data:
        for section_name, section_text in document_data['sections'].items():
            if section_text:
                if cleaning_level in ['basic', 'aggressive']:
                    section_text, _ = apply_basic_cleaning(section_text)

                if cleaning_level == 'aggressive':
                    section_text, _ = apply_aggressive_cleaning(section_text)

                if preserve_formatting:
                    section_text = preserve_document_structure(section_text)

                cleaned_sections[section_name] = section_text

    # Calculate final statistics
    cleaned_stats = calculate_text_stats(cleaned_text)

    # Calculate reduction percentage
    reduction_percentage = 0
    if original_stats['total_characters'] > 0:
        reduction_percentage = (
            (original_stats['total_characters'] - cleaned_stats['total_characters']) /
            original_stats['total_characters']
        ) * 100

    return {
        'original_text': original_text,
        'cleaned_text': cleaned_text,
        'original_stats': original_stats,
        'cleaned_stats': cleaned_stats,
        'reduction_percentage': round(reduction_percentage, 2),
        'cleaned_pages': cleaned_pages,
        'cleaned_sections': cleaned_sections,
        'cleaning_operations': cleaning_operations,
        'artifacts_removed': artifacts_removed,
        'cleaning_metadata': {
            'cleaning_level': cleaning_level,
            'preserve_formatting': preserve_formatting,
            'correlation_id': correlation_id
        }
    }


def apply_basic_cleaning(text: str) -> Tuple[str, List[str]]:
    """Apply basic text cleaning operations"""
    operations = []

    # Remove null characters and control characters
    text = remove_control_characters(text)
    operations.append('remove_control_characters')

    # Normalize unicode characters
    text = unicodedata.normalize('NFKC', text)
    operations.append('normalize_unicode')

    # Decode HTML entities
    text = html.unescape(text)
    operations.append('decode_html_entities')

    # Remove excessive whitespace
    for pattern in CLEANING_PATTERNS['whitespace']:
        if re.search(pattern, text):
            text = re.sub(pattern, ' ', text)
            operations.append(f'remove_excessive_whitespace: {pattern}')

    # Remove common boilerplate
    for pattern in BOILERPLATE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            text = re.sub(pattern, '', text, flags=re.IGNORECASE)
            operations.append(f'remove_boilerplate: {pattern}')

    # Fix basic spacing issues
    for pattern, replacement in CLEANING_PATTERNS['spacing_fixes']:
        if re.search(pattern, text):
            text = re.sub(pattern, replacement, text)
            operations.append(f'fix_spacing: {pattern}')

    # Final cleanup
    text = re.sub(r'\\n\\s*\\n\\s*\\n', '\\n\\n', text)  # Max 2 consecutive newlines
    text = text.strip()

    return text, operations


def apply_aggressive_cleaning(text: str) -> Tuple[str, List[str]]:
    """Apply aggressive text cleaning operations"""
    operations = []

    # Remove page numbers
    for pattern in CLEANING_PATTERNS['page_numbers']:
        if re.search(pattern, text, re.IGNORECASE | re.MULTILINE):
            text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.MULTILINE)
            operations.append(f'remove_page_numbers: {pattern}')

    # Remove headers and footers
    for pattern in CLEANING_PATTERNS['headers_footers']:
        if re.search(pattern, text, re.IGNORECASE | re.MULTILINE):
            text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.MULTILINE)
            operations.append(f'remove_headers_footers: {pattern}')

    # Remove OCR artifacts
    for pattern in CLEANING_PATTERNS['ocr_artifacts']:
        if re.search(pattern, text):
            text = re.sub(pattern, ' ', text)
            operations.append(f'remove_ocr_artifacts: {pattern}')

    # Remove repeated characters (likely OCR errors)
    text = re.sub(r'(.)\\1{4,}', r'\\1\\1', text)  # Reduce 5+ repeated chars to 2
    operations.append('reduce_repeated_characters')

    # Remove isolated single characters on lines
    text = re.sub(r'^\\s*[a-zA-Z]\\s*$', '', text, flags=re.MULTILINE)
    operations.append('remove_isolated_characters')

    # Clean up bullet points and numbering inconsistencies
    text = normalize_list_formatting(text)
    operations.append('normalize_list_formatting')

    return text, operations


def remove_control_characters(text: str) -> str:
    """Remove control characters except common whitespace"""
    # Keep only printable characters, tabs, newlines, and carriage returns
    return ''.join(char for char in text if ord(char) >= 32 or char in '\\t\\n\\r')


def preserve_document_structure(text: str) -> str:
    """Preserve document structure while cleaning"""
    # Preserve section headers (ALL CAPS lines)
    lines = text.split('\\n')
    processed_lines = []

    for line in lines:
        stripped = line.strip()

        # Keep section headers
        if (len(stripped) > 3 and
            stripped.isupper() and
            not re.match(r'^[0-9\\s\\-\\.]+$', stripped)):
            processed_lines.append('\\n' + line + '\\n')

        # Keep numbered sections
        elif re.match(r'^\\s*\\d+[\\.\\)]\\s+[A-Z]', stripped):
            processed_lines.append('\\n' + line)

        # Keep lettered sections
        elif re.match(r'^\\s*[A-Za-z][\\.\\)]\\s+[A-Z]', stripped):
            processed_lines.append('\\n' + line)

        else:
            processed_lines.append(line)

    return '\\n'.join(processed_lines)


def normalize_list_formatting(text: str) -> str:
    """Normalize bullet points and numbered lists"""
    # Normalize bullet points
    text = re.sub(r'^\\s*[•·‣⁃▪▫‹›]+\\s*', '• ', text, flags=re.MULTILINE)

    # Normalize numbered lists
    text = re.sub(r'^\\s*(\\d+)[\\.)\\s]+', r'\\1. ', text, flags=re.MULTILINE)

    # Normalize lettered lists
    text = re.sub(r'^\\s*([a-zA-Z])[\\.)\\s]+', r'\\1. ', text, flags=re.MULTILINE)

    return text


def calculate_text_stats(text: str) -> Dict[str, int]:
    """Calculate statistics for text content"""
    return {
        'total_characters': len(text),
        'total_words': len(text.split()),
        'total_lines': len(text.split('\\n')),
        'total_paragraphs': len([p for p in text.split('\\n\\n') if p.strip()]),
        'average_words_per_line': len(text.split()) / max(len(text.split('\\n')), 1),
        'average_characters_per_word': len(text) / max(len(text.split()), 1)
    }


def store_cleaned_document(
    cleaned_result: Dict[str, Any],
    source_bucket: str,
    source_key: str,
    tenant_id: str,
    correlation_id: str
) -> Dict[str, Any]:
    """
    Store the cleaned document results
    """
    try:
        # Create cleaned document data structure
        cleaned_document = {
            'tenant_id': tenant_id,
            'source_bucket': source_bucket,
            'source_key': source_key,
            'processing_type': 'text_cleaning',
            'correlation_id': correlation_id,
            'cleaned_text': cleaned_result['cleaned_text'],
            'original_stats': cleaned_result['original_stats'],
            'cleaned_stats': cleaned_result['cleaned_stats'],
            'reduction_percentage': cleaned_result['reduction_percentage'],
            'cleaning_operations': cleaned_result['cleaning_operations'],
            'artifacts_removed': cleaned_result['artifacts_removed'],
            'cleaned_pages': cleaned_result['cleaned_pages'],
            'cleaned_sections': cleaned_result['cleaned_sections'],
            'cleaning_metadata': cleaned_result['cleaning_metadata'],
            'processing_metadata': create_processing_metadata(
                {
                    'bucket': source_bucket,
                    'key': source_key,
                    'type': 'processed_document'
                },
                'text_cleaning',
                tenant_id,
                {
                    'correlation_id': correlation_id,
                    'cleaning_level': cleaned_result['cleaning_metadata']['cleaning_level'],
                    'original_characters': cleaned_result['original_stats']['total_characters'],
                    'cleaned_characters': cleaned_result['cleaned_stats']['total_characters'],
                    'reduction_percentage': cleaned_result['reduction_percentage']
                }
            )
        }

        # Generate output key
        base_name = os.path.splitext(os.path.basename(source_key))[0]
        if base_name.endswith('_extracted') or base_name.endswith('_textract'):
            base_name = base_name.rsplit('_', 1)[0]

        output_key = f"tenants/{tenant_id}/cleaned/{base_name}_cleaned.json"

        # Store in S3
        s3_client.put_object(
            Bucket=PROCESSED_DOCUMENTS_BUCKET,
            Key=output_key,
            Body=json.dumps(cleaned_document, default=str, indent=2),
            ContentType='application/json',
            ServerSideEncryption='AES256',
            Metadata={
                'tenant-id': tenant_id,
                'processing-type': 'text-cleaning',
                'correlation-id': correlation_id,
                'source-key': source_key,
                'cleaning-level': cleaned_result['cleaning_metadata']['cleaning_level']
            }
        )

        logger.info(f"Cleaned document stored at s3://{PROCESSED_DOCUMENTS_BUCKET}/{output_key}")

        return {
            'output_location': f"s3://{PROCESSED_DOCUMENTS_BUCKET}/{output_key}",
            'output_key': output_key,
            'bucket': PROCESSED_DOCUMENTS_BUCKET
        }

    except Exception as e:
        logger.error(f"Error storing cleaned document: {str(e)}")
        raise