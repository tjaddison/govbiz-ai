"""
Company Profile Schema Validator
Validates and sanitizes company profile data according to business rules.
"""

import json
import logging
import os
import re
from typing import Dict, Any, List, Optional, Union
from datetime import datetime, timezone
from decimal import Decimal
import boto3

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')

# Environment variables
COMPANIES_TABLE_NAME = os.environ['COMPANIES_TABLE_NAME']
AUDIT_LOG_TABLE_NAME = os.environ['AUDIT_LOG_TABLE_NAME']

# Get DynamoDB tables
companies_table = dynamodb.Table(COMPANIES_TABLE_NAME)
audit_log_table = dynamodb.Table(AUDIT_LOG_TABLE_NAME)

# NAICS codes validation (sample - in production would be comprehensive)
VALID_NAICS_CODES = [
    # Construction
    '236115', '236116', '236117', '236118', '236210', '236220',
    # Professional Services
    '541110', '541120', '541211', '541213', '541214', '541219',
    '541330', '541350', '541370', '541380', '541410', '541420',
    '541430', '541511', '541512', '541513', '541519', '541611',
    '541612', '541613', '541614', '541618', '541620', '541690',
    '541715', '541720', '541730', '541810', '541820', '541830',
    '541840', '541850', '541860', '541870', '541880', '541890',
    '541921', '541922', '541930', '541940', '541990',
    # Information Technology
    '518210', '541511', '541512', '541513', '541519', '541611',
    '541612', '541613', '541614', '541618', '541715'
]

# Valid certifications
VALID_CERTIFICATIONS = [
    '8(a)', 'WOSB', 'EDWOSB', 'SDVOSB', 'HUBZone', 'VOSB',
    'SBA', 'DBE', 'MBE', 'WBE', 'DVBE', 'LGBTBE', 'SDB',
    'AbilityOne', 'GSA Schedule', 'SEWP', 'CIO-SP3', 'OASIS'
]

# Valid revenue ranges
VALID_REVENUE_RANGES = [
    'under-1m', '1m-5m', '5m-10m', '10m-50m', '50m-100m',
    '100m-500m', '500m-1b', 'over-1b'
]

# Valid employee count ranges
VALID_EMPLOYEE_RANGES = [
    '1-10', '11-50', '51-100', '101-250', '251-500',
    '501-1000', '1001-5000', 'over-5000'
]

# US states and territories
VALID_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
    'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
    'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
    'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
    'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI',
    'WY', 'AS', 'GU', 'MP', 'PR', 'VI'
]


class ValidationError(Exception):
    """Custom exception for validation errors."""
    def __init__(self, field: str, message: str):
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


