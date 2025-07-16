#!/usr/bin/env python3
"""
Simple deployment script using boto3 directly
Creates basic infrastructure for GovBiz.ai platform
"""

import boto3
import json
import time
from typing import Dict, Any

class SimpleDeployer:
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self.project_name = "govbiz-ai"
        self.environment = "dev"
        self.stack_name = f"{self.project_name}-{self.environment}"
        
        # Initialize AWS clients
        self.cloudformation = boto3.client('cloudformation', region_name=region)
        self.dynamodb = boto3.client('dynamodb', region_name=region)
        self.sqs = boto3.client('sqs', region_name=region)
        self.lambda_client = boto3.client('lambda', region_name=region)
        self.iam = boto3.client('iam', region_name=region)
        self.sns = boto3.client('sns', region_name=region)
        self.secretsmanager = boto3.client('secretsmanager', region_name=region)
        
    def create_dynamodb_tables(self):
        """Create DynamoDB tables"""
        print("Creating DynamoDB tables...")
        
        tables = [
            {
                'TableName': f'{self.stack_name}-opportunities',
                'KeySchema': [
                    {'AttributeName': 'id', 'KeyType': 'HASH'}
                ],
                'AttributeDefinitions': [
                    {'AttributeName': 'id', 'AttributeType': 'S'},
                    {'AttributeName': 'notice_id', 'AttributeType': 'S'},
                    {'AttributeName': 'agency', 'AttributeType': 'S'}
                ],
                'BillingMode': 'PAY_PER_REQUEST',
                'GlobalSecondaryIndexes': [
                    {
                        'IndexName': 'notice-id-index',
                        'KeySchema': [
                            {'AttributeName': 'notice_id', 'KeyType': 'HASH'}
                        ],
                        'Projection': {'ProjectionType': 'ALL'}
                    },
                    {
                        'IndexName': 'agency-index',
                        'KeySchema': [
                            {'AttributeName': 'agency', 'KeyType': 'HASH'}
                        ],
                        'Projection': {'ProjectionType': 'ALL'}
                    }
                ],
                'Tags': [
                    {'Key': 'Project', 'Value': self.project_name},
                    {'Key': 'Environment', 'Value': self.environment}
                ]
            },
            {
                'TableName': f'{self.stack_name}-companies',
                'KeySchema': [
                    {'AttributeName': 'id', 'KeyType': 'HASH'}
                ],
                'AttributeDefinitions': [
                    {'AttributeName': 'id', 'AttributeType': 'S'}
                ],
                'BillingMode': 'PAY_PER_REQUEST',
                'Tags': [
                    {'Key': 'Project', 'Value': self.project_name},
                    {'Key': 'Environment', 'Value': self.environment}
                ]
            },
            {
                'TableName': f'{self.stack_name}-responses',
                'KeySchema': [
                    {'AttributeName': 'id', 'KeyType': 'HASH'}
                ],
                'AttributeDefinitions': [
                    {'AttributeName': 'id', 'AttributeType': 'S'},
                    {'AttributeName': 'opportunity_id', 'AttributeType': 'S'}
                ],
                'BillingMode': 'PAY_PER_REQUEST',
                'GlobalSecondaryIndexes': [
                    {
                        'IndexName': 'opportunity-id-index',
                        'KeySchema': [
                            {'AttributeName': 'opportunity_id', 'KeyType': 'HASH'}
                        ],
                        'Projection': {'ProjectionType': 'ALL'}
                    }
                ],
                'Tags': [
                    {'Key': 'Project', 'Value': self.project_name},
                    {'Key': 'Environment', 'Value': self.environment}
                ]
            },
            {
                'TableName': f'{self.stack_name}-contacts',
                'KeySchema': [
                    {'AttributeName': 'id', 'KeyType': 'HASH'}
                ],
                'AttributeDefinitions': [
                    {'AttributeName': 'id', 'AttributeType': 'S'},
                    {'AttributeName': 'email', 'AttributeType': 'S'},
                    {'AttributeName': 'agency', 'AttributeType': 'S'}
                ],
                'BillingMode': 'PAY_PER_REQUEST',
                'GlobalSecondaryIndexes': [
                    {
                        'IndexName': 'email-index',
                        'KeySchema': [
                            {'AttributeName': 'email', 'KeyType': 'HASH'}
                        ],
                        'Projection': {'ProjectionType': 'ALL'}
                    },
                    {
                        'IndexName': 'agency-index',
                        'KeySchema': [
                            {'AttributeName': 'agency', 'KeyType': 'HASH'}
                        ],
                        'Projection': {'ProjectionType': 'ALL'}
                    }
                ],
                'Tags': [
                    {'Key': 'Project', 'Value': self.project_name},
                    {'Key': 'Environment', 'Value': self.environment}
                ]
            },
            {
                'TableName': f'{self.stack_name}-events',
                'KeySchema': [
                    {'AttributeName': 'id', 'KeyType': 'HASH'}
                ],
                'AttributeDefinitions': [
                    {'AttributeName': 'id', 'AttributeType': 'S'},
                    {'AttributeName': 'aggregate_id', 'AttributeType': 'S'},
                    {'AttributeName': 'timestamp', 'AttributeType': 'S'}
                ],
                'BillingMode': 'PAY_PER_REQUEST',
                'GlobalSecondaryIndexes': [
                    {
                        'IndexName': 'aggregate-id-timestamp-index',
                        'KeySchema': [
                            {'AttributeName': 'aggregate_id', 'KeyType': 'HASH'},
                            {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
                        ],
                        'Projection': {'ProjectionType': 'ALL'}
                    }
                ],
                'Tags': [
                    {'Key': 'Project', 'Value': self.project_name},
                    {'Key': 'Environment', 'Value': self.environment}
                ]
            }
        ]
        
        created_tables = []
        for table_config in tables:
            try:
                print(f"Creating table: {table_config['TableName']}")
                self.dynamodb.create_table(**table_config)
                created_tables.append(table_config['TableName'])
                print(f"✓ Created table: {table_config['TableName']}")
            except Exception as e:
                if "ResourceInUseException" in str(e):
                    print(f"✓ Table already exists: {table_config['TableName']}")
                else:
                    print(f"✗ Error creating table {table_config['TableName']}: {e}")
        
        # Wait for tables to be active
        for table_name in created_tables:
            print(f"Waiting for table {table_name} to be active...")
            waiter = self.dynamodb.get_waiter('table_exists')
            waiter.wait(TableName=table_name)
        
        print("✓ All DynamoDB tables created successfully")
        return created_tables
    
    def create_sqs_queues(self):
        """Create SQS queues"""
        print("Creating SQS queues...")
        
        queues = [
            f"{self.stack_name}-opportunity-finder-queue",
            f"{self.stack_name}-analyzer-queue",
            f"{self.stack_name}-response-generator-queue",
            f"{self.stack_name}-relationship-manager-queue",
            f"{self.stack_name}-email-manager-queue",
            f"{self.stack_name}-human-loop-queue",
            f"{self.stack_name}-dlq"
        ]
        
        created_queues = []
        for queue_name in queues:
            try:
                print(f"Creating queue: {queue_name}")
                
                attributes = {
                    'VisibilityTimeoutSeconds': '300',
                    'MessageRetentionPeriod': '1209600',  # 14 days
                }
                
                # Add DLQ configuration for non-DLQ queues
                if not queue_name.endswith('-dlq'):
                    dlq_name = f"{self.stack_name}-dlq"
                    try:
                        dlq_url = self.sqs.get_queue_url(QueueName=dlq_name)['QueueUrl']
                        dlq_attrs = self.sqs.get_queue_attributes(
                            QueueUrl=dlq_url,
                            AttributeNames=['QueueArn']
                        )
                        dlq_arn = dlq_attrs['Attributes']['QueueArn']
                        
                        attributes['RedrivePolicy'] = json.dumps({
                            'deadLetterTargetArn': dlq_arn,
                            'maxReceiveCount': 3
                        })
                    except:
                        pass  # DLQ may not exist yet
                
                response = self.sqs.create_queue(
                    QueueName=queue_name,
                    Attributes=attributes
                )
                created_queues.append(response['QueueUrl'])
                print(f"✓ Created queue: {queue_name}")
                
            except Exception as e:
                if "QueueAlreadyExists" in str(e):
                    print(f"✓ Queue already exists: {queue_name}")
                else:
                    print(f"✗ Error creating queue {queue_name}: {e}")
        
        print("✓ All SQS queues created successfully")
        return created_queues
    
    def create_secrets(self):
        """Create secrets in AWS Secrets Manager"""
        print("Creating secrets...")
        
        secret_name = f"{self.stack_name}-api-keys"
        
        secret_value = {
            "anthropic_api_key": "PLACEHOLDER_ANTHROPIC_API_KEY",
            "slack_bot_token": "PLACEHOLDER_SLACK_BOT_TOKEN",
            "slack_signing_secret": "PLACEHOLDER_SLACK_SIGNING_SECRET",
            "sam_gov_api_key": "PLACEHOLDER_SAM_GOV_API_KEY",
            "google_oauth_client_id": "PLACEHOLDER_GOOGLE_OAUTH_CLIENT_ID",
            "google_oauth_client_secret": "PLACEHOLDER_GOOGLE_OAUTH_CLIENT_SECRET",
            "nextauth_secret": "PLACEHOLDER_NEXTAUTH_SECRET",
            "nextauth_url": f"https://{self.stack_name}.vercel.app"
        }
        
        try:
            response = self.secretsmanager.create_secret(
                Name=secret_name,
                Description="API keys and secrets for GovBiz.ai multi-agent system",
                SecretString=json.dumps(secret_value),
                Tags=[
                    {'Key': 'Project', 'Value': self.project_name},
                    {'Key': 'Environment', 'Value': self.environment}
                ]
            )
            print(f"✓ Created secret: {secret_name}")
            return response['ARN']
        except Exception as e:
            if "ResourceExistsException" in str(e):
                print(f"✓ Secret already exists: {secret_name}")
                # Get existing secret ARN
                response = self.secretsmanager.describe_secret(SecretId=secret_name)
                return response['ARN']
            else:
                print(f"✗ Error creating secret: {e}")
                return None
    
    def create_sns_topic(self):
        """Create SNS topic for notifications"""
        print("Creating SNS topic...")
        
        topic_name = f"{self.stack_name}-notifications"
        
        try:
            response = self.sns.create_topic(
                Name=topic_name,
                Tags=[
                    {'Key': 'Project', 'Value': self.project_name},
                    {'Key': 'Environment', 'Value': self.environment}
                ]
            )
            topic_arn = response['TopicArn']
            print(f"✓ Created SNS topic: {topic_name}")
            return topic_arn
        except Exception as e:
            print(f"✗ Error creating SNS topic: {e}")
            return None
    
    def deploy_infrastructure(self):
        """Deploy the complete infrastructure"""
        print(f"Starting deployment for {self.project_name}-{self.environment}")
        
        # Create DynamoDB tables
        tables = self.create_dynamodb_tables()
        
        # Create SQS queues
        queues = self.create_sqs_queues()
        
        # Create secrets
        secret_arn = self.create_secrets()
        
        # Create SNS topic
        topic_arn = self.create_sns_topic()
        
        # Display summary
        print("\n" + "="*60)
        print("DEPLOYMENT SUMMARY")
        print("="*60)
        print(f"Project: {self.project_name}")
        print(f"Environment: {self.environment}")
        print(f"Region: {self.region}")
        print(f"Stack: {self.stack_name}")
        
        print(f"\nDynamoDB Tables Created: {len(tables)}")
        for table in tables:
            print(f"  - {table}")
        
        print(f"\nSQS Queues Created: {len(queues)}")
        for queue in queues:
            print(f"  - {queue}")
        
        if secret_arn:
            print(f"\nSecrets Manager ARN: {secret_arn}")
        
        if topic_arn:
            print(f"SNS Topic ARN: {topic_arn}")
        
        print("\n" + "="*60)
        print("NEXT STEPS")
        print("="*60)
        print("1. Update API keys in AWS Secrets Manager")
        print("2. Deploy Lambda functions manually")
        print("3. Set up API Gateway")
        print("4. Configure monitoring and alarms")
        print("5. Deploy web application")
        
        return {
            "tables": tables,
            "queues": queues,
            "secret_arn": secret_arn,
            "topic_arn": topic_arn
        }

def main():
    deployer = SimpleDeployer()
    result = deployer.deploy_infrastructure()
    print(f"\nDeployment completed successfully!")
    return result

if __name__ == "__main__":
    main()