/**
 * API Rate Limiting System
 * 
 * Intelligent rate limiting with multiple strategies, quotas,
 * burst protection, and usage analytics
 */

import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { cache } from '@/lib/cache'

export interface RateLimitRule {
  id: string
  name: string
  description: string
  strategy: 'fixed_window' | 'sliding_window' | 'token_bucket' | 'leaky_bucket'
  limit: number
  window: number // milliseconds
  burst?: number
  scope: 'global' | 'ip' | 'user' | 'api_key' | 'endpoint'
  endpoints?: string[]
  conditions?: RateLimitCondition[]
  actions: RateLimitAction[]
  priority: number
}

export interface RateLimitCondition {
  type: 'time' | 'user_type' | 'subscription' | 'endpoint' | 'method'
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than'
  value: any
}

export interface RateLimitAction {
  type: 'block' | 'delay' | 'quota' | 'alert' | 'log'
  duration?: number
  message?: string
  headers?: Record<string, string>
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetTime: number
  retryAfter?: number
  headers: Record<string, string>
  reason?: string
}

export interface RateLimitUsage {
  key: string
  count: number
  limit: number
  window: number
  resetTime: number
  firstRequest: number
  lastRequest: number
  blocked: number
}

export interface RateLimitAnalytics {
  period: { start: number; end: number }
  requests: {
    total: number
    allowed: number
    blocked: number
    delayed: number
  }
  limits: {
    triggered: number
    topLimits: Array<{ rule: string; triggers: number }>
  }
  usage: {
    byScope: Record<string, number>
    byEndpoint: Record<string, number>
    byUser: Record<string, number>
  }
  performance: {
    avgProcessingTime: number
    peakRps: number
    bottlenecks: string[]
  }
}

export class RateLimiting {
  private rules: Map<string, RateLimitRule> = new Map()
  private usage: Map<string, RateLimitUsage> = new Map()
  private analytics: Map<string, any> = new Map()
  private config: {
    enabled: boolean
    defaultRpm: number
    burstLimit: number
    windowMs: number
    cleanupInterval: number
  }

  constructor(config: any) {
    this.config = {
      enabled: true,
      defaultRpm: 1000,
      burstLimit: 50,
      windowMs: 60000, // 1 minute
      cleanupInterval: 300000, // 5 minutes
      ...config
    }

    this.initializeDefaultRules()
  }

