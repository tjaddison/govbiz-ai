"""
Capability Statement Processor
Extracts and structures information from capability statements.
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
class CompanyOverview:
    """Company overview information."""
    company_name: str = ''
    founded_year: str = ''
    headquarters: str = ''
    employee_count: str = ''
    revenue_range: str = ''
    company_type: str = ''
    ownership: str = ''
    duns_number: str = ''
    cage_code: str = ''


@dataclass
class CoreCapability:
    """Individual capability entry."""
    name: str = ''
    description: str = ''
    naics_codes: List[str] = None
    keywords: List[str] = None

    def __post_init__(self):
        if self.naics_codes is None:
            self.naics_codes = []
        if self.keywords is None:
            self.keywords = []


@dataclass
class PastPerformanceItem:
    """Past performance project."""
    project_name: str = ''
    client: str = ''
    contract_value: str = ''
    duration: str = ''
    description: str = ''
    role: str = ''
    completion_date: str = ''


@dataclass
class Certification:
    """Certification or accreditation."""
    name: str = ''
    issuer: str = ''
    certification_number: str = ''
    expiry_date: str = ''


@dataclass
class ContactInfo:
    """Contact information."""
    name: str = ''
    title: str = ''
    phone: str = ''
    email: str = ''
    address: str = ''


@dataclass
class ProcessedCapabilityStatement:
    """Complete processed capability statement structure."""
    company_overview: CompanyOverview
    mission_statement: str = ''
    core_capabilities: List[CoreCapability] = None
    past_performance: List[PastPerformanceItem] = None
    certifications: List[Certification] = None
    contact_info: ContactInfo = None
    differentiators: List[str] = None
    naics_codes: List[str] = None
    set_asides: List[str] = None
    key_personnel: List[str] = None
    contract_vehicles: List[str] = None
    geographic_coverage: List[str] = None
    processing_confidence: float = 0.0
    extracted_keywords: List[str] = None
    raw_text: str = ''

    def __post_init__(self):
        if self.core_capabilities is None:
            self.core_capabilities = []
        if self.past_performance is None:
            self.past_performance = []
        if self.certifications is None:
            self.certifications = []
        if self.contact_info is None:
            self.contact_info = ContactInfo()
        if self.differentiators is None:
            self.differentiators = []
        if self.naics_codes is None:
            self.naics_codes = []
        if self.set_asides is None:
            self.set_asides = []
        if self.key_personnel is None:
            self.key_personnel = []
        if self.contract_vehicles is None:
            self.contract_vehicles = []
        if self.geographic_coverage is None:
            self.geographic_coverage = []
        if self.extracted_keywords is None:
            self.extracted_keywords = []


class CapabilityStatementProcessor:
    """Processes capability statement documents."""

    def __init__(self):
        """Initialize the processor."""
        self.text = ''
        self.lines = []

        # Common patterns for capability statement parsing
        self.patterns = {
            'email': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
            'phone': r'(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})',
            'duns': r'duns?[\s:]*([\d\-]{9,15})',
            'cage': r'cage[\s:]*([a-z0-9]{5})',
            'naics': r'naics[\s:]*(\d{6})',
            'year': r'\b(19|20)\d{2}\b',
            'contract_value': r'\$[\d,]+(?:\.\d{2})?[km]?',
            'employee_count': r'(\d+)\+?\s*employees?',
            'set_aside': r'\b(8\(a\)|wosb|sdvosb|hubzone|sdb|vosb|edwosb)\b'
        }

        # Known certifications and set-asides
        self.certifications = [
            'ISO 9001', 'ISO 27001', 'CMMI', 'SOC 2', 'FedRAMP', 'FISMA',
            '8(a)', 'WOSB', 'SDVOSB', 'HUBZone', 'VOSB', 'EDWOSB', 'SDB'
        ]

        # Contract vehicles
        self.contract_vehicles = [
            'GSA Schedule', 'SEWP', 'CIO-SP3', 'OASIS', 'STARS III',
            'SeaPort-e', 'T4NG', 'ITSS-4', 'SATCOM III'
        ]

    def extract_text_from_document(self, bucket: str, key: str) -> str:
        """Extract text from capability statement document."""
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

    def parse_company_overview(self, text: str) -> CompanyOverview:
        """Extract company overview information."""
        overview = CompanyOverview()
        text_lower = text.lower()

        # Extract company name (usually in the first few lines or in header)
        lines = text.split('\n')[:10]
        for line in lines:
            line = line.strip()
            if len(line) > 5 and len(line) < 100:
                # Skip lines with common header/footer elements
                if not any(skip in line.lower() for skip in ['page', 'confidential', 'proprietary', 'date']):
                    words = line.split()
                    if 2 <= len(words) <= 8:  # Reasonable company name length
                        overview.company_name = line
                        break

        # Extract DUNS number
        duns_match = re.search(self.patterns['duns'], text_lower)
        if duns_match:
            overview.duns_number = duns_match.group(1).replace('-', '')

        # Extract CAGE code
        cage_match = re.search(self.patterns['cage'], text_lower)
        if cage_match:
            overview.cage_code = cage_match.group(1).upper()

        # Extract founded year
        founded_patterns = [
            r'founded\s+in\s+(\d{4})',
            r'established\s+in\s+(\d{4})',
            r'since\s+(\d{4})'
        ]
        for pattern in founded_patterns:
            match = re.search(pattern, text_lower)
            if match:
                overview.founded_year = match.group(1)
                break

        # Extract employee count
        employee_match = re.search(self.patterns['employee_count'], text_lower)
        if employee_match:
            overview.employee_count = employee_match.group(1)

        # Extract headquarters location
        location_patterns = [
            r'headquarters[^.]*?([a-z]+,\s*[a-z]{2})',
            r'located in\s+([a-z\s,]+)',
            r'based in\s+([a-z\s,]+)'
        ]
        for pattern in location_patterns:
            match = re.search(pattern, text_lower)
            if match:
                overview.headquarters = match.group(1).title()
                break

        # Extract company type/ownership
        if 'small business' in text_lower:
            overview.company_type = 'Small Business'
        elif 'large business' in text_lower:
            overview.company_type = 'Large Business'

        if 'woman owned' in text_lower:
            overview.ownership = 'Woman Owned'
        elif 'veteran owned' in text_lower:
            overview.ownership = 'Veteran Owned'
        elif 'minority owned' in text_lower:
            overview.ownership = 'Minority Owned'

        return overview

    def parse_mission_statement(self, text: str) -> str:
        """Extract mission statement or company description."""
        mission_keywords = [
            'mission', 'vision', 'our mission', 'company mission',
            'mission statement', 'company overview', 'about us', 'who we are'
        ]

        lines = text.split('\n')
        mission_start = -1

        # Find mission section
        for i, line in enumerate(lines):
            line_lower = line.lower().strip()
            if any(keyword in line_lower for keyword in mission_keywords):
                if len(line.strip()) < 100:  # Likely a header
                    mission_start = i + 1
                    break

        if mission_start == -1:
            # Look for introductory paragraphs
            for i, line in enumerate(lines[:20]):  # Check first 20 lines
                if len(line.strip()) > 100:  # Substantial content
                    return line.strip()
            return ''

        # Extract mission text
        mission_lines = []
        section_keywords = [
            'capabilities', 'services', 'experience', 'past performance',
            'certifications', 'contact', 'core competencies'
        ]

        for i in range(mission_start, min(mission_start + 10, len(lines))):
            if i >= len(lines):
                break

            line = lines[i].strip()
            if not line and len(mission_lines) > 1:
                break

            if any(keyword in line.lower() for keyword in section_keywords):
                break

            if line:
                mission_lines.append(line)

        return ' '.join(mission_lines).strip()

    def parse_core_capabilities(self, text: str) -> List[CoreCapability]:
        """Extract core capabilities."""
        capabilities = []

        # Find capabilities section
        capability_section = self.extract_section(text, [
            'capabilities', 'core capabilities', 'services', 'competencies',
            'core competencies', 'service offerings', 'what we do'
        ])

        if not capability_section:
            return capabilities

        lines = capability_section.split('\n')
        current_capability = None

        for line in lines:
            line = line.strip()
            if not line:
                if current_capability:
                    capabilities.append(current_capability)
                    current_capability = None
                continue

            # Check if this is a capability header (bullet point or short line)
            if line.startswith('•') or line.startswith('-') or line.startswith('*'):
                if current_capability:
                    capabilities.append(current_capability)

                current_capability = CoreCapability()
                current_capability.name = line[1:].strip()
            elif len(line) < 100 and not current_capability:
                # Likely a capability name without bullet
                current_capability = CoreCapability()
                current_capability.name = line
            elif current_capability:
                # Description text
                if current_capability.description:
                    current_capability.description += ' ' + line
                else:
                    current_capability.description = line

        # Don't forget the last capability
        if current_capability:
            capabilities.append(current_capability)

        return capabilities

    def parse_past_performance(self, text: str) -> List[PastPerformanceItem]:
        """Extract past performance information."""
        performance_items = []

        # Find past performance section
        performance_section = self.extract_section(text, [
            'past performance', 'experience', 'project experience',
            'representative projects', 'selected projects', 'client experience'
        ])

        if not performance_section:
            return performance_items

        lines = performance_section.split('\n')
        current_project = None

        for line in lines:
            line = line.strip()
            if not line:
                if current_project and current_project.project_name:
                    performance_items.append(current_project)
                    current_project = None
                continue

            # Look for project indicators
            if line.startswith('•') or line.startswith('-') or line.startswith('*'):
                if current_project:
                    performance_items.append(current_project)

                current_project = PastPerformanceItem()
                project_text = line[1:].strip()

                # Try to extract client and project name
                if ' - ' in project_text:
                    parts = project_text.split(' - ', 1)
                    current_project.client = parts[0].strip()
                    current_project.project_name = parts[1].strip()
                else:
                    current_project.project_name = project_text

            elif current_project:
                # Look for contract value
                value_match = re.search(self.patterns['contract_value'], line)
                if value_match:
                    current_project.contract_value = value_match.group()

                # Look for duration or dates
                year_matches = re.findall(self.patterns['year'], line)
                if len(year_matches) == 2:
                    current_project.duration = f"{year_matches[0]} - {year_matches[1]}"
                elif len(year_matches) == 1:
                    current_project.completion_date = year_matches[0]

                # Add to description
                if current_project.description:
                    current_project.description += ' ' + line
                else:
                    current_project.description = line

            elif len(line) < 150:  # Potential project header without bullet
                if current_project:
                    performance_items.append(current_project)

                current_project = PastPerformanceItem()
                current_project.project_name = line

        # Don't forget the last project
        if current_project and current_project.project_name:
            performance_items.append(current_project)

        return performance_items

    def parse_certifications(self, text: str) -> List[Certification]:
        """Extract certifications."""
        certifications = []
        text_lower = text.lower()

        for cert_name in self.certifications:
            if cert_name.lower() in text_lower:
                cert = Certification()
                cert.name = cert_name

                # Look for additional details around the certification
                cert_context = self.get_context_around_keyword(text, cert_name, 50)

                # Extract expiry date
                year_matches = re.findall(self.patterns['year'], cert_context)
                if year_matches:
                    cert.expiry_date = year_matches[-1]  # Assume last year is expiry

                certifications.append(cert)

        return certifications

    def parse_contact_info(self, text: str) -> ContactInfo:
        """Extract contact information."""
        contact = ContactInfo()

        # Extract email
        email_match = re.search(self.patterns['email'], text)
        if email_match:
            contact.email = email_match.group().lower()

        # Extract phone
        phone_match = re.search(self.patterns['phone'], text)
        if phone_match:
            contact.phone = ''.join(phone_match.groups()[1:])  # Skip country code

        # Look for contact section
        contact_section = self.extract_section(text, [
            'contact', 'contact information', 'contact us', 'point of contact',
            'primary contact', 'for more information'
        ])

        if contact_section:
            lines = contact_section.split('\n')
            for line in lines:
                line = line.strip()
                if not line:
                    continue

                # Look for name (first non-header line that looks like a name)
                if not contact.name and len(line.split()) in [2, 3, 4]:
                    if not re.search(self.patterns['email'], line) and not re.search(self.patterns['phone'], line):
                        contact.name = line

                # Look for title
                title_keywords = ['president', 'director', 'manager', 'officer', 'ceo', 'cto', 'cfo']
                if any(keyword in line.lower() for keyword in title_keywords):
                    contact.title = line

        return contact

    def parse_naics_codes(self, text: str) -> List[str]:
        """Extract NAICS codes."""
        naics_codes = []

        # Find all NAICS code patterns
        naics_matches = re.findall(self.patterns['naics'], text.lower())
        naics_codes.extend(naics_matches)

        # Look for explicit NAICS sections
        naics_section = self.extract_section(text, ['naics', 'naics codes', 'industry codes'])
        if naics_section:
            # Extract 6-digit codes
            code_matches = re.findall(r'\b\d{6}\b', naics_section)
            naics_codes.extend(code_matches)

        return list(set(naics_codes))  # Remove duplicates

    def parse_set_asides(self, text: str) -> List[str]:
        """Extract set-aside certifications."""
        set_asides = []
        text_lower = text.lower()

        set_aside_mappings = {
            '8(a)': ['8(a)', '8a', 'eight a'],
            'WOSB': ['wosb', 'woman owned small business', 'woman-owned small business'],
            'SDVOSB': ['sdvosb', 'service-disabled veteran-owned small business'],
            'HUBZone': ['hubzone', 'hub zone', 'historically underutilized business zone'],
            'VOSB': ['vosb', 'veteran-owned small business'],
            'EDWOSB': ['edwosb', 'economically disadvantaged woman-owned small business'],
            'SDB': ['sdb', 'small disadvantaged business']
        }

        for set_aside, keywords in set_aside_mappings.items():
            if any(keyword in text_lower for keyword in keywords):
                set_asides.append(set_aside)

        return set_asides

    def parse_contract_vehicles(self, text: str) -> List[str]:
        """Extract contract vehicles."""
        vehicles = []
        text_lower = text.lower()

        for vehicle in self.contract_vehicles:
            if vehicle.lower() in text_lower:
                vehicles.append(vehicle)

        return vehicles

    def extract_keywords(self, text: str) -> List[str]:
        """Extract relevant keywords from capability statement."""
        # Industry and technology keywords
        keywords_dict = {
            'technology': ['cloud', 'cybersecurity', 'ai', 'machine learning', 'data analytics',
                          'software development', 'mobile', 'web', 'database', 'network'],
            'consulting': ['strategy', 'management consulting', 'business analysis',
                          'process improvement', 'change management', 'project management'],
            'engineering': ['systems engineering', 'software engineering', 'civil engineering',
                           'electrical engineering', 'mechanical engineering', 'design'],
            'operations': ['logistics', 'supply chain', 'facilities management',
                          'maintenance', 'operations support', 'help desk'],
            'training': ['training', 'education', 'learning management', 'curriculum development'],
            'research': ['research', 'development', 'analysis', 'evaluation', 'assessment']
        }

        keywords = []
        text_lower = text.lower()

        for category, terms in keywords_dict.items():
            for term in terms:
                if term in text_lower:
                    keywords.append(term.title())

        return keywords

    def extract_section(self, text: str, section_keywords: List[str]) -> str:
        """Extract a specific section from the capability statement."""
        lines = text.split('\n')
        section_start = -1
        section_end = -1

        # Find section start
        for i, line in enumerate(lines):
            line_lower = line.lower().strip()
            if any(keyword in line_lower for keyword in section_keywords):
                if len(line.strip()) < 100:  # Likely a section header
                    section_start = i + 1
                    break

        if section_start == -1:
            return ''

        # Find section end
        other_section_keywords = [
            'mission', 'capabilities', 'services', 'experience', 'past performance',
            'certifications', 'contact', 'naics', 'differentiators', 'personnel'
        ]

        for i in range(section_start, len(lines)):
            line = lines[i].strip().lower()
            if line and len(line) < 100:
                for keyword in other_section_keywords:
                    if keyword in line and keyword not in section_keywords:
                        section_end = i
                        break
            if section_end != -1:
                break

        if section_end == -1:
            section_end = len(lines)

        return '\n'.join(lines[section_start:section_end])

    def get_context_around_keyword(self, text: str, keyword: str, context_size: int = 100) -> str:
        """Get text context around a keyword."""
        keyword_pos = text.lower().find(keyword.lower())
        if keyword_pos == -1:
            return ''

        start = max(0, keyword_pos - context_size)
        end = min(len(text), keyword_pos + len(keyword) + context_size)

        return text[start:end]

    def use_ai_enhancement(self, text: str) -> Dict[str, Any]:
        """Use AI to enhance capability statement processing."""
        try:
            max_text_length = 6000
            text_sample = text[:max_text_length] if len(text) > max_text_length else text

            prompt = f"""
