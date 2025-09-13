"""
Lambda function to create a new tenant.
"""
import json
import os
from govbizai_common import TenantManager, AuditLogger, validate_tenant_data, format_response, format_error_response

def lambda_handler(event, context):
    """Handle tenant creation requests."""
    try:
        # Extract tenant data from event
        if 'body' in event:
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        else:
            body = event

        # Validate input data
        is_valid, validation_error = validate_tenant_data(body)
        if not is_valid:
            return format_error_response(
                400,
                f"Invalid tenant data: {validation_error}",
                "VALIDATION_ERROR"
            )

        # Initialize managers
        tenant_manager = TenantManager(
            os.environ['TENANTS_TABLE_NAME'],
            os.environ['COMPANIES_TABLE_NAME']
        )
        audit_logger = AuditLogger(os.environ['AUDIT_LOG_TABLE_NAME'])

        # Create tenant
        result = tenant_manager.create_tenant(body)

        # Log the action
        user_id = event.get('requestContext', {}).get('authorizer', {}).get('claims', {}).get('sub', 'system')
        audit_logger.log_action(
            tenant_id=result['tenant_id'],
            action_type='CREATE_TENANT',
            user_id=user_id,
            details={
                'tenant_name': body['tenant_name'],
                'company_name': body['company_name'],
                'subscription_tier': body.get('subscription_tier', 'basic'),
                'source_ip': event.get('requestContext', {}).get('identity', {}).get('sourceIp', 'unknown'),
                'user_agent': event.get('headers', {}).get('User-Agent', 'unknown')
            },
            resource_id=result['tenant_id']
        )

        return format_response(201, {
            'message': 'Tenant created successfully',
            'tenant_id': result['tenant_id'],
            'company_id': result['company_id']
        })

    except Exception as e:
        print(f"Error creating tenant: {str(e)}")
        return format_error_response(
            500,
            "Failed to create tenant",
            "INTERNAL_ERROR",
            {"error_details": str(e)}
        )