  /**
   * Initialize rate limiting system
   */
  async initialize(): Promise<void> {
    try {
      if (!this.config.enabled) {
        logger.info('Rate limiting disabled')
        return
      }

      // Start cleanup timer
      setInterval(() => {
        this.cleanup().catch(error => {
          logger.error('Rate limit cleanup failed', error instanceof Error ? error : undefined)
        })
      }, this.config.cleanupInterval)

      logger.info('Rate limiting system initialized successfully', {
        rulesCount: this.rules.size,
        defaultRpm: this.config.defaultRpm,
        enabled: this.config.enabled
      })

    } catch (error) {
      logger.error('Failed to initialize rate limiting system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Check rate limit for request
   */
  async checkLimit(request: {
    ip: string
    userId?: string
    apiKey?: string
    endpoint: string
    method: string
    userType?: string
    subscription?: string
  }): Promise<RateLimitResult> {
    try {
      if (!this.config.enabled) {
        return {
          allowed: true,
          limit: Infinity,
          remaining: Infinity,
          resetTime: Date.now() + this.config.windowMs,
          headers: {}
        }
      }

      const applicableRules = this.getApplicableRules(request)
      let mostRestrictive: RateLimitResult | null = null

      // Check all applicable rules
      for (const rule of applicableRules) {
        const result = await this.checkRule(rule, request)
        
        if (!result.allowed || (mostRestrictive && result.remaining < mostRestrictive.remaining)) {
          mostRestrictive = result
        }
      }

      // If no rules apply, use default
      if (!mostRestrictive) {
        mostRestrictive = await this.checkDefaultLimit(request)
      }

      // Record analytics
      await this.recordUsage(request, mostRestrictive)

      // Add standard headers
      mostRestrictive.headers = {
        'X-RateLimit-Limit': mostRestrictive.limit.toString(),
        'X-RateLimit-Remaining': mostRestrictive.remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(mostRestrictive.resetTime / 1000).toString(),
        ...mostRestrictive.headers
      }

      if (!mostRestrictive.allowed && mostRestrictive.retryAfter) {
        mostRestrictive.headers['Retry-After'] = Math.ceil(mostRestrictive.retryAfter / 1000).toString()
      }

      return mostRestrictive

    } catch (error) {
      logger.error('Rate limit check failed', error instanceof Error ? error : undefined, request)
      // Allow request on error to prevent service disruption
      return {
        allowed: true,
        limit: this.config.defaultRpm,
        remaining: this.config.defaultRpm,
        resetTime: Date.now() + this.config.windowMs,
        headers: {}
      }
    }
  }

  /**
   * Add rate limit rule
   */
  addRule(rule: RateLimitRule): void {
    this.rules.set(rule.id, rule)
    
    logger.info('Rate limit rule added', {
      ruleId: rule.id,
      strategy: rule.strategy,
      limit: rule.limit,
      scope: rule.scope
    })
  }

  /**
   * Remove rate limit rule
   */
  removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId)
    
    if (removed) {
      logger.info('Rate limit rule removed', { ruleId })
    }
    
    return removed
  }

  /**
   * Get current usage for key
   */
  async getUsage(key: string): Promise<RateLimitUsage | null> {
    try {
      return this.usage.get(key) || null

    } catch (error) {
      logger.error('Failed to get rate limit usage', error instanceof Error ? error : undefined, { key })
      return null
    }
  }

  /**
   * Reset rate limit for key
   */
  async resetLimit(key: string): Promise<boolean> {
    try {
      const removed = this.usage.delete(key)
      
      if (removed) {
        logger.info('Rate limit reset', { key })
      }
      
      return removed

    } catch (error) {
      logger.error('Failed to reset rate limit', error instanceof Error ? error : undefined, { key })
      return false
    }
  }

  /**
   * Get rate limiting analytics
   */
  async getAnalytics(timeframe: { start: number; end: number }): Promise<RateLimitAnalytics> {
    try {
      // Calculate analytics from actual usage data
      let totalRequests = 0
      let allowedRequests = 0
      let blockedRequests = 0
      const delayedRequests = 0
      const limitTriggerCounts: Map<string, number> = new Map()
      const scopeUsage: Record<string, number> = {}
      const endpointUsage: Record<string, number> = {}
      const userTypeUsage: Record<string, number> = {}

      // Process usage data within timeframe
      for (const [key, usage] of this.usage) {
        if (usage.firstRequest >= timeframe.start && usage.lastRequest <= timeframe.end) {
          totalRequests += usage.count
          allowedRequests += usage.count - usage.blocked
          blockedRequests += usage.blocked

          // Extract scope from key
          const [scope] = key.split(':')
          scopeUsage[scope] = (scopeUsage[scope] || 0) + usage.count
        }
      }

      // Get top triggered limits
      const topLimits = Array.from(limitTriggerCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([rule, triggers]) => ({ rule, triggers }))

      // Calculate performance metrics
      const totalProcessingTime = 0
      const processedRequests = 0
      
      // This would typically come from metrics collection
      const avgProcessingTime = processedRequests > 0 ? totalProcessingTime / processedRequests : 0
      const peakRps = Math.max(...Array.from(this.usage.values()).map(u => u.count / (u.window / 1000)))

      return {
        period: timeframe,
        requests: {
          total: totalRequests,
          allowed: allowedRequests,
          blocked: blockedRequests,
          delayed: delayedRequests
        },
        limits: {
          triggered: limitTriggerCounts.size,
          topLimits
        },
        usage: {
          byScope: scopeUsage,
          byEndpoint: endpointUsage,
          byUser: userTypeUsage
        },
        performance: {
          avgProcessingTime,
          peakRps,
          bottlenecks: []
        }
      }

    } catch (error) {
      logger.error('Failed to get rate limiting analytics', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate rate limiting middleware
   */
  generateMiddleware(): (req: any, res: any, next: any) => Promise<void> {
    return async (req: any, res: any, next: any) => {
      try {
        const request = {
          ip: req.ip || req.connection.remoteAddress,
          userId: req.user?.id,
          apiKey: req.headers['x-api-key'],
          endpoint: req.route?.path || req.path,
          method: req.method,
          userType: req.user?.type,
          subscription: req.user?.subscription
        }

        const result = await this.checkLimit(request)

        // Add rate limit headers to response
        for (const [header, value] of Object.entries(result.headers)) {
          res.setHeader(header, value)
        }

        if (!result.allowed) {
          return res.status(429).json({
            success: false,
            data: null,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: result.reason || 'Rate limit exceeded',
              details: {
                limit: result.limit,
                resetTime: result.resetTime,
                retryAfter: result.retryAfter
              }
            }
          })
        }

        // Attach rate limit info to request
        req.rateLimit = {
          limit: result.limit,
          remaining: result.remaining,
          resetTime: result.resetTime
        }

        next()

      } catch (error) {
        logger.error('Rate limiting middleware error', error instanceof Error ? error : undefined)
        // Allow request on error
        next()
      }
    }
  }

  /**
   * Shutdown rate limiting system
   */
  async shutdown(): Promise<void> {
    try {
      this.rules.clear()
      this.usage.clear()
      this.analytics.clear()

      logger.info('Rate limiting system shutdown complete')

    } catch (error) {
      logger.error('Rate limiting shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private initializeDefaultRules(): void {
    // Default API rate limit
    this.addRule({
      id: 'default_api_limit',
      name: 'Default API Limit',
      description: 'Default rate limit for all API endpoints',
      strategy: 'sliding_window',
      limit: this.config.defaultRpm,
      window: this.config.windowMs,
      scope: 'api_key',
      actions: [
        {
          type: 'block',
          message: 'API rate limit exceeded'
        }
      ],
      priority: 100
    })

    // Burst protection
    this.addRule({
      id: 'burst_protection',
      name: 'Burst Protection',
      description: 'Protect against sudden traffic spikes',
      strategy: 'token_bucket',
      limit: this.config.burstLimit,
      window: 10000, // 10 seconds
      scope: 'ip',
      actions: [
        {
          type: 'delay',
          duration: 1000,
          message: 'Request delayed due to burst protection'
        }
      ],
      priority: 200
    })

    // Free tier limits
    this.addRule({
      id: 'free_tier_limit',
      name: 'Free Tier Limit',
      description: 'Reduced limits for free tier users',
      strategy: 'fixed_window',
      limit: 100,
      window: this.config.windowMs,
      scope: 'user',
      conditions: [
        {
          type: 'subscription',
          operator: 'equals',
          value: 'free'
        }
      ],
      actions: [
        {
          type: 'block',
          message: 'Free tier rate limit exceeded. Upgrade for higher limits.'
        }
      ],
      priority: 300
    })

    // Premium tier limits
    this.addRule({
      id: 'premium_tier_limit',
      name: 'Premium Tier Limit',
      description: 'Higher limits for premium users',
      strategy: 'sliding_window',
      limit: 5000,
      window: this.config.windowMs,
      scope: 'user',
      conditions: [
        {
          type: 'subscription',
          operator: 'in',
          value: ['premium', 'enterprise']
        }
      ],
      actions: [
        {
          type: 'block',
          message: 'Premium tier rate limit exceeded'
        }
      ],
      priority: 50
    })

    // Endpoint-specific limits
    this.addRule({
      id: 'heavy_endpoint_limit',
      name: 'Heavy Endpoint Limit',
      description: 'Special limits for resource-intensive endpoints',
      strategy: 'leaky_bucket',
      limit: 10,
      window: this.config.windowMs,
      scope: 'user',
      endpoints: ['/analytics/report', '/workflows/execute'],
      actions: [
        {
          type: 'delay',
          duration: 2000,
          message: 'Request delayed due to resource constraints'
        }
      ],
      priority: 250
    })
  }

  private getApplicableRules(request: any): RateLimitRule[] {
    const rules: RateLimitRule[] = []

    for (const rule of this.rules.values()) {
      if (this.ruleApplies(rule, request)) {
        rules.push(rule)
      }
    }

    // Sort by priority (higher priority first)
    return rules.sort((a, b) => b.priority - a.priority)
  }

  private ruleApplies(rule: RateLimitRule, request: any): boolean {
    // Check endpoint restrictions
    if (rule.endpoints && rule.endpoints.length > 0) {
      if (!rule.endpoints.some(endpoint => this.matchesEndpoint(endpoint, request.endpoint))) {
        return false
      }
    }

    // Check conditions
    if (rule.conditions) {
      for (const condition of rule.conditions) {
        if (!this.evaluateCondition(condition, request)) {
          return false
        }
      }
    }

    return true
  }

  private matchesEndpoint(pattern: string, endpoint: string): boolean {
    // Simple pattern matching - in production, use more sophisticated matching
    return pattern === endpoint || endpoint.startsWith(pattern.replace('*', ''))
  }

  private evaluateCondition(condition: RateLimitCondition, request: any): boolean {
    const value = this.getConditionValue(condition.type, request)
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value
      case 'not_equals':
        return value !== condition.value
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value)
      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(value)
      case 'greater_than':
        return value > condition.value
      case 'less_than':
        return value < condition.value
      default:
        return true
    }
  }

  private getConditionValue(type: string, request: any): any {
    switch (type) {
      case 'time':
        return new Date().getHours()
      case 'user_type':
        return request.userType
      case 'subscription':
        return request.subscription
      case 'endpoint':
        return request.endpoint
      case 'method':
        return request.method
      default:
        return null
    }
  }

  private async checkRule(rule: RateLimitRule, request: any): Promise<RateLimitResult> {
    const key = this.generateKey(rule.scope, request)
    const now = Date.now()

    let usage = this.usage.get(key)
    if (!usage) {
      usage = {
        key,
        count: 0,
        limit: rule.limit,
        window: rule.window,
        resetTime: now + rule.window,
        firstRequest: now,
        lastRequest: now,
        blocked: 0
      }
      this.usage.set(key, usage)
    }

    // Apply rate limiting strategy
    const result = this.applyStrategy(rule, usage, now)

    // Update usage
    if (result.allowed) {
      usage.count++
      usage.lastRequest = now
    } else {
      usage.blocked++
    }

    return result
  }

  private applyStrategy(rule: RateLimitRule, usage: RateLimitUsage, now: number): RateLimitResult {
    switch (rule.strategy) {
      case 'fixed_window':
        return this.applyFixedWindow(rule, usage, now)
      case 'sliding_window':
        return this.applySlidingWindow(rule, usage, now)
      case 'token_bucket':
        return this.applyTokenBucket(rule, usage, now)
      case 'leaky_bucket':
        return this.applyLeakyBucket(rule, usage, now)
      default:
        return this.applyFixedWindow(rule, usage, now)
    }
  }

  private applyFixedWindow(rule: RateLimitRule, usage: RateLimitUsage, now: number): RateLimitResult {
    // Reset window if expired
    if (now >= usage.resetTime) {
      usage.count = 0
      usage.resetTime = now + rule.window
    }

    const allowed = usage.count < rule.limit
    const remaining = Math.max(0, rule.limit - usage.count - 1)

    return {
      allowed,
      limit: rule.limit,
      remaining,
      resetTime: usage.resetTime,
      retryAfter: allowed ? undefined : usage.resetTime - now,
      headers: {},
      reason: allowed ? undefined : 'Fixed window rate limit exceeded'
    }
  }

  private applySlidingWindow(rule: RateLimitRule, usage: RateLimitUsage, now: number): RateLimitResult {
    // For sliding window, we need to track requests over time
    // Simplified implementation - in production, use more sophisticated tracking
    const windowStart = now - rule.window
    
    // Reset if outside window
    if (usage.lastRequest < windowStart) {
      usage.count = 0
    }

    const allowed = usage.count < rule.limit
    const remaining = Math.max(0, rule.limit - usage.count - 1)
    const resetTime = now + rule.window

    return {
      allowed,
      limit: rule.limit,
      remaining,
      resetTime,
      retryAfter: allowed ? undefined : Math.ceil(rule.window / rule.limit),
      headers: {},
      reason: allowed ? undefined : 'Sliding window rate limit exceeded'
    }
  }

  private applyTokenBucket(rule: RateLimitRule, usage: RateLimitUsage, now: number): RateLimitResult {
    // Token bucket allows bursts up to the bucket size
    const timePassed = now - usage.lastRequest
    const tokensToAdd = Math.floor(timePassed / (rule.window / rule.limit))
    
    usage.count = Math.max(0, usage.count - tokensToAdd)
    
    const allowed = usage.count < rule.limit
    const remaining = Math.max(0, rule.limit - usage.count - 1)

    return {
      allowed,
      limit: rule.limit,
      remaining,
      resetTime: now + (rule.window / rule.limit),
      retryAfter: allowed ? undefined : rule.window / rule.limit,
      headers: {},
      reason: allowed ? undefined : 'Token bucket depleted'
    }
  }

  private applyLeakyBucket(rule: RateLimitRule, usage: RateLimitUsage, now: number): RateLimitResult {
    // Leaky bucket provides smooth rate limiting
    const timePassed = now - usage.lastRequest
    const leaked = Math.floor(timePassed / (rule.window / rule.limit))
    
    usage.count = Math.max(0, usage.count - leaked)
    
    const allowed = usage.count < rule.limit
    const remaining = Math.max(0, rule.limit - usage.count - 1)

    return {
      allowed,
      limit: rule.limit,
      remaining,
      resetTime: now + (rule.window / rule.limit) * remaining,
      retryAfter: allowed ? undefined : rule.window / rule.limit,
      headers: {},
      reason: allowed ? undefined : 'Leaky bucket overflow'
    }
  }

  private async checkDefaultLimit(request: any): Promise<RateLimitResult> {
    const defaultRule: RateLimitRule = {
      id: 'default',
      name: 'Default',
      description: 'Default rate limit',
      strategy: 'sliding_window',
      limit: this.config.defaultRpm,
      window: this.config.windowMs,
      scope: 'ip',
      actions: [],
      priority: 1
    }

    return await this.checkRule(defaultRule, request)
  }

  private generateKey(scope: string, request: any): string {
    switch (scope) {
      case 'global':
        return 'global'
      case 'ip':
        return `ip:${request.ip}`
      case 'user':
        return `user:${request.userId || 'anonymous'}`
      case 'api_key':
        return `api_key:${request.apiKey || 'none'}`
      case 'endpoint':
        return `endpoint:${request.endpoint}`
      default:
        return `unknown:${scope}`
    }
  }

  private async recordUsage(request: any, result: RateLimitResult): Promise<void> {
    try {
      // Record metrics
      await metricsCollector.recordMetric(
        'rate_limit_check',
        1,
        'count',
        {
          allowed: result.allowed.toString(),
          endpoint: request.endpoint,
          method: request.method,
          scope: 'api'
        }
      )

      if (!result.allowed) {
        await metricsCollector.recordMetric(
          'rate_limit_exceeded',
          1,
          'count',
          {
            endpoint: request.endpoint,
            reason: result.reason || 'unknown'
          }
        )
      }

    } catch (error) {
      logger.error('Failed to record rate limit usage', error instanceof Error ? error : undefined)
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const now = Date.now()
      let cleaned = 0

      // Remove expired usage entries
      for (const [key, usage] of this.usage) {
        if (now > usage.resetTime + usage.window) {
          this.usage.delete(key)
          cleaned++
        }
      }

      if (cleaned > 0) {
        logger.debug('Rate limit cleanup completed', {
          cleaned,
          remaining: this.usage.size
        })
      }

    } catch (error) {
      logger.error('Rate limit cleanup failed', error instanceof Error ? error : undefined)
    }
  }
}

export default RateLimiting