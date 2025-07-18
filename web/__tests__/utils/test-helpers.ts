/**
 * Test Utilities and Helpers
 * 
 * Common utilities for testing GovBiz.ai platform components
 */

import { AgentMessage, AgentCapability } from '@/lib/agents/AgentOrchestrator'

// Mock data generators
export const generateMockUser = (overrides: Partial<any> = {}) => ({
  id: `user-${Date.now()}`,
  email: 'test@example.com',
  name: 'Test User',
  company: 'Test Company',
  naicsCodes: ['541511'],
  capabilities: ['software development'],
  certifications: ['small business'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

export const generateMockOpportunity = (overrides: Partial<any> = {}) => ({
  id: `opp-${Date.now()}`,
  title: 'Test Opportunity',
  description: 'A test Sources Sought opportunity',
  agency: 'Department of Defense',
  naicsCode: '541511',
  postedDate: new Date().toISOString(),
  responseDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  pointOfContact: {
    name: 'John Smith',
    email: 'john.smith@agency.gov',
    phone: '555-123-4567',
  },
  ...overrides,
})

export const generateMockConversation = (overrides: Partial<any> = {}) => ({
  id: `conv-${Date.now()}`,
  userId: 'user-123',
  title: 'Test Conversation',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

export const generateMockMessage = (overrides: Partial<any> = {}) => ({
  id: `msg-${Date.now()}`,
  conversationId: 'conv-123',
  content: 'Test message',
  sender: 'user',
  timestamp: new Date().toISOString(),
  ...overrides,
})

export const generateMockAgentMessage = (overrides: Partial<AgentMessage> = {}): AgentMessage => ({
  id: `test-msg-${Date.now()}`,
  type: 'request',
  from: 'test-sender',
  to: 'test-receiver',
  timestamp: Date.now(),
  payload: {
    capability: 'test_capability',
    input: {},
  },
  priority: 'medium',
  ...overrides,
})

export const generateMockAgentCapability = (overrides: Partial<AgentCapability> = {}): AgentCapability => ({
  name: 'test_capability',
  description: 'A test capability',
  inputs: ['input1'],
  outputs: ['output1'],
  cost: 0.1,
  estimatedDuration: 1000,
  ...overrides,
})

// Test data factories
export const createTestOpportunityWithDeadline = (daysFromNow: number) => {
  const deadline = new Date()
  deadline.setDate(deadline.getDate() + daysFromNow)
  
  return generateMockOpportunity({
    responseDeadline: deadline.toISOString(),
  })
}

export const createTestUserProfile = (naicsCodes: string[] = ['541511']) => ({
  id: 'test-user',
  name: 'Test User',
  email: 'test@example.com',
  companyName: 'Test Company',
  companyDescription: 'A software development company',
  naicsCodes,
  capabilities: ['software development', 'web development'],
  pastProjects: [
    {
      title: 'Government Web Portal',
      customer: 'Department of Veterans Affairs',
      value: '$500,000',
      description: 'Built a comprehensive web portal',
      startDate: '2023-01-01',
      endDate: '2023-12-31',
    },
  ],
  certifications: ['small business', 'sdvosb'],
  contactInfo: {
    name: 'Test User',
    title: 'CEO',
    email: 'test@example.com',
    phone: '555-123-4567',
    address: '123 Main St, City, State 12345',
  },
})

// Mock API responses
export const mockSamGovResponse = (opportunities: any[] = []) => ({
  opportunitiesData: opportunities,
  totalRecords: opportunities.length,
})

export const mockSuccessResponse = (data: any = {}) => ({
  success: true,
  data,
  timestamp: new Date().toISOString(),
})

export const mockErrorResponse = (message: string = 'Test error', code: number = 500) => ({
  success: false,
  error: {
    message,
    code,
    timestamp: new Date().toISOString(),
  },
})

// Test utilities
export const wait = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms))

export const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> => {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return
    }
    await wait(interval)
  }
  
  throw new Error(`Condition not met within ${timeout}ms`)
}

export const expectEventually = async (
  assertion: () => void | Promise<void>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> => {
  const startTime = Date.now()
  let lastError: Error | null = null
  
  while (Date.now() - startTime < timeout) {
    try {
      await assertion()
      return
    } catch (error) {
      lastError = error as Error
      await wait(interval)
    }
  }
  
  throw lastError || new Error(`Assertion failed within ${timeout}ms`)
}

// Mock implementations
export const createMockFetch = (responses: Record<string, any> = {}) => {
  return jest.fn().mockImplementation((url: string) => {
    const urlString = typeof url === 'string' ? url : url.toString()
    
    for (const [pattern, response] of Object.entries(responses)) {
      if (urlString.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => response,
          text: async () => JSON.stringify(response),
        } as Response)
      }
    }
    
    return Promise.resolve({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    } as Response)
  })
}

