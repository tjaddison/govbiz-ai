import json
import boto3
import os
from typing import Dict, Any, List
import logging
from datetime import datetime
import uuid

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3_client = boto3.client('s3')
bedrock_client = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')

DOCUMENTS_BUCKET = os.environ['DOCUMENTS_BUCKET']
EMBEDDINGS_BUCKET = os.environ['EMBEDDINGS_BUCKET']
COMPANIES_TABLE = os.environ['COMPANIES_TABLE']

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Generate comprehensive embeddings for company profiles
    Triggered by profile updates or document processing completion
    """
    try:
        # Handle different event sources
        if 'Records' in event:
            # SQS message
            for record in event['Records']:
                if record.get('eventSource') == 'aws:sqs':
                    body = json.loads(record['body'])
                    company_id = body.get('company_id')
                    if company_id:
                        process_company_embedding(company_id)
        else:
            # Direct invoke
            company_id = event.get('company_id')
            if company_id:
                process_company_embedding(company_id)
            else:
                logger.error("No company_id provided")
                return {'statusCode': 400, 'body': 'company_id required'}

        return {'statusCode': 200, 'body': 'Profile embedding completed'}

    except Exception as e:
        logger.error(f"Profile embedding error: {str(e)}")
        return {'statusCode': 500, 'body': f'Profile embedding failed: {str(e)}'}

def process_company_embedding(company_id: str):
    """Generate comprehensive embeddings for a company profile"""
    try:
        logger.info(f"Generating profile embeddings for company: {company_id}")

        # Get company profile data
        company_data = get_company_profile_data(company_id)
        if not company_data:
            logger.error(f"Company profile not found: {company_id}")
            return

        # Generate multi-level embeddings
        embeddings_generated = []

        # 1. Full Profile Embedding
        full_profile_embedding = generate_full_profile_embedding(company_id, company_data)
        if full_profile_embedding:
            embeddings_generated.append(full_profile_embedding)

        # 2. Capability Statement Embedding
        capability_embedding = generate_capability_embedding(company_id, company_data)
        if capability_embedding:
            embeddings_generated.append(capability_embedding)

        # 3. Experience/Past Performance Embedding
        experience_embedding = generate_experience_embedding(company_id, company_data)
        if experience_embedding:
            embeddings_generated.append(experience_embedding)

        # 4. Team/Skills Embedding
        team_embedding = generate_team_embedding(company_id, company_data)
        if team_embedding:
            embeddings_generated.append(team_embedding)

        # 5. Certifications and Qualifications Embedding
        cert_embedding = generate_certifications_embedding(company_id, company_data)
        if cert_embedding:
            embeddings_generated.append(cert_embedding)

        # Update company profile with embedding references
        update_company_embedding_metadata(company_id, embeddings_generated)

        logger.info(f"Generated {len(embeddings_generated)} embeddings for company {company_id}")

    except Exception as e:
        logger.error(f"Error processing company embedding for {company_id}: {str(e)}")
        raise

def get_company_profile_data(company_id: str) -> Dict[str, Any]:
    """Retrieve comprehensive company profile data"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE)
        response = companies_table.get_item(Key={'company_id': company_id})

        if 'Item' not in response:
            return None

        company_data = response['Item']

        # Get processed documents content
        documents = company_data.get('documents', [])
        processed_documents = []

        for doc in documents:
            if doc.get('status') == 'processed' and doc.get('processed_key'):
                try:
                    # Retrieve processed text content
                    doc_response = s3_client.get_object(
                        Bucket=DOCUMENTS_BUCKET,
                        Key=doc['processed_key']
                    )
                    doc_content = doc_response['Body'].read().decode('utf-8')
                    processed_documents.append({
                        'document_id': doc.get('document_id'),
                        'category': doc.get('category', 'other'),
                        'filename': doc.get('filename'),
                        'content': doc_content
                    })
                except Exception as e:
                    logger.warning(f"Failed to retrieve document content: {str(e)}")

        company_data['processed_documents'] = processed_documents

        # Get scraped website content
        scraped_content = get_scraped_website_content(company_id)
        company_data['website_content'] = scraped_content

        return company_data

    except Exception as e:
        logger.error(f"Error retrieving company profile data: {str(e)}")
        return None

def get_scraped_website_content(company_id: str) -> str:
    """Retrieve latest scraped website content"""
    try:
        # List scraped content files for company
        response = s3_client.list_objects_v2(
            Bucket=DOCUMENTS_BUCKET,
            Prefix=f"{company_id}/scraped/",
            MaxKeys=1
        )

        if 'Contents' not in response:
            return ""

        # Get the most recent scraped content
        latest_file = max(response['Contents'], key=lambda x: x['LastModified'])

        content_response = s3_client.get_object(
            Bucket=DOCUMENTS_BUCKET,
            Key=latest_file['Key']
        )

        scraped_data = json.loads(content_response['Body'].read())

        # Extract text from all scraped pages
        website_text = ""
        for page in scraped_data.get('pages', []):
            if page.get('title'):
                website_text += f"Title: {page['title']}\n"
            if page.get('description'):
                website_text += f"Description: {page['description']}\n"
            if page.get('text'):
                website_text += f"Content: {page['text']}\n\n"

        return website_text

    except Exception as e:
        logger.warning(f"Error retrieving scraped website content: {str(e)}")
        return ""

