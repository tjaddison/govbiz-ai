#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { ApiStack } from '../lib/api-stack';
import { ProcessingStack } from '../lib/processing-stack';
import { WebAppStack } from '../lib/web-app-stack';

const app = new cdk.App();

// Get environment from context or use defaults
const account = app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || 'us-east-1';

// Deploy core infrastructure first
const infraStack = new InfrastructureStack(app, 'GovBizAIInfrastructureStack', {
  env: {
    account: account,
    region: region,
  },
  description: 'GovBizAI Infrastructure - Core components including VPC, S3, DynamoDB, Lambda functions',
  tags: {
    Project: 'govbizai',
    Environment: 'dev',
    Phase: 'core-infrastructure',
  },
});

// Deploy document processing stack first
const processingStack = new ProcessingStack(app, 'GovBizAIProcessingStack', {
  env: {
    account: account,
    region: region,
  },
  description: 'GovBizAI Processing - Document processing, embedding generation, and web scraping',
  tags: {
    Project: 'govbizai',
    Environment: 'dev',
    Phase: 'document-processing',
  },
  documentsBucket: infraStack.rawDocumentsBucket,
  embeddingsBucket: infraStack.embeddingsBucket,
  companiesTable: infraStack.companiesTable,
});

// Deploy API Gateway stack (depends on infrastructure and processing)
new ApiStack(app, 'GovBizAIApiStack', {
  env: {
    account: account,
    region: region,
  },
  description: 'GovBizAI API - REST and WebSocket APIs with authentication',
  tags: {
    Project: 'govbizai',
    Environment: 'dev',
    Phase: 'api-gateway',
  },
  userPool: infraStack.userPool,
  userPoolClient: infraStack.userPoolClient,
  companiesTable: infraStack.companiesTable,
  opportunitiesTable: infraStack.opportunitiesTable,
  matchesTable: infraStack.matchesTable,
  feedbackTable: infraStack.feedbackTable,
  documentsTable: infraStack.userProfilesTable, // Using userProfiles table for document metadata
  documentsBucket: infraStack.rawDocumentsBucket,
  embeddingsBucket: infraStack.embeddingsBucket,
  kmsKey: infraStack.kmsKey,
  profileEmbeddingQueueUrl: processingStack.profileEmbeddingQueue.queueUrl,
  webScrapingQueueUrl: processingStack.webScrapingQueue.queueUrl,
  documentProcessingQueueUrl: processingStack.documentProcessingQueue.queueUrl,
  processingStateMachineArn: infraStack.enhancedProcessingStateMachine.stateMachineArn,
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