Analyze this capability statement and extract structured information. Return JSON with:
- company_overview: {{company_name, founded_year, employee_count, headquarters}}
- mission_statement: brief company mission or description
- core_capabilities: array of capability names and descriptions
- past_performance: array of {{project_name, client, description}}
- certifications: array of certification names
- naics_codes: array of 6-digit NAICS codes
- set_asides: array of set-aside certifications (8(a), WOSB, SDVOSB, etc.)
- contact_info: {{name, email, phone}}
- differentiators: array of competitive advantages
- keywords: array of relevant industry keywords

Capability Statement:
{text_sample}

Return valid JSON only:
"""

            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2000,
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
                logger.warning("Could not parse AI capability statement response")
                return {}

        except Exception as e:
            logger.error(f"Error in AI capability statement processing: {str(e)}")
            return {}

    def calculate_processing_confidence(self, processed: ProcessedCapabilityStatement) -> float:
        """Calculate confidence score for processing results."""
        score = 0.0

        # Company overview completeness
        if processed.company_overview.company_name:
            score += 0.15
        if processed.company_overview.duns_number or processed.company_overview.cage_code:
            score += 0.1

        # Core content sections
        if processed.mission_statement:
            score += 0.15
        if processed.core_capabilities:
            score += 0.2
        if processed.past_performance:
            score += 0.15
        if processed.naics_codes:
            score += 0.1
        if processed.contact_info.email or processed.contact_info.phone:
            score += 0.1
        if processed.certifications or processed.set_asides:
            score += 0.05

        return min(score, 1.0)

    def process_capability_statement(self, bucket: str, key: str, filename: str = None) -> ProcessedCapabilityStatement:
        """Process a complete capability statement document."""
        if filename is None:
            filename = os.path.basename(key)

        # Extract text content
        logger.info(f"Processing capability statement: {key}")
        text = self.extract_text_from_document(bucket, key)
        self.text = text

        if not text:
            logger.warning(f"Could not extract text from capability statement: {key}")
            return ProcessedCapabilityStatement(
                company_overview=CompanyOverview(),
                raw_text=''
            )

        self.lines = text.split('\n')

        # Parse using rule-based methods
        company_overview = self.parse_company_overview(text)
        mission_statement = self.parse_mission_statement(text)
        core_capabilities = self.parse_core_capabilities(text)
        past_performance = self.parse_past_performance(text)
        certifications = self.parse_certifications(text)
        contact_info = self.parse_contact_info(text)
        naics_codes = self.parse_naics_codes(text)
        set_asides = self.parse_set_asides(text)
        contract_vehicles = self.parse_contract_vehicles(text)
        keywords = self.extract_keywords(text)

        # Use AI enhancement
        ai_results = self.use_ai_enhancement(text)

        # Merge AI results with rule-based results
        if ai_results:
            if not company_overview.company_name and ai_results.get('company_overview', {}).get('company_name'):
                company_overview.company_name = ai_results['company_overview']['company_name']

            if not mission_statement and ai_results.get('mission_statement'):
                mission_statement = ai_results['mission_statement']

            if not naics_codes and ai_results.get('naics_codes'):
                naics_codes = ai_results['naics_codes']

            if ai_results.get('differentiators'):
                differentiators = ai_results['differentiators']
            else:
                differentiators = []

        else:
            differentiators = []

        # Create processed result
        processed = ProcessedCapabilityStatement(
            company_overview=company_overview,
            mission_statement=mission_statement,
            core_capabilities=core_capabilities,
            past_performance=past_performance,
            certifications=certifications,
            contact_info=contact_info,
            differentiators=differentiators,
            naics_codes=naics_codes,
            set_asides=set_asides,
            contract_vehicles=contract_vehicles,
            extracted_keywords=keywords,
            raw_text=text
        )

        # Calculate confidence
        processed.processing_confidence = self.calculate_processing_confidence(processed)

        return processed


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


def log_processing_action(user_info: Dict[str, str], action: str, details: Dict[str, Any]):
    """Log processing actions for audit purposes."""
    try:
        audit_log_table.put_item(
            Item={
                'tenant_id': user_info['tenant_id'],
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'action_type': f'CAPABILITY_PROCESSING_{action}',
                'user_id': user_info['user_id'],
                'company_id': user_info['company_id'],
                'resource_type': 'CAPABILITY_STATEMENT',
                'resource_id': details.get('s3_key', 'unknown'),
                'details': details,
                'ttl': int((datetime.now(timezone.utc).timestamp() + 7776000))  # 90 days
            }
        )
    except Exception as e:
        logger.error(f"Error logging processing action: {str(e)}")


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
    """Main Lambda handler for capability statement processing."""
    try:
        logger.info("Processing capability statement request")

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

        # Process the capability statement
        processor = CapabilityStatementProcessor()
        processed_statement = processor.process_capability_statement(bucket, s3_key, filename)

        # Convert to dict for JSON serialization
        statement_dict = asdict(processed_statement)

        # Log the processing
        log_processing_action(user_info, 'PROCESS', {
            's3_key': s3_key,
            'bucket': bucket,
            'filename': filename,
            'processing_confidence': processed_statement.processing_confidence,
            'has_company_name': bool(processed_statement.company_overview.company_name),
            'has_mission': bool(processed_statement.mission_statement),
            'capabilities_count': len(processed_statement.core_capabilities),
            'performance_count': len(processed_statement.past_performance),
            'naics_count': len(processed_statement.naics_codes)
        })

        logger.info(f"Capability statement processed: {s3_key} -> confidence: {processed_statement.processing_confidence:.2f}")

        return create_success_response({
            's3_key': s3_key,
            'filename': filename,
            'processed_statement': statement_dict,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })

    except Exception as e:
        logger.error(f"Unexpected error in capability statement processing: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'An internal error occurred while processing the capability statement')