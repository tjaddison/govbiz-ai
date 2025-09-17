import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as s3notifications from 'aws-cdk-lib/aws-s3-notifications';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

export interface ProcessingStackProps extends cdk.StackProps {
  documentsBucket: s3.Bucket;
  embeddingsBucket: s3.Bucket;
  companiesTable: dynamodb.Table;
}

export class ProcessingStack extends cdk.Stack {
  public documentProcessingQueue: sqs.Queue;
  public profileEmbeddingQueue: sqs.Queue;
  public webScrapingQueue: sqs.Queue;
  public documentProcessingFunction: lambda.Function;
  public webScrapingFunction: lambda.Function;
  public profileEmbeddingFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ProcessingStackProps) {
    super(scope, id, props);

    // Create SQS queues for background processing
    this.createProcessingQueues();

    // Create Lambda functions for document processing
    this.createProcessingLambdaFunctions(props);

    // Set up S3 triggers and event routing
    this.configureEventRouting(props);

    // Grant necessary permissions
    this.configurePermissions(props);
  }

  private createProcessingQueues(): void {
    // Document processing queue
    this.documentProcessingQueue = new sqs.Queue(this, 'govbizai-document-processing-queue', {
      queueName: 'govbizai-document-processing-queue',
      visibilityTimeout: cdk.Duration.minutes(15), // 3x Lambda timeout
      receiveMessageWaitTime: cdk.Duration.seconds(20), // Long polling
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'govbizai-document-processing-dlq', {
          queueName: 'govbizai-document-processing-dlq',
        }),
        maxReceiveCount: 3,
      },
    });

    // Profile embedding queue
    this.profileEmbeddingQueue = new sqs.Queue(this, 'govbizai-profile-embedding-queue', {
      queueName: 'govbizai-profile-embedding-queue',
      visibilityTimeout: cdk.Duration.minutes(15),
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'govbizai-profile-embedding-dlq', {
          queueName: 'govbizai-profile-embedding-dlq',
        }),
        maxReceiveCount: 3,
      },
    });

    // Web scraping queue
    this.webScrapingQueue = new sqs.Queue(this, 'govbizai-web-scraping-queue', {
      queueName: 'govbizai-web-scraping-queue',
      visibilityTimeout: cdk.Duration.minutes(15),
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'govbizai-web-scraping-dlq', {
          queueName: 'govbizai-web-scraping-dlq',
        }),
        maxReceiveCount: 3,
      },
    });
  }

  private createProcessingLambdaFunctions(props: ProcessingStackProps): void {
    // Document Processing Lambda
    this.documentProcessingFunction = new lambda.Function(this, 'govbizai-document-processing', {
      functionName: 'govbizai-document-processing',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromAsset('lambda/document-processing', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          platform: 'linux/amd64',
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024, // Higher memory for document processing
      environment: {
        DOCUMENTS_BUCKET: props.documentsBucket.bucketName,
        EMBEDDINGS_BUCKET: props.embeddingsBucket.bucketName,
        COMPANIES_TABLE: props.companiesTable.tableName,
        PROCESSING_QUEUE_URL: this.profileEmbeddingQueue.queueUrl,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Web Scraping Lambda
    this.webScrapingFunction = new lambda.Function(this, 'govbizai-web-scraping', {
      functionName: 'govbizai-web-scraping',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromAsset('lambda/web-scraping', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          platform: 'linux/amd64',
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        DOCUMENTS_BUCKET: props.documentsBucket.bucketName,
        EMBEDDINGS_BUCKET: props.embeddingsBucket.bucketName,
        COMPANIES_TABLE: props.companiesTable.tableName,
        PROCESSING_QUEUE_URL: this.profileEmbeddingQueue.queueUrl,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Profile Embedding Lambda
    this.profileEmbeddingFunction = new lambda.Function(this, 'govbizai-profile-embedding', {
      functionName: 'govbizai-profile-embedding',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromAsset('lambda/profile-embedding', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          platform: 'linux/amd64',
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      timeout: cdk.Duration.minutes(5),
      memorySize: 768, // Higher memory for embedding generation
      environment: {
        DOCUMENTS_BUCKET: props.documentsBucket.bucketName,
        EMBEDDINGS_BUCKET: props.embeddingsBucket.bucketName,
        COMPANIES_TABLE: props.companiesTable.tableName,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Configure SQS event sources for Lambda functions
    this.documentProcessingFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(this.documentProcessingQueue, {
        batchSize: 1, // Process one document at a time
      })
    );

    this.webScrapingFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(this.webScrapingQueue, {
        batchSize: 1,
      })
    );

    this.profileEmbeddingFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(this.profileEmbeddingQueue, {
        batchSize: 1,
      })
    );
  }

  private configureEventRouting(props: ProcessingStackProps): void {
    // Note: S3 event notifications will be configured in the infrastructure stack
    // to avoid circular dependencies between stacks
    console.log('S3 event routing will be configured in infrastructure stack');
  }

  private configurePermissions(props: ProcessingStackProps): void {
    // Document Processing Function Permissions
    props.documentsBucket.grantReadWrite(this.documentProcessingFunction);
    props.embeddingsBucket.grantReadWrite(this.documentProcessingFunction);
    props.companiesTable.grantReadWriteData(this.documentProcessingFunction);
    this.profileEmbeddingQueue.grantSendMessages(this.documentProcessingFunction);

    // Add Bedrock permissions for document processing
    this.documentProcessingFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
      ],
    }));

    // Add Textract permissions for document processing
    this.documentProcessingFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'textract:DetectDocumentText',
        'textract:StartDocumentTextDetection',
        'textract:GetDocumentTextDetection',
      ],
      resources: ['*'],
    }));

    // Web Scraping Function Permissions
    props.documentsBucket.grantReadWrite(this.webScrapingFunction);
    props.embeddingsBucket.grantReadWrite(this.webScrapingFunction);
    props.companiesTable.grantReadWriteData(this.webScrapingFunction);
    this.profileEmbeddingQueue.grantSendMessages(this.webScrapingFunction);

    // Add Bedrock permissions for web scraping
    this.webScrapingFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
      ],
    }));

    // Profile Embedding Function Permissions
    props.documentsBucket.grantRead(this.profileEmbeddingFunction);
    props.embeddingsBucket.grantReadWrite(this.profileEmbeddingFunction);
    props.companiesTable.grantReadWriteData(this.profileEmbeddingFunction);

    // Add Bedrock permissions for profile embedding
    this.profileEmbeddingFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
      ],
    }));

    // Grant SQS permissions
    this.documentProcessingQueue.grantConsumeMessages(this.documentProcessingFunction);
    this.webScrapingQueue.grantConsumeMessages(this.webScrapingFunction);
    this.profileEmbeddingQueue.grantConsumeMessages(this.profileEmbeddingFunction);

    // Output queue URLs for other stacks to use
    new cdk.CfnOutput(this, 'ProfileEmbeddingQueueUrl', {
      value: this.profileEmbeddingQueue.queueUrl,
      description: 'URL of the Profile Embedding SQS Queue',
      exportName: 'govbizai-profile-embedding-queue-url',
    });

    new cdk.CfnOutput(this, 'WebScrapingQueueUrl', {
      value: this.webScrapingQueue.queueUrl,
      description: 'URL of the Web Scraping SQS Queue',
      exportName: 'govbizai-web-scraping-queue-url',
    });
  }
}