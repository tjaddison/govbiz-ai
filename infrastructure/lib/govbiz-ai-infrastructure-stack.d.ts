import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as sns from 'aws-cdk-lib/aws-sns';
export interface GovBizAiInfrastructureStackProps extends cdk.StackProps {
    stage: string;
}
export declare class GovBizAiInfrastructureStack extends cdk.Stack {
    readonly userTable: dynamodb.Table;
    readonly conversationTable: dynamodb.Table;
    readonly messageTable: dynamodb.Table;
    readonly opportunityTable: dynamodb.Table;
    readonly auditTable: dynamodb.Table;
    readonly documentBucket: s3.Bucket;
    readonly eventBus: events.EventBus;
    readonly deadLetterQueue: sqs.Queue;
    readonly messageQueue: sqs.Queue;
    readonly notificationTopic: sns.Topic;
    readonly api: apigateway.RestApi;
    constructor(scope: Construct, id: string, props: GovBizAiInfrastructureStackProps);
    private createDynamoDBTables;
    private createS3Buckets;
    private createSQSQueues;
    private createSNSTopics;
    private createEventBridge;
    private createLambdaFunctions;
    private createAPIGateway;
    private createCloudWatchAlarms;
    private createEventBridgeRules;
    private createOutputs;
}
