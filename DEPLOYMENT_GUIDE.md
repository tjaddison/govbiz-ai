# GovBiz.ai Deployment Guide

Complete guide for deploying the GovBiz.ai multi-agent government contracting platform to AWS.

## Architecture Overview

The GovBiz.ai platform is a multi-agent system designed to automate government contracting processes, starting with Sources Sought opportunities. The architecture includes:

- **Multi-Agent System**: 6 specialized agents running on AWS Lambda
- **Data Layer**: DynamoDB tables for persistent storage
- **Messaging Layer**: SQS queues for agent communication
- **Compute Layer**: Lambda functions for agent execution
- **Web Layer**: Next.js application with Google OAuth
- **Monitoring**: CloudWatch alarms and SNS notifications

## Prerequisites

### Required Software
- AWS CLI (configured with appropriate credentials)
- Node.js 18+ (for CDK and Next.js)
- Python 3.11+
- Git

### Required AWS Permissions
Your AWS user/role needs the following permissions:
- Full access to Lambda, DynamoDB, SQS, EventBridge, SNS, S3, Secrets Manager
- CloudFormation deployment permissions
- IAM role creation and policy attachment

### Required API Keys
- Anthropic Claude API key
- SAM.gov API key
- Google OAuth credentials (for web app)
- Slack Bot Token (for notifications)

## Step 1: Clone and Setup

```bash
# Clone the repository
git clone https://github.com/your-org/govbiz-ai.git
cd govbiz-ai

# Install CDK globally
npm install -g aws-cdk

# Setup Python environment for CDK
cd infrastructure/cdk
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Step 2: Configure AWS Credentials

```bash
# Configure AWS CLI
aws configure

# Set environment variables
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

## Step 3: Deploy Infrastructure

### Automated Deployment

```bash
# Run the deployment script
cd infrastructure/cdk
./deploy.sh
```

### Manual Deployment

```bash
# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy infrastructure
cdk deploy --require-approval never
```

## Step 4: Configure Secrets

After deployment, update the secrets in AWS Secrets Manager:

```bash
# Get the secret ARN from CDK outputs
SECRET_ARN=$(aws cloudformation describe-stacks --stack-name GovBizAiDevStack --query 'Stacks[0].Outputs[?OutputKey==`SecretsArn`].OutputValue' --output text)

# Update secrets
aws secretsmanager update-secret --secret-id $SECRET_ARN --secret-string '{
  "anthropic_api_key": "your-anthropic-api-key",
  "slack_bot_token": "xoxb-your-slack-bot-token",
  "slack_signing_secret": "your-slack-signing-secret",
  "sam_gov_api_key": "your-sam-gov-api-key",
  "google_oauth_client_id": "your-google-oauth-client-id",
  "google_oauth_client_secret": "your-google-oauth-client-secret",
  "nextauth_secret": "your-nextauth-secret",
  "nextauth_url": "https://govbiz-ai-dev.vercel.app"
}'
```

## Step 5: Deploy Lambda Functions

The Lambda functions are automatically deployed with the CDK stack, but you need to package and upload the code:

```bash
# Package Lambda functions
cd ../../src
zip -r lambda-deployment.zip . -x "*.pyc" "*/__pycache__/*" "*/tests/*"

# Update each Lambda function
aws lambda update-function-code --function-name govbiz-ai-dev-opportunity-finder-agent --zip-file fileb://lambda-deployment.zip
aws lambda update-function-code --function-name govbiz-ai-dev-analyzer-agent --zip-file fileb://lambda-deployment.zip
aws lambda update-function-code --function-name govbiz-ai-dev-response-generator-agent --zip-file fileb://lambda-deployment.zip
aws lambda update-function-code --function-name govbiz-ai-dev-relationship-manager-agent --zip-file fileb://lambda-deployment.zip
aws lambda update-function-code --function-name govbiz-ai-dev-email-manager-agent --zip-file fileb://lambda-deployment.zip
aws lambda update-function-code --function-name govbiz-ai-dev-human-loop-agent --zip-file fileb://lambda-deployment.zip
aws lambda update-function-code --function-name govbiz-ai-dev-api --zip-file fileb://lambda-deployment.zip
```

## Step 6: Configure SES for Email

