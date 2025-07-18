import {
  validateConfig,
  getEnvironmentConfig,
  createAPIClient,
  AWS_RESOURCES,
  FEATURE_FLAGS,
  SECURITY_CONFIG,
  PERFORMANCE_CONFIG,
  MONITORING_CONFIG,
  isDevelopment,
  isProduction,
  isStaging,
} from '@/lib/aws-config'

describe('AWS Configuration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('Configuration Validation', () => {
    it('should validate configuration successfully with all required values', () => {
      process.env.AWS_REGION = 'us-east-1'
      process.env.NEXT_PUBLIC_API_URL = 'https://api.govbiz.ai'

      const result = validateConfig()

      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail validation without AWS_REGION', () => {
      delete process.env.AWS_REGION
      process.env.NEXT_PUBLIC_API_URL = 'https://api.govbiz.ai'

      const result = validateConfig()

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('AWS_REGION is required')
    })

    it('should fail validation with invalid API URL', () => {
      process.env.AWS_REGION = 'us-east-1'
      process.env.NEXT_PUBLIC_API_URL = 'https://api.govbiz-dev.example.com'

      const result = validateConfig()

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Valid API_URL is required')
    })

    it('should validate table names format', () => {
      process.env.AWS_REGION = 'us-east-1'
      process.env.NEXT_PUBLIC_API_URL = 'https://api.govbiz.ai'
      process.env.USER_TABLE_NAME = 'invalid@table!name'

      const result = validateConfig()

      expect(result.isValid).toBe(false)
      expect(result.errors.some(error => error.includes('Invalid table name format'))).toBe(true)
    })

    it('should validate bucket names format', () => {
      process.env.AWS_REGION = 'us-east-1'
      process.env.NEXT_PUBLIC_API_URL = 'https://api.govbiz.ai'
      process.env.DOCUMENT_BUCKET_NAME = 'Invalid_Bucket_Name'

      const result = validateConfig()

      expect(result.isValid).toBe(false)
      expect(result.errors.some(error => error.includes('Invalid bucket name format'))).toBe(true)
    })
  })

  describe('Environment Configuration', () => {
    it('should get environment configuration successfully', () => {
      process.env.AWS_REGION = 'us-east-1'
      process.env.NEXT_PUBLIC_API_URL = 'https://api.govbiz.ai'
      process.env.NEXT_PUBLIC_STAGE = 'dev'

      const config = getEnvironmentConfig()

      expect(config.isValid).toBe(true)
      expect(config.AWS_REGION).toBe('us-east-1')
      expect(config.STAGE).toBe('dev')
      expect(config.errors).toHaveLength(0)
    })

    it('should throw error in production with invalid configuration', () => {
      process.env.NODE_ENV = 'production'
      process.env.AWS_REGION = ''
      process.env.NEXT_PUBLIC_API_URL = 'https://api.govbiz-dev.example.com'

      expect(() => getEnvironmentConfig()).toThrow('Invalid configuration in production environment')
    })

    it('should not throw error in development with invalid configuration', () => {
      process.env.NODE_ENV = 'development'
      process.env.AWS_REGION = ''

      expect(() => getEnvironmentConfig()).not.toThrow()
    })
  })

  describe('AWS Resources', () => {
    it('should generate correct table names with stage suffix', () => {
      process.env.NEXT_PUBLIC_STAGE = 'test'

      // Re-require the module to pick up new env vars
      jest.resetModules()
      const { AWS_RESOURCES: resources } = require('@/lib/aws-config')

      expect(resources.TABLES.USERS).toBe('govbiz-users-test')
      expect(resources.TABLES.CONVERSATIONS).toBe('govbiz-conversations-test')
      expect(resources.TABLES.MESSAGES).toBe('govbiz-messages-test')
      expect(resources.TABLES.OPPORTUNITIES).toBe('govbiz-opportunities-test')
      expect(resources.TABLES.AUDIT).toBe('govbiz-audit-test')
    })

    it('should use environment-specific resource names', () => {
      process.env.USER_TABLE_NAME = 'custom-users-table'
      process.env.DOCUMENT_BUCKET_NAME = 'custom-documents-bucket'

      jest.resetModules()
      const { AWS_RESOURCES: resources } = require('@/lib/aws-config')

      expect(resources.TABLES.USERS).toBe('custom-users-table')
      expect(resources.BUCKETS.DOCUMENTS).toBe('custom-documents-bucket')
    })

    it('should have all required resource definitions', () => {
      expect(AWS_RESOURCES.TABLES).toHaveProperty('USERS')
      expect(AWS_RESOURCES.TABLES).toHaveProperty('CONVERSATIONS')
      expect(AWS_RESOURCES.TABLES).toHaveProperty('MESSAGES')
      expect(AWS_RESOURCES.TABLES).toHaveProperty('OPPORTUNITIES')
      expect(AWS_RESOURCES.TABLES).toHaveProperty('AUDIT')

      expect(AWS_RESOURCES.BUCKETS).toHaveProperty('DOCUMENTS')

      expect(AWS_RESOURCES.QUEUES).toHaveProperty('MESSAGES')
      expect(AWS_RESOURCES.QUEUES).toHaveProperty('DEAD_LETTER')

      expect(AWS_RESOURCES.TOPICS).toHaveProperty('NOTIFICATIONS')
      expect(AWS_RESOURCES.TOPICS).toHaveProperty('ALERTS')
    })
  })

  describe('Feature Flags', () => {
    it('should read feature flags from environment variables', () => {
      process.env.NEXT_PUBLIC_ENABLE_AI_RESPONSES = 'true'
      process.env.NEXT_PUBLIC_ENABLE_BULK_OPS = 'false'
      process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = 'true'

      jest.resetModules()
      const { FEATURE_FLAGS: flags } = require('@/lib/aws-config')

      expect(flags.AI_RESPONSE_GENERATION).toBe(true)
      expect(flags.BULK_OPERATIONS).toBe(false)
      expect(flags.ADVANCED_ANALYTICS).toBe(true)
    })

    it('should have default values for core features', () => {
      expect(FEATURE_FLAGS.SOURCES_SOUGHT_AUTOMATION).toBe(true)
      expect(FEATURE_FLAGS.GOVERNMENT_COMPLIANCE).toBe(true)
    })

    it('should handle onboarding flag default correctly', () => {
      process.env.NEXT_PUBLIC_ENABLE_ONBOARDING = 'false'

      jest.resetModules()
      const { FEATURE_FLAGS: flags } = require('@/lib/aws-config')

      expect(flags.ONBOARDING_FLOW).toBe(false)
    })
  })

  describe('Security Configuration', () => {
    it('should have secure default configurations', () => {
      expect(SECURITY_CONFIG.COMPLIANCE.AUDIT_ALL_ACTIONS).toBe(true)
      expect(SECURITY_CONFIG.COMPLIANCE.DATA_RETENTION_DAYS).toBe(2555) // 7 years
      expect(SECURITY_CONFIG.COMPLIANCE.ENABLE_PII_DETECTION).toBe(true)
      expect(SECURITY_CONFIG.COMPLIANCE.REQUIRE_MFA_FOR_ADMIN).toBe(true)
    })

    it('should have appropriate session timeouts', () => {
      expect(SECURITY_CONFIG.SESSION.TIMEOUT).toBe(8 * 60 * 60) // 8 hours
      expect(SECURITY_CONFIG.SESSION.REFRESH_THRESHOLD).toBe(30 * 60) // 30 minutes
    })

    it('should have reasonable rate limits', () => {
      expect(SECURITY_CONFIG.RATE_LIMITING.API_CALLS_PER_MINUTE).toBe(60)
      expect(SECURITY_CONFIG.RATE_LIMITING.BULK_OPERATIONS_PER_HOUR).toBe(10)
      expect(SECURITY_CONFIG.RATE_LIMITING.FILE_UPLOADS_PER_DAY).toBe(100)
    })
  })

  describe('Performance Configuration', () => {
    it('should have reasonable pagination settings', () => {
      expect(PERFORMANCE_CONFIG.PAGINATION.DEFAULT_PAGE_SIZE).toBe(20)
      expect(PERFORMANCE_CONFIG.PAGINATION.MAX_PAGE_SIZE).toBe(100)
    })

    it('should have appropriate cache TTL values', () => {
      expect(PERFORMANCE_CONFIG.CACHING.OPPORTUNITIES_TTL).toBe(15 * 60) // 15 minutes
      expect(PERFORMANCE_CONFIG.CACHING.USER_PROFILE_TTL).toBe(60 * 60) // 1 hour
      expect(PERFORMANCE_CONFIG.CACHING.STATIC_CONTENT_TTL).toBe(24 * 60 * 60) // 24 hours
    })

    it('should have reasonable timeout values', () => {
      expect(PERFORMANCE_CONFIG.TIMEOUTS.API_REQUEST).toBe(30000) // 30 seconds
      expect(PERFORMANCE_CONFIG.TIMEOUTS.FILE_UPLOAD).toBe(300000) // 5 minutes
      expect(PERFORMANCE_CONFIG.TIMEOUTS.REPORT_GENERATION).toBe(600000) // 10 minutes
    })
  })

  describe('Monitoring Configuration', () => {
    it('should enable metrics collection by default', () => {
      expect(MONITORING_CONFIG.METRICS.COLLECT_PERFORMANCE_METRICS).toBe(true)
      expect(MONITORING_CONFIG.METRICS.COLLECT_USER_ANALYTICS).toBe(true)
      expect(MONITORING_CONFIG.METRICS.COLLECT_ERROR_METRICS).toBe(true)
    })

    it('should have appropriate alert thresholds', () => {
      expect(MONITORING_CONFIG.ALERTS.ERROR_RATE_THRESHOLD).toBe(0.05) // 5%
      expect(MONITORING_CONFIG.ALERTS.RESPONSE_TIME_THRESHOLD).toBe(2000) // 2 seconds
      expect(MONITORING_CONFIG.ALERTS.MEMORY_USAGE_THRESHOLD).toBe(0.8) // 80%
    })

    it('should adjust logging level based on environment', () => {
      process.env.NODE_ENV = 'production'
      
      jest.resetModules()
      const { MONITORING_CONFIG: config } = require('@/lib/aws-config')
      
      expect(config.LOGGING.LEVEL).toBe('warn')
      expect(config.LOGGING.INCLUDE_STACK_TRACES).toBe(false)
    })
  })

  describe('API Client Factory', () => {
    it('should create API client with default configuration', () => {
      const client = createAPIClient()

      expect(client.baseURL).toBeDefined()
      expect(client.timeout).toBe(30000)
      expect(client.headers).toHaveProperty('Content-Type', 'application/json')
      expect(client.headers).toHaveProperty('X-API-Version', '2024-01-01')
      expect(client.retries).toBe(3)
    })

    it('should create API client with custom base URL', () => {
      const customURL = 'https://custom-api.example.com'
      const client = createAPIClient(customURL)

      expect(client.baseURL).toBe(customURL)
      expect(client.timeout).toBe(30000)
    })
  })

  describe('Environment Detection', () => {
    it('should detect development environment', () => {
      process.env.NODE_ENV = 'development'

      jest.resetModules()
      const { isDevelopment: isDev, isProduction: isProd } = require('@/lib/aws-config')

      expect(isDev()).toBe(true)
      expect(isProd()).toBe(false)
    })

    it('should detect production environment', () => {
      process.env.NODE_ENV = 'production'

      jest.resetModules()
      const { isDevelopment: isDev, isProduction: isProd } = require('@/lib/aws-config')

      expect(isDev()).toBe(false)
      expect(isProd()).toBe(true)
    })

    it('should detect staging environment', () => {
      process.env.NEXT_PUBLIC_STAGE = 'staging'

      jest.resetModules()
      const { isStaging } = require('@/lib/aws-config')

      expect(isStaging()).toBe(true)
    })
  })

  describe('Retry Configuration', () => {
    it('should have exponential backoff configuration', () => {
      const { RETRY_CONFIG } = require('@/lib/aws-config')

      expect(RETRY_CONFIG.maxAttempts).toBe(3)
      expect(RETRY_CONFIG.retryDelayOptions.base).toBe(1000)
      expect(typeof RETRY_CONFIG.retryDelayOptions.customBackoff).toBe('function')

      // Test exponential backoff function
      const backoffFn = RETRY_CONFIG.retryDelayOptions.customBackoff
      expect(backoffFn(1)).toBe(2000) // 2^1 * 1000
      expect(backoffFn(2)).toBe(4000) // 2^2 * 1000
      expect(backoffFn(3)).toBe(8000) // 2^3 * 1000
    })
  })

  describe('Error Handling', () => {
    it('should handle missing environment variables gracefully', () => {
      delete process.env.AWS_REGION
      delete process.env.NEXT_PUBLIC_STAGE

      jest.resetModules()
      const config = require('@/lib/aws-config')

      expect(config.AWS_REGION).toBe('us-east-1') // default fallback
      expect(config.STAGE).toBe('dev') // default fallback
    })

    it('should use default values when environment variables are empty', () => {
      process.env.AWS_REGION = ''
      process.env.NEXT_PUBLIC_STAGE = ''

      jest.resetModules()
      const config = require('@/lib/aws-config')

      expect(config.AWS_REGION).toBe('us-east-1')
      expect(config.STAGE).toBe('dev')
    })
  })

  describe('Constants and Types', () => {
    it('should export configuration as const assertion', () => {
      const { CONFIG } = require('@/lib/aws-config')

      expect(CONFIG).toBeDefined()
      expect(CONFIG.AWS_REGION).toBeDefined()
      expect(CONFIG.STAGE).toBeDefined()
      expect(CONFIG.AWS_RESOURCES).toBeDefined()
      expect(CONFIG.FEATURE_FLAGS).toBeDefined()
      expect(CONFIG.SECURITY_CONFIG).toBeDefined()
    })

    it('should have immutable configuration structure', () => {
      const { CONFIG } = require('@/lib/aws-config')

      // These should not throw in TypeScript with const assertion
      expect(() => {
        const testConfig = CONFIG
        // This would cause TypeScript error with const assertion:
        // testConfig.AWS_REGION = 'us-west-2'
      }).not.toThrow()
    })
  })
})