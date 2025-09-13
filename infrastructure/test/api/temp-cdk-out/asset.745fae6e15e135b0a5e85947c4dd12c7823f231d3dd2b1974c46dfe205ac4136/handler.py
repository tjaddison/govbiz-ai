"""
Lambda function to update tenant information.
"""
import json
import os
from govbizai_common import TenantManager, AuditLogger, format_response, format_error_response

def lambda_handler(event, context):
    """Handle tenant update requests."""
    try:
        # Extract tenant ID from path parameters
        tenant_id = event.get('pathParameters', {}).get('tenantId')
        if not tenant_id:
            return format_error_response(
                400,
                "Missing tenant ID in path parameters",
                "MISSING_PARAMETER"
            )

        # Extract update data from body
        if 'body' in event:
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        else:
            body = event

        if not body:
            return format_error_response(
                400,
                "Missing update data in request body",
                "MISSING_BODY"
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

        # Update tenant
        success = tenant_manager.update_tenant(tenant_id, body)
        if not success:
            return format_error_response(
                500,
                "Failed to update tenant",
                "UPDATE_FAILED"
            )

        # Log the action
        user_id = event.get('requestContext', {}).get('authorizer', {}).get('claims', {}).get('sub', 'system')
        audit_logger.log_action(
            tenant_id=tenant_id,
            action_type='UPDATE_TENANT',
            user_id=user_id,
            details={
                'updated_fields': list(body.keys()),
                'source_ip': event.get('requestContext', {}).get('identity', {}).get('sourceIp', 'unknown'),
                'user_agent': event.get('headers', {}).get('User-Agent', 'unknown')
            },
            resource_id=tenant_id
        )

        return format_response(200, {
            'message': 'Tenant updated successfully',
            'tenant_id': tenant_id
        })

    except Exception as e:
        print(f"Error updating tenant: {str(e)}")
        return format_error_response(
            500,
            "Failed to update tenant",
            "INTERNAL_ERROR",
            {"error_details": str(e)}
        )