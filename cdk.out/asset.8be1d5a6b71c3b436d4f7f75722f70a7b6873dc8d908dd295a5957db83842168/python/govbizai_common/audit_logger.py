"""
Audit logging utilities.
"""
import boto3
from datetime import datetime
from typing import Dict, Any, Optional
import json

class AuditLogger:
    """Handles audit logging for tenant operations."""

    def __init__(self, audit_table_name: str):
        self.dynamodb = boto3.resource('dynamodb')
        self.audit_table = self.dynamodb.Table(audit_table_name)

    def log_action(self, tenant_id: str, action_type: str, user_id: str,
                   details: Dict[str, Any], resource_id: Optional[str] = None) -> bool:
        """Log an audit action."""
        try:
            timestamp = datetime.utcnow().isoformat()
            ttl = int((datetime.utcnow().timestamp() + (365 * 24 * 60 * 60)))  # 1 year TTL

            audit_record = {
                'tenant_id': tenant_id,
                'timestamp': timestamp,
                'action_type': action_type,
                'user_id': user_id,
                'resource_id': resource_id or 'N/A',
                'details': json.dumps(details),
                'ip_address': details.get('source_ip', 'unknown'),
                'user_agent': details.get('user_agent', 'unknown'),
                'ttl': ttl
            }

            self.audit_table.put_item(Item=audit_record)
            return True
        except Exception as e:
            print(f"Failed to log audit action: {str(e)}")
            return False

    def get_audit_trail(self, tenant_id: str, start_time: str, end_time: str,
                       action_type: Optional[str] = None) -> list:
        """Retrieve audit trail for a tenant."""
        try:
            filter_expression = "tenant_id = :tenant_id AND #ts BETWEEN :start_time AND :end_time"
            expression_values = {
                ':tenant_id': tenant_id,
                ':start_time': start_time,
                ':end_time': end_time
            }

            if action_type:
                filter_expression += " AND action_type = :action_type"
                expression_values[':action_type'] = action_type

            response = self.audit_table.scan(
                FilterExpression=filter_expression,
                ExpressionAttributeNames={'#ts': 'timestamp'},
                ExpressionAttributeValues=expression_values
            )

            return response.get('Items', [])
        except Exception as e:
            print(f"Failed to retrieve audit trail: {str(e)}")
            return []