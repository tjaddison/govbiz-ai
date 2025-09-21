import json
import boto3
import logging
import os
import tempfile
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import fitz  # PyMuPDF
import mimetypes

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
textract_client = boto3.client('textract')

# Environment variables
TEMP_BUCKET = os.environ['TEMP_PROCESSING_BUCKET']
PROCESSED_BUCKET = os.environ['PROCESSED_DOCUMENTS_BUCKET']
TEXTRACT_RESULTS_BUCKET = os.environ.get('TEXTRACT_RESULTS_BUCKET', TEMP_BUCKET)

# Configuration
MAX_CHUNK_SIZE = 1000  # tokens
CHUNK_OVERLAP = 200   # tokens
MAX_FILE_SIZE_MB = 50  # Maximum file size to process

class TextExtractionError(Exception):
    """Custom exception for text extraction errors"""
    pass

def lambda_handler(event, context):
    """
    Main handler for text extraction from document attachments.

    Expected event structure:
    {
        "operation": "extract_text",
        "source_s3_uri": "s3://bucket/key",
        "notice_id": "string",
        "filename": "string",
        "attachment_metadata": {...}
    }
    """
    try:
        logger.info(f"Processing text extraction request: {json.dumps(event, default=str)}")

        operation = event.get('operation', 'extract_text')

        if operation == 'extract_text':
            return handle_text_extraction(event)
        else:
            raise ValueError(f"Unsupported operation: {operation}")

    except Exception as e:
        logger.error(f"Text extraction error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Text extraction failed',
                'message': str(e),
                'source_s3_uri': event.get('source_s3_uri')
            })
        }

def handle_text_extraction(event: Dict[str, Any]) -> Dict[str, Any]:
    """Handle text extraction from a single document."""
    source_s3_uri = event.get('source_s3_uri')
    notice_id = event.get('notice_id')
    filename = event.get('filename')
    attachment_metadata = event.get('attachment_metadata', {})

    if not source_s3_uri:
        raise ValueError("Missing required 'source_s3_uri' parameter")

    if not notice_id:
        raise ValueError("Missing required 'notice_id' parameter")

    logger.info(f"Extracting text from {source_s3_uri} for opportunity {notice_id}")

    # Parse S3 URI
    bucket, key = parse_s3_uri(source_s3_uri)

    # Download file to temporary location
    temp_file_path = download_file_to_temp(bucket, key, filename)

    try:
        # Determine file type and extraction method
        file_type = get_file_type(filename, temp_file_path)

        # Extract text using appropriate method
        if file_type == 'pdf':
            text_content = extract_text_from_pdf(temp_file_path, filename)
        elif file_type in ['doc', 'docx']:
            # For Office documents, we'll use Textract
            text_content = extract_text_with_textract(bucket, key, filename, file_type)
        elif file_type == 'txt':
            text_content = extract_text_from_txt(temp_file_path)
        else:
            # Try Textract for unknown file types
            logger.info(f"Unknown file type for {filename}, attempting Textract")
            text_content = extract_text_with_textract(bucket, key, filename, file_type)

        # Chunk the text content
        chunks = chunk_text(text_content['full_text'], filename)

        # Store extracted text and chunks
        storage_result = store_extracted_text(
            notice_id=notice_id,
            filename=filename,
            text_content=text_content,
            chunks=chunks,
            attachment_metadata=attachment_metadata
        )

        logger.info(f"Successfully extracted text from {filename}: {len(text_content['full_text'])} chars, {len(chunks)} chunks")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'notice_id': notice_id,
                'filename': filename,
                'extraction_method': text_content.get('extraction_method'),
                'text_length': len(text_content['full_text']),
                'chunk_count': len(chunks),
                'storage_location': storage_result['s3_uri'],
                'processing_details': {
                    'file_type': file_type,
                    'pages_processed': text_content.get('page_count', 1),
                    'chunks_generated': len(chunks)
                }
            })
        }

    finally:
        # Clean up temporary file
        try:
            os.unlink(temp_file_path)
        except:
            pass

