/**
 * GovBiz.ai API Documentation and Developer Tools
 * 
 * Comprehensive API system with documentation generation, validation,
 * rate limiting, and developer experience tools
 */

export * from './documentation'
export * from './validation'
export * from './rate-limiting'
export * from './middleware'
export * from './sdk-generator'
export * from './testing-tools'
export * from './webhooks'

import { ApiDocumentation } from './documentation'
import { ApiValidation } from './validation'
import { RateLimiting } from './rate-limiting'
import { ApiMiddleware } from './middleware'
import { SdkGenerator } from './sdk-generator'
import { ApiTestingTools } from './testing-tools'
import { WebhookManager } from './webhooks'
import { logger } from '@/lib/monitoring/logger'

// API Configuration
export interface ApiConfig {
  version: string
  baseUrl: string
  environment: 'development' | 'staging' | 'production'
  
  documentation: {
    enabled: boolean
    interactive: boolean
    generateExamples: boolean
    includeInternalEndpoints: boolean
  }
  
  validation: {
    strict: boolean
    validateResponses: boolean
    generateSchemas: boolean
  }
  
  rateLimiting: {
    enabled: boolean
    defaultRpm: number
    burstLimit: number
    windowMs: number
  }
  
  security: {
    requireApiKey: boolean
    enableCors: boolean
    allowedOrigins: string[]
    rateByIp: boolean
  }
  
  developer: {
    enableSandbox: boolean
    generateSdk: boolean
    supportedLanguages: string[]
    webhookSupport: boolean
  }
}

// Default API configuration
const defaultConfig: ApiConfig = {
  version: '1.0.0',
  baseUrl: process.env.API_BASE_URL || 'https://api.govbiz.ai',
  environment: (process.env.NODE_ENV as any) || 'development',
  
  documentation: {
    enabled: true,
    interactive: true,
    generateExamples: true,
    includeInternalEndpoints: false
  },
  
  validation: {
    strict: true,
    validateResponses: true,
    generateSchemas: true
  },
  
  rateLimiting: {
    enabled: true,
    defaultRpm: 1000, // 1000 requests per minute
    burstLimit: 50,   // 50 requests in burst
    windowMs: 60000   // 1 minute window
  },
  
  security: {
    requireApiKey: true,
    enableCors: true,
    allowedOrigins: ['https://govbiz.ai', 'https://app.govbiz.ai'],
    rateByIp: true
  },
  
  developer: {
    enableSandbox: true,
    generateSdk: true,
    supportedLanguages: ['javascript', 'typescript', 'python', 'java', 'curl'],
    webhookSupport: true
  }
}

// Global API management instance
let apiInstance: ApiManager | null = null

/**
 * Main API management system
 */
export class ApiManager {
  public readonly documentation: ApiDocumentation
  public readonly validation: ApiValidation
  public readonly rateLimiting: RateLimiting
  public readonly middleware: ApiMiddleware
  public readonly sdkGenerator: SdkGenerator
  public readonly testingTools: ApiTestingTools
  public readonly webhooks: WebhookManager
  private config: ApiConfig

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = { ...defaultConfig, ...config }
    
