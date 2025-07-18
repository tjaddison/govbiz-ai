/**
 * API Middleware System
 * 
 * Comprehensive middleware stack for API endpoints including
 * authentication, logging, CORS, compression, and error handling
 */

import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'

export interface MiddlewareConfig {
  version: string
  baseUrl: string
  environment: string
  
  authentication: {
    enabled: boolean
    strategies: ('api_key' | 'bearer' | 'oauth')[]
    required: boolean
  }
  
  cors: {
    enabled: boolean
    origins: string[]
    methods: string[]
    headers: string[]
    credentials: boolean
  }
  
  compression: {
    enabled: boolean
    threshold: number
    algorithms: string[]
  }
  
  logging: {
    enabled: boolean
    level: 'debug' | 'info' | 'warn' | 'error'
    includeBody: boolean
    includeHeaders: boolean
  }
  
  security: {
    helmet: boolean
    rateLimiting: boolean
    inputSanitization: boolean
    outputValidation: boolean
  }
}

export interface RequestContext {
  requestId: string
  startTime: number
  user?: any
  apiKey?: string
  ip: string
  userAgent: string
  method: string
  path: string
  query: Record<string, any>
  body: any
  headers: Record<string, string>
}

export interface ResponseContext {
  statusCode: number
  responseTime: number
  size: number
  headers: Record<string, string>
  error?: any
}

export interface MiddlewareMetrics {
  requests: number
  responses: number
  errors: number
  avgResponseTime: number
  statusCodes: Record<string, number>
  endpoints: Record<string, {
    count: number
    avgTime: number
    errors: number
  }>
}

export class ApiMiddleware {
  private config: MiddlewareConfig
  private metrics: MiddlewareMetrics = {
    requests: 0,
    responses: 0,
    errors: 0,
    avgResponseTime: 0,
    statusCodes: {},
    endpoints: {}
  }

