#!/bin/bash

# Environment Setup Script for GovBiz.ai
# This script sets up the necessary environment variables and configurations

set -e

STAGE=${1:-dev}
PROFILE=${2:-default}

echo "🔧 Setting up environment for GovBiz.ai..."
echo "Stage: $STAGE"
echo "Profile: $PROFILE"

# Create .env file for infrastructure
cat > .env << EOF
# GovBiz.ai Infrastructure Environment Variables
STAGE=$STAGE
AWS_PROFILE=$PROFILE
AWS_DEFAULT_REGION=us-east-1
CDK_DEFAULT_REGION=us-east-1

# SAM.gov API Configuration
SAM_GOV_API_KEY=your_sam_gov_api_key_here

# Bedrock Model Configuration
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
BEDROCK_REGION=us-east-1

# Security Configuration
ENCRYPTION_KEY_ID=alias/govbiz-ai-encryption-key
AUDIT_RETENTION_DAYS=2555  # 7 years for government compliance

# Monitoring Configuration
ALERT_EMAIL=alerts@govbiz.ai
SLACK_WEBHOOK_URL=your_slack_webhook_url_here

# Performance Configuration
LAMBDA_MEMORY_SIZE=1024
LAMBDA_TIMEOUT_SECONDS=900
API_RATE_LIMIT=1000
API_BURST_LIMIT=2000

# Data Retention Policies
CONVERSATION_RETENTION_DAYS=2555
MESSAGE_RETENTION_DAYS=2555
OPPORTUNITY_RETENTION_DAYS=2555
AUDIT_RETENTION_DAYS=2555

# Feature Flags
ENABLE_AI_RESPONSE_GENERATION=true
ENABLE_BULK_OPERATIONS=true
ENABLE_ADVANCED_ANALYTICS=true
ENABLE_REAL_TIME_MONITORING=true
EOF

echo "💾 Created .env file with default configuration"

# Create parameter store setup script
cat > scripts/setup-parameters.sh << 'EOF'
#!/bin/bash

# Setup AWS Systems Manager Parameter Store values
STAGE=${1:-dev}
PROFILE=${2:-default}

echo "📝 Setting up Parameter Store values..."

# SAM.gov API Key (secure string)
aws ssm put-parameter \
    --name "/govbiz/$STAGE/sam-gov-api-key" \
    --value "your_actual_sam_gov_api_key" \
    --type "SecureString" \
    --description "SAM.gov API key for opportunity monitoring" \
    --profile $PROFILE \
    --overwrite

# Encryption key
aws ssm put-parameter \
    --name "/govbiz/$STAGE/encryption-key-id" \
    --value "alias/govbiz-ai-encryption-key" \
    --type "String" \
    --description "KMS key for data encryption" \
    --profile $PROFILE \
    --overwrite

# Alert configuration
aws ssm put-parameter \
    --name "/govbiz/$STAGE/alert-email" \
    --value "alerts@govbiz.ai" \
    --type "String" \
    --description "Email for system alerts" \
    --profile $PROFILE \
    --overwrite

# Slack webhook (secure string)
aws ssm put-parameter \
    --name "/govbiz/$STAGE/slack-webhook" \
    --value "your_slack_webhook_url" \
    --type "SecureString" \
    --description "Slack webhook for notifications" \
    --profile $PROFILE \
    --overwrite

# Feature flags
aws ssm put-parameter \
    --name "/govbiz/$STAGE/feature-flags" \
    --value '{"aiResponseGeneration":true,"bulkOperations":true,"advancedAnalytics":true,"realTimeMonitoring":true}' \
    --type "String" \
    --description "Feature flags configuration" \
    --profile $PROFILE \
    --overwrite

echo "✅ Parameter Store setup complete"
echo ""
echo "🔒 Secure parameters created:"
echo "  - SAM.gov API key"
echo "  - Slack webhook URL"
echo ""
echo "📋 Standard parameters created:"
echo "  - Encryption key ID"
echo "  - Alert email"
echo "  - Feature flags"
echo ""
echo "⚠️  Remember to update the parameter values with your actual keys and URLs!"
EOF

