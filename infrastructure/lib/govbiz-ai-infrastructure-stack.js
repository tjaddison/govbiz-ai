"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GovBizAiInfrastructureStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const subscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const path = __importStar(require("path"));
class GovBizAiInfrastructureStack extends cdk.Stack {
    constructor(scope, id, props) {
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
    createDynamoDBTables(stage) {
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
    createS3Buckets(stage) {
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
        this.documentBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new targets.SqsQueue(this.messageQueue));
    }
    createSQSQueues(stage) {
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
    createSNSTopics(stage) {
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
        this.notificationTopic.addSubscription(new subscriptions.SqsSubscription(this.messageQueue, {
            rawMessageDelivery: true,
        }));
    }
    createEventBridge(stage) {
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
    createLambdaFunctions(stage) {
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
    createAPIGateway(stage) {
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
    createCloudWatchAlarms(stage) {
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
    createEventBridgeRules(stage) {
        // Schedule for opportunity monitoring (every 15 minutes)
        new events.Rule(this, 'OpportunityMonitorRule', {
            ruleName: `govbiz-opportunity-monitor-${stage}`,
            description: 'Schedule for monitoring Sources Sought opportunities',
            schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
            targets: [
                new targets.LambdaFunction(lambda.Function.fromFunctionName(this, 'OpportunityMonitorTarget', `govbiz-opportunity-monitor-${stage}`)),
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
                new targets.LambdaFunction(lambda.Function.fromFunctionName(this, 'AuditProcessorTarget', `govbiz-audit-processor-${stage}`)),
            ],
        });
    }
    createOutputs() {
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
exports.GovBizAiInfrastructureStack = GovBizAiInfrastructureStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ292Yml6LWFpLWluZnJhc3RydWN0dXJlLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ292Yml6LWFpLWluZnJhc3RydWN0dXJlLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQyxtRUFBcUQ7QUFDckQsK0RBQWlEO0FBQ2pELHVFQUF5RDtBQUN6RCx1REFBeUM7QUFDekMseURBQTJDO0FBQzNDLCtEQUFpRDtBQUNqRCx3RUFBMEQ7QUFDMUQseURBQTJDO0FBQzNDLDJEQUE2QztBQUM3Qyx5REFBMkM7QUFDM0MsaUZBQW1FO0FBQ25FLHVFQUF5RDtBQUN6RCwyQ0FBNkI7QUFNN0IsTUFBYSwyQkFBNEIsU0FBUSxHQUFHLENBQUMsS0FBSztJQWF4RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXVDO1FBQy9FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxLQUFLLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFeEIseUJBQXlCO1FBQ3pCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUVqQyxvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU1QixvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU1QixvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU1QixxQkFBcUI7UUFDckIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTlCLDBCQUEwQjtRQUMxQixJQUFJLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFbEMscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxL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QVE7WUFDakMsV0FBVyxFQUFFLG1CQUFtQjtZQUNoQyxVQUFVLEVBQUUsb0JBQW9CO1NBQ2pDLENBQUMsQ0FBQztRQUVILGdCQUFnQjtRQUNoQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlDLEtBQUssRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUTtZQUN0QyxXQUFXLEVBQUUsd0JBQXdCO1lBQ3JDLFVBQVUsRUFBRSx5QkFBeUI7U0FDdEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBM3FCRCxrRUEycUJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0ICogYXMgc3Vic2NyaXB0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zLXN1YnNjcmlwdGlvbnMnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEdvdkJpekFpSW5mcmFzdHJ1Y3R1cmVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBzdGFnZTogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgR292Qml6QWlJbmZyYXN0cnVjdHVyZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHB1YmxpYyByZWFkb25seSBjb252ZXJzYXRpb25UYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHB1YmxpYyByZWFkb25seSBtZXNzYWdlVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICBwdWJsaWMgcmVhZG9ubHkgb3Bwb3J0dW5pdHlUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHB1YmxpYyByZWFkb25seSBhdWRpdFRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHVibGljIHJlYWRvbmx5IGRvY3VtZW50QnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSBldmVudEJ1czogZXZlbnRzLkV2ZW50QnVzO1xuICBwdWJsaWMgcmVhZG9ubHkgZGVhZExldHRlclF1ZXVlOiBzcXMuUXVldWU7XG4gIHB1YmxpYyByZWFkb25seSBtZXNzYWdlUXVldWU6IHNxcy5RdWV1ZTtcbiAgcHVibGljIHJlYWRvbmx5IG5vdGlmaWNhdGlvblRvcGljOiBzbnMuVG9waWM7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogR292Qml6QWlJbmZyYXN0cnVjdHVyZVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgc3RhZ2UgfSA9IHByb3BzO1xuXG4gICAgLy8gQ3JlYXRlIER5bmFtb0RCIFRhYmxlc1xuICAgIHRoaXMuY3JlYXRlRHluYW1vREJUYWJsZXMoc3RhZ2UpO1xuXG4gICAgLy8gQ3JlYXRlIFMzIEJ1Y2tldHNcbiAgICB0aGlzLmNyZWF0ZVMzQnVja2V0cyhzdGFnZSk7XG5cbiAgICAvLyBDcmVhdGUgU1FTIFF1ZXVlc1xuICAgIHRoaXMuY3JlYXRlU1FTUXVldWVzKHN0YWdlKTtcblxuICAgIC8vIENyZWF0ZSBTTlMgVG9waWNzXG4gICAgdGhpcy5jcmVhdGVTTlNUb3BpY3Moc3RhZ2UpO1xuXG4gICAgLy8gQ3JlYXRlIEV2ZW50QnJpZGdlXG4gICAgdGhpcy5jcmVhdGVFdmVudEJyaWRnZShzdGFnZSk7XG5cbiAgICAvLyBDcmVhdGUgTGFtYmRhIEZ1bmN0aW9uc1xuICAgIHRoaXMuY3JlYXRlTGFtYmRhRnVuY3Rpb25zKHN0YWdlKTtcblxuICAgIC8vIENyZWF0ZSBBUEkgR2F0ZXdheVxuICAgIHRoaXMuY3JlYXRlQVBJR2F0ZXdheShzdGFnZSk7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBBbGFybXNcbiAgICB0aGlzLmNyZWF0ZUNsb3VkV2F0Y2hBbGFybXMoc3RhZ2UpO1xuXG4gICAgLy8gQ3JlYXRlIEV2ZW50QnJpZGdlIFJ1bGVzXG4gICAgdGhpcy5jcmVhdGVFdmVudEJyaWRnZVJ1bGVzKHN0YWdlKTtcblxuICAgIC8vIE91dHB1dCBpbXBvcnRhbnQgcmVzb3VyY2VzXG4gICAgdGhpcy5jcmVhdGVPdXRwdXRzKCk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUR5bmFtb0RCVGFibGVzKHN0YWdlOiBzdHJpbmcpIHtcbiAgICAvLyBVc2VycyB0YWJsZSBmb3IgYXV0aGVudGljYXRpb24gYW5kIHByb2ZpbGUgZGF0YVxuICAgIHRoaXMudXNlclRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdVc2VyVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6IGBnb3ZiaXotdXNlcnMtJHtzdGFnZX1gLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd1c2VySWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICByZW1vdmFsUG9saWN5OiBzdGFnZSA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHN0cmVhbTogZHluYW1vZGIuU3RyZWFtVmlld1R5cGUuTkVXX0FORF9PTERfSU1BR0VTLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdTSSBmb3IgZW1haWwgbG9va3VwXG4gICAgdGhpcy51c2VyVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnZW1haWwtaW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdlbWFpbCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuXG4gICAgLy8gQ29udmVyc2F0aW9ucyB0YWJsZSBmb3IgY2hhdCBzZXNzaW9uc1xuICAgIHRoaXMuY29udmVyc2F0aW9uVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0NvbnZlcnNhdGlvblRhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgZ292Yml6LWNvbnZlcnNhdGlvbnMtJHtzdGFnZX1gLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdjb252ZXJzYXRpb25JZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICd1c2VySWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICByZW1vdmFsUG9saWN5OiBzdGFnZSA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHN0cmVhbTogZHluYW1vZGIuU3RyZWFtVmlld1R5cGUuTkVXX0FORF9PTERfSU1BR0VTLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdTSSBmb3IgdXNlciBjb252ZXJzYXRpb25zXG4gICAgdGhpcy5jb252ZXJzYXRpb25UYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICd1c2VyLWNvbnZlcnNhdGlvbnMtaW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd1c2VySWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAnbGFzdEFjdGl2aXR5JywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG5cbiAgICAvLyBNZXNzYWdlcyB0YWJsZSBmb3IgY2hhdCBtZXNzYWdlc1xuICAgIHRoaXMubWVzc2FnZVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdNZXNzYWdlVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6IGBnb3ZiaXotbWVzc2FnZXMtJHtzdGFnZX1gLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdjb252ZXJzYXRpb25JZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdtZXNzYWdlSWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICByZW1vdmFsUG9saWN5OiBzdGFnZSA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHN0cmVhbTogZHluYW1vZGIuU3RyZWFtVmlld1R5cGUuTkVXX0FORF9PTERfSU1BR0VTLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdTSSBmb3IgdGltZXN0YW1wLWJhc2VkIHF1ZXJpZXNcbiAgICB0aGlzLm1lc3NhZ2VUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICd0aW1lc3RhbXAtaW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdjb252ZXJzYXRpb25JZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICd0aW1lc3RhbXAnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLk5VTUJFUiB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIC8vIE9wcG9ydHVuaXRpZXMgdGFibGUgZm9yIFNvdXJjZXMgU291Z2h0IHRyYWNraW5nXG4gICAgdGhpcy5vcHBvcnR1bml0eVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdPcHBvcnR1bml0eVRhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgZ292Yml6LW9wcG9ydHVuaXRpZXMtJHtzdGFnZX1gLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdvcHBvcnR1bml0eUlkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxuICAgICAgcmVtb3ZhbFBvbGljeTogc3RhZ2UgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBzdHJlYW06IGR5bmFtb2RiLlN0cmVhbVZpZXdUeXBlLk5FV19BTkRfT0xEX0lNQUdFUyxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBHU0kgZm9yIGFnZW5jeS1iYXNlZCBxdWVyaWVzXG4gICAgdGhpcy5vcHBvcnR1bml0eVRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ2FnZW5jeS1pbmRleCcsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2FnZW5jeScsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdwb3N0ZWREYXRlJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgR1NJIGZvciBOQUlDUyBjb2RlIHF1ZXJpZXNcbiAgICB0aGlzLm9wcG9ydHVuaXR5VGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnbmFpY3MtaW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICduYWljc0NvZGUnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAncmVzcG9uc2VEZWFkbGluZScsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdTSSBmb3Igc3RhdHVzLWJhc2VkIHF1ZXJpZXNcbiAgICB0aGlzLm9wcG9ydHVuaXR5VGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnc3RhdHVzLWluZGV4JyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnc3RhdHVzJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ3Jlc3BvbnNlRGVhZGxpbmUnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIC8vIEF1ZGl0IHRhYmxlIGZvciBjb21wbGlhbmNlIGFuZCBzZWN1cml0eSBsb2dnaW5nXG4gICAgdGhpcy5hdWRpdFRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdBdWRpdFRhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgZ292Yml6LWF1ZGl0LSR7c3RhZ2V9YCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnZXZlbnRJZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICd0aW1lc3RhbXAnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLk5VTUJFUiB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICByZW1vdmFsUG9saWN5OiBzdGFnZSA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHRpbWVUb0xpdmVBdHRyaWJ1dGU6ICd0dGwnLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdTSSBmb3IgdXNlci1iYXNlZCBhdWRpdCBxdWVyaWVzXG4gICAgdGhpcy5hdWRpdFRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ3VzZXItYXVkaXQtaW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd1c2VySWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAndGltZXN0YW1wJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5OVU1CRVIgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgR1NJIGZvciBhY3Rpb24tYmFzZWQgYXVkaXQgcXVlcmllc1xuICAgIHRoaXMuYXVkaXRUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdhY3Rpb24tYXVkaXQtaW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdhY3Rpb24nLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAndGltZXN0YW1wJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5OVU1CRVIgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVMzQnVja2V0cyhzdGFnZTogc3RyaW5nKSB7XG4gICAgLy8gRG9jdW1lbnQgc3RvcmFnZSBidWNrZXRcbiAgICB0aGlzLmRvY3VtZW50QnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnRG9jdW1lbnRCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgZ292Yml6LWRvY3VtZW50cy0ke3N0YWdlfS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTogc3RhZ2UgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdEZWxldGVPbGRWZXJzaW9ucycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvbkV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDkwKSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnVHJhbnNpdGlvblRvSUEnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgdHJhbnNpdGlvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuSU5GUkVRVUVOVF9BQ0NFU1MsXG4gICAgICAgICAgICAgIHRyYW5zaXRpb25BZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuR0xBQ0lFUixcbiAgICAgICAgICAgICAgdHJhbnNpdGlvbkFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQ09SUyBjb25maWd1cmF0aW9uIGZvciBkb2N1bWVudCB1cGxvYWRcbiAgICB0aGlzLmRvY3VtZW50QnVja2V0LmFkZENvcnNSdWxlKHtcbiAgICAgIGFsbG93ZWRNZXRob2RzOiBbXG4gICAgICAgIHMzLkh0dHBNZXRob2RzLkdFVCxcbiAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcbiAgICAgICAgczMuSHR0cE1ldGhvZHMuUFVULFxuICAgICAgICBzMy5IdHRwTWV0aG9kcy5ERUxFVEUsXG4gICAgICBdLFxuICAgICAgYWxsb3dlZE9yaWdpbnM6IFsnKiddLCAvLyBSZXBsYWNlIHdpdGggc3BlY2lmaWMgb3JpZ2lucyBpbiBwcm9kdWN0aW9uXG4gICAgICBhbGxvd2VkSGVhZGVyczogWycqJ10sXG4gICAgICBtYXhBZ2U6IDM2MDAsXG4gICAgfSk7XG5cbiAgICAvLyBFdmVudCBub3RpZmljYXRpb24gZm9yIGRvY3VtZW50IHByb2Nlc3NpbmdcbiAgICB0aGlzLmRvY3VtZW50QnVja2V0LmFkZEV2ZW50Tm90aWZpY2F0aW9uKFxuICAgICAgczMuRXZlbnRUeXBlLk9CSkVDVF9DUkVBVEVELFxuICAgICAgbmV3IHRhcmdldHMuU3FzUXVldWUodGhpcy5tZXNzYWdlUXVldWUpXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlU1FTUXVldWVzKHN0YWdlOiBzdHJpbmcpIHtcbiAgICAvLyBEZWFkIGxldHRlciBxdWV1ZSBmb3IgZmFpbGVkIG1lc3NhZ2VzXG4gICAgdGhpcy5kZWFkTGV0dGVyUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdEZWFkTGV0dGVyUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGBnb3ZiaXotZGxxLSR7c3RhZ2V9YCxcbiAgICAgIHJldGVudGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMTQpLFxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5LTVNfTUFOQUdFRCxcbiAgICB9KTtcblxuICAgIC8vIE1haW4gbWVzc2FnZSBxdWV1ZSBmb3IgYXN5bmMgcHJvY2Vzc2luZ1xuICAgIHRoaXMubWVzc2FnZVF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnTWVzc2FnZVF1ZXVlJywge1xuICAgICAgcXVldWVOYW1lOiBgZ292Yml6LW1lc3NhZ2VzLSR7c3RhZ2V9YCxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIHJldGVudGlvbjogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICBlbmNyeXB0aW9uOiBzcXMuUXVldWVFbmNyeXB0aW9uLktNU19NQU5BR0VELFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiB0aGlzLmRlYWRMZXR0ZXJRdWV1ZSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIE9wcG9ydHVuaXR5IHByb2Nlc3NpbmcgcXVldWVcbiAgICBjb25zdCBvcHBvcnR1bml0eVF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnT3Bwb3J0dW5pdHlRdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogYGdvdmJpei1vcHBvcnR1bml0aWVzLSR7c3RhZ2V9YCxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICByZXRlbnRpb246IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5LTVNfTUFOQUdFRCxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogdGhpcy5kZWFkTGV0dGVyUXVldWUsXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBSZXNwb25zZSBnZW5lcmF0aW9uIHF1ZXVlXG4gICAgY29uc3QgcmVzcG9uc2VRdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ1Jlc3BvbnNlUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGBnb3ZiaXotcmVzcG9uc2VzLSR7c3RhZ2V9YCxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxMCksXG4gICAgICByZXRlbnRpb246IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgZW5jcnlwdGlvbjogc3FzLlF1ZXVlRW5jcnlwdGlvbi5LTVNfTUFOQUdFRCxcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xuICAgICAgICBxdWV1ZTogdGhpcy5kZWFkTGV0dGVyUXVldWUsXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBdWRpdCBwcm9jZXNzaW5nIHF1ZXVlXG4gICAgY29uc3QgYXVkaXRRdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ0F1ZGl0UXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGBnb3ZiaXotYXVkaXQtJHtzdGFnZX1gLFxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDIpLFxuICAgICAgcmV0ZW50aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uS01TX01BTkFHRUQsXG4gICAgICBkZWFkTGV0dGVyUXVldWU6IHtcbiAgICAgICAgcXVldWU6IHRoaXMuZGVhZExldHRlclF1ZXVlLFxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDMsXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVTTlNUb3BpY3Moc3RhZ2U6IHN0cmluZykge1xuICAgIC8vIE1haW4gbm90aWZpY2F0aW9uIHRvcGljXG4gICAgdGhpcy5ub3RpZmljYXRpb25Ub3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ05vdGlmaWNhdGlvblRvcGljJywge1xuICAgICAgdG9waWNOYW1lOiBgZ292Yml6LW5vdGlmaWNhdGlvbnMtJHtzdGFnZX1gLFxuICAgICAgZGlzcGxheU5hbWU6ICdHb3ZCaXouYWkgTm90aWZpY2F0aW9ucycsXG4gICAgICBlbmNyeXB0aW9uOiBzbnMuVG9waWNFbmNyeXB0aW9uLktNU19NQU5BR0VELFxuICAgIH0pO1xuXG4gICAgLy8gQWxlcnQgdG9waWMgZm9yIHN5c3RlbSBhbGVydHNcbiAgICBjb25zdCBhbGVydFRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnQWxlcnRUb3BpYycsIHtcbiAgICAgIHRvcGljTmFtZTogYGdvdmJpei1hbGVydHMtJHtzdGFnZX1gLFxuICAgICAgZGlzcGxheU5hbWU6ICdHb3ZCaXouYWkgU3lzdGVtIEFsZXJ0cycsXG4gICAgICBlbmNyeXB0aW9uOiBzbnMuVG9waWNFbmNyeXB0aW9uLktNU19NQU5BR0VELFxuICAgIH0pO1xuXG4gICAgLy8gU3Vic2NyaWJlIFNRUyB0byBTTlMgZm9yIGZhbm91dCBwYXR0ZXJuXG4gICAgdGhpcy5ub3RpZmljYXRpb25Ub3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgICBuZXcgc3Vic2NyaXB0aW9ucy5TcXNTdWJzY3JpcHRpb24odGhpcy5tZXNzYWdlUXVldWUsIHtcbiAgICAgICAgcmF3TWVzc2FnZURlbGl2ZXJ5OiB0cnVlLFxuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVFdmVudEJyaWRnZShzdGFnZTogc3RyaW5nKSB7XG4gICAgLy8gQ3VzdG9tIGV2ZW50IGJ1cyBmb3IgYXBwbGljYXRpb24gZXZlbnRzXG4gICAgdGhpcy5ldmVudEJ1cyA9IG5ldyBldmVudHMuRXZlbnRCdXModGhpcywgJ0V2ZW50QnVzJywge1xuICAgICAgZXZlbnRCdXNOYW1lOiBgZ292Yml6LWV2ZW50cy0ke3N0YWdlfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0dvdkJpei5haSBhcHBsaWNhdGlvbiBldmVudHMnLFxuICAgIH0pO1xuXG4gICAgLy8gQXJjaGl2ZSBmb3IgZXZlbnQgcmVwbGF5XG4gICAgbmV3IGV2ZW50cy5BcmNoaXZlKHRoaXMsICdFdmVudEFyY2hpdmUnLCB7XG4gICAgICBzb3VyY2VFdmVudEJ1czogdGhpcy5ldmVudEJ1cyxcbiAgICAgIGFyY2hpdmVOYW1lOiBgZ292Yml6LWFyY2hpdmUtJHtzdGFnZX1gLFxuICAgICAgcmV0ZW50aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICBkZXNjcmlwdGlvbjogJ0FyY2hpdmUgZm9yIEdvdkJpei5haSBldmVudHMnLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVMYW1iZGFGdW5jdGlvbnMoc3RhZ2U6IHN0cmluZykge1xuICAgIC8vIENvbW1vbiBMYW1iZGEgZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgY29uc3QgY29tbW9uRW52aXJvbm1lbnQgPSB7XG4gICAgICBTVEFHRTogc3RhZ2UsXG4gICAgICBVU0VSX1RBQkxFOiB0aGlzLnVzZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgICBDT05WRVJTQVRJT05fVEFCTEU6IHRoaXMuY29udmVyc2F0aW9uVGFibGUudGFibGVOYW1lLFxuICAgICAgTUVTU0FHRV9UQUJMRTogdGhpcy5tZXNzYWdlVGFibGUudGFibGVOYW1lLFxuICAgICAgT1BQT1JUVU5JVFlfVEFCTEU6IHRoaXMub3Bwb3J0dW5pdHlUYWJsZS50YWJsZU5hbWUsXG4gICAgICBBVURJVF9UQUJMRTogdGhpcy5hdWRpdFRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIERPQ1VNRU5UX0JVQ0tFVDogdGhpcy5kb2N1bWVudEJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgRVZFTlRfQlVTOiB0aGlzLmV2ZW50QnVzLmV2ZW50QnVzTmFtZSxcbiAgICAgIE5PVElGSUNBVElPTl9UT1BJQzogdGhpcy5ub3RpZmljYXRpb25Ub3BpYy50b3BpY0FybixcbiAgICAgIE1FU1NBR0VfUVVFVUU6IHRoaXMubWVzc2FnZVF1ZXVlLnF1ZXVlVXJsLFxuICAgIH07XG5cbiAgICAvLyBDb21tb24gTGFtYmRhIHJvbGUgd2l0aCBuZWNlc3NhcnkgcGVybWlzc2lvbnNcbiAgICBjb25zdCBsYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdMYW1iZGFFeGVjdXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgRHluYW1vREJQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkRlbGV0ZUl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpCYXRjaEdldEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpCYXRjaFdyaXRlSXRlbScsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIHRoaXMudXNlclRhYmxlLnRhYmxlQXJuLFxuICAgICAgICAgICAgICAgIHRoaXMuY29udmVyc2F0aW9uVGFibGUudGFibGVBcm4sXG4gICAgICAgICAgICAgICAgdGhpcy5tZXNzYWdlVGFibGUudGFibGVBcm4sXG4gICAgICAgICAgICAgICAgdGhpcy5vcHBvcnR1bml0eVRhYmxlLnRhYmxlQXJuLFxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaXRUYWJsZS50YWJsZUFybixcbiAgICAgICAgICAgICAgICBgJHt0aGlzLnVzZXJUYWJsZS50YWJsZUFybn0vaW5kZXgvKmAsXG4gICAgICAgICAgICAgICAgYCR7dGhpcy5jb252ZXJzYXRpb25UYWJsZS50YWJsZUFybn0vaW5kZXgvKmAsXG4gICAgICAgICAgICAgICAgYCR7dGhpcy5tZXNzYWdlVGFibGUudGFibGVBcm59L2luZGV4LypgLFxuICAgICAgICAgICAgICAgIGAke3RoaXMub3Bwb3J0dW5pdHlUYWJsZS50YWJsZUFybn0vaW5kZXgvKmAsXG4gICAgICAgICAgICAgICAgYCR7dGhpcy5hdWRpdFRhYmxlLnRhYmxlQXJufS9pbmRleC8qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICBTM1BvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6RGVsZXRlT2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6TGlzdEJ1Y2tldCcsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIHRoaXMuZG9jdW1lbnRCdWNrZXQuYnVja2V0QXJuLFxuICAgICAgICAgICAgICAgIGAke3RoaXMuZG9jdW1lbnRCdWNrZXQuYnVja2V0QXJufS8qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICBFdmVudEJyaWRnZVBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZXZlbnRzOlB1dEV2ZW50cycsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW3RoaXMuZXZlbnRCdXMuZXZlbnRCdXNBcm5dLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICAgIFNOU1BvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnc25zOlB1Ymxpc2gnLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFt0aGlzLm5vdGlmaWNhdGlvblRvcGljLnRvcGljQXJuXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICBTUVNQb2xpY3k6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3NxczpTZW5kTWVzc2FnZScsXG4gICAgICAgICAgICAgICAgJ3NxczpSZWNlaXZlTWVzc2FnZScsXG4gICAgICAgICAgICAgICAgJ3NxczpEZWxldGVNZXNzYWdlJyxcbiAgICAgICAgICAgICAgICAnc3FzOkdldFF1ZXVlQXR0cmlidXRlcycsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIHRoaXMubWVzc2FnZVF1ZXVlLnF1ZXVlQXJuLFxuICAgICAgICAgICAgICAgIHRoaXMuZGVhZExldHRlclF1ZXVlLnF1ZXVlQXJuLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEhhbmRsZXIgTGFtYmRhXG4gICAgY29uc3QgYXBpSGFuZGxlciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0FwaUhhbmRsZXInLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBnb3ZiaXotYXBpLSR7c3RhZ2V9YCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvYXBpJykpLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudmlyb25tZW50LFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICB9KTtcblxuICAgIC8vIE9wcG9ydHVuaXR5IFByb2Nlc3NvciBMYW1iZGFcbiAgICBjb25zdCBvcHBvcnR1bml0eVByb2Nlc3NvciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ09wcG9ydHVuaXR5UHJvY2Vzc29yJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgZ292Yml6LW9wcG9ydHVuaXR5LXByb2Nlc3Nvci0ke3N0YWdlfWAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vbGFtYmRhL29wcG9ydHVuaXR5LXByb2Nlc3NvcicpKSxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudCxcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgIH0pO1xuXG4gICAgLy8gUmVzcG9uc2UgR2VuZXJhdG9yIExhbWJkYVxuICAgIGNvbnN0IHJlc3BvbnNlR2VuZXJhdG9yID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUmVzcG9uc2VHZW5lcmF0b3InLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBnb3ZiaXotcmVzcG9uc2UtZ2VuZXJhdG9yLSR7c3RhZ2V9YCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi9sYW1iZGEvcmVzcG9uc2UtZ2VuZXJhdG9yJykpLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudmlyb25tZW50LFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEwKSxcbiAgICAgIG1lbW9yeVNpemU6IDEwMjQsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgfSk7XG5cbiAgICAvLyBBdWRpdCBQcm9jZXNzb3IgTGFtYmRhXG4gICAgY29uc3QgYXVkaXRQcm9jZXNzb3IgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBdWRpdFByb2Nlc3NvcicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGdvdmJpei1hdWRpdC1wcm9jZXNzb3ItJHtzdGFnZX1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9hdWRpdC1wcm9jZXNzb3InKSksXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnQsXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMiksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgfSk7XG5cbiAgICAvLyBTY2hlZHVsZWQgTGFtYmRhIGZvciBvcHBvcnR1bml0eSBtb25pdG9yaW5nXG4gICAgY29uc3Qgb3Bwb3J0dW5pdHlNb25pdG9yID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnT3Bwb3J0dW5pdHlNb25pdG9yJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgZ292Yml6LW9wcG9ydHVuaXR5LW1vbml0b3ItJHtzdGFnZX1gLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uL2xhbWJkYS9vcHBvcnR1bml0eS1tb25pdG9yJykpLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudmlyb25tZW50LFxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IDEwMjQsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgfSk7XG5cbiAgICAvLyBTdG9yZSBMYW1iZGEgZnVuY3Rpb25zIGZvciBsYXRlciB1c2VcbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYVJlc3RBcGkodGhpcywgJ0FwaUdhdGV3YXknLCB7XG4gICAgICBoYW5kbGVyOiBhcGlIYW5kbGVyLFxuICAgICAgcmVzdEFwaU5hbWU6IGBnb3ZiaXotYXBpLSR7c3RhZ2V9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnR292Qml6LmFpIEFQSSBHYXRld2F5JyxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBzdGFnZSxcbiAgICAgICAgbG9nZ2luZ0xldmVsOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJyxcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxuICAgICAgICAgICdYLUFwaS1LZXknLFxuICAgICAgICAgICdYLUFtei1TZWN1cml0eS1Ub2tlbicsXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVBUElHYXRld2F5KHN0YWdlOiBzdHJpbmcpIHtcbiAgICAvLyBBUEkgR2F0ZXdheSB1c2FnZSBwbGFuXG4gICAgY29uc3QgdXNhZ2VQbGFuID0gdGhpcy5hcGkuYWRkVXNhZ2VQbGFuKCdVc2FnZVBsYW4nLCB7XG4gICAgICBuYW1lOiBgZ292Yml6LXVzYWdlLXBsYW4tJHtzdGFnZX1gLFxuICAgICAgZGVzY3JpcHRpb246ICdVc2FnZSBwbGFuIGZvciBHb3ZCaXouYWkgQVBJJyxcbiAgICAgIHRocm90dGxlOiB7XG4gICAgICAgIHJhdGVMaW1pdDogMTAwMCxcbiAgICAgICAgYnVyc3RMaW1pdDogMjAwMCxcbiAgICAgIH0sXG4gICAgICBxdW90YToge1xuICAgICAgICBsaW1pdDogMTAwMDAsXG4gICAgICAgIHBlcmlvZDogYXBpZ2F0ZXdheS5QZXJpb2QuREFZLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBLZXkgZm9yIGV4dGVybmFsIGludGVncmF0aW9uc1xuICAgIGNvbnN0IGFwaUtleSA9IHRoaXMuYXBpLmFkZEFwaUtleSgnQXBpS2V5Jywge1xuICAgICAgYXBpS2V5TmFtZTogYGdvdmJpei1hcGkta2V5LSR7c3RhZ2V9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIGtleSBmb3IgR292Qml6LmFpJyxcbiAgICB9KTtcblxuICAgIHVzYWdlUGxhbi5hZGRBcGlLZXkoYXBpS2V5KTtcbiAgICB1c2FnZVBsYW4uYWRkQXBpU3RhZ2Uoe1xuICAgICAgc3RhZ2U6IHRoaXMuYXBpLmRlcGxveW1lbnRTdGFnZSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQ2xvdWRXYXRjaEFsYXJtcyhzdGFnZTogc3RyaW5nKSB7XG4gICAgLy8gQVBJIEdhdGV3YXkgZXJyb3IgcmF0ZSBhbGFybVxuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdBcGlFcnJvclJhdGVBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYGdvdmJpei1hcGktZXJyb3ItcmF0ZS0ke3N0YWdlfWAsXG4gICAgICBtZXRyaWM6IHRoaXMuYXBpLm1ldHJpY0NsaWVudEVycm9yKCksXG4gICAgICB0aHJlc2hvbGQ6IDEwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIC8vIER5bmFtb0RCIHJlYWQgdGhyb3R0bGUgYWxhcm1cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnRHluYW1vREJSZWFkVGhyb3R0bGVBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYGdvdmJpei1keW5hbW8tcmVhZC10aHJvdHRsZS0ke3N0YWdlfWAsXG4gICAgICBtZXRyaWM6IHRoaXMudXNlclRhYmxlLm1ldHJpY1VzZXJFcnJvcnMoKSxcbiAgICAgIHRocmVzaG9sZDogNSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgcXVldWUgZGVwdGggYWxhcm1cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnU1FTUXVldWVEZXB0aEFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgZ292Yml6LXNxcy1xdWV1ZS1kZXB0aC0ke3N0YWdlfWAsXG4gICAgICBtZXRyaWM6IHRoaXMubWVzc2FnZVF1ZXVlLm1ldHJpY0FwcHJveGltYXRlTnVtYmVyT2ZWaXNpYmxlTWVzc2FnZXMoKSxcbiAgICAgIHRocmVzaG9sZDogMTAwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlRXZlbnRCcmlkZ2VSdWxlcyhzdGFnZTogc3RyaW5nKSB7XG4gICAgLy8gU2NoZWR1bGUgZm9yIG9wcG9ydHVuaXR5IG1vbml0b3JpbmcgKGV2ZXJ5IDE1IG1pbnV0ZXMpXG4gICAgbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdPcHBvcnR1bml0eU1vbml0b3JSdWxlJywge1xuICAgICAgcnVsZU5hbWU6IGBnb3ZiaXotb3Bwb3J0dW5pdHktbW9uaXRvci0ke3N0YWdlfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NjaGVkdWxlIGZvciBtb25pdG9yaW5nIFNvdXJjZXMgU291Z2h0IG9wcG9ydHVuaXRpZXMnLFxuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5yYXRlKGNkay5EdXJhdGlvbi5taW51dGVzKDE1KSksXG4gICAgICB0YXJnZXRzOiBbXG4gICAgICAgIG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKFxuICAgICAgICAgIGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25OYW1lKFxuICAgICAgICAgICAgdGhpcyxcbiAgICAgICAgICAgICdPcHBvcnR1bml0eU1vbml0b3JUYXJnZXQnLFxuICAgICAgICAgICAgYGdvdmJpei1vcHBvcnR1bml0eS1tb25pdG9yLSR7c3RhZ2V9YFxuICAgICAgICAgIClcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBFdmVudCBydWxlIGZvciBEeW5hbW9EQiBzdHJlYW0gcHJvY2Vzc2luZ1xuICAgIG5ldyBldmVudHMuUnVsZSh0aGlzLCAnRHluYW1vREJTdHJlYW1SdWxlJywge1xuICAgICAgcnVsZU5hbWU6IGBnb3ZiaXotZHluYW1vLXN0cmVhbS0ke3N0YWdlfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2Nlc3MgRHluYW1vREIgc3RyZWFtIGV2ZW50cycsXG4gICAgICBldmVudFBhdHRlcm46IHtcbiAgICAgICAgc291cmNlOiBbJ2F3cy5keW5hbW9kYiddLFxuICAgICAgICBkZXRhaWxUeXBlOiBbJ0R5bmFtb0RCIFN0cmVhbSBSZWNvcmQnXSxcbiAgICAgIH0sXG4gICAgICB0YXJnZXRzOiBbXG4gICAgICAgIG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKFxuICAgICAgICAgIGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25OYW1lKFxuICAgICAgICAgICAgdGhpcyxcbiAgICAgICAgICAgICdBdWRpdFByb2Nlc3NvclRhcmdldCcsXG4gICAgICAgICAgICBgZ292Yml6LWF1ZGl0LXByb2Nlc3Nvci0ke3N0YWdlfWBcbiAgICAgICAgICApXG4gICAgICAgICksXG4gICAgICBdLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVPdXRwdXRzKCkge1xuICAgIC8vIEFQSSBHYXRld2F5IFVSTFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlHYXRld2F5VXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdHb3ZCaXpBcGlVcmwnLFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgdGFibGUgbmFtZXNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclRhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1VzZXIgdGFibGUgbmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnR292Qml6VXNlclRhYmxlJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb252ZXJzYXRpb25UYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5jb252ZXJzYXRpb25UYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvbnZlcnNhdGlvbiB0YWJsZSBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdHb3ZCaXpDb252ZXJzYXRpb25UYWJsZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTWVzc2FnZVRhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLm1lc3NhZ2VUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ01lc3NhZ2UgdGFibGUgbmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnR292Qml6TWVzc2FnZVRhYmxlJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdPcHBvcnR1bml0eVRhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLm9wcG9ydHVuaXR5VGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdPcHBvcnR1bml0eSB0YWJsZSBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdHb3ZCaXpPcHBvcnR1bml0eVRhYmxlJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBdWRpdFRhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmF1ZGl0VGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdBdWRpdCB0YWJsZSBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdHb3ZCaXpBdWRpdFRhYmxlJyxcbiAgICB9KTtcblxuICAgIC8vIFMzIGJ1Y2tldCBuYW1lXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RvY3VtZW50QnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRvY3VtZW50QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RvY3VtZW50IGJ1Y2tldCBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdHb3ZCaXpEb2N1bWVudEJ1Y2tldCcsXG4gICAgfSk7XG5cbiAgICAvLyBFdmVudCBidXMgbmFtZVxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFdmVudEJ1c05hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5ldmVudEJ1cy5ldmVudEJ1c05hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0V2ZW50IGJ1cyBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdHb3ZCaXpFdmVudEJ1cycsXG4gICAgfSk7XG5cbiAgICAvLyBTUVMgcXVldWUgVVJMc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdNZXNzYWdlUXVldWVVcmwnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5tZXNzYWdlUXVldWUucXVldWVVcmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ01lc3NhZ2UgcXVldWUgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdHb3ZCaXpNZXNzYWdlUXVldWUnLFxuICAgIH0pO1xuXG4gICAgLy8gU05TIHRvcGljIEFSTlxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdOb3RpZmljYXRpb25Ub3BpY0FybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLm5vdGlmaWNhdGlvblRvcGljLnRvcGljQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdOb3RpZmljYXRpb24gdG9waWMgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdHb3ZCaXpOb3RpZmljYXRpb25Ub3BpYycsXG4gICAgfSk7XG4gIH1cbn0iXX0=