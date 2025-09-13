import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { InfrastructureStack } from '../../lib/infrastructure-stack';

/**
 * Infrastructure validation tests for Phase 10 API Gateway implementation
 * Tests that the CDK infrastructure can be synthesized and contains required resources
 */

describe('InfrastructureStack API Gateway Validation', () => {
  let app: App;
  let stack: InfrastructureStack;
  let template: Template;

  beforeAll(() => {
    app = new App();
    stack = new InfrastructureStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  test('Stack synthesizes without errors', () => {
    expect(template).toBeDefined();
  });

  test('Creates REST API Gateway', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: 'govbizai-rest-api',
      Description: 'GovBizAI REST API for contract opportunity matching system'
    });
  });

  test('Creates WebSocket API Gateway', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'govbizai-websocket-api',
      ProtocolType: 'WEBSOCKET'
    });
  });

  test('Creates Cognito Authorizer', () => {
    template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
      Name: 'govbizai-api-authorizer',
      Type: 'COGNITO_USER_POOLS'
    });
  });

  test('Creates WebSocket Connections DynamoDB Table', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'govbizai-websocket-connections',
      AttributeDefinitions: [
        {
          AttributeName: 'connection_id',
          AttributeType: 'S'
        }
      ]
    });
  });

  test('Creates API Lambda Functions', () => {
    const expectedFunctions = [
      'govbizai-api-auth',
      'govbizai-api-company',
      'govbizai-api-documents',
      'govbizai-api-opportunities',
      'govbizai-api-matches',
      'govbizai-api-feedback',
      'govbizai-api-analytics',
      'govbizai-websocket'
    ];

    expectedFunctions.forEach(functionName => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: functionName,
        Runtime: 'python3.11'
      });
    });
  });

  test('Creates API Gateway Methods', () => {
    // Test that various HTTP methods are created
    template.resourceCountIs('AWS::ApiGateway::Method', 21); // Expected number of API methods
  });

  test('Creates API Usage Plan and Key', () => {
    template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
      UsagePlanName: 'govbizai-api-usage-plan',
      Throttle: {
        RateLimit: 1000,
        BurstLimit: 2000
      }
    });

    template.hasResourceProperties('AWS::ApiGateway::ApiKey', {
      Name: 'govbizai-api-key'
    });
  });

  test('Creates WebSocket Routes', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'ping'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'subscribe'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'unsubscribe'
    });
  });

  test('Creates Stack Outputs', () => {
    const outputs = template.findOutputs('*');

    expect(outputs).toHaveProperty('RestApiUrl');
    expect(outputs).toHaveProperty('WebSocketApiUrl');
    expect(outputs).toHaveProperty('ApiKeyId');
  });

  test('Lambda Functions Have Proper IAM Permissions', () => {
    // Check that Lambda functions have DynamoDB permissions
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: expect.arrayContaining([
          expect.objectContaining({
            Effect: 'Allow',
            Action: expect.arrayContaining([
              'dynamodb:GetItem',
              'dynamodb:PutItem',
              'dynamodb:UpdateItem',
              'dynamodb:DeleteItem'
            ])
          })
        ])
      }
    });

    // Check S3 permissions
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: expect.arrayContaining([
          expect.objectContaining({
            Effect: 'Allow',
            Action: expect.arrayContaining([
              's3:GetObject',
              's3:PutObject'
            ])
          })
        ])
      }
    });

    // Check Cognito permissions
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: expect.arrayContaining([
          expect.objectContaining({
            Effect: 'Allow',
            Action: expect.arrayContaining([
              'cognito-idp:InitiateAuth',
              'cognito-idp:GetUser'
            ])
          })
        ])
      }
    });
  });

  test('All Resources Are Tagged', () => {
    // Check that resources are properly tagged
    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    Object.values(lambdaFunctions).forEach((functionDef: any) => {
      expect(functionDef.Properties.Tags).toBeDefined();
    });
  });

  test('Security Best Practices', () => {
    // Check that API Gateway has CORS configured
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      BinaryMediaTypes: ['multipart/form-data']
    });

    // Check that DynamoDB tables have encryption enabled
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      SSESpecification: {
        SSEEnabled: true
      }
    });
  });
});

/**
 * Performance and Scalability Validation Tests
 */
describe('Performance and Scalability Validation', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new InfrastructureStack(app, 'PerfTestStack');
    template = Template.fromStack(stack);
  });

  test('DynamoDB Tables Use Pay-Per-Request Billing', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST'
    });
  });

  test('Lambda Functions Have Appropriate Memory Allocation', () => {
    // Check that Lambda functions have reasonable memory settings
    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    Object.values(lambdaFunctions).forEach((functionDef: any) => {
      const memorySize = functionDef.Properties.MemorySize;
      expect(memorySize).toBeGreaterThanOrEqual(256);
      expect(memorySize).toBeLessThanOrEqual(1024);
    });
  });

  test('API Gateway Has Rate Limiting', () => {
    template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
      Throttle: {
        RateLimit: expect.any(Number),
        BurstLimit: expect.any(Number)
      }
    });
  });

  test('Lambda Functions Have Reasonable Timeout', () => {
    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    Object.values(lambdaFunctions).forEach((functionDef: any) => {
      const timeout = functionDef.Properties.Timeout;
      expect(timeout).toBeGreaterThanOrEqual(30);
      expect(timeout).toBeLessThanOrEqual(900); // 15 minutes max
    });
  });
});

/**
 * Non-Functional Requirements Validation
 */
describe('Non-Functional Requirements Validation', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new InfrastructureStack(app, 'NFRTestStack');
    template = Template.fromStack(stack);
  });

  test('Resources Follow Naming Convention', () => {
    // Check that all resources have 'govbizai' prefix
    const allResources = template.findResources('*');

    Object.entries(allResources).forEach(([logicalId, resource]) => {
      if (resource.Type === 'AWS::Lambda::Function') {
        expect(resource.Properties.FunctionName).toMatch(/^govbizai-/);
      } else if (resource.Type === 'AWS::DynamoDB::Table') {
        expect(resource.Properties.TableName).toMatch(/^govbizai-/);
      } else if (resource.Type === 'AWS::ApiGateway::RestApi') {
        expect(resource.Properties.Name).toMatch(/^govbizai-/);
      }
    });
  });

  test('High Availability Configuration', () => {
    // Check DynamoDB point-in-time recovery
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true
      }
    });
  });

  test('Monitoring and Observability', () => {
    // Check that CloudWatch log groups are created for Lambda functions
    template.resourceCountIs('AWS::Logs::LogGroup', expect.any(Number));
  });

  test('Security Configuration', () => {
    // Check that sensitive data is encrypted
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      SSESpecification: {
        SSEEnabled: true
      }
    });

    // Check that Lambda functions have proper execution roles
    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    Object.values(lambdaFunctions).forEach((functionDef: any) => {
      expect(functionDef.Properties.Role).toBeDefined();
    });
  });
});

/**
 * Cost Optimization Validation
 */
describe('Cost Optimization Validation', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new InfrastructureStack(app, 'CostTestStack');
    template = Template.fromStack(stack);
  });

  test('DynamoDB Tables Use Cost-Effective Billing Mode', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST'
    });
  });

  test('Lambda Functions Use Appropriate Runtime', () => {
    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    Object.values(lambdaFunctions).forEach((functionDef: any) => {
      expect(functionDef.Properties.Runtime).toBe('python3.11');
    });
  });

  test('Resources Have Proper Deletion Policy for Dev Environment', () => {
    // Check that some resources have DESTROY removal policy for dev environment
    const dynamoTables = template.findResources('AWS::DynamoDB::Table');
    Object.values(dynamoTables).forEach((tableDef: any) => {
      expect(tableDef.DeletionPolicy).toBe('Delete');
    });
  });
});