"""
Cognito Pre-Sign-Up trigger for user validation.
"""
import json
import os
import boto3
import re
from govbizai_common import AuditLogger

def lambda_handler(event, context):
    """Handle pre-sign-up user validation."""
    try:
        # Extract user information from Cognito event
        user_pool_id = event['userPoolId']
        username = event['userName']
        user_attributes = event['request']['userAttributes']
        client_metadata = event['request'].get('clientMetadata', {})

        # Initialize audit logger
        audit_logger = AuditLogger(os.environ['AUDIT_LOG_TABLE_NAME'])

        # Extract email and validate domain if required
        email = user_attributes.get('email', '').lower()

        # Basic email validation
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, email):
            print(f"Invalid email format: {email}")
            raise Exception("Invalid email format")

        # Check for disposable email domains (basic list)
        disposable_domains = [
            '10minutemail.com', 'tempmail.org', 'guerrillamail.com',
            'mailinator.com', 'yopmail.com', 'throwaway.email'
        ]
        email_domain = email.split('@')[1]
        if email_domain in disposable_domains:
            print(f"Disposable email domain detected: {email_domain}")
            raise Exception("Disposable email addresses are not allowed")

        # Validate required attributes
        required_attributes = ['given_name', 'family_name']
        for attr in required_attributes:
            if not user_attributes.get(attr):
                print(f"Missing required attribute: {attr}")
                raise Exception(f"Missing required attribute: {attr}")

        # Log the sign-up attempt
        tenant_id = client_metadata.get('tenant_id', 'unknown')
        audit_logger.log_action(
            tenant_id=tenant_id,
            action_type='USER_SIGNUP_ATTEMPT',
            user_id=username,
            details={
                'email': email,
                'validation_status': 'passed',
                'source_ip': event.get('request', {}).get('clientMetadata', {}).get('source_ip', 'unknown'),
                'user_agent': event.get('request', {}).get('clientMetadata', {}).get('user_agent', 'unknown')
            },
            resource_id=username
        )

        # Auto-confirm the user (skip email verification in dev environment)
        # In production, you might want to remove this
        event['response']['autoConfirmUser'] = False
        event['response']['autoVerifyEmail'] = True

        print(f"Pre-sign-up validation passed for {email}")
        return event

    except Exception as e:
        print(f"Pre-sign-up validation failed: {str(e)}")

        # Log the failed attempt
        try:
            tenant_id = event['request'].get('clientMetadata', {}).get('tenant_id', 'unknown')
            audit_logger.log_action(
                tenant_id=tenant_id,
                action_type='USER_SIGNUP_FAILED',
                user_id=username,
                details={
                    'email': user_attributes.get('email', 'unknown'),
                    'failure_reason': str(e),
                    'source_ip': event.get('request', {}).get('clientMetadata', {}).get('source_ip', 'unknown')
                },
                resource_id=username
            )
        except:
            pass  # Don't fail if audit logging fails

        # Throw exception to prevent user registration
        raise e