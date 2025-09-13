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
import * as path from 'path';

export class InfrastructureStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
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

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create KMS key for encryption
    const kmsKey = new kms.Key(this, 'govbizai-encryption-key', {
      alias: 'govbizai-encryption-key',
      description: 'KMS key for GovBizAI system encryption',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev environment
    });

    // Add policy to allow CloudWatch Logs to use the KMS key
    kmsKey.addToResourcePolicy(new iam.PolicyStatement({
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
    kmsKey.addToResourcePolicy(new iam.PolicyStatement({
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

    // 1. Create VPC with public/private subnets
    this.vpc = new ec2.Vpc(this, 'govbizai-vpc', {
      vpcName: 'govbizai-vpc',
      maxAzs: 3,
      natGateways: 2, // For high availability
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'govbizai-public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'govbizai-private-subnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 28,
          name: 'govbizai-isolated-subnet',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
      ],
      gatewayEndpoints: {
        s3: {
          service: ec2.GatewayVpcEndpointAwsService.S3,
        },
        dynamodb: {
          service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
        }
      }
    });

    // 2. Create VPC Endpoints for AWS services
    const vpcEndpointSecurityGroup = this.createVpcEndpointSecurityGroup();
    
    const vpcEndpoints = [
      {
        service: ec2.InterfaceVpcEndpointAwsService.BEDROCK,
        name: 'govbizai-bedrock-endpoint'
      },
      {
        service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
        name: 'govbizai-bedrock-runtime-endpoint'
      },
      {
        service: ec2.InterfaceVpcEndpointAwsService.LAMBDA,
        name: 'govbizai-lambda-endpoint'
      },
      {
        service: ec2.InterfaceVpcEndpointAwsService.SQS,
        name: 'govbizai-sqs-endpoint'
      },
      {
        service: ec2.InterfaceVpcEndpointAwsService.SNS,
        name: 'govbizai-sns-endpoint'
      },
      {
        service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        name: 'govbizai-cloudwatch-logs-endpoint'
      },
      {
        service: ec2.InterfaceVpcEndpointAwsService.STEP_FUNCTIONS,
        name: 'govbizai-step-functions-endpoint'
      },
      {
        service: ec2.InterfaceVpcEndpointAwsService.EVENTBRIDGE,
        name: 'govbizai-eventbridge-endpoint'
      },
      {
        service: ec2.InterfaceVpcEndpointAwsService.TEXTRACT,
        name: 'govbizai-textract-endpoint'
      }
    ];

    vpcEndpoints.forEach(endpoint => {
      new ec2.InterfaceVpcEndpoint(this, endpoint.name, {
        vpc: this.vpc,
        service: endpoint.service,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        },
        privateDnsEnabled: true,
        securityGroups: [vpcEndpointSecurityGroup]
      });
    });

    // 3. Create S3 Buckets with encryption and lifecycle policies
    const s3BucketProps: Partial<s3.BucketProps> = {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kmsKey,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev environment
      autoDeleteObjects: true, // For dev environment
    };

    this.rawDocumentsBucket = new s3.Bucket(this, 'govbizai-raw-documents', {
      bucketName: `govbizai-raw-documents-${this.account}-${this.region}`,
      ...s3BucketProps,
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
      encryptionKey: kmsKey,
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

    // 8. Create IAM roles and policies
    this.createIAMRoles();

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
          'https://app.govbizai.com/auth/callback', // Production URL placeholder
        ],
        logoutUrls: [
          'http://localhost:3000/auth/logout', // For local development
          'https://app.govbizai.com/auth/logout', // Production URL placeholder
        ],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
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
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
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

  private createVpcEndpointSecurityGroup(): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this, 'govbizai-vpc-endpoint-sg', {
      vpc: this.vpc,
      description: 'Security group for VPC endpoints',
      allowAllOutbound: false,
    });

    // Allow HTTPS traffic from VPC
    sg.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow HTTPS from VPC'
    );

    return sg;
  }

  private createIAMRoles(): void {
    // Lambda execution role for document processing
    const lambdaExecutionRole = new iam.Role(this, 'govbizai-lambda-execution-role', {
      roleName: 'govbizai-lambda-execution-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
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
}
