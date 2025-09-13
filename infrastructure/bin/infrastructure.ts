#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { WebAppStack } from '../lib/web-app-stack';

const app = new cdk.App();

// Get environment from context or use defaults
const account = app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || 'us-east-1';

// Deploy core infrastructure first
new InfrastructureStack(app, 'GovBizAIInfrastructureStack', {
  env: {
    account: account,
    region: region,
  },
  description: 'GovBizAI Infrastructure - Core components including VPC, S3, DynamoDB, Lambda functions, and API Gateway',
  tags: {
    Project: 'govbizai',
    Environment: 'dev',
    Phase: 'core-infrastructure',
  },
});

// Deploy web application
new WebAppStack(app, 'GovBizAIWebAppStack', {
  env: {
    account: account,
    region: region,
  },
  description: 'GovBizAI Web Application - React frontend with CloudFront distribution and S3 hosting',
  tags: {
    Project: 'govbizai',
    Environment: 'dev',
    Phase: 'web-application',
  },
});