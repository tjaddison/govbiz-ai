#!/usr/bin/env python3
"""
Deploy simple SAM CSV downloader Lambda function
"""

import boto3
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
import subprocess

def create_simple_lambda_package():
    """Create Lambda deployment package for simple SAM downloader"""
    
    print("Creating simple SAM Lambda deployment package...")
    
    # Create temporary directory
    temp_dir = Path(tempfile.mkdtemp())
    package_dir = temp_dir / "package"
    package_dir.mkdir()
    
    # Copy the simple downloader
    downloader_file = Path("simple_sam_downloader.py")
    if downloader_file.exists():
        shutil.copy2(downloader_file, package_dir / "lambda_function.py")
        print(f"✓ Copied simple downloader to {package_dir}")
    else:
        print("✗ simple_sam_downloader.py not found")
        return None
    
    # Install minimal dependencies
    print("Installing dependencies...")
    dependencies = ["aiohttp", "boto3", "botocore", "typing_extensions"]
    
    for dep in dependencies:
        subprocess.run([
            "pip3", "install", dep, "-t", str(package_dir), "--break-system-packages"
        ], check=True)
    
    print("✓ Installed dependencies")
    
    # Create zip file
    zip_path = temp_dir / "simple-sam-lambda.zip"
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(package_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arc_name = os.path.relpath(file_path, package_dir)
                zipf.write(file_path, arc_name)
    
    print(f"✓ Created deployment package: {zip_path}")
    return zip_path

def deploy_simple_sam_lambda():
    """Deploy the simple SAM CSV downloader Lambda function"""
    
    # Initialize AWS clients
    lambda_client = boto3.client('lambda', region_name='us-east-1')
    iam_client = boto3.client('iam', region_name='us-east-1')
    
    function_name = 'govbiz-ai-dev-simple-sam-downloader'
    role_name = 'govbiz-ai-dev-lambda-execution-role'
    
    # Get IAM role ARN
    try:
        role_response = iam_client.get_role(RoleName=role_name)
        role_arn = role_response['Role']['Arn']
        print(f"✓ Using existing IAM role: {role_arn}")
    except Exception as e:
        print(f"✗ Error getting IAM role: {e}")
        return False
    
    # Create deployment package
    zip_path = create_simple_lambda_package()
    if not zip_path:
        return False
    
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
    
    print(f"Deploying Lambda function: {function_name}")
    
    # Common environment variables
    environment = {
        'ENVIRONMENT': 'dev',
        'PROJECT_NAME': 'govbiz-ai',
        'OPPORTUNITIES_TABLE': 'govbiz-ai-dev-opportunities',
        'PYTHONPATH': '/var/runtime:/var/task'
    }
    
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
                Role=role_arn,
                Handler='lambda_function.lambda_handler',
                Code={'ZipFile': zip_contents},
                Description='Simple SAM CSV downloader for daily processing',
                Timeout=900,  # 15 minutes
                MemorySize=2048,
                Environment={'Variables': environment},
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
    
    # Clean up
    shutil.rmtree(zip_path.parent)
    
    return True

def update_eventbridge_rule():
    """Update EventBridge rule to use the simple SAM downloader"""
    
    events_client = boto3.client('events', region_name='us-east-1')
    lambda_client = boto3.client('lambda', region_name='us-east-1')
    
    rule_name = 'govbiz-ai-dev-opportunity-finder-schedule'
    new_function_name = 'govbiz-ai-dev-simple-sam-downloader'
    
    print(f"Updating EventBridge rule to use {new_function_name}")
    
    try:
        # Get Lambda function ARN
        lambda_response = lambda_client.get_function(FunctionName=new_function_name)
        lambda_arn = lambda_response['Configuration']['FunctionArn']
        
        # Update rule targets
        events_client.put_targets(
            Rule=rule_name,
            Targets=[
                {
                    'Id': '1',
                    'Arn': lambda_arn,
                    'Input': json.dumps({
                        'task_type': 'scheduled_discovery',
                        'source': 'eventbridge',
                        'timestamp': '2024-01-01T00:00:00Z'
                    })
                }
            ]
        )
        
        print(f"✓ Updated EventBridge rule target")
        
        # Add permission for EventBridge to invoke Lambda
        try:
            lambda_client.add_permission(
                FunctionName=new_function_name,
                StatementId=f'eventbridge-{rule_name}-simple-sam',
                Action='lambda:InvokeFunction',
                Principal='events.amazonaws.com',
                SourceArn=f'arn:aws:events:us-east-1:927576824761:rule/{rule_name}'
            )
            print(f"✓ Added Lambda permission for EventBridge")
        except Exception as e:
            if "ResourceConflictException" in str(e):
                print(f"✓ Lambda permission already exists")
            else:
                print(f"⚠ Warning: Failed to add Lambda permission: {e}")
        
        return True
        
    except Exception as e:
        print(f"✗ Error updating EventBridge rule: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("DEPLOYING SIMPLE SAM CSV DOWNLOADER")
    print("=" * 60)
    
    # Deploy Lambda function
    if deploy_simple_sam_lambda():
        print("\n✅ Successfully deployed simple SAM downloader Lambda function")
        
        # Update EventBridge rule
        if update_eventbridge_rule():
            print("✅ Successfully updated EventBridge rule")
        else:
            print("⚠ EventBridge rule update failed")
    else:
        print("\n✗ Failed to deploy simple SAM downloader Lambda function")
    
    print("\n" + "=" * 60)
    print("DEPLOYMENT SUMMARY")
    print("=" * 60)
    print("✓ Function: govbiz-ai-dev-simple-sam-downloader")
    print("✓ Handler: lambda_function.lambda_handler")
    print("✓ Runtime: python3.11")
    print("✓ Memory: 2048 MB")
    print("✓ Timeout: 15 minutes")
    print("✓ Schedule: Daily at 8 AM UTC")
    print("✓ EventBridge rule: govbiz-ai-dev-opportunity-finder-schedule")
    print("\nThe simple SAM downloader will run daily and process the SAM CSV file!")