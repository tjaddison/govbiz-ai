"""
Document Categorization System
Automatically categorizes uploaded documents based on content analysis.
"""

import json
import boto3
import logging
import os
import re
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timezone
import uuid

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
s3_client = boto3.client('s3')
bedrock_client = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

# Environment variables
RAW_DOCUMENTS_BUCKET = os.environ['RAW_DOCUMENTS_BUCKET']
PROCESSED_DOCUMENTS_BUCKET = os.environ['PROCESSED_DOCUMENTS_BUCKET']
COMPANIES_TABLE_NAME = os.environ['COMPANIES_TABLE_NAME']
AUDIT_LOG_TABLE_NAME = os.environ['AUDIT_LOG_TABLE_NAME']
TEXT_EXTRACTION_FUNCTION = os.environ.get('TEXT_EXTRACTION_FUNCTION', 'govbizai-text-extraction')

# Get DynamoDB tables
companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)
audit_log_table = dynamodb.Table(AUDIT_LOG_TABLE_NAME)

# Document categories and their characteristics
DOCUMENT_CATEGORIES = {
    'capability-statements': {
        'name': 'Capability Statements',
        'keywords': [
            'capability statement', 'capabilities', 'core competencies', 'experience',
            'qualifications', 'past performance', 'corporate overview', 'company profile',
            'mission statement', 'vision', 'services offered', 'technical expertise'
        ],
        'patterns': [
            r'capability\s+statement',
            r'core\s+competenc(ies|y)',
            r'past\s+performance',
            r'corporate\s+overview',
            r'company\s+profile'
        ],
        'confidence_threshold': 0.7
    },
    'past-performance': {
        'name': 'Past Performance/CPARS',
        'keywords': [
            'past performance', 'cpars', 'contract performance', 'project experience',
            'performance rating', 'client testimonial', 'reference', 'case study',
            'project summary', 'work history', 'contract award', 'delivery record'
        ],
        'patterns': [
            r'past\s+performance',
            r'cpars',
            r'contract\s+performance',
            r'performance\s+rating',
            r'client\s+testimonial',
            r'project\s+experience'
        ],
        'confidence_threshold': 0.8
    },
    'team-resumes': {
        'name': 'Team Resumes',
        'keywords': [
            'resume', 'curriculum vitae', 'cv', 'biography', 'professional experience',
            'education', 'certifications', 'skills', 'employment history', 'qualifications',
            'key personnel', 'team member', 'project manager', 'technical lead'
        ],
        'patterns': [
            r'resume',
            r'curriculum\s+vitae',
            r'\bcv\b',
            r'professional\s+experience',
            r'employment\s+history',
            r'key\s+personnel'
        ],
        'confidence_threshold': 0.75
    },
    'past-proposals': {
        'name': 'Past Proposals',
        'keywords': [
            'proposal', 'rfp response', 'bid', 'quotation', 'technical approach',
            'management approach', 'cost proposal', 'pricing', 'statement of work',
            'project plan', 'methodology', 'deliverables', 'timeline', 'schedule'
        ],
        'patterns': [
            r'proposal',
            r'rfp\s+response',
            r'technical\s+approach',
            r'management\s+approach',
            r'statement\s+of\s+work',
            r'project\s+plan'
        ],
        'confidence_threshold': 0.7
    },
    'certifications': {
        'name': 'Certifications',
        'keywords': [
            'certification', 'certificate', 'accreditation', 'license', 'registration',
            'compliance', 'iso', 'cmmi', 'security clearance', 'professional license',
            'industry certification', 'quality assurance', 'standard', 'audit'
        ],
        'patterns': [
            r'certif(icate|ication)',
            r'accreditation',
            r'license',
            r'iso\s+\d+',
            r'cmmi',
            r'security\s+clearance'
        ],
        'confidence_threshold': 0.8
    },
    'financial-documents': {
        'name': 'Financial Documents',
        'keywords': [
            'financial statement', 'balance sheet', 'income statement', 'cash flow',
            'profit loss', 'p&l', 'budget', 'financial report', 'audit report',
            'tax return', 'revenue', 'expenses', 'assets', 'liabilities', 'equity'
        ],
        'patterns': [
            r'financial\s+(statement|report)',
            r'balance\s+sheet',
            r'income\s+statement',
            r'cash\s+flow',
            r'profit\s+(and\s+)?loss',
            r'p&l'
        ],
        'confidence_threshold': 0.9
    },
    'technical-documents': {
        'name': 'Technical Documents',
        'keywords': [
            'technical specification', 'architecture', 'design document', 'user manual',
            'installation guide', 'configuration', 'api documentation', 'technical report',
            'system requirements', 'software documentation', 'hardware specification'
        ],
        'patterns': [
            r'technical\s+(specification|document|report)',
            r'architecture',
            r'design\s+document',
            r'user\s+manual',
            r'installation\s+guide',
            r'api\s+documentation'
        ],
        'confidence_threshold': 0.7
    },
    'other': {
        'name': 'Other',
        'keywords': [],
        'patterns': [],
        'confidence_threshold': 0.0
    }
}

# Confidence levels
CONFIDENCE_LEVELS = {
    'HIGH': 0.8,
    'MEDIUM': 0.6,
    'LOW': 0.4
}


class DocumentCategorizer:
    """Handles document categorization using multiple analysis methods."""

    def __init__(self):
        """Initialize the categorizer."""
        self.extracted_text = ''
        self.filename = ''
        self.file_size = 0

    def extract_text_from_document(self, bucket: str, key: str) -> str:
        """Extract text from document using the text extraction Lambda."""
        try:
            payload = {
                'bucket': bucket,
                'key': key,
                'extract_metadata': True
            }

            response = lambda_client.invoke(
                FunctionName=TEXT_EXTRACTION_FUNCTION,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )

            result = json.loads(response['Payload'].read())

            if response['StatusCode'] != 200:
                logger.error(f"Text extraction failed: {result}")
                return ''

            # Parse the response body if it's a Lambda API Gateway response
            if 'body' in result:
                body = json.loads(result['body'])
                return body.get('extracted_text', '')
            else:
                return result.get('extracted_text', '')

        except Exception as e:
            logger.error(f"Error extracting text from {key}: {str(e)}")
            return ''

    def analyze_filename(self, filename: str) -> Dict[str, float]:
        """Analyze filename for categorization clues."""
        filename_lower = filename.lower()
        category_scores = {}

        for category_id, category_info in DOCUMENT_CATEGORIES.items():
            score = 0.0

            # Check for exact keyword matches in filename
            for keyword in category_info['keywords']:
                if keyword in filename_lower:
                    score += 0.3

            # Check for pattern matches in filename
            for pattern in category_info['patterns']:
                if re.search(pattern, filename_lower, re.IGNORECASE):
                    score += 0.5

            category_scores[category_id] = min(score, 1.0)

        return category_scores

    def analyze_text_content(self, text: str) -> Dict[str, float]:
        """Analyze text content for categorization."""
        if not text:
            return {category: 0.0 for category in DOCUMENT_CATEGORIES.keys()}

        text_lower = text.lower()
        text_length = len(text)
        category_scores = {}

        for category_id, category_info in DOCUMENT_CATEGORIES.items():
            if category_id == 'other':
                category_scores[category_id] = 0.1  # Default low score
                continue

            score = 0.0
            keyword_hits = 0
            pattern_hits = 0

            # Count keyword occurrences
            for keyword in category_info['keywords']:
                count = text_lower.count(keyword)
                if count > 0:
                    keyword_hits += count
                    # Weight by keyword frequency and text length
                    score += min(count * 0.1, 0.5)

            # Count pattern matches
            for pattern in category_info['patterns']:
                matches = re.findall(pattern, text_lower, re.IGNORECASE)
                if matches:
                    pattern_hits += len(matches)
                    score += min(len(matches) * 0.15, 0.6)

            # Normalize by text length (prevent bias toward longer documents)
            if text_length > 1000:
                normalization_factor = min(text_length / 10000, 1.0)
                score *= normalization_factor

            # Bonus for multiple different types of matches
            if keyword_hits > 0 and pattern_hits > 0:
                score += 0.2

            category_scores[category_id] = min(score, 1.0)

        return category_scores

    def analyze_document_structure(self, text: str) -> Dict[str, float]:
        """Analyze document structure for additional categorization clues."""
        if not text:
            return {category: 0.0 for category in DOCUMENT_CATEGORIES.keys()}

        structure_scores = {}

        # Initialize scores
        for category in DOCUMENT_CATEGORIES.keys():
            structure_scores[category] = 0.0

        # Look for resume-like structures
        resume_indicators = [
            r'education:?\s*\n',
            r'experience:?\s*\n',
            r'skills:?\s*\n',
            r'employment\s+history:?\s*\n',
            r'\d{4}\s*-\s*\d{4}',  # Date ranges
            r'bachelor|master|phd|b\.s\.|m\.s\.|ph\.d\.',
            r'university|college|institute'
        ]

        resume_matches = 0
        for indicator in resume_indicators:
            if re.search(indicator, text, re.IGNORECASE):
                resume_matches += 1

        if resume_matches >= 3:
            structure_scores['team-resumes'] += 0.4

        # Look for financial document structures
        financial_indicators = [
            r'\$[\d,]+\.?\d*',  # Dollar amounts
            r'total\s+(revenue|assets|liabilities)',
            r'fiscal\s+year',
            r'quarter\s+\d',
            r'balance\s+sheet',
            r'income\s+statement'
        ]

        financial_matches = 0
        for indicator in financial_indicators:
            if re.search(indicator, text, re.IGNORECASE):
                financial_matches += 1

        if financial_matches >= 2:
            structure_scores['financial-documents'] += 0.3

        # Look for proposal structures
        proposal_indicators = [
            r'executive\s+summary',
            r'technical\s+approach',
            r'management\s+approach',
            r'cost\s+proposal',
            r'deliverables?:?\s*\n',
            r'timeline:?\s*\n',
            r'phase\s+\d'
        ]

        proposal_matches = 0
        for indicator in proposal_indicators:
            if re.search(indicator, text, re.IGNORECASE):
                proposal_matches += 1

        if proposal_matches >= 3:
            structure_scores['past-proposals'] += 0.3

        return structure_scores

    def use_ai_classification(self, text: str, filename: str) -> Dict[str, float]:
        """Use AI model for document classification."""
        try:
            # Truncate text to manageable size for AI processing
            max_text_length = 4000
            text_sample = text[:max_text_length] if len(text) > max_text_length else text

            prompt = f"""
Analyze the following document and classify it into one of these categories:
- capability-statements: Company capability statements and overviews
- past-performance: Past performance records and CPARS
- team-resumes: Individual resumes and personnel information
- past-proposals: Previous proposal submissions
- certifications: Certificates and accreditations
- financial-documents: Financial statements and reports
- technical-documents: Technical specifications and manuals
- other: Documents that don't fit other categories

Filename: {filename}

Document content (first 4000 characters):
{text_sample}

Provide a confidence score (0.0 to 1.0) for each category. Respond in JSON format:
{{"category_scores": {{"capability-statements": 0.0, "past-performance": 0.0, ...}}}}
"""

            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 500,
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
            ai_response = result.get('content', [{}])[0].get('text', '')

            # Parse AI response
            try:
                ai_scores = json.loads(ai_response)
                return ai_scores.get('category_scores', {})
            except json.JSONDecodeError:
                logger.warning("Could not parse AI classification response")
                return {}

        except Exception as e:
            logger.error(f"Error in AI classification: {str(e)}")
            return {}

    def categorize_document(self, bucket: str, key: str, filename: str = None) -> Dict[str, Any]:
        """Categorize a document using multiple methods."""
        if filename is None:
            filename = os.path.basename(key)

        self.filename = filename

        # Get document metadata
        try:
            head_response = s3_client.head_object(Bucket=bucket, Key=key)
            self.file_size = head_response['ContentLength']
        except Exception as e:
            logger.error(f"Error getting document metadata: {str(e)}")
            self.file_size = 0

        # Extract text content
        logger.info(f"Extracting text from document: {key}")
        extracted_text = self.extract_text_from_document(bucket, key)
        self.extracted_text = extracted_text

        if not extracted_text:
            logger.warning(f"Could not extract text from document: {key}")

        # Analyze using multiple methods
        filename_scores = self.analyze_filename(filename)
        content_scores = self.analyze_text_content(extracted_text)
        structure_scores = self.analyze_document_structure(extracted_text)

        # Use AI classification if text is available
        ai_scores = {}
        if extracted_text:
            ai_scores = self.use_ai_classification(extracted_text, filename)

        # Combine scores with weights
        combined_scores = {}
        for category in DOCUMENT_CATEGORIES.keys():
            filename_score = filename_scores.get(category, 0.0)
            content_score = content_scores.get(category, 0.0)
            structure_score = structure_scores.get(category, 0.0)
            ai_score = ai_scores.get(category, 0.0)

            # Weight the different methods
            combined_score = (
                filename_score * 0.2 +
                content_score * 0.4 +
                structure_score * 0.2 +
                ai_score * 0.2
            )

            combined_scores[category] = combined_score

        # Determine primary category
        primary_category = max(combined_scores, key=combined_scores.get)
        confidence_score = combined_scores[primary_category]

        # Determine confidence level
        if confidence_score >= CONFIDENCE_LEVELS['HIGH']:
            confidence_level = 'HIGH'
        elif confidence_score >= CONFIDENCE_LEVELS['MEDIUM']:
            confidence_level = 'MEDIUM'
        elif confidence_score >= CONFIDENCE_LEVELS['LOW']:
            confidence_level = 'LOW'
        else:
            confidence_level = 'LOW'
            primary_category = 'other'  # Default to 'other' for very low confidence

        # Get top 3 categories for alternative suggestions
        sorted_scores = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)
        alternative_categories = [
            {'category': cat, 'score': score, 'name': DOCUMENT_CATEGORIES[cat]['name']}
            for cat, score in sorted_scores[:3] if cat != primary_category and score > 0.1
        ]

        return {
            'primary_category': primary_category,
            'category_name': DOCUMENT_CATEGORIES[primary_category]['name'],
            'confidence_score': confidence_score,
            'confidence_level': confidence_level,
            'alternative_categories': alternative_categories,
            'analysis_details': {
                'filename_scores': filename_scores,
                'content_scores': content_scores,
                'structure_scores': structure_scores,
                'ai_scores': ai_scores,
                'combined_scores': combined_scores
            },
            'document_metadata': {
                'filename': filename,
                'file_size': self.file_size,
                'text_length': len(extracted_text),
                'has_text': len(extracted_text) > 0
            }
        }


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
    # Check if the S3 key starts with the user's tenant path
    expected_prefix = f"tenants/{user_info['company_id']}/"
    return s3_key.startswith(expected_prefix)


def log_categorization_action(user_info: Dict[str, str], action: str, details: Dict[str, Any]):
    """Log categorization actions for audit purposes."""
    try:
        audit_log_table.put_item(
            Item={
                'tenant_id': user_info['tenant_id'],
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'action_type': f'DOCUMENT_CATEGORIZATION_{action}',
                'user_id': user_info['user_id'],
                'company_id': user_info['company_id'],
                'resource_type': 'DOCUMENT',
                'resource_id': details.get('s3_key', 'unknown'),
                'details': details,
                'ttl': int((datetime.now(timezone.utc).timestamp() + 7776000))  # 90 days
            }
        )
    except Exception as e:
        logger.error(f"Error logging categorization action: {str(e)}")


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
    """Main Lambda handler for document categorization."""
    try:
        logger.info("Processing document categorization request")

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
        filename = body.get('filename', os.path.basename(s3_key))
        bucket = body.get('bucket', RAW_DOCUMENTS_BUCKET)

        # Verify document access
        if not verify_document_access(s3_key, user_info):
            return create_error_response(403, 'ACCESS_DENIED', 'Access denied to document')

        # Verify document exists
        try:
            s3_client.head_object(Bucket=bucket, Key=s3_key)
        except s3_client.exceptions.NoSuchKey:
            return create_error_response(404, 'DOCUMENT_NOT_FOUND', 'Document not found')

        # Categorize the document
        categorizer = DocumentCategorizer()
        categorization_result = categorizer.categorize_document(bucket, s3_key, filename)

        # Log the categorization
        log_categorization_action(user_info, 'CATEGORIZE', {
            's3_key': s3_key,
            'bucket': bucket,
            'filename': filename,
            'primary_category': categorization_result['primary_category'],
            'confidence_level': categorization_result['confidence_level'],
            'confidence_score': categorization_result['confidence_score']
        })

        logger.info(f"Document categorized: {s3_key} -> {categorization_result['primary_category']} ({categorization_result['confidence_level']})")

        return create_success_response({
            's3_key': s3_key,
            'categorization': categorization_result,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })

    except Exception as e:
        logger.error(f"Unexpected error in document categorization: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'An internal error occurred while categorizing the document')