#!/usr/bin/env python3
"""
Deploy CloudWatch monitoring and alarms for GovBiz.ai system
"""

import boto3
import json
from datetime import datetime, timezone

def create_cloudwatch_alarms():
    """Create CloudWatch alarms for Lambda functions and other resources"""
    
    cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
    sns = boto3.client('sns', region_name='us-east-1')
    
    project_name = "govbiz-ai"
    environment = "dev"
    
    # Get or create SNS topic for alerts
    topic_name = f"{project_name}-{environment}-alerts"
    print(f"Creating SNS topic for alerts: {topic_name}")
    
    try:
        topic_response = sns.create_topic(Name=topic_name)
        topic_arn = topic_response['TopicArn']
        print(f"✓ Created SNS topic: {topic_arn}")
    except Exception as e:
        print(f"⚠ Warning: SNS topic may already exist: {e}")
        # Get existing topic ARN
        topics = sns.list_topics()
        topic_arn = None
        for topic in topics['Topics']:
            if topic_name in topic['TopicArn']:
                topic_arn = topic['TopicArn']
                break
        
        if not topic_arn:
            print("✗ Could not find or create SNS topic")
            return False
    
    # Lambda function names to monitor
    lambda_functions = [
        f'{project_name}-{environment}-opportunity-finder-agent',
        f'{project_name}-{environment}-analyzer-agent',
        f'{project_name}-{environment}-response-generator-agent',
        f'{project_name}-{environment}-relationship-manager-agent',
        f'{project_name}-{environment}-email-manager-agent',
        f'{project_name}-{environment}-human-loop-agent',
        f'{project_name}-{environment}-api'
    ]
    
    # Create alarms for each Lambda function
    alarms_created = []
    
    for function_name in lambda_functions:
        print(f"Creating alarms for Lambda function: {function_name}")
        
        # Error rate alarm
        error_alarm_name = f"{function_name}-error-rate"
        try:
            cloudwatch.put_metric_alarm(
                AlarmName=error_alarm_name,
                ComparisonOperator='GreaterThanThreshold',
                EvaluationPeriods=2,
                MetricName='Errors',
                Namespace='AWS/Lambda',
                Period=300,  # 5 minutes
                Statistic='Sum',
                Threshold=5.0,
                ActionsEnabled=True,
                AlarmActions=[topic_arn],
                AlarmDescription=f'Error rate alarm for {function_name}',
                Dimensions=[
                    {
                        'Name': 'FunctionName',
                        'Value': function_name
                    }
                ],
                Unit='Count',
                TreatMissingData='notBreaching',
                Tags=[
                    {'Key': 'Project', 'Value': project_name},
                    {'Key': 'Environment', 'Value': environment},
                    {'Key': 'ResourceType', 'Value': 'Lambda'},
                    {'Key': 'AlarmType', 'Value': 'ErrorRate'}
                ]
            )
            print(f"  ✓ Created error rate alarm: {error_alarm_name}")
            alarms_created.append(error_alarm_name)
        except Exception as e:
            print(f"  ✗ Failed to create error rate alarm: {e}")
        
        # Duration alarm
        duration_alarm_name = f"{function_name}-duration"
        try:
            cloudwatch.put_metric_alarm(
                AlarmName=duration_alarm_name,
                ComparisonOperator='GreaterThanThreshold',
                EvaluationPeriods=2,
                MetricName='Duration',
                Namespace='AWS/Lambda',
                Period=300,  # 5 minutes
                Statistic='Average',
                Threshold=30000.0,  # 30 seconds
                ActionsEnabled=True,
                AlarmActions=[topic_arn],
                AlarmDescription=f'Duration alarm for {function_name}',
                Dimensions=[
                    {
                        'Name': 'FunctionName',
                        'Value': function_name
                    }
                ],
                Unit='Milliseconds',
                TreatMissingData='notBreaching',
                Tags=[
                    {'Key': 'Project', 'Value': project_name},
                    {'Key': 'Environment', 'Value': environment},
                    {'Key': 'ResourceType', 'Value': 'Lambda'},
                    {'Key': 'AlarmType', 'Value': 'Duration'}
                ]
            )
            print(f"  ✓ Created duration alarm: {duration_alarm_name}")
            alarms_created.append(duration_alarm_name)
        except Exception as e:
            print(f"  ✗ Failed to create duration alarm: {e}")
        
        # Throttle alarm
        throttle_alarm_name = f"{function_name}-throttles"
        try:
            cloudwatch.put_metric_alarm(
                AlarmName=throttle_alarm_name,
                ComparisonOperator='GreaterThanThreshold',
                EvaluationPeriods=1,
                MetricName='Throttles',
                Namespace='AWS/Lambda',
                Period=300,  # 5 minutes
                Statistic='Sum',
                Threshold=1.0,
                ActionsEnabled=True,
                AlarmActions=[topic_arn],
                AlarmDescription=f'Throttle alarm for {function_name}',
                Dimensions=[
                    {
                        'Name': 'FunctionName',
                        'Value': function_name
                    }
                ],
                Unit='Count',
                TreatMissingData='notBreaching',
                Tags=[
                    {'Key': 'Project', 'Value': project_name},
                    {'Key': 'Environment', 'Value': environment},
                    {'Key': 'ResourceType', 'Value': 'Lambda'},
                    {'Key': 'AlarmType', 'Value': 'Throttles'}
                ]
            )
            print(f"  ✓ Created throttle alarm: {throttle_alarm_name}")
            alarms_created.append(throttle_alarm_name)
        except Exception as e:
            print(f"  ✗ Failed to create throttle alarm: {e}")
    
    # Create API Gateway alarms
    api_gateway_id = "6y7hinexc0"  # From previous deployment
    print(f"Creating alarms for API Gateway: {api_gateway_id}")
    
    # 4XX error alarm
    api_4xx_alarm_name = f"{project_name}-{environment}-api-4xx-errors"
    try:
        cloudwatch.put_metric_alarm(
            AlarmName=api_4xx_alarm_name,
            ComparisonOperator='GreaterThanThreshold',
            EvaluationPeriods=2,
            MetricName='4XXError',
            Namespace='AWS/ApiGateway',
            Period=300,  # 5 minutes
            Statistic='Sum',
            Threshold=10.0,
            ActionsEnabled=True,
            AlarmActions=[topic_arn],
            AlarmDescription=f'4XX error alarm for API Gateway {api_gateway_id}',
            Dimensions=[
                {
                    'Name': 'ApiName',
                    'Value': f'{project_name}-{environment}-api'
                }
            ],
            Unit='Count',
            TreatMissingData='notBreaching',
            Tags=[
                {'Key': 'Project', 'Value': project_name},
                {'Key': 'Environment', 'Value': environment},
                {'Key': 'ResourceType', 'Value': 'ApiGateway'},
                {'Key': 'AlarmType', 'Value': '4XXError'}
            ]
        )
        print(f"  ✓ Created 4XX error alarm: {api_4xx_alarm_name}")
        alarms_created.append(api_4xx_alarm_name)
    except Exception as e:
        print(f"  ✗ Failed to create 4XX error alarm: {e}")
    
    # 5XX error alarm
    api_5xx_alarm_name = f"{project_name}-{environment}-api-5xx-errors"
    try:
        cloudwatch.put_metric_alarm(
            AlarmName=api_5xx_alarm_name,
            ComparisonOperator='GreaterThanThreshold',
            EvaluationPeriods=1,
            MetricName='5XXError',
            Namespace='AWS/ApiGateway',
            Period=300,  # 5 minutes
            Statistic='Sum',
            Threshold=1.0,
            ActionsEnabled=True,
            AlarmActions=[topic_arn],
            AlarmDescription=f'5XX error alarm for API Gateway {api_gateway_id}',
            Dimensions=[
                {
                    'Name': 'ApiName',
                    'Value': f'{project_name}-{environment}-api'
                }
            ],
            Unit='Count',
            TreatMissingData='notBreaching',
            Tags=[
                {'Key': 'Project', 'Value': project_name},
                {'Key': 'Environment', 'Value': environment},
                {'Key': 'ResourceType', 'Value': 'ApiGateway'},
                {'Key': 'AlarmType', 'Value': '5XXError'}
            ]
        )
        print(f"  ✓ Created 5XX error alarm: {api_5xx_alarm_name}")
        alarms_created.append(api_5xx_alarm_name)
    except Exception as e:
        print(f"  ✗ Failed to create 5XX error alarm: {e}")
    
    # API Gateway latency alarm
    api_latency_alarm_name = f"{project_name}-{environment}-api-latency"
    try:
        cloudwatch.put_metric_alarm(
            AlarmName=api_latency_alarm_name,
            ComparisonOperator='GreaterThanThreshold',
            EvaluationPeriods=2,
            MetricName='Latency',
            Namespace='AWS/ApiGateway',
            Period=300,  # 5 minutes
            Statistic='Average',
            Threshold=5000.0,  # 5 seconds
            ActionsEnabled=True,
            AlarmActions=[topic_arn],
            AlarmDescription=f'Latency alarm for API Gateway {api_gateway_id}',
            Dimensions=[
                {
                    'Name': 'ApiName',
                    'Value': f'{project_name}-{environment}-api'
                }
            ],
            Unit='Milliseconds',
            TreatMissingData='notBreaching',
            Tags=[
                {'Key': 'Project', 'Value': project_name},
                {'Key': 'Environment', 'Value': environment},
                {'Key': 'ResourceType', 'Value': 'ApiGateway'},
                {'Key': 'AlarmType', 'Value': 'Latency'}
            ]
        )
        print(f"  ✓ Created latency alarm: {api_latency_alarm_name}")
        alarms_created.append(api_latency_alarm_name)
    except Exception as e:
        print(f"  ✗ Failed to create latency alarm: {e}")
    
    print(f"\n✅ Created {len(alarms_created)} CloudWatch alarms")
    return alarms_created, topic_arn

