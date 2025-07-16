#!/bin/bash

# GovBiz.ai Setup and Deployment Script
# Sets up Python environment and runs deployment

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

# Function to setup deployment environment
setup_deployment_env() {
    log_info "Setting up deployment environment..."
    
    # Check Python
    if ! command_exists python3; then
        log_error "Python 3 not found. Please install Python 3.11 or higher."
        exit 1
    fi
    
    # Create virtual environment for deployment scripts
    if [ ! -d "venv" ]; then
        log_info "Creating Python virtual environment..."
        python3 -m venv venv
    fi
    
    # Activate virtual environment
    source venv/bin/activate
    
    # Install deployment dependencies
    log_info "Installing deployment dependencies..."
    pip install -r scripts/requirements.txt
    
    log_success "Deployment environment setup complete"
}

# Function to check AWS credentials
check_aws_credentials() {
    log_info "Checking AWS credentials..."
    
    if ! command_exists aws; then
        log_error "AWS CLI not found. Please install AWS CLI."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log_error "AWS credentials not configured. Please run 'aws configure' first."
        exit 1
    fi
    
    # Display AWS info
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    AWS_USER=$(aws sts get-caller-identity --query UserName --output text 2>/dev/null || echo "Role-based access")
    
    log_info "AWS Account ID: $AWS_ACCOUNT_ID"
    log_info "AWS User: $AWS_USER"
    log_info "AWS Region: $REGION"
    
    log_success "AWS credentials check passed"
}

# Function to install CDK
install_cdk() {
    log_info "Checking CDK installation..."
    
    if ! command_exists cdk; then
        log_warning "AWS CDK not found. Installing..."
        
        if ! command_exists npm; then
            log_error "npm not found. Please install Node.js and npm."
            exit 1
        fi
        
        npm install -g aws-cdk
        
        if [ $? -eq 0 ]; then
            log_success "CDK installed successfully"
        else
            log_error "CDK installation failed"
            exit 1
        fi
    else
        CDK_VERSION=$(cdk --version)
        log_info "CDK version: $CDK_VERSION"
    fi
}

# Function to run deployment
run_deployment() {
    log_info "Starting deployment process..."
    
    # Activate virtual environment
    source venv/bin/activate
    
    # Run the deployment script
    python3 scripts/deploy_full_stack.py --environment $ENVIRONMENT --region $REGION
    
    if [ $? -eq 0 ]; then
        log_success "Deployment completed successfully!"
    else
        log_error "Deployment failed!"
        exit 1
    fi
}

# Function to display usage
usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -e, --environment   Deployment environment (default: dev)"
    echo "  -r, --region        AWS region (default: us-east-1)"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 --environment dev --region us-east-1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    log_info "Starting GovBiz.ai deployment to $ENVIRONMENT environment in $REGION"
    
    # Change to project root
    cd "$(dirname "$0")/.."
    
    # Setup deployment environment
    setup_deployment_env
    
    # Check AWS credentials
    check_aws_credentials
    
    # Install CDK
    install_cdk
    
    # Run deployment
    run_deployment
    
    log_success "All deployment steps completed!"
}

# Run main function
main "$@"