"""
Lambda function to delete (soft delete) a tenant.
"""
import json
import os
from govbizai_common import TenantManager, AuditLogger, format_response, format_error_response

def lambda_handler(event, context):
    """Handle tenant deletion requests."""
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

        # Verify tenant exists
        existing_tenant = tenant_manager.get_tenant(tenant_id)
        if not existing_tenant:
            return format_error_response(
                404,
                "Tenant not found",
                "TENANT_NOT_FOUND"
            )

        # Check if already deleted
        if existing_tenant.get('status') == 'deleted':
            return format_error_response(
                409,
                "Tenant is already deleted",
                "ALREADY_DELETED"
            )

        # Delete tenant (soft delete)
        success = tenant_manager.delete_tenant(tenant_id)
        if not success:
            return format_error_response(
                500,
                "Failed to delete tenant",
                "DELETE_FAILED"
            )

        # Log the action
        user_id = event.get('requestContext', {}).get('authorizer', {}).get('claims', {}).get('sub', 'system')
        audit_logger.log_action(
            tenant_id=tenant_id,
            action_type='DELETE_TENANT',
            user_id=user_id,
            details={
                'tenant_name': existing_tenant.get('tenant_name'),
                'deletion_type': 'soft_delete',
                'source_ip': event.get('requestContext', {}).get('identity', {}).get('sourceIp', 'unknown'),
                'user_agent': event.get('headers', {}).get('User-Agent', 'unknown')
            },
            resource_id=tenant_id
        )

        return format_response(200, {
            'message': 'Tenant deleted successfully',
            'tenant_id': tenant_id,
            'deletion_type': 'soft_delete'
        })

    except Exception as e:
        print(f"Error deleting tenant: {str(e)}")
        return format_error_response(
            500,
            "Failed to delete tenant",
            "INTERNAL_ERROR",
            {"error_details": str(e)}
        )