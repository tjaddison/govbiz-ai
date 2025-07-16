#!/usr/bin/env python3
"""
Deploy SQS queues for GovBiz.ai multi-agent system
"""

import boto3
import json
import time

def deploy_sqs_queues():
    """Deploy SQS queues with correct attribute names"""
    
    sqs = boto3.client('sqs', region_name='us-east-1')
    project_name = "govbiz-ai"
    environment = "dev"
    stack_name = f"{project_name}-{environment}"
    
    # Create DLQ first
    dlq_name = f"{stack_name}-dlq"
    print(f"Creating DLQ: {dlq_name}")
    
    try:
        dlq_response = sqs.create_queue(
            QueueName=dlq_name,
            Attributes={
                'VisibilityTimeout': '300',
                'MessageRetentionPeriod': '1209600'
            }
        )
        dlq_url = dlq_response['QueueUrl']
        print(f"✓ Created DLQ: {dlq_url}")
        
        # Get DLQ ARN
        dlq_attrs = sqs.get_queue_attributes(
            QueueUrl=dlq_url,
            AttributeNames=['QueueArn']
        )
        dlq_arn = dlq_attrs['Attributes']['QueueArn']
        
    except Exception as e:
        if "QueueAlreadyExists" in str(e):
            print(f"✓ DLQ already exists: {dlq_name}")
            dlq_url = sqs.get_queue_url(QueueName=dlq_name)['QueueUrl']
            dlq_attrs = sqs.get_queue_attributes(
                QueueUrl=dlq_url,
                AttributeNames=['QueueArn']
            )
            dlq_arn = dlq_attrs['Attributes']['QueueArn']
        else:
            print(f"✗ Error creating DLQ: {e}")
            return False
    
    # Create main queues
    queues = [
        {
            'name': f"{stack_name}-opportunity-finder-queue",
            'visibility_timeout': '900',  # 15 minutes
            'description': 'Queue for opportunity discovery tasks'
        },
        {
            'name': f"{stack_name}-analyzer-queue",
            'visibility_timeout': '900',  # 15 minutes
            'description': 'Queue for opportunity analysis tasks'
        },
        {
            'name': f"{stack_name}-response-generator-queue",
            'visibility_timeout': '600',  # 10 minutes
            'description': 'Queue for response generation tasks'
        },
        {
            'name': f"{stack_name}-relationship-manager-queue",
            'visibility_timeout': '300',  # 5 minutes
            'description': 'Queue for relationship management tasks'
        },
        {
            'name': f"{stack_name}-email-manager-queue",
            'visibility_timeout': '300',  # 5 minutes
            'description': 'Queue for email management tasks'
        },
        {
            'name': f"{stack_name}-human-loop-queue",
            'visibility_timeout': '300',  # 5 minutes
            'description': 'Queue for human-in-the-loop tasks'
        }
    ]
    
    created_queues = []
    
    for queue_config in queues:
        queue_name = queue_config['name']
        print(f"Creating queue: {queue_name}")
        
        try:
            attributes = {
                'VisibilityTimeout': queue_config['visibility_timeout'],
                'MessageRetentionPeriod': '1209600',  # 14 days
                'RedrivePolicy': json.dumps({
                    'deadLetterTargetArn': dlq_arn,
                    'maxReceiveCount': 3
                })
            }
            
            response = sqs.create_queue(
                QueueName=queue_name,
                Attributes=attributes
            )
            
            queue_url = response['QueueUrl']
            created_queues.append({
                'name': queue_name,
                'url': queue_url,
                'description': queue_config['description']
            })
            print(f"✓ Created queue: {queue_name}")
            
        except Exception as e:
            if "QueueAlreadyExists" in str(e):
                print(f"✓ Queue already exists: {queue_name}")
                queue_url = sqs.get_queue_url(QueueName=queue_name)['QueueUrl']
                created_queues.append({
                    'name': queue_name,
                    'url': queue_url,
                    'description': queue_config['description']
                })
            else:
                print(f"✗ Error creating queue {queue_name}: {e}")
    
    print(f"\n✅ Successfully created {len(created_queues)} SQS queues")
    print(f"✅ DLQ ARN: {dlq_arn}")
    
    return created_queues, dlq_arn

if __name__ == "__main__":
    queues, dlq_arn = deploy_sqs_queues()
    
    print("\n" + "="*60)
    print("SQS DEPLOYMENT SUMMARY")
    print("="*60)
    
    for queue in queues:
        print(f"Queue: {queue['name']}")
        print(f"  URL: {queue['url']}")
        print(f"  Purpose: {queue['description']}")
        print()
    
    print(f"Dead Letter Queue ARN: {dlq_arn}")
    print("\n✅ All SQS queues deployed successfully!")