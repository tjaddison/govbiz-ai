#!/usr/bin/env python3

import boto3
import json
import time

def setup_bedrock_knowledge_bases():
    """Set up Bedrock Knowledge Bases for opportunities and companies"""

    # Initialize AWS clients
    iam = boto3.client('iam')
    bedrock_agent = boto3.client('bedrock-agent')

    # Create IAM role for Knowledge Base
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "bedrock.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }

    knowledge_base_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream"
                ],
                "Resource": [
                    "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "s3:GetObject",
                    "s3:ListBucket",
                    "s3:PutObject",
                    "s3:DeleteObject"
                ],
                "Resource": [
                    "arn:aws:s3:::govbizai-embeddings-927576824761-us-east-1",
                    "arn:aws:s3:::govbizai-embeddings-927576824761-us-east-1/*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "aoss:APIAccessAll"
                ],
                "Resource": "*"
            }
        ]
    }

    role_name = 'govbizai-knowledge-base-role'

    try:
        # Create IAM role
        print(f"Creating IAM role: {role_name}")
        role_response = iam.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description='Role for Bedrock Knowledge Base access'
        )
        role_arn = role_response['Role']['Arn']
        print(f"Created IAM role: {role_arn}")

        # Attach policy to role
        iam.put_role_policy(
            RoleName=role_name,
            PolicyName='govbizai-knowledge-base-policy',
            PolicyDocument=json.dumps(knowledge_base_policy)
        )
        print("Attached policy to role")

        # Wait for role to propagate
        print("Waiting for role to propagate...")
        time.sleep(10)

    except iam.exceptions.EntityAlreadyExistsException:
        print(f"Role {role_name} already exists, getting ARN...")
        role_response = iam.get_role(RoleName=role_name)
        role_arn = role_response['Role']['Arn']

    # Create Knowledge Base for Opportunities
    try:
        print("Creating Knowledge Base for Opportunities...")
        opportunities_kb = bedrock_agent.create_knowledge_base(
            name='govbizai-opportunities-kb',
            description='Knowledge base for government contract opportunities',
            roleArn=role_arn,
            knowledgeBaseConfiguration={
                'type': 'VECTOR',
                'vectorKnowledgeBaseConfiguration': {
                    'embeddingModelArn': 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0'
                }
            },
            storageConfiguration={
                'type': 'OPENSEARCH_SERVERLESS',
                'opensearchServerlessConfiguration': {
                    'collectionArn': 'arn:aws:aoss:us-east-1:927576824761:collection/govbizai-opportunities-vector-collection',
                    'vectorIndexName': 'govbizai-opportunities-index',
                    'fieldMapping': {
                        'vectorField': 'bedrock-knowledge-base-default-vector',
                        'textField': 'AMAZON_BEDROCK_TEXT_CHUNK',
                        'metadataField': 'AMAZON_BEDROCK_METADATA'
                    }
                }
            }
        )
        opportunities_kb_id = opportunities_kb['knowledgeBase']['knowledgeBaseId']
        print(f"Created Opportunities Knowledge Base: {opportunities_kb_id}")
    except Exception as e:
        print(f"Error creating opportunities KB: {e}")
        opportunities_kb_id = None

    # Create Knowledge Base for Companies
    try:
        print("Creating Knowledge Base for Companies...")
        companies_kb = bedrock_agent.create_knowledge_base(
            name='govbizai-companies-kb',
            description='Knowledge base for company profiles and capabilities',
            roleArn=role_arn,
            knowledgeBaseConfiguration={
                'type': 'VECTOR',
                'vectorKnowledgeBaseConfiguration': {
                    'embeddingModelArn': 'arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0'
                }
            },
            storageConfiguration={
                'type': 'OPENSEARCH_SERVERLESS',
                'opensearchServerlessConfiguration': {
                    'collectionArn': 'arn:aws:aoss:us-east-1:927576824761:collection/govbizai-companies-vector-collection',
                    'vectorIndexName': 'govbizai-companies-index',
                    'fieldMapping': {
                        'vectorField': 'bedrock-knowledge-base-default-vector',
                        'textField': 'AMAZON_BEDROCK_TEXT_CHUNK',
                        'metadataField': 'AMAZON_BEDROCK_METADATA'
                    }
                }
            }
        )
        companies_kb_id = companies_kb['knowledgeBase']['knowledgeBaseId']
        print(f"Created Companies Knowledge Base: {companies_kb_id}")
    except Exception as e:
        print(f"Error creating companies KB: {e}")
        companies_kb_id = None

    # Create data sources for the knowledge bases
    if opportunities_kb_id:
        try:
            print("Creating data source for opportunities KB...")
            opportunities_ds = bedrock_agent.create_data_source(
                knowledgeBaseId=opportunities_kb_id,
                name='govbizai-opportunities-s3-source',
                description='S3 data source for opportunities',
                dataSourceConfiguration={
                    'type': 'S3',
                    's3Configuration': {
                        'bucketArn': 'arn:aws:s3:::govbizai-embeddings-927576824761-us-east-1',
                        'inclusionPrefixes': ['opportunities/']
                    }
                }
            )
            print(f"Created opportunities data source: {opportunities_ds['dataSource']['dataSourceId']}")
        except Exception as e:
            print(f"Error creating opportunities data source: {e}")

    if companies_kb_id:
        try:
            print("Creating data source for companies KB...")
            companies_ds = bedrock_agent.create_data_source(
                knowledgeBaseId=companies_kb_id,
                name='govbizai-companies-s3-source',
                description='S3 data source for companies',
                dataSourceConfiguration={
                    'type': 'S3',
                    's3Configuration': {
                        'bucketArn': 'arn:aws:s3:::govbizai-embeddings-927576824761-us-east-1',
                        'inclusionPrefixes': ['companies/']
                    }
                }
            )
            print(f"Created companies data source: {companies_ds['dataSource']['dataSourceId']}")
        except Exception as e:
            print(f"Error creating companies data source: {e}")

    return opportunities_kb_id, companies_kb_id

if __name__ == "__main__":
    setup_bedrock_knowledge_bases()