def parse_s3_uri(s3_uri: str) -> Tuple[str, str]:
    """Parse S3 URI to extract bucket and key."""
    if not s3_uri.startswith('s3://'):
        raise ValueError(f"Invalid S3 URI format: {s3_uri}")

    parts = s3_uri[5:].split('/', 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid S3 URI format: {s3_uri}")

    return parts[0], parts[1]

def download_file_to_temp(bucket: str, key: str, filename: str) -> str:
    """Download file from S3 to temporary location."""
    try:
        # Check file size first
        response = s3_client.head_object(Bucket=bucket, Key=key)
        file_size_mb = response['ContentLength'] / (1024 * 1024)

        if file_size_mb > MAX_FILE_SIZE_MB:
            raise TextExtractionError(f"File too large: {file_size_mb:.2f}MB (max: {MAX_FILE_SIZE_MB}MB)")

        # Create temporary file
        temp_dir = tempfile.mkdtemp()
        temp_file_path = os.path.join(temp_dir, filename or 'attachment')

        # Download file
        s3_client.download_file(bucket, key, temp_file_path)

        logger.info(f"Downloaded {filename} ({file_size_mb:.2f}MB) to {temp_file_path}")
        return temp_file_path

    except Exception as e:
        logger.error(f"Failed to download file {bucket}/{key}: {str(e)}")
        raise TextExtractionError(f"Failed to download file: {str(e)}")

def get_file_type(filename: str, file_path: str) -> str:
    """Determine file type from filename and content."""
    if not filename:
        return 'unknown'

    # Get extension
    _, ext = os.path.splitext(filename.lower())
    ext = ext.lstrip('.')

    # Map extensions to types
    if ext == 'pdf':
        return 'pdf'
    elif ext in ['doc', 'docx']:
        return ext
    elif ext in ['txt', 'text']:
        return 'txt'
    else:
        # Try to detect from MIME type
        mime_type, _ = mimetypes.guess_type(filename)
        if mime_type:
            if 'pdf' in mime_type:
                return 'pdf'
            elif 'word' in mime_type or 'msword' in mime_type:
                return 'docx' if 'officedocument' in mime_type else 'doc'
            elif 'text' in mime_type:
                return 'txt'

        return 'unknown'

def extract_text_from_pdf(file_path: str, filename: str) -> Dict[str, Any]:
    """Extract text from PDF using PyMuPDF."""
    try:
        logger.info(f"Extracting text from PDF: {filename}")

        doc = fitz.open(file_path)
        full_text = ""
        page_texts = []

        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            page_text = page.get_text()
            page_texts.append(page_text)
            full_text += page_text + "\n"

        doc.close()

        # Clean the text
        full_text = clean_extracted_text(full_text)

        logger.info(f"Successfully extracted {len(full_text)} characters from {len(page_texts)} pages")

        return {
            'full_text': full_text,
            'page_texts': page_texts,
            'page_count': len(page_texts),
            'extraction_method': 'pymupdf',
            'metadata': {
                'filename': filename,
                'extracted_at': datetime.utcnow().isoformat()
            }
        }

    except Exception as e:
        logger.error(f"PyMuPDF extraction failed for {filename}: {str(e)}")
        # Fall back to Textract for problematic PDFs
        logger.info(f"Falling back to Textract for {filename}")
        return extract_text_with_textract_from_file(file_path, filename, 'pdf')

def extract_text_with_textract(bucket: str, key: str, filename: str, file_type: str) -> Dict[str, Any]:
    """Extract text using Amazon Textract (async for multi-page documents)."""
    try:
        logger.info(f"Extracting text using Textract: {filename}")

        # Start async document text detection
        response = textract_client.start_document_text_detection(
            DocumentLocation={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            }
        )

        job_id = response['JobId']
        logger.info(f"Started Textract job {job_id} for {filename}")

        # Poll for completion (simplified - in production, use Step Functions or SQS)
        import time
        max_attempts = 30
        attempt = 0

        while attempt < max_attempts:
            result = textract_client.get_document_text_detection(JobId=job_id)
            status = result['JobStatus']

            if status == 'SUCCEEDED':
                break
            elif status == 'FAILED':
                raise TextExtractionError(f"Textract job failed: {result.get('StatusMessage', 'Unknown error')}")

            time.sleep(2)
            attempt += 1

        if status != 'SUCCEEDED':
            raise TextExtractionError(f"Textract job timed out after {max_attempts * 2} seconds")

        # Extract text from results
        full_text = ""
        page_texts = []
        current_page_text = ""
        current_page = 1

        # Get all pages of results
        next_token = None
        while True:
            if next_token:
                result = textract_client.get_document_text_detection(
                    JobId=job_id,
                    NextToken=next_token
                )
            else:
                result = textract_client.get_document_text_detection(JobId=job_id)

            for block in result.get('Blocks', []):
                if block['BlockType'] == 'LINE':
                    text = block.get('Text', '')
                    page_num = block.get('Page', 1)

                    if page_num != current_page:
                        # New page started
                        if current_page_text:
                            page_texts.append(current_page_text)
                        current_page_text = text + "\n"
                        current_page = page_num
                    else:
                        current_page_text += text + "\n"

            next_token = result.get('NextToken')
            if not next_token:
                break

        # Add the last page
        if current_page_text:
            page_texts.append(current_page_text)

        full_text = "\n".join(page_texts)
        full_text = clean_extracted_text(full_text)

        logger.info(f"Successfully extracted {len(full_text)} characters using Textract from {len(page_texts)} pages")

        return {
            'full_text': full_text,
            'page_texts': page_texts,
            'page_count': len(page_texts),
            'extraction_method': 'textract',
            'metadata': {
                'filename': filename,
                'file_type': file_type,
                'textract_job_id': job_id,
                'extracted_at': datetime.utcnow().isoformat()
            }
        }

    except Exception as e:
        logger.error(f"Textract extraction failed for {filename}: {str(e)}")
        raise TextExtractionError(f"Textract extraction failed: {str(e)}")

def extract_text_with_textract_from_file(file_path: str, filename: str, file_type: str) -> Dict[str, Any]:
    """Extract text using Textract from a local file (upload to S3 first)."""
    try:
        # Upload file to temporary S3 location for Textract
        temp_key = f"textract-temp/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{filename}"

        with open(file_path, 'rb') as f:
            s3_client.put_object(
                Bucket=TEMP_BUCKET,
                Key=temp_key,
                Body=f.read()
            )

        try:
            # Use Textract
            result = extract_text_with_textract(TEMP_BUCKET, temp_key, filename, file_type)
            return result
        finally:
            # Clean up temporary file
            try:
                s3_client.delete_object(Bucket=TEMP_BUCKET, Key=temp_key)
            except:
                pass

    except Exception as e:
        logger.error(f"Failed to use Textract fallback for {filename}: {str(e)}")
        raise TextExtractionError(f"Textract fallback failed: {str(e)}")

def extract_text_from_txt(file_path: str) -> Dict[str, Any]:
    """Extract text from plain text file."""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            full_text = f.read()

        full_text = clean_extracted_text(full_text)

        return {
            'full_text': full_text,
            'page_texts': [full_text],
            'page_count': 1,
            'extraction_method': 'direct',
            'metadata': {
                'extracted_at': datetime.utcnow().isoformat()
            }
        }

    except Exception as e:
        logger.error(f"Failed to read text file: {str(e)}")
        raise TextExtractionError(f"Failed to read text file: {str(e)}")

def clean_extracted_text(text: str) -> str:
    """Clean and normalize extracted text."""
    if not text:
        return ""

    # Remove excessive whitespace
    import re

    # Replace multiple spaces with single space
    text = re.sub(r' +', ' ', text)

    # Replace multiple newlines with double newline
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)

    # Remove leading/trailing whitespace from each line
    lines = [line.strip() for line in text.split('\n')]
    text = '\n'.join(lines)

    # Remove excessive leading/trailing whitespace
    text = text.strip()

    return text

