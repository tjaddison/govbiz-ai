"""
Document Chunking Lambda Function for GovBizAI
Chunks documents into manageable segments for embedding generation
Supports semantic chunking with overlap for better context preservation
"""

import json
import logging
import boto3
from botocore.exceptions import ClientError
from typing import Dict, Any, List, Optional, Tuple
import os
import re
import nltk
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords
from document_utils import (
    setup_logging, create_response, generate_correlation_id,
    validate_tenant_access, extract_metadata_from_s3_key,
    chunk_text_by_tokens, create_processing_metadata
)

# Initialize AWS clients
s3_client = boto3.client('s3')

# Environment variables
PROCESSED_DOCUMENTS_BUCKET = os.environ['PROCESSED_DOCUMENTS_BUCKET']

# Setup logging
setup_logging('document-chunker')
logger = logging.getLogger(__name__)

# Set NLTK data path for Lambda layer
nltk.data.path.append('/opt/python/nltk_data')

# Download NLTK data if not available
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords', quiet=True)

# No tiktoken available, use word approximation
tokenizer = None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main handler for document chunking

    Expected event structure:
    {
        "bucket": "bucket-name",
        "key": "cleaned-file-key",
        "tenant_id": "tenant-uuid",
        "chunking_strategy": "semantic" | "fixed",
        "chunk_size": 1000,
        "overlap": 200,
        "min_chunk_size": 100,
        "preserve_sections": true/false
    }
    """
    correlation_id = generate_correlation_id()
    logger.info(f"Starting document chunking - Correlation ID: {correlation_id}")

    try:
        # Parse event parameters
        bucket = event['bucket']
        key = event['key']
        tenant_id = event['tenant_id']
        chunking_strategy = event.get('chunking_strategy', 'semantic')
        chunk_size = event.get('chunk_size', 1000)
        overlap = event.get('overlap', 200)
        min_chunk_size = event.get('min_chunk_size', 100)
        preserve_sections = event.get('preserve_sections', True)

        logger.info(f"Chunking document s3://{bucket}/{key} for tenant: {tenant_id}")
        logger.info(f"Strategy: {chunking_strategy}, Size: {chunk_size}, Overlap: {overlap}")

        # Validate parameters
        if chunk_size < 100 or chunk_size > 8192:
            return create_response(400, {
                'message': 'Chunk size must be between 100 and 8192 tokens',
                'provided_chunk_size': chunk_size
            }, correlation_id)

        if overlap >= chunk_size:
            return create_response(400, {
                'message': 'Overlap must be less than chunk size',
                'chunk_size': chunk_size,
                'overlap': overlap
            }, correlation_id)

        # Load cleaned document
        try:
            response = s3_client.get_object(Bucket=bucket, Key=key)
            document_data = json.loads(response['Body'].read())
        except ClientError as e:
            logger.error(f"Could not load document: {str(e)}")
            return create_response(404, {
                'message': 'Document not found',
                'error': str(e)
            }, correlation_id)

        # Perform document chunking
        chunking_result = chunk_document(
            document_data,
            chunking_strategy,
            chunk_size,
            overlap,
            min_chunk_size,
            preserve_sections,
            correlation_id
        )

        # Store chunked results
        output_result = store_chunked_document(
            chunking_result,
            bucket,
            key,
            tenant_id,
            correlation_id
        )

        logger.info(f"Document chunking completed successfully - {len(chunking_result['chunks'])} chunks created")

        return create_response(200, {
            'message': 'Document chunking completed successfully',
            'tenant_id': tenant_id,
            'total_chunks': len(chunking_result['chunks']),
            'total_tokens': chunking_result['total_tokens'],
            'average_chunk_size': chunking_result['average_chunk_size'],
            'chunking_strategy': chunking_strategy,
            'section_chunks': len(chunking_result['section_chunks']),
            'output_location': output_result['output_location'],
            'correlation_id': correlation_id
        }, correlation_id)

    except Exception as e:
        logger.error(f"Error in document chunking: {str(e)}")
        return create_response(500, {
            'message': 'Internal server error',
            'error': str(e),
            'correlation_id': correlation_id
        }, correlation_id)


def chunk_document(
    document_data: Dict[str, Any],
    strategy: str,
    chunk_size: int,
    overlap: int,
    min_chunk_size: int,
    preserve_sections: bool,
    correlation_id: str
) -> Dict[str, Any]:
    """
    Chunk the document according to the specified strategy
    """
    logger.info(f"Starting document chunking with strategy: {strategy}")

    main_text = document_data.get('cleaned_text', document_data.get('full_text', ''))
    sections = document_data.get('cleaned_sections', document_data.get('sections', {}))

    all_chunks = []
    section_chunks = {}
    chunk_metadata = []

    # Chunk main document text
    if main_text:
        if strategy == 'semantic':
            chunks = semantic_chunking(main_text, chunk_size, overlap, min_chunk_size)
        else:  # fixed strategy
            chunks = fixed_chunking(main_text, chunk_size, overlap)

        # Add document-level metadata to chunks
        for i, chunk in enumerate(chunks):
            chunk['chunk_id'] = f"doc_chunk_{i}"
            chunk['source_type'] = 'main_document'
            chunk['document_section'] = 'full_document'

        all_chunks.extend(chunks)
        logger.info(f"Created {len(chunks)} chunks from main document")

    # Chunk individual sections if preserve_sections is True
    if preserve_sections and sections:
        for section_name, section_text in sections.items():
            if section_text and len(section_text.strip()) > min_chunk_size:

                if strategy == 'semantic':
                    section_chunks_list = semantic_chunking(
                        section_text, chunk_size, overlap, min_chunk_size
                    )
                else:
                    section_chunks_list = fixed_chunking(section_text, chunk_size, overlap)

                # Add section-specific metadata
                for i, chunk in enumerate(section_chunks_list):
                    chunk['chunk_id'] = f"{section_name}_chunk_{i}"
                    chunk['source_type'] = 'section'
                    chunk['document_section'] = section_name

                section_chunks[section_name] = section_chunks_list
                all_chunks.extend(section_chunks_list)

                logger.info(f"Created {len(section_chunks_list)} chunks from section: {section_name}")

    # Calculate statistics
    total_tokens = sum(chunk['estimated_tokens'] for chunk in all_chunks)
    average_chunk_size = total_tokens / len(all_chunks) if all_chunks else 0

    # Create chunk metadata
    for chunk in all_chunks:
        metadata = {
            'chunk_id': chunk['chunk_id'],
            'source_type': chunk['source_type'],
            'document_section': chunk['document_section'],
            'character_count': len(chunk['text']),
            'word_count': chunk['word_count'],
            'estimated_tokens': chunk['estimated_tokens'],
            'starts_with': chunk['text'][:50] + '...' if len(chunk['text']) > 50 else chunk['text'],
            'ends_with': '...' + chunk['text'][-50:] if len(chunk['text']) > 50 else chunk['text']
        }
        chunk_metadata.append(metadata)

    return {
        'chunks': all_chunks,
        'section_chunks': section_chunks,
        'chunk_metadata': chunk_metadata,
        'total_chunks': len(all_chunks),
        'total_tokens': total_tokens,
        'average_chunk_size': round(average_chunk_size, 2),
        'chunking_parameters': {
            'strategy': strategy,
            'chunk_size': chunk_size,
            'overlap': overlap,
            'min_chunk_size': min_chunk_size,
            'preserve_sections': preserve_sections
        }
    }


def semantic_chunking(
    text: str,
    target_chunk_size: int,
    overlap: int,
    min_chunk_size: int
) -> List[Dict[str, Any]]:
    """
    Perform semantic chunking that tries to preserve sentence and paragraph boundaries
    """
    # Split text into sentences
    sentences = sent_tokenize(text)
    chunks = []
    current_chunk = []
    current_size = 0
    chunk_index = 0

    for sentence in sentences:
        sentence_tokens = count_tokens(sentence)

        # If adding this sentence would exceed chunk size, finalize current chunk
        if current_size + sentence_tokens > target_chunk_size and current_chunk:
            chunk_text = ' '.join(current_chunk)

            # Only create chunk if it meets minimum size
            if len(chunk_text.strip()) >= min_chunk_size:
                chunk = create_chunk_object(chunk_text, chunk_index)
                chunks.append(chunk)
                chunk_index += 1

            # Start new chunk with overlap
            overlap_sentences = get_overlap_sentences(current_chunk, overlap)
            current_chunk = overlap_sentences + [sentence]
            current_size = sum(count_tokens(s) for s in current_chunk)
        else:
            current_chunk.append(sentence)
            current_size += sentence_tokens

    # Handle final chunk
    if current_chunk:
        chunk_text = ' '.join(current_chunk)
        if len(chunk_text.strip()) >= min_chunk_size:
            chunk = create_chunk_object(chunk_text, chunk_index)
            chunks.append(chunk)

    return chunks


def fixed_chunking(text: str, chunk_size: int, overlap: int) -> List[Dict[str, Any]]:
    """
    Perform fixed-size chunking with token-based splitting
    """
    # Use the utility function from document_utils
    basic_chunks = chunk_text_by_tokens(text, chunk_size, overlap)

    # Convert to our chunk object format
    chunks = []
    for i, basic_chunk in enumerate(basic_chunks):
        chunk = {
            'chunk_index': i,
            'text': basic_chunk['text'],
            'word_count': basic_chunk['word_count'],
            'estimated_tokens': basic_chunk['estimated_tokens'],
            'start_word_index': basic_chunk['start_word_index'],
            'end_word_index': basic_chunk['end_word_index'],
            'chunking_method': 'fixed'
        }
        chunks.append(chunk)

    return chunks


def get_overlap_sentences(sentences: List[str], target_overlap_tokens: int) -> List[str]:
    """
    Get sentences from the end of current chunk for overlap
    """
    if not sentences or target_overlap_tokens <= 0:
        return []

    overlap_sentences = []
    current_tokens = 0

    # Work backwards from the end
    for sentence in reversed(sentences):
        sentence_tokens = count_tokens(sentence)
        if current_tokens + sentence_tokens <= target_overlap_tokens:
            overlap_sentences.insert(0, sentence)
            current_tokens += sentence_tokens
        else:
            break

    return overlap_sentences


def count_tokens(text: str) -> int:
    """
    Count tokens in text using word approximation (1 token ≈ 0.75 words)
    """
    words = len(text.split())
    return int(words * 0.75)


def create_chunk_object(text: str, index: int) -> Dict[str, Any]:
    """
    Create standardized chunk object
    """
    words = text.split()
    return {
        'chunk_index': index,
        'text': text.strip(),
        'word_count': len(words),
        'estimated_tokens': count_tokens(text),
        'character_count': len(text),
        'chunking_method': 'semantic'
    }


def identify_section_boundaries(text: str) -> List[Tuple[int, str, str]]:
    """
    Identify section boundaries in text for better chunking
    Returns list of (position, section_type, section_title)
    """
    boundaries = []

    # Pattern for section headers
    section_patterns = [
        (r'^[A-Z][A-Z\\s]{10,}$', 'major_section'),  # ALL CAPS headers
        (r'^\\d+\\..+$', 'numbered_section'),         # 1. Numbered sections
        (r'^[A-Z]\\..+$', 'lettered_section'),        # A. Lettered sections
        (r'^\\w+:$', 'labeled_section'),              # Label: sections
    ]

    lines = text.split('\\n')
    position = 0

    for line in lines:
        stripped = line.strip()

        for pattern, section_type in section_patterns:
            if re.match(pattern, stripped):
                boundaries.append((position, section_type, stripped))
                break

        position += len(line) + 1  # +1 for newline

    return boundaries


def store_chunked_document(
    chunking_result: Dict[str, Any],
    source_bucket: str,
    source_key: str,
    tenant_id: str,
    correlation_id: str
) -> Dict[str, Any]:
    """
    Store the chunked document results
    """
    try:
        # Create chunked document data structure
        chunked_document = {
            'tenant_id': tenant_id,
            'source_bucket': source_bucket,
            'source_key': source_key,
            'processing_type': 'document_chunking',
            'correlation_id': correlation_id,
            'chunks': chunking_result['chunks'],
            'section_chunks': chunking_result['section_chunks'],
            'chunk_metadata': chunking_result['chunk_metadata'],
            'chunking_statistics': {
                'total_chunks': chunking_result['total_chunks'],
                'total_tokens': chunking_result['total_tokens'],
                'average_chunk_size': chunking_result['average_chunk_size'],
                'chunking_parameters': chunking_result['chunking_parameters']
            },
            'processing_metadata': create_processing_metadata(
                {
                    'bucket': source_bucket,
                    'key': source_key,
                    'type': 'cleaned_document'
                },
                'document_chunking',
                tenant_id,
                {
                    'correlation_id': correlation_id,
                    'total_chunks': chunking_result['total_chunks'],
                    'chunking_strategy': chunking_result['chunking_parameters']['strategy'],
                    'chunk_size': chunking_result['chunking_parameters']['chunk_size'],
                    'overlap': chunking_result['chunking_parameters']['overlap']
                }
            )
        }

        # Generate output key
        base_name = os.path.splitext(os.path.basename(source_key))[0]
        if base_name.endswith('_cleaned'):
            base_name = base_name.rsplit('_', 1)[0]

        output_key = f"tenants/{tenant_id}/chunked/{base_name}_chunked.json"

        # Store in S3
        s3_client.put_object(
            Bucket=PROCESSED_DOCUMENTS_BUCKET,
            Key=output_key,
            Body=json.dumps(chunked_document, default=str, indent=2),
            ContentType='application/json',
            ServerSideEncryption='AES256',
            Metadata={
                'tenant-id': tenant_id,
                'processing-type': 'document-chunking',
                'correlation-id': correlation_id,
                'source-key': source_key,
                'total-chunks': str(chunking_result['total_chunks']),
                'chunking-strategy': chunking_result['chunking_parameters']['strategy']
            }
        )

        logger.info(f"Chunked document stored at s3://{PROCESSED_DOCUMENTS_BUCKET}/{output_key}")

        return {
            'output_location': f"s3://{PROCESSED_DOCUMENTS_BUCKET}/{output_key}",
            'output_key': output_key,
            'bucket': PROCESSED_DOCUMENTS_BUCKET
        }

    except Exception as e:
        logger.error(f"Error storing chunked document: {str(e)}")
        raise