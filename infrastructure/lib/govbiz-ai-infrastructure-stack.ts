import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as path from 'path';

export interface GovBizAiInfrastructureStackProps extends cdk.StackProps {
  stage: string;
}

export class GovBizAiInfrastructureStack extends cdk.Stack {
  public readonly userTable: dynamodb.Table;
  public readonly conversationTable: dynamodb.Table;
  public readonly messageTable: dynamodb.Table;
  public readonly opportunityTable: dynamodb.Table;
  public readonly auditTable: dynamodb.Table;
  public readonly documentBucket: s3.Bucket;
  public readonly eventBus: events.EventBus;
  public readonly deadLetterQueue: sqs.Queue;
  public readonly messageQueue: sqs.Queue;
  public readonly notificationTopic: sns.Topic;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: GovBizAiInfrastructureStackProps) {
    super(scope, id, props);

    const { stage } = props;

    // Create DynamoDB Tables
    this.createDynamoDBTables(stage);

    // Create S3 Buckets
    this.createS3Buckets(stage);

    // Create SQS Queues
    this.createSQSQueues(stage);

    // Create SNS Topics
    this.createSNSTopics(stage);

    // Create EventBridge
    this.createEventBridge(stage);

    // Create Lambda Functions
    this.createLambdaFunctions(stage);

    // Create API Gateway
    this.createAPIGateway(stage);

    // Create CloudWatch Alarms
    this.createCloudWatchAlarms(stage);

    // Create EventBridge Rules
    this.createEventBridgeRules(stage);

    // Output important resources
    this.createOutputs();
  }

  private createDynamoDBTables(stage: string) {
    // Users table for authentication and profile data
    this.userTable = new dynamodb.Table(this, 'UserTable', {
      tableName: `govbiz-users-${stage}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Add GSI for email lookup
    this.userTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Conversations table for chat sessions
    this.conversationTable = new dynamodb.Table(this, 'ConversationTable', {
      tableName: `govbiz-conversations-${stage}`,
      partitionKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Add GSI for user conversations
    this.conversationTable.addGlobalSecondaryIndex({
      indexName: 'user-conversations-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastActivity', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Messages table for chat messages
    this.messageTable = new dynamodb.Table(this, 'MessageTable', {
      tableName: `govbiz-messages-${stage}`,
      partitionKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'messageId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Add GSI for timestamp-based queries
    this.messageTable.addGlobalSecondaryIndex({
      indexName: 'timestamp-index',
      partitionKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Opportunities table for Sources Sought tracking
    this.opportunityTable = new dynamodb.Table(this, 'OpportunityTable', {
      tableName: `govbiz-opportunities-${stage}`,
      partitionKey: { name: 'opportunityId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Add GSI for agency-based queries
    this.opportunityTable.addGlobalSecondaryIndex({
      indexName: 'agency-index',
      partitionKey: { name: 'agency', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'postedDate', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for NAICS code queries
    this.opportunityTable.addGlobalSecondaryIndex({
      indexName: 'naics-index',
      partitionKey: { name: 'naicsCode', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'responseDeadline', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for status-based queries
    this.opportunityTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'responseDeadline', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Audit table for compliance and security logging
    this.auditTable = new dynamodb.Table(this, 'AuditTable', {
      tableName: `govbiz-audit-${stage}`,
      partitionKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // Add GSI for user-based audit queries
    this.auditTable.addGlobalSecondaryIndex({
      indexName: 'user-audit-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for action-based audit queries
    this.auditTable.addGlobalSecondaryIndex({
      indexName: 'action-audit-index',
      partitionKey: { name: 'action', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }

  private createS3Buckets(stage: string) {
    // Document storage bucket
    this.documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      bucketName: `govbiz-documents-${stage}-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
        {
          id: 'TransitionToIA',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
    });

    // CORS configuration for document upload
    this.documentBucket.addCorsRule({
      allowedMethods: [
        s3.HttpMethods.GET,
        s3.HttpMethods.POST,
        s3.HttpMethods.PUT,
        s3.HttpMethods.DELETE,
      ],
      allowedOrigins: ['*'], // Replace with specific origins in production
      allowedHeaders: ['*'],
      maxAge: 3600,
    });

    // Event notification for document processing
    this.documentBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new targets.SqsQueue(this.messageQueue)
    );
  }

  private createSQSQueues(stage: string) {
    // Dead letter queue for failed messages
    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      queueName: `govbiz-dlq-${stage}`,
      retention: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // Main message queue for async processing
    this.messageQueue = new sqs.Queue(this, 'MessageQueue', {
      queueName: `govbiz-messages-${stage}`,
      visibilityTimeout: cdk.Duration.minutes(5),
      retention: cdk.Duration.days(7),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    // Opportunity processing queue
    const opportunityQueue = new sqs.Queue(this, 'OpportunityQueue', {
      queueName: `govbiz-opportunities-${stage}`,
      visibilityTimeout: cdk.Duration.minutes(15),
      retention: cdk.Duration.days(7),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    // Response generation queue
    const responseQueue = new sqs.Queue(this, 'ResponseQueue', {
      queueName: `govbiz-responses-${stage}`,
      visibilityTimeout: cdk.Duration.minutes(10),
      retention: cdk.Duration.days(7),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    // Audit processing queue
    const auditQueue = new sqs.Queue(this, 'AuditQueue', {
      queueName: `govbiz-audit-${stage}`,
      visibilityTimeout: cdk.Duration.minutes(2),
      retention: cdk.Duration.days(7),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3,
      },
    });
  }

  private createSNSTopics(stage: string) {
    // Main notification topic
    this.notificationTopic = new sns.Topic(this, 'NotificationTopic', {
      topicName: `govbiz-notifications-${stage}`,
      displayName: 'GovBiz.ai Notifications',
      encryption: sns.TopicEncryption.KMS_MANAGED,
    });

    // Alert topic for system alerts
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `govbiz-alerts-${stage}`,
      displayName: 'GovBiz.ai System Alerts',
      encryption: sns.TopicEncryption.KMS_MANAGED,
    });

    // Subscribe SQS to SNS for fanout pattern
    this.notificationTopic.addSubscription(
      new subscriptions.SqsSubscription(this.messageQueue, {
        rawMessageDelivery: true,
      })
    );
  }

  private createEventBridge(stage: string) {
    // Custom event bus for application events
    this.eventBus = new events.EventBus(this, 'EventBus', {
      eventBusName: `govbiz-events-${stage}`,
      description: 'GovBiz.ai application events',
    });

    // Archive for event replay
    new events.Archive(this, 'EventArchive', {
      sourceEventBus: this.eventBus,
      archiveName: `govbiz-archive-${stage}`,
      retention: cdk.Duration.days(90),
      description: 'Archive for GovBiz.ai events',
    });
  }

  private createLambdaFunctions(stage: string) {
    // Common Lambda environment variables
    const commonEnvironment = {
      STAGE: stage,
      USER_TABLE: this.userTable.tableName,
      CONVERSATION_TABLE: this.conversationTable.tableName,
      MESSAGE_TABLE: this.messageTable.tableName,
      OPPORTUNITY_TABLE: this.opportunityTable.tableName,
      AUDIT_TABLE: this.auditTable.tableName,
      DOCUMENT_BUCKET: this.documentBucket.bucketName,
      EVENT_BUS: this.eventBus.eventBusName,
      NOTIFICATION_TOPIC: this.notificationTopic.topicArn,
      MESSAGE_QUEUE: this.messageQueue.queueUrl,
    };

    // Common Lambda role with necessary permissions
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        DynamoDBPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:Scan',
                'dynamodb:BatchGetItem',
                'dynamodb:BatchWriteItem',
              ],
              resources: [
                this.userTable.tableArn,
                this.conversationTable.tableArn,
                this.messageTable.tableArn,
                this.opportunityTable.tableArn,
                this.auditTable.tableArn,
                `${this.userTable.tableArn}/index/*`,
                `${this.conversationTable.tableArn}/index/*`,
                `${this.messageTable.tableArn}/index/*`,
                `${this.opportunityTable.tableArn}/index/*`,
                `${this.auditTable.tableArn}/index/*`,
              ],
            }),
          ],
        }),
        S3Policy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
              ],
              resources: [
                this.documentBucket.bucketArn,
                `${this.documentBucket.bucketArn}/*`,
              ],
            }),
          ],
        }),
        EventBridgePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'events:PutEvents',
              ],
              resources: [this.eventBus.eventBusArn],
            }),
          ],
        }),
        SNSPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sns:Publish',
              ],
              resources: [this.notificationTopic.topicArn],
            }),
          ],
        }),
        SQSPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sqs:SendMessage',
                'sqs:ReceiveMessage',
                'sqs:DeleteMessage',
                'sqs:GetQueueAttributes',
              ],
              resources: [
                this.messageQueue.queueArn,
                this.deadLetterQueue.queueArn,
              ],
            }),
          ],
        }),
      },
    });

    // API Handler Lambda
    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      functionName: `govbiz-api-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/api')),
      handler: 'index.handler',
      environment: commonEnvironment,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Opportunity Processor Lambda
    const opportunityProcessor = new lambda.Function(this, 'OpportunityProcessor', {
      functionName: `govbiz-opportunity-processor-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/opportunity-processor')),
      handler: 'index.handler',
      environment: commonEnvironment,
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Response Generator Lambda
    const responseGenerator = new lambda.Function(this, 'ResponseGenerator', {
      functionName: `govbiz-response-generator-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/response-generator')),
      handler: 'index.handler',
      environment: commonEnvironment,
      role: lambdaRole,
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Audit Processor Lambda
    const auditProcessor = new lambda.Function(this, 'AuditProcessor', {
      functionName: `govbiz-audit-processor-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/audit-processor')),
      handler: 'index.handler',
      environment: commonEnvironment,
      role: lambdaRole,
      timeout: cdk.Duration.minutes(2),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Scheduled Lambda for opportunity monitoring
    const opportunityMonitor = new lambda.Function(this, 'OpportunityMonitor', {
      functionName: `govbiz-opportunity-monitor-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/opportunity-monitor')),
      handler: 'index.handler',
      environment: commonEnvironment,
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Store Lambda functions for later use
    this.api = new apigateway.LambdaRestApi(this, 'ApiGateway', {
      handler: apiHandler,
      restApiName: `govbiz-api-${stage}`,
      description: 'GovBiz.ai API Gateway',
      deployOptions: {
        stageName: stage,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });
  }

  private createAPIGateway(stage: string) {
    // API Gateway usage plan
    const usagePlan = this.api.addUsagePlan('UsagePlan', {
      name: `govbiz-usage-plan-${stage}`,
      description: 'Usage plan for GovBiz.ai API',
      throttle: {
        rateLimit: 1000,
        burstLimit: 2000,
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.DAY,
      },
    });

    // API Key for external integrations
    const apiKey = this.api.addApiKey('ApiKey', {
      apiKeyName: `govbiz-api-key-${stage}`,
      description: 'API key for GovBiz.ai',
    });

    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({
      stage: this.api.deploymentStage,
    });
  }

  private createCloudWatchAlarms(stage: string) {
    // API Gateway error rate alarm
    new cloudwatch.Alarm(this, 'ApiErrorRateAlarm', {
      alarmName: `govbiz-api-error-rate-${stage}`,
      metric: this.api.metricClientError(),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // DynamoDB read throttle alarm
    new cloudwatch.Alarm(this, 'DynamoDBReadThrottleAlarm', {
      alarmName: `govbiz-dynamo-read-throttle-${stage}`,
      metric: this.userTable.metricUserErrors(),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // SQS queue depth alarm
    new cloudwatch.Alarm(this, 'SQSQueueDepthAlarm', {
      alarmName: `govbiz-sqs-queue-depth-${stage}`,
      metric: this.messageQueue.metricApproximateNumberOfVisibleMessages(),
      threshold: 100,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  private createEventBridgeRules(stage: string) {
    // Schedule for opportunity monitoring (every 15 minutes)
    new events.Rule(this, 'OpportunityMonitorRule', {
      ruleName: `govbiz-opportunity-monitor-${stage}`,
      description: 'Schedule for monitoring Sources Sought opportunities',
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [
        new targets.LambdaFunction(
          lambda.Function.fromFunctionName(
            this,
            'OpportunityMonitorTarget',
            `govbiz-opportunity-monitor-${stage}`
          )
        ),
      ],
    });

    // Event rule for DynamoDB stream processing
    new events.Rule(this, 'DynamoDBStreamRule', {
      ruleName: `govbiz-dynamo-stream-${stage}`,
      description: 'Process DynamoDB stream events',
      eventPattern: {
        source: ['aws.dynamodb'],
        detailType: ['DynamoDB Stream Record'],
      },
      targets: [
        new targets.LambdaFunction(
          lambda.Function.fromFunctionName(
            this,
            'AuditProcessorTarget',
            `govbiz-audit-processor-${stage}`
          )
        ),
      ],
    });
  }

  private createOutputs() {
    // API Gateway URL
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: 'GovBizApiUrl',
    });

    // DynamoDB table names
    new cdk.CfnOutput(this, 'UserTableName', {
      value: this.userTable.tableName,
      description: 'User table name',
      exportName: 'GovBizUserTable',
    });

    new cdk.CfnOutput(this, 'ConversationTableName', {
      value: this.conversationTable.tableName,
      description: 'Conversation table name',
      exportName: 'GovBizConversationTable',
    });

    new cdk.CfnOutput(this, 'MessageTableName', {
      value: this.messageTable.tableName,
      description: 'Message table name',
      exportName: 'GovBizMessageTable',
    });

    new cdk.CfnOutput(this, 'OpportunityTableName', {
      value: this.opportunityTable.tableName,
      description: 'Opportunity table name',
      exportName: 'GovBizOpportunityTable',
    });

    new cdk.CfnOutput(this, 'AuditTableName', {
      value: this.auditTable.tableName,
      description: 'Audit table name',
      exportName: 'GovBizAuditTable',
    });

    // S3 bucket name
    new cdk.CfnOutput(this, 'DocumentBucketName', {
      value: this.documentBucket.bucketName,
      description: 'Document bucket name',
      exportName: 'GovBizDocumentBucket',
    });

    // Event bus name
    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      description: 'Event bus name',
      exportName: 'GovBizEventBus',
    });

    // SQS queue URLs
    new cdk.CfnOutput(this, 'MessageQueueUrl', {
      value: this.messageQueue.queueUrl,
      description: 'Message queue URL',
      exportName: 'GovBizMessageQueue',
    });

    // SNS topic ARN
    new cdk.CfnOutput(this, 'NotificationTopicArn', {
      value: this.notificationTopic.topicArn,
      description: 'Notification topic ARN',
      exportName: 'GovBizNotificationTopic',
    });
  }
}