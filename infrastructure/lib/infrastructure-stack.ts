import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as sqs from 'aws-cdk-lib/aws-sqs';
// API Gateway imports kept for other APIs in this stack
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
// import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
// import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as path from 'path';

export class InfrastructureStack extends cdk.Stack {
  // VPC removed for cost optimization
  public readonly rawDocumentsBucket: s3.Bucket;
  public readonly processedDocumentsBucket: s3.Bucket;
  public readonly embeddingsBucket: s3.Bucket;
  public readonly tempProcessingBucket: s3.Bucket;
  public readonly archiveBucket: s3.Bucket;
  public readonly opportunitiesTable: dynamodb.Table;
  public readonly companiesTable: dynamodb.Table;
  public readonly matchesTable: dynamodb.Table;
  public readonly userProfilesTable: dynamodb.Table;
  public readonly auditLogTable: dynamodb.Table;
  public readonly feedbackTable: dynamodb.Table;
  public readonly tenantsTable: dynamodb.Table;
  public userPool: cognito.UserPool;
  public userPoolClient: cognito.UserPoolClient;
  public identityPool: cognito.CfnIdentityPool;
  // Moved to ApiStack to avoid CloudFormation resource limits
  // public restApi: apigateway.RestApi;
  // public webSocketApi: apigatewayv2.WebSocketApi;
  // public connectionsTable: dynamodb.Table;
  public readonly kmsKey: kms.Key;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create KMS key for encryption
    this.kmsKey = new kms.Key(this, 'govbizai-encryption-key', {
      alias: 'govbizai-encryption-key',
      description: 'KMS key for GovBizAI system encryption',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev environment
    });

    // Add policy to allow CloudWatch Logs to use the KMS key
    this.kmsKey.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`)],
      actions: [
        'kms:Encrypt',
        'kms:Decrypt',
        'kms:ReEncrypt*',
        'kms:GenerateDataKey*',
        'kms:DescribeKey'
      ],
      resources: ['*'],
      conditions: {
        ArnEquals: {
          'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/cloudtrail/govbizai`
        }
      }
    }));

    // Add policy to allow CloudTrail to use the KMS key
    this.kmsKey.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal(`cloudtrail.amazonaws.com`)],
      actions: [
        'kms:Encrypt',
        'kms:Decrypt',
        'kms:ReEncrypt*',
        'kms:GenerateDataKey*',
        'kms:DescribeKey'
      ],
      resources: ['*']
    }));

    // VPC removed for cost optimization - Lambda functions will use AWS managed VPC

    // VPC endpoints removed for cost optimization - Lambda functions will use public AWS endpoints

    // 3. Create S3 Buckets with encryption and lifecycle policies
    const s3BucketProps: Partial<s3.BucketProps> = {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.kmsKey,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev environment
      autoDeleteObjects: true, // For dev environment
    };

    this.rawDocumentsBucket = new s3.Bucket(this, 'govbizai-raw-documents', {
      bucketName: `govbizai-raw-documents-${this.account}-${this.region}`,
      ...s3BucketProps,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: [
            'https://d21w4wbdrthfbu.cloudfront.net', // CloudFront domain
            'http://localhost:3000', // Local development
          ],
          allowedHeaders: ['*'],
          exposedHeaders: [
            'ETag',
            'x-amz-server-side-encryption',
            'x-amz-server-side-encryption-aws-kms-key-id',
            'x-amz-request-id',
            'x-amz-id-2',
          ],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          id: 'govbizai-raw-documents-lifecycle',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30)
            },
            {
              storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: cdk.Duration.days(90)
            }
          ]
        }
      ]
    });

    // Remove explicit bucket policy - presigned URLs work through IAM role permissions
    // The CDK grantReadWrite method already provides proper IAM permissions for Lambda functions
    // Adding a bucket policy restricts access and conflicts with presigned URL functionality

    // Remove the restrictive bucket policy that blocks presigned URLs from browsers
    // Presigned URLs work by embedding credentials in the URL, so we don't need this policy

    this.processedDocumentsBucket = new s3.Bucket(this, 'govbizai-processed-documents', {
      bucketName: `govbizai-processed-documents-${this.account}-${this.region}`,
      ...s3BucketProps,
      lifecycleRules: [
        {
          id: 'govbizai-processed-documents-lifecycle',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30)
            },
            {
              storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: cdk.Duration.days(90)
            }
          ]
        }
      ]
    });

    this.embeddingsBucket = new s3.Bucket(this, 'govbizai-embeddings', {
      bucketName: `govbizai-embeddings-${this.account}-${this.region}`,
      ...s3BucketProps,
      lifecycleRules: [
        {
          id: 'govbizai-embeddings-lifecycle',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(60)
            }
          ]
        }
      ]
    });

    this.tempProcessingBucket = new s3.Bucket(this, 'govbizai-temp-processing', {
      bucketName: `govbizai-temp-processing-${this.account}-${this.region}`,
      ...s3BucketProps,
      lifecycleRules: [
        {
          id: 'govbizai-temp-processing-lifecycle',
          enabled: true,
          expiration: cdk.Duration.days(7)
        }
      ]
    });

    this.archiveBucket = new s3.Bucket(this, 'govbizai-archive', {
      bucketName: `govbizai-archive-${this.account}-${this.region}`,
      ...s3BucketProps,
      lifecycleRules: [
        {
          id: 'govbizai-archive-lifecycle',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: cdk.Duration.days(1)
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(180) // Must be at least 90 days after Glacier IR
            }
          ]
        }
      ]
    });

    // 4. Create DynamoDB Tables
    const dynamoDbProps: Partial<dynamodb.TableProps> = {
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.kmsKey,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev environment
    };

    // Opportunities Table
    this.opportunitiesTable = new dynamodb.Table(this, 'govbizai-opportunities', {
      tableName: 'govbizai-opportunities',
      partitionKey: {
        name: 'notice_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'posted_date',
        type: dynamodb.AttributeType.STRING
      },
      ...dynamoDbProps,
    });

    // Add GSIs for opportunities table
    this.opportunitiesTable.addGlobalSecondaryIndex({
      indexName: 'archive-date-index',
      partitionKey: {
        name: 'archive_date',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'posted_date',
        type: dynamodb.AttributeType.STRING
      }
    });

    this.opportunitiesTable.addGlobalSecondaryIndex({
      indexName: 'naics-code-index',
      partitionKey: {
        name: 'naics_code',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'posted_date',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Companies Table
    this.companiesTable = new dynamodb.Table(this, 'govbizai-companies', {
      tableName: 'govbizai-companies',
      partitionKey: {
        name: 'company_id',
        type: dynamodb.AttributeType.STRING
      },
      ...dynamoDbProps,
    });

    // Add GSI for companies table
    this.companiesTable.addGlobalSecondaryIndex({
      indexName: 'tenant-id-index',
      partitionKey: {
        name: 'tenant_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'company_name',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Matches Table
    this.matchesTable = new dynamodb.Table(this, 'govbizai-matches', {
      tableName: 'govbizai-matches',
      partitionKey: {
        name: 'company_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'opportunity_id',
        type: dynamodb.AttributeType.STRING
      },
      ...dynamoDbProps,
    });

    // Add GSIs for matches table
    this.matchesTable.addGlobalSecondaryIndex({
      indexName: 'opportunity-id-index',
      partitionKey: {
        name: 'opportunity_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'total_score',
        type: dynamodb.AttributeType.NUMBER
      }
    });

    this.matchesTable.addGlobalSecondaryIndex({
      indexName: 'confidence-level-index',
      partitionKey: {
        name: 'confidence_level',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'total_score',
        type: dynamodb.AttributeType.NUMBER
      }
    });

    this.matchesTable.addGlobalSecondaryIndex({
      indexName: 'company-confidence-index',
      partitionKey: {
        name: 'company_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'confidence_level',
        type: dynamodb.AttributeType.STRING
      }
    });

    // User Profiles Table
    this.userProfilesTable = new dynamodb.Table(this, 'govbizai-user-profiles', {
      tableName: 'govbizai-user-profiles',
      partitionKey: {
        name: 'user_id',
        type: dynamodb.AttributeType.STRING
      },
      ...dynamoDbProps,
    });

    // Add GSI for user profiles table
    this.userProfilesTable.addGlobalSecondaryIndex({
      indexName: 'tenant-id-index',
      partitionKey: {
        name: 'tenant_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'email',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Audit Log Table
    this.auditLogTable = new dynamodb.Table(this, 'govbizai-audit-log', {
      tableName: 'govbizai-audit-log',
      partitionKey: {
        name: 'tenant_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING
      },
      ...dynamoDbProps,
      timeToLiveAttribute: 'ttl', // For automatic cleanup
    });

    // Add GSI for audit log table
    this.auditLogTable.addGlobalSecondaryIndex({
      indexName: 'action-type-index',
      partitionKey: {
        name: 'action_type',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Feedback Table
    this.feedbackTable = new dynamodb.Table(this, 'govbizai-feedback', {
      tableName: 'govbizai-feedback',
      partitionKey: {
        name: 'match_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'feedback_timestamp',
        type: dynamodb.AttributeType.STRING
      },
      ...dynamoDbProps,
    });

    // Add GSI for feedback table
    this.feedbackTable.addGlobalSecondaryIndex({
      indexName: 'company-id-index',
      partitionKey: {
        name: 'company_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'feedback_timestamp',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Tenants Table
    this.tenantsTable = new dynamodb.Table(this, 'govbizai-tenants', {
      tableName: 'govbizai-tenants',
      partitionKey: {
        name: 'tenant_id',
        type: dynamodb.AttributeType.STRING
      },
      ...dynamoDbProps,
    });

    // Add GSI for tenants table
    this.tenantsTable.addGlobalSecondaryIndex({
      indexName: 'tenant-name-index',
      partitionKey: {
        name: 'tenant_name',
        type: dynamodb.AttributeType.STRING
      }
    });

    this.tenantsTable.addGlobalSecondaryIndex({
      indexName: 'subscription-tier-index',
      partitionKey: {
        name: 'subscription_tier',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'created_at',
        type: dynamodb.AttributeType.STRING
      }
    });

    // 5. Create CloudTrail for audit logging
    const cloudTrailLogGroup = new logs.LogGroup(this, 'govbizai-cloudtrail-log-group', {
      logGroupName: '/aws/cloudtrail/govbizai',
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev environment
    });

    new cloudtrail.Trail(this, 'govbizai-cloudtrail', {
      trailName: 'govbizai-cloudtrail',
      sendToCloudWatchLogs: true,
      cloudWatchLogGroup: cloudTrailLogGroup,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
      enableFileValidation: true,
    });

    // 6. Create Cognito User Pool for authentication
    this.setupAuthentication();

    // 7. Create tenant management Lambda functions
    this.createTenantManagementFunctions();

    // 8. Create document processing Lambda functions
    this.createDocumentProcessingFunctions();

    // 9. Create IAM roles and policies
    this.createIAMRoles();

    // 10. Create embedding generation and vector storage infrastructure
    // this.createEmbeddingInfrastructure(); // Temporarily commented out to resolve circular dependency

    // 11. Create SAM.gov integration infrastructure
    this.createSamGovInfrastructure();

    // 12. Create Phase 6: Company Profile Management Functions
    this.createCompanyProfileManagementFunctions();

    // 13. Create Phase 7: Matching Engine Functions
    this.createMatchingEngineFunctions();

    // 14. Create Phase 10: API Gateway Infrastructure
    // Moved to separate ApiStack to avoid CloudFormation resource limits
    // this.createApiGatewayInfrastructure();

    // Tag all resources with govbizai prefix
    cdk.Tags.of(this).add('Project', 'govbizai');
    cdk.Tags.of(this).add('Environment', 'dev');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }

  private setupAuthentication(): void {
    // Create Cognito User Pool with custom attributes
    this.userPool = new cognito.UserPool(this, 'govbizai-user-pool', {
      userPoolName: 'govbizai-user-pool',
      selfSignUpEnabled: true,
      userVerification: {
        emailSubject: 'Welcome to GovBizAI - Verify your email',
        emailBody: 'Thank you for signing up to GovBizAI! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      signInAliases: {
        email: true,
        username: false,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      customAttributes: {
        company_id: new cognito.StringAttribute({
          mutable: true,
        }),
        tenant_id: new cognito.StringAttribute({
          mutable: true,
        }),
        role: new cognito.StringAttribute({
          mutable: true,
        }),
        subscription_tier: new cognito.StringAttribute({
          mutable: true,
        }),
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: true,
          mutable: true,
        },
        phoneNumber: {
          required: false,
          mutable: true,
        },
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev environment
    });

    // Configure Google OAuth Identity Provider (disabled for now until credentials are configured)
    /*
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'govbizai-google-provider', {
      userPool: this.userPool,
      clientId: '', // To be configured later via environment variables or Parameter Store
      clientSecret: '', // To be configured later via environment variables or Parameter Store
      scopes: ['openid', 'email', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
      },
    });
    */

    // Create User Pool Domain
    const userPoolDomain = new cognito.UserPoolDomain(this, 'govbizai-user-pool-domain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: `govbizai-${this.account}`,
      },
    });

    // Create User Pool Client for web application
    this.userPoolClient = new cognito.UserPoolClient(this, 'govbizai-user-pool-client', {
      userPool: this.userPool,
      userPoolClientName: 'govbizai-web-client',
      generateSecret: false, // For SPA applications
      authFlows: {
        userSrp: true,
        userPassword: false, // Disable admin-initiated auth for security
        custom: false,
        adminUserPassword: false,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false, // Disabled for security
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'http://localhost:3000/auth/callback', // For local development
          'http://localhost:3001/auth/callback', // For local development - alternate port
          'https://d21w4wbdrthfbu.cloudfront.net/auth/callback', // Production CloudFront URL
          'https://app.govbizai.com/auth/callback', // Future custom domain URL placeholder
        ],
        logoutUrls: [
          'http://localhost:3000/', // For local development - redirect to home after logout
          'http://localhost:3001/', // For local development - alternate port
          'https://d21w4wbdrthfbu.cloudfront.net/', // Production CloudFront URL - redirect to home after logout
          'https://app.govbizai.com/', // Future custom domain URL placeholder - redirect to home after logout
        ],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          givenName: true,
          familyName: true,
          phoneNumber: true,
        })
        .withCustomAttributes('company_id', 'tenant_id', 'role', 'subscription_tier'),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          givenName: true,
          familyName: true,
          phoneNumber: true,
        })
        .withCustomAttributes('company_id', 'tenant_id', 'role', 'subscription_tier'),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    });

    // Cognito UI customization temporarily disabled due to AWS restrictions
    // Can be re-enabled later with proper CSS classes

    // Ensure Google provider is created before the client (disabled for now)
    // this.userPoolClient.node.addDependency(googleProvider);

    // Create Identity Pool for federated identities
    this.identityPool = new cognito.CfnIdentityPool(this, 'govbizai-identity-pool', {
      identityPoolName: 'govbizai-identity-pool',
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
          serverSideTokenCheck: true,
        },
      ],
    });

    // Create IAM roles for authenticated users
    const authenticatedRole = new iam.Role(this, 'govbizai-cognito-authenticated-role', {
      roleName: 'govbizai-cognito-authenticated-role',
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        'govbizai-authenticated-user-policy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-identity:GetCredentialsForIdentity',
                'cognito-identity:GetId',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
              ],
              resources: [
                `${this.rawDocumentsBucket.bucketArn}/\${cognito-identity.amazonaws.com:sub}/*`,
                `${this.processedDocumentsBucket.bucketArn}/\${cognito-identity.amazonaws.com:sub}/*`,
              ],
              conditions: {
                StringEquals: {
                  's3:x-amz-acl': 'bucket-owner-full-control',
                },
              },
            }),
          ],
        }),
      },
    });

    // Attach the role to the identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'govbizai-identity-pool-role-attachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    // Output Cognito configuration for use in applications
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'govbizai-user-pool-id',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'govbizai-user-pool-client-id',
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: 'govbizai-identity-pool-id',
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: userPoolDomain.domainName,
      description: 'Cognito User Pool Domain',
      exportName: 'govbizai-user-pool-domain',
    });
  }

  private createTenantManagementFunctions(): void {
    // Create Lambda layer for common dependencies
    const commonLayer = new lambda.LayerVersion(this, 'govbizai-common-layer', {
      layerVersionName: 'govbizai-common-layer',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-layers/common')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Common dependencies for GovBizAI Lambda functions',
    });

    // Tenant Management Lambda Functions
    const tenantFunctionProps = {
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TENANTS_TABLE_NAME: this.tenantsTable.tableName,
        USER_PROFILES_TABLE_NAME: this.userProfilesTable.tableName,
        AUDIT_LOG_TABLE_NAME: this.auditLogTable.tableName,
        COMPANIES_TABLE_NAME: this.companiesTable.tableName,
      },
      layers: [commonLayer],
      // VPC removed for cost optimization
    };

    // Create Tenant Function
    const createTenantFunction = new lambda.Function(this, 'govbizai-create-tenant', {
      functionName: 'govbizai-create-tenant',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/tenant-management/create-tenant')),
      handler: 'handler.lambda_handler',
      description: 'Creates a new tenant with company profile',
      ...tenantFunctionProps,
    });

    // Update Tenant Function
    const updateTenantFunction = new lambda.Function(this, 'govbizai-update-tenant', {
      functionName: 'govbizai-update-tenant',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/tenant-management/update-tenant')),
      handler: 'handler.lambda_handler',
      description: 'Updates tenant information and settings',
      ...tenantFunctionProps,
    });

    // Delete Tenant Function
    const deleteTenantFunction = new lambda.Function(this, 'govbizai-delete-tenant', {
      functionName: 'govbizai-delete-tenant',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/tenant-management/delete-tenant')),
      handler: 'handler.lambda_handler',
      description: 'Deletes tenant and all associated data',
      ...tenantFunctionProps,
    });

    // Get Tenant Function
    const getTenantFunction = new lambda.Function(this, 'govbizai-get-tenant', {
      functionName: 'govbizai-get-tenant',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/tenant-management/get-tenant')),
      handler: 'handler.lambda_handler',
      description: 'Retrieves tenant details and configuration',
      ...tenantFunctionProps,
    });

    // User Registration Post-Confirmation Trigger
    const postConfirmationFunction = new lambda.Function(this, 'govbizai-post-confirmation', {
      functionName: 'govbizai-post-confirmation',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/cognito-triggers/post-confirmation')),
      handler: 'handler.lambda_handler',
      description: 'Post-confirmation trigger for user registration',
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TENANTS_TABLE_NAME: this.tenantsTable.tableName,
        USER_PROFILES_TABLE_NAME: this.userProfilesTable.tableName,
        AUDIT_LOG_TABLE_NAME: this.auditLogTable.tableName,
        COMPANIES_TABLE_NAME: this.companiesTable.tableName,
      },
      layers: [commonLayer],
    });

    // Pre-Sign-Up Trigger for domain validation
    const preSignUpFunction = new lambda.Function(this, 'govbizai-pre-sign-up', {
      functionName: 'govbizai-pre-sign-up',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/cognito-triggers/pre-sign-up')),
      handler: 'handler.lambda_handler',
      description: 'Pre-sign-up trigger for user validation',
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        TENANTS_TABLE_NAME: this.tenantsTable.tableName,
        USER_PROFILES_TABLE_NAME: this.userProfilesTable.tableName,
        AUDIT_LOG_TABLE_NAME: this.auditLogTable.tableName,
        COMPANIES_TABLE_NAME: this.companiesTable.tableName,
      },
      layers: [commonLayer],
    });

    // Grant permissions to tenant management functions
    [createTenantFunction, updateTenantFunction, deleteTenantFunction, getTenantFunction].forEach(func => {
      this.tenantsTable.grantReadWriteData(func);
      this.userProfilesTable.grantReadWriteData(func);
      this.auditLogTable.grantWriteData(func);
      this.companiesTable.grantReadWriteData(func);
    });

    // Grant permissions to Cognito trigger functions
    [postConfirmationFunction, preSignUpFunction].forEach(func => {
      this.tenantsTable.grantReadWriteData(func);
      this.userProfilesTable.grantReadWriteData(func);
      this.auditLogTable.grantWriteData(func);
    });

    // Add Cognito triggers
    this.userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, postConfirmationFunction);
    this.userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, preSignUpFunction);

    // Output Lambda function ARNs
    new cdk.CfnOutput(this, 'CreateTenantFunctionArn', {
      value: createTenantFunction.functionArn,
      description: 'ARN of the Create Tenant Lambda function',
      exportName: 'govbizai-create-tenant-function-arn',
    });

    new cdk.CfnOutput(this, 'UpdateTenantFunctionArn', {
      value: updateTenantFunction.functionArn,
      description: 'ARN of the Update Tenant Lambda function',
      exportName: 'govbizai-update-tenant-function-arn',
    });

    new cdk.CfnOutput(this, 'DeleteTenantFunctionArn', {
      value: deleteTenantFunction.functionArn,
      description: 'ARN of the Delete Tenant Lambda function',
      exportName: 'govbizai-delete-tenant-function-arn',
    });

    new cdk.CfnOutput(this, 'GetTenantFunctionArn', {
      value: getTenantFunction.functionArn,
      description: 'ARN of the Get Tenant Lambda function',
      exportName: 'govbizai-get-tenant-function-arn',
    });
  }

  // VPC security group method removed for cost optimization

  private createIAMRoles(): void {
    // Lambda execution role for document processing
    const lambdaExecutionRole = new iam.Role(this, 'govbizai-lambda-execution-role', {
      roleName: 'govbizai-lambda-execution-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        // VPC access role removed for cost optimization
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        'govbizai-lambda-policy': new iam.PolicyDocument({
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
                this.rawDocumentsBucket.bucketArn,
                `${this.rawDocumentsBucket.bucketArn}/*`,
                this.processedDocumentsBucket.bucketArn,
                `${this.processedDocumentsBucket.bucketArn}/*`,
                this.embeddingsBucket.bucketArn,
                `${this.embeddingsBucket.bucketArn}/*`,
                this.tempProcessingBucket.bucketArn,
                `${this.tempProcessingBucket.bucketArn}/*`,
              ],
            }),
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
                this.opportunitiesTable.tableArn,
                `${this.opportunitiesTable.tableArn}/index/*`,
                this.companiesTable.tableArn,
                `${this.companiesTable.tableArn}/index/*`,
                this.matchesTable.tableArn,
                `${this.matchesTable.tableArn}/index/*`,
                this.userProfilesTable.tableArn,
                `${this.userProfilesTable.tableArn}/index/*`,
                this.auditLogTable.tableArn,
                `${this.auditLogTable.tableArn}/index/*`,
                this.feedbackTable.tableArn,
                `${this.feedbackTable.tableArn}/index/*`,
                this.tenantsTable.tableArn,
                `${this.tenantsTable.tableArn}/index/*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
              ],
              resources: [
                `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'textract:StartDocumentTextDetection',
                'textract:GetDocumentTextDetection',
                'textract:StartDocumentAnalysis',
                'textract:GetDocumentAnalysis',
              ],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-idp:AdminGetUser',
                'cognito-idp:AdminUpdateUserAttributes',
                'cognito-idp:AdminSetUserPassword',
                'cognito-idp:AdminCreateUser',
                'cognito-idp:AdminDeleteUser',
                'cognito-idp:ListUsers',
              ],
              resources: [this.userPool.userPoolArn],
            }),
          ],
        }),
      },
    });

    // Step Functions execution role
    const stepFunctionsExecutionRole = new iam.Role(this, 'govbizai-step-functions-role', {
      roleName: 'govbizai-step-functions-role',
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      inlinePolicies: {
        'govbizai-step-functions-policy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'lambda:InvokeFunction',
              ],
              resources: [`arn:aws:lambda:${this.region}:${this.account}:function:govbizai-*`],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [`arn:aws:logs:${this.region}:${this.account}:*`],
            }),
          ],
        }),
      },
    });

    // EventBridge execution role
    const eventBridgeExecutionRole = new iam.Role(this, 'govbizai-eventbridge-role', {
      roleName: 'govbizai-eventbridge-role',
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
      inlinePolicies: {
        'govbizai-eventbridge-policy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'states:StartExecution',
              ],
              resources: [`arn:aws:states:${this.region}:${this.account}:stateMachine:govbizai-*`],
            }),
          ],
        }),
      },
    });

    // Output role ARNs for use in other stacks
    new cdk.CfnOutput(this, 'LambdaExecutionRoleArn', {
      value: lambdaExecutionRole.roleArn,
      description: 'ARN of the Lambda execution role',
      exportName: 'govbizai-lambda-execution-role-arn',
    });

    new cdk.CfnOutput(this, 'StepFunctionsExecutionRoleArn', {
      value: stepFunctionsExecutionRole.roleArn,
      description: 'ARN of the Step Functions execution role',
      exportName: 'govbizai-step-functions-execution-role-arn',
    });

    new cdk.CfnOutput(this, 'EventBridgeExecutionRoleArn', {
      value: eventBridgeExecutionRole.roleArn,
      description: 'ARN of the EventBridge execution role',
      exportName: 'govbizai-eventbridge-execution-role-arn',
    });
  }

  private createDocumentProcessingFunctions(): void {
    // Create Lambda layer for document processing dependencies
    const documentProcessingLayer = new lambda.LayerVersion(this, 'govbizai-document-processing-layer', {
      layerVersionName: 'govbizai-document-processing-layer',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-layers/document-processing')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Document processing dependencies including PyMuPDF, python-docx, openpyxl, etc.',
    });

    // Common Lambda function properties for document processing
    const documentProcessingFunctionProps = {
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        RAW_DOCUMENTS_BUCKET: this.rawDocumentsBucket.bucketName,
        PROCESSED_DOCUMENTS_BUCKET: this.processedDocumentsBucket.bucketName,
        TEMP_PROCESSING_BUCKET: this.tempProcessingBucket.bucketName,
        COMPANIES_TABLE: this.companiesTable.tableName,
        TEXTRACT_ROLE_ARN: `arn:aws:iam::${this.account}:role/govbizai-lambda-execution-role`,
      },
      layers: [documentProcessingLayer],
      // VPC removed for cost optimization
    };

    // 1. Text Extraction Function (PyMuPDF)
    const textExtractionFunction = new lambda.Function(this, 'govbizai-text-extraction', {
      functionName: 'govbizai-text-extraction',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/document-processing/text-extraction')),
      handler: 'handler.lambda_handler',
      description: 'Extract text from PDF documents using PyMuPDF with Textract fallback',
      ...documentProcessingFunctionProps,
    });

    // 2. Textract Processor Function
    const textractProcessorFunction = new lambda.Function(this, 'govbizai-textract-processor', {
      functionName: 'govbizai-textract-processor',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/document-processing/textract-processor')),
      handler: 'handler.lambda_handler',
      description: 'Process documents using Amazon Textract for scanned/image PDFs',
      ...documentProcessingFunctionProps,
    });

    // 3. Text Cleaner Function
    const textCleanerFunction = new lambda.Function(this, 'govbizai-text-cleaner', {
      functionName: 'govbizai-text-cleaner',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/document-processing/text-cleaner')),
      handler: 'handler.lambda_handler',
      description: 'Clean and normalize extracted text from documents',
      ...documentProcessingFunctionProps,
      timeout: cdk.Duration.minutes(10), // Shorter timeout for text cleaning
      memorySize: 512,
    });

    // 4. Document Chunker Function
    const documentChunkerFunction = new lambda.Function(this, 'govbizai-document-chunker', {
      functionName: 'govbizai-document-chunker',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/document-processing/document-chunker')),
      handler: 'handler.lambda_handler',
      description: 'Chunk documents into manageable segments for embedding generation',
      ...documentProcessingFunctionProps,
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
    });

    // 5. File Handlers Function
    const fileHandlersFunction = new lambda.Function(this, 'govbizai-file-handlers', {
      functionName: 'govbizai-file-handlers',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/document-processing/file-handlers')),
      handler: 'handler.lambda_handler',
      description: 'Handle text extraction from various file formats (Word, Excel, Text, HTML)',
      ...documentProcessingFunctionProps,
      environment: {
        ...documentProcessingFunctionProps.environment,
        TEXT_EXTRACTION_FUNCTION: textExtractionFunction.functionName,
      },
    });

    // 6. Unified Processor Function (Orchestrator)
    const unifiedProcessorFunction = new lambda.Function(this, 'govbizai-unified-processor', {
      functionName: 'govbizai-unified-processor',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/document-processing/unified-processor')),
      handler: 'handler.lambda_handler',
      description: 'Unified interface for orchestrating the complete document processing pipeline',
      ...documentProcessingFunctionProps,
      timeout: cdk.Duration.minutes(5), // Orchestrator doesn't do heavy processing
      environment: {
        ...documentProcessingFunctionProps.environment,
        FILE_HANDLERS_FUNCTION: fileHandlersFunction.functionName,
        TEXT_EXTRACTION_FUNCTION: textExtractionFunction.functionName,
        TEXTRACT_PROCESSOR_FUNCTION: textractProcessorFunction.functionName,
        TEXT_CLEANER_FUNCTION: textCleanerFunction.functionName,
        DOCUMENT_CHUNKER_FUNCTION: documentChunkerFunction.functionName,
      },
    });

    // Grant S3 permissions to all document processing functions
    const documentProcessingFunctions = [
      textExtractionFunction,
      textractProcessorFunction,
      textCleanerFunction,
      documentChunkerFunction,
      fileHandlersFunction,
      unifiedProcessorFunction,
    ];

    documentProcessingFunctions.forEach(func => {
      // S3 permissions
      this.rawDocumentsBucket.grantRead(func);
      this.processedDocumentsBucket.grantReadWrite(func);
      this.tempProcessingBucket.grantReadWrite(func);

      // DynamoDB permissions
      this.companiesTable.grantReadData(func);

      // Textract permissions
      func.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'textract:StartDocumentTextDetection',
          'textract:GetDocumentTextDetection',
          'textract:StartDocumentAnalysis',
          'textract:GetDocumentAnalysis',
          'textract:DetectDocumentText',
          'textract:AnalyzeDocument',
        ],
        resources: ['*'],
      }));
    });

    // Grant Lambda invoke permissions to the unified processor
    textExtractionFunction.grantInvoke(unifiedProcessorFunction);
    textractProcessorFunction.grantInvoke(unifiedProcessorFunction);
    textCleanerFunction.grantInvoke(unifiedProcessorFunction);
    documentChunkerFunction.grantInvoke(unifiedProcessorFunction);
    fileHandlersFunction.grantInvoke(unifiedProcessorFunction);

    // Grant cross-function invoke permission for file handlers
    textExtractionFunction.grantInvoke(fileHandlersFunction);

    // Add S3 trigger for automatic processing (optional)
    // Uncomment to enable automatic processing when files are uploaded
    /*
    this.rawDocumentsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(unifiedProcessorFunction),
      {
        prefix: 'tenants/',
        suffix: '.pdf'
      }
    );
    */

    // Output Lambda function ARNs
    new cdk.CfnOutput(this, 'TextExtractionFunctionArn', {
      value: textExtractionFunction.functionArn,
      description: 'ARN of the Text Extraction Lambda function',
      exportName: 'govbizai-text-extraction-function-arn',
    });

    new cdk.CfnOutput(this, 'TextractProcessorFunctionArn', {
      value: textractProcessorFunction.functionArn,
      description: 'ARN of the Textract Processor Lambda function',
      exportName: 'govbizai-textract-processor-function-arn',
    });

    new cdk.CfnOutput(this, 'TextCleanerFunctionArn', {
      value: textCleanerFunction.functionArn,
      description: 'ARN of the Text Cleaner Lambda function',
      exportName: 'govbizai-text-cleaner-function-arn',
    });

    new cdk.CfnOutput(this, 'DocumentChunkerFunctionArn', {
      value: documentChunkerFunction.functionArn,
      description: 'ARN of the Document Chunker Lambda function',
      exportName: 'govbizai-document-chunker-function-arn',
    });

    new cdk.CfnOutput(this, 'FileHandlersFunctionArn', {
      value: fileHandlersFunction.functionArn,
      description: 'ARN of the File Handlers Lambda function',
      exportName: 'govbizai-file-handlers-function-arn',
    });

    new cdk.CfnOutput(this, 'UnifiedProcessorFunctionArn', {
      value: unifiedProcessorFunction.functionArn,
      description: 'ARN of the Unified Processor Lambda function',
      exportName: 'govbizai-unified-processor-function-arn',
    });

    new cdk.CfnOutput(this, 'DocumentProcessingLayerArn', {
      value: documentProcessingLayer.layerVersionArn,
      description: 'ARN of the Document Processing Lambda Layer',
      exportName: 'govbizai-document-processing-layer-arn',
    });
  }

  private createEmbeddingInfrastructure(): void {
    // Create vector index tables for fast similarity search
    const dynamoDbProps: Partial<dynamodb.TableProps> = {
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.kmsKey,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev environment
    };

    const vectorIndexTable = new dynamodb.Table(this, 'govbizai-vector-index', {
      tableName: 'govbizai-vector-index',
      partitionKey: {
        name: 'entity_type', // 'opportunity' or 'company'
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'entity_id',
        type: dynamodb.AttributeType.STRING
      },
      ...dynamoDbProps,
    });

    // Add GSI for metadata filtering
    vectorIndexTable.addGlobalSecondaryIndex({
      indexName: 'metadata-index',
      partitionKey: {
        name: 'entity_type',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'created_at',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Create IAM role for Bedrock Knowledge Base
    const knowledgeBaseRole = new iam.Role(this, 'govbizai-knowledge-base-role', {
      roleName: 'govbizai-knowledge-base-role',
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {
        'govbizai-knowledge-base-policy': new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
              ],
              resources: [
                `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
              ],
              resources: [
                this.embeddingsBucket.bucketArn,
                `${this.embeddingsBucket.bucketArn}/*`,
              ],
            }),
          ],
        }),
      },
    });

    // Create a new managed policy for embedding operations
    const embeddingPolicy = new iam.ManagedPolicy(this, 'govbizai-embedding-policy', {
      managedPolicyName: 'govbizai-embedding-policy',
      description: 'Policy for embedding generation and search operations',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
          ],
          resources: [
            `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
          ],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:ListBucket',
          ],
          resources: [
            this.embeddingsBucket.bucketArn,
            `${this.embeddingsBucket.bucketArn}/*`,
          ],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
            'dynamodb:Scan',
          ],
          resources: [
            vectorIndexTable.tableArn,
            `${vectorIndexTable.tableArn}/index/*`,
          ],
        }),
      ],
    });

    // Create IAM role for embedding Lambda functions
    const embeddingLambdaRole = new iam.Role(this, 'govbizai-embedding-lambda-role', {
      roleName: 'govbizai-embedding-lambda-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        // VPC access role removed for cost optimization
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        embeddingPolicy,
      ],
    });

    // Create embedding generation Lambda function
    const embeddingLayer = new lambda.LayerVersion(this, 'govbizai-embedding-layer', {
      layerVersionName: 'govbizai-embedding-layer',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-layers/embedding')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Embedding generation dependencies including boto3, numpy, tiktoken',
    });

    const embeddingGenerationFunction = new lambda.Function(this, 'govbizai-embedding-generation', {
      functionName: 'govbizai-embedding-generation',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/embedding/embedding-generation')),
      handler: 'handler.lambda_handler',
      description: 'Generate embeddings using Amazon Bedrock Titan Text Embeddings V2',
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      role: embeddingLambdaRole,
      environment: {
        EMBEDDINGS_BUCKET: this.embeddingsBucket.bucketName,
        OPPORTUNITIES_TABLE: this.opportunitiesTable.tableName,
        COMPANIES_TABLE: this.companiesTable.tableName,
        VECTOR_INDEX_TABLE: vectorIndexTable.tableName,
        BEDROCK_MODEL_ARN: `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
      },
      layers: [embeddingLayer],
      // VPC removed for cost optimization
    });

    // Create semantic search function
    const semanticSearchFunction = new lambda.Function(this, 'govbizai-semantic-search', {
      functionName: 'govbizai-semantic-search',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/embedding/semantic-search')),
      handler: 'handler.lambda_handler',
      description: 'Perform semantic search using Bedrock Knowledge Bases',
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      role: embeddingLambdaRole,
      environment: {
        EMBEDDINGS_BUCKET: this.embeddingsBucket.bucketName,
        VECTOR_INDEX_TABLE: vectorIndexTable.tableName,
        BEDROCK_MODEL_ARN: `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
      },
      layers: [embeddingLayer],
      // VPC removed for cost optimization
    });

    // Create hybrid search function
    const hybridSearchFunction = new lambda.Function(this, 'govbizai-hybrid-search', {
      functionName: 'govbizai-hybrid-search',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/embedding/hybrid-search')),
      handler: 'handler.lambda_handler',
      description: 'Perform hybrid search combining semantic and keyword matching',
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      role: embeddingLambdaRole,
      environment: {
        EMBEDDINGS_BUCKET: this.embeddingsBucket.bucketName,
        VECTOR_INDEX_TABLE: vectorIndexTable.tableName,
        OPPORTUNITIES_TABLE: this.opportunitiesTable.tableName,
        COMPANIES_TABLE: this.companiesTable.tableName,
        SEMANTIC_SEARCH_FUNCTION: 'govbizai-semantic-search', // Use static function name instead of reference
      },
      layers: [embeddingLayer],
      // VPC removed for cost optimization
    });

    // Grant additional permissions for the hybrid search function to call other functions
    this.opportunitiesTable.grantReadData(hybridSearchFunction);
    this.companiesTable.grantReadData(hybridSearchFunction);

    // Grant invoke permissions
    semanticSearchFunction.grantInvoke(hybridSearchFunction);

    // Output the infrastructure ARNs
    new cdk.CfnOutput(this, 'VectorIndexTableName', {
      value: vectorIndexTable.tableName,
      description: 'Name of the Vector Index DynamoDB table',
      exportName: 'govbizai-vector-index-table-name',
    });

    new cdk.CfnOutput(this, 'EmbeddingsBucketName', {
      value: this.embeddingsBucket.bucketName,
      description: 'Name of the Embeddings S3 bucket',
      exportName: 'govbizai-embeddings-bucket-name',
    });

    new cdk.CfnOutput(this, 'EmbeddingGenerationFunctionArn', {
      value: embeddingGenerationFunction.functionArn,
      description: 'ARN of the Embedding Generation Lambda function',
      exportName: 'govbizai-embedding-generation-function-arn',
    });

    new cdk.CfnOutput(this, 'SemanticSearchFunctionArn', {
      value: semanticSearchFunction.functionArn,
      description: 'ARN of the Semantic Search Lambda function',
      exportName: 'govbizai-semantic-search-function-arn',
    });

    new cdk.CfnOutput(this, 'HybridSearchFunctionArn', {
      value: hybridSearchFunction.functionArn,
      description: 'ARN of the Hybrid Search Lambda function',
      exportName: 'govbizai-hybrid-search-function-arn',
    });

    new cdk.CfnOutput(this, 'EmbeddingLayerArn', {
      value: embeddingLayer.layerVersionArn,
      description: 'ARN of the Embedding Lambda Layer',
      exportName: 'govbizai-embedding-layer-arn',
    });
  }

  private createSamGovInfrastructure(): void {
    // Create Lambda layer for SAM.gov integration dependencies
    const samgovLayer = new lambda.LayerVersion(this, 'govbizai-samgov-layer', {
      layerVersionName: 'govbizai-samgov-layer',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-layers/samgov')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'SAM.gov integration dependencies including requests, pandas, boto3, etc.',
    });

    // Create SQS queues for processing
    const opportunityProcessingQueue = new sqs.Queue(this, 'govbizai-opportunity-processing-queue', {
      queueName: 'govbizai-opportunity-processing-queue',
      visibilityTimeout: cdk.Duration.minutes(15),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'govbizai-opportunity-processing-dlq', {
          queueName: 'govbizai-opportunity-processing-dlq',
        }),
        maxReceiveCount: 3,
      },
    });

    // Common Lambda function properties for SAM.gov functions
    const samgovFunctionProps = {
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: cdk.Duration.minutes(15),
      memorySize: 3008, // Maximum memory for large CSV processing
      environment: {
        RAW_DOCUMENTS_BUCKET: this.rawDocumentsBucket.bucketName,
        PROCESSED_DOCUMENTS_BUCKET: this.processedDocumentsBucket.bucketName,
        TEMP_PROCESSING_BUCKET: this.tempProcessingBucket.bucketName,
        EMBEDDINGS_BUCKET: this.embeddingsBucket.bucketName,
        OPPORTUNITIES_TABLE: this.opportunitiesTable.tableName,
        PROCESSING_QUEUE_URL: opportunityProcessingQueue.queueUrl,
      },
      // VPC removed for cost optimization
      // Note: Dependencies will be bundled automatically from requirements.txt
    };

    // 1. CSV Download and Processing Function
    const csvProcessorFunction = new lambda.Function(this, 'govbizai-csv-processor', {
      functionName: 'govbizai-csv-processor',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/samgov/csv-processor'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      handler: 'handler.lambda_handler',
      description: 'Download and process SAM.gov CSV files with filtering',
      ...samgovFunctionProps,
    });

    // 2. SAM.gov API Client Function
    const samgovApiClientFunction = new lambda.Function(this, 'govbizai-samgov-api-client', {
      functionName: 'govbizai-samgov-api-client',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/samgov/api-client'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      handler: 'handler.lambda_handler',
      description: 'SAM.gov API client with retry logic and rate limiting',
      ...samgovFunctionProps,
    });

    // 3. Attachment Downloader Function
    const attachmentDownloaderFunction = new lambda.Function(this, 'govbizai-attachment-downloader', {
      functionName: 'govbizai-attachment-downloader',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/samgov/attachment-downloader')),
      handler: 'handler.lambda_handler',
      description: 'Download and store opportunity attachments from SAM.gov',
      ...samgovFunctionProps,
    });

    // 4. Opportunity Processor Function
    const opportunityProcessorFunction = new lambda.Function(this, 'govbizai-opportunity-processor', {
      functionName: 'govbizai-opportunity-processor',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/samgov/opportunity-processor')),
      handler: 'handler.lambda_handler',
      description: 'Process opportunities and generate embeddings',
      ...samgovFunctionProps,
    });

    // 5. Data Retention Function
    const dataRetentionFunction = new lambda.Function(this, 'govbizai-data-retention', {
      functionName: 'govbizai-data-retention',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/samgov/data-retention')),
      handler: 'handler.lambda_handler',
      description: 'Clean up expired opportunities and attachments',
      ...samgovFunctionProps,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
    });

    // 6. SAM.gov Orchestrator Function (Main Entry Point)
    const samgovOrchestratorFunction = new lambda.Function(this, 'govbizai-samgov-orchestrator', {
      functionName: 'govbizai-samgov-orchestrator',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/samgov/orchestrator')),
      handler: 'handler.lambda_handler',
      description: 'Main orchestrator for SAM.gov nightly processing',
      ...samgovFunctionProps,
      timeout: cdk.Duration.minutes(5),
      environment: {
        ...samgovFunctionProps.environment,
        CSV_PROCESSOR_FUNCTION: csvProcessorFunction.functionName,
        API_CLIENT_FUNCTION: samgovApiClientFunction.functionName,
        ATTACHMENT_DOWNLOADER_FUNCTION: attachmentDownloaderFunction.functionName,
        OPPORTUNITY_PROCESSOR_FUNCTION: opportunityProcessorFunction.functionName,
      },
    });

    // Grant permissions to all SAM.gov functions
    const samgovFunctions = [
      csvProcessorFunction,
      samgovApiClientFunction,
      attachmentDownloaderFunction,
      opportunityProcessorFunction,
      dataRetentionFunction,
      samgovOrchestratorFunction,
    ];

    samgovFunctions.forEach(func => {
      // S3 permissions
      this.rawDocumentsBucket.grantReadWrite(func);
      this.processedDocumentsBucket.grantReadWrite(func);
      this.tempProcessingBucket.grantReadWrite(func);
      this.embeddingsBucket.grantReadWrite(func);

      // DynamoDB permissions
      this.opportunitiesTable.grantReadWriteData(func);

      // SQS permissions
      opportunityProcessingQueue.grantSendMessages(func);
      opportunityProcessingQueue.grantConsumeMessages(func);

      // Bedrock permissions for embedding generation
      func.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      }));
    });

    // Grant cross-function invoke permissions to orchestrator
    csvProcessorFunction.grantInvoke(samgovOrchestratorFunction);
    samgovApiClientFunction.grantInvoke(samgovOrchestratorFunction);
    attachmentDownloaderFunction.grantInvoke(samgovOrchestratorFunction);
    opportunityProcessorFunction.grantInvoke(samgovOrchestratorFunction);

    // Create Step Functions State Machine for distributed processing
    const processingStateMachine = this.createProcessingStateMachine(
      csvProcessorFunction,
      samgovApiClientFunction,
      attachmentDownloaderFunction,
      opportunityProcessorFunction,
      opportunityProcessingQueue
    );

    // Create EventBridge rule for nightly processing (2:00 AM EST)
    const nightlyProcessingRule = new events.Rule(this, 'govbizai-nightly-processing-rule', {
      ruleName: 'govbizai-nightly-processing-rule',
      description: 'Trigger SAM.gov processing at 2:00 AM EST daily',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '7', // 2:00 AM EST = 7:00 AM UTC
        day: '*',
        month: '*',
        year: '*',
      }),
      enabled: true,
    });

    // Add Step Functions as target
    nightlyProcessingRule.addTarget(new targets.SfnStateMachine(processingStateMachine));

    // Create EventBridge rule for daily data retention (3:00 AM EST)
    const dataRetentionRule = new events.Rule(this, 'govbizai-data-retention-rule', {
      ruleName: 'govbizai-data-retention-rule',
      description: 'Trigger data retention cleanup at 3:00 AM EST daily',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '8', // 3:00 AM EST = 8:00 AM UTC
        day: '*',
        month: '*',
        year: '*',
      }),
      enabled: true,
    });

    // Add Lambda as target for data retention
    dataRetentionRule.addTarget(new targets.LambdaFunction(dataRetentionFunction));

    // Output important ARNs and names
    new cdk.CfnOutput(this, 'CsvProcessorFunctionArn', {
      value: csvProcessorFunction.functionArn,
      description: 'ARN of the CSV Processor Lambda function',
      exportName: 'govbizai-csv-processor-function-arn',
    });

    new cdk.CfnOutput(this, 'SamgovApiClientFunctionArn', {
      value: samgovApiClientFunction.functionArn,
      description: 'ARN of the SAM.gov API Client Lambda function',
      exportName: 'govbizai-samgov-api-client-function-arn',
    });

    new cdk.CfnOutput(this, 'AttachmentDownloaderFunctionArn', {
      value: attachmentDownloaderFunction.functionArn,
      description: 'ARN of the Attachment Downloader Lambda function',
      exportName: 'govbizai-attachment-downloader-function-arn',
    });

    new cdk.CfnOutput(this, 'OpportunityProcessorFunctionArn', {
      value: opportunityProcessorFunction.functionArn,
      description: 'ARN of the Opportunity Processor Lambda function',
      exportName: 'govbizai-opportunity-processor-function-arn',
    });

    new cdk.CfnOutput(this, 'DataRetentionFunctionArn', {
      value: dataRetentionFunction.functionArn,
      description: 'ARN of the Data Retention Lambda function',
      exportName: 'govbizai-data-retention-function-arn',
    });

    new cdk.CfnOutput(this, 'SamgovOrchestratorFunctionArn', {
      value: samgovOrchestratorFunction.functionArn,
      description: 'ARN of the SAM.gov Orchestrator Lambda function',
      exportName: 'govbizai-samgov-orchestrator-function-arn',
    });

    new cdk.CfnOutput(this, 'ProcessingStateMachineArn', {
      value: processingStateMachine.stateMachineArn,
      description: 'ARN of the Processing Step Functions State Machine',
      exportName: 'govbizai-processing-state-machine-arn',
    });

    new cdk.CfnOutput(this, 'OpportunityProcessingQueueUrl', {
      value: opportunityProcessingQueue.queueUrl,
      description: 'URL of the Opportunity Processing SQS Queue',
      exportName: 'govbizai-opportunity-processing-queue-url',
    });

    new cdk.CfnOutput(this, 'SamgovLayerArn', {
      value: samgovLayer.layerVersionArn,
      description: 'ARN of the SAM.gov Lambda Layer',
      exportName: 'govbizai-samgov-layer-arn',
    });
  }

  private createProcessingStateMachine(
    csvProcessor: lambda.Function,
    apiClient: lambda.Function,
    attachmentDownloader: lambda.Function,
    opportunityProcessor: lambda.Function,
    processingQueue: sqs.Queue
  ): stepfunctions.StateMachine {
    // Define the Step Functions workflow
    const initializeTask = new stepfunctionsTasks.LambdaInvoke(this, 'Initialize Processing', {
      lambdaFunction: csvProcessor,
      outputPath: '$.Payload',
    });

    const processOpportunityTask = new stepfunctionsTasks.LambdaInvoke(this, 'Process Opportunity', {
      lambdaFunction: opportunityProcessor,
      outputPath: '$.Payload',
    });

    const downloadAttachmentsTask = new stepfunctionsTasks.LambdaInvoke(this, 'Download Attachments', {
      lambdaFunction: attachmentDownloader,
      outputPath: '$.Payload',
    });

    // Create a distributed map for parallel processing
    const distributedMap = new stepfunctions.DistributedMap(this, 'Process Opportunities in Parallel', {
      maxConcurrency: 50,
      itemsPath: '$.opportunities',
    });

    // Define the map iteration
    const processAndDownload = stepfunctions.Chain.start(processOpportunityTask)
      .next(downloadAttachmentsTask);

    distributedMap.itemProcessor(processAndDownload);

    // Define success state
    const successState = new stepfunctions.Succeed(this, 'Processing Complete', {
      comment: 'All opportunities processed successfully',
    });

    // Define failure state
    const failureState = new stepfunctions.Fail(this, 'Processing Failed', {
      comment: 'Processing failed with errors',
    });

    // Create the main workflow
    const definition = stepfunctions.Chain.start(initializeTask)
      .next(distributedMap)
      .next(successState);

    // Add error handling
    initializeTask.addCatch(failureState, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    distributedMap.addCatch(failureState, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    // Create the state machine
    const stateMachine = new stepfunctions.StateMachine(this, 'govbizai-processing-state-machine', {
      stateMachineName: 'govbizai-processing-state-machine',
      definition: definition,
      timeout: cdk.Duration.hours(4),
      logs: {
        destination: new logs.LogGroup(this, 'govbizai-processing-state-machine-logs', {
          logGroupName: '/aws/stepfunctions/govbizai-processing-state-machine',
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        level: stepfunctions.LogLevel.ALL,
      },
    });

    return stateMachine;
  }

  private createCompanyProfileManagementFunctions(): void {
    // Create Lambda layer for company profile management dependencies
    const companyProfileLayer = new lambda.LayerVersion(this, 'govbizai-company-profile-layer', {
      layerVersionName: 'govbizai-company-profile-layer',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-layers/company-profile')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Company profile management dependencies including requests, BeautifulSoup4, etc.',
    });

    // Common Lambda function properties for company profile functions
    const companyProfileFunctionProps = {
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        RAW_DOCUMENTS_BUCKET: this.rawDocumentsBucket.bucketName,
        PROCESSED_DOCUMENTS_BUCKET: this.processedDocumentsBucket.bucketName,
        EMBEDDINGS_BUCKET: this.embeddingsBucket.bucketName,
        COMPANIES_TABLE_NAME: this.companiesTable.tableName,
        AUDIT_LOG_TABLE_NAME: this.auditLogTable.tableName,
        TEXT_EXTRACTION_FUNCTION: 'govbizai-text-extraction',
      },
      layers: [companyProfileLayer],
      // VPC removed for cost optimization
    };

    // 1. S3 Presigned URL Generator
    const uploadPresignedUrlFunction = new lambda.Function(this, 'govbizai-upload-presigned-url', {
      functionName: 'govbizai-upload-presigned-url',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/company-profile/upload-presigned-url')),
      handler: 'handler.lambda_handler',
      description: 'Generate presigned URLs for secure document uploads',
      ...companyProfileFunctionProps,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
    });

    // 2. Multipart Upload Handler
    const multipartUploadFunction = new lambda.Function(this, 'govbizai-multipart-upload', {
      functionName: 'govbizai-multipart-upload',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/company-profile/multipart-upload')),
      handler: 'handler.lambda_handler',
      description: 'Handle multipart uploads for large documents',
      ...companyProfileFunctionProps,
      timeout: cdk.Duration.minutes(10),
    });

    // 3. Upload Progress Tracker
    const uploadProgressFunction = new lambda.Function(this, 'govbizai-upload-progress', {
      functionName: 'govbizai-upload-progress',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/company-profile/upload-progress')),
      handler: 'handler.lambda_handler',
      description: 'Track and manage document upload progress',
      ...companyProfileFunctionProps,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
    });

    // 4. Company Profile Schema Validator
    const schemaValidatorFunction = new lambda.Function(this, 'govbizai-schema-validator', {
      functionName: 'govbizai-schema-validator',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/company-profile/schema-validator')),
      handler: 'handler.lambda_handler',
      description: 'Validate and sanitize company profile data',
      ...companyProfileFunctionProps,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
    });

    // 5. Document Categorizer
    const documentCategorizerFunction = new lambda.Function(this, 'govbizai-document-categorizer', {
      functionName: 'govbizai-document-categorizer',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/company-profile/document-categorizer')),
      handler: 'handler.lambda_handler',
      description: 'Automatically categorize uploaded documents',
      ...companyProfileFunctionProps,
      environment: {
        ...companyProfileFunctionProps.environment,
        TEXT_EXTRACTION_FUNCTION: 'govbizai-text-extraction',
      },
    });

    // 6. Resume Parser
    const resumeParserFunction = new lambda.Function(this, 'govbizai-resume-parser', {
      functionName: 'govbizai-resume-parser',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/company-profile/resume-parser')),
      handler: 'handler.lambda_handler',
      description: 'Extract structured information from resume documents',
      ...companyProfileFunctionProps,
      environment: {
        ...companyProfileFunctionProps.environment,
        TEXT_EXTRACTION_FUNCTION: 'govbizai-text-extraction',
      },
    });

    // 7. Capability Statement Processor
    const capabilityProcessorFunction = new lambda.Function(this, 'govbizai-capability-processor', {
      functionName: 'govbizai-capability-processor',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/company-profile/capability-processor')),
      handler: 'handler.lambda_handler',
      description: 'Process and extract information from capability statements',
      ...companyProfileFunctionProps,
      environment: {
        ...companyProfileFunctionProps.environment,
        TEXT_EXTRACTION_FUNCTION: 'govbizai-text-extraction',
      },
    });

    // 8. Website Scraper
    const websiteScraperFunction = new lambda.Function(this, 'govbizai-website-scraper', {
      functionName: 'govbizai-website-scraper',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/company-profile/website-scraper')),
      handler: 'handler.lambda_handler',
      description: 'Scrape company websites with robots.txt compliance',
      ...companyProfileFunctionProps,
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048,
    });

    // 9. Multi-Level Embedding Strategy
    const embeddingStrategyFunction = new lambda.Function(this, 'govbizai-embedding-strategy', {
      functionName: 'govbizai-embedding-strategy',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/company-profile/embedding-strategy')),
      handler: 'handler.lambda_handler',
      description: 'Create multi-level embeddings for company documents',
      ...companyProfileFunctionProps,
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048,
    });


    // Grant permissions to all company profile functions
    const companyProfileFunctions = [
      uploadPresignedUrlFunction,
      multipartUploadFunction,
      uploadProgressFunction,
      schemaValidatorFunction,
      documentCategorizerFunction,
      resumeParserFunction,
      capabilityProcessorFunction,
      websiteScraperFunction,
      embeddingStrategyFunction,
    ];

    companyProfileFunctions.forEach(func => {
      // S3 permissions
      this.rawDocumentsBucket.grantReadWrite(func);
      this.processedDocumentsBucket.grantReadWrite(func);
      this.embeddingsBucket.grantReadWrite(func);

      // DynamoDB permissions
      this.companiesTable.grantReadWriteData(func);
      this.auditLogTable.grantWriteData(func);

      // Bedrock permissions for AI functionality
      func.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        ],
      }));

      // Lambda invoke permissions for function chaining
      func.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'lambda:InvokeFunction',
        ],
        resources: [
          `arn:aws:lambda:${this.region}:${this.account}:function:govbizai-text-extraction`,
          `arn:aws:lambda:${this.region}:${this.account}:function:govbizai-*`,
        ],
      }));

      // EventBridge permissions for website scraper scheduling
      if (func === websiteScraperFunction) {
        func.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'events:PutRule',
            'events:PutTargets',
            'events:DeleteRule',
            'events:RemoveTargets',
          ],
          resources: [`arn:aws:events:${this.region}:${this.account}:rule/govbizai-website-scraping-*`],
        }));
      }
    });

    // Output Lambda function ARNs
    new cdk.CfnOutput(this, 'UploadPresignedUrlFunctionArn', {
      value: uploadPresignedUrlFunction.functionArn,
      description: 'ARN of the Upload Presigned URL Lambda function',
      exportName: 'govbizai-upload-presigned-url-function-arn',
    });

    new cdk.CfnOutput(this, 'MultipartUploadFunctionArn', {
      value: multipartUploadFunction.functionArn,
      description: 'ARN of the Multipart Upload Lambda function',
      exportName: 'govbizai-multipart-upload-function-arn',
    });

    new cdk.CfnOutput(this, 'UploadProgressFunctionArn', {
      value: uploadProgressFunction.functionArn,
      description: 'ARN of the Upload Progress Lambda function',
      exportName: 'govbizai-upload-progress-function-arn',
    });

    new cdk.CfnOutput(this, 'SchemaValidatorFunctionArn', {
      value: schemaValidatorFunction.functionArn,
      description: 'ARN of the Schema Validator Lambda function',
      exportName: 'govbizai-schema-validator-function-arn',
    });

    new cdk.CfnOutput(this, 'DocumentCategorizerFunctionArn', {
      value: documentCategorizerFunction.functionArn,
      description: 'ARN of the Document Categorizer Lambda function',
      exportName: 'govbizai-document-categorizer-function-arn',
    });

    new cdk.CfnOutput(this, 'ResumeParserFunctionArn', {
      value: resumeParserFunction.functionArn,
      description: 'ARN of the Resume Parser Lambda function',
      exportName: 'govbizai-resume-parser-function-arn',
    });

    new cdk.CfnOutput(this, 'CapabilityProcessorFunctionArn', {
      value: capabilityProcessorFunction.functionArn,
      description: 'ARN of the Capability Processor Lambda function',
      exportName: 'govbizai-capability-processor-function-arn',
    });

    new cdk.CfnOutput(this, 'WebsiteScraperFunctionArn', {
      value: websiteScraperFunction.functionArn,
      description: 'ARN of the Website Scraper Lambda function',
      exportName: 'govbizai-website-scraper-function-arn',
    });

    new cdk.CfnOutput(this, 'EmbeddingStrategyFunctionArn', {
      value: embeddingStrategyFunction.functionArn,
      description: 'ARN of the Embedding Strategy Lambda function',
      exportName: 'govbizai-embedding-strategy-function-arn',
    });

    new cdk.CfnOutput(this, 'CompanyProfileLayerArn', {
      value: companyProfileLayer.layerVersionArn,
      description: 'ARN of the Company Profile Lambda Layer',
      exportName: 'govbizai-company-profile-layer-arn',
    });
  }

  private createMatchingEngineFunctions(): void {
    // Create Lambda layer for matching engine dependencies
    const matchingEngineLayer = new lambda.LayerVersion(this, 'govbizai-matching-engine-layer', {
      layerVersionName: 'govbizai-matching-engine-layer',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-layers/matching-engine')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Matching engine dependencies including numpy, scipy, scikit-learn',
    });

    // Create cache table for match results
    const matchCacheTable = new dynamodb.Table(this, 'govbizai-match-cache', {
      tableName: 'govbizai-match-cache',
      partitionKey: {
        name: 'cache_key',
        type: dynamodb.AttributeType.STRING
      },
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.kmsKey,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true
      },
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Common Lambda function properties for matching engine
    const matchingEngineFunctionProps = {
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        EMBEDDINGS_BUCKET: this.embeddingsBucket.bucketName,
        OPPORTUNITIES_TABLE: this.opportunitiesTable.tableName,
        COMPANIES_TABLE: this.companiesTable.tableName,
        MATCHES_TABLE: this.matchesTable.tableName,
        CACHE_TABLE: matchCacheTable.tableName,
      },
      layers: [matchingEngineLayer],
      // VPC removed for cost optimization
    };

    // 1. Semantic Similarity Calculator
    const semanticSimilarityFunction = new lambda.Function(this, 'govbizai-semantic-similarity', {
      functionName: 'govbizai-semantic-similarity',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/matching-engine/semantic-similarity')),
      handler: 'handler.lambda_handler',
      description: 'Calculate semantic similarity between opportunities and companies using Bedrock embeddings',
      ...matchingEngineFunctionProps,
    });

    // 2. Keyword Matching Algorithm
    const keywordMatchingFunction = new lambda.Function(this, 'govbizai-keyword-matching', {
      functionName: 'govbizai-keyword-matching',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/matching-engine/keyword-matching')),
      handler: 'handler.lambda_handler',
      description: 'Perform keyword matching with TF-IDF scoring and acronym handling',
      ...matchingEngineFunctionProps,
    });

    // 3. NAICS Alignment Scorer
    const naicsAlignmentFunction = new lambda.Function(this, 'govbizai-naics-alignment', {
      functionName: 'govbizai-naics-alignment',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/matching-engine/naics-alignment')),
      handler: 'handler.lambda_handler',
      description: 'Calculate NAICS code alignment with tiered matching',
      ...matchingEngineFunctionProps,
    });

    // 4. Past Performance Analyzer
    const pastPerformanceFunction = new lambda.Function(this, 'govbizai-past-performance', {
      functionName: 'govbizai-past-performance',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/matching-engine/past-performance')),
      handler: 'handler.lambda_handler',
      description: 'Analyze past performance relevance and CPARS ratings',
      ...matchingEngineFunctionProps,
    });

    // 5. Certification Bonus Matcher
    const certificationBonusFunction = new lambda.Function(this, 'govbizai-certification-bonus', {
      functionName: 'govbizai-certification-bonus',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/matching-engine/certification-bonus')),
      handler: 'handler.lambda_handler',
      description: 'Calculate certification bonus scores and set-aside compliance',
      ...matchingEngineFunctionProps,
    });

    // 6. Geographic Match Calculator
    const geographicMatchFunction = new lambda.Function(this, 'govbizai-geographic-match', {
      functionName: 'govbizai-geographic-match',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/matching-engine/geographic-match')),
      handler: 'handler.lambda_handler',
      description: 'Calculate geographic proximity and location-based scoring',
      ...matchingEngineFunctionProps,
    });

    // 7. Capacity Fit Calculator
    const capacityFitFunction = new lambda.Function(this, 'govbizai-capacity-fit', {
      functionName: 'govbizai-capacity-fit',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/matching-engine/capacity-fit')),
      handler: 'handler.lambda_handler',
      description: 'Assess capacity fit between company size and contract requirements',
      ...matchingEngineFunctionProps,
    });

    // 8. Recency Factor Scorer
    const recencyFactorFunction = new lambda.Function(this, 'govbizai-recency-factor', {
      functionName: 'govbizai-recency-factor',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/matching-engine/recency-factor')),
      handler: 'handler.lambda_handler',
      description: 'Calculate recency factor with time-based decay',
      ...matchingEngineFunctionProps,
    });

    // 9. Quick Filter (Pre-screening)
    const quickFilterFunction = new lambda.Function(this, 'govbizai-quick-filter', {
      functionName: 'govbizai-quick-filter',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/matching-engine/quick-filter')),
      handler: 'handler.lambda_handler',
      description: 'Rapid pre-screening filter for potential matches',
      ...matchingEngineFunctionProps,
      timeout: cdk.Duration.seconds(10), // Quick filter should be very fast
      memorySize: 256,
    });

    // 10. Match Orchestrator (Main Coordinator)
    const matchOrchestratorFunction = new lambda.Function(this, 'govbizai-match-orchestrator', {
      functionName: 'govbizai-match-orchestrator',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/matching-engine/match-orchestrator')),
      handler: 'handler.lambda_handler',
      description: 'Main orchestrator coordinating all matching components',
      ...matchingEngineFunctionProps,
      timeout: cdk.Duration.minutes(2), // Longer timeout for orchestration
      memorySize: 1024,
    });

    // Grant permissions to all matching engine functions
    const matchingEngineFunctions = [
      semanticSimilarityFunction,
      keywordMatchingFunction,
      naicsAlignmentFunction,
      pastPerformanceFunction,
      certificationBonusFunction,
      geographicMatchFunction,
      capacityFitFunction,
      recencyFactorFunction,
      quickFilterFunction,
      matchOrchestratorFunction,
    ];

    matchingEngineFunctions.forEach(func => {
      // S3 permissions
      this.embeddingsBucket.grantRead(func);

      // DynamoDB permissions
      this.opportunitiesTable.grantReadData(func);
      this.companiesTable.grantReadData(func);
      this.matchesTable.grantReadWriteData(func);
      matchCacheTable.grantReadWriteData(func);

      // Bedrock permissions for embeddings
      func.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      }));
    });

    // Grant orchestrator permission to invoke component functions
    matchingEngineFunctions.slice(0, -1).forEach(componentFunc => {
      componentFunc.grantInvoke(matchOrchestratorFunction);
    });

    // Create SQS queue for batch matching operations
    const batchMatchingQueue = new sqs.Queue(this, 'govbizai-batch-matching-queue', {
      queueName: 'govbizai-batch-matching-queue',
      visibilityTimeout: cdk.Duration.minutes(5),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'govbizai-batch-matching-dlq', {
          queueName: 'govbizai-batch-matching-dlq',
        }),
        maxReceiveCount: 3,
      },
    });

    // Grant SQS permissions
    batchMatchingQueue.grantSendMessages(matchOrchestratorFunction);
    batchMatchingQueue.grantConsumeMessages(matchOrchestratorFunction);

    // Create API Gateway for matching engine
    const matchingApi = new apigateway.RestApi(this, 'govbizai-matching-api', {
      restApiName: 'govbizai-matching-api',
      description: 'API for opportunity matching operations',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
    });

    // Create API Gateway integration
    const matchingIntegration = new apigateway.LambdaIntegration(matchOrchestratorFunction);

    // Add API routes
    const matchResource = matchingApi.root.addResource('match');
    matchResource.addMethod('POST', matchingIntegration, {
      apiKeyRequired: true,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizer: new apigateway.CognitoUserPoolsAuthorizer(this, 'govbizai-matching-authorizer', {
        cognitoUserPools: [this.userPool],
      }),
    });

    // Create API key and usage plan
    const apiKey = new apigateway.ApiKey(this, 'govbizai-matching-api-key', {
      apiKeyName: 'govbizai-matching-api-key',
      description: 'API key for GovBizAI matching engine',
    });

    const usagePlan = new apigateway.UsagePlan(this, 'govbizai-matching-usage-plan', {
      name: 'govbizai-matching-usage-plan',
      description: 'Usage plan for GovBizAI matching API',
      apiStages: [{
        api: matchingApi,
        stage: matchingApi.deploymentStage,
      }],
      throttle: {
        rateLimit: 100,  // requests per second
        burstLimit: 200,
      },
      quota: {
        limit: 10000,  // requests per month
        period: apigateway.Period.MONTH,
      },
    });

    usagePlan.addApiKey(apiKey);

    // Output Lambda function ARNs
    new cdk.CfnOutput(this, 'SemanticSimilarityFunctionArn', {
      value: semanticSimilarityFunction.functionArn,
      description: 'ARN of the Semantic Similarity Lambda function',
      exportName: 'govbizai-semantic-similarity-function-arn',
    });

    new cdk.CfnOutput(this, 'KeywordMatchingFunctionArn', {
      value: keywordMatchingFunction.functionArn,
      description: 'ARN of the Keyword Matching Lambda function',
      exportName: 'govbizai-keyword-matching-function-arn',
    });

    new cdk.CfnOutput(this, 'NAICSAlignmentFunctionArn', {
      value: naicsAlignmentFunction.functionArn,
      description: 'ARN of the NAICS Alignment Lambda function',
      exportName: 'govbizai-naics-alignment-function-arn',
    });

    new cdk.CfnOutput(this, 'PastPerformanceFunctionArn', {
      value: pastPerformanceFunction.functionArn,
      description: 'ARN of the Past Performance Lambda function',
      exportName: 'govbizai-past-performance-function-arn',
    });

    new cdk.CfnOutput(this, 'CertificationBonusFunctionArn', {
      value: certificationBonusFunction.functionArn,
      description: 'ARN of the Certification Bonus Lambda function',
      exportName: 'govbizai-certification-bonus-function-arn',
    });

    new cdk.CfnOutput(this, 'GeographicMatchFunctionArn', {
      value: geographicMatchFunction.functionArn,
      description: 'ARN of the Geographic Match Lambda function',
      exportName: 'govbizai-geographic-match-function-arn',
    });

    new cdk.CfnOutput(this, 'CapacityFitFunctionArn', {
      value: capacityFitFunction.functionArn,
      description: 'ARN of the Capacity Fit Lambda function',
      exportName: 'govbizai-capacity-fit-function-arn',
    });

    new cdk.CfnOutput(this, 'RecencyFactorFunctionArn', {
      value: recencyFactorFunction.functionArn,
      description: 'ARN of the Recency Factor Lambda function',
      exportName: 'govbizai-recency-factor-function-arn',
    });

    new cdk.CfnOutput(this, 'QuickFilterFunctionArn', {
      value: quickFilterFunction.functionArn,
      description: 'ARN of the Quick Filter Lambda function',
      exportName: 'govbizai-quick-filter-function-arn',
    });

    new cdk.CfnOutput(this, 'MatchOrchestratorFunctionArn', {
      value: matchOrchestratorFunction.functionArn,
      description: 'ARN of the Match Orchestrator Lambda function',
      exportName: 'govbizai-match-orchestrator-function-arn',
    });

    new cdk.CfnOutput(this, 'MatchingEngineLayerArn', {
      value: matchingEngineLayer.layerVersionArn,
      description: 'ARN of the Matching Engine Lambda Layer',
      exportName: 'govbizai-matching-engine-layer-arn',
    });

    new cdk.CfnOutput(this, 'MatchCacheTableName', {
      value: matchCacheTable.tableName,
      description: 'Name of the Match Cache DynamoDB table',
      exportName: 'govbizai-match-cache-table-name',
    });

    new cdk.CfnOutput(this, 'BatchMatchingQueueUrl', {
      value: batchMatchingQueue.queueUrl,
      description: 'URL of the Batch Matching SQS Queue',
      exportName: 'govbizai-batch-matching-queue-url',
    });

    new cdk.CfnOutput(this, 'MatchingApiEndpoint', {
      value: matchingApi.url,
      description: 'Endpoint URL of the Matching API',
      exportName: 'govbizai-matching-api-endpoint',
    });

    new cdk.CfnOutput(this, 'MatchingApiKey', {
      value: apiKey.keyId,
      description: 'API Key ID for the Matching API',
      exportName: 'govbizai-matching-api-key-id',
    });

    // Phase 8: Create Batch Processing Orchestration components
    this.createBatchOrchestrationComponents();
  }

  private createBatchOrchestrationComponents(): void {
    // Create DynamoDB tables for batch orchestration
    const batchCoordinationTable = new dynamodb.Table(this, 'govbizai-batch-coordination', {
      tableName: 'govbizai-batch-coordination',
      partitionKey: { name: 'coordination_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const progressTrackingTable = new dynamodb.Table(this, 'govbizai-progress-tracking', {
      tableName: 'govbizai-progress-tracking',
      partitionKey: { name: 'coordination_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'batch_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const batchOptimizationTable = new dynamodb.Table(this, 'govbizai-batch-optimization-history', {
      tableName: 'govbizai-batch-optimization-history',
      partitionKey: { name: 'processing_type', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const scheduleManagementTable = new dynamodb.Table(this, 'govbizai-schedule-management', {
      tableName: 'govbizai-schedule-management',
      partitionKey: { name: 'schedule_name', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create SQS queue for batch processing coordination
    const batchCoordinationQueue = new sqs.Queue(this, 'govbizai-batch-coordination-queue', {
      queueName: 'govbizai-batch-coordination-queue.fifo',
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: cdk.Duration.minutes(15),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: new sqs.Queue(this, 'govbizai-batch-coordination-dlq', {
          queueName: 'govbizai-batch-coordination-dlq.fifo',
          fifo: true,
        }),
      },
    });

    // Create Lambda layer for batch orchestration dependencies
    const batchOrchestrationLayer = new lambda.LayerVersion(this, 'govbizai-batch-orchestration-layer', {
      layerVersionName: 'govbizai-batch-orchestration-layer',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda-layers/batch-orchestration')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
      description: 'Batch orchestration dependencies including boto3, CloudWatch metrics, etc.',
    });

    // Common function properties for batch orchestration functions
    const batchFunctionProps = {
      runtime: lambda.Runtime.PYTHON_3_11,
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      layers: [batchOrchestrationLayer],
      environment: {
        COORDINATION_TABLE: batchCoordinationTable.tableName,
        PROGRESS_TABLE: progressTrackingTable.tableName,
        OPTIMIZATION_TABLE: batchOptimizationTable.tableName,
        SCHEDULE_TABLE: scheduleManagementTable.tableName,
        COORDINATION_QUEUE_URL: batchCoordinationQueue.queueUrl,
      },
    };

    // Create Batch Size Optimizer Lambda function
    const batchOptimizerFunction = new lambda.Function(this, 'govbizai-batch-optimizer-function', {
      ...batchFunctionProps,
      functionName: 'govbizai-batch-optimizer-function',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/batch-optimizer')),
      handler: 'batch_optimizer.lambda_handler',
      description: 'Optimizes batch sizes based on performance metrics and system constraints',
    });

    // Create Batch Processing Coordinator Lambda function
    const batchCoordinatorFunction = new lambda.Function(this, 'govbizai-batch-coordinator-function', {
      ...batchFunctionProps,
      functionName: 'govbizai-batch-coordinator-function',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/batch-coordinator')),
      handler: 'batch_coordinator.lambda_handler',
      description: 'Coordinates parallel batch processing with intelligent distribution',
    });

    // Create Progress Tracker Lambda function
    const progressTrackerFunction = new lambda.Function(this, 'govbizai-progress-tracker-function', {
      ...batchFunctionProps,
      functionName: 'govbizai-progress-tracker-function',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/progress-tracker')),
      handler: 'progress_tracker.lambda_handler',
      description: 'Tracks and reports real-time progress of batch processing operations',
    });

    // Create Schedule Manager Lambda function
    const scheduleManagerFunction = new lambda.Function(this, 'govbizai-schedule-manager-function', {
      ...batchFunctionProps,
      functionName: 'govbizai-schedule-manager-function',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/schedule-manager')),
      handler: 'schedule_manager.lambda_handler',
      description: 'Manages EventBridge schedules for batch processing operations',
    });

    // Grant permissions to Lambda functions
    batchCoordinationTable.grantReadWriteData(batchOptimizerFunction);
    batchCoordinationTable.grantReadWriteData(batchCoordinatorFunction);
    batchCoordinationTable.grantReadWriteData(progressTrackerFunction);

    progressTrackingTable.grantReadWriteData(progressTrackerFunction);
    progressTrackingTable.grantReadWriteData(batchCoordinatorFunction);

    batchOptimizationTable.grantReadWriteData(batchOptimizerFunction);
    scheduleManagementTable.grantReadWriteData(scheduleManagerFunction);

    batchCoordinationQueue.grantSendMessages(batchCoordinatorFunction);
    batchCoordinationQueue.grantConsumeMessages(batchCoordinatorFunction);

    // Grant CloudWatch permissions for metrics
    batchOptimizerFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudwatch:GetMetricStatistics',
        'cloudwatch:PutMetricData',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['*'],
    }));

    progressTrackerFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudwatch:PutMetricData',
        'sns:Publish',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['*'],
    }));

    // Grant EventBridge permissions to Schedule Manager
    scheduleManagerFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'events:PutRule',
        'events:DeleteRule',
        'events:DescribeRule',
        'events:PutTargets',
        'events:RemoveTargets',
        'events:ListTargetsByRule',
        'states:StartExecution',
        'states:DescribeExecution',
      ],
      resources: ['*'],
    }));

    // Create enhanced Step Functions Express workflow
    const enhancedProcessingStateMachine = this.createEnhancedProcessingStateMachine(
      batchOptimizerFunction,
      batchCoordinatorFunction,
      progressTrackerFunction,
      batchCoordinationQueue
    );

    // Create EventBridge rules for enhanced batch processing
    const enhancedNightlyRule = new events.Rule(this, 'govbizai-enhanced-nightly-processing-rule', {
      ruleName: 'govbizai-enhanced-nightly-processing-rule',
      description: 'Enhanced nightly processing with batch optimization at 2:00 AM EST',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '7', // 2:00 AM EST = 7:00 AM UTC
        day: '*',
        month: '*',
        year: '*',
      }),
      enabled: true,
    });

    enhancedNightlyRule.addTarget(new targets.SfnStateMachine(enhancedProcessingStateMachine, {
      input: events.RuleTargetInput.fromObject({
        processing_type: 'nightly_batch',
        enable_optimization: true,
        enable_progress_tracking: true,
      }),
    }));

    // Create API Gateway for batch orchestration management
    const batchOrchestrationApi = new apigateway.RestApi(this, 'govbizai-batch-orchestration-api', {
      restApiName: 'govbizai-batch-orchestration-api',
      description: 'API for managing batch processing orchestration',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
      },
    });

    const batchApiKey = batchOrchestrationApi.addApiKey('govbizai-batch-api-key', {
      apiKeyName: 'govbizai-batch-api-key',
      description: 'API Key for GovBizAI Batch Orchestration API',
    });

    const batchUsagePlan = batchOrchestrationApi.addUsagePlan('govbizai-batch-usage-plan', {
      name: 'govbizai-batch-usage-plan',
      description: 'Usage plan for GovBizAI Batch Orchestration API',
      throttle: {
        rateLimit: 1000,
        burstLimit: 2000,
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.DAY,
      },
    });

    batchUsagePlan.addApiKey(batchApiKey);

    // Create API Gateway integrations
    const optimizerIntegration = new apigateway.LambdaIntegration(batchOptimizerFunction);
    const coordinatorIntegration = new apigateway.LambdaIntegration(batchCoordinatorFunction);
    const progressIntegration = new apigateway.LambdaIntegration(progressTrackerFunction);
    const scheduleIntegration = new apigateway.LambdaIntegration(scheduleManagerFunction);

    // Add API resources and methods
    const batchResource = batchOrchestrationApi.root.addResource('batch');
    const optimizerResource = batchResource.addResource('optimizer');
    const coordinatorResource = batchResource.addResource('coordinator');
    const progressResource = batchResource.addResource('progress');
    const scheduleResource = batchResource.addResource('schedule');

    optimizerResource.addMethod('POST', optimizerIntegration, { apiKeyRequired: true });
    coordinatorResource.addMethod('POST', coordinatorIntegration, { apiKeyRequired: true });
    progressResource.addMethod('GET', progressIntegration, { apiKeyRequired: true });
    progressResource.addMethod('POST', progressIntegration, { apiKeyRequired: true });
    scheduleResource.addMethod('GET', scheduleIntegration, { apiKeyRequired: true });
    scheduleResource.addMethod('POST', scheduleIntegration, { apiKeyRequired: true });
    scheduleResource.addMethod('PUT', scheduleIntegration, { apiKeyRequired: true });
    scheduleResource.addMethod('DELETE', scheduleIntegration, { apiKeyRequired: true });

    batchUsagePlan.addApiStage({
      stage: batchOrchestrationApi.deploymentStage,
    });

    // Output Phase 8 component details
    new cdk.CfnOutput(this, 'BatchOptimizerFunctionArn', {
      value: batchOptimizerFunction.functionArn,
      description: 'ARN of the Batch Optimizer Lambda function',
      exportName: 'govbizai-batch-optimizer-function-arn',
    });

    new cdk.CfnOutput(this, 'BatchCoordinatorFunctionArn', {
      value: batchCoordinatorFunction.functionArn,
      description: 'ARN of the Batch Coordinator Lambda function',
      exportName: 'govbizai-batch-coordinator-function-arn',
    });

    new cdk.CfnOutput(this, 'ProgressTrackerFunctionArn', {
      value: progressTrackerFunction.functionArn,
      description: 'ARN of the Progress Tracker Lambda function',
      exportName: 'govbizai-progress-tracker-function-arn',
    });

    new cdk.CfnOutput(this, 'ScheduleManagerFunctionArn', {
      value: scheduleManagerFunction.functionArn,
      description: 'ARN of the Schedule Manager Lambda function',
      exportName: 'govbizai-schedule-manager-function-arn',
    });

    new cdk.CfnOutput(this, 'EnhancedProcessingStateMachineArn', {
      value: enhancedProcessingStateMachine.stateMachineArn,
      description: 'ARN of the Enhanced Processing Step Functions State Machine',
      exportName: 'govbizai-enhanced-processing-state-machine-arn',
    });

    new cdk.CfnOutput(this, 'BatchCoordinationQueueUrl', {
      value: batchCoordinationQueue.queueUrl,
      description: 'URL of the Batch Coordination SQS Queue',
      exportName: 'govbizai-batch-coordination-queue-url',
    });

    new cdk.CfnOutput(this, 'BatchOrchestrationApiEndpoint', {
      value: batchOrchestrationApi.url,
      description: 'Endpoint URL of the Batch Orchestration API',
      exportName: 'govbizai-batch-orchestration-api-endpoint',
    });

    new cdk.CfnOutput(this, 'BatchOrchestrationApiKey', {
      value: batchApiKey.keyId,
      description: 'API Key ID for the Batch Orchestration API',
      exportName: 'govbizai-batch-orchestration-api-key-id',
    });
  }

  private createEnhancedProcessingStateMachine(
    batchOptimizer: lambda.Function,
    batchCoordinator: lambda.Function,
    progressTracker: lambda.Function,
    coordinationQueue: sqs.Queue
  ): stepfunctions.StateMachine {
    // Define the enhanced Step Functions workflow with Express capabilities
    const optimizeBatchSizeTask = new stepfunctionsTasks.LambdaInvoke(this, 'Optimize Batch Size', {
      lambdaFunction: batchOptimizer,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(5)),
    });

    const coordinateProcessingTask = new stepfunctionsTasks.LambdaInvoke(this, 'Coordinate Processing', {
      lambdaFunction: batchCoordinator,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(10)),
    });

    const trackProgressTask = new stepfunctionsTasks.LambdaInvoke(this, 'Track Progress', {
      lambdaFunction: progressTracker,
      outputPath: '$.Payload',
      retryOnServiceExceptions: true,
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(2)),
    });

    // Create a wait state for progress monitoring
    const waitForProgress = new stepfunctions.Wait(this, 'Wait for Progress', {
      time: stepfunctions.WaitTime.duration(cdk.Duration.minutes(1)),
    });

    // Create a second track progress task for the monitoring loop
    const trackProgressTaskLoop = new stepfunctionsTasks.LambdaInvoke(this, 'Track Progress Loop', {
      lambdaFunction: progressTracker,
      resultPath: '$.progress',
      taskTimeout: stepfunctions.Timeout.duration(cdk.Duration.minutes(2)),
    });

    // Create choice state for progress monitoring
    const checkProgressChoice = new stepfunctions.Choice(this, 'Check Progress Status');

    // Define success and failure states
    const processingComplete = new stepfunctions.Succeed(this, 'Enhanced Processing Complete', {
      comment: 'Enhanced batch processing completed successfully',
    });

    const processingFailed = new stepfunctions.Fail(this, 'Enhanced Processing Failed', {
      comment: 'Enhanced batch processing failed',
    });

    // Create the enhanced workflow definition
    const definition = stepfunctions.Chain.start(optimizeBatchSizeTask)
      .next(coordinateProcessingTask)
      .next(trackProgressTask)
      .next(waitForProgress)
      .next(trackProgressTaskLoop)
      .next(checkProgressChoice
        .when(stepfunctions.Condition.stringEquals('$.progress.is_complete', 'true'), processingComplete)
        .when(stepfunctions.Condition.numberGreaterThan('$.progress.failed_batches', 0), processingFailed)
        .otherwise(waitForProgress));

    // Add comprehensive error handling
    optimizeBatchSizeTask.addCatch(processingFailed, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    coordinateProcessingTask.addCatch(processingFailed, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    trackProgressTask.addCatch(processingFailed, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });

    // Create the enhanced state machine as Express workflow
    const enhancedStateMachine = new stepfunctions.StateMachine(this, 'govbizai-enhanced-processing-state-machine', {
      stateMachineName: 'govbizai-enhanced-processing-state-machine',
      stateMachineType: stepfunctions.StateMachineType.EXPRESS,
      definition: definition,
      timeout: cdk.Duration.hours(4),
      logs: {
        destination: new logs.LogGroup(this, 'govbizai-enhanced-processing-logs', {
          logGroupName: '/aws/stepfunctions/govbizai-enhanced-processing-state-machine',
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        level: stepfunctions.LogLevel.ALL,
      },
    });

    return enhancedStateMachine;
  }

// Create the stub method

  // API Gateway infrastructure moved to separate ApiStack to avoid CloudFormation resource limits
  private createApiGatewayInfrastructure(): void {
    // This method has been temporarily disabled due to CloudFormation resource limits
    // The API Gateway infrastructure will be moved to a separate ApiStack
    console.log('API Gateway infrastructure moved to separate stack to avoid resource limits');
  }
}