#!/bin/bash

# GovBiz.ai AWS CDK Deployment Script
# Deploy the multi-agent government contracting platform to AWS

set -e

# Configuration
PROJECT_NAME="govbiz-ai"
ENVIRONMENT="dev"
REGION="us-east-1"
PYTHON_VERSION="3.11"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command_exists aws; then
        log_error "AWS CLI not found. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log_error "AWS credentials not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    # Check Node.js (required for CDK)
    if ! command_exists node; then
        log_error "Node.js not found. Please install it first."
        exit 1
    fi
    
    # Check Python
    if ! command_exists python3; then
        log_error "Python 3 not found. Please install it first."
        exit 1
    fi
    
    # Check CDK
    if ! command_exists cdk; then
        log_warning "AWS CDK not found. Installing..."
        npm install -g aws-cdk
    fi
    
    log_success "Prerequisites check passed"
}

# Function to setup Python environment
setup_python_env() {
    log_info "Setting up Python environment..."
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        python3 -m venv venv
    fi
    
    # Activate virtual environment
    source venv/bin/activate
    
    # Install Python dependencies
    pip install -r requirements.txt
    
    log_success "Python environment setup complete"
}

# Function to bootstrap CDK
bootstrap_cdk() {
    log_info "Bootstrapping CDK..."
    
    # Get AWS account ID
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    
    # Bootstrap CDK
    cdk bootstrap aws://$AWS_ACCOUNT_ID/$REGION
    
    log_success "CDK bootstrap complete"
}

# Function to validate CDK app
validate_cdk_app() {
    log_info "Validating CDK application..."
    
    # Synthesize the CloudFormation template
    cdk synth > /dev/null
    
    if [ $? -eq 0 ]; then
        log_success "CDK application validation passed"
    else
        log_error "CDK application validation failed"
        exit 1
    fi
}

# Function to deploy infrastructure
deploy_infrastructure() {
    log_info "Deploying infrastructure..."
    
    # Deploy the CDK stack
    cdk deploy --require-approval never --progress events
    
    if [ $? -eq 0 ]; then
        log_success "Infrastructure deployment complete"
    else
        log_error "Infrastructure deployment failed"
        exit 1
    fi
}

# Function to setup secrets
setup_secrets() {
    log_info "Setting up secrets..."
    
    # Get the secret ARN from CDK outputs
    SECRET_ARN=$(aws cloudformation describe-stacks \
        --stack-name GovBizAiDevStack \
        --query 'Stacks[0].Outputs[?OutputKey==`SecretsArn`].OutputValue' \
        --output text)
    
    if [ -n "$SECRET_ARN" ]; then
        log_info "Secret ARN: $SECRET_ARN"
        log_warning "Please update the secret with your actual API keys:"
        log_warning "- anthropic_api_key"
        log_warning "- slack_bot_token"
        log_warning "- slack_signing_secret"
        log_warning "- sam_gov_api_key"
        log_warning "- google_oauth_client_id"
        log_warning "- google_oauth_client_secret"
        log_warning "- nextauth_secret"
        log_warning "- nextauth_url"
        
        echo
        echo "You can update secrets using:"
        echo "aws secretsmanager update-secret --secret-id $SECRET_ARN --secret-string '{\"anthropic_api_key\":\"your-key\"}'"
    else
        log_error "Could not retrieve secret ARN"
    fi
}

# Function to verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check if API Gateway is accessible
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name GovBizAiDevStack \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
        --output text)
    
    if [ -n "$API_URL" ]; then
        log_info "API Gateway URL: $API_URL"
        
        # Test API health endpoint
        if curl -s "$API_URL/health" > /dev/null; then
            log_success "API Gateway is accessible"
        else
            log_warning "API Gateway health check failed (this is normal if Lambda code is not deployed yet)"
        fi
    fi
    
    # Check DynamoDB tables
    TABLES=$(aws dynamodb list-tables --query 'TableNames' --output json | jq -r '.[]' | grep "$PROJECT_NAME-$ENVIRONMENT")
    
    if [ -n "$TABLES" ]; then
        log_success "DynamoDB tables created successfully:"
        echo "$TABLES" | while read table; do
            echo "  - $table"
        done
    else
        log_warning "No DynamoDB tables found"
    fi
    
    # Check SQS queues
    QUEUES=$(aws sqs list-queues --queue-name-prefix "$PROJECT_NAME-$ENVIRONMENT" --query 'QueueUrls' --output text)
    
    if [ -n "$QUEUES" ]; then
        log_success "SQS queues created successfully"
    else
        log_warning "No SQS queues found"
    fi
    
    # Check Lambda functions
    FUNCTIONS=$(aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `'$PROJECT_NAME-$ENVIRONMENT'`)].FunctionName' --output text)
    
    if [ -n "$FUNCTIONS" ]; then
        log_success "Lambda functions created successfully:"
        echo "$FUNCTIONS" | tr '\t' '\n' | while read func; do
            echo "  - $func"
        done
    else
        log_warning "No Lambda functions found"
    fi
}

# Function to display next steps
display_next_steps() {
    log_info "Deployment complete! Next steps:"
    echo
    echo "1. Update API keys in AWS Secrets Manager"
    echo "2. Configure SES for email functionality"
    echo "3. Deploy Lambda function code"
    echo "4. Deploy Next.js web application"
    echo "5. Configure Slack integration"
    echo "6. Test the system end-to-end"
    echo
    echo "For detailed instructions, see the deployment documentation."
}

# Function to cleanup on failure
cleanup_on_failure() {
    log_error "Deployment failed. Cleaning up..."
    
    # Optional: Destroy the stack if deployment fails
    # cdk destroy --force
    
    exit 1
}

# Main deployment function
main() {
    log_info "Starting GovBiz.ai deployment to $ENVIRONMENT environment..."
    
    # Set up error handling
    trap cleanup_on_failure ERR
    
    # Change to script directory
    cd "$(dirname "$0")"
    
    # Run deployment steps
    check_prerequisites
    setup_python_env
    bootstrap_cdk
    validate_cdk_app
    deploy_infrastructure
    setup_secrets
    verify_deployment
    display_next_steps
    
    log_success "Deployment completed successfully!"
}

# Run main function
main "$@"