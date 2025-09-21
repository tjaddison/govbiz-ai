"""
Multi-Level Embedding Generation Strategy
Creates hierarchical embeddings for company profile documents at multiple levels.
"""

import json
import boto3
import logging
import os
import re
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import hashlib
import numpy as np

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
bedrock_client = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')

# Environment variables
RAW_DOCUMENTS_BUCKET = os.environ['RAW_DOCUMENTS_BUCKET']
PROCESSED_DOCUMENTS_BUCKET = os.environ['PROCESSED_DOCUMENTS_BUCKET']
EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']
COMPANIES_TABLE_NAME = os.environ['COMPANIES_TABLE_NAME']

# Get DynamoDB tables
companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)

# Embedding configuration
BEDROCK_MODEL_ID = 'amazon.titan-embed-text-v2:0'
MAX_INPUT_TOKENS = 8000
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
EMBEDDING_DIMENSION = 1024


class TextProcessor:
    """Handles text processing and chunking for embeddings."""

    def __init__(self):
        self.sentence_endings = r'[.!?]\s+'
        self.section_headers = r'^\s*([A-Z][^a-z]*|[IVX]+\.|\d+\.)'

    def clean_text(self, text: str) -> str:
        """Clean and normalize text for embedding."""
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)

        # Remove special characters but keep basic punctuation
        text = re.sub(r'[^\w\s\.\,\!\?\:\;\-\(\)]', ' ', text)

        # Remove very short lines (likely artifacts)
        lines = text.split('\n')
        cleaned_lines = [line.strip() for line in lines if len(line.strip()) > 10]

        return '\n'.join(cleaned_lines).strip()

    def split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        sentences = re.split(self.sentence_endings, text)
        return [s.strip() for s in sentences if len(s.strip()) > 10]

    def split_into_paragraphs(self, text: str) -> List[str]:
        """Split text into paragraphs."""
        paragraphs = text.split('\n\n')
        return [p.strip() for p in paragraphs if len(p.strip()) > 20]

    def identify_sections(self, text: str) -> List[Dict[str, Any]]:
        """Identify document sections based on headers."""
        lines = text.split('\n')
        sections = []
        current_section = {'header': '', 'content': []}

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Check if this looks like a section header
            if re.match(self.section_headers, line) and len(line) < 100:
                # Save previous section if it has content
                if current_section['content']:
                    sections.append({
                        'header': current_section['header'],
                        'content': '\n'.join(current_section['content']),
                        'word_count': len(' '.join(current_section['content']).split())
                    })

                # Start new section
                current_section = {'header': line, 'content': []}
            else:
                current_section['content'].append(line)

        # Don't forget the last section
        if current_section['content']:
            sections.append({
                'header': current_section['header'],
                'content': '\n'.join(current_section['content']),
                'word_count': len(' '.join(current_section['content']).split())
            })

        return sections

    def create_semantic_chunks(self, text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[Dict[str, Any]]:
        """Create semantic chunks with overlap."""
        sentences = self.split_into_sentences(text)
        chunks = []
        current_chunk = []
        current_length = 0

        for sentence in sentences:
            sentence_words = sentence.split()
            sentence_length = len(sentence_words)

            # If adding this sentence would exceed chunk size, finalize current chunk
            if current_length + sentence_length > chunk_size and current_chunk:
                chunk_text = ' '.join(current_chunk)
                chunks.append({
                    'text': chunk_text,
                    'word_count': current_length,
                    'sentence_count': len(current_chunk)
                })

                # Create overlap for next chunk
                overlap_words = []
                overlap_length = 0
                for i in range(len(current_chunk) - 1, -1, -1):
                    sentence_words = current_chunk[i].split()
                    if overlap_length + len(sentence_words) <= overlap:
                        overlap_words.insert(0, current_chunk[i])
                        overlap_length += len(sentence_words)
                    else:
                        break

                current_chunk = overlap_words
                current_length = overlap_length

            # Add current sentence to chunk
            current_chunk.append(sentence)
            current_length += sentence_length

        # Don't forget the last chunk
        if current_chunk:
            chunk_text = ' '.join(current_chunk)
            chunks.append({
                'text': chunk_text,
                'word_count': current_length,
                'sentence_count': len(current_chunk)
            })

        return chunks


class EmbeddingGenerator:
    """Handles embedding generation using Amazon Bedrock."""

    def __init__(self):
        self.model_id = BEDROCK_MODEL_ID

    def generate_embedding(self, text: str, input_type: str = "search_document") -> Optional[List[float]]:
        """Generate embedding for a text using Bedrock Titan."""
        try:
            # Truncate text if too long
            if len(text.split()) > MAX_INPUT_TOKENS:
                words = text.split()
                text = ' '.join(words[:MAX_INPUT_TOKENS])
                logger.warning(f"Text truncated to {MAX_INPUT_TOKENS} words for embedding")

            body = json.dumps({
                "inputText": text,
                "inputType": input_type
            })

            response = bedrock_client.invoke_model(
                modelId=self.model_id,
                body=body
            )

            result = json.loads(response['body'].read())
            embedding = result.get('embedding')

            if embedding and len(embedding) == EMBEDDING_DIMENSION:
                return embedding
            else:
                logger.error(f"Invalid embedding response: expected {EMBEDDING_DIMENSION} dimensions")
                return None

        except Exception as e:
            logger.error(f"Error generating embedding: {str(e)}")
            return None

    def generate_batch_embeddings(self, texts: List[str], input_type: str = "search_document") -> List[Optional[List[float]]]:
        """Generate embeddings for multiple texts."""
        embeddings = []

        for i, text in enumerate(texts):
            logger.debug(f"Generating embedding {i+1}/{len(texts)}")
            embedding = self.generate_embedding(text, input_type)
            embeddings.append(embedding)

        return embeddings


class MultiLevelEmbeddingStrategy:
    """Creates multi-level embeddings for documents."""

    def __init__(self):
        self.text_processor = TextProcessor()
        self.embedding_generator = EmbeddingGenerator()

    def create_document_embeddings(self, text: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Create multi-level embeddings for a document."""
        logger.info("Creating multi-level embeddings")

        # Clean text
        cleaned_text = self.text_processor.clean_text(text)

        if not cleaned_text:
            logger.warning("No text content to process")
            return {}

        embeddings_result = {
            'metadata': metadata,
            'text_stats': {
                'original_length': len(text),
                'cleaned_length': len(cleaned_text),
                'word_count': len(cleaned_text.split())
            },
            'embeddings': {},
            'processing_timestamp': datetime.now(timezone.utc).isoformat()
        }

        # Level 1: Full Document Embedding
        logger.info("Creating full document embedding")
        document_embedding = self.create_full_document_embedding(cleaned_text)
        if document_embedding:
            embeddings_result['embeddings']['full_document'] = document_embedding

        # Level 2: Section-Level Embeddings
        logger.info("Creating section-level embeddings")
        section_embeddings = self.create_section_embeddings(cleaned_text)
        if section_embeddings:
            embeddings_result['embeddings']['sections'] = section_embeddings

        # Level 3: Chunk-Level Embeddings
        logger.info("Creating chunk-level embeddings")
        chunk_embeddings = self.create_chunk_embeddings(cleaned_text)
        if chunk_embeddings:
            embeddings_result['embeddings']['chunks'] = chunk_embeddings

        # Level 4: Key Paragraph Embeddings
        logger.info("Creating key paragraph embeddings")
        paragraph_embeddings = self.create_paragraph_embeddings(cleaned_text)
        if paragraph_embeddings:
            embeddings_result['embeddings']['paragraphs'] = paragraph_embeddings

        # Calculate summary statistics
        embeddings_result['embedding_stats'] = self.calculate_embedding_stats(embeddings_result['embeddings'])

        return embeddings_result

    def create_full_document_embedding(self, text: str) -> Optional[Dict[str, Any]]:
        """Create embedding for the full document."""
        try:
            # For very long documents, create a summary first
            if len(text.split()) > MAX_INPUT_TOKENS:
                summary = self.create_document_summary(text)
                embedding_text = summary if summary else text[:MAX_INPUT_TOKENS * 4]  # Approximate character limit
            else:
                embedding_text = text

            embedding = self.embedding_generator.generate_embedding(embedding_text, "search_document")

            if embedding:
                return {
                    'embedding': embedding,
                    'text_length': len(embedding_text),
                    'word_count': len(embedding_text.split()),
                    'is_summary': len(text.split()) > MAX_INPUT_TOKENS
                }

            return None

        except Exception as e:
            logger.error(f"Error creating full document embedding: {str(e)}")
            return None

    def create_section_embeddings(self, text: str) -> Optional[Dict[str, Any]]:
        """Create embeddings for document sections."""
        try:
            sections = self.text_processor.identify_sections(text)

            if not sections:
                return None

            section_embeddings = []

            for i, section in enumerate(sections):
                if section['word_count'] < 10:  # Skip very short sections
                    continue

                embedding = self.embedding_generator.generate_embedding(section['content'], "search_document")

                if embedding:
                    section_embeddings.append({
                        'section_id': i,
                        'header': section['header'],
                        'embedding': embedding,
                        'word_count': section['word_count'],
                        'text_preview': section['content'][:200] + '...' if len(section['content']) > 200 else section['content']
                    })

            return {
                'sections': section_embeddings,
                'total_sections': len(section_embeddings)
            }

        except Exception as e:
            logger.error(f"Error creating section embeddings: {str(e)}")
            return None

    def create_chunk_embeddings(self, text: str) -> Optional[Dict[str, Any]]:
        """Create embeddings for text chunks."""
        try:
            chunks = self.text_processor.create_semantic_chunks(text)

            if not chunks:
                return None

            chunk_embeddings = []

            for i, chunk in enumerate(chunks):
                embedding = self.embedding_generator.generate_embedding(chunk['text'], "search_document")

                if embedding:
                    chunk_embeddings.append({
                        'chunk_id': i,
                        'embedding': embedding,
                        'word_count': chunk['word_count'],
                        'sentence_count': chunk['sentence_count'],
                        'text_preview': chunk['text'][:200] + '...' if len(chunk['text']) > 200 else chunk['text']
                    })

            return {
                'chunks': chunk_embeddings,
                'total_chunks': len(chunk_embeddings),
                'chunk_size': CHUNK_SIZE,
                'chunk_overlap': CHUNK_OVERLAP
            }

        except Exception as e:
            logger.error(f"Error creating chunk embeddings: {str(e)}")
            return None

    def create_paragraph_embeddings(self, text: str) -> Optional[Dict[str, Any]]:
        """Create embeddings for key paragraphs."""
        try:
            paragraphs = self.text_processor.split_into_paragraphs(text)

            if not paragraphs:
                return None

            # Select key paragraphs (longest ones, up to 10)
            scored_paragraphs = []
            for i, paragraph in enumerate(paragraphs):
                word_count = len(paragraph.split())
                if word_count >= 20:  # Minimum paragraph size
                    scored_paragraphs.append({
                        'id': i,
                        'text': paragraph,
                        'word_count': word_count,
                        'score': word_count  # Simple scoring based on length
                    })

            # Sort by score and take top paragraphs
            key_paragraphs = sorted(scored_paragraphs, key=lambda x: x['score'], reverse=True)[:10]

            paragraph_embeddings = []

            for paragraph in key_paragraphs:
                embedding = self.embedding_generator.generate_embedding(paragraph['text'], "search_document")

                if embedding:
                    paragraph_embeddings.append({
                        'paragraph_id': paragraph['id'],
                        'embedding': embedding,
                        'word_count': paragraph['word_count'],
                        'text_preview': paragraph['text'][:200] + '...' if len(paragraph['text']) > 200 else paragraph['text']
                    })

            return {
                'paragraphs': paragraph_embeddings,
                'total_paragraphs': len(paragraph_embeddings)
            }

        except Exception as e:
            logger.error(f"Error creating paragraph embeddings: {str(e)}")
            return None

    def create_document_summary(self, text: str) -> Optional[str]:
        """Create a summary of the document for embedding very long texts."""
        try:
            # Use AI to create a summary
            max_text_length = 15000
            text_sample = text[:max_text_length] if len(text) > max_text_length else text

            prompt = f"""
Summarize this document in 2-3 paragraphs, capturing the key information, main topics, and important details:

Document:
{text_sample}

Summary:
"""

            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            })

            response = bedrock_client.invoke_model(
                modelId='anthropic.claude-3-haiku-20240307-v1:0',
                body=body
            )

            result = json.loads(response['body'].read())
            summary = result.get('content', [{}])[0].get('text', '')

            return summary if summary else None

        except Exception as e:
            logger.error(f"Error creating document summary: {str(e)}")
            return None

    def calculate_embedding_stats(self, embeddings: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate statistics about the generated embeddings."""
        stats = {
            'total_embeddings': 0,
            'levels_created': [],
            'embedding_distribution': {}
        }

        for level, level_data in embeddings.items():
            stats['levels_created'].append(level)

            if level == 'full_document' and level_data:
                stats['total_embeddings'] += 1
                stats['embedding_distribution'][level] = 1
            elif level in ['sections', 'chunks', 'paragraphs'] and level_data:
                count = len(level_data.get(level, []))
                stats['total_embeddings'] += count
                stats['embedding_distribution'][level] = count

        return stats


def get_user_info(event: Dict[str, Any]) -> Dict[str, str]:
    """Extract user information from the request context."""
    request_context = event.get('requestContext', {})
    authorizer = request_context.get('authorizer', {})
    claims = authorizer.get('claims', {})

    return {
        'user_id': claims.get('sub', 'unknown'),
        'tenant_id': claims.get('custom:tenant_id', 'unknown'),
        'company_id': claims.get('custom:company_id', 'unknown')
    }


def verify_document_access(s3_key: str, user_info: Dict[str, str]) -> bool:
    """Verify that the user has access to the document."""
    expected_prefix = f"tenants/{user_info['company_id']}/"
    return s3_key.startswith(expected_prefix)


def load_document_content(bucket: str, key: str) -> Tuple[str, Dict[str, Any]]:
    """Load document content and metadata from S3."""
    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)

        # Get metadata
        metadata = {
            'bucket': bucket,
            'key': key,
            'content_type': response.get('ContentType', ''),
            'size': response.get('ContentLength', 0),
            'last_modified': response.get('LastModified', '').isoformat() if response.get('LastModified') else '',
            's3_metadata': response.get('Metadata', {})
        }

        # Read content
        content = response['Body'].read().decode('utf-8')

        return content, metadata

    except Exception as e:
        logger.error(f"Error loading document {key}: {str(e)}")
        raise


def store_embeddings(embeddings_data: Dict[str, Any], company_id: str, document_id: str) -> str:
    """Store embeddings in S3."""
    try:
        # Generate S3 key for embeddings
        timestamp = datetime.now(timezone.utc).strftime('%Y/%m/%d')
        s3_key = f"tenants/{company_id}/embeddings/{timestamp}/{document_id}_embeddings.json"

        # Store embeddings
        s3_client.put_object(
            Bucket=EMBEDDINGS_BUCKET,
            Key=s3_key,
            Body=json.dumps(embeddings_data, default=str),
            ContentType='application/json',
            ACL='bucket-owner-full-control',
            Metadata={
                'company-id': company_id,
                'document-id': document_id,
                'embedding-type': 'multi-level',
                'created-at': datetime.now(timezone.utc).isoformat()
            }
        )

        logger.info(f"Stored embeddings at {s3_key}")
        return s3_key

    except Exception as e:
        logger.error(f"Error storing embeddings: {str(e)}")
        raise


def create_success_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a successful response."""
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        'body': json.dumps(data, default=str)
    }


def create_error_response(status_code: int, error_code: str, message: str) -> Dict[str, Any]:
    """Create an error response."""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        },
        'body': json.dumps({
            'error': error_code,
            'message': message
        })
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """Main Lambda handler for multi-level embedding generation."""
    try:
        logger.info("Processing multi-level embedding generation request")

        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return create_error_response(400, 'INVALID_JSON', 'Invalid JSON in request body')

        user_info = get_user_info(event)

        # Validate required fields
        if 's3_key' not in body:
            return create_error_response(400, 'MISSING_FIELD', 'Missing required field: s3_key')

        s3_key = body['s3_key']
        bucket = body.get('bucket', RAW_DOCUMENTS_BUCKET)
        document_id = body.get('document_id', hashlib.md5(s3_key.encode()).hexdigest())

        # Verify document access
        if not verify_document_access(s3_key, user_info):
            return create_error_response(403, 'ACCESS_DENIED', 'Access denied to document')

        # Load document content
        try:
            content, metadata = load_document_content(bucket, s3_key)
        except Exception:
            return create_error_response(404, 'DOCUMENT_NOT_FOUND', 'Document not found or could not be loaded')

        # Add user context to metadata
        metadata.update({
            'user_id': user_info['user_id'],
            'tenant_id': user_info['tenant_id'],
            'company_id': user_info['company_id'],
            'document_id': document_id
        })

        # Create multi-level embeddings
        strategy = MultiLevelEmbeddingStrategy()
        embeddings_result = strategy.create_document_embeddings(content, metadata)

        if not embeddings_result.get('embeddings'):
            return create_error_response(422, 'PROCESSING_FAILED', 'Failed to generate embeddings')

        # Store embeddings
        embeddings_s3_key = store_embeddings(embeddings_result, user_info['company_id'], document_id)

        logger.info(f"Multi-level embeddings created for {s3_key}")

        response_data = {
            'document_id': document_id,
            'source_s3_key': s3_key,
            'embeddings_s3_key': embeddings_s3_key,
            'embedding_stats': embeddings_result.get('embedding_stats', {}),
            'text_stats': embeddings_result.get('text_stats', {}),
            'processing_timestamp': embeddings_result.get('processing_timestamp')
        }

        return create_success_response(response_data)

    except Exception as e:
        logger.error(f"Unexpected error in multi-level embedding generation: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'An internal error occurred while generating embeddings')