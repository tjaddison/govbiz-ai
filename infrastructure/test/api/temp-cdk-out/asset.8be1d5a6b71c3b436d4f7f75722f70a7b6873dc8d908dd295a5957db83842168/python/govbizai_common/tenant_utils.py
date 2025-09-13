"""
Tenant management utilities.
"""
import uuid
import boto3
from datetime import datetime
from typing import Dict, Any, Optional
import json
import re
from decimal import Decimal

class TenantManager:
    """Manages tenant operations in DynamoDB."""

    def __init__(self, tenants_table_name: str, companies_table_name: str):
        self.dynamodb = boto3.resource('dynamodb')
        self.tenants_table = self.dynamodb.Table(tenants_table_name)
        self.companies_table = self.dynamodb.Table(companies_table_name)

    def create_tenant(self, tenant_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new tenant with associated company."""
        tenant_id = str(uuid.uuid4())
        company_id = str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat()

        # Prepare tenant record
        tenant_record = {
            'tenant_id': tenant_id,
            'tenant_name': tenant_data['tenant_name'],
            'company_id': company_id,
            'subscription_tier': tenant_data.get('subscription_tier', 'basic'),
            'max_users': tenant_data.get('max_users', 10),
            'max_documents': tenant_data.get('max_documents', 1000),
            'created_at': timestamp,
            'updated_at': timestamp,
            'status': 'active',
            'settings': tenant_data.get('settings', {}),
            'billing_contact': tenant_data.get('billing_contact', {}),
            'technical_contact': tenant_data.get('technical_contact', {}),
        }

        # Prepare company record
        company_record = {
            'company_id': company_id,
            'tenant_id': tenant_id,
            'company_name': tenant_data['company_name'],
            'duns_number': tenant_data.get('duns_number'),
            'cage_code': tenant_data.get('cage_code'),
            'website_url': tenant_data.get('website_url'),
            'naics_codes': tenant_data.get('naics_codes', []),
            'certifications': tenant_data.get('certifications', []),
            'revenue_range': tenant_data.get('revenue_range'),
            'employee_count': tenant_data.get('employee_count'),
            'locations': tenant_data.get('locations', []),
            'created_at': timestamp,
            'updated_at': timestamp,
            'document_count': 0,
            'profile_completeness': self._calculate_completeness(tenant_data),
        }

        # Store both records
        with self.tenants_table.batch_writer() as batch:
            batch.put_item(Item=tenant_record)

        with self.companies_table.batch_writer() as batch:
            batch.put_item(Item=company_record)

        return {
            'tenant_id': tenant_id,
            'company_id': company_id,
            'status': 'created'
        }

    def get_tenant(self, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve tenant details."""
        try:
            response = self.tenants_table.get_item(Key={'tenant_id': tenant_id})
            return response.get('Item')
        except Exception:
            return None

    def update_tenant(self, tenant_id: str, updates: Dict[str, Any]) -> bool:
        """Update tenant configuration."""
        try:
            # Build update expression
            update_expression = "SET updated_at = :timestamp"
            expression_values = {':timestamp': datetime.utcnow().isoformat()}

            for key, value in updates.items():
                if key not in ['tenant_id', 'company_id', 'created_at']:
                    update_expression += f", {key} = :{key}"
                    expression_values[f':{key}'] = value

            self.tenants_table.update_item(
                Key={'tenant_id': tenant_id},
                UpdateExpression=update_expression,
                ExpressionAttributeValues=expression_values
            )
            return True
        except Exception:
            return False

    def delete_tenant(self, tenant_id: str) -> bool:
        """Mark tenant as deleted (soft delete)."""
        try:
            self.tenants_table.update_item(
                Key={'tenant_id': tenant_id},
                UpdateExpression="SET #status = :status, updated_at = :timestamp",
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'deleted',
                    ':timestamp': datetime.utcnow().isoformat()
                }
            )
            return True
        except Exception:
            return False

    def _calculate_completeness(self, tenant_data: Dict[str, Any]) -> float:
        """Calculate profile completeness percentage."""
        required_fields = [
            'company_name', 'duns_number', 'cage_code', 'website_url',
            'naics_codes', 'certifications', 'revenue_range', 'employee_count'
        ]

        completed_fields = sum(1 for field in required_fields
                             if tenant_data.get(field) is not None and tenant_data.get(field) != "")

        return Decimal(str((completed_fields / len(required_fields)) * 100))


def validate_tenant_data(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """Validate tenant creation data."""
    # Check required fields
    if not data.get('tenant_name'):
        return False, "tenant_name is required"
    if not data.get('company_name'):
        return False, "company_name is required"

    # Validate string lengths
    if len(data['tenant_name']) < 3 or len(data['tenant_name']) > 100:
        return False, "tenant_name must be between 3 and 100 characters"
    if len(data['company_name']) < 3 or len(data['company_name']) > 100:
        return False, "company_name must be between 3 and 100 characters"

    # Validate optional fields
    if 'duns_number' in data and data['duns_number']:
        if not re.match(r'^[0-9]{9}$', data['duns_number']):
            return False, "duns_number must be 9 digits"

    if 'cage_code' in data and data['cage_code']:
        if not re.match(r'^[0-9A-Z]{5}$', data['cage_code']):
            return False, "cage_code must be 5 alphanumeric characters"

    if 'subscription_tier' in data and data['subscription_tier']:
        if data['subscription_tier'] not in ['basic', 'professional', 'enterprise']:
            return False, "subscription_tier must be basic, professional, or enterprise"

    if 'naics_codes' in data and data['naics_codes']:
        if len(data['naics_codes']) > 10:
            return False, "maximum 10 NAICS codes allowed"
        for code in data['naics_codes']:
            if not re.match(r'^[0-9]{6}$', code):
                return False, f"NAICS code {code} must be 6 digits"

    return True, None