class CompanyProfileValidator:
    """Handles validation and sanitization of company profile data."""

    def __init__(self):
        """Initialize the validator."""
        self.errors = []
        self.warnings = []

    def validate_required_fields(self, data: Dict[str, Any]) -> None:
        """Validate required fields are present and not empty."""
        required_fields = [
            'company_name', 'tenant_id', 'primary_contact_email',
            'primary_contact_name'
        ]

        for field in required_fields:
            if field not in data or not data[field]:
                self.errors.append(ValidationError(field, "This field is required"))

    def validate_company_name(self, company_name: str) -> str:
        """Validate and sanitize company name."""
        if not company_name or not isinstance(company_name, str):
            self.errors.append(ValidationError('company_name', 'Company name must be a non-empty string'))
            return ''

        # Clean up the name
        sanitized = re.sub(r'[^\w\s\.\-&,\(\)]', '', company_name.strip())

        if len(sanitized) < 2:
            self.errors.append(ValidationError('company_name', 'Company name must be at least 2 characters'))
            return sanitized

        if len(sanitized) > 200:
            self.warnings.append(f'Company name truncated to 200 characters')
            sanitized = sanitized[:200]

        return sanitized

    def validate_email(self, email: str, field_name: str = 'email') -> str:
        """Validate email address."""
        if not email:
            return ''

        email = email.strip().lower()
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

        if not re.match(email_pattern, email):
            self.errors.append(ValidationError(field_name, 'Invalid email address format'))
            return email

        if len(email) > 254:
            self.errors.append(ValidationError(field_name, 'Email address is too long'))

        return email

    def validate_phone(self, phone: str, field_name: str = 'phone') -> str:
        """Validate and format phone number."""
        if not phone:
            return ''

        # Remove all non-digit characters
        digits_only = re.sub(r'[^\d]', '', phone)

        # Handle international numbers (keep as is if starts with 1 and has 11 digits)
        if len(digits_only) == 11 and digits_only.startswith('1'):
            formatted = f"+1-{digits_only[1:4]}-{digits_only[4:7]}-{digits_only[7:]}"
        elif len(digits_only) == 10:
            formatted = f"{digits_only[:3]}-{digits_only[3:6]}-{digits_only[6:]}"
        else:
            self.warnings.append(f'{field_name}: Phone number format could not be standardized')
            return phone

        return formatted

    def validate_website_url(self, url: str) -> str:
        """Validate and normalize website URL."""
        if not url:
            return ''

        url = url.strip().lower()

        # Add protocol if missing
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url

        # Basic URL validation
        url_pattern = r'^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$'

        if not re.match(url_pattern, url):
            self.errors.append(ValidationError('website_url', 'Invalid website URL format'))

        return url

    def validate_naics_codes(self, naics_codes: List[str]) -> List[str]:
        """Validate NAICS codes."""
        if not naics_codes:
            return []

        if not isinstance(naics_codes, list):
            self.errors.append(ValidationError('naics_codes', 'NAICS codes must be a list'))
            return []

        validated_codes = []
        for code in naics_codes:
            if not isinstance(code, str):
                self.warnings.append(f'Skipping non-string NAICS code: {code}')
                continue

            code = code.strip()
            if len(code) != 6 or not code.isdigit():
                self.warnings.append(f'Invalid NAICS code format: {code}')
                continue

            # In production, you'd validate against the complete NAICS database
            # For demo, we validate against a subset
            if code not in VALID_NAICS_CODES:
                self.warnings.append(f'NAICS code not in validated list: {code}')

            validated_codes.append(code)

        if len(validated_codes) > 10:
            self.warnings.append('Too many NAICS codes, keeping first 10')
            validated_codes = validated_codes[:10]

        return validated_codes

    def validate_certifications(self, certifications: List[str]) -> List[str]:
        """Validate certifications."""
        if not certifications:
            return []

        if not isinstance(certifications, list):
            self.errors.append(ValidationError('certifications', 'Certifications must be a list'))
            return []

        validated_certs = []
        for cert in certifications:
            if not isinstance(cert, str):
                continue

            cert = cert.strip()
            if cert in VALID_CERTIFICATIONS:
                validated_certs.append(cert)
            else:
                self.warnings.append(f'Unknown certification: {cert}')
                validated_certs.append(cert)  # Keep it but warn

        return list(set(validated_certs))  # Remove duplicates

    def validate_revenue_range(self, revenue_range: str) -> str:
        """Validate revenue range."""
        if not revenue_range:
            return ''

        if revenue_range not in VALID_REVENUE_RANGES:
            self.errors.append(ValidationError('revenue_range', f'Invalid revenue range: {revenue_range}'))

        return revenue_range

    def validate_employee_count(self, employee_count: str) -> str:
        """Validate employee count range."""
        if not employee_count:
            return ''

        if employee_count not in VALID_EMPLOYEE_RANGES:
            self.errors.append(ValidationError('employee_count', f'Invalid employee count range: {employee_count}'))

        return employee_count

    def validate_locations(self, locations: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """Validate geographic locations."""
        if not locations:
            return []

        if not isinstance(locations, list):
            self.errors.append(ValidationError('locations', 'Locations must be a list'))
            return []

        validated_locations = []
        for i, location in enumerate(locations):
            if not isinstance(location, dict):
                self.warnings.append(f'Skipping invalid location at index {i}')
                continue

            validated_location = {}

            # Validate city
            city = location.get('city', '').strip()
            if city:
                validated_location['city'] = re.sub(r'[^\w\s\-\.]', '', city)[:100]

            # Validate state
            state = location.get('state', '').strip().upper()
            if state:
                if state in VALID_STATES:
                    validated_location['state'] = state
                else:
                    self.warnings.append(f'Invalid state code: {state}')

            # Validate zip code
            zip_code = location.get('zip_code', '').strip()
            if zip_code:
                zip_pattern = r'^\d{5}(-\d{4})?$'
                if re.match(zip_pattern, zip_code):
                    validated_location['zip_code'] = zip_code
                else:
                    self.warnings.append(f'Invalid zip code: {zip_code}')

            # Only include location if it has at least city and state
            if 'city' in validated_location and 'state' in validated_location:
                validated_locations.append(validated_location)

        return validated_locations

    def validate_capability_statement(self, capability_statement: str) -> str:
        """Validate capability statement."""
        if not capability_statement:
            return ''

        # Remove HTML tags and excessive whitespace
        import re
        clean_text = re.sub(r'<[^>]+>', '', capability_statement)
        clean_text = re.sub(r'\s+', ' ', clean_text).strip()

        if len(clean_text) > 10000:
            self.warnings.append('Capability statement truncated to 10,000 characters')
            clean_text = clean_text[:10000]

        return clean_text

    def validate_duns_number(self, duns: str) -> str:
        """Validate DUNS number."""
        if not duns:
            return ''

        duns = re.sub(r'[^\d]', '', duns)

        if len(duns) != 9:
            self.errors.append(ValidationError('duns_number', 'DUNS number must be 9 digits'))
            return duns

        return duns

    def validate_cage_code(self, cage_code: str) -> str:
        """Validate CAGE code."""
        if not cage_code:
            return ''

        cage_code = cage_code.strip().upper()

        if len(cage_code) != 5 or not cage_code.isalnum():
            self.errors.append(ValidationError('cage_code', 'CAGE code must be 5 alphanumeric characters'))

        return cage_code

    def validate_profile(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate complete company profile."""
        self.errors = []
        self.warnings = []

        # Validate required fields first
        self.validate_required_fields(data)

        validated_data = {
            'tenant_id': data.get('tenant_id', ''),
            'company_id': data.get('company_id', ''),
            'updated_at': datetime.now(timezone.utc).isoformat(),
            'version': data.get('version', 1) + 1 if 'version' in data else 1
        }

        # Validate and sanitize all fields
        validated_data['company_name'] = self.validate_company_name(data.get('company_name', ''))
        validated_data['duns_number'] = self.validate_duns_number(data.get('duns_number', ''))
        validated_data['cage_code'] = self.validate_cage_code(data.get('cage_code', ''))
        validated_data['website_url'] = self.validate_website_url(data.get('website_url', ''))
        validated_data['naics_codes'] = self.validate_naics_codes(data.get('naics_codes', []))
        validated_data['certifications'] = self.validate_certifications(data.get('certifications', []))
        validated_data['revenue_range'] = self.validate_revenue_range(data.get('revenue_range', ''))
        validated_data['employee_count'] = self.validate_employee_count(data.get('employee_count', ''))
        validated_data['locations'] = self.validate_locations(data.get('locations', []))
        validated_data['capability_statement'] = self.validate_capability_statement(data.get('capability_statement', ''))

        # Contact information
        validated_data['primary_contact_name'] = data.get('primary_contact_name', '').strip()
        validated_data['primary_contact_email'] = self.validate_email(data.get('primary_contact_email', ''), 'primary_contact_email')
        validated_data['primary_contact_phone'] = self.validate_phone(data.get('primary_contact_phone', ''), 'primary_contact_phone')

        # Secondary contact (optional)
        if data.get('secondary_contact_email'):
            validated_data['secondary_contact_name'] = data.get('secondary_contact_name', '').strip()
            validated_data['secondary_contact_email'] = self.validate_email(data.get('secondary_contact_email', ''), 'secondary_contact_email')
            validated_data['secondary_contact_phone'] = self.validate_phone(data.get('secondary_contact_phone', ''), 'secondary_contact_phone')

        # Additional metadata
        validated_data['created_at'] = data.get('created_at', datetime.now(timezone.utc).isoformat())
        validated_data['is_active'] = bool(data.get('is_active', True))

        return validated_data

    def get_validation_results(self) -> Dict[str, Any]:
        """Get validation results."""
        return {
            'is_valid': len(self.errors) == 0,
            'errors': [{'field': e.field, 'message': e.message} for e in self.errors],
            'warnings': self.warnings
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


def log_validation_action(user_info: Dict[str, str], action: str, details: Dict[str, Any]):
    """Log validation actions for audit purposes."""
    try:
        audit_log_table.put_item(
            Item={
                'tenant_id': user_info['tenant_id'],
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'action_type': f'PROFILE_VALIDATION_{action}',
                'user_id': user_info['user_id'],
                'company_id': user_info['company_id'],
                'resource_type': 'COMPANY_PROFILE',
                'resource_id': user_info['company_id'],
                'details': details,
                'ttl': int((datetime.now(timezone.utc).timestamp() + 7776000))  # 90 days
            }
        )
    except Exception as e:
        logger.error(f"Error logging validation action: {str(e)}")


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
    """Main Lambda handler for company profile validation."""
    try:
        logger.info("Processing company profile validation request")

        # Parse request body
        try:
            body = json.loads(event.get('body', '{}'))
        except json.JSONDecodeError:
            return create_error_response(400, 'INVALID_JSON', 'Invalid JSON in request body')

        user_info = get_user_info(event)

        # Create validator and validate profile
        validator = CompanyProfileValidator()
        validated_data = validator.validate_profile(body)
        validation_results = validator.get_validation_results()

        # Log validation attempt
        log_validation_action(user_info, 'VALIDATE', {
            'validation_results': validation_results,
            'has_errors': not validation_results['is_valid'],
            'error_count': len(validation_results['errors']),
            'warning_count': len(validation_results['warnings'])
        })

        response_data = {
            'validated_data': validated_data,
            'validation_results': validation_results
        }

        if validation_results['is_valid']:
            logger.info(f"Profile validation successful for company {user_info['company_id']}")
            return create_success_response(response_data)
        else:
            logger.warning(f"Profile validation failed for company {user_info['company_id']}: {len(validation_results['errors'])} errors")
            return {
                'statusCode': 422,  # Unprocessable Entity
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                },
                'body': json.dumps(response_data, default=str)
            }

    except Exception as e:
        logger.error(f"Unexpected error in profile validation: {str(e)}")
        return create_error_response(500, 'INTERNAL_ERROR', 'An internal error occurred while validating the profile')