def create_custom_metrics():
    """Create custom metrics for business logic monitoring"""
    
    cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
    
    project_name = "govbiz-ai"
    environment = "dev"
    
    print("Creating custom metric namespace...")
    
    # Create custom metrics for business logic
    custom_metrics = [
        {
            'MetricName': 'OpportunitiesDiscovered',
            'Namespace': f'{project_name}/{environment}/Business',
            'Unit': 'Count',
            'Value': 0,
            'Dimensions': [
                {
                    'Name': 'Environment',
                    'Value': environment
                },
                {
                    'Name': 'Agent',
                    'Value': 'OpportunityFinder'
                }
            ]
        },
        {
            'MetricName': 'OpportunitiesAnalyzed',
            'Namespace': f'{project_name}/{environment}/Business',
            'Unit': 'Count',
            'Value': 0,
            'Dimensions': [
                {
                    'Name': 'Environment',
                    'Value': environment
                },
                {
                    'Name': 'Agent',
                    'Value': 'Analyzer'
                }
            ]
        },
        {
            'MetricName': 'ResponsesGenerated',
            'Namespace': f'{project_name}/{environment}/Business',
            'Unit': 'Count',
            'Value': 0,
            'Dimensions': [
                {
                    'Name': 'Environment',
                    'Value': environment
                },
                {
                    'Name': 'Agent',
                    'Value': 'ResponseGenerator'
                }
            ]
        },
        {
            'MetricName': 'EmailsSent',
            'Namespace': f'{project_name}/{environment}/Business',
            'Unit': 'Count',
            'Value': 0,
            'Dimensions': [
                {
                    'Name': 'Environment',
                    'Value': environment
                },
                {
                    'Name': 'Agent',
                    'Value': 'EmailManager'
                }
            ]
        }
    ]
    
    # Initialize custom metrics
    for metric in custom_metrics:
        try:
            cloudwatch.put_metric_data(
                Namespace=metric['Namespace'],
                MetricData=[
                    {
                        'MetricName': metric['MetricName'],
                        'Dimensions': metric['Dimensions'],
                        'Value': metric['Value'],
                        'Unit': metric['Unit'],
                        'Timestamp': datetime.now(timezone.utc)
                    }
                ]
            )
            print(f"  ✓ Initialized custom metric: {metric['MetricName']}")
        except Exception as e:
            print(f"  ✗ Failed to initialize custom metric {metric['MetricName']}: {e}")
    
    print("✅ Custom metrics initialized")
    return custom_metrics

