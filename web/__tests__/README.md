# GovBiz.ai Testing Suite

This directory contains comprehensive tests for the GovBiz.ai platform, including unit tests, integration tests, security tests, and performance tests.

## Test Structure

```
__tests__/
├── lib/                    # Unit tests for library modules
│   ├── agents/            # Agent system tests
│   └── aws-config.test.ts # AWS configuration tests
├── integration/           # Integration tests
│   └── sources-sought-workflow.test.ts
├── security/              # Security and compliance tests
│   └── authentication.test.ts
├── performance/           # Performance and load tests
│   └── load-testing.test.ts
├── mocks/                 # Mock data and handlers
│   └── handlers.ts        # MSW API mocks
└── utils/                 # Test utilities and helpers
    └── test-helpers.ts    # Common test functions
```

## Test Categories

### Unit Tests (`lib/`)
- **Agent System Tests**: Test individual agents and orchestrator
- **Configuration Tests**: Validate AWS configuration and environment setup
- **Utility Function Tests**: Test helper functions and utilities

### Integration Tests (`integration/`)
- **End-to-End Workflows**: Test complete Sources Sought workflows
- **Agent Communication**: Test inter-agent messaging and coordination
- **External API Integration**: Test SAM.gov and other external services

### Security Tests (`security/`)
- **Authentication & Authorization**: Test login, session management, and access controls
- **Input Validation**: Test against injection attacks and malicious input
- **Data Protection**: Test PII detection and encryption
- **Compliance**: Validate government security requirements

### Performance Tests (`performance/`)
- **Response Time**: Measure operation execution times
- **Load Testing**: Test system behavior under concurrent load
- **Resource Usage**: Monitor memory and CPU usage
- **Scalability**: Test system limits and degradation patterns

## Running Tests

### All Tests
```bash
npm test                    # Run all tests
npm run test:ci            # Run tests in CI mode with coverage
npm run test:coverage      # Generate coverage report
```

### Specific Test Suites
```bash
npm run test:unit          # Run unit tests only
npm run test:integration   # Run integration tests only
npm run test:security      # Run security tests only
npm run test:all           # Run unit, integration, and security tests
```

### Watch Mode
```bash
npm run test:watch         # Run tests in watch mode
```

### End-to-End Tests
```bash
npm run test:e2e           # Run Playwright E2E tests (when implemented)
```

## Test Configuration

### Jest Configuration (`jest.config.js`)
- Uses Next.js Jest configuration
- Custom matchers for validation (UUID, email, timestamp)
- Coverage thresholds:
  - Global: 70% coverage
  - Agent modules: 80% coverage
  - AWS config: 90% coverage

### Setup Files
- `jest.setup.js`: Global test setup and mocks
- `jest.env.js`: Environment variables for testing
- `__tests__/mocks/handlers.ts`: MSW API mock definitions

## Mock Data and Services

### Mock Service Worker (MSW)
The test suite uses MSW to mock external API calls:
- SAM.gov API responses
- Internal API endpoints
- Error scenarios and edge cases

### Test Helpers
Common utilities for generating test data:
- `generateMockUser()`: Create test user objects
- `generateMockOpportunity()`: Create test opportunity data
- `createMockAgent()`: Create mock agents for testing
- `expectEventually()`: Wait for async conditions
- `measureExecutionTime()`: Performance testing utilities

## Test Data

### Mock Opportunities
```typescript
const mockOpportunity = generateMockOpportunity({
  title: 'Software Development Services',
  naicsCode: '541511',
  agency: 'Department of Defense',
})
```

### Mock User Profiles
```typescript
const userProfile = createTestUserProfile(['541511', '541512'])
```

### Mock Agent Messages
```typescript
const message = generateMockAgentMessage({
  capability: 'search_opportunities',
  input: { keywords: ['software'] },
})
```

## Custom Matchers

The test suite includes custom Jest matchers:

```typescript
expect(uuid).toBeValidUUID()
expect(email).toBeValidEmail()
expect(timestamp).toHaveValidTimestamp()
```

## Security Testing

Security tests validate:
- Authentication flow and session management
- Input sanitization and validation
- Authorization controls and role-based access
- PII detection and data protection
- Government compliance requirements
- Vulnerability prevention (XSS, SQL injection, etc.)

## Performance Testing

Performance tests measure:
- Response times for key operations
- Concurrent request handling
- Memory usage and resource management
- System behavior under load
- Error recovery performance
- Resource cleanup

### Performance SLAs
- Opportunity search: < 3 seconds
- Document classification: < 2 seconds
- Response generation: < 15 seconds
- System recovery: < 5 seconds

## Integration Testing

Integration tests cover:
- Complete Sources Sought workflows
- Agent communication and coordination
- External API integration
- Error handling and recovery
- Data flow between components

## Best Practices

### Test Organization
- Group related tests in `describe` blocks
- Use descriptive test names that explain the scenario
- Follow AAA pattern: Arrange, Act, Assert
- Clean up resources after tests

### Mock Management
- Use MSW for HTTP mocking
- Create reusable mock data generators
- Mock external dependencies at module boundaries
- Avoid mocking internal business logic

### Performance Testing
- Use realistic data sizes and scenarios
- Test both success and failure paths
- Monitor resource usage trends
- Set appropriate timeouts for async operations

### Security Testing
- Test with malicious input patterns
- Validate all authentication flows
- Check authorization at multiple levels
- Test data sanitization and validation

## Continuous Integration

Tests are configured to run in CI environments:
- Parallel test execution
- Coverage reporting
- Fail-fast on security issues
- Performance regression detection

## Coverage Reports

Coverage reports are generated in multiple formats:
- HTML report: `coverage/lcov-report/index.html`
- LCOV format for CI integration
- JSON format for programmatic access

## Debugging Tests

### Common Issues
- **Async operations**: Use `await` and proper test timeouts
- **Mock leakage**: Clean up mocks between tests
- **Environment variables**: Ensure test environment is isolated
- **External dependencies**: Mock all external services

### Debug Commands
```bash
# Run specific test file
npm test -- AgentOrchestrator.test.ts

# Run with verbose output
npm test -- --verbose

# Debug single test
npm test -- --testNamePattern="should search opportunities"
```

## Contributing

When adding new tests:
1. Follow existing naming conventions
2. Add appropriate mocks for external dependencies
3. Include both success and failure scenarios
4. Update this README if adding new test categories
5. Ensure tests are deterministic and don't rely on external state

## Security Considerations

- Never commit real API keys or credentials
- Use mock data that doesn't contain real PII
- Test with realistic but safe data volumes
- Validate security test coverage regularly