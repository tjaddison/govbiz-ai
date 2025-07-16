# GovBiz.ai Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying GovBiz.ai from development to production environments. The system uses AWS serverless architecture with Docker containerization for MCP servers.

## Prerequisites

### Required Software
- **Docker** (20.10+) and Docker Compose
- **AWS CLI** (2.0+) configured with appropriate credentials
- **Node.js** (18+) and npm
- **Python** (3.11+) with pip
- **Git** for version control

### AWS Account Setup
- AWS account with appropriate permissions
- IAM user with CloudFormation, Lambda, DynamoDB, SQS, EventBridge, Secrets Manager, and S3 access
- Domain name (optional, for custom domains)

### External Services
- **Anthropic API Key** for Claude integration
- **Google OAuth** credentials for web application
- **Slack Bot** credentials for human-in-the-loop
- **Email Provider** (Gmail/Outlook) for email automation

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/tjaddison/govbiz-ai.git
cd govbiz-ai
```

### 2. Initial Setup
```bash
# Install dependencies
make install

# Set up AWS infrastructure
make aws-setup

# Configure environment
cp .env.example .env
# Edit .env with your configuration
```

### 3. Deploy Development Environment
```bash
make deploy-dev
```

### 4. Start Local Development
```bash
make start-all
```

## Detailed Deployment Process

### Phase 1: AWS Infrastructure Setup

#### 1. Create AWS Resources
```bash
# Deploy CloudFormation stack
aws cloudformation deploy \
  --template-file infrastructure/aws/cloudformation.yaml \
  --stack-name govbiz-ai-dev \
  --parameter-overrides \
    Environment=dev \
    ProjectName=govbiz-ai \
  --capabilities CAPABILITY_NAMED_IAM
```

#### 2. Configure Secrets Manager
```bash
# Run secrets setup script
python scripts/setup_aws_secrets.py \
  --aws-access-key YOUR_AWS_ACCESS_KEY_ID \
  --aws-secret-key YOUR_AWS_SECRET_ACCESS_KEY \
  --anthropic-key YOUR_ANTHROPIC_API_KEY \
  --google-client-id YOUR_GOOGLE_CLIENT_ID \
  --google-client-secret YOUR_GOOGLE_CLIENT_SECRET
```

#### 3. Configure AppConfig
```bash
# Set up application configuration
python scripts/setup_aws_appconfig.py --environment development
```

### Phase 2: MCP Server Deployment

#### 1. Build MCP Servers
```bash
cd mcp-servers
make build-all
```

#### 2. Deploy MCP Servers
```bash
# Start all MCP servers
make deploy-dev

# Verify deployment
make test-servers
```

#### 3. Health Check
```bash
# Verify all servers are running
make health-check
```

### Phase 3: Application Deployment

#### 1. Deploy Lambda Functions
```bash
# Package and deploy agents
make deploy-agents

# Deploy API server
make deploy-api
```

#### 2. Deploy Web Application
```bash
cd web
npm install
npm run build
make deploy-web
```

### Phase 4: Configuration and Testing

#### 1. Configure Slack Integration
```bash
# Set up Slack bot
python scripts/setup_slack.py \
  --bot-token YOUR_SLACK_BOT_TOKEN \
  --app-token YOUR_SLACK_APP_TOKEN
```

#### 2. Configure Email System
```bash
# Set up email authentication
python scripts/setup_email.py \
  --smtp-username your-email@company.com \
  --smtp-password your-app-password
```

#### 3. Run System Tests
```bash
# Comprehensive system testing
make test-system

# Smoke tests
make smoke-test
```

## Environment Configuration

### Development Environment
```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=govbiz-dev
DYNAMODB_TABLE_PREFIX=govbiz-dev

# AI Configuration
ANTHROPIC_API_KEY=your-anthropic-key
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Web Application
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-32-chars-min
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@company.com
SMTP_PASSWORD=your-app-password

# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret

# System Configuration
LOG_LEVEL=DEBUG
ENVIRONMENT=development
```

### Production Environment
```env
# AWS Configuration
AWS_REGION=us-east-1
DYNAMODB_TABLE_PREFIX=govbiz-prod

# AI Configuration (stored in Secrets Manager)
# Email Configuration (stored in Secrets Manager)  
# Slack Configuration (stored in Secrets Manager)

# System Configuration
LOG_LEVEL=INFO
ENVIRONMENT=production
```

## Production Deployment

### 1. Infrastructure Preparation
```bash
# Deploy production CloudFormation stack
aws cloudformation deploy \
  --template-file infrastructure/aws/cloudformation.yaml \
  --stack-name govbiz-ai-prod \
  --parameter-overrides \
    Environment=prod \
    ProjectName=govbiz-ai \
  --capabilities CAPABILITY_NAMED_IAM
```

### 2. Security Configuration
```bash
# Configure production secrets
python scripts/setup_aws_secrets.py \
  --environment production \
  --aws-access-key PROD_AWS_ACCESS_KEY_ID \
  --aws-secret-key PROD_AWS_SECRET_ACCESS_KEY \
  --anthropic-key PROD_ANTHROPIC_API_KEY
```

### 3. Application Deployment
```bash
# Deploy to production
make deploy-prod

# Verify deployment
make verify-prod
```

### 4. Monitoring Setup
```bash
# Set up CloudWatch dashboards
make setup-monitoring