```bash
# Verify email identity for SES
aws ses verify-email-identity --email-address your-email@company.com

# Put SES out of sandbox mode (required for production)
# This requires AWS support request
```

## Step 7: Deploy Next.js Web Application

### Option A: Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
cd web
vercel --prod

# Set environment variables in Vercel dashboard
# or via CLI:
vercel env add NEXTAUTH_SECRET
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
vercel env add API_BASE_URL
```

### Option B: Deploy to AWS Amplify

```bash
# Create Amplify app
aws amplify create-app --name govbiz-ai-web --repository https://github.com/your-org/govbiz-ai

# Configure build settings and environment variables
# through the Amplify console
```

## Step 8: Configure OAuth and Authentication

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://your-domain.com/api/auth/callback/google` (production)

### Cognito Setup

The Cognito User Pool is automatically created by CDK. Configure additional settings:

```bash
# Get Cognito details
aws cognito-idp describe-user-pool --user-pool-id your-user-pool-id

# Configure additional providers if needed
aws cognito-idp create-identity-provider \
  --user-pool-id your-user-pool-id \
  --provider-name Google \
  --provider-type Google \
  --provider-details client_id=your-google-client-id,client_secret=your-google-client-secret
```

## Step 9: Test the Deployment

### API Testing

```bash
# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks --stack-name GovBizAiDevStack --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' --output text)

# Test health endpoint
curl $API_URL/health

# Test opportunities endpoint
curl $API_URL/opportunities
```

### Lambda Testing

```bash
# Test opportunity finder
aws lambda invoke --function-name govbiz-ai-dev-opportunity-finder-agent --payload '{"test": true}' response.json

# Test analyzer
aws lambda invoke --function-name govbiz-ai-dev-analyzer-agent --payload '{"action": "analyze_opportunity", "opportunity_id": "test"}' response.json
```

### End-to-End Testing

```bash
# Run smoke tests
cd tests/smoke
python run_smoke_tests.py
```

## Step 10: Configure Monitoring and Alerts

### CloudWatch Alarms

The CDK stack creates basic alarms. Configure additional monitoring:

```bash
# Create custom dashboard
aws cloudwatch put-dashboard --dashboard-name GovBizAi-Dev --dashboard-body file://dashboard.json

# Set up additional alarms
aws cloudwatch put-metric-alarm \
  --alarm-name "GovBizAi-HighErrorRate" \
  --alarm-description "High error rate across all Lambda functions" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold
```

### SNS Notifications

```bash
# Subscribe to error notifications
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:govbiz-ai-dev-error-notifications \
  --protocol email \
  --notification-endpoint your-admin-email@company.com
```

## Step 11: Initialize the System

### Load Initial Data

```bash
# Trigger initial opportunity discovery
curl -X POST $API_URL/agents/trigger-discovery

# Monitor the process
aws logs tail /aws/lambda/govbiz-ai-dev-opportunity-finder-agent --follow
```

### Configure Company Profile

```bash
# Add your company profile to DynamoDB
aws dynamodb put-item \
  --table-name govbiz-ai-dev-companies \
  --item '{
    "id": {"S": "your-company-id"},
    "name": {"S": "Your Company Name"},
    "naics_codes": {"SS": ["541511", "541512"]},
    "capabilities": {"SS": ["software development", "cloud services"]},
    "certifications": {"SS": ["small business", "8(a)"]},
    "created_at": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}
  }'
```

## Configuration Management

### Environment Variables

Set these environment variables for each component:

**Lambda Functions:**
- `ENVIRONMENT=dev`
- `PROJECT_NAME=govbiz-ai`
- `SECRETS_ARN=arn:aws:secretsmanager:...`
- `OPPORTUNITIES_TABLE=govbiz-ai-dev-opportunities`
- `COMPANIES_TABLE=govbiz-ai-dev-companies`
- `RESPONSES_TABLE=govbiz-ai-dev-responses`
- `CONTACTS_TABLE=govbiz-ai-dev-contacts`

**Next.js Application:**
- `NEXTAUTH_URL=https://your-domain.com`
- `NEXTAUTH_SECRET=your-secret`
- `API_BASE_URL=https://your-api-gateway-url.amazonaws.com/dev`

### Application Configuration

The system uses AWS AppConfig for runtime configuration. Create configuration profiles:

