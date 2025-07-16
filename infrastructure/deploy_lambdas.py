#!/usr/bin/env python3
"""
Package and deploy Lambda functions for GovBiz.ai multi-agent system
"""

import boto3
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
import subprocess

def create_lambda_package():
    """Create Lambda deployment package"""
    
    print("Creating Lambda deployment package...")
    
    # Get project root
    project_root = Path(__file__).parent.parent
    src_dir = project_root / "src"
    
    # Create temporary directory
    temp_dir = Path(tempfile.mkdtemp())
    package_dir = temp_dir / "package"
    package_dir.mkdir()
    
    # Copy source code
    if src_dir.exists():
        shutil.copytree(src_dir, package_dir / "src")
        print(f"✓ Copied source code to {package_dir}")
    
    # Install dependencies
    requirements_file = src_dir / "basic_requirements.txt"
    if requirements_file.exists():
        print("Installing Python dependencies...")
        subprocess.run([
            "pip", "install", "-r", str(requirements_file), 
            "-t", str(package_dir)
        ], check=True)
        print("✓ Installed dependencies")
    
    # Create zip file
    zip_path = temp_dir / "lambda-deployment.zip"
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(package_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arc_name = os.path.relpath(file_path, package_dir)
                zipf.write(file_path, arc_name)
    
    print(f"✓ Created deployment package: {zip_path}")
    return zip_path

def create_lambda_function(lambda_client, function_config, zip_path):
    """Create or update a Lambda function"""
    
    function_name = function_config['name']
    print(f"Deploying Lambda function: {function_name}")
    
    # Read zip file
    with open(zip_path, 'rb') as zip_file:
        zip_contents = zip_file.read()
    
    # Check if function exists
    function_exists = False
    try:
        lambda_client.get_function(FunctionName=function_name)
        function_exists = True
    except lambda_client.exceptions.ResourceNotFoundException:
        pass
    
    if function_exists:
        # Update function code
        try:
            lambda_client.update_function_code(
                FunctionName=function_name,
                ZipFile=zip_contents
            )
            print(f"✓ Updated function code: {function_name}")
        except Exception as e:
            print(f"✗ Error updating {function_name}: {e}")
            return False
    else:
        # Create new function
        try:
            lambda_client.create_function(
                FunctionName=function_name,
                Runtime='python3.11',
                Role=function_config['role_arn'],
                Handler=function_config['handler'],
                Code={'ZipFile': zip_contents},
                Description=function_config['description'],
                Timeout=function_config['timeout'],
                MemorySize=function_config['memory_size'],
                Environment={
                    'Variables': function_config['environment']
                },
                Tags={
                    'Project': 'govbiz-ai',
                    'Environment': 'dev',
                    'ManagedBy': 'deployment-script'
                }
            )
            print(f"✓ Created function: {function_name}")
        except Exception as e:
            print(f"✗ Error creating {function_name}: {e}")
            return False
    
    return True

def create_lambda_role(iam_client):
    """Create IAM role for Lambda functions"""
    
    role_name = "govbiz-ai-dev-lambda-execution-role"
    
    # Trust policy for Lambda
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "lambda.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }
    
    try:
        # Check if role exists
        role_response = iam_client.get_role(RoleName=role_name)
        role_arn = role_response['Role']['Arn']
        print(f"✓ Using existing IAM role: {role_arn}")
        return role_arn
    except iam_client.exceptions.NoSuchEntityException:
        pass
    
    # Create role
    try:
        role_response = iam_client.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description="Execution role for GovBiz.ai Lambda functions",
            Tags=[
                {'Key': 'Project', 'Value': 'govbiz-ai'},
                {'Key': 'Environment', 'Value': 'dev'}
            ]
        )
        role_arn = role_response['Role']['Arn']
        print(f"✓ Created IAM role: {role_arn}")
        
        # Attach managed policies
        managed_policies = [
            'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
            'arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess',
            'arn:aws:iam::aws:policy/AmazonSQSFullAccess',
            'arn:aws:iam::aws:policy/SecretsManagerReadWrite'
        ]
        
        for policy_arn in managed_policies:
            iam_client.attach_role_policy(
                RoleName=role_name,
                PolicyArn=policy_arn
            )
        
        print("✓ Attached managed policies to role")
        
        # Wait for role to be ready
        import time
        time.sleep(10)
        
        return role_arn
        
    except Exception as e:
        print(f"✗ Error creating IAM role: {e}")
        return None

