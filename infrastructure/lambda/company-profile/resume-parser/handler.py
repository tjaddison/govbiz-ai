"""
Resume Parser
Extracts structured information from resume documents for team member profiles.
"""

import json
import boto3
import logging
import os
import re
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
from dataclasses import dataclass, asdict

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
COMPANIES_TABLE_NAME = os.environ['COMPANIES_TABLE_NAME']
AUDIT_LOG_TABLE_NAME = os.environ['AUDIT_LOG_TABLE_NAME']
TEXT_EXTRACTION_FUNCTION = os.environ.get('TEXT_EXTRACTION_FUNCTION', 'govbizai-text-extraction')

# Get DynamoDB tables
companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)
audit_log_table = dynamodb.Table(AUDIT_LOG_TABLE_NAME)


@dataclass
class PersonalInfo:
    """Personal information from resume."""
    full_name: str = ''
    email: str = ''
    phone: str = ''
    address: str = ''
    linkedin: str = ''
    website: str = ''


@dataclass
class Education:
    """Education entry."""
    degree: str = ''
    field_of_study: str = ''
    institution: str = ''
    location: str = ''
    graduation_year: str = ''
    gpa: str = ''


@dataclass
class Experience:
    """Work experience entry."""
    title: str = ''
    company: str = ''
    location: str = ''
    start_date: str = ''
    end_date: str = ''
    duration: str = ''
    description: str = ''
    achievements: List[str] = None

    def __post_init__(self):
        if self.achievements is None:
            self.achievements = []


@dataclass
class Certification:
    """Certification entry."""
    name: str = ''
    issuer: str = ''
    date_obtained: str = ''
    expiry_date: str = ''
    credential_id: str = ''


@dataclass
class ParsedResume:
    """Complete parsed resume structure."""
    personal_info: PersonalInfo
    summary: str = ''
    skills: List[str] = None
    education: List[Education] = None
    experience: List[Experience] = None
    certifications: List[Certification] = None
    clearance: str = ''
    languages: List[str] = None
    years_of_experience: int = 0
    keywords: List[str] = None
    raw_text: str = ''
    parsing_confidence: float = 0.0

    def __post_init__(self):
        if self.skills is None:
            self.skills = []
        if self.education is None:
            self.education = []
        if self.experience is None:
            self.experience = []
        if self.certifications is None:
            self.certifications = []
        if self.languages is None:
            self.languages = []
        if self.keywords is None:
            self.keywords = []