    // Initialize all API subsystems
    this.documentation = new ApiDocumentation(this.config.documentation)
    this.validation = new ApiValidation(this.config.validation)
    this.rateLimiting = new RateLimiting(this.config.rateLimiting)
    this.middleware = new ApiMiddleware(this.config)
    this.sdkGenerator = new SdkGenerator(this.config.developer)
    this.testingTools = new ApiTestingTools(this.config)
    this.webhooks = new WebhookManager(this.config.developer)
  }

  /**
   * Initialize API management system
   */
  async initialize(): Promise<void> {
    try {
      // Initialize all subsystems
      await Promise.all([
        this.documentation.initialize(),
        this.validation.initialize(),
        this.rateLimiting.initialize(),
        this.middleware.initialize(),
        this.sdkGenerator.initialize(),
        this.testingTools.initialize(),
        this.webhooks.initialize()
      ])

      logger.info('API management system initialized successfully', {
        version: this.config.version,
        environment: this.config.environment,
        documentationEnabled: this.config.documentation.enabled,
        sandboxEnabled: this.config.developer.enableSandbox
      })

    } catch (error) {
      logger.error('Failed to initialize API management system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate complete API documentation
   */
  async generateDocumentation(): Promise<{
    openapi: object
    postman: object
    markdown: string
    interactive: string
  }> {
    try {
      const openapi = await this.documentation.generateOpenApiSpec()
      const postman = await this.documentation.generatePostmanCollection()
      const markdown = await this.documentation.generateMarkdownDocs()
      const interactive = await this.documentation.generateInteractiveDocs()

      return {
        openapi,
        postman,
        markdown,
        interactive
      }

    } catch (error) {
      logger.error('Failed to generate API documentation', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate SDK for specified language
   */
  async generateSdk(language: string, options: Record<string, any> = {}): Promise<{
    code: string
    documentation: string
    examples: string[]
  }> {
    try {
      const sdk = await this.sdkGenerator.generateSdk(language, options)
      
      // Transform GeneratedSdk to expected format
      return {
        code: sdk.files.filter(f => f.type === 'source').map(f => f.content).join('\n\n'),
        documentation: sdk.documentation,
        examples: sdk.examples,
      }

    } catch (error) {
      logger.error('Failed to generate SDK', error instanceof Error ? error : undefined, { language })
      throw error
    }
  }

  /**
   * Validate API endpoint
   */
  async validateEndpoint(endpoint: string, method: string, data: any): Promise<{
    valid: boolean
    errors: string[]
    warnings: string[]
  }> {
    try {
      const result = await this.validation.validateEndpoint(endpoint, method, data)
      
      // Transform ValidationResult to expected format
      return {
        valid: result.valid,
        errors: result.errors.map(e => typeof e === 'string' ? e : e.message || String(e)),
        warnings: result.warnings?.map(w => typeof w === 'string' ? w : w.message || String(w)) || [],
      }

    } catch (error) {
      logger.error('Failed to validate endpoint', error instanceof Error ? error : undefined, { endpoint, method })
      throw error
    }
  }

  /**
   * Create test suite for API
   */
  async createTestSuite(): Promise<{
    unitTests: string
    integrationTests: string
    loadTests: string
    documentation: string
  }> {
    try {
      return await this.testingTools.generateTestSuite()

    } catch (error) {
      logger.error('Failed to create test suite', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Get API health and status
   */
  async getApiHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'down'
    version: string
    uptime: number
    endpoints: Record<string, {
      status: 'healthy' | 'degraded' | 'down'
      responseTime: number
      lastCheck: number
    }>
    metrics: {
      totalRequests: number
      errorRate: number
      avgResponseTime: number
    }
  }> {
    try {
      // Mock health check - in production, implement actual health monitoring
      return {
        status: 'healthy',
        version: this.config.version,
        uptime: Date.now() - 1000000, // Mock uptime
        endpoints: {
          '/api/sources-sought': {
            status: 'healthy',
            responseTime: 150,
            lastCheck: Date.now()
          },
          '/api/workflows': {
            status: 'healthy',
            responseTime: 200,
            lastCheck: Date.now()
          },
          '/api/users': {
            status: 'healthy',
            responseTime: 100,
            lastCheck: Date.now()
          }
        },
        metrics: {
          totalRequests: 10000,
          errorRate: 0.02,
          avgResponseTime: 175
        }
      }

    } catch (error) {
      logger.error('Failed to get API health', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Shutdown API management system
   */
  async shutdown(): Promise<void> {
    try {
      await Promise.all([
        this.documentation.shutdown(),
        this.validation.shutdown(),
        this.rateLimiting.shutdown(),
        this.middleware.shutdown(),
        this.sdkGenerator.shutdown(),
        this.testingTools.shutdown(),
        this.webhooks.shutdown()
      ])

      logger.info('API management system shutdown complete')

    } catch (error) {
      logger.error('API management shutdown failed', error instanceof Error ? error : undefined)
    }
  }
}

/**
 * Initialize the global API management system
 */
export async function initializeApi(config: Partial<ApiConfig> = {}): Promise<ApiManager> {
  try {
    apiInstance = new ApiManager(config)
    await apiInstance.initialize()
    return apiInstance
  } catch (error) {
    logger.error('Failed to initialize API management', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Get the global API management instance
 */
export function getApiManager(): ApiManager {
  if (!apiInstance) {
    throw new Error('API management system not initialized. Call initializeApi() first.')
  }
  return apiInstance
}

/**
 * Shutdown the global API management system
 */
export async function shutdownApi(): Promise<void> {
  if (apiInstance) {
    await apiInstance.shutdown()
    apiInstance = null
  }
}

// Convenience functions for common API operations
export const api = {
  /**
   * Generate documentation
   */
  generateDocs: async () => {
    return getApiManager().generateDocumentation()
  },

  /**
   * Validate request data
   */
  validate: async (endpoint: string, method: string, data: any) => {
    return getApiManager().validateEndpoint(endpoint, method, data)
  },

  /**
   * Generate SDK
   */
  generateSdk: async (language: string, options: Record<string, any> = {}) => {
    return getApiManager().generateSdk(language, options)
  },

  /**
   * Get API health
   */
  health: async () => {
    return getApiManager().getApiHealth()
  },

  /**
   * Create test suite
   */
  createTests: async () => {
    return getApiManager().createTestSuite()
  }
}

export default ApiManager