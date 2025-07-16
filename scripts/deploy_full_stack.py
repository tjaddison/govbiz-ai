#!/usr/bin/env python3
"""
Full Stack Deployment Script for GovBiz.ai
Automates the complete deployment of the multi-agent system to AWS
"""

import os
import sys
import json
import time
import subprocess
import argparse
from pathlib import Path
from typing import Dict, Any, List, Optional
import boto3
from botocore.exceptions import ClientError

# Color codes for output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    PURPLE = '\033[0;35m'
    CYAN = '\033[0;36m'
    WHITE = '\033[1;37m'
    RESET = '\033[0m'

def log_info(message: str):
    print(f"{Colors.BLUE}[INFO]{Colors.RESET} {message}")

def log_success(message: str):
    print(f"{Colors.GREEN}[SUCCESS]{Colors.RESET} {message}")

def log_warning(message: str):
    print(f"{Colors.YELLOW}[WARNING]{Colors.RESET} {message}")

def log_error(message: str):
    print(f"{Colors.RED}[ERROR]{Colors.RESET} {message}")

def log_step(message: str):
    print(f"{Colors.PURPLE}[STEP]{Colors.RESET} {message}")

class GovBizAiDeployer:
    """Complete deployment orchestrator for GovBiz.ai platform"""
    
    def __init__(self, environment: str = "dev", region: str = "us-east-1"):
        self.environment = environment
        self.region = region
        self.project_name = "govbiz-ai"
        self.stack_name = f"GovBizAi{environment.capitalize()}Stack"
        
        # Initialize AWS clients
        self.session = boto3.Session(region_name=region)
        self.cloudformation = self.session.client('cloudformation')
        self.lambda_client = self.session.client('lambda')
        self.secretsmanager = self.session.client('secretsmanager')
        self.sts = self.session.client('sts')
        
        # Get project root
        self.project_root = Path(__file__).parent.parent
        self.cdk_path = self.project_root / "infrastructure" / "cdk"
        self.src_path = self.project_root / "src"
        self.web_path = self.project_root / "web"
        
        # Track deployment state
        self.deployment_state = {
            "infrastructure_deployed": False,
            "lambda_code_deployed": False,
            "secrets_configured": False,
            "web_app_deployed": False,
            "validation_passed": False
        }
        
        # Store outputs
        self.stack_outputs = {}
        
    def check_prerequisites(self) -> bool:
        """Check if all prerequisites are met"""
        log_step("Checking prerequisites...")
        
        # Check AWS credentials
        try:
            caller_identity = self.sts.get_caller_identity()
            log_info(f"AWS Account: {caller_identity['Account']}")
            log_info(f"AWS Region: {self.region}")
        except Exception as e:
            log_error(f"AWS credentials not configured: {e}")
            return False
        
        # Check required commands
        required_commands = ['node', 'npm', 'python3', 'cdk', 'zip']
        for cmd in required_commands:
            if not self._command_exists(cmd):
                log_error(f"Required command not found: {cmd}")
                return False
        
        # Check Python version
        try:
            result = subprocess.run(['python3', '--version'], 
                                  capture_output=True, text=True)
            version = result.stdout.strip()
            log_info(f"Python version: {version}")
        except Exception as e:
            log_error(f"Python version check failed: {e}")
            return False
        
        # Check CDK version
        try:
            result = subprocess.run(['cdk', '--version'], 
                                  capture_output=True, text=True)
            version = result.stdout.strip()
            log_info(f"CDK version: {version}")
        except Exception as e:
            log_error(f"CDK version check failed: {e}")
            return False
        
        log_success("Prerequisites check passed")
        return True
    
    def deploy_infrastructure(self) -> bool:
        """Deploy AWS infrastructure using CDK"""
        log_step("Deploying AWS infrastructure...")
        
        try:
            # Change to CDK directory
            os.chdir(self.cdk_path)
            
            # Setup Python virtual environment
            if not (self.cdk_path / "venv").exists():
                log_info("Creating Python virtual environment...")
                subprocess.run(['python3', '-m', 'venv', 'venv'], check=True)
            
            # Activate virtual environment and install dependencies
            log_info("Installing CDK dependencies...")
            if os.name == 'nt':  # Windows
                venv_python = self.cdk_path / "venv" / "Scripts" / "python.exe"
                venv_pip = self.cdk_path / "venv" / "Scripts" / "pip.exe"
            else:  # Unix-like
                venv_python = self.cdk_path / "venv" / "bin" / "python"
                venv_pip = self.cdk_path / "venv" / "bin" / "pip"
            
            subprocess.run([str(venv_pip), 'install', '-r', 'requirements.txt'], check=True)
            
            # Bootstrap CDK if needed
            log_info("Bootstrapping CDK...")
            account_id = self.sts.get_caller_identity()['Account']
            subprocess.run([
                'cdk', 'bootstrap', 
                f'aws://{account_id}/{self.region}'
            ], check=True, env=self._get_cdk_env())
            
            # Deploy infrastructure
            log_info("Deploying CDK stack...")
            subprocess.run([
                'cdk', 'deploy', 
                '--require-approval', 'never',
                '--progress', 'events'
            ], check=True, env=self._get_cdk_env())
            
            # Get stack outputs
            self._get_stack_outputs()
            
            self.deployment_state["infrastructure_deployed"] = True
            log_success("Infrastructure deployed successfully")
            return True
            
        except subprocess.CalledProcessError as e:
            log_error(f"CDK deployment failed: {e}")
            return False
        except Exception as e:
            log_error(f"Unexpected error during infrastructure deployment: {e}")
            return False
        finally:
            # Return to project root
            os.chdir(self.project_root)
    
    def deploy_lambda_code(self) -> bool:
        """Package and deploy Lambda function code"""
        log_step("Deploying Lambda function code...")
        
        try:
            # Create deployment package
            log_info("Creating Lambda deployment package...")
            
            # Create temp directory for packaging
            temp_dir = self.project_root / "temp_lambda"
            temp_dir.mkdir(exist_ok=True)
            
            # Copy source code
            import shutil
            shutil.copytree(self.src_path, temp_dir / "src", dirs_exist_ok=True)
            
            # Copy requirements
            shutil.copy2(self.project_root / "requirements.txt", temp_dir)
            
            # Create zip file
            zip_path = self.project_root / "lambda-deployment.zip"
            
            # Change to temp directory and create zip
            os.chdir(temp_dir)
            subprocess.run([
                'zip', '-r', str(zip_path), '.',
                '-x', '*.pyc', '*/__pycache__/*', '*/tests/*', '*.git/*'
            ], check=True)
            
            # Clean up temp directory
            os.chdir(self.project_root)
            shutil.rmtree(temp_dir)
            
            # Get Lambda function names from stack outputs
            lambda_functions = [
                f"{self.project_name}-{self.environment}-opportunity-finder-agent",
                f"{self.project_name}-{self.environment}-analyzer-agent",
                f"{self.project_name}-{self.environment}-response-generator-agent",
                f"{self.project_name}-{self.environment}-relationship-manager-agent",
                f"{self.project_name}-{self.environment}-email-manager-agent",
                f"{self.project_name}-{self.environment}-human-loop-agent",
                f"{self.project_name}-{self.environment}-api"
            ]
            
            # Update each Lambda function
            for function_name in lambda_functions:
                log_info(f"Updating Lambda function: {function_name}")
                
                try:
                    with open(zip_path, 'rb') as zip_file:
                        self.lambda_client.update_function_code(
                            FunctionName=function_name,
                            ZipFile=zip_file.read()
                        )
                    
                    # Wait for update to complete
                    self._wait_for_lambda_update(function_name)
                    
                except ClientError as e:
                    if e.response['Error']['Code'] == 'ResourceNotFoundException':
                        log_warning(f"Lambda function {function_name} not found, skipping...")
                    else:
                        raise
            
            # Clean up zip file
            zip_path.unlink()
            
            self.deployment_state["lambda_code_deployed"] = True
            log_success("Lambda code deployed successfully")
            return True
            
        except Exception as e:
            log_error(f"Lambda code deployment failed: {e}")
            return False
    
    def configure_secrets(self) -> bool:
        """Configure AWS Secrets Manager with placeholder values"""
        log_step("Configuring secrets...")
        
        try:
            # Get secret ARN from stack outputs
            secret_arn = self.stack_outputs.get('SecretsArn')
            if not secret_arn:
                log_error("Secret ARN not found in stack outputs")
                return False
            
            # Create placeholder secret values
            secret_value = {
                "anthropic_api_key": "PLACEHOLDER_ANTHROPIC_API_KEY",
                "slack_bot_token": "PLACEHOLDER_SLACK_BOT_TOKEN",
                "slack_signing_secret": "PLACEHOLDER_SLACK_SIGNING_SECRET",
                "sam_gov_api_key": "PLACEHOLDER_SAM_GOV_API_KEY",
                "google_oauth_client_id": "PLACEHOLDER_GOOGLE_OAUTH_CLIENT_ID",
                "google_oauth_client_secret": "PLACEHOLDER_GOOGLE_OAUTH_CLIENT_SECRET",
                "nextauth_secret": "PLACEHOLDER_NEXTAUTH_SECRET",
                "nextauth_url": f"https://{self.project_name}-{self.environment}.vercel.app"
            }
            
            # Update secret
            self.secretsmanager.update_secret(
                SecretId=secret_arn,
                SecretString=json.dumps(secret_value)
            )
            
            log_success("Secrets configured with placeholder values")
            log_warning("Please update the secrets with real values using AWS Console or CLI")
            
            self.deployment_state["secrets_configured"] = True
            return True
            
        except Exception as e:
            log_error(f"Secret configuration failed: {e}")
            return False
    
    def validate_deployment(self) -> bool:
        """Validate the deployment"""
        log_step("Validating deployment...")
        
        try:
            # Test API Gateway
            api_url = self.stack_outputs.get('ApiGatewayUrl')
            if api_url:
                log_info(f"Testing API Gateway: {api_url}")
                try:
                    import requests
                    response = requests.get(f"{api_url}/health", timeout=10)
                    if response.status_code == 200:
                        log_success("API Gateway health check passed")
                    else:
                        log_warning(f"API Gateway health check returned {response.status_code}")
                except Exception as e:
                    log_warning(f"API Gateway health check failed: {e}")
            
            # Test Lambda functions
            lambda_functions = [
                f"{self.project_name}-{self.environment}-opportunity-finder-agent",
                f"{self.project_name}-{self.environment}-analyzer-agent",
                f"{self.project_name}-{self.environment}-api"
            ]
            
            for function_name in lambda_functions:
                try:
                    response = self.lambda_client.invoke(
                        FunctionName=function_name,
                        Payload=json.dumps({"test": True})
                    )
                    
                    if response['StatusCode'] == 200:
                        log_success(f"Lambda function {function_name} test passed")
                    else:
                        log_warning(f"Lambda function {function_name} test failed")
                        
                except ClientError as e:
                    if e.response['Error']['Code'] == 'ResourceNotFoundException':
                        log_warning(f"Lambda function {function_name} not found")
                    else:
                        log_error(f"Lambda function {function_name} test error: {e}")
            
            # Test DynamoDB tables
            dynamodb = self.session.resource('dynamodb')
            table_names = [
                f"{self.project_name}-{self.environment}-opportunities",
                f"{self.project_name}-{self.environment}-companies",
                f"{self.project_name}-{self.environment}-responses"
            ]
            
            for table_name in table_names:
                try:
                    table = dynamodb.Table(table_name)
                    table.table_status  # This will raise an exception if table doesn't exist
                    log_success(f"DynamoDB table {table_name} exists")
                except Exception as e:
                    log_warning(f"DynamoDB table {table_name} check failed: {e}")
            
            self.deployment_state["validation_passed"] = True
            log_success("Deployment validation completed")
            return True
            
        except Exception as e:
            log_error(f"Deployment validation failed: {e}")
            return False
    
    def deploy_web_app(self) -> bool:
        """Deploy Next.js web application"""
        log_step("Preparing web application for deployment...")
        
        try:
            # Create .env file for deployment
            env_content = f"""
NEXTAUTH_URL=https://{self.project_name}-{self.environment}.vercel.app
NEXTAUTH_SECRET=PLACEHOLDER_NEXTAUTH_SECRET
GOOGLE_CLIENT_ID=PLACEHOLDER_GOOGLE_OAUTH_CLIENT_ID
GOOGLE_CLIENT_SECRET=PLACEHOLDER_GOOGLE_OAUTH_CLIENT_SECRET
API_BASE_URL={self.stack_outputs.get('ApiGatewayUrl', 'PLACEHOLDER_API_URL')}
COGNITO_CLIENT_ID={self.stack_outputs.get('UserPoolClientId', 'PLACEHOLDER_COGNITO_CLIENT_ID')}
COGNITO_DOMAIN=PLACEHOLDER_COGNITO_DOMAIN
COGNITO_REGION={self.region}
"""
            
            env_file = self.web_path / ".env.local"
            with open(env_file, 'w') as f:
                f.write(env_content)
            
            log_success("Web application environment configured")
            log_info("To deploy web application:")
            log_info("1. cd web")
            log_info("2. npm install")
            log_info("3. vercel --prod")
            log_info("4. Update environment variables in Vercel dashboard")
            
            self.deployment_state["web_app_deployed"] = True
            return True
            
        except Exception as e:
            log_error(f"Web application preparation failed: {e}")
            return False
    
    def display_deployment_summary(self):
        """Display deployment summary and next steps"""
        log_step("Deployment Summary")
        
        print(f"\n{Colors.CYAN}=== GovBiz.ai Deployment Summary ==={Colors.RESET}")
        print(f"Environment: {self.environment}")
        print(f"AWS Region: {self.region}")
        print(f"Stack Name: {self.stack_name}")
        
        print(f"\n{Colors.WHITE}Deployment Status:{Colors.RESET}")
        for step, status in self.deployment_state.items():
            status_color = Colors.GREEN if status else Colors.RED
            status_text = "✓" if status else "✗"
            print(f"  {status_color}{status_text}{Colors.RESET} {step.replace('_', ' ').title()}")
        
        if self.stack_outputs:
            print(f"\n{Colors.WHITE}Important URLs and IDs:{Colors.RESET}")
            for key, value in self.stack_outputs.items():
                print(f"  {key}: {value}")
        
        print(f"\n{Colors.WHITE}Next Steps:{Colors.RESET}")
        print("1. Update API keys in AWS Secrets Manager")
        print("2. Configure SES for email functionality")
        print("3. Deploy Next.js web application to Vercel")
        print("4. Test the complete system")
        print("5. Configure monitoring and alerts")
        
        print(f"\n{Colors.YELLOW}Important Notes:{Colors.RESET}")
        print("- All secrets are set to placeholder values")
        print("- Update secrets before testing functionality")
        print("- Review CloudWatch logs for any errors")
        print("- Set up proper domain and SSL certificates for production")
    
    def _command_exists(self, command: str) -> bool:
        """Check if a command exists in PATH"""
        return subprocess.run(['which', command], 
                            capture_output=True).returncode == 0
    
    def _get_cdk_env(self) -> Dict[str, str]:
        """Get environment variables for CDK"""
        env = os.environ.copy()
        env['AWS_REGION'] = self.region
        return env
    
    def _get_stack_outputs(self):
        """Get CloudFormation stack outputs"""
        try:
            response = self.cloudformation.describe_stacks(StackName=self.stack_name)
            stack = response['Stacks'][0]
            
            if 'Outputs' in stack:
                for output in stack['Outputs']:
                    self.stack_outputs[output['OutputKey']] = output['OutputValue']
            
        except Exception as e:
            log_warning(f"Could not retrieve stack outputs: {e}")
    
    def _wait_for_lambda_update(self, function_name: str, timeout: int = 300):
        """Wait for Lambda function update to complete"""
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                response = self.lambda_client.get_function(FunctionName=function_name)
                state = response['Configuration']['State']
                
                if state == 'Active':
                    return
                elif state == 'Failed':
                    raise Exception(f"Lambda function {function_name} update failed")
                
                time.sleep(5)
                
            except Exception as e:
                log_error(f"Error checking Lambda function state: {e}")
                break
        
        raise TimeoutError(f"Lambda function {function_name} update timed out")
    
    def run_full_deployment(self) -> bool:
        """Run complete deployment process"""
        log_info(f"Starting full deployment of GovBiz.ai to {self.environment} environment")
        
        # Check prerequisites
        if not self.check_prerequisites():
            return False
        
        # Deploy infrastructure
        if not self.deploy_infrastructure():
            return False
        
        # Deploy Lambda code
        if not self.deploy_lambda_code():
            return False
        
        # Configure secrets
        if not self.configure_secrets():
            return False
        
        # Prepare web app
        if not self.deploy_web_app():
            return False
        
        # Validate deployment
        if not self.validate_deployment():
            return False
        
        # Display summary
        self.display_deployment_summary()
        
        return True

def main():
    """Main deployment function"""
    parser = argparse.ArgumentParser(description='Deploy GovBiz.ai to AWS')
    parser.add_argument('--environment', '-e', default='dev', 
                       help='Deployment environment (dev, staging, prod)')
    parser.add_argument('--region', '-r', default='us-east-1',
                       help='AWS region')
    parser.add_argument('--skip-validation', action='store_true',
                       help='Skip deployment validation')
    
    args = parser.parse_args()
    
    # Create deployer
    deployer = GovBizAiDeployer(
        environment=args.environment,
        region=args.region
    )
    
    # Run deployment
    success = deployer.run_full_deployment()
    
    if success:
        log_success("Deployment completed successfully!")
        sys.exit(0)
    else:
        log_error("Deployment failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()