chmod +x scripts/setup-parameters.sh

# Create monitoring setup script
cat > scripts/setup-monitoring.sh << 'EOF'
#!/bin/bash

# Setup CloudWatch monitoring and alarms
STAGE=${1:-dev}
PROFILE=${2:-default}

echo "📊 Setting up monitoring and alarms..."

# Create CloudWatch dashboard
aws cloudwatch put-dashboard \
    --dashboard-name "GovBizAi-$STAGE-Overview" \
    --dashboard-body file://monitoring/dashboard.json \
    --profile $PROFILE

# Create custom metrics
aws logs create-log-group \
    --log-group-name "/aws/lambda/govbiz-api-$STAGE" \
    --profile $PROFILE \
    --retention-in-days 30

aws logs create-log-group \
    --log-group-name "/aws/lambda/govbiz-opportunity-processor-$STAGE" \
    --profile $PROFILE \
    --retention-in-days 30

aws logs create-log-group \
    --log-group-name "/aws/lambda/govbiz-opportunity-monitor-$STAGE" \
    --profile $PROFILE \
    --retention-in-days 30

echo "✅ Monitoring setup complete"
EOF

chmod +x scripts/setup-monitoring.sh

# Create CloudWatch dashboard configuration
mkdir -p monitoring
cat > monitoring/dashboard.json << 'EOF'
{
  "widgets": [
    {
      "type": "metric",
      "x": 0,
      "y": 0,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "AWS/ApiGateway", "Count", "ApiName", "govbiz-api" ],
          [ ".", "4XXError", ".", "." ],
          [ ".", "5XXError", ".", "." ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "us-east-1",
        "title": "API Gateway Metrics",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 12,
      "y": 0,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "AWS/Lambda", "Duration", "FunctionName", "govbiz-api" ],
          [ ".", "Errors", ".", "." ],
          [ ".", "Invocations", ".", "." ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "us-east-1",
        "title": "Lambda Metrics",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 0,
      "y": 6,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", "govbiz-users" ],
          [ ".", "ConsumedWriteCapacityUnits", ".", "." ],
          [ ".", "UserErrors", ".", "." ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "us-east-1",
        "title": "DynamoDB Metrics",
        "period": 300
      }
    },
    {
      "type": "metric",
      "x": 12,
      "y": 6,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "AWS/SQS", "NumberOfMessagesSent", "QueueName", "govbiz-messages" ],
          [ ".", "NumberOfMessagesReceived", ".", "." ],
          [ ".", "ApproximateNumberOfVisibleMessages", ".", "." ]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "us-east-1",
        "title": "SQS Metrics",
        "period": 300
      }
    }
  ]
}
EOF

# Create README for infrastructure
cat > README.md << 'EOF'
# GovBiz.ai Infrastructure

This directory contains the AWS CDK infrastructure code for the GovBiz.ai platform.

## Architecture Overview

The GovBiz.ai platform uses a serverless architecture on AWS with the following components:

### Core Services
- **API Gateway**: RESTful API for frontend communication
- **Lambda Functions**: Serverless compute for business logic
- **DynamoDB**: NoSQL database for user data, conversations, and opportunities
- **S3**: Object storage for documents and files
- **EventBridge**: Event-driven architecture coordination
- **SQS**: Message queuing for async processing
- **SNS**: Notifications and alerts

### Lambda Functions
1. **API Handler**: Main API endpoints for the frontend
2. **Opportunity Processor**: Processes Sources Sought opportunities
3. **Opportunity Monitor**: Monitors SAM.gov for new opportunities
4. **Response Generator**: AI-powered response generation
5. **Audit Processor**: Security and compliance monitoring

### Data Storage
- **User Table**: User profiles and authentication data
- **Conversation Table**: Chat conversation metadata
- **Message Table**: Individual chat messages
- **Opportunity Table**: Sources Sought opportunities
- **Audit Table**: Security and compliance logs

## Deployment

### Prerequisites
- AWS CLI configured with appropriate permissions
- Node.js 18+ installed
- AWS CDK CLI installed (`npm install -g aws-cdk`)

