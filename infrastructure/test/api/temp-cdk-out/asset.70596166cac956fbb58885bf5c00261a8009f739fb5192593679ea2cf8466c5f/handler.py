"""
Cognito Post-Confirmation trigger to set up user profile.
"""
import json
import os
import boto3
from datetime import datetime
from govbizai_common import AuditLogger, format_response, format_error_response

def lambda_handler(event, context):
    """Handle post-confirmation user setup."""
    try:
        # Extract user information from Cognito event
        user_pool_id = event['userPoolId']
        username = event['userName']
        user_attributes = event['request']['userAttributes']

        # Initialize AWS services
        dynamodb = boto3.resource('dynamodb')
        user_profiles_table = dynamodb.Table(os.environ['USER_PROFILES_TABLE_NAME'])
        audit_logger = AuditLogger(os.environ['AUDIT_LOG_TABLE_NAME'])

        # Extract custom attributes
        tenant_id = user_attributes.get('custom:tenant_id')
        company_id = user_attributes.get('custom:company_id')
        role = user_attributes.get('custom:role', 'User')
        subscription_tier = user_attributes.get('custom:subscription_tier', 'basic')

        # Create user profile record
        timestamp = datetime.utcnow().isoformat()
        user_profile = {
            'user_id': username,
            'tenant_id': tenant_id,
            'company_id': company_id,
            'email': user_attributes.get('email'),
            'given_name': user_attributes.get('given_name'),
            'family_name': user_attributes.get('family_name'),
            'phone_number': user_attributes.get('phone_number'),
            'role': role,
            'subscription_tier': subscription_tier,
            'status': 'active',
            'created_at': timestamp,
            'updated_at': timestamp,
            'last_login': None,
            'preferences': {
                'email_notifications': True,
                'match_notifications': True,
                'weekly_reports': True
            },
            'onboarding_completed': False,
            'profile_picture_url': user_attributes.get('picture'),
        }

        # Store user profile
        user_profiles_table.put_item(Item=user_profile)

        # Log the action
        if tenant_id:
            audit_logger.log_action(
                tenant_id=tenant_id,
                action_type='USER_REGISTRATION',
                user_id=username,
                details={
                    'email': user_attributes.get('email'),
                    'role': role,
                    'registration_method': 'cognito_confirmation',
                    'source_ip': event.get('request', {}).get('clientMetadata', {}).get('source_ip', 'unknown')
                },
                resource_id=username
            )

        print(f"User profile created successfully for {username}")

        # Return the event unchanged (required for Cognito triggers)
        return event

    except Exception as e:
        print(f"Error in post-confirmation trigger: {str(e)}")
        # Log error but don't fail the trigger
        return event