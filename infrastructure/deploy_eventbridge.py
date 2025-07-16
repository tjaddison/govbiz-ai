#!/usr/bin/env python3
"""
Deploy EventBridge rules for scheduled tasks in GovBiz.ai system
"""

import boto3
import json
from datetime import datetime

def deploy_eventbridge_rules():
    """Deploy EventBridge rules for scheduled tasks"""
    
    # Initialize AWS clients
    events_client = boto3.client('events', region_name='us-east-1')
    lambda_client = boto3.client('lambda', region_name='us-east-1')
    
    project_name = "govbiz-ai"
    environment = "dev"
    
    # EventBridge rules configuration
    rules = [
        {
            'name': f'{project_name}-{environment}-opportunity-finder-schedule',
            'description': 'Schedule for OpportunityFinder agent to check SAM.gov for new sources sought daily',
            'schedule': 'cron(0 8 * * ? *)',  # Daily at 8 AM UTC
            'lambda_function': f'{project_name}-{environment}-opportunity-finder-agent',
            'input': {
                'task_type': 'scheduled_discovery',
                'source': 'eventbridge',
                'timestamp': datetime.utcnow().isoformat()
            }
        },
        {
            'name': f'{project_name}-{environment}-analyzer-schedule',
            'description': 'Schedule for Analyzer agent to process pending opportunities',
            'schedule': 'rate(6 hours)',  # Every 6 hours
            'lambda_function': f'{project_name}-{environment}-analyzer-agent',
            'input': {
                'task_type': 'scheduled_analysis',
                'source': 'eventbridge',
                'timestamp': datetime.utcnow().isoformat()
            }
        },
        {
            'name': f'{project_name}-{environment}-daily-report-schedule',
            'description': 'Daily report generation for dashboard metrics',
            'schedule': 'cron(0 9 * * ? *)',  # Every day at 9 AM UTC
            'lambda_function': f'{project_name}-{environment}-relationship-manager-agent',
            'input': {
                'task_type': 'daily_report',
                'source': 'eventbridge',
                'timestamp': datetime.utcnow().isoformat()
            }
        },
        {
            'name': f'{project_name}-{environment}-email-check-schedule',
            'description': 'Schedule for EmailManager to check for new emails',
            'schedule': 'rate(30 minutes)',  # Every 30 minutes
            'lambda_function': f'{project_name}-{environment}-email-manager-agent',
            'input': {
                'task_type': 'email_check',
                'source': 'eventbridge',
                'timestamp': datetime.utcnow().isoformat()
            }
        },
        {
            'name': f'{project_name}-{environment}-weekly-cleanup-schedule',
            'description': 'Weekly cleanup of old records and maintenance tasks',
            'schedule': 'cron(0 2 ? * SUN *)',  # Every Sunday at 2 AM UTC
            'lambda_function': f'{project_name}-{environment}-analyzer-agent',
            'input': {
                'task_type': 'weekly_cleanup',
                'source': 'eventbridge',
                'timestamp': datetime.utcnow().isoformat()
            }
        }
    ]
    
    deployed_rules = []
    
    for rule_config in rules:
        rule_name = rule_config['name']
        lambda_function_name = rule_config['lambda_function']
        
        print(f"Creating EventBridge rule: {rule_name}")
        
        try:
            # Create or update the rule
            rule_response = events_client.put_rule(
                Name=rule_name,
                ScheduleExpression=rule_config['schedule'],
                Description=rule_config['description'],
                State='ENABLED',
                Tags=[
                    {'Key': 'Project', 'Value': project_name},
                    {'Key': 'Environment', 'Value': environment},
                    {'Key': 'ManagedBy', 'Value': 'deployment-script'}
                ]
            )
            
            rule_arn = rule_response['RuleArn']
            print(f"✓ Created rule: {rule_name}")
            
            # Get Lambda function ARN
            lambda_response = lambda_client.get_function(FunctionName=lambda_function_name)
            lambda_arn = lambda_response['Configuration']['FunctionArn']
            
            # Add target to the rule
            target_response = events_client.put_targets(
                Rule=rule_name,
                Targets=[
                    {
                        'Id': '1',
                        'Arn': lambda_arn,
                        'Input': json.dumps(rule_config['input'])
                    }
                ]
            )
            
            print(f"✓ Added target to rule: {rule_name}")
            
            # Add permission for EventBridge to invoke Lambda
            try:
                lambda_client.add_permission(
                    FunctionName=lambda_function_name,
                    StatementId=f'eventbridge-{rule_name}-{int(datetime.utcnow().timestamp())}',
                    Action='lambda:InvokeFunction',
                    Principal='events.amazonaws.com',
                    SourceArn=rule_arn
                )
                print(f"✓ Added Lambda permission for rule: {rule_name}")
            except Exception as e:
                if "ResourceConflictException" in str(e):
                    print(f"✓ Lambda permission already exists for rule: {rule_name}")
                else:
                    print(f"⚠ Warning: Failed to add Lambda permission for {rule_name}: {e}")
            
            deployed_rules.append({
                'name': rule_name,
                'arn': rule_arn,
                'schedule': rule_config['schedule'],
                'lambda_function': lambda_function_name,
                'description': rule_config['description']
            })
            
        except Exception as e:
            print(f"✗ Error creating rule {rule_name}: {e}")
            continue
    
    print(f"\n✅ Successfully deployed {len(deployed_rules)} EventBridge rules")
    return deployed_rules

