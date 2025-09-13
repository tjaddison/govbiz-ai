#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';

const app = new cdk.App();

// Get environment from context or use defaults
const account = app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || 'us-east-1';

new InfrastructureStack(app, 'GovBizAIInfrastructureStack', {
  env: {
    account: account,
    region: region,
  },
  description: 'GovBizAI Phase 1 Infrastructure - Foundation components including VPC, S3, DynamoDB, and IAM',
  tags: {
    Project: 'govbizai',
    Environment: 'dev',
    Phase: 'phase-1-foundation',
  },
});