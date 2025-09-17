import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  companiesTable: dynamodb.Table;
  opportunitiesTable: dynamodb.Table;
  matchesTable: dynamodb.Table;
  feedbackTable: dynamodb.Table;
  documentsTable: dynamodb.Table;
  documentsBucket: s3.Bucket;
  embeddingsBucket: s3.Bucket;
}

export class ApiStack extends cdk.Stack {
  public restApi: apigateway.RestApi;
  public webSocketApi: apigatewayv2.WebSocketApi;
  public readonly connectionsTable: dynamodb.Table;
  public apiKey: apigateway.ApiKey;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Create WebSocket connections table
    this.connectionsTable = new dynamodb.Table(this, 'govbizai-websocket-connections', {
      tableName: 'govbizai-websocket-connections',
      partitionKey: { name: 'connection_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create API Gateway infrastructure
    this.createRestApiGateway(props);
    this.createWebSocketApi(props);
  }

  private createRestApiGateway(props: ApiStackProps): void {
    // Create REST API Gateway
    this.restApi = new apigateway.RestApi(this, 'govbizai-rest-api', {
      restApiName: 'govbizai-rest-api',
      description: 'GovBizAI REST API for contract opportunity matching system',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
        allowCredentials: false,
      },
      binaryMediaTypes: ['multipart/form-data'],
      cloudWatchRole: true,
    });

    // Create Cognito Authorizer
    const apiAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'govbizai-api-authorizer', {
      cognitoUserPools: [props.userPool],
      authorizerName: 'govbizai-api-authorizer',
    });

    // Create Lambda functions for API endpoints
    const authLambda = this.createLambdaFunction('auth', props);
    const companyLambda = this.createLambdaFunction('company', props);
    const documentsLambda = this.createLambdaFunction('documents', props);
    const opportunitiesLambda = this.createLambdaFunction('opportunities', props);
    const matchesLambda = this.createLambdaFunction('matches', props);
    const feedbackLambda = this.createLambdaFunction('feedback', props);
    const analyticsLambda = this.createLambdaFunction('analytics', props);

    // Create API resources and methods
    this.createApiEndpoints(authLambda, companyLambda, documentsLambda,
                           opportunitiesLambda, matchesLambda, feedbackLambda,
                           analyticsLambda, apiAuthorizer);

    // Configure Gateway Responses for CORS
    this.configureGatewayResponses();

    // Create Usage Plan and API Key
    this.createApiKeyAndUsagePlan();
  }

  private createLambdaFunction(name: string, props: ApiStackProps): lambda.Function {
    const lambdaFunction = new lambda.Function(this, `govbizai-api-${name}`, {
      functionName: `govbizai-api-${name}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromAsset(`lambda/api/${name}`, {
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
        USER_POOL_ID: props.userPool.userPoolId,
        USER_POOL_CLIENT_ID: props.userPoolClient.userPoolClientId,
        COMPANIES_TABLE: props.companiesTable.tableName,
        OPPORTUNITIES_TABLE: props.opportunitiesTable.tableName,
        MATCHES_TABLE: props.matchesTable.tableName,
        FEEDBACK_TABLE: props.feedbackTable.tableName,
        DOCUMENTS_TABLE: props.documentsTable.tableName,
        DOCUMENTS_BUCKET: props.documentsBucket.bucketName,
        EMBEDDINGS_BUCKET: props.embeddingsBucket.bucketName,
        TENANTS_TABLE_NAME: props.companiesTable.tableName, // Using companies table for tenant data
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant permissions
    props.companiesTable.grantReadWriteData(lambdaFunction);
    props.opportunitiesTable.grantReadWriteData(lambdaFunction);
    props.matchesTable.grantReadWriteData(lambdaFunction);
    props.feedbackTable.grantReadWriteData(lambdaFunction);
    props.documentsTable.grantReadWriteData(lambdaFunction);
    props.documentsBucket.grantReadWrite(lambdaFunction);
    props.embeddingsBucket.grantReadWrite(lambdaFunction);

    // Grant Cognito permissions
    lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:InitiateAuth',
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminGetUser',
        'cognito-idp:GlobalSignOut',
      ],
      resources: [props.userPool.userPoolArn],
    }));

    return lambdaFunction;
  }

  private createApiEndpoints(
    authLambda: lambda.Function,
    companyLambda: lambda.Function,
    documentsLambda: lambda.Function,
    opportunitiesLambda: lambda.Function,
    matchesLambda: lambda.Function,
    feedbackLambda: lambda.Function,
    analyticsLambda: lambda.Function,
    authorizer: apigateway.CognitoUserPoolsAuthorizer
  ): void {
    // Authentication endpoints (no auth required)
    const authResource = this.restApi.root.addResource('auth');
    authResource.addMethod('POST', new apigateway.LambdaIntegration(authLambda));

    // API resource for authenticated endpoints
    const apiResource = this.restApi.root.addResource('api');

    // Company endpoints
    const companyResource = apiResource.addResource('company', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
        allowCredentials: false,
      },
    });
    const profileResource = companyResource.addResource('profile', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
        allowCredentials: false,
      },
    });
    profileResource.addMethod('GET', new apigateway.LambdaIntegration(companyLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    profileResource.addMethod('PUT', new apigateway.LambdaIntegration(companyLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const scrapeResource = companyResource.addResource('scrape-website');
    scrapeResource.addMethod('POST', new apigateway.LambdaIntegration(companyLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Documents endpoints
    const documentsResource = apiResource.addResource('documents');
    documentsResource.addMethod('GET', new apigateway.LambdaIntegration(documentsLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    documentsResource.addMethod('POST', new apigateway.LambdaIntegration(documentsLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const documentIdResource = documentsResource.addResource('{id}');
    documentIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(documentsLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Opportunities endpoints
    const opportunitiesResource = apiResource.addResource('opportunities');
    opportunitiesResource.addMethod('GET', new apigateway.LambdaIntegration(opportunitiesLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const opportunityIdResource = opportunitiesResource.addResource('{id}');
    opportunityIdResource.addMethod('GET', new apigateway.LambdaIntegration(opportunitiesLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const attachmentsResource = opportunityIdResource.addResource('attachments');
    attachmentsResource.addMethod('GET', new apigateway.LambdaIntegration(opportunitiesLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const feedbackResource = opportunityIdResource.addResource('feedback');
    feedbackResource.addMethod('POST', new apigateway.LambdaIntegration(feedbackLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Matches endpoints
    const matchesResource = apiResource.addResource('matches', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
        allowCredentials: false,
      },
    });
    matchesResource.addMethod('GET', new apigateway.LambdaIntegration(matchesLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const matchIdResource = matchesResource.addResource('{id}');
    matchIdResource.addMethod('GET', new apigateway.LambdaIntegration(matchesLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const pursueResource = matchIdResource.addResource('pursue');
    pursueResource.addMethod('POST', new apigateway.LambdaIntegration(matchesLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const outcomeResource = matchIdResource.addResource('outcome');
    outcomeResource.addMethod('POST', new apigateway.LambdaIntegration(matchesLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const matchStatsResource = matchesResource.addResource('stats');
    matchStatsResource.addMethod('GET', new apigateway.LambdaIntegration(matchesLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Analytics endpoints
    const analyticsResource = apiResource.addResource('analytics');

    const dashboardResource = analyticsResource.addResource('dashboard');
    dashboardResource.addMethod('GET', new apigateway.LambdaIntegration(analyticsLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const performanceResource = analyticsResource.addResource('performance');
    performanceResource.addMethod('GET', new apigateway.LambdaIntegration(analyticsLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const trendsResource = analyticsResource.addResource('trends');
    trendsResource.addMethod('GET', new apigateway.LambdaIntegration(analyticsLambda), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
  }

  private configureGatewayResponses(): void {
    // Configure 401 Unauthorized response to include CORS headers
    this.restApi.addGatewayResponse('unauthorizedResponse', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE,PATCH,HEAD'",
      },
    });

    // Configure 403 Forbidden response to include CORS headers
    this.restApi.addGatewayResponse('forbiddenResponse', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE,PATCH,HEAD'",
      },
    });

    // Configure 4XX responses to include CORS headers
    this.restApi.addGatewayResponse('defaultClientErrorResponse', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE,PATCH,HEAD'",
      },
    });
  }

  private createApiKeyAndUsagePlan(): void {
    this.apiKey = new apigateway.ApiKey(this, 'govbizai-api-key', {
      apiKeyName: 'govbizai-api-key',
      description: 'API key for GovBizAI REST API',
    });

    const usagePlan = new apigateway.UsagePlan(this, 'govbizai-api-usage-plan', {
      name: 'govbizai-api-usage-plan',
      description: 'Usage plan for GovBizAI REST API with rate limiting',
      throttle: {
        rateLimit: 1000,
        burstLimit: 2000,
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.DAY,
      },
    });

    usagePlan.addApiStage({
      api: this.restApi,
      stage: this.restApi.deploymentStage,
    });

    usagePlan.addApiKey(this.apiKey);
  }

  private createWebSocketApi(props: ApiStackProps): void {
    // Create WebSocket Lambda function
    const webSocketLambda = new lambda.Function(this, 'govbizai-websocket', {
      functionName: 'govbizai-websocket',
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromAsset('lambda/websocket'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        CONNECTIONS_TABLE: this.connectionsTable.tableName,
        COMPANIES_TABLE: props.companiesTable.tableName,
        OPPORTUNITIES_TABLE: props.opportunitiesTable.tableName,
        MATCHES_TABLE: props.matchesTable.tableName,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant permissions to WebSocket Lambda
    this.connectionsTable.grantReadWriteData(webSocketLambda);
    props.companiesTable.grantReadData(webSocketLambda);
    props.opportunitiesTable.grantReadData(webSocketLambda);
    props.matchesTable.grantReadData(webSocketLambda);

    // Create WebSocket API
    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'govbizai-websocket-api', {
      apiName: 'govbizai-websocket-api',
      description: 'GovBizAI WebSocket API for real-time notifications',
    });

    // Create WebSocket integrations
    const webSocketIntegration = new apigatewayv2_integrations.WebSocketLambdaIntegration(
      'WebSocketIntegration',
      webSocketLambda
    );

    // Add routes
    this.webSocketApi.addRoute('$connect', {
      integration: webSocketIntegration,
    });

    this.webSocketApi.addRoute('$disconnect', {
      integration: webSocketIntegration,
    });

    this.webSocketApi.addRoute('ping', {
      integration: webSocketIntegration,
    });

    this.webSocketApi.addRoute('subscribe', {
      integration: webSocketIntegration,
    });

    this.webSocketApi.addRoute('unsubscribe', {
      integration: webSocketIntegration,
    });

    // Create WebSocket stage
    new apigatewayv2.WebSocketStage(this, 'govbizai-websocket-stage', {
      webSocketApi: this.webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Grant WebSocket API permissions
    webSocketLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/*`,
      ],
    }));
  }
}