```bash
# Create application
aws appconfig create-application --name govbiz-ai

# Create environment
aws appconfig create-environment --application-id app-123 --name dev

# Create configuration profile
aws appconfig create-configuration-profile \
  --application-id app-123 \
  --name agent-config \
  --location-uri hosted \
  --type "AWS.AppConfig.FeatureFlags"
```

## Security Considerations

### IAM Roles and Policies

The CDK stack creates least-privilege IAM roles for each component. Review and adjust as needed:

```bash
# Review Lambda execution role
aws iam get-role --role-name govbiz-ai-dev-lambda-execution-role

# Review attached policies
aws iam list-attached-role-policies --role-name govbiz-ai-dev-lambda-execution-role
```

### Secrets Management

- All API keys are stored in AWS Secrets Manager
- Secrets are automatically rotated where possible
- Access is logged and monitored

### Network Security

- All resources are deployed in the default VPC
- Security groups restrict access to necessary ports only
- All inter-service communication uses AWS IAM authentication

## Troubleshooting

### Common Issues

1. **Lambda Function Timeouts**
   - Increase timeout in CDK configuration
   - Optimize code for better performance
   - Check CloudWatch logs for bottlenecks

2. **DynamoDB Throttling**
   - Monitor read/write capacity metrics
   - Consider switching to on-demand billing
   - Optimize query patterns

3. **API Gateway Errors**
   - Check Lambda function logs
   - Verify IAM permissions
   - Test individual functions directly

### Debugging Commands

```bash
# View Lambda function logs
aws logs tail /aws/lambda/govbiz-ai-dev-opportunity-finder-agent --follow

# Check DynamoDB metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=govbiz-ai-dev-opportunities \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 300 \
  --statistics Average

# Test SQS queue
aws sqs receive-message --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/govbiz-ai-dev-opportunity-finder-queue
```

## Monitoring and Maintenance

### Regular Tasks

1. **Weekly:**
   - Review CloudWatch alarms
   - Check error logs
   - Monitor API usage

2. **Monthly:**
   - Review AWS costs
   - Update dependencies
   - Rotate secrets

3. **Quarterly:**
   - Review security policies
   - Update documentation
   - Performance optimization

### Scaling Considerations

- **Lambda Concurrency**: Set reserved concurrency for critical functions
- **DynamoDB**: Monitor capacity and consider auto-scaling
- **API Gateway**: Implement throttling and caching
- **SQS**: Monitor queue depth and dead letter queues

## Cost Optimization

### Estimated Monthly Costs (Dev Environment)

- Lambda: $50-100
- DynamoDB: $20-50
- SQS: $5-10
- API Gateway: $10-20
- CloudWatch: $10-20
- S3: $5-10
- **Total: ~$100-210/month**

### Cost Reduction Strategies

1. Use AWS Free Tier where applicable
2. Implement Lambda provisioned concurrency only for critical functions
3. Use DynamoDB on-demand billing for unpredictable workloads
4. Set up billing alerts and budget controls
5. Regular cleanup of old logs and unused resources

## Production Deployment

For production deployment, consider these additional steps:

1. **Multi-AZ Deployment**: Deploy across multiple availability zones
2. **CDN**: Use CloudFront for static assets
3. **WAF**: Implement Web Application Firewall
4. **Backup**: Set up automated backups for DynamoDB
5. **Monitoring**: Enhanced monitoring with X-Ray tracing
6. **SSL/TLS**: Implement end-to-end encryption
7. **Domain**: Set up custom domain with Route 53

## Support and Maintenance

### Documentation
- [Architecture Documentation](./docs/ARCHITECTURE.md)
- [API Documentation](./docs/API.md)
- [Agent Documentation](./docs/AGENTS.md)

### Monitoring
- CloudWatch Dashboard: [Link to dashboard]
- Error Notifications: Sent to admin email
- Performance Metrics: Updated daily

### Updates
- Regular security patches
- Monthly dependency updates
- Quarterly feature releases

## Conclusion

The GovBiz.ai platform is now deployed and ready for use. The multi-agent system will automatically discover Sources Sought opportunities, analyze them, and generate appropriate responses. The web interface provides a user-friendly way to monitor and manage the system.

For questions or issues, please refer to the troubleshooting section or contact the development team.