export const createMockAgent = (
  id: string,
  capabilities: AgentCapability[] = [],
  responses: Record<string, any> = {}
) => {
  const mockAgent = {
    metadata: {
      id,
      name: `Mock Agent ${id}`,
      type: 'utility' as const,
      description: 'Mock agent for testing',
      capabilities,
      status: 'idle' as const,
      version: '1.0.0',
      healthScore: 100,
      lastSeen: Date.now(),
    },
    
    async initialize() {
      this.metadata.status = 'idle'
    },
    
    async shutdown() {
      this.metadata.status = 'offline'
    },
    
    async processMessage(message: AgentMessage) {
      const capability = message.payload.capability
      
      if (responses[capability]) {
        return {
          id: `response-${Date.now()}`,
          type: 'response' as const,
          from: this.metadata.id,
          to: message.from,
          timestamp: Date.now(),
          payload: responses[capability],
          correlationId: message.id,
        }
      }
      
      return {
        id: `error-${Date.now()}`,
        type: 'error' as const,
        from: this.metadata.id,
        to: message.from,
        timestamp: Date.now(),
        payload: {
          error: true,
          message: `Unknown capability: ${capability}`,
        },
        correlationId: message.id,
      }
    },
    
    getCapabilities() {
      return capabilities
    },
    
    getStatus() {
      return this.metadata.status
    },
  }
  
  return mockAgent
}

// Validation helpers
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const validateUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

export const validateTimestamp = (timestamp: number): boolean => {
  return !isNaN(timestamp) && timestamp > 0 && timestamp <= Date.now()
}

// Test environment helpers
export const setupTestEnvironment = () => {
  const originalEnv = process.env
  
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      AWS_REGION: 'us-east-1',
      NEXT_PUBLIC_STAGE: 'test',
      SAM_GOV_API_KEY: 'test-api-key',
    }
  })
  
  afterEach(() => {
    process.env = originalEnv
  })
}

export const mockConsoleOutput = () => {
  const originalConsole = { ...console }
  const mockConsole = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }
  
  beforeEach(() => {
    Object.assign(console, mockConsole)
  })
  
  afterEach(() => {
    Object.assign(console, originalConsole)
  })
  
  return mockConsole
}

// Performance testing helpers
export const measureExecutionTime = async <T>(
  fn: () => Promise<T> | T
): Promise<{ result: T; duration: number }> => {
  const startTime = Date.now()
  const result = await fn()
  const duration = Date.now() - startTime
  
  return { result, duration }
}

export const expectExecutionTime = async <T>(
  fn: () => Promise<T> | T,
  maxDuration: number
): Promise<T> => {
  const { result, duration } = await measureExecutionTime(fn)
  
  expect(duration).toBeLessThanOrEqual(maxDuration)
  
  return result
}

// Snapshot testing helpers
export const sanitizeSnapshot = (obj: any): any => {
  if (!obj || typeof obj !== 'object') {
    return obj
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeSnapshot)
  }
  
  const sanitized: any = {}
  
  for (const [key, value] of Object.entries(obj)) {
    if (key.includes('timestamp') || key.includes('Time') || key.includes('At')) {
      sanitized[key] = '[TIMESTAMP]'
    } else if (key.includes('id') || key.includes('Id')) {
      sanitized[key] = '[ID]'
    } else {
      sanitized[key] = sanitizeSnapshot(value)
    }
  }
  
  return sanitized
}

// Error simulation helpers
export const simulateNetworkError = () => {
  throw new Error('Network error: Connection refused')
}

export const simulateTimeout = async (delay: number = 5000) => {
  await wait(delay)
  throw new Error('Request timeout')
}

export const simulateRateLimitError = () => {
  throw new Error('Rate limit exceeded: Too many requests')
}

// Database testing helpers
export const createMockDynamoClient = (responses: Record<string, any> = {}) => ({
  send: jest.fn().mockImplementation((command) => {
    const commandName = command.constructor.name
    
    if (responses[commandName]) {
      return Promise.resolve(responses[commandName])
    }
    
    // Default responses for common commands
    if (commandName === 'GetCommand') {
      return Promise.resolve({ Item: null })
    }
    
    if (commandName === 'PutCommand') {
      return Promise.resolve({})
    }
    
    if (commandName === 'QueryCommand') {
      return Promise.resolve({ Items: [], Count: 0 })
    }
    
    return Promise.resolve({})
  }),
})

// Type-safe test helpers
export type MockFunction<T extends (...args: any[]) => any> = jest.MockedFunction<T>

export const asMock = <T extends (...args: any[]) => any>(fn: T): MockFunction<T> => 
  fn as MockFunction<T>

export const createTypedMock = <T>(): jest.Mocked<T> => 
  ({} as jest.Mocked<T>)

// Cleanup helpers
export const cleanupResources = () => {
  // Clean up any resources that might leak between tests
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.restoreAllMocks()
}

export default {
  generateMockUser,
  generateMockOpportunity,
  generateMockConversation,
  generateMockMessage,
  generateMockAgentMessage,
  generateMockAgentCapability,
  createTestOpportunityWithDeadline,
  createTestUserProfile,
  mockSamGovResponse,
  mockSuccessResponse,
  mockErrorResponse,
  wait,
  waitFor,
  expectEventually,
  createMockFetch,
  createMockAgent,
  validateEmail,
  validateUUID,
  validateTimestamp,
  setupTestEnvironment,
  mockConsoleOutput,
  measureExecutionTime,
  expectExecutionTime,
  sanitizeSnapshot,
  simulateNetworkError,
  simulateTimeout,
  simulateRateLimitError,
  createMockDynamoClient,
  asMock,
  createTypedMock,
  cleanupResources,
}