# Configure alerting
make setup-alerts
```

## Database Setup

### DynamoDB Table Creation
Tables are automatically created by CloudFormation:

- **govbiz-{env}-opportunities**: Opportunity data
- **govbiz-{env}-companies**: Company information
- **govbiz-{env}-responses**: Response tracking
- **govbiz-{env}-contacts**: Contact management
- **govbiz-{env}-events**: Event sourcing
- **govbiz-{env}-tasks**: Task tracking

### Data Migration
```bash
# If migrating from existing system
python scripts/migrate_data.py \
  --source-table ss-dev-opportunities \
  --target-table govbiz-dev-opportunities
```

## Monitoring and Observability

### CloudWatch Setup
```bash
# Create CloudWatch dashboard
aws cloudwatch put-dashboard \
  --dashboard-name "GovBiz-AI-Production" \
  --dashboard-body file://monitoring/dashboard.json
```

### Alerting Configuration
```bash
# Set up SNS topic for alerts
aws sns create-topic --name govbiz-ai-alerts

# Configure CloudWatch alarms
python scripts/setup_monitoring.py
```

### Log Analysis
```bash
# View application logs
aws logs tail /aws/lambda/govbiz-ai-opportunity-finder --follow

# Search logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/govbiz-ai-analyzer \
  --filter-pattern "ERROR"
```

## Scaling and Performance

### Auto-scaling Configuration
```yaml
# Lambda concurrency limits
OpportunityFinderFunction:
  ReservedConcurrencyLimit: 10
  
AnalyzerFunction:
  ReservedConcurrencyLimit: 5
```

### DynamoDB Scaling
```bash
# Enable on-demand billing for production
aws dynamodb modify-table \
  --table-name govbiz-prod-opportunities \
  --billing-mode ON_DEMAND
```

### Performance Optimization
```bash
# Enable CloudFront for web application
make setup-cdn

# Configure Redis caching
make setup-redis
```

## Security Configuration

### Network Security
```bash
# Configure VPC (if needed)
aws cloudformation deploy \
  --template-file infrastructure/aws/vpc.yaml \
  --stack-name govbiz-ai-vpc
```

### SSL/TLS Configuration
```bash
# Request SSL certificate
aws acm request-certificate \
  --domain-name your-domain.com \
  --validation-method DNS
```

### Security Scanning
```bash
# Run security scan
make security-scan

# Check for vulnerabilities
make vulnerability-check
```

## Backup and Recovery

### Data Backup
```bash
# Enable point-in-time recovery
aws dynamodb put-backup-policy \
  --table-name govbiz-prod-opportunities \
  --backup-policy BackupEnabled=true
```

### Disaster Recovery
```bash
# Create cross-region backup
python scripts/setup_backup.py \
  --source-region us-east-1 \
  --backup-region us-west-2
```

## Troubleshooting

### Common Issues

#### 1. Lambda Function Failures
```bash
# Check function logs
aws logs tail /aws/lambda/govbiz-ai-opportunity-finder

# Check function configuration
aws lambda get-function \
  --function-name govbiz-ai-opportunity-finder
```

#### 2. DynamoDB Access Issues
```bash
# Check table status
aws dynamodb describe-table \
  --table-name govbiz-dev-opportunities

# Check IAM permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --action-names dynamodb:GetItem \
  --resource-arns arn:aws:dynamodb:us-east-1:ACCOUNT:table/govbiz-dev-opportunities
```

#### 3. MCP Server Connection Issues
```bash
# Check server status
make test-servers

# Check individual server
curl -X POST http://localhost:8001/health
```

### Diagnostic Commands
```bash
# System health check
make health-check

# Performance metrics
make performance-check

# Security audit
make security-audit
```

## Maintenance

### Regular Maintenance Tasks
```bash
# Daily health check
make daily-health-check

# Weekly performance review
make weekly-performance-review

# Monthly security update
make monthly-security-update
```

### Updates and Upgrades
```bash
# Update dependencies
make update-dependencies

# Deploy updates
make deploy-update

# Rollback if needed
make rollback-deployment
```

## Cost Optimization

### Cost Monitoring
```bash
# Set up billing alerts
aws budgets create-budget \
  --account-id YOUR_ACCOUNT_ID \
  --budget file://config/budget.json
```

### Resource Optimization
```bash
# Right-size Lambda functions
make optimize-lambdas

# Optimize DynamoDB capacity
make optimize-dynamodb
```

## Support and Documentation

### Getting Help
- **Documentation**: Complete guides in `/docs`
- **API Reference**: OpenAPI specification
- **Examples**: Sample configurations and scripts
- **Community**: GitHub issues and discussions

### Professional Support
- **Enterprise Support**: Available for production deployments
- **Custom Development**: Capability extensions and integrations
- **Training**: Team training and onboarding

## Conclusion

This deployment guide provides comprehensive instructions for deploying GovBiz.ai from development to production. The system is designed for:

- **Scalability**: Handle enterprise-level loads
- **Reliability**: 99.9% uptime with proper monitoring
- **Security**: Enterprise-grade security implementation
- **Maintainability**: Easy updates and maintenance
- **Cost-effectiveness**: Optimized AWS resource usage

Follow these procedures for a successful deployment and ongoing operations of your GovBiz.ai system.