### Environment Setup
1. Run the environment setup script:
   ```bash
   ./scripts/setup-env.sh [stage] [profile]
   ```

2. Set up Parameter Store values:
   ```bash
   ./scripts/setup-parameters.sh [stage] [profile]
   ```

3. Configure your SAM.gov API key and other secrets in Parameter Store

### Deploy Infrastructure
```bash
./scripts/deploy.sh [stage] [region] [profile]
```

### Destroy Infrastructure
```bash
./scripts/destroy.sh [stage] [region] [profile]
```

## Configuration

### Environment Variables
Key environment variables are managed through:
- `.env` file for local development
- AWS Parameter Store for secure values
- Lambda environment variables for runtime config

### Security
- All data is encrypted at rest using AWS KMS
- API Gateway uses API keys and request throttling
- DynamoDB has point-in-time recovery enabled
- S3 buckets block public access
- Audit logging for compliance

### Monitoring
- CloudWatch dashboards for system metrics
- Custom alarms for error rates and performance
- SNS notifications for critical alerts
- EventBridge for event-driven monitoring

## Development

### Local Development
1. Install dependencies: `npm install`
2. Build TypeScript: `npm run build`
3. Synthesize CloudFormation: `npm run synth`
4. Deploy to dev: `./scripts/deploy.sh dev`

### Testing
```bash
npm test
```

### Code Structure
```
├── bin/                 # CDK app entry point
├── lib/                 # CDK stack definitions
├── lambda/              # Lambda function code
│   ├── api/            # API Gateway handler
│   ├── opportunity-*   # Opportunity processing
│   ├── response-*      # Response generation
│   └── audit-*         # Audit and compliance
├── scripts/            # Deployment and setup scripts
├── monitoring/         # CloudWatch configurations
└── README.md           # This file
```

## Security Considerations

### Data Protection
- All PII is encrypted using customer-managed KMS keys
- Database encryption at rest and in transit
- S3 bucket encryption and versioning
- Audit trails for all data access

### Access Control
- IAM roles with least privilege principle
- API Gateway authentication and authorization
- DynamoDB fine-grained access control
- Lambda execution roles with minimal permissions

### Compliance
- SOC 2 Type II compliance ready
- FedRAMP moderate baseline alignment
- NIST Cybersecurity Framework implementation
- Audit logging for government requirements

## Troubleshooting

### Common Issues
1. **CDK Bootstrap**: Ensure CDK is bootstrapped in your account/region
2. **Permissions**: Verify IAM permissions for CDK deployment
3. **Resource Limits**: Check AWS service limits for your account
4. **Dependencies**: Ensure all Lambda dependencies are installed

### Monitoring
- Check CloudWatch logs for Lambda functions
- Monitor API Gateway metrics and logs
- Review DynamoDB metrics for performance issues
- Monitor SQS queue depths for backlog

### Support
For technical support:
1. Check CloudWatch logs first
2. Review CDK deployment outputs
3. Verify Parameter Store configuration
4. Contact the development team

## Cost Optimization

### Cost Management
- Pay-per-request DynamoDB billing
- Lambda right-sizing with performance monitoring
- S3 intelligent tiering for long-term storage
- CloudWatch log retention policies

### Resource Optimization
- Auto-scaling for DynamoDB when needed
- Lambda memory optimization based on performance metrics
- S3 lifecycle policies for cost reduction
- Regular review of unused resources

EOF

echo ""
echo "✅ Environment setup complete!"
echo ""
echo "📁 Created files:"
echo "  - .env (environment variables)"
echo "  - scripts/setup-parameters.sh (Parameter Store setup)"
echo "  - scripts/setup-monitoring.sh (CloudWatch setup)"
echo "  - monitoring/dashboard.json (CloudWatch dashboard)"
echo "  - README.md (documentation)"
echo ""
echo "🔗 Next steps:"
echo "  1. Review and update the .env file with your values"
echo "  2. Run ./scripts/setup-parameters.sh to configure Parameter Store"
echo "  3. Update SAM.gov API key and other secrets in Parameter Store"
echo "  4. Run ./scripts/deploy.sh to deploy the infrastructure"
echo ""
echo "🎉 Ready for deployment!"