def chunk_text(text: str, filename: str) -> List[Dict[str, Any]]:
    """Chunk text into smaller segments for embedding generation."""
    if not text:
        return []

    # Simple word-based chunking (in production, use more sophisticated tokenization)
    words = text.split()

    # Approximate tokens (rough estimate: 1 token ≈ 0.75 words)
    words_per_chunk = int(MAX_CHUNK_SIZE * 0.75)
    overlap_words = int(CHUNK_OVERLAP * 0.75)

    chunks = []
    start_idx = 0
    chunk_num = 0

    while start_idx < len(words):
        # Calculate end index
        end_idx = min(start_idx + words_per_chunk, len(words))

        # Extract chunk
        chunk_words = words[start_idx:end_idx]
        chunk_text = ' '.join(chunk_words)

        chunk_info = {
            'chunk_id': f"{filename}_chunk_{chunk_num:03d}",
            'chunk_index': chunk_num,
            'text': chunk_text,
            'word_count': len(chunk_words),
            'start_word': start_idx,
            'end_word': end_idx - 1,
            'metadata': {
                'filename': filename,
                'total_chunks': 0  # Will be updated after all chunks are created
            }
        }

        chunks.append(chunk_info)

        # Move to next chunk with overlap
        if end_idx >= len(words):
            break

        start_idx = end_idx - overlap_words
        chunk_num += 1

    # Update total chunks count
    for chunk in chunks:
        chunk['metadata']['total_chunks'] = len(chunks)

    logger.info(f"Created {len(chunks)} chunks from {len(words)} words")
    return chunks

def store_extracted_text(
    notice_id: str,
    filename: str,
    text_content: Dict[str, Any],
    chunks: List[Dict[str, Any]],
    attachment_metadata: Dict[str, Any]
) -> Dict[str, Any]:
    """Store extracted text and chunks in S3."""
    try:
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        date_prefix = datetime.utcnow().strftime('%Y-%m-%d')

        # Clean filename for S3 key
        clean_filename = filename.replace(' ', '_').replace('/', '_')
        base_key = f"extracted-text/{date_prefix}/{notice_id}/{clean_filename}"

        # Store full extracted text
        full_text_key = f"{base_key}/full_text_{timestamp}.json"
        full_text_data = {
            'notice_id': notice_id,
            'filename': filename,
            'extracted_at': datetime.utcnow().isoformat(),
            'extraction_method': text_content.get('extraction_method'),
            'text_content': text_content,
            'attachment_metadata': attachment_metadata,
            'chunk_count': len(chunks)
        }

        s3_client.put_object(
            Bucket=PROCESSED_BUCKET,
            Key=full_text_key,
            Body=json.dumps(full_text_data, indent=2),
            ContentType='application/json'
        )

        # Store chunks
        chunks_key = f"{base_key}/chunks_{timestamp}.json"
        chunks_data = {
            'notice_id': notice_id,
            'filename': filename,
            'generated_at': datetime.utcnow().isoformat(),
            'chunk_count': len(chunks),
            'chunks': chunks
        }

        s3_client.put_object(
            Bucket=PROCESSED_BUCKET,
            Key=chunks_key,
            Body=json.dumps(chunks_data, indent=2),
            ContentType='application/json'
        )

        result = {
            's3_uri': f"s3://{PROCESSED_BUCKET}/{full_text_key}",
            'full_text_key': full_text_key,
            'chunks_key': chunks_key,
            'chunk_count': len(chunks),
            'text_length': len(text_content.get('full_text', ''))
        }

        logger.info(f"Stored extracted text for {filename} at {full_text_key}")
        return result

    except Exception as e:
        logger.error(f"Failed to store extracted text: {str(e)}")
        raise TextExtractionError(f"Failed to store extracted text: {str(e)}")