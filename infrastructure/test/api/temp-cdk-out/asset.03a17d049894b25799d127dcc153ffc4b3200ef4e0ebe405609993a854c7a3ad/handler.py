"""
Lambda function to retrieve tenant details.
"""
import json
import os
from govbizai_common import TenantManager, AuditLogger, format_response, format_error_response

def lambda_handler(event, context):
    """Handle tenant retrieval requests."""
    try:
        # Extract tenant ID from path parameters
        tenant_id = event.get('pathParameters', {}).get('tenantId')
        if not tenant_id:
            return format_error_response(
                400,
                "Missing tenant ID in path parameters",
                "MISSING_PARAMETER"
            )

        # Initialize managers
        tenant_manager = TenantManager(
            os.environ['TENANTS_TABLE_NAME'],
            os.environ['COMPANIES_TABLE_NAME']
        )
        audit_logger = AuditLogger(os.environ['AUDIT_LOG_TABLE_NAME'])

        # Get tenant details
        tenant = tenant_manager.get_tenant(tenant_id)
        if not tenant:
            return format_error_response(
                404,
                "Tenant not found",
                "TENANT_NOT_FOUND"
            )

        # Check if tenant is deleted
        if tenant.get('status') == 'deleted':
            return format_error_response(
                410,
                "Tenant has been deleted",
                "TENANT_DELETED"
            )

        # Log the action (read access)
        user_id = event.get('requestContext', {}).get('authorizer', {}).get('claims', {}).get('sub', 'system')
        audit_logger.log_action(
            tenant_id=tenant_id,
            action_type='GET_TENANT',
            user_id=user_id,
            details={
                'access_type': 'read',
                'source_ip': event.get('requestContext', {}).get('identity', {}).get('sourceIp', 'unknown'),
                'user_agent': event.get('headers', {}).get('User-Agent', 'unknown')
            },
            resource_id=tenant_id
        )

        # Remove sensitive information before returning
        tenant_response = {
            'tenant_id': tenant['tenant_id'],
            'tenant_name': tenant['tenant_name'],
            'company_id': tenant['company_id'],
            'subscription_tier': tenant['subscription_tier'],
            'max_users': tenant['max_users'],
            'max_documents': tenant['max_documents'],
            'created_at': tenant['created_at'],
            'updated_at': tenant['updated_at'],
            'status': tenant['status'],
            'settings': tenant.get('settings', {}),
        }

        return format_response(200, {
            'tenant': tenant_response
        })

    except Exception as e:
        print(f"Error retrieving tenant: {str(e)}")
        return format_error_response(
            500,
            "Failed to retrieve tenant",
            "INTERNAL_ERROR",
            {"error_details": str(e)}
        )