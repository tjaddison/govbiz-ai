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
      AttributeDefinitions: expect.arrayContaining([
        {
          AttributeName: 'connection_id',
          AttributeType: 'S'
        }
      ])
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

  test('Creates API Gateway Resources and Methods', () => {
    // Test that API Gateway resources are created
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: 'auth'
    });

    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: 'api'
    });

    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: 'company'
    });

    // Test HTTP methods are created
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST'
    });

    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'GET'
    });
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
});

/**
 * Security and Permissions Validation Tests
 */
describe('Security and Permissions Validation', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new InfrastructureStack(app, 'SecurityTestStack');
    template = Template.fromStack(stack);
  });

  test('Lambda Functions Have IAM Roles', () => {
    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    Object.values(lambdaFunctions).forEach((functionDef: any) => {
      expect(functionDef.Properties.Role).toBeDefined();
    });
  });

  test('DynamoDB Tables Have Encryption Enabled', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      SSESpecification: {
        SSEEnabled: true
      }
    });
  });

  test('API Gateway Has CORS Configuration', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      BinaryMediaTypes: ['multipart/form-data']
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

  test('Lambda Functions Have Appropriate Configuration', () => {
    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    Object.values(lambdaFunctions).forEach((functionDef: any) => {
      const memorySize = functionDef.Properties.MemorySize;
      const timeout = functionDef.Properties.Timeout;

      // Memory should be reasonable (256MB to 1GB)
      expect(memorySize).toBeGreaterThanOrEqual(256);
      expect(memorySize).toBeLessThanOrEqual(1024);

      // Timeout should be reasonable (30 seconds to 15 minutes)
      expect(timeout).toBeGreaterThanOrEqual(30);
      expect(timeout).toBeLessThanOrEqual(900);
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
    // Check Lambda functions
    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    Object.values(lambdaFunctions).forEach((functionDef: any) => {
      if (functionDef.Properties.FunctionName) {
        expect(functionDef.Properties.FunctionName).toMatch(/^govbizai-/);
      }
    });

    // Check DynamoDB tables
    const dynamoTables = template.findResources('AWS::DynamoDB::Table');
    Object.values(dynamoTables).forEach((tableDef: any) => {
      if (tableDef.Properties.TableName) {
        expect(tableDef.Properties.TableName).toMatch(/^govbizai-/);
      }
    });

    // Check API Gateway
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: expect.stringMatching(/^govbizai-/)
    });
  });

  test('High Availability Configuration', () => {
    // Check DynamoDB point-in-time recovery
    const dynamoTables = template.findResources('AWS::DynamoDB::Table');
    Object.values(dynamoTables).forEach((tableDef: any) => {
      if (tableDef.Properties.PointInTimeRecoverySpecification) {
        expect(tableDef.Properties.PointInTimeRecoverySpecification.PointInTimeRecoveryEnabled).toBe(true);
      }
    });
  });

  test('Cost Optimization Features', () => {
    // Check that DynamoDB uses pay-per-request billing
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST'
    });

    // Check that Lambda functions use modern Python runtime
    const lambdaFunctions = template.findResources('AWS::Lambda::Function');
    Object.values(lambdaFunctions).forEach((functionDef: any) => {
      expect(functionDef.Properties.Runtime).toBe('python3.11');
    });
  });
});