  constructor(config: any) {
    this.config = {
      version: '1.0.0',
      baseUrl: 'https://api.govbiz.ai',
      environment: 'production',
      authentication: {
        enabled: true,
        strategies: ['api_key', 'bearer'],
        required: true
      },
      cors: {
        enabled: true,
        origins: ['https://govbiz.ai', 'https://app.govbiz.ai'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        headers: ['Content-Type', 'Authorization', 'X-API-Key'],
        credentials: true
      },
      compression: {
        enabled: true,
        threshold: 1024,
        algorithms: ['gzip', 'deflate', 'br']
      },
      logging: {
        enabled: true,
        level: 'info',
        includeBody: false,
        includeHeaders: false
      },
      security: {
        helmet: true,
        rateLimiting: true,
        inputSanitization: true,
        outputValidation: true
      },
      ...config
    }
  }

  /**
   * Initialize middleware system
   */
  async initialize(): Promise<void> {
    try {
      logger.info('API middleware system initialized successfully', {
        version: this.config.version,
        environment: this.config.environment,
        authEnabled: this.config.authentication.enabled,
        corsEnabled: this.config.cors.enabled
      })

    } catch (error) {
      logger.error('Failed to initialize API middleware system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Request logging middleware
   */
  requestLogger(): (req: any, res: any, next: any) => void {
    return (req: any, res: any, next: any) => {
      try {
        const requestId = this.generateRequestId()
        const startTime = Date.now()

        // Create request context
        const context: RequestContext = {
          requestId,
          startTime,
          ip: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent') || 'unknown',
          method: req.method,
          path: req.path,
          query: req.query || {},
          body: this.config.logging.includeBody ? req.body : '[hidden]',
          headers: this.config.logging.includeHeaders ? req.headers : {}
        }

        // Attach context to request
        req.context = context

        // Log request
        if (this.config.logging.enabled) {
          logger.info('API Request', {
            requestId,
            method: req.method,
            path: req.path,
            ip: context.ip,
            userAgent: context.userAgent,
            query: Object.keys(req.query || {}).length > 0 ? req.query : undefined
          })
        }

        // Update metrics
        this.metrics.requests++
        this.updateEndpointMetrics(req.path, 'request')

        // Setup response logging
        const originalSend = res.send.bind(res)
        res.send = (body: any) => {
          this.logResponse(req, res, body)
          return originalSend(body)
        }

        next()

      } catch (error) {
        logger.error('Request logging middleware error', error instanceof Error ? error : undefined)
        next()
      }
    }
  }

  /**
   * CORS middleware
   */
  cors(): (req: any, res: any, next: any) => void {
    return (req: any, res: any, next: any) => {
      try {
        if (!this.config.cors.enabled) {
          return next()
        }

        const origin = req.get('Origin')
        
        // Check if origin is allowed
        if (origin && this.isOriginAllowed(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin)
        }

        res.setHeader('Access-Control-Allow-Methods', this.config.cors.methods.join(', '))
        res.setHeader('Access-Control-Allow-Headers', this.config.cors.headers.join(', '))
        
        if (this.config.cors.credentials) {
          res.setHeader('Access-Control-Allow-Credentials', 'true')
        }

        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Max-Age', '86400') // 24 hours
          return res.sendStatus(204)
        }

        next()

      } catch (error) {
        logger.error('CORS middleware error', error instanceof Error ? error : undefined)
        next()
      }
    }
  }

  /**
   * Authentication middleware
   */
  authentication(): (req: any, res: any, next: any) => Promise<void> {
    return async (req: any, res: any, next: any) => {
      try {
        if (!this.config.authentication.enabled) {
          return next()
        }

        let authenticated = false
        let user = null
        let apiKey = null

        // Try API key authentication
        if (this.config.authentication.strategies.includes('api_key')) {
          const result = await this.authenticateApiKey(req)
          if (result.success) {
            authenticated = true
            apiKey = result.apiKey
            user = result.user
          }
        }

        // Try Bearer token authentication
        if (!authenticated && this.config.authentication.strategies.includes('bearer')) {
          const result = await this.authenticateBearer(req)
          if (result.success) {
            authenticated = true
            user = result.user
          }
        }

        // Try OAuth authentication
        if (!authenticated && this.config.authentication.strategies.includes('oauth')) {
          const result = await this.authenticateOAuth(req)
          if (result.success) {
            authenticated = true
            user = result.user
          }
        }

        if (!authenticated && this.config.authentication.required) {
          return res.status(401).json({
            success: false,
            data: null,
            error: {
              code: 'AUTHENTICATION_REQUIRED',
              message: 'Authentication required'
            }
          })
        }

        // Attach authentication info to request
        req.user = user
        req.apiKey = apiKey
        req.authenticated = authenticated

        // Update context
        if (req.context) {
          req.context.user = user
          req.context.apiKey = apiKey
        }

        next()

      } catch (error) {
        logger.error('Authentication middleware error', error instanceof Error ? error : undefined)
        res.status(500).json({
          success: false,
          data: null,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Authentication error'
          }
        })
      }
    }
  }

  /**
   * Input sanitization middleware
   */
  sanitization(): (req: any, res: any, next: any) => void {
    return (req: any, res: any, next: any) => {
      try {
        if (!this.config.security.inputSanitization) {
          return next()
        }

        // Sanitize query parameters
        if (req.query) {
          req.query = this.sanitizeObject(req.query)
        }

        // Sanitize request body
        if (req.body) {
          req.body = this.sanitizeObject(req.body)
        }

        next()

      } catch (error) {
        logger.error('Sanitization middleware error', error instanceof Error ? error : undefined)
        next()
      }
    }
  }

  /**
   * Response formatting middleware
   */
  responseFormatter(): (req: any, res: any, next: any) => void {
    return (req: any, res: any, next: any) => {
      try {
        // Override json method to apply consistent formatting
        const originalJson = res.json.bind(res)
        res.json = (data: any) => {
          const formattedResponse = this.formatResponse(data, req)
          return originalJson(formattedResponse)
        }

        // Override send method for non-JSON responses
        const originalSend = res.send.bind(res)
        res.send = (data: any) => {
          // Add standard headers
          res.setHeader('X-API-Version', this.config.version)
          res.setHeader('X-Request-ID', req.context?.requestId || 'unknown')
          
          return originalSend(data)
        }

        next()

      } catch (error) {
        logger.error('Response formatting middleware error', error instanceof Error ? error : undefined)
        next()
      }
    }
  }

  /**
   * Error handling middleware
   */
  errorHandler(): (error: any, req: any, res: any, next: any) => void {
    return (error: any, req: any, res: any, next: any) => {
      try {
        // Update error metrics
        this.metrics.errors++
        this.updateEndpointMetrics(req.path, 'error')

        // Log error
        logger.error('API Error', error, {
          requestId: req.context?.requestId,
          method: req.method,
          path: req.path,
          ip: req.context?.ip,
          userAgent: req.context?.userAgent
        })

        // Determine error type and status code
        let statusCode = 500
        let errorCode = 'INTERNAL_ERROR'
        let message = 'Internal server error'

        if (error.name === 'ValidationError') {
          statusCode = 400
          errorCode = 'VALIDATION_ERROR'
          message = error.message
        } else if (error.name === 'UnauthorizedError') {
          statusCode = 401
          errorCode = 'UNAUTHORIZED'
          message = 'Unauthorized'
        } else if (error.name === 'ForbiddenError') {
          statusCode = 403
          errorCode = 'FORBIDDEN'
          message = 'Forbidden'
        } else if (error.name === 'NotFoundError') {
          statusCode = 404
          errorCode = 'NOT_FOUND'
          message = 'Not found'
        } else if (error.statusCode) {
          statusCode = error.statusCode
          errorCode = error.code || 'UNKNOWN_ERROR'
          message = error.message || 'Unknown error'
        }

        // Send error response
        res.status(statusCode).json({
          success: false,
          data: null,
          error: {
            code: errorCode,
            message,
            ...(this.config.environment === 'development' && {
              stack: error.stack,
              details: error.details
            })
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: req.context?.requestId,
            version: this.config.version
          }
        })

      } catch (handlerError) {
        logger.error('Error handler failure', handlerError instanceof Error ? handlerError : undefined)
        
        // Fallback error response
        res.status(500).json({
          success: false,
          data: null,
          error: {
            code: 'CRITICAL_ERROR',
            message: 'Critical system error'
          }
        })
      }
    }
  }

  /**
   * Security headers middleware
   */
  securityHeaders(): (req: any, res: any, next: any) => void {
    return (req: any, res: any, next: any) => {
      try {
        if (!this.config.security.helmet) {
          return next()
        }

        // Set security headers
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('X-Frame-Options', 'DENY')
        res.setHeader('X-XSS-Protection', '1; mode=block')
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
        res.setHeader('Content-Security-Policy', "default-src 'self'")
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

        next()

      } catch (error) {
        logger.error('Security headers middleware error', error instanceof Error ? error : undefined)
        next()
      }
    }
  }

  /**
   * Get middleware metrics
   */
  getMetrics(): MiddlewareMetrics {
    return { ...this.metrics }
  }

  /**
   * Reset middleware metrics
   */
  resetMetrics(): void {
    this.metrics = {
      requests: 0,
      responses: 0,
      errors: 0,
      avgResponseTime: 0,
      statusCodes: {},
      endpoints: {}
    }
  }

  /**
   * Shutdown middleware system
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('API middleware system shutdown complete')

    } catch (error) {
      logger.error('API middleware shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private isOriginAllowed(origin: string): boolean {
    if (this.config.cors.origins.includes('*')) {
      return true
    }
    
    return this.config.cors.origins.some(allowedOrigin => {
      if (allowedOrigin === origin) {
        return true
      }
      
      // Support wildcard subdomains
      if (allowedOrigin.startsWith('*.')) {
        const domain = allowedOrigin.substring(2)
        return origin.endsWith(domain)
      }
      
      return false
    })
  }

  private async authenticateApiKey(req: any): Promise<{
    success: boolean
    apiKey?: string
    user?: any
  }> {
    try {
      const apiKey = req.get('X-API-Key') || req.query.api_key

      if (!apiKey) {
        return { success: false }
      }

      // Validate API key (mock implementation)
      const isValid = await this.validateApiKey(apiKey)
      
      if (!isValid) {
        return { success: false }
      }

      // Get user associated with API key
      const user = await this.getUserByApiKey(apiKey)

      return {
        success: true,
        apiKey,
        user
      }

    } catch (error) {
      logger.error('API key authentication failed', error instanceof Error ? error : undefined)
      return { success: false }
    }
  }

  private async authenticateBearer(req: any): Promise<{
    success: boolean
    user?: any
  }> {
    try {
      const authorization = req.get('Authorization')
      
      if (!authorization || !authorization.startsWith('Bearer ')) {
        return { success: false }
      }

      const token = authorization.substring(7)
      
      // Validate bearer token (mock implementation)
      const user = await this.validateBearerToken(token)
      
      return {
        success: !!user,
        user
      }

    } catch (error) {
      logger.error('Bearer authentication failed', error instanceof Error ? error : undefined)
      return { success: false }
    }
  }

  private async authenticateOAuth(req: any): Promise<{
    success: boolean
    user?: any
  }> {
    try {
      // OAuth implementation would go here
      return { success: false }

    } catch (error) {
      logger.error('OAuth authentication failed', error instanceof Error ? error : undefined)
      return { success: false }
    }
  }

  private async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      // Validate API key format
      if (!apiKey.startsWith('gba_') || apiKey.length < 20) {
        return false
      }

      // Query database to validate API key
      const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb')
      const { DynamoDBDocumentClient, GetCommand } = await import('@aws-sdk/lib-dynamodb')
      
      const client = new DynamoDBClient({ region: process.env.AWS_REGION })
      const docClient = DynamoDBDocumentClient.from(client)
      
      const result = await docClient.send(new GetCommand({
        TableName: process.env.DYNAMODB_API_KEYS_TABLE || 'govbiz-api-keys',
        Key: { apiKey }
      }))
      
      if (!result.Item) {
        return false
      }
      
      // Check if API key is active and not expired
      const keyData = result.Item
      if (!keyData.active || (keyData.expiresAt && keyData.expiresAt < Date.now())) {
        return false
      }
      
      return true
    } catch (error) {
      logger.error('API key validation failed', error instanceof Error ? error : undefined)
      return false
    }
  }

  private async getUserByApiKey(apiKey: string): Promise<any> {
    try {
      const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb')
      const { DynamoDBDocumentClient, GetCommand } = await import('@aws-sdk/lib-dynamodb')
      
      const client = new DynamoDBClient({ region: process.env.AWS_REGION })
      const docClient = DynamoDBDocumentClient.from(client)
      
      // Get API key record
      const keyResult = await docClient.send(new GetCommand({
        TableName: process.env.DYNAMODB_API_KEYS_TABLE || 'govbiz-api-keys',
        Key: { apiKey }
      }))
      
      if (!keyResult.Item) {
        return null
      }
      
      const userId = keyResult.Item.userId
      if (!userId) {
        return null
      }
      
      // Get user data
      const userResult = await docClient.send(new GetCommand({
        TableName: process.env.DYNAMODB_USERS_TABLE || 'govbiz-users',
        Key: { id: userId }
      }))
      
      return userResult.Item || null
    } catch (error) {
      logger.error('User lookup by API key failed', error instanceof Error ? error : undefined)
      return null
    }
  }

  private async validateBearerToken(token: string): Promise<any> {
    try {
      // Verify JWT token
      const { verify } = await import('jsonwebtoken')
      
      const jwtSecret = process.env.JWT_SECRET
      if (!jwtSecret) {
        logger.error('JWT_SECRET not configured')
        return null
      }
      
      const decoded = verify(token, jwtSecret) as any
      if (!decoded || !decoded.userId) {
        return null
      }
      
      // Get user data from database
      const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb')
      const { DynamoDBDocumentClient, GetCommand } = await import('@aws-sdk/lib-dynamodb')
      
      const client = new DynamoDBClient({ region: process.env.AWS_REGION })
      const docClient = DynamoDBDocumentClient.from(client)
      
      const result = await docClient.send(new GetCommand({
        TableName: process.env.DYNAMODB_USERS_TABLE || 'govbiz-users',
        Key: { id: decoded.userId }
      }))
      
      return result.Item || null
    } catch (error) {
      logger.error('Bearer token validation failed', error instanceof Error ? error : undefined)
      return null
    }
  }

  private sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj
    }

    if (typeof obj === 'string') {
      return this.sanitizeString(obj)
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item))
    }

    if (typeof obj === 'object') {
      const sanitized: any = {}
      for (const [key, value] of Object.entries(obj)) {
        sanitized[this.sanitizeString(key)] = this.sanitizeObject(value)
      }
      return sanitized
    }

    return obj
  }

  private sanitizeString(str: string): string {
    // Basic sanitization - remove potentially dangerous characters
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim()
  }

  private formatResponse(data: any, req: any): any {
    // If data is already in our standard format, return as-is
    if (data && typeof data === 'object' && 'success' in data) {
      return data
    }

    // Format data in standard API response format
    return {
      success: true,
      data,
      error: null,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.context?.requestId,
        version: this.config.version
      }
    }
  }

  private logResponse(req: any, res: any, body: any): void {
    try {
      const context = req.context as RequestContext
      const responseTime = Date.now() - context.startTime

      // Update metrics
      this.metrics.responses++
      this.metrics.avgResponseTime = 
        (this.metrics.avgResponseTime * (this.metrics.responses - 1) + responseTime) / this.metrics.responses

      const statusCode = res.statusCode.toString()
      this.metrics.statusCodes[statusCode] = (this.metrics.statusCodes[statusCode] || 0) + 1

      this.updateEndpointMetrics(req.path, 'response', responseTime)

      // Log response
      if (this.config.logging.enabled) {
        logger.info('API Response', {
          requestId: context.requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTime,
          size: Buffer.byteLength(JSON.stringify(body), 'utf8')
        })
      }

      // Record metrics
      metricsCollector.recordMetric(
        'api_request_duration',
        responseTime,
        'milliseconds',
        {
          method: req.method,
          endpoint: req.path,
          status_code: statusCode
        }
      ).catch(() => {}) // Ignore metrics errors

    } catch (error) {
      logger.error('Response logging failed', error instanceof Error ? error : undefined)
    }
  }

  private updateEndpointMetrics(path: string, type: 'request' | 'response' | 'error', responseTime?: number): void {
    if (!this.metrics.endpoints[path]) {
      this.metrics.endpoints[path] = {
        count: 0,
        avgTime: 0,
        errors: 0
      }
    }

    const endpoint = this.metrics.endpoints[path]

    if (type === 'request') {
      endpoint.count++
    } else if (type === 'response' && responseTime !== undefined) {
      endpoint.avgTime = (endpoint.avgTime * (endpoint.count - 1) + responseTime) / endpoint.count
    } else if (type === 'error') {
      endpoint.errors++
    }
  }
}

export default ApiMiddleware