class ResumeParser:
    """Handles parsing of resume documents."""

    def __init__(self):
        """Initialize the resume parser."""
        self.text = ''
        self.lines = []

        # Common patterns for resume parsing
        self.patterns = {
            'email': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
            'phone': r'(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})',
            'linkedin': r'linkedin\.com/in/[\w\-]+',
            'website': r'https?://[\w\.-]+\.[a-zA-Z]{2,}/?[\w\.-]*',
            'date_range': r'(\d{1,2}/\d{4}|\d{4}|\w+\s+\d{4})\s*[-–—]\s*(\d{1,2}/\d{4}|\d{4}|\w+\s+\d{4}|present|current)',
            'degree': r'\b(bachelor|master|phd|ph\.?d|b\.?s\.?|m\.?s\.?|m\.?a\.?|b\.?a\.?|associate)\b',
            'certification_keywords': r'\b(certified|certification|certificate|license|accredited)\b',
            'years_experience': r'(\d+)\+?\s*years?\s*(of\s+)?experience'
        }

    def extract_text_from_document(self, bucket: str, key: str) -> str:
        """Extract text from resume document."""
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

            if 'body' in result:
                body = json.loads(result['body'])
                return body.get('extracted_text', '')
            else:
                return result.get('extracted_text', '')

        except Exception as e:
            logger.error(f"Error extracting text from {key}: {str(e)}")
            return ''

    def parse_personal_info(self, text: str) -> PersonalInfo:
        """Extract personal information from resume."""
        personal_info = PersonalInfo()

        # Extract email
        email_match = re.search(self.patterns['email'], text, re.IGNORECASE)
        if email_match:
            personal_info.email = email_match.group().lower()

        # Extract phone
        phone_match = re.search(self.patterns['phone'], text)
        if phone_match:
            phone_parts = [part for part in phone_match.groups() if part]
            personal_info.phone = ''.join(phone_parts)

        # Extract LinkedIn
        linkedin_match = re.search(self.patterns['linkedin'], text, re.IGNORECASE)
        if linkedin_match:
            personal_info.linkedin = 'https://' + linkedin_match.group()

        # Extract website
        website_match = re.search(self.patterns['website'], text, re.IGNORECASE)
        if website_match:
            personal_info.website = website_match.group()

        # Extract name (heuristic - usually first line or near contact info)
        lines = text.split('\n')[:10]  # Check first 10 lines
        name_candidates = []

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Skip lines with email or phone
            if re.search(self.patterns['email'], line) or re.search(self.patterns['phone'], line):
                continue

            # Look for name-like patterns (2-4 words, mostly letters)
            words = line.split()
            if 2 <= len(words) <= 4 and all(re.match(r'^[A-Za-z\.\-\']+$', word) for word in words):
                name_candidates.append(line)

        if name_candidates:
            personal_info.full_name = name_candidates[0]

        # Extract address (look for common address patterns)
        address_patterns = [
            r'\d+\s+[\w\s]+,\s*[\w\s]+,?\s*[A-Z]{2}\s*\d{5}',
            r'[\w\s]+,\s*[A-Z]{2}\s*\d{5}',
            r'[\w\s]+,\s*[\w\s]+,\s*[A-Z]{2}'
        ]

        for pattern in address_patterns:
            match = re.search(pattern, text)
            if match:
                personal_info.address = match.group().strip()
                break

        return personal_info

    def parse_summary(self, text: str) -> str:
        """Extract professional summary or objective."""
        summary_keywords = [
            'summary', 'objective', 'profile', 'overview', 'about',
            'professional summary', 'career objective', 'executive summary'
        ]

        lines = text.split('\n')
        summary_start = -1
        summary_end = -1

        # Find summary section
        for i, line in enumerate(lines):
            line_lower = line.lower().strip()
            if any(keyword in line_lower for keyword in summary_keywords):
                summary_start = i + 1
                break

        if summary_start == -1:
            return ''

        # Find end of summary (next section or empty line after substantial text)
        section_keywords = [
            'experience', 'education', 'skills', 'employment', 'work history',
            'certifications', 'projects', 'achievements'
        ]

        summary_lines = []
        for i in range(summary_start, min(summary_start + 10, len(lines))):
            if i >= len(lines):
                break

            line = lines[i].strip()
            if not line and len(summary_lines) > 2:
                break

            if any(keyword in line.lower() for keyword in section_keywords):
                break

            if line:
                summary_lines.append(line)

        return ' '.join(summary_lines).strip()

    def parse_skills(self, text: str) -> List[str]:
        """Extract skills from resume."""
        skills = []

        # Look for skills section
        skills_section = self.extract_section(text, ['skills', 'technical skills', 'core competencies', 'expertise'])

        if skills_section:
            # Common skill patterns
            skill_patterns = [
                r'\b[A-Z][a-zA-Z+#\.]+\b',  # Technology names
                r'\b\w+\.\w+\b',  # Dotted notation (e.g., React.js)
                r'\b[A-Z]{2,10}\b',  # Acronyms
            ]

            # Split by common delimiters
            potential_skills = re.split(r'[,;|\n•\-]', skills_section)

            for skill in potential_skills:
                skill = skill.strip()
                if len(skill) > 1 and len(skill) < 50:  # Reasonable skill length
                    skills.append(skill)

        # Also look for skills mentioned in experience
        common_tech_skills = [
            'Python', 'Java', 'JavaScript', 'C++', 'C#', 'SQL', 'HTML', 'CSS',
            'React', 'Angular', 'Vue', 'Node.js', 'Django', 'Flask', 'Spring',
            'AWS', 'Azure', 'Docker', 'Kubernetes', 'Linux', 'Windows',
            'Git', 'Jenkins', 'Terraform', 'Ansible'
        ]

        for skill in common_tech_skills:
            if re.search(r'\b' + re.escape(skill) + r'\b', text, re.IGNORECASE):
                if skill not in skills:
                    skills.append(skill)

        return skills[:20]  # Limit to top 20 skills

    def parse_education(self, text: str) -> List[Education]:
        """Extract education information."""
        education_list = []

        education_section = self.extract_section(text, ['education', 'academic background', 'qualifications'])

        if not education_section:
            return education_list

        # Look for degree patterns
        degree_patterns = [
            r'(bachelor|master|phd|ph\.?d|b\.?s\.?|m\.?s\.?|m\.?a\.?|b\.?a\.?|associate).*?in\s+([\w\s]+)',
            r'(bachelor|master|phd|ph\.?d|b\.?s\.?|m\.?s\.?|m\.?a\.?|b\.?a\.?)[\s\w]*'
        ]

        lines = education_section.split('\n')
        current_education = Education()

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Look for degree
            for pattern in degree_patterns:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    current_education.degree = match.group(1).title()
                    if len(match.groups()) > 1:
                        current_education.field_of_study = match.group(2).strip()

            # Look for institution
            if not current_education.institution and len(line.split()) <= 8:
                # Likely an institution name
                current_education.institution = line

            # Look for graduation year
            year_match = re.search(r'\b(19|20)\d{2}\b', line)
            if year_match:
                current_education.graduation_year = year_match.group()

            # Look for GPA
            gpa_match = re.search(r'gpa:?\s*(\d\.\d+)', line, re.IGNORECASE)
            if gpa_match:
                current_education.gpa = gpa_match.group(1)

            # If we have enough info, save this education entry
            if current_education.degree and current_education.institution:
                education_list.append(current_education)
                current_education = Education()

        return education_list

    def parse_experience(self, text: str) -> List[Experience]:
        """Extract work experience."""
        experience_list = []

        experience_section = self.extract_section(text, [
            'experience', 'employment', 'work history', 'professional experience',
            'career history', 'work experience'
        ])

        if not experience_section:
            return experience_list

        lines = experience_section.split('\n')
        current_exp = Experience()
        description_lines = []

        for line in lines:
            line = line.strip()
            if not line:
                if current_exp.title and current_exp.company:
                    current_exp.description = ' '.join(description_lines)
                    experience_list.append(current_exp)
                    current_exp = Experience()
                    description_lines = []
                continue

            # Look for job title and company pattern
            title_company_patterns = [
                r'(.+?)\s+at\s+(.+)',
                r'(.+?)\s*[-–—]\s*(.+)',
                r'^([A-Z][^,\n]+),\s*(.+)$'
            ]

            title_found = False
            for pattern in title_company_patterns:
                match = re.search(pattern, line)
                if match and not current_exp.title:
                    current_exp.title = match.group(1).strip()
                    current_exp.company = match.group(2).strip()
                    title_found = True
                    break

            if not title_found:
                # Look for date range
                date_match = re.search(self.patterns['date_range'], line, re.IGNORECASE)
                if date_match:
                    current_exp.start_date = date_match.group(1)
                    current_exp.end_date = date_match.group(2)
                elif line.startswith('•') or line.startswith('-') or line.startswith('*'):
                    # Bullet point - likely achievement or responsibility
                    description_lines.append(line[1:].strip())
                else:
                    # Other description text
                    description_lines.append(line)

        # Don't forget the last experience
        if current_exp.title and current_exp.company:
            current_exp.description = ' '.join(description_lines)
            experience_list.append(current_exp)

        return experience_list

    def parse_certifications(self, text: str) -> List[Certification]:
        """Extract certifications."""
        certifications = []

        cert_section = self.extract_section(text, [
            'certifications', 'certificates', 'professional certifications',
            'licenses', 'credentials'
        ])

        if not cert_section:
            return certifications

        lines = cert_section.split('\n')

        for line in lines:
            line = line.strip()
            if not line:
                continue

            cert = Certification()
            cert.name = line

            # Look for issuer
            issuer_match = re.search(r'by\s+(.+?)\s*(?:\d{4}|\(|$)', line, re.IGNORECASE)
            if issuer_match:
                cert.issuer = issuer_match.group(1).strip()

            # Look for date
            date_match = re.search(r'\b(19|20)\d{2}\b', line)
            if date_match:
                cert.date_obtained = date_match.group()

            certifications.append(cert)

        return certifications

    def extract_section(self, text: str, section_keywords: List[str]) -> str:
        """Extract a specific section from the resume text."""
        lines = text.split('\n')
        section_start = -1
        section_end = -1

        # Find section start
        for i, line in enumerate(lines):
            line_lower = line.lower().strip()
            if any(keyword in line_lower for keyword in section_keywords):
                # Check if this line is likely a section header (short, contains keyword)
                if len(line.strip()) < 100 and any(keyword in line_lower for keyword in section_keywords):
                    section_start = i + 1
                    break

        if section_start == -1:
            return ''

        # Find section end (next section header or end of text)
        other_section_keywords = [
            'experience', 'education', 'skills', 'certifications', 'projects',
            'achievements', 'awards', 'publications', 'languages', 'interests'
        ]

        for i in range(section_start, len(lines)):
            line = lines[i].strip().lower()
            if line and len(line) < 100:  # Potential section header
                for keyword in other_section_keywords:
                    if keyword in line and keyword not in section_keywords:
                        section_end = i
                        break
            if section_end != -1:
                break

        if section_end == -1:
            section_end = len(lines)

        return '\n'.join(lines[section_start:section_end])

    def calculate_years_experience(self, experience_list: List[Experience]) -> int:
        """Calculate total years of experience."""
        total_months = 0

        for exp in experience_list:
            if exp.start_date and exp.end_date:
                try:
                    # Simple calculation - could be improved with proper date parsing
                    start_year = int(re.search(r'\d{4}', exp.start_date).group())

                    if exp.end_date.lower() in ['present', 'current']:
                        end_year = datetime.now().year
                    else:
                        end_year = int(re.search(r'\d{4}', exp.end_date).group())

                    total_months += (end_year - start_year) * 12
                except:
                    pass

        return max(0, total_months // 12)

    def use_ai_parsing(self, text: str) -> Dict[str, Any]:
        """Use AI model to enhance resume parsing."""
        try:
            # Truncate text for AI processing
            max_text_length = 6000
            text_sample = text[:max_text_length] if len(text) > max_text_length else text

            prompt = f"""
Parse the following resume and extract structured information. Return JSON with these fields:
- personal_info: {{name, email, phone, linkedin}}
- summary: professional summary or objective
- skills: array of technical skills
- experience: array of {{title, company, start_date, end_date, description}}
- education: array of {{degree, field, institution, year}}
- certifications: array of certification names
- years_of_experience: estimated total years
- clearance: security clearance level if mentioned

Resume text:
{text_sample}

Respond with valid JSON only:
"""

            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1500,
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

            try:
                return json.loads(ai_response)
            except json.JSONDecodeError:
                logger.warning("Could not parse AI resume parsing response")
                return {}

        except Exception as e:
            logger.error(f"Error in AI resume parsing: {str(e)}")
            return {}

    def parse_resume(self, bucket: str, key: str, filename: str = None) -> ParsedResume:
        """Parse a complete resume document."""
        if filename is None:
            filename = os.path.basename(key)

        # Extract text content
        logger.info(f"Extracting text from resume: {key}")
        text = self.extract_text_from_document(bucket, key)
        self.text = text

        if not text:
            logger.warning(f"Could not extract text from resume: {key}")
            return ParsedResume(personal_info=PersonalInfo(), raw_text='')

        self.lines = text.split('\n')

        # Parse using rule-based methods
        personal_info = self.parse_personal_info(text)
        summary = self.parse_summary(text)
        skills = self.parse_skills(text)
        education = self.parse_education(text)
        experience = self.parse_experience(text)
        certifications = self.parse_certifications(text)
        years_exp = self.calculate_years_experience(experience)

        # Extract clearance info
        clearance = ''
        clearance_match = re.search(r'(secret|top secret|ts|sci|clearance)', text, re.IGNORECASE)
        if clearance_match:
            clearance = clearance_match.group()

        # Use AI parsing to enhance results
        ai_results = self.use_ai_parsing(text)

        # Merge AI results with rule-based results
        if ai_results:
            if not personal_info.full_name and ai_results.get('personal_info', {}).get('name'):
                personal_info.full_name = ai_results['personal_info']['name']

            if not summary and ai_results.get('summary'):
                summary = ai_results['summary']

            if not skills and ai_results.get('skills'):
                skills = ai_results['skills']

            if not clearance and ai_results.get('clearance'):
                clearance = ai_results['clearance']

        # Extract keywords from the entire text
        keywords = self.extract_keywords(text)

        # Calculate parsing confidence based on completeness
        confidence = self.calculate_parsing_confidence(
            personal_info, summary, skills, education, experience
        )

        return ParsedResume(
            personal_info=personal_info,
            summary=summary,
            skills=skills,
            education=education,
            experience=experience,
            certifications=certifications,
            clearance=clearance,
            years_of_experience=years_exp,
            keywords=keywords,
            raw_text=text,
            parsing_confidence=confidence
        )

    def extract_keywords(self, text: str) -> List[str]:
        """Extract relevant keywords from the resume."""
        # Common industry keywords
        tech_keywords = [
            'agile', 'scrum', 'devops', 'cloud', 'security', 'database',
            'api', 'microservices', 'machine learning', 'artificial intelligence',
            'data science', 'big data', 'blockchain', 'iot', 'mobile'
        ]

        keywords = []
        text_lower = text.lower()

        for keyword in tech_keywords:
            if keyword in text_lower:
                keywords.append(keyword.title())

        return keywords

    def calculate_parsing_confidence(self, personal_info, summary, skills, education, experience) -> float:
        """Calculate confidence score for parsing results."""
        score = 0.0

        # Personal info completeness
        if personal_info.full_name:
            score += 0.2
        if personal_info.email:
            score += 0.15
        if personal_info.phone:
            score += 0.1

        # Content sections
        if summary:
            score += 0.15
        if skills:
            score += 0.15
        if education:
            score += 0.15
        if experience:
            score += 0.2

        return min(score, 1.0)


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


def log_parsing_action(user_info: Dict[str, str], action: str, details: Dict[str, Any]):
    """Log parsing actions for audit purposes."""
    try:
        audit_log_table.put_item(
            Item={
                'tenant_id': user_info['tenant_id'],
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'action_type': f'RESUME_PARSING_{action}',
                'user_id': user_info['user_id'],
                'company_id': user_info['company_id'],
                'resource_type': 'RESUME',
                'resource_id': details.get('s3_key', 'unknown'),
                'details': details,
                'ttl': int((datetime.now(timezone.utc).timestamp() + 7776000))  # 90 days
            }
        )
    except Exception as e:
        logger.error(f"Error logging parsing action: {str(e)}")


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
    """Main Lambda handler for resume parsing."""
    try:
        logger.info("Processing resume parsing request")

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

        # Parse the resume
        parser = ResumeParser()
        parsed_resume = parser.parse_resume(bucket, s3_key, filename)

        # Convert to dict for JSON serialization
        resume_dict = asdict(parsed_resume)

        # Log the parsing
        log_parsing_action(user_info, 'PARSE', {
            's3_key': s3_key,
            'bucket': bucket,
            'filename': filename,
            'parsing_confidence': parsed_resume.parsing_confidence,
            'has_name': bool(parsed_resume.personal_info.full_name),
            'has_experience': len(parsed_resume.experience) > 0,
            'has_education': len(parsed_resume.education) > 0,
            'years_experience': parsed_resume.years_of_experience
        })

        logger.info(f"Resume parsed: {s3_key} -> confidence: {parsed_resume.parsing_confidence:.2f}")

        return create_success_response({
            's3_key': s3_key,
            'filename': filename,
            'parsed_resume': resume_dict,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })

    except Exception as e:
        logger.error(f"Unexpected error in resume parsing: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'An internal error occurred while parsing the resume')