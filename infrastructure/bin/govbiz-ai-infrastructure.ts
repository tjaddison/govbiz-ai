#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { GovBizAiInfrastructureStack } from '../lib/govbiz-ai-infrastructure-stack';

const app = new cdk.App();

// Get environment configuration
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';
const stage = process.env.STAGE || 'dev';

new GovBizAiInfrastructureStack(app, `GovBizAi-${stage}`, {
  env: {
    account,
    region,
  },
  stage,
  description: `GovBiz.ai Infrastructure Stack for ${stage} environment`,
});

app.synth();