def create_custom_event_bus():
    """Create a custom event bus for internal events"""
    
    events_client = boto3.client('events', region_name='us-east-1')
    
    project_name = "govbiz-ai"
    environment = "dev"
    event_bus_name = f"{project_name}-{environment}-event-bus"
    
    print(f"Creating custom event bus: {event_bus_name}")
    
    try:
        response = events_client.create_event_bus(
            Name=event_bus_name,
            Tags=[
                {'Key': 'Project', 'Value': project_name},
                {'Key': 'Environment', 'Value': environment},
                {'Key': 'ManagedBy', 'Value': 'deployment-script'}
            ]
        )
        
        event_bus_arn = response['EventBusArn']
        print(f"✓ Created custom event bus: {event_bus_arn}")
        
        # Create rules for custom events
        custom_rules = [
            {
                'name': f'{project_name}-{environment}-opportunity-discovered',
                'description': 'Rule triggered when new opportunity is discovered',
                'event_pattern': {
                    "source": ["govbiz.ai"],
                    "detail-type": ["Opportunity Discovered"],
                    "detail": {
                        "status": ["discovered"]
                    }
                },
                'lambda_function': f'{project_name}-{environment}-analyzer-agent'
            },
            {
                'name': f'{project_name}-{environment}-analysis-complete',
                'description': 'Rule triggered when analysis is complete',
                'event_pattern': {
                    "source": ["govbiz.ai"],
                    "detail-type": ["Analysis Complete"],
                    "detail": {
                        "status": ["analyzed"]
                    }
                },
                'lambda_function': f'{project_name}-{environment}-response-generator-agent'
            },
            {
                'name': f'{project_name}-{environment}-response-generated',
                'description': 'Rule triggered when response is generated',
                'event_pattern': {
                    "source": ["govbiz.ai"],
                    "detail-type": ["Response Generated"],
                    "detail": {
                        "status": ["response_generated"]
                    }
                },
                'lambda_function': f'{project_name}-{environment}-human-loop-agent'
            }
        ]
        
        for rule_config in custom_rules:
            rule_name = rule_config['name']
            lambda_function_name = rule_config['lambda_function']
            
            print(f"Creating custom event rule: {rule_name}")
            
            try:
                # Create rule on custom event bus
                rule_response = events_client.put_rule(
                    Name=rule_name,
                    EventPattern=json.dumps(rule_config['event_pattern']),
                    Description=rule_config['description'],
                    State='ENABLED',
                    EventBusName=event_bus_name,
                    Tags=[
                        {'Key': 'Project', 'Value': project_name},
                        {'Key': 'Environment', 'Value': environment}
                    ]
                )
                
                rule_arn = rule_response['RuleArn']
                print(f"✓ Created custom event rule: {rule_name}")
                
                # Get Lambda function ARN
                lambda_client = boto3.client('lambda', region_name='us-east-1')
                lambda_response = lambda_client.get_function(FunctionName=lambda_function_name)
                lambda_arn = lambda_response['Configuration']['FunctionArn']
                
                # Add target to the rule
                events_client.put_targets(
                    Rule=rule_name,
                    EventBusName=event_bus_name,
                    Targets=[
                        {
                            'Id': '1',
                            'Arn': lambda_arn
                        }
                    ]
                )
                
                print(f"✓ Added target to custom event rule: {rule_name}")
                
                # Add permission for EventBridge to invoke Lambda
                try:
                    lambda_client.add_permission(
                        FunctionName=lambda_function_name,
                        StatementId=f'eventbridge-custom-{rule_name}-{int(datetime.utcnow().timestamp())}',
                        Action='lambda:InvokeFunction',
                        Principal='events.amazonaws.com',
                        SourceArn=rule_arn
                    )
                    print(f"✓ Added Lambda permission for custom event rule: {rule_name}")
                except Exception as e:
                    if "ResourceConflictException" in str(e):
                        print(f"✓ Lambda permission already exists for custom event rule: {rule_name}")
                    else:
                        print(f"⚠ Warning: Failed to add Lambda permission for {rule_name}: {e}")
                
            except Exception as e:
                print(f"✗ Error creating custom event rule {rule_name}: {e}")
                continue
        
        return event_bus_arn
        
    except Exception as e:
        if "ResourceAlreadyExistsException" in str(e):
            print(f"✓ Custom event bus already exists: {event_bus_name}")
            # Get existing event bus ARN
            try:
                response = events_client.describe_event_bus(Name=event_bus_name)
                return response['Arn']
            except:
                return None
        else:
            print(f"✗ Error creating custom event bus: {e}")
            return None

if __name__ == "__main__":
    print("=" * 60)
    print("EVENTBRIDGE DEPLOYMENT")
    print("=" * 60)
    
    # Deploy scheduled rules
    scheduled_rules = deploy_eventbridge_rules()
    
    # Create custom event bus
    event_bus_arn = create_custom_event_bus()
    
    print("\n" + "=" * 60)
    print("EVENTBRIDGE DEPLOYMENT SUMMARY")
    print("=" * 60)
    
    print(f"\nScheduled Rules ({len(scheduled_rules)}):")
    for rule in scheduled_rules:
        print(f"  {rule['name']}")
        print(f"    Schedule: {rule['schedule']}")
        print(f"    Lambda: {rule['lambda_function']}")
        print(f"    Description: {rule['description']}")
        print()
    
    if event_bus_arn:
        print(f"Custom Event Bus: {event_bus_arn}")
    
    print("\n✅ EventBridge deployment completed successfully!")
    print("\nNext steps:")
    print("1. Test scheduled rules are triggering correctly")
    print("2. Configure CloudWatch monitoring for EventBridge")
    print("3. Set up alerts for failed rule executions")
    print("4. Test custom event publishing from agents")