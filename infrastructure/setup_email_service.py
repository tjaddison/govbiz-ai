#!/usr/bin/env python3
"""
Set up email service configuration in AWS Secrets Manager
"""

import boto3
import json
import getpass
from datetime import datetime
from pathlib import Path

def create_email_secrets():
    """Create email service secrets in AWS Secrets Manager"""
    
    secrets_client = boto3.client('secretsmanager', region_name='us-east-1')
    
    project_name = "govbiz-ai"
    environment = "dev"
    
    print("Setting up email service secrets...")
    print("This will create secrets for various email services that the agents can use.")
    print()
    
    # Email service configurations
    email_configs = {
        'smtp_config': {
            'smtp_server': 'smtp.gmail.com',
            'smtp_port': 587,
            'smtp_username': '',
            'smtp_password': '',
            'from_email': '',
            'from_name': 'GovBiz.ai System'
        },
        'ses_config': {
            'region': 'us-east-1',
            'access_key_id': '',
            'secret_access_key': '',
            'from_email': '',
            'from_name': 'GovBiz.ai System'
        },
        'outlook_config': {
            'tenant_id': '',
            'client_id': '',
            'client_secret': '',
            'username': '',
            'password': ''
        }
    }
    
    # Interactive setup
    print("Choose email service configuration:")
    print("1. SMTP (Gmail/Generic)")
    print("2. Amazon SES")
    print("3. Microsoft Outlook/Office 365")
    print("4. Skip email setup (use mock service)")
    
    choice = input("Enter choice (1-4): ").strip()
    
    secrets_created = []
    
    if choice == '1':
        # SMTP Configuration
        print("\n🔧 SMTP Configuration")
        print("For Gmail, use App Password (not regular password)")
        print("Enable 2FA and create App Password at: https://myaccount.google.com/apppasswords")
        
        smtp_config = email_configs['smtp_config']
        smtp_config['smtp_server'] = input("SMTP Server (default: smtp.gmail.com): ") or 'smtp.gmail.com'
        smtp_config['smtp_port'] = int(input("SMTP Port (default: 587): ") or '587')
        smtp_config['smtp_username'] = input("SMTP Username (email): ")
        smtp_config['smtp_password'] = getpass.getpass("SMTP Password (App Password): ")
        smtp_config['from_email'] = input("From Email: ") or smtp_config['smtp_username']
        smtp_config['from_name'] = input("From Name (default: GovBiz.ai System): ") or 'GovBiz.ai System'
        
        # Create secret
        secret_name = f"{project_name}-{environment}-email-smtp"
        try:
            secrets_client.create_secret(
                Name=secret_name,
                SecretString=json.dumps(smtp_config),
                Description="SMTP configuration for email service",
                Tags=[
                    {'Key': 'Project', 'Value': project_name},
                    {'Key': 'Environment', 'Value': environment},
                    {'Key': 'Service', 'Value': 'email'}
                ]
            )
            print(f"✅ Created SMTP secret: {secret_name}")
            secrets_created.append(secret_name)
        except secrets_client.exceptions.ResourceExistsException:
            # Update existing secret
            secrets_client.update_secret(
                SecretId=secret_name,
                SecretString=json.dumps(smtp_config)
            )
            print(f"✅ Updated SMTP secret: {secret_name}")
            secrets_created.append(secret_name)
    
    elif choice == '2':
        # SES Configuration
        print("\n🔧 Amazon SES Configuration")
        print("Make sure SES is set up in your AWS account and email addresses are verified")
        
        ses_config = email_configs['ses_config']
        ses_config['region'] = input("SES Region (default: us-east-1): ") or 'us-east-1'
        ses_config['access_key_id'] = input("AWS Access Key ID (optional if using IAM roles): ")
        ses_config['secret_access_key'] = getpass.getpass("AWS Secret Access Key (optional if using IAM roles): ")
        ses_config['from_email'] = input("From Email (must be verified in SES): ")
        ses_config['from_name'] = input("From Name (default: GovBiz.ai System): ") or 'GovBiz.ai System'
        
        # Create secret
        secret_name = f"{project_name}-{environment}-email-ses"
        try:
            secrets_client.create_secret(
                Name=secret_name,
                SecretString=json.dumps(ses_config),
                Description="Amazon SES configuration for email service",
                Tags=[
                    {'Key': 'Project', 'Value': project_name},
                    {'Key': 'Environment', 'Value': environment},
                    {'Key': 'Service', 'Value': 'email'}
                ]
            )
            print(f"✅ Created SES secret: {secret_name}")
            secrets_created.append(secret_name)
        except secrets_client.exceptions.ResourceExistsException:
            # Update existing secret
            secrets_client.update_secret(
                SecretId=secret_name,
                SecretString=json.dumps(ses_config)
            )
            print(f"✅ Updated SES secret: {secret_name}")
            secrets_created.append(secret_name)
    
    elif choice == '3':
        # Outlook Configuration
        print("\n🔧 Microsoft Outlook/Office 365 Configuration")
        print("You need to register an app in Azure AD and get tenant/client credentials")
        
        outlook_config = email_configs['outlook_config']
        outlook_config['tenant_id'] = input("Tenant ID: ")
        outlook_config['client_id'] = input("Client ID: ")
        outlook_config['client_secret'] = getpass.getpass("Client Secret: ")
        outlook_config['username'] = input("Email Username: ")
        outlook_config['password'] = getpass.getpass("Email Password: ")
        
        # Create secret
        secret_name = f"{project_name}-{environment}-email-outlook"
        try:
            secrets_client.create_secret(
                Name=secret_name,
                SecretString=json.dumps(outlook_config),
                Description="Outlook/Office 365 configuration for email service",
                Tags=[
                    {'Key': 'Project', 'Value': project_name},
                    {'Key': 'Environment', 'Value': environment},
                    {'Key': 'Service', 'Value': 'email'}
                ]
            )
            print(f"✅ Created Outlook secret: {secret_name}")
            secrets_created.append(secret_name)
        except secrets_client.exceptions.ResourceExistsException:
            # Update existing secret
            secrets_client.update_secret(
                SecretId=secret_name,
                SecretString=json.dumps(outlook_config)
            )
            print(f"✅ Updated Outlook secret: {secret_name}")
            secrets_created.append(secret_name)
    
    elif choice == '4':
        # Mock email service
        print("\n🔧 Mock Email Service")
        print("Setting up mock email service for testing...")
        
        mock_config = {
            'service_type': 'mock',
            'log_emails': True,
            'from_email': 'noreply@govbiz-ai.local',
            'from_name': 'GovBiz.ai System (Test Mode)'
        }
        
        secret_name = f"{project_name}-{environment}-email-mock"
        try:
            secrets_client.create_secret(
                Name=secret_name,
                SecretString=json.dumps(mock_config),
                Description="Mock email service for testing",
                Tags=[
                    {'Key': 'Project', 'Value': project_name},
                    {'Key': 'Environment', 'Value': environment},
                    {'Key': 'Service', 'Value': 'email'}
                ]
            )
            print(f"✅ Created mock email secret: {secret_name}")
            secrets_created.append(secret_name)
        except secrets_client.exceptions.ResourceExistsException:
            # Update existing secret
            secrets_client.update_secret(
                SecretId=secret_name,
                SecretString=json.dumps(mock_config)
            )
            print(f"✅ Updated mock email secret: {secret_name}")
            secrets_created.append(secret_name)
    
    else:
        print("❌ Invalid choice. Exiting.")
        return False
    
    # Update main API keys secret with email configuration
    main_secret_name = f"{project_name}-{environment}-api-keys"
    try:
        # Get existing secret
        response = secrets_client.get_secret_value(SecretId=main_secret_name)
        existing_secrets = json.loads(response['SecretString'])
        
        # Add email configuration
        existing_secrets['email_service_configured'] = True
        existing_secrets['email_secrets'] = secrets_created
        existing_secrets['email_setup_date'] = datetime.utcnow().isoformat()
        
        # Update secret
        secrets_client.update_secret(
            SecretId=main_secret_name,
            SecretString=json.dumps(existing_secrets)
        )
        print(f"✅ Updated main API keys secret with email configuration")
        
    except Exception as e:
        print(f"⚠ Warning: Could not update main API keys secret: {e}")
    
    return secrets_created

def create_email_templates():
    """Create email templates for the system"""
    
    templates = {
        'opportunity_alert': {
            'subject': 'New Government Opportunity Discovered - {title}',
            'body': """
<html>
<body>
<h2>New Government Opportunity Discovered</h2>

<p><strong>Title:</strong> {title}</p>
<p><strong>Agency:</strong> {agency}</p>
<p><strong>Response Deadline:</strong> {deadline}</p>
<p><strong>Match Score:</strong> {match_score}%</p>

<h3>Summary</h3>
<p>{summary}</p>

<h3>Next Steps</h3>
<ul>
    <li>Review the full opportunity details</li>
    <li>Analyze capability alignment</li>
    <li>Prepare response strategy</li>
</ul>

<p><a href="{opportunity_url}">View Full Opportunity</a></p>

<p>Best regards,<br>
GovBiz.ai System</p>
</body>
</html>
            """
        },
        'response_ready': {
            'subject': 'Response Ready for Review - {title}',
            'body': """
<html>
<body>
<h2>Response Ready for Review</h2>

<p><strong>Opportunity:</strong> {title}</p>
<p><strong>Agency:</strong> {agency}</p>
<p><strong>Response Deadline:</strong> {deadline}</p>

<p>A response has been generated and is ready for your review.</p>

<h3>Response Summary</h3>
<p>{response_summary}</p>

<p><a href="{review_url}">Review and Approve Response</a></p>

<p>Best regards,<br>
GovBiz.ai System</p>
</body>
</html>
            """
        },
        'daily_summary': {
            'subject': 'Daily GovBiz.ai Summary - {date}',
            'body': """
<html>
<body>
<h2>Daily Summary - {date}</h2>

<h3>Today's Activity</h3>
<ul>
    <li>New opportunities discovered: {new_opportunities}</li>
    <li>Opportunities analyzed: {analyzed_opportunities}</li>
    <li>Responses generated: {responses_generated}</li>
    <li>Emails sent: {emails_sent}</li>
</ul>

<h3>Pending Actions</h3>
<ul>
    <li>Responses awaiting review: {pending_review}</li>
    <li>Upcoming deadlines: {upcoming_deadlines}</li>
</ul>

<p><a href="{dashboard_url}">View Dashboard</a></p>

<p>Best regards,<br>
GovBiz.ai System</p>
</body>
</html>
            """
        }
    }
    
    # Save templates to a file
    templates_file = Path(__file__).parent / "email_templates.json"
    with open(templates_file, 'w') as f:
        json.dump(templates, f, indent=2)
    
    print(f"✅ Created email templates: {templates_file}")
    return templates_file

if __name__ == "__main__":
    print("=" * 60)
    print("GOVBIZ.AI EMAIL SERVICE SETUP")
    print("=" * 60)
    
    # Create email secrets
    secrets = create_email_secrets()
    
    # Create email templates
    templates_file = create_email_templates()
    
    print("\n" + "=" * 60)
    print("EMAIL SERVICE SETUP SUMMARY")
    print("=" * 60)
    
    if secrets:
        print(f"✅ Email service configured with {len(secrets)} secrets")
        for secret in secrets:
            print(f"  - {secret}")
    else:
        print("❌ Email service setup failed")
    
    print(f"✅ Email templates created: {templates_file}")
    
    print("\n🔄 Next Steps:")
    print("1. Test email configuration with a simple email")
    print("2. Update Lambda functions to use email service")
    print("3. Configure email templates in the system")
    print("4. Set up email monitoring and logging")
    
    print("\n📧 Email Service Features:")
    print("• Automated opportunity alerts")
    print("• Response review notifications")
    print("• Daily activity summaries")
    print("• Error and warning notifications")
    print("• Human-in-the-loop communications")
    
    if not secrets:
        exit(1)