def deploy_lambda_functions():
    """Deploy all Lambda functions"""
    
    # Initialize AWS clients
    lambda_client = boto3.client('lambda', region_name='us-east-1')
    iam_client = boto3.client('iam', region_name='us-east-1')
    
    # Create IAM role
    role_arn = create_lambda_role(iam_client)
    if not role_arn:
        print("✗ Failed to create IAM role")
        return False
    
    # Create deployment package
    zip_path = create_lambda_package()
    
    # Common environment variables
    common_env = {
        'ENVIRONMENT': 'dev',
        'PROJECT_NAME': 'govbiz-ai',
        'SECRETS_ARN': 'arn:aws:secretsmanager:us-east-1:927576824761:secret:govbiz-ai-dev-api-keys-K8oUCX',
        'OPPORTUNITIES_TABLE': 'govbiz-ai-dev-opportunities',
        'COMPANIES_TABLE': 'govbiz-ai-dev-companies',
        'RESPONSES_TABLE': 'govbiz-ai-dev-responses',
        'CONTACTS_TABLE': 'govbiz-ai-dev-contacts',
        'EVENTS_TABLE': 'govbiz-ai-dev-events',
        'PYTHONPATH': '/var/runtime:/var/task'
    }
    
    # Lambda function configurations
    functions = [
        {
            'name': 'govbiz-ai-dev-opportunity-finder-agent',
            'handler': 'src.agents.opportunity_finder_lambda.lambda_handler',
            'description': 'OpportunityFinder agent for discovering Sources Sought',
            'timeout': 900,  # 15 minutes
            'memory_size': 1024,
            'role_arn': role_arn,
            'environment': common_env
        },
        {
            'name': 'govbiz-ai-dev-analyzer-agent',
            'handler': 'src.agents.all_lambda_handlers.analyzer_handler',
            'description': 'Analyzer agent for deep opportunity analysis',
            'timeout': 900,  # 15 minutes
            'memory_size': 2048,
            'role_arn': role_arn,
            'environment': common_env
        },
        {
            'name': 'govbiz-ai-dev-response-generator-agent',
            'handler': 'src.agents.all_lambda_handlers.response_generator_handler',
            'description': 'ResponseGenerator agent for creating responses',
            'timeout': 600,  # 10 minutes
            'memory_size': 2048,
            'role_arn': role_arn,
            'environment': common_env
        },
        {
            'name': 'govbiz-ai-dev-relationship-manager-agent',
            'handler': 'src.agents.all_lambda_handlers.relationship_manager_handler',
            'description': 'RelationshipManager agent for managing contacts',
            'timeout': 300,  # 5 minutes
            'memory_size': 1024,
            'role_arn': role_arn,
            'environment': common_env
        },
        {
            'name': 'govbiz-ai-dev-email-manager-agent',
            'handler': 'src.agents.all_lambda_handlers.email_manager_handler',
            'description': 'EmailManager agent for email automation',
            'timeout': 300,  # 5 minutes
            'memory_size': 1024,
            'role_arn': role_arn,
            'environment': common_env
        },
        {
            'name': 'govbiz-ai-dev-human-loop-agent',
            'handler': 'src.agents.all_lambda_handlers.human_loop_handler',
            'description': 'HumanLoop agent for human-in-the-loop tasks',
            'timeout': 300,  # 5 minutes
            'memory_size': 512,
            'role_arn': role_arn,
            'environment': common_env
        },
        {
            'name': 'govbiz-ai-dev-api',
            'handler': 'src.api.simple_lambda_server.lambda_handler',
            'description': 'API Gateway Lambda for web application',
            'timeout': 30,  # 30 seconds
            'memory_size': 1024,
            'role_arn': role_arn,
            'environment': common_env
        }
    ]
    
    # Deploy each function
    deployed_functions = []
    for function_config in functions:
        if create_lambda_function(lambda_client, function_config, zip_path):
            deployed_functions.append(function_config['name'])
    
    # Clean up
    shutil.rmtree(zip_path.parent)
    
    print(f"\n✅ Successfully deployed {len(deployed_functions)} Lambda functions")
    return deployed_functions

if __name__ == "__main__":
    functions = deploy_lambda_functions()
    
    print("\n" + "="*60)
    print("LAMBDA DEPLOYMENT SUMMARY")
    print("="*60)
    
    for function_name in functions:
        print(f"✓ {function_name}")
    
    print(f"\n✅ All {len(functions)} Lambda functions deployed successfully!")
    print("\nNext steps:")
    print("1. Configure SQS event sources for Lambda functions")
    print("2. Set up API Gateway")
    print("3. Configure EventBridge rules for scheduled tasks")