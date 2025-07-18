/**
 * API Testing Tools System
 * 
 * Generates comprehensive test suites including unit tests,
 * integration tests, load tests, and performance benchmarks
 */

import { logger } from '@/lib/monitoring/logger'

export interface TestConfig {
  enabled: boolean
  generateUnitTests: boolean
  generateIntegrationTests: boolean
  generateLoadTests: boolean
  generatePerformanceTests: boolean
  testFrameworks: string[]
  outputFormat: 'jest' | 'mocha' | 'pytest' | 'junit'
}

export interface TestSuite {
  unitTests: string
  integrationTests: string
  loadTests: string
  performanceTests: string
  documentation: string
  configuration: string
}

export interface TestEndpoint {
  path: string
  method: string
  description: string
  testCases: TestCase[]
  loadTestConfig?: LoadTestConfig
}

export interface TestCase {
  name: string
  description: string
  input: any
  expectedOutput: any
  expectedStatus: number
  headers?: Record<string, string>
  setup?: string
  cleanup?: string
}

export interface LoadTestConfig {
  users: number
  duration: string
  rampUp: string
  scenarios: LoadTestScenario[]
}

export interface LoadTestScenario {
  name: string
  weight: number
  steps: LoadTestStep[]
}

export interface LoadTestStep {
  action: 'request' | 'wait' | 'think'
  endpoint?: string
  method?: string
  data?: any
  duration?: number
}

export class ApiTestingTools {
  private config: TestConfig
  private endpoints: Map<string, TestEndpoint> = new Map()

  constructor(config: any) {
    this.config = {
      enabled: true,
      generateUnitTests: true,
      generateIntegrationTests: true,
      generateLoadTests: true,
      generatePerformanceTests: true,
      testFrameworks: ['jest', 'playwright'],
      outputFormat: 'jest',
      ...config
    }

    this.initializeTestEndpoints()
  }