def generate_full_profile_embedding(company_id: str, company_data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate comprehensive full profile embedding"""
    try:
        # Compile full profile text
        profile_text = compile_full_profile_text(company_data)

        if not profile_text.strip():
            logger.warning(f"No profile text available for company {company_id}")
            return None

        # Generate embedding
        embedding_vector = generate_bedrock_embedding(profile_text)

        # Store embedding
        embedding_id = f"{company_id}_full_profile"
        embedding_data = {
            'embedding_id': embedding_id,
            'company_id': company_id,
            'type': 'full_profile',
            'text_length': len(profile_text),
            'text_preview': profile_text[:500],
            'embedding': embedding_vector,
            'created_at': datetime.utcnow().isoformat() + 'Z'
        }

        store_embedding(embedding_id, embedding_data, company_id)

        return {
            'embedding_id': embedding_id,
            'type': 'full_profile',
            'text_length': len(profile_text)
        }

    except Exception as e:
        logger.error(f"Error generating full profile embedding: {str(e)}")
        return None

def generate_capability_embedding(company_id: str, company_data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate capability-focused embedding"""
    try:
        capability_text = ""

        # Company capability statement
        if company_data.get('capability_statement'):
            capability_text += f"Capability Statement: {company_data['capability_statement']}\n\n"

        # NAICS codes with descriptions
        naics_codes = company_data.get('naics_codes', [])
        if naics_codes:
            capability_text += f"NAICS Codes: {', '.join(naics_codes)}\n\n"

        # Capability statement documents
        for doc in company_data.get('processed_documents', []):
            if doc.get('category') == 'capability_statement':
                capability_text += f"Capability Document: {doc['content']}\n\n"

        # Services from website
        website_content = company_data.get('website_content', '')
        if website_content:
            # Extract service-related content
            service_keywords = ['services', 'capabilities', 'solutions', 'offerings', 'expertise']
            for line in website_content.split('\n'):
                if any(keyword in line.lower() for keyword in service_keywords):
                    capability_text += line + "\n"

        if not capability_text.strip():
            return None

        embedding_vector = generate_bedrock_embedding(capability_text)

        embedding_id = f"{company_id}_capabilities"
        embedding_data = {
            'embedding_id': embedding_id,
            'company_id': company_id,
            'type': 'capabilities',
            'text_length': len(capability_text),
            'text_preview': capability_text[:500],
            'embedding': embedding_vector,
            'created_at': datetime.utcnow().isoformat() + 'Z'
        }

        store_embedding(embedding_id, embedding_data, company_id)

        return {
            'embedding_id': embedding_id,
            'type': 'capabilities',
            'text_length': len(capability_text)
        }

    except Exception as e:
        logger.error(f"Error generating capability embedding: {str(e)}")
        return None

def generate_experience_embedding(company_id: str, company_data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate past performance and experience embedding"""
    try:
        experience_text = ""

        # Past performance documents
        for doc in company_data.get('processed_documents', []):
            if doc.get('category') in ['past_performance', 'proposal']:
                experience_text += f"Past Performance: {doc['content']}\n\n"

        if not experience_text.strip():
            return None

        embedding_vector = generate_bedrock_embedding(experience_text)

        embedding_id = f"{company_id}_experience"
        embedding_data = {
            'embedding_id': embedding_id,
            'company_id': company_id,
            'type': 'experience',
            'text_length': len(experience_text),
            'text_preview': experience_text[:500],
            'embedding': embedding_vector,
            'created_at': datetime.utcnow().isoformat() + 'Z'
        }

        store_embedding(embedding_id, embedding_data, company_id)

        return {
            'embedding_id': embedding_id,
            'type': 'experience',
            'text_length': len(experience_text)
        }

    except Exception as e:
        logger.error(f"Error generating experience embedding: {str(e)}")
        return None

def generate_team_embedding(company_id: str, company_data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate team and skills embedding"""
    try:
        team_text = ""

        # Resume documents
        for doc in company_data.get('processed_documents', []):
            if doc.get('category') == 'resume':
                team_text += f"Team Member Resume: {doc['content']}\n\n"

        # Team information from website
        website_content = company_data.get('website_content', '')
        if website_content:
            team_keywords = ['team', 'staff', 'personnel', 'employees', 'leadership', 'management']
            for line in website_content.split('\n'):
                if any(keyword in line.lower() for keyword in team_keywords):
                    team_text += line + "\n"

        if not team_text.strip():
            return None

        embedding_vector = generate_bedrock_embedding(team_text)

        embedding_id = f"{company_id}_team"
        embedding_data = {
            'embedding_id': embedding_id,
            'company_id': company_id,
            'type': 'team',
            'text_length': len(team_text),
            'text_preview': team_text[:500],
            'embedding': embedding_vector,
            'created_at': datetime.utcnow().isoformat() + 'Z'
        }

        store_embedding(embedding_id, embedding_data, company_id)

        return {
            'embedding_id': embedding_id,
            'type': 'team',
            'text_length': len(team_text)
        }

    except Exception as e:
        logger.error(f"Error generating team embedding: {str(e)}")
        return None

def generate_certifications_embedding(company_id: str, company_data: Dict[str, Any]) -> Dict[str, Any]:
    """Generate certifications and qualifications embedding"""
    try:
        cert_text = ""

        # Company certifications
        certifications = company_data.get('certifications', [])
        if certifications:
            cert_text += f"Certifications: {', '.join(certifications)}\n\n"

        # Certification documents
        for doc in company_data.get('processed_documents', []):
            if doc.get('category') == 'certification':
                cert_text += f"Certification Document: {doc['content']}\n\n"

        if not cert_text.strip():
            return None

        embedding_vector = generate_bedrock_embedding(cert_text)

        embedding_id = f"{company_id}_certifications"
        embedding_data = {
            'embedding_id': embedding_id,
            'company_id': company_id,
            'type': 'certifications',
            'text_length': len(cert_text),
            'text_preview': cert_text[:500],
            'embedding': embedding_vector,
            'created_at': datetime.utcnow().isoformat() + 'Z'
        }

        store_embedding(embedding_id, embedding_data, company_id)

        return {
            'embedding_id': embedding_id,
            'type': 'certifications',
            'text_length': len(cert_text)
        }

    except Exception as e:
        logger.error(f"Error generating certifications embedding: {str(e)}")
        return None

def compile_full_profile_text(company_data: Dict[str, Any]) -> str:
    """Compile comprehensive company profile text"""
    profile_parts = []

    # Basic company information
    if company_data.get('company_name'):
        profile_parts.append(f"Company: {company_data['company_name']}")

    if company_data.get('capability_statement'):
        profile_parts.append(f"Capability Statement: {company_data['capability_statement']}")

    # NAICS codes
    naics_codes = company_data.get('naics_codes', [])
    if naics_codes:
        profile_parts.append(f"NAICS Codes: {', '.join(naics_codes)}")

    # Certifications
    certifications = company_data.get('certifications', [])
    if certifications:
        profile_parts.append(f"Certifications: {', '.join(certifications)}")

    # Revenue and size
    if company_data.get('revenue_range'):
        profile_parts.append(f"Revenue Range: {company_data['revenue_range']}")

    if company_data.get('employee_count'):
        profile_parts.append(f"Employee Count: {company_data['employee_count']}")

    # Processed documents content
    for doc in company_data.get('processed_documents', []):
        if doc.get('content'):
            profile_parts.append(f"{doc.get('category', 'Document').title()}: {doc['content']}")

    # Website content
    website_content = company_data.get('website_content', '')
    if website_content:
        profile_parts.append(f"Website Content: {website_content}")

    return '\n\n'.join(profile_parts)

def generate_bedrock_embedding(text: str) -> List[float]:
    """Generate embedding using Amazon Bedrock Titan"""
    try:
        # Limit text size for API
        limited_text = text[:8000] if len(text) > 8000 else text

        response = bedrock_client.invoke_model(
            modelId='amazon.titan-embed-text-v2:0',
            body=json.dumps({
                'inputText': limited_text,
                'dimensions': 1024
            })
        )

        result = json.loads(response['body'].read())
        return result['embedding']

    except Exception as e:
        logger.error(f"Error generating Bedrock embedding: {str(e)}")
        raise

def store_embedding(embedding_id: str, embedding_data: Dict[str, Any], company_id: str):
    """Store embedding in S3"""
    try:
        embedding_key = f"{company_id}/embeddings/profile/{embedding_id}.json"

        s3_client.put_object(
            Bucket=EMBEDDINGS_BUCKET,
            Key=embedding_key,
            Body=json.dumps(embedding_data),
            ContentType='application/json'
        )

        logger.info(f"Stored embedding {embedding_id} for company {company_id}")

    except Exception as e:
        logger.error(f"Error storing embedding: {str(e)}")
        raise

def update_company_embedding_metadata(company_id: str, embeddings_generated: List[Dict[str, Any]]):
    """Update company profile with embedding metadata"""
    try:
        companies_table = dynamodb.Table(COMPANIES_TABLE)

        embedding_metadata = {
            'embeddings_generated': len(embeddings_generated),
            'embedding_types': [emb['type'] for emb in embeddings_generated],
            'last_embedded_at': datetime.utcnow().isoformat() + 'Z'
        }

        companies_table.update_item(
            Key={'company_id': company_id},
            UpdateExpression="SET embedding_metadata = :metadata, updated_at = :updated_at",
            ExpressionAttributeValues={
                ':metadata': embedding_metadata,
                ':updated_at': datetime.utcnow().isoformat() + 'Z'
            }
        )

        logger.info(f"Updated embedding metadata for company {company_id}")

    except Exception as e:
        logger.error(f"Error updating company embedding metadata: {str(e)}")