def create_cloudwatch_dashboard():
    """Create CloudWatch dashboard for monitoring"""
    
    cloudwatch = boto3.client('cloudwatch', region_name='us-east-1')
    
    project_name = "govbiz-ai"
    environment = "dev"
    dashboard_name = f"{project_name}-{environment}-dashboard"
    
    print(f"Creating CloudWatch dashboard: {dashboard_name}")
    
    # Dashboard definition
    dashboard_body = {
        "widgets": [
            {
                "type": "metric",
                "x": 0,
                "y": 0,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        ["AWS/Lambda", "Invocations", "FunctionName", f"{project_name}-{environment}-opportunity-finder-agent"],
                        [".", "Errors", ".", "."],
                        [".", "Duration", ".", "."],
                        [".", "Throttles", ".", "."]
                    ],
                    "period": 300,
                    "stat": "Sum",
                    "region": "us-east-1",
                    "title": "OpportunityFinder Agent Metrics",
                    "yAxis": {
                        "left": {
                            "min": 0
                        }
                    }
                }
            },
            {
                "type": "metric",
                "x": 12,
                "y": 0,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        ["AWS/Lambda", "Invocations", "FunctionName", f"{project_name}-{environment}-analyzer-agent"],
                        [".", "Errors", ".", "."],
                        [".", "Duration", ".", "."],
                        [".", "Throttles", ".", "."]
                    ],
                    "period": 300,
                    "stat": "Sum",
                    "region": "us-east-1",
                    "title": "Analyzer Agent Metrics",
                    "yAxis": {
                        "left": {
                            "min": 0
                        }
                    }
                }
            },
            {
                "type": "metric",
                "x": 0,
                "y": 6,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        ["AWS/ApiGateway", "Count", "ApiName", f"{project_name}-{environment}-api"],
                        [".", "4XXError", ".", "."],
                        [".", "5XXError", ".", "."],
                        [".", "Latency", ".", "."]
                    ],
                    "period": 300,
                    "stat": "Sum",
                    "region": "us-east-1",
                    "title": "API Gateway Metrics",
                    "yAxis": {
                        "left": {
                            "min": 0
                        }
                    }
                }
            },
            {
                "type": "metric",
                "x": 12,
                "y": 6,
                "width": 12,
                "height": 6,
                "properties": {
                    "metrics": [
                        [f"{project_name}/{environment}/Business", "OpportunitiesDiscovered", "Environment", environment],
                        [".", "OpportunitiesAnalyzed", ".", "."],
                        [".", "ResponsesGenerated", ".", "."],
                        [".", "EmailsSent", ".", "."]
                    ],
                    "period": 300,
                    "stat": "Sum",
                    "region": "us-east-1",
                    "title": "Business Metrics",
                    "yAxis": {
                        "left": {
                            "min": 0
                        }
                    }
                }
            },
            {
                "type": "log",
                "x": 0,
                "y": 12,
                "width": 24,
                "height": 6,
                "properties": {
                    "query": f"SOURCE '/aws/lambda/{project_name}-{environment}-opportunity-finder-agent'\n| fields @timestamp, @message\n| filter @message like /ERROR/\n| sort @timestamp desc\n| limit 20",
                    "region": "us-east-1",
                    "title": "Recent Errors",
                    "stacked": False
                }
            }
        ]
    }
    
    try:
        cloudwatch.put_dashboard(
            DashboardName=dashboard_name,
            DashboardBody=json.dumps(dashboard_body)
        )
        print(f"✓ Created CloudWatch dashboard: {dashboard_name}")
        return dashboard_name
    except Exception as e:
        print(f"✗ Failed to create dashboard: {e}")
        return None

def setup_log_groups():
    """Ensure log groups exist for Lambda functions"""
    
    logs_client = boto3.client('logs', region_name='us-east-1')
    
    project_name = "govbiz-ai"
    environment = "dev"
    
    # Lambda function names
    lambda_functions = [
        f'{project_name}-{environment}-opportunity-finder-agent',
        f'{project_name}-{environment}-analyzer-agent',
        f'{project_name}-{environment}-response-generator-agent',
        f'{project_name}-{environment}-relationship-manager-agent',
        f'{project_name}-{environment}-email-manager-agent',
        f'{project_name}-{environment}-human-loop-agent',
        f'{project_name}-{environment}-api'
    ]
    
    print("Setting up CloudWatch log groups...")
    
    for function_name in lambda_functions:
        log_group_name = f'/aws/lambda/{function_name}'
        
        try:
            logs_client.create_log_group(
                logGroupName=log_group_name,
                tags={
                    'Project': project_name,
                    'Environment': environment,
                    'ResourceType': 'Lambda'
                }
            )
            print(f"  ✓ Created log group: {log_group_name}")
        except logs_client.exceptions.ResourceAlreadyExistsException:
            print(f"  ✓ Log group already exists: {log_group_name}")
        except Exception as e:
            print(f"  ✗ Failed to create log group {log_group_name}: {e}")
        
        # Set retention policy
        try:
            logs_client.put_retention_policy(
                logGroupName=log_group_name,
                retentionInDays=30  # 30 days retention
            )
            print(f"  ✓ Set retention policy for: {log_group_name}")
        except Exception as e:
            print(f"  ⚠ Warning: Failed to set retention policy for {log_group_name}: {e}")
    
    print("✅ Log groups setup complete")

if __name__ == "__main__":
    print("=" * 60)
    print("CLOUDWATCH MONITORING DEPLOYMENT")
    print("=" * 60)
    
    # Setup log groups
    setup_log_groups()
    
    # Create CloudWatch alarms
    alarms, topic_arn = create_cloudwatch_alarms()
    
    # Create custom metrics
    custom_metrics = create_custom_metrics()
    
    # Create dashboard
    dashboard_name = create_cloudwatch_dashboard()
    
    print("\n" + "=" * 60)
    print("MONITORING DEPLOYMENT SUMMARY")
    print("=" * 60)
    
    print(f"\nCloudWatch Alarms Created: {len(alarms)}")
    for alarm in alarms:
        print(f"  - {alarm}")
    
    print(f"\nSNS Topic: {topic_arn}")
    
    print(f"\nCustom Metrics Namespace: govbiz-ai/dev/Business")
    for metric in custom_metrics:
        print(f"  - {metric['MetricName']}")
    
    if dashboard_name:
        print(f"\nCloudWatch Dashboard: {dashboard_name}")
        print(f"  URL: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name={dashboard_name}")
    
    print("\n✅ CloudWatch monitoring setup completed successfully!")
    print("\nNext steps:")
    print("1. Configure SNS topic subscriptions for alerts")
    print("2. Test alarm triggering")
    print("3. Review dashboard metrics")
    print("4. Set up log-based alarms for specific error patterns")
    print("5. Configure automated responses to certain alarms")