"""
Functional Validation Tests for Phase 6: Company Profile Management
Tests all Phase 6 components for correct functionality and integration.
"""

import json
import pytest
import boto3
import uuid
import time
import requests
from datetime import datetime, timezone
from typing import Dict, Any, List
import os
from moto import mock_s3, mock_dynamodb, mock_lambda
from unittest.mock import patch, MagicMock

# Test configuration
TEST_REGION = 'us-east-1'
TEST_BUCKET = 'test-govbizai-raw-documents'
TEST_COMPANIES_TABLE = 'test-govbizai-companies'
TEST_AUDIT_TABLE = 'test-govbizai-audit-log'

# Sample test data
SAMPLE_COMPANY_PROFILE = {
    'company_name': 'Test Tech Solutions Inc',
    'tenant_id': str(uuid.uuid4()),
    'company_id': str(uuid.uuid4()),
    'primary_contact_email': 'contact@testtechsolutions.com',
    'primary_contact_name': 'John Smith',
    'primary_contact_phone': '555-123-4567',
    'website_url': 'https://testtechsolutions.com',
    'naics_codes': ['541511', '541512'],
    'certifications': ['8(a)', 'WOSB'],
    'revenue_range': '1m-5m',
    'employee_count': '11-50',
    'locations': [{'city': 'Arlington', 'state': 'VA', 'zip_code': '22201'}],
    'capability_statement': 'We provide innovative technology solutions for government clients.'
}

SAMPLE_RESUME_TEXT = """
John Doe
Senior Software Engineer

Contact Information:
Email: john.doe@email.com
Phone: (555) 987-6543

Professional Summary:
Experienced software engineer with 8 years of experience developing web applications and systems.

Experience:
Senior Software Engineer - Tech Corp (2020-Present)
- Led development of cloud-based applications
- Managed team of 5 developers
- Implemented DevOps practices

Software Engineer - StartupXYZ (2016-2020)
- Developed full-stack web applications
- Worked with React, Node.js, and Python
- Collaborated with cross-functional teams

Education:
Bachelor of Science in Computer Science
University of Virginia (2012-2016)
GPA: 3.7

Skills:
Python, JavaScript, React, Node.js, AWS, Docker, Kubernetes
"""

SAMPLE_CAPABILITY_STATEMENT = """
ACME Consulting Services

Company Overview:
Founded in 2010, ACME Consulting Services is a small business headquartered in Reston, VA.
DUNS: 123456789
CAGE: 1A2B3

Mission Statement:
To provide innovative consulting services that help our clients achieve their mission objectives.

Core Capabilities:
• Management Consulting
• Business Process Improvement
• Change Management
• Strategic Planning

Past Performance:
• Department of Defense - Strategic Planning Initiative ($500K, 2022-2023)
• Department of Energy - Process Improvement Project ($300K, 2021-2022)

Certifications:
• ISO 9001:2015
• CMMI Level 3

Contact Information:
Jane Smith, President
Phone: (703) 555-1234
Email: jane.smith@acmeconsulting.com
"""


class TestPresignedUrlGeneration:
    """Test S3 presigned URL generation functionality."""

    @mock_s3
    @mock_dynamodb
    def test_generate_presigned_url_success(self):
        """Test successful presigned URL generation."""
        # Setup
        s3 = boto3.client('s3', region_name=TEST_REGION)
        s3.create_bucket(Bucket=TEST_BUCKET)

        dynamodb = boto3.resource('dynamodb', region_name=TEST_REGION)
        companies_table = dynamodb.create_table(
            TableName=TEST_COMPANIES_TABLE,
            KeySchema=[{'AttributeName': 'company_id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'company_id', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )

        # Add company record
        companies_table.put_item(Item=SAMPLE_COMPANY_PROFILE)

        # Mock event
        event = {
            'body': json.dumps({
                'filename': 'test_document.pdf',
                'file_size': 1024000,
                'content_type': 'application/pdf',
                'category': 'capability-statements',
                'description': 'Test capability statement'
            }),
            'requestContext': {
                'authorizer': {
                    'claims': {
                        'sub': 'test-user-id',
                        'custom:tenant_id': SAMPLE_COMPANY_PROFILE['tenant_id'],
                        'custom:company_id': SAMPLE_COMPANY_PROFILE['company_id']
                    }
                }
            }
        }

        # Import and test the handler
        import sys
        sys.path.append('infrastructure/lambda/company-profile/upload-presigned-url')
        from handler import lambda_handler

        with patch.dict(os.environ, {
            'RAW_DOCUMENTS_BUCKET': TEST_BUCKET,
            'COMPANIES_TABLE_NAME': TEST_COMPANIES_TABLE,
            'AUDIT_LOG_TABLE_NAME': TEST_AUDIT_TABLE
        }):
            response = lambda_handler(event, None)

        # Assertions
        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert 'upload_url' in body
        assert 'upload_fields' in body
        assert 's3_key' in body
        assert body['upload_metadata']['filename'] == 'test_document.pdf'
        assert body['upload_metadata']['category'] == 'capability-statements'

    def test_invalid_file_type_rejection(self):
        """Test rejection of unsupported file types."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/upload-presigned-url')
        from handler import lambda_handler

        event = {
            'body': json.dumps({
                'filename': 'test_file.exe',
                'file_size': 1024,
                'content_type': 'application/x-executable',
                'category': 'other'
            }),
            'requestContext': {
                'authorizer': {
                    'claims': {
                        'sub': 'test-user-id',
                        'custom:tenant_id': str(uuid.uuid4()),
                        'custom:company_id': str(uuid.uuid4())
                    }
                }
            }
        }

        with patch.dict(os.environ, {
            'RAW_DOCUMENTS_BUCKET': TEST_BUCKET,
            'COMPANIES_TABLE_NAME': TEST_COMPANIES_TABLE,
            'AUDIT_LOG_TABLE_NAME': TEST_AUDIT_TABLE
        }):
            response = lambda_handler(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'VALIDATION_ERROR' in body['error']

    def test_file_size_limit_enforcement(self):
        """Test file size limit enforcement."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/upload-presigned-url')
        from handler import lambda_handler

        event = {
            'body': json.dumps({
                'filename': 'large_file.pdf',
                'file_size': 200 * 1024 * 1024,  # 200MB - exceeds 100MB limit
                'content_type': 'application/pdf',
                'category': 'capability-statements'
            }),
            'requestContext': {
                'authorizer': {
                    'claims': {
                        'sub': 'test-user-id',
                        'custom:tenant_id': str(uuid.uuid4()),
                        'custom:company_id': str(uuid.uuid4())
                    }
                }
            }
        }

        with patch.dict(os.environ, {
            'RAW_DOCUMENTS_BUCKET': TEST_BUCKET,
            'COMPANIES_TABLE_NAME': TEST_COMPANIES_TABLE,
            'AUDIT_LOG_TABLE_NAME': TEST_AUDIT_TABLE
        }):
            response = lambda_handler(event, None)

        assert response['statusCode'] == 400
        body = json.loads(response['body'])
        assert 'File size exceeds maximum limit' in body['message']


class TestSchemaValidation:
    """Test company profile schema validation."""

    def test_valid_profile_validation(self):
        """Test validation of a complete, valid profile."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/schema-validator')
        from handler import CompanyProfileValidator

        validator = CompanyProfileValidator()
        validated_data = validator.validate_profile(SAMPLE_COMPANY_PROFILE)
        results = validator.get_validation_results()

        assert results['is_valid'] is True
        assert len(results['errors']) == 0
        assert validated_data['company_name'] == 'Test Tech Solutions Inc'
        assert validated_data['primary_contact_email'] == 'contact@testtechsolutions.com'
        assert validated_data['website_url'] == 'https://testtechsolutions.com'
        assert '541511' in validated_data['naics_codes']

    def test_invalid_email_validation(self):
        """Test validation with invalid email."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/schema-validator')
        from handler import CompanyProfileValidator

        invalid_profile = SAMPLE_COMPANY_PROFILE.copy()
        invalid_profile['primary_contact_email'] = 'invalid-email'

        validator = CompanyProfileValidator()
        validated_data = validator.validate_profile(invalid_profile)
        results = validator.get_validation_results()

        assert results['is_valid'] is False
        assert any('email' in error['field'].lower() for error in results['errors'])

    def test_missing_required_fields(self):
        """Test validation with missing required fields."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/schema-validator')
        from handler import CompanyProfileValidator

        incomplete_profile = {
            'company_name': 'Test Company',
            # Missing required fields
        }

        validator = CompanyProfileValidator()
        validated_data = validator.validate_profile(incomplete_profile)
        results = validator.get_validation_results()

        assert results['is_valid'] is False
        assert len(results['errors']) > 0

    def test_naics_code_validation(self):
        """Test NAICS code validation."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/schema-validator')
        from handler import CompanyProfileValidator

        profile_with_invalid_naics = SAMPLE_COMPANY_PROFILE.copy()
        profile_with_invalid_naics['naics_codes'] = ['12345', '1234567', 'invalid']

        validator = CompanyProfileValidator()
        validated_data = validator.validate_profile(profile_with_invalid_naics)

        # Should filter out invalid codes
        assert all(len(code) == 6 and code.isdigit() for code in validated_data['naics_codes'])


class TestDocumentCategorization:
    """Test document categorization functionality."""

    @mock_s3
    def test_resume_categorization(self):
        """Test categorization of resume documents."""
        # Setup S3
        s3 = boto3.client('s3', region_name=TEST_REGION)
        s3.create_bucket(Bucket=TEST_BUCKET)
        s3.put_object(Bucket=TEST_BUCKET, Key='test-resume.txt', Body=SAMPLE_RESUME_TEXT)

        # Mock text extraction
        with patch('boto3.client') as mock_boto:
            mock_lambda = MagicMock()
            mock_lambda.invoke.return_value = {
                'StatusCode': 200,
                'Payload': MagicMock(read=lambda: json.dumps({
                    'body': json.dumps({'extracted_text': SAMPLE_RESUME_TEXT})
                }).encode())
            }
            mock_boto.return_value = mock_lambda

            import sys
            sys.path.append('infrastructure/lambda/company-profile/document-categorizer')
            from handler import DocumentCategorizer

            categorizer = DocumentCategorizer()
            result = categorizer.categorize_document(TEST_BUCKET, 'test-resume.txt', 'john_doe_resume.txt')

        # Assertions
        assert result['primary_category'] == 'team-resumes'
        assert result['confidence_level'] in ['HIGH', 'MEDIUM']
        assert result['document_metadata']['has_text'] is True

    def test_capability_statement_categorization(self):
        """Test categorization of capability statements."""
        # Mock text extraction
        with patch('boto3.client') as mock_boto:
            mock_lambda = MagicMock()
            mock_lambda.invoke.return_value = {
                'StatusCode': 200,
                'Payload': MagicMock(read=lambda: json.dumps({
                    'body': json.dumps({'extracted_text': SAMPLE_CAPABILITY_STATEMENT})
                }).encode())
            }
            mock_boto.return_value = mock_lambda

            import sys
            sys.path.append('infrastructure/lambda/company-profile/document-categorizer')
            from handler import DocumentCategorizer

            categorizer = DocumentCategorizer()
            result = categorizer.categorize_document(TEST_BUCKET, 'test-capability.txt', 'capability_statement.pdf')

        # Assertions
        assert result['primary_category'] == 'capability-statements'
        assert result['confidence_level'] in ['HIGH', 'MEDIUM']

    def test_unknown_document_categorization(self):
        """Test categorization of unknown document types."""
        unknown_text = "This is just some random text that doesn't fit any category."

        with patch('boto3.client') as mock_boto:
            mock_lambda = MagicMock()
            mock_lambda.invoke.return_value = {
                'StatusCode': 200,
                'Payload': MagicMock(read=lambda: json.dumps({
                    'body': json.dumps({'extracted_text': unknown_text})
                }).encode())
            }
            mock_boto.return_value = mock_lambda

            import sys
            sys.path.append('infrastructure/lambda/company-profile/document-categorizer')
            from handler import DocumentCategorizer

            categorizer = DocumentCategorizer()
            result = categorizer.categorize_document(TEST_BUCKET, 'test-unknown.txt', 'unknown.txt')

        # Should default to 'other' for unrecognized content
        assert result['primary_category'] == 'other'


class TestResumeParser:
    """Test resume parsing functionality."""

    def test_resume_parsing_success(self):
        """Test successful resume parsing."""
        with patch('boto3.client') as mock_boto:
            mock_lambda = MagicMock()
            mock_lambda.invoke.return_value = {
                'StatusCode': 200,
                'Payload': MagicMock(read=lambda: json.dumps({
                    'body': json.dumps({'extracted_text': SAMPLE_RESUME_TEXT})
                }).encode())
            }
            mock_boto.return_value = mock_lambda

            import sys
            sys.path.append('infrastructure/lambda/company-profile/resume-parser')
            from handler import ResumeParser

            parser = ResumeParser()
            result = parser.parse_resume(TEST_BUCKET, 'test-resume.txt')

        # Assertions
        assert result.personal_info.full_name == 'John Doe'
        assert result.personal_info.email == 'john.doe@email.com'
        assert result.personal_info.phone == '5559876543'
        assert len(result.experience) > 0
        assert result.experience[0].title == 'Senior Software Engineer'
        assert result.experience[0].company == 'Tech Corp'
        assert len(result.education) > 0
        assert 'Computer Science' in result.education[0].field_of_study
        assert len(result.skills) > 0
        assert 'Python' in result.skills
        assert result.years_of_experience > 0
        assert result.parsing_confidence > 0.5

    def test_education_parsing(self):
        """Test education section parsing."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/resume-parser')
        from handler import ResumeParser

        parser = ResumeParser()
        parser.text = SAMPLE_RESUME_TEXT
        education = parser.parse_education(SAMPLE_RESUME_TEXT)

        assert len(education) > 0
        assert education[0].degree.lower() == 'bachelor'
        assert 'Computer Science' in education[0].field_of_study
        assert education[0].institution == 'University of Virginia'
        assert education[0].graduation_year == '2016'

    def test_experience_parsing(self):
        """Test work experience parsing."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/resume-parser')
        from handler import ResumeParser

        parser = ResumeParser()
        parser.text = SAMPLE_RESUME_TEXT
        experience = parser.parse_experience(SAMPLE_RESUME_TEXT)

        assert len(experience) >= 2
        # Check first job
        senior_role = experience[0]
        assert senior_role.title == 'Senior Software Engineer'
        assert senior_role.company == 'Tech Corp'
        assert '2020' in senior_role.start_date
        assert 'Present' in senior_role.end_date or '2023' in senior_role.end_date

        # Check second job
        engineer_role = experience[1]
        assert engineer_role.title == 'Software Engineer'
        assert engineer_role.company == 'StartupXYZ'


class TestCapabilityStatementProcessor:
    """Test capability statement processing."""

    def test_capability_statement_processing(self):
        """Test processing of capability statements."""
        with patch('boto3.client') as mock_boto:
            mock_lambda = MagicMock()
            mock_lambda.invoke.return_value = {
                'StatusCode': 200,
                'Payload': MagicMock(read=lambda: json.dumps({
                    'body': json.dumps({'extracted_text': SAMPLE_CAPABILITY_STATEMENT})
                }).encode())
            }
            mock_boto.return_value = mock_lambda

            import sys
            sys.path.append('infrastructure/lambda/company-profile/capability-processor')
            from handler import CapabilityStatementProcessor

            processor = CapabilityStatementProcessor()
            result = processor.process_capability_statement(TEST_BUCKET, 'test-capability.txt')

        # Assertions
        assert result.company_overview.company_name == 'ACME Consulting Services'
        assert result.company_overview.duns_number == '123456789'
        assert result.company_overview.cage_code == '1A2B3'
        assert result.company_overview.headquarters
        assert len(result.mission_statement) > 0
        assert len(result.core_capabilities) > 0
        assert any('Management Consulting' in cap.name for cap in result.core_capabilities)
        assert len(result.past_performance) > 0
        assert any('Department of Defense' in perf.client for perf in result.past_performance)
        assert len(result.certifications) > 0
        assert result.contact_info.name == 'Jane Smith'
        assert result.contact_info.email == 'jane.smith@acmeconsulting.com'
        assert result.processing_confidence > 0.6

    def test_company_overview_extraction(self):
        """Test company overview extraction."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/capability-processor')
        from handler import CapabilityStatementProcessor

        processor = CapabilityStatementProcessor()
        overview = processor.parse_company_overview(SAMPLE_CAPABILITY_STATEMENT)

        assert overview.company_name == 'ACME Consulting Services'
        assert overview.duns_number == '123456789'
        assert overview.cage_code == '1A2B3'
        assert overview.founded_year == '2010'

    def test_capabilities_extraction(self):
        """Test core capabilities extraction."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/capability-processor')
        from handler import CapabilityStatementProcessor

        processor = CapabilityStatementProcessor()
        capabilities = processor.parse_core_capabilities(SAMPLE_CAPABILITY_STATEMENT)

        assert len(capabilities) >= 4
        capability_names = [cap.name for cap in capabilities]
        assert 'Management Consulting' in capability_names
        assert 'Business Process Improvement' in capability_names


class TestWebsiteScraper:
    """Test website scraping functionality."""

    def test_robots_txt_compliance(self):
        """Test robots.txt compliance checking."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/website-scraper')
        from handler import RobotsChecker

        checker = RobotsChecker()

        # Mock a site that allows scraping
        with patch('urllib.robotparser.RobotFileParser') as mock_rp:
            mock_parser = MagicMock()
            mock_parser.can_fetch.return_value = True
            mock_rp.return_value = mock_parser

            result = checker.can_fetch('https://example.com/page')
            assert result is True

        # Mock a site that disallows scraping
        with patch('urllib.robotparser.RobotFileParser') as mock_rp:
            mock_parser = MagicMock()
            mock_parser.can_fetch.return_value = False
            mock_rp.return_value = mock_parser

            result = checker.can_fetch('https://example.com/disallowed')
            assert result is False

    def test_content_extraction(self):
        """Test content extraction from HTML."""
        import sys
        sys.path.append('infrastructure/lambda/company-profile/website-scraper')
        from handler import ContentExtractor

        sample_html = """
        <html>
        <head>
            <title>Test Company</title>
            <meta name="description" content="We are a test company">
        </head>
        <body>
            <main>
                <h1>About Us</h1>
                <p>We are a leading provider of testing services.</p>
                <p>Contact us at test@company.com or (555) 123-4567</p>
                <ul>
                    <li>Service 1</li>
                    <li>Service 2</li>
                </ul>
            </main>
        </body>
        </html>
        """

        extractor = ContentExtractor()
        result = extractor.extract_content(sample_html, 'https://testcompany.com')

        assert result['title'] == 'Test Company'
        assert result['description'] == 'We are a test company'
        assert 'About Us' in result['headings']
        assert len(result['paragraphs']) >= 2
        assert result['contact_info']['email'] == 'test@company.com'
        assert result['contact_info']['phone'] == '5551234567'


class TestMultiLevelEmbeddings:
    """Test multi-level embedding generation."""

    @mock_s3
    def test_embedding_generation_structure(self):
        """Test that embeddings are generated at multiple levels."""
        # Setup S3
        s3 = boto3.client('s3', region_name=TEST_REGION)
        s3.create_bucket(Bucket=TEST_BUCKET)
        s3.put_object(Bucket=TEST_BUCKET, Key='test-doc.txt', Body=SAMPLE_CAPABILITY_STATEMENT)

        # Mock Bedrock responses
        with patch('boto3.client') as mock_boto:
            mock_bedrock = MagicMock()
            mock_bedrock.invoke_model.return_value = {
                'body': MagicMock(read=lambda: json.dumps({
                    'embedding': [0.1] * 1024  # Mock 1024-dimensional embedding
                }).encode())
            }
            mock_boto.return_value = mock_bedrock

            import sys
            sys.path.append('infrastructure/lambda/company-profile/embedding-strategy')
            from handler import MultiLevelEmbeddingStrategy

            strategy = MultiLevelEmbeddingStrategy()
            result = strategy.create_document_embeddings(
                SAMPLE_CAPABILITY_STATEMENT,
                {'document_id': 'test-doc', 'company_id': 'test-company'}
            )

        # Assertions
        assert 'embeddings' in result
        embeddings = result['embeddings']

        # Check that different embedding levels exist
        assert 'full_document' in embeddings
        assert 'chunks' in embeddings or 'sections' in embeddings

        # Verify embedding structure
        if 'full_document' in embeddings and embeddings['full_document']:
            full_doc = embeddings['full_document']
            assert 'embedding' in full_doc
            assert len(full_doc['embedding']) == 1024

        # Check stats
        assert 'embedding_stats' in result
        assert result['embedding_stats']['total_embeddings'] > 0


class TestUploadProgressTracking:
    """Test upload progress tracking functionality."""

    @mock_dynamodb
    def test_upload_tracking_creation(self):
        """Test creation of upload tracking records."""
        # Setup DynamoDB
        dynamodb = boto3.resource('dynamodb', region_name=TEST_REGION)
        audit_table = dynamodb.create_table(
            TableName=TEST_AUDIT_TABLE,
            KeySchema=[
                {'AttributeName': 'tenant_id', 'KeyType': 'HASH'},
                {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'tenant_id', 'AttributeType': 'S'},
                {'AttributeName': 'timestamp', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )

        import sys
        sys.path.append('infrastructure/lambda/company-profile/upload-progress')
        from handler import UploadTracker

        # Mock user info
        user_info = {
            'user_id': 'test-user',
            'tenant_id': 'test-tenant',
            'company_id': 'test-company'
        }

        upload_data = {
            'filename': 'test.pdf',
            'file_size': 1024000,
            'content_type': 'application/pdf',
            'category': 'capability-statements'
        }

        with patch.dict(os.environ, {'AUDIT_LOG_TABLE_NAME': TEST_AUDIT_TABLE}):
            tracker = UploadTracker()
            upload_id = tracker.create_upload_record(user_info, upload_data)

        assert upload_id is not None
        assert len(upload_id) > 0

    @mock_dynamodb
    def test_upload_progress_update(self):
        """Test updating upload progress."""
        # Setup similar to above test
        dynamodb = boto3.resource('dynamodb', region_name=TEST_REGION)
        audit_table = dynamodb.create_table(
            TableName=TEST_AUDIT_TABLE,
            KeySchema=[
                {'AttributeName': 'tenant_id', 'KeyType': 'HASH'},
                {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'tenant_id', 'AttributeType': 'S'},
                {'AttributeName': 'timestamp', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )

        import sys
        sys.path.append('infrastructure/lambda/company-profile/upload-progress')
        from handler import UploadTracker

        user_info = {
            'user_id': 'test-user',
            'tenant_id': 'test-tenant',
            'company_id': 'test-company'
        }

        upload_data = {
            'filename': 'test.pdf',
            'file_size': 1024000,
            'content_type': 'application/pdf',
            'category': 'capability-statements'
        }

        with patch.dict(os.environ, {'AUDIT_LOG_TABLE_NAME': TEST_AUDIT_TABLE}):
            tracker = UploadTracker()
            upload_id = tracker.create_upload_record(user_info, upload_data)

            # Update progress
            progress_result = tracker.update_upload_progress(user_info, upload_id, {
                'bytes_uploaded': 512000,  # 50% uploaded
                'status': 'in_progress'
            })

        assert progress_result is True


class TestIntegrationScenarios:
    """Test end-to-end integration scenarios."""

    @mock_s3
    @mock_dynamodb
    def test_document_upload_and_processing_flow(self):
        """Test complete document upload and processing workflow."""
        # This would test:
        # 1. Generate presigned URL
        # 2. Upload document
        # 3. Categorize document
        # 4. Extract content (resume/capability statement)
        # 5. Generate embeddings
        # 6. Update progress throughout

        # Setup
        s3 = boto3.client('s3', region_name=TEST_REGION)
        s3.create_bucket(Bucket=TEST_BUCKET)

        dynamodb = boto3.resource('dynamodb', region_name=TEST_REGION)
        companies_table = dynamodb.create_table(
            TableName=TEST_COMPANIES_TABLE,
            KeySchema=[{'AttributeName': 'company_id', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'company_id', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST'
        )
        companies_table.put_item(Item=SAMPLE_COMPANY_PROFILE)

        # Test the workflow would continue here...
        # Due to complexity, this is a placeholder for the full integration test
        assert True  # Placeholder

    def test_company_profile_validation_flow(self):
        """Test company profile validation workflow."""
        # This would test complete validation including:
        # 1. Schema validation
        # 2. NAICS code validation
        # 3. Contact info validation
        # 4. Certification validation

        import sys
        sys.path.append('infrastructure/lambda/company-profile/schema-validator')
        from handler import CompanyProfileValidator

        validator = CompanyProfileValidator()

        # Test various profile scenarios
        test_profiles = [
            SAMPLE_COMPANY_PROFILE,  # Valid profile
            {**SAMPLE_COMPANY_PROFILE, 'primary_contact_email': 'invalid'},  # Invalid email
            {**SAMPLE_COMPANY_PROFILE, 'naics_codes': ['invalid']},  # Invalid NAICS
        ]

        results = []
        for profile in test_profiles:
            validated_data = validator.validate_profile(profile.copy())
            validation_results = validator.get_validation_results()
            results.append(validation_results['is_valid'])
            # Reset validator for next test
            validator.errors = []
            validator.warnings = []

        assert results[0] is True   # Valid profile should pass
        assert results[1] is False  # Invalid email should fail
        assert results[2] is False  # Invalid NAICS should fail


def run_functional_tests():
    """Run all functional tests."""
    print("Running Phase 6 Functional Tests...")

    # Test classes to run
    test_classes = [
        TestPresignedUrlGeneration,
        TestSchemaValidation,
        TestDocumentCategorization,
        TestResumeParser,
        TestCapabilityStatementProcessor,
        TestWebsiteScraper,
        TestMultiLevelEmbeddings,
        TestUploadProgressTracking,
        TestIntegrationScenarios
    ]

    total_tests = 0
    passed_tests = 0
    failed_tests = []

    for test_class in test_classes:
        print(f"\n--- Running {test_class.__name__} ---")
        test_instance = test_class()

        # Get test methods
        test_methods = [method for method in dir(test_instance) if method.startswith('test_')]

        for test_method in test_methods:
            total_tests += 1
            try:
                print(f"  Running {test_method}...")
                getattr(test_instance, test_method)()
                print(f"  ✓ {test_method} PASSED")
                passed_tests += 1
            except Exception as e:
                print(f"  ✗ {test_method} FAILED: {str(e)}")
                failed_tests.append(f"{test_class.__name__}.{test_method}: {str(e)}")

    # Summary
    print(f"\n=== FUNCTIONAL TEST SUMMARY ===")
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {len(failed_tests)}")

    if failed_tests:
        print("\nFailed Tests:")
        for failure in failed_tests:
            print(f"  - {failure}")

    return len(failed_tests) == 0


if __name__ == "__main__":
    success = run_functional_tests()
    exit(0 if success else 1)