import json
import boto3
import os
from typing import Dict, Any, List
import logging
from datetime import datetime
import uuid
import io
# import fitz  # PyMuPDF - removed temporarily for deployment
from urllib.parse import unquote
import re

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')
textract_client = boto3.client('textract')
bedrock_client = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
sqs = boto3.client('sqs')

DOCUMENTS_BUCKET = os.environ['DOCUMENTS_BUCKET']
EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']
COMPANIES_TABLE = os.environ['COMPANIES_TABLE']
PROCESSING_QUEUE_URL = os.environ.get('PROCESSING_QUEUE_URL')

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Process uploaded documents: extract text, categorize, generate embeddings
    Triggered by S3 upload events or SQS messages
    """
    try:
        # Handle S3 trigger or SQS message
        if 'Records' in event:
            for record in event['Records']:
                if record.get('eventSource') == 'aws:s3':
                    # S3 trigger
                    bucket = record['s3']['bucket']['name']
                    key = unquote(record['s3']['object']['key'])
                    process_document_from_s3(bucket, key)
                elif record.get('eventSource') == 'aws:sqs':
                    # SQS message
                    body = json.loads(record['body'])
                    process_document_from_message(body)
        else:
            # Direct Lambda invoke
            bucket = event.get('bucket')
            key = event.get('key')
            if bucket and key:
                process_document_from_s3(bucket, key)
            else:
                logger.error("Invalid event format")
                return {'statusCode': 400, 'body': 'Invalid event format'}

        return {'statusCode': 200, 'body': 'Processing completed'}

    except Exception as e:
        logger.error(f"Document processing error: {str(e)}")
        return {'statusCode': 500, 'body': f'Processing failed: {str(e)}'}

def process_document_from_s3(bucket: str, key: str):
    """Process document from S3 upload event"""
    try:
        # Extract company_id and document_id from S3 key
        # Expected format: {company_id}/raw/{document_id}/{filename}
        parts = key.split('/')
        if len(parts) < 4:
            logger.error(f"Invalid S3 key format: {key}")
            return

        company_id = parts[0]
        document_id = parts[2]
        filename = parts[3]

        process_document(company_id, document_id, bucket, key, filename)

    except Exception as e:
        logger.error(f"Error processing document from S3: {str(e)}")

def process_document_from_message(message: Dict[str, Any]):
    """Process document from SQS message"""
    try:
        company_id = message.get('company_id')
        document_id = message.get('document_id')
        bucket = message.get('bucket')
        key = message.get('key')
        filename = message.get('filename')

        if not all([company_id, document_id, bucket, key, filename]):
            logger.error(f"Missing required fields in message: {message}")
            return

        process_document(company_id, document_id, bucket, key, filename)

    except Exception as e:
        logger.error(f"Error processing document from message: {str(e)}")

def process_document(company_id: str, document_id: str, bucket: str, key: str, filename: str):
    """Main document processing pipeline"""
    try:
        logger.info(f"Processing document: {filename} for company: {company_id}")

        # Download document from S3
        response = s3_client.get_object(Bucket=bucket, Key=key)
        document_content = response['Body'].read()

        # Extract text based on file type
        file_extension = os.path.splitext(filename)[1].lower()
        extracted_text = extract_text_from_document(document_content, file_extension, filename)

        if not extracted_text or len(extracted_text.strip()) < 50:
            logger.warning(f"Insufficient text extracted from {filename}")
            update_document_status(company_id, document_id, 'failed', 'Insufficient text content')
            return

        # Categorize document
        category = categorize_document(extracted_text, filename)

        # Generate embeddings
        embeddings_metadata = generate_document_embeddings(extracted_text, company_id, document_id, category)

        # Store processed text and metadata
        processed_key = f"{company_id}/processed/{document_id}/{filename}.txt"
        s3_client.put_object(
            Bucket=DOCUMENTS_BUCKET,
            Key=processed_key,
            Body=extracted_text.encode('utf-8'),
            ContentType='text/plain'
        )

        # Update document status in DynamoDB
        update_document_status(
            company_id,
            document_id,
            'processed',
            'Successfully processed',
            {
                'processed_key': processed_key,
                'category': category,
                'text_length': len(extracted_text),
                'embeddings_count': len(embeddings_metadata),
                'embeddings_ids': [em['embedding_id'] for em in embeddings_metadata]
            }
        )

        # Trigger company profile re-embedding
        trigger_profile_reembedding(company_id)

        logger.info(f"Successfully processed document {document_id} for company {company_id}")

    except Exception as e:
        logger.error(f"Error processing document {document_id}: {str(e)}")
        update_document_status(company_id, document_id, 'failed', str(e))

def extract_text_from_document(content: bytes, file_extension: str, filename: str) -> str:
    """Extract text from document using PyMuPDF or Textract"""
    try:
        if file_extension == '.pdf':
            return extract_text_with_pymupdf(content)
        elif file_extension in ['.doc', '.docx']:
            return extract_text_with_textract(content, filename)
        elif file_extension in ['.txt']:
            return content.decode('utf-8', errors='ignore')
        else:
            # Fallback to Textract for other formats
            return extract_text_with_textract(content, filename)

    except Exception as e:
        logger.warning(f"Primary text extraction failed for {filename}: {str(e)}")
        # Fallback to Textract
        try:
            return extract_text_with_textract(content, filename)
        except Exception as fallback_error:
            logger.error(f"Fallback text extraction failed for {filename}: {str(fallback_error)}")
            return ""

def extract_text_with_pymupdf(content: bytes) -> str:
    """Extract text from PDF using PyMuPDF"""
    try:
        # Temporarily disabled for deployment - use Textract as fallback
        logger.info("PyMuPDF temporarily disabled, falling back to Textract")
        raise Exception("PyMuPDF not available")

    except Exception as e:
        logger.error(f"PyMuPDF extraction failed: {str(e)}")
        raise

def extract_text_with_textract(content: bytes, filename: str) -> str:
    """Extract text using Amazon Textract (async for large documents)"""
    try:
        # For documents under 5MB, use synchronous detection
        if len(content) < 5 * 1024 * 1024:
            response = textract_client.detect_document_text(
                Document={'Bytes': content}
            )

            text_parts = []
            for block in response.get('Blocks', []):
                if block['BlockType'] == 'LINE':
                    text_parts.append(block['Text'])

            return clean_extracted_text('\n'.join(text_parts))
        else:
            # For larger documents, use asynchronous processing
            return extract_text_with_textract_async(content, filename)

    except Exception as e:
        logger.error(f"Textract extraction failed: {str(e)}")
        raise

def extract_text_with_textract_async(content: bytes, filename: str) -> str:
    """Handle large document processing with Textract async API"""
    try:
        # Upload to temporary S3 location for Textract
        temp_key = f"temp/textract/{uuid.uuid4()}/{filename}"
        s3_client.put_object(
            Bucket=DOCUMENTS_BUCKET,
            Key=temp_key,
            Body=content
        )

        # Start async job
        response = textract_client.start_document_text_detection(
            DocumentLocation={
                'S3Object': {
                    'Bucket': DOCUMENTS_BUCKET,
                    'Name': temp_key
                }
            }
        )

        job_id = response['JobId']

        # Poll for completion (simplified - in production, use SQS notifications)
        import time
        max_attempts = 30
        attempt = 0

        while attempt < max_attempts:
            result = textract_client.get_document_text_detection(JobId=job_id)
            status = result['JobStatus']

            if status == 'SUCCEEDED':
                text_parts = []
                for block in result.get('Blocks', []):
                    if block['BlockType'] == 'LINE':
                        text_parts.append(block['Text'])

                # Clean up temp file
                s3_client.delete_object(Bucket=DOCUMENTS_BUCKET, Key=temp_key)

                return clean_extracted_text('\n'.join(text_parts))
            elif status == 'FAILED':
                logger.error(f"Textract job failed: {job_id}")
                break
            else:
                time.sleep(5)
                attempt += 1

        # Clean up temp file
        s3_client.delete_object(Bucket=DOCUMENTS_BUCKET, Key=temp_key)
        raise Exception(f"Textract job did not complete successfully: {job_id}")

    except Exception as e:
        logger.error(f"Textract async extraction failed: {str(e)}")
        raise

def clean_extracted_text(text: str) -> str:
    """Clean and normalize extracted text"""
    if not text:
        return ""

    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)

    # Remove special characters but keep basic punctuation
    text = re.sub(r'[^\w\s\.\,\;\:\!\?\-\(\)\[\]\{\}]', '', text)

    # Remove common PDF artifacts
    text = re.sub(r'Page \d+ of \d+', '', text)
    text = re.sub(r'Confidential.*?(?=\n|\r\n|\r)', '', text, flags=re.IGNORECASE)

    # Normalize line breaks
    text = re.sub(r'\r\n|\r', '\n', text)

    return text.strip()

def categorize_document(text: str, filename: str) -> str:
    """Automatically categorize document based on content and filename"""
    try:
        text_lower = text.lower()
        filename_lower = filename.lower()

        # Capability Statement indicators
        if any(term in text_lower for term in ['capability statement', 'capabilities', 'core competencies', 'company overview']):
            return 'capability_statement'

        # Resume indicators
        if any(term in text_lower for term in ['resume', 'curriculum vitae', 'cv', 'experience', 'education', 'skills']) and \
           any(term in filename_lower for term in ['resume', 'cv']):
            return 'resume'

        # Past Performance indicators
        if any(term in text_lower for term in ['past performance', 'contract', 'project', 'cpars', 'award']):
            return 'past_performance'

        # Certification indicators
        if any(term in text_lower for term in ['certification', 'certificate', '8(a)', 'wosb', 'sdvosb', 'hubzone']):
            return 'certification'

        # Financial document indicators
        if any(term in text_lower for term in ['financial', 'income', 'revenue', 'balance sheet', 'cash flow']):
            return 'financial'

        # Proposal indicators
        if any(term in text_lower for term in ['proposal', 'response', 'rfp', 'solicitation']):
            return 'proposal'

        return 'other'

    except Exception as e:
        logger.warning(f"Document categorization failed: {str(e)}")
        return 'other'

def generate_document_embeddings(text: str, company_id: str, document_id: str, category: str) -> List[Dict]:
    """Generate embeddings for document using Amazon Bedrock"""
    try:
        # Chunk the text into manageable pieces
        chunks = chunk_text(text, max_tokens=1000, overlap_tokens=200)

        embeddings_metadata = []

        for i, chunk in enumerate(chunks):
            # Generate embedding using Bedrock Titan
            embedding_response = bedrock_client.invoke_model(
                modelId='amazon.titan-embed-text-v2:0',
                body=json.dumps({
                    'inputText': chunk,
                    'dimensions': 1024
                })
            )

            embedding_result = json.loads(embedding_response['body'].read())
            embedding_vector = embedding_result['embedding']

            # Store embedding in S3 with metadata
            embedding_id = f"{document_id}_chunk_{i}"
            embedding_key = f"{company_id}/embeddings/documents/{embedding_id}.json"

            embedding_data = {
                'embedding_id': embedding_id,
                'company_id': company_id,
                'document_id': document_id,
                'chunk_index': i,
                'total_chunks': len(chunks),
                'category': category,
                'text_chunk': chunk,
                'embedding': embedding_vector,
                'created_at': datetime.utcnow().isoformat() + 'Z'
            }

            s3_client.put_object(
                Bucket=EMBEDDINGS_BUCKET,
                Key=embedding_key,
                Body=json.dumps(embedding_data),
                ContentType='application/json'
            )

            embeddings_metadata.append({
                'embedding_id': embedding_id,
                'embedding_key': embedding_key,
                'chunk_index': i,
                'chunk_text_length': len(chunk)
            })

            logger.info(f"Generated embedding {embedding_id} for document {document_id}")

        return embeddings_metadata

    except Exception as e:
        logger.error(f"Error generating embeddings for document {document_id}: {str(e)}")
        raise

def chunk_text(text: str, max_tokens: int = 1000, overlap_tokens: int = 200) -> List[str]:
    """Split text into overlapping chunks for embedding generation"""
    if not text:
        return []

    # Simple word-based chunking (in production, use proper tokenization)
    words = text.split()
    chunks = []

    # Estimate tokens as roughly 0.75 * words
    words_per_chunk = int(max_tokens * 0.75)
    overlap_words = int(overlap_tokens * 0.75)

    start = 0
    while start < len(words):
        end = min(start + words_per_chunk, len(words))
        chunk_words = words[start:end]
        chunks.append(' '.join(chunk_words))

        if end >= len(words):
            break

        start = end - overlap_words

    return chunks

def update_document_status(company_id: str, document_id: str, status: str, message: str, metadata: Dict = None):
    """Update document processing status in DynamoDB"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE)

        # Get current company profile
        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            logger.error(f"Company not found: {company_id}")
            return

        documents = response['Item'].get('documents', [])

        # Find and update the specific document
        for i, doc in enumerate(documents):
            if doc.get('document_id') == document_id:
                documents[i]['status'] = status
                documents[i]['status_message'] = message
                documents[i]['updated_at'] = datetime.utcnow().isoformat() + 'Z'

                if metadata:
                    documents[i].update(metadata)

                break

        # Update the company profile
        companies_table.update_item(
            Key={'company_id': company_id},
            UpdateExpression="SET documents = :docs, updated_at = :updated_at",
            ExpressionAttributeValues={
                ':docs': documents,
                ':updated_at': datetime.utcnow().isoformat() + 'Z'
            }
        )

    except Exception as e:
        logger.error(f"Error updating document status: {str(e)}")

def trigger_profile_reembedding(company_id: str):
    """Trigger company profile re-embedding after document processing"""
    try:
        if PROCESSING_QUEUE_URL:
            sqs.send_message(
                QueueUrl=PROCESSING_QUEUE_URL,
                MessageBody=json.dumps({
                    'action': 'reembed_profile',
                    'company_id': company_id,
                    'timestamp': datetime.utcnow().isoformat() + 'Z'
                })
            )
            logger.info(f"Triggered profile re-embedding for company: {company_id}")
    except Exception as e:
        logger.warning(f"Failed to trigger profile re-embedding: {str(e)}")