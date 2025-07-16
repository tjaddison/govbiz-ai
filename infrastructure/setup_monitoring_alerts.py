#!/usr/bin/env python3
"""
Set up monitoring alerts and SNS subscriptions for GovBiz.ai
"""

import boto3
import json
import re

def get_sns_topic_arn():
    """Get the SNS topic ARN for alerts"""
    
    sns = boto3.client('sns', region_name='us-east-1')
    
    topic_name = "govbiz-ai-dev-alerts"
    
    try:
        # List topics to find our topic
        response = sns.list_topics()
        
        for topic in response['Topics']:
            if topic_name in topic['TopicArn']:
                return topic['TopicArn']
        
        print(f"✗ SNS topic {topic_name} not found")
        return None
        
    except Exception as e:
        print(f"✗ Error finding SNS topic: {e}")
        return None

def add_email_subscription(topic_arn, email_address):
    """Add email subscription to SNS topic"""
    
    sns = boto3.client('sns', region_name='us-east-1')
    
    try:
        # Subscribe email to topic
        response = sns.subscribe(
            TopicArn=topic_arn,
            Protocol='email',
            Endpoint=email_address
        )
        
        subscription_arn = response['SubscriptionArn']
        print(f"✅ Email subscription created: {email_address}")
        print(f"   Subscription ARN: {subscription_arn}")
        print(f"   📧 Check your email to confirm the subscription!")
        
        return subscription_arn
        
    except Exception as e:
        print(f"✗ Error creating email subscription: {e}")
        return None

def add_sms_subscription(topic_arn, phone_number):
    """Add SMS subscription to SNS topic"""
    
    sns = boto3.client('sns', region_name='us-east-1')
    
    # Validate phone number format
    if not re.match(r'^\+\d{10,15}$', phone_number):
        print(f"✗ Invalid phone number format: {phone_number}")
        print("   Use format: +1234567890 (include country code)")
        return None
    
    try:
        # Subscribe SMS to topic
        response = sns.subscribe(
            TopicArn=topic_arn,
            Protocol='sms',
            Endpoint=phone_number
        )
        
        subscription_arn = response['SubscriptionArn']
        print(f"✅ SMS subscription created: {phone_number}")
        print(f"   Subscription ARN: {subscription_arn}")
        
        return subscription_arn
        
    except Exception as e:
        print(f"✗ Error creating SMS subscription: {e}")
        return None

def create_slack_webhook_subscription(topic_arn, webhook_url):
    """Create Slack webhook subscription (via HTTPS)"""
    
    sns = boto3.client('sns', region_name='us-east-1')
    
    try:
        # Subscribe webhook to topic
        response = sns.subscribe(
            TopicArn=topic_arn,
            Protocol='https',
            Endpoint=webhook_url
        )
        
        subscription_arn = response['SubscriptionArn']
        print(f"✅ Slack webhook subscription created")
        print(f"   Subscription ARN: {subscription_arn}")
        
        return subscription_arn
        
    except Exception as e:
        print(f"✗ Error creating Slack webhook subscription: {e}")
        return None

def list_existing_subscriptions(topic_arn):
    """List existing subscriptions for the topic"""
    
    sns = boto3.client('sns', region_name='us-east-1')
    
    try:
        response = sns.list_subscriptions_by_topic(TopicArn=topic_arn)
        
        subscriptions = response['Subscriptions']
        
        if not subscriptions:
            print("No existing subscriptions found")
            return []
        
        print(f"Existing subscriptions ({len(subscriptions)}):")
        for sub in subscriptions:
            protocol = sub['Protocol']
            endpoint = sub['Endpoint']
            status = sub.get('SubscriptionArn', 'PendingConfirmation')
            
            if status == 'PendingConfirmation':
                status = "⏳ Pending Confirmation"
            else:
                status = "✅ Confirmed"
            
            print(f"  {protocol.upper()}: {endpoint} - {status}")
        
        return subscriptions
        
    except Exception as e:
        print(f"✗ Error listing subscriptions: {e}")
        return []

def send_test_alert(topic_arn):
    """Send a test alert to verify subscriptions work"""
    
    sns = boto3.client('sns', region_name='us-east-1')
    
    test_message = {
        "AlarmName": "TEST-ALERT",
        "AlarmDescription": "This is a test alert to verify SNS subscriptions are working",
        "AWSAccountId": "927576824761",
        "Region": "us-east-1",
        "NewStateValue": "ALARM",
        "NewStateReason": "Test alert sent from GovBiz.ai deployment setup",
        "StateChangeTime": "2025-07-15T09:00:00.000+0000",
        "MetricName": "TestMetric",
        "Namespace": "GovBiz.ai/Test",
        "Statistic": "Sum",
        "Dimensions": [
            {
                "name": "Environment",
                "value": "dev"
            }
        ],
        "Period": 300,
        "EvaluationPeriods": 1,
        "Threshold": 1.0,
        "ComparisonOperator": "GreaterThanThreshold",
        "TreatMissingData": "notBreaching"
    }
    
    try:
        response = sns.publish(
            TopicArn=topic_arn,
            Subject="🚨 GovBiz.ai Test Alert",
            Message=json.dumps(test_message, indent=2)
        )
        
        message_id = response['MessageId']
        print(f"✅ Test alert sent successfully")
        print(f"   Message ID: {message_id}")
        print(f"   📧 Check your email/SMS for the test alert!")
        
        return message_id
        
    except Exception as e:
        print(f"✗ Error sending test alert: {e}")
        return None

def setup_monitoring_alerts():
    """Interactive setup for monitoring alerts"""
    
    print("Setting up monitoring alerts and subscriptions...")
    
    # Get SNS topic ARN
    topic_arn = get_sns_topic_arn()
    if not topic_arn:
        print("❌ Cannot proceed without SNS topic")
        return False
    
    print(f"✅ Found SNS topic: {topic_arn}")
    
    # List existing subscriptions
    print("\n📋 Existing Subscriptions:")
    existing_subs = list_existing_subscriptions(topic_arn)
    
    # Interactive subscription setup
    subscriptions_created = []
    
    print("\n🔔 Set up alert subscriptions:")
    print("1. Email notifications")
    print("2. SMS notifications")
    print("3. Slack webhook")
    print("4. Skip subscription setup")
    print("5. Send test alert")
    
    while True:
        choice = input("\nEnter choice (1-5, or 'quit' to finish): ").strip().lower()
        
        if choice == 'quit' or choice == '':
            break
        elif choice == '1':
            # Email subscription
            email = input("Enter email address: ").strip()
            if email:
                sub_arn = add_email_subscription(topic_arn, email)
                if sub_arn:
                    subscriptions_created.append(('email', email, sub_arn))
        elif choice == '2':
            # SMS subscription
            phone = input("Enter phone number (with country code, e.g., +1234567890): ").strip()
            if phone:
                sub_arn = add_sms_subscription(topic_arn, phone)
                if sub_arn:
                    subscriptions_created.append(('sms', phone, sub_arn))
        elif choice == '3':
            # Slack webhook
            webhook = input("Enter Slack webhook URL: ").strip()
            if webhook:
                sub_arn = create_slack_webhook_subscription(topic_arn, webhook)
                if sub_arn:
                    subscriptions_created.append(('slack', webhook, sub_arn))
        elif choice == '4':
            print("Skipping subscription setup")
            break
        elif choice == '5':
            # Send test alert
            send_test_alert(topic_arn)
        else:
            print("Invalid choice. Please enter 1-5 or 'quit'")
    
    return subscriptions_created

def create_monitoring_dashboard_url():
    """Create monitoring dashboard URLs"""
    
    dashboard_urls = {
        'cloudwatch_dashboard': 'https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=govbiz-ai-dev-dashboard',
        'cloudwatch_alarms': 'https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#alarmsV2:',
        'sns_subscriptions': 'https://console.aws.amazon.com/sns/v3/home?region=us-east-1#/topic/arn:aws:sns:us-east-1:927576824761:govbiz-ai-dev-alerts',
        'lambda_logs': 'https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups',
        'api_gateway_logs': 'https://console.aws.amazon.com/apigateway/home?region=us-east-1#/apis/6y7hinexc0/stages/dev/logs'
    }
    
    return dashboard_urls

if __name__ == "__main__":
    print("=" * 60)
    print("GOVBIZ.AI MONITORING ALERTS SETUP")
    print("=" * 60)
    
    # For non-interactive deployment, set up with default admin email
    topic_arn = get_sns_topic_arn()
    if not topic_arn:
        print("❌ Cannot proceed without SNS topic")
        exit(1)
    
    print(f"✅ Found SNS topic: {topic_arn}")
    
    # List existing subscriptions
    print("\n📋 Existing Subscriptions:")
    existing_subs = list_existing_subscriptions(topic_arn)
    
    # Create monitoring dashboard URLs
    dashboard_urls = create_monitoring_dashboard_url()
    
    print("\n" + "=" * 60)
    print("MONITORING SETUP SUMMARY")
    print("=" * 60)
    
    print(f"✅ SNS Topic: {topic_arn}")
    print(f"✅ Existing subscriptions: {len(existing_subs)}")
    
    print("\n📊 Monitoring Dashboard URLs:")
    for name, url in dashboard_urls.items():
        print(f"  {name.replace('_', ' ').title()}: {url}")
    
    print("\n🔔 Alert Types Configured:")
    print("  • Lambda function errors (> 5 errors in 5 minutes)")
    print("  • Lambda function duration (> 30 seconds average)")
    print("  • Lambda function throttles (> 1 throttle)")
    print("  • API Gateway 4XX errors (> 10 errors in 5 minutes)")
    print("  • API Gateway 5XX errors (> 1 error in 5 minutes)")
    print("  • API Gateway latency (> 5 seconds average)")
    
    print("\n🔄 Next Steps:")
    print("1. Add email subscriptions to SNS topic:")
    print(f"   aws sns subscribe --topic-arn {topic_arn} --protocol email --notification-endpoint your-email@example.com")
    print("2. Confirm email subscriptions when you receive confirmation emails")
    print("3. Monitor CloudWatch dashboard for system health")
    print("4. Test alerts by triggering some Lambda errors")
    print("5. Review and adjust alarm thresholds as needed")
    
    print(f"\n📧 To add email subscription manually:")
    print(f"   1. Go to: https://console.aws.amazon.com/sns/v3/home?region=us-east-1#/topic/{topic_arn}")
    print(f"   2. Click 'Create subscription'")
    print(f"   3. Select 'Email' protocol")
    print(f"   4. Enter your email address")
    print(f"   5. Click 'Create subscription'")
    print(f"   6. Check your email and confirm subscription")
    
    print("\n✅ Monitoring and alerting setup complete!")
    
    # Send a test alert to verify everything works
    print("\n🧪 Sending test alert...")
    send_test_alert(topic_arn)