  /**
   * Initialize testing tools
   */
  async initialize(): Promise<void> {
    try {
      if (!this.config.enabled) {
        logger.info('API testing tools disabled')
        return
      }

      logger.info('API testing tools initialized successfully', {
        endpointsCount: this.endpoints.size,
        frameworks: this.config.testFrameworks
      })

    } catch (error) {
      logger.error('Failed to initialize API testing tools', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate complete test suite
   */
  async generateTestSuite(): Promise<TestSuite> {
    try {
      const unitTests = this.config.generateUnitTests ? await this.generateUnitTests() : ''
      const integrationTests = this.config.generateIntegrationTests ? await this.generateIntegrationTests() : ''
      const loadTests = this.config.generateLoadTests ? await this.generateLoadTests() : ''
      const performanceTests = this.config.generatePerformanceTests ? await this.generatePerformanceTests() : ''
      const documentation = await this.generateTestDocumentation()
      const configuration = await this.generateTestConfiguration()

      return {
        unitTests,
        integrationTests,
        loadTests,
        performanceTests,
        documentation,
        configuration
      }

    } catch (error) {
      logger.error('Failed to generate test suite', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate unit tests
   */
  async generateUnitTests(): Promise<string> {
    try {
      let tests = this.getUnitTestHeader()

      for (const endpoint of this.endpoints.values()) {
        tests += this.generateEndpointUnitTests(endpoint)
      }

      tests += this.getUnitTestFooter()
      return tests

    } catch (error) {
      logger.error('Failed to generate unit tests', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate integration tests
   */
  async generateIntegrationTests(): Promise<string> {
    try {
      let tests = this.getIntegrationTestHeader()

      // Authentication tests
      tests += this.generateAuthenticationTests()

      // API flow tests
      tests += this.generateApiFlowTests()

      // Error handling tests
      tests += this.generateErrorHandlingTests()

      tests += this.getIntegrationTestFooter()
      return tests

    } catch (error) {
      logger.error('Failed to generate integration tests', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate load tests
   */
  async generateLoadTests(): Promise<string> {
    try {
      let tests = this.getLoadTestHeader()

      for (const endpoint of this.endpoints.values()) {
        if (endpoint.loadTestConfig) {
          tests += this.generateEndpointLoadTest(endpoint)
        }
      }

      tests += this.getLoadTestFooter()
      return tests

    } catch (error) {
      logger.error('Failed to generate load tests', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate performance tests
   */
  async generatePerformanceTests(): Promise<string> {
    try {
      return `
/**
 * Performance Tests for GovBiz.ai API
 * Tests response times, throughput, and resource usage
 */

const { performance } = require('perf_hooks');
const axios = require('axios');

describe('API Performance Tests', () => {
  const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
  const API_KEY = process.env.GOVBIZ_API_KEY;
  
  let client;

  beforeAll(() => {
    client = axios.create({
      baseURL: BASE_URL,
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  });

  describe('Response Time Tests', () => {
    test('Sources Sought endpoint should respond within 500ms', async () => {
      const start = performance.now();
      
      const response = await client.get('/sources-sought?limit=10');
      
      const end = performance.now();
      const responseTime = end - start;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(500);
      
      console.log(\`Sources Sought response time: \${responseTime.toFixed(2)}ms\`);
    });

    test('User profile endpoint should respond within 200ms', async () => {
      const start = performance.now();
      
      const response = await client.get('/users/profile');
      
      const end = performance.now();
      const responseTime = end - start;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(200);
      
      console.log(\`User profile response time: \${responseTime.toFixed(2)}ms\`);
    });
  });

  describe('Throughput Tests', () => {
    test('Should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const requests = Array(concurrentRequests).fill().map(() => 
        client.get('/sources-sought?limit=5')
      );
      
      const start = performance.now();
      const responses = await Promise.all(requests);
      const end = performance.now();
      
      const totalTime = end - start;
      const avgResponseTime = totalTime / concurrentRequests;
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      expect(avgResponseTime).toBeLessThan(1000);
      
      console.log(\`\${concurrentRequests} concurrent requests completed in \${totalTime.toFixed(2)}ms\`);
      console.log(\`Average response time: \${avgResponseTime.toFixed(2)}ms\`);
    });
  });

  describe('Memory Usage Tests', () => {
    test('Large dataset requests should not cause memory leaks', async () => {
      const initialMemory = process.memoryUsage();
      
      // Make multiple large requests
      for (let i = 0; i < 5; i++) {
        await client.get('/sources-sought?limit=100');
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      console.log(\`Memory increase: \${(memoryIncrease / 1024 / 1024).toFixed(2)}MB\`);
    });
  });
});
`

    } catch (error) {
      logger.error('Failed to generate performance tests', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate test documentation
   */
  async generateTestDocumentation(): Promise<string> {
    try {
      return `# GovBiz.ai API Test Suite

Comprehensive test suite for the GovBiz.ai API including unit tests, integration tests, load tests, and performance tests.

## Overview

This test suite covers:
- **Unit Tests**: Individual endpoint testing with various scenarios
- **Integration Tests**: End-to-end workflows and authentication
- **Load Tests**: Performance under load with K6
- **Performance Tests**: Response times and resource usage

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Docker (for load testing)

### Installation

\`\`\`bash
npm install
\`\`\`

### Environment Variables

Create a \`.env.test\` file:

\`\`\`
API_BASE_URL=http://localhost:3000/api
GOVBIZ_API_KEY=test-api-key
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=testpassword123
\`\`\`

## Running Tests

### All Tests
\`\`\`bash
npm test
\`\`\`

### Unit Tests Only
\`\`\`bash
npm run test:unit
\`\`\`

### Integration Tests Only
\`\`\`bash
npm run test:integration
\`\`\`

### Load Tests
\`\`\`bash
npm run test:load
\`\`\`

### Performance Tests
\`\`\`bash
npm run test:performance
\`\`\`

## Test Structure

\`\`\`
tests/
├── unit/           # Unit tests for individual endpoints
├── integration/    # End-to-end integration tests
├── load/          # K6 load testing scripts
├── performance/   # Performance and memory tests
└── helpers/       # Shared test utilities
\`\`\`

## Test Data

Test data is automatically generated and cleaned up after each test run. The test suite includes:

- Mock Sources Sought opportunities
- Test user accounts
- Sample workflow configurations
- Validation test cases

## Continuous Integration

This test suite is designed to run in CI/CD pipelines with:

- Parallel test execution
- Test result reporting
- Coverage analysis
- Performance regression detection

## Test Coverage Goals

- **Unit Tests**: >90% code coverage
- **Integration Tests**: All critical user flows
- **Load Tests**: Handle 1000+ concurrent users
- **Performance Tests**: <500ms average response time

## Troubleshooting

### Common Issues

1. **Connection Refused**: Ensure API server is running
2. **Authentication Errors**: Check API key configuration
3. **Timeout Errors**: Increase timeout values for slow networks
4. **Memory Issues**: Run tests with \`--max-old-space-size=4096\`

### Debugging

Run tests with debug output:
\`\`\`bash
DEBUG=api:* npm test
\`\`\`

### Test Reports

Test results are saved to:
- \`reports/unit-tests.xml\` (JUnit format)
- \`reports/coverage/\` (Coverage reports)
- \`reports/performance.json\` (Performance metrics)

## Contributing

When adding new endpoints or features:

1. Add unit tests for all new functionality
2. Update integration tests for user flows
3. Add load test scenarios for high-traffic endpoints
4. Document any new test requirements

For more information, see the [API Documentation](https://docs.govbiz.ai).
`

    } catch (error) {
      logger.error('Failed to generate test documentation', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Add test endpoint
   */
  addTestEndpoint(endpoint: TestEndpoint): void {
    const key = `${endpoint.method}_${endpoint.path}`
    this.endpoints.set(key, endpoint)
  }

  /**
   * Shutdown testing tools
   */
  async shutdown(): Promise<void> {
    try {
      this.endpoints.clear()
      logger.info('API testing tools shutdown complete')

    } catch (error) {
      logger.error('API testing tools shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private initializeTestEndpoints(): void {
    // Sources Sought endpoints
    this.addTestEndpoint({
      path: '/sources-sought',
      method: 'GET',
      description: 'Get Sources Sought opportunities',
      testCases: [
        {
          name: 'should return paginated opportunities',
          description: 'Test basic pagination functionality',
          input: { page: 1, limit: 10 },
          expectedOutput: { success: true, data: { opportunities: [], pagination: {} } },
          expectedStatus: 200
        },
        {
          name: 'should filter by NAICS code',
          description: 'Test filtering functionality',
          input: { naics: '541511' },
          expectedOutput: { success: true },
          expectedStatus: 200
        },
        {
          name: 'should handle invalid parameters',
          description: 'Test validation error handling',
          input: { page: -1 },
          expectedOutput: { success: false, error: { code: 'VALIDATION_ERROR' } },
          expectedStatus: 400
        }
      ],
      loadTestConfig: {
        users: 100,
        duration: '5m',
        rampUp: '30s',
        scenarios: [
          {
            name: 'browse_opportunities',
            weight: 80,
            steps: [
              { action: 'request', endpoint: '/sources-sought', method: 'GET' },
              { action: 'think', duration: 2000 }
            ]
          }
        ]
      }
    })

    this.addTestEndpoint({
      path: '/workflows',
      method: 'POST',
      description: 'Create workflow',
      testCases: [
        {
          name: 'should create valid workflow',
          description: 'Test workflow creation with valid data',
          input: {
            name: 'Test Workflow',
            type: 'sources_sought_response',
            triggers: ['new_opportunity'],
            steps: [{ type: 'analyze_requirements' }]
          },
          expectedOutput: { success: true, data: { id: expect.any(String) } },
          expectedStatus: 201
        },
        {
          name: 'should reject invalid workflow type',
          description: 'Test validation of workflow type',
          input: {
            name: 'Invalid Workflow',
            type: 'invalid_type',
            triggers: [],
            steps: []
          },
          expectedOutput: { success: false, error: { code: 'VALIDATION_ERROR' } },
          expectedStatus: 400
        }
      ]
    })
  }

  private getUnitTestHeader(): string {
    return `/**
 * Unit Tests for GovBiz.ai API
 * Generated automatically - modify with caution
 */

const request = require('supertest');
const app = require('../src/app');
const { ApiManager } = require('../src/lib/api');

describe('GovBiz.ai API Unit Tests', () => {
  let apiManager;

  beforeAll(async () => {
    apiManager = new ApiManager();
    await apiManager.initialize();
  });

  afterAll(async () => {
    await apiManager.shutdown();
  });

  beforeEach(() => {
    // Reset any mocks or test state
  });

`
  }

  private getUnitTestFooter(): string {
    return `});
`
  }

  private generateEndpointUnitTests(endpoint: TestEndpoint): string {
    let tests = `
  describe('${endpoint.method} ${endpoint.path}', () => {
    describe('${endpoint.description}', () => {
`

    for (const testCase of endpoint.testCases) {
      tests += `
      test('${testCase.name}', async () => {
        // ${testCase.description}
        ${testCase.setup || ''}
        
        const response = await request(app)
          .${endpoint.method.toLowerCase()}('${endpoint.path}')
          ${testCase.headers ? `.set(${JSON.stringify(testCase.headers)})` : ''}
          ${endpoint.method !== 'GET' ? `.send(${JSON.stringify(testCase.input)})` : ''}
          ${endpoint.method === 'GET' && testCase.input ? `.query(${JSON.stringify(testCase.input)})` : ''}
          .expect(${testCase.expectedStatus});

        expect(response.body).toMatchObject(${JSON.stringify(testCase.expectedOutput, null, 8)});
        
        ${testCase.cleanup || ''}
      });
`
    }

    tests += `
    });
  });
`

    return tests
  }

  private getIntegrationTestHeader(): string {
    return `/**
 * Integration Tests for GovBiz.ai API
 * Tests complete user flows and system integration
 */

const axios = require('axios');
const { setupTestEnvironment, teardownTestEnvironment } = require('./helpers/test-setup');

describe('GovBiz.ai API Integration Tests', () => {
  let client;
  let testUser;

  beforeAll(async () => {
    await setupTestEnvironment();
    
    client = axios.create({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000/api',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

`
  }

  private getIntegrationTestFooter(): string {
    return `});
`
  }

  private generateAuthenticationTests(): string {
    return `
  describe('Authentication', () => {
    test('should reject requests without API key', async () => {
      try {
        await client.get('/sources-sought');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
        expect(error.response.data.error.code).toBe('AUTHENTICATION_REQUIRED');
      }
    });

    test('should reject requests with invalid API key', async () => {
      try {
        await client.get('/sources-sought', {
          headers: { 'X-API-Key': 'invalid-key' }
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });

    test('should accept requests with valid API key', async () => {
      const response = await client.get('/sources-sought', {
        headers: { 'X-API-Key': process.env.GOVBIZ_API_KEY }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });
`
  }

  private generateApiFlowTests(): string {
    return `
  describe('Complete User Flows', () => {
    test('Sources Sought discovery and response workflow', async () => {
      // Set up authenticated client
      const authClient = axios.create({
        ...client.defaults,
        headers: {
          ...client.defaults.headers,
          'X-API-Key': process.env.GOVBIZ_API_KEY
        }
      });

      // 1. Get Sources Sought opportunities
      const opportunitiesResponse = await authClient.get('/sources-sought?limit=5');
      expect(opportunitiesResponse.status).toBe(200);
      expect(opportunitiesResponse.data.success).toBe(true);
      expect(Array.isArray(opportunitiesResponse.data.data.opportunities)).toBe(true);

      // 2. Get specific opportunity details
      if (opportunitiesResponse.data.data.opportunities.length > 0) {
        const opportunityId = opportunitiesResponse.data.data.opportunities[0].id;
        const detailResponse = await authClient.get(\`/sources-sought/\${opportunityId}\`);
        expect(detailResponse.status).toBe(200);
        expect(detailResponse.data.data.id).toBe(opportunityId);
      }

      // 3. Create workflow for automated response
      const workflowResponse = await authClient.post('/workflows', {
        name: 'Integration Test Workflow',
        type: 'sources_sought_response',
        triggers: ['new_opportunity'],
        steps: [
          { type: 'analyze_requirements' },
          { type: 'generate_response' },
          { type: 'review_required' }
        ]
      });
      expect(workflowResponse.status).toBe(201);
      expect(workflowResponse.data.success).toBe(true);

      // 4. Verify workflow was created
      const workflowsResponse = await authClient.get('/workflows');
      expect(workflowsResponse.status).toBe(200);
      const createdWorkflow = workflowsResponse.data.data.find(
        w => w.id === workflowResponse.data.data.id
      );
      expect(createdWorkflow).toBeDefined();
      expect(createdWorkflow.name).toBe('Integration Test Workflow');
    });

    test('User profile management flow', async () => {
      const authClient = axios.create({
        ...client.defaults,
        headers: {
          ...client.defaults.headers,
          'X-API-Key': process.env.GOVBIZ_API_KEY
        }
      });

      // 1. Get current profile
      const profileResponse = await authClient.get('/users/profile');
      expect(profileResponse.status).toBe(200);
      expect(profileResponse.data.success).toBe(true);

      // 2. Update profile
      const updatedProfile = {
        ...profileResponse.data.data,
        firstName: 'Updated',
        lastName: 'TestUser'
      };
      
      const updateResponse = await authClient.put('/users/profile', updatedProfile);
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data.data.firstName).toBe('Updated');

      // 3. Verify update persisted
      const verifyResponse = await authClient.get('/users/profile');
      expect(verifyResponse.data.data.firstName).toBe('Updated');
      expect(verifyResponse.data.data.lastName).toBe('TestUser');
    });
  });
`
  }

  private generateErrorHandlingTests(): string {
    return `
  describe('Error Handling', () => {
    const authClient = axios.create({
      ...client.defaults,
      headers: {
        ...client.defaults.headers,
        'X-API-Key': process.env.GOVBIZ_API_KEY
      }
    });

    test('should handle validation errors gracefully', async () => {
      try {
        await authClient.post('/workflows', {
          name: '', // Invalid: empty name
          type: 'invalid_type', // Invalid: wrong type
          triggers: [], // Invalid: no triggers
          steps: [] // Invalid: no steps
        });
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.success).toBe(false);
        expect(error.response.data.error.code).toBe('VALIDATION_ERROR');
        expect(Array.isArray(error.response.data.error.details.errors)).toBe(true);
      }
    });

    test('should handle not found errors', async () => {
      try {
        await authClient.get('/sources-sought/nonexistent-id');
        fail('Should have thrown not found error');
      } catch (error) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error.code).toBe('NOT_FOUND');
      }
    });

    test('should handle rate limiting', async () => {
      // This test might need to be adjusted based on actual rate limits
      const requests = Array(100).fill().map(() => 
        authClient.get('/sources-sought?limit=1')
      );

      try {
        await Promise.all(requests);
      } catch (error) {
        if (error.response && error.response.status === 429) {
          expect(error.response.data.error.code).toBe('RATE_LIMIT_EXCEEDED');
          expect(error.response.headers['retry-after']).toBeDefined();
        }
      }
    });

    test('should handle server errors gracefully', async () => {
      // This would test how the API handles internal errors
      // Implementation depends on how you want to simulate server errors
    });
  });
`
  }

  private getLoadTestHeader(): string {
    return `/**
 * Load Tests for GovBiz.ai API
 * K6 load testing scripts
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
export let errorRate = new Rate('errors');

// Test configuration
export let options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up
    { duration: '1m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 100 }, // Ramp to 100 users
    { duration: '2m', target: 100 },  // Stay at 100 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.1'],    // Error rate must be below 10%
    errors: ['rate<0.1'],             // Custom error rate
  },
};

// Test setup
export function setup() {
  const baseUrl = __ENV.API_BASE_URL || 'http://localhost:3000/api';
  const apiKey = __ENV.GOVBIZ_API_KEY || 'test-api-key';
  
  return { baseUrl, apiKey };
}

export default function(data) {
  const { baseUrl, apiKey } = data;
  
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  };

`
  }

  private generateEndpointLoadTest(endpoint: TestEndpoint): string {
    if (!endpoint.loadTestConfig) return ''

    return `
  // Load test for ${endpoint.method} ${endpoint.path}
  group('${endpoint.description}', function() {
    ${endpoint.loadTestConfig.scenarios.map(scenario => `
    // Scenario: ${scenario.name} (${scenario.weight}% of traffic)
    if (Math.random() < ${scenario.weight / 100}) {
      ${scenario.steps.map(step => {
        if (step.action === 'request') {
          return `
      let response = http.${step.method?.toLowerCase() || 'get'}(\`\${baseUrl}${step.endpoint || endpoint.path}\`, ${step.data ? JSON.stringify(step.data) : 'null'}, { headers });
      check(response, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
      });
      errorRate.add(response.status !== 200);`
        } else if (step.action === 'think' || step.action === 'wait') {
          return `
      sleep(${(step.duration || 1000) / 1000});`
        }
        return ''
      }).join('')}
    }
    `).join('')}
  });
`
  }

  private getLoadTestFooter(): string {
    return `
}

export function teardown(data) {
  // Cleanup after load test
  console.log('Load test completed');
}
`
  }

  private async generateTestConfiguration(): Promise<string> {
    return `{
  "name": "govbiz-api-tests",
  "version": "1.0.0",
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:load": "k6 run tests/load/load-test.js",
    "test:performance": "jest tests/performance --detectOpenHandles",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --watchAll=false"
  },
  "jest": {
    "testEnvironment": "node",
    "collectCoverageFrom": [
      "src/**/*.{js,ts}",
      "!src/**/*.d.ts",
      "!src/tests/**"
    ],
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    },
    "setupFilesAfterEnv": ["<rootDir>/tests/setup.js"],
    "testTimeout": 30000
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.3",
    "axios": "^1.5.0",
    "@types/jest": "^29.5.5",
    "@types/supertest": "^2.0.15"
  }
}
`
  }
}

export default ApiTestingTools