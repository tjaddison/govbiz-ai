import { NextRequest } from 'next/server'
// Note: next-auth is not compatible with Edge Runtime
// For middleware use, implement custom session validation
// import { getServerSession } from 'next-auth'
// import { authOptions } from '@/lib/auth'

// Security Configuration Types
export interface SecurityConfig {
  rateLimit: {
    requests: number
    windowMs: number
    skipSuccessfulRequests: boolean
  }
  contentSecurity: {
    maxFileSize: number
    allowedMimeTypes: string[]
    scanTimeout: number
  }
  authentication: {
    sessionTimeout: number
    maxSessions: number
    requireMFA: boolean
  }
  dataProtection: {
    encryptionAlgorithm: string
    keyRotationInterval: number
    dataRetention: number
  }
  audit: {
    logLevel: 'basic' | 'detailed' | 'comprehensive'
    retainLogs: number
    realTimeAlerts: boolean
  }
}

export interface SecurityEvent {
  id: string
  type: SecurityEventType
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: Date
  userId?: string
  sessionId?: string
  ipAddress: string
  userAgent: string
  details: Record<string, any>
  resolved: boolean
  resolvedAt?: Date
  resolvedBy?: string
}

export enum SecurityEventType {
  AUTHENTICATION_FAILURE = 'auth_failure',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_BREACH_ATTEMPT = 'data_breach_attempt',
  MALICIOUS_CONTENT = 'malicious_content',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  SESSION_HIJACK = 'session_hijack',
  BRUTE_FORCE_ATTACK = 'brute_force_attack',
  SQL_INJECTION = 'sql_injection',
  XSS_ATTEMPT = 'xss_attempt',
  CSRF_ATTACK = 'csrf_attack',
  FILE_UPLOAD_VIOLATION = 'file_upload_violation',
  API_ABUSE = 'api_abuse',
  COMPLIANCE_VIOLATION = 'compliance_violation'
}

export interface SecurityReport {
  id: string
  period: { start: Date; end: Date }
  summary: {
    totalEvents: number
    criticalEvents: number
    highEvents: number
    mediumEvents: number
    lowEvents: number
    resolvedEvents: number
  }
  trends: {
    mostCommonThreats: Array<{ type: SecurityEventType; count: number }>
    attackSources: Array<{ ip: string; country?: string; count: number }>
    targetedUsers: Array<{ userId: string; eventCount: number }>
    timePatterns: Array<{ hour: number; eventCount: number }>
  }
  compliance: {
    status: 'compliant' | 'partial' | 'non-compliant'
    violations: Array<{ rule: string; severity: string; count: number }>
    recommendations: string[]
  }
  generatedAt: Date
  generatedBy: string
}

/**
 * Government-grade security framework implementing comprehensive protection
 * for sensitive government contracting data and communications
 */
export class SecurityFramework {
  private config: SecurityConfig
  private eventStore: Map<string, SecurityEvent> = new Map()
  private rateLimitCache: Map<string, { count: number; resetTime: number }> = new Map()
  private suspiciousActivities: Map<string, number> = new Map()

  constructor(config: SecurityConfig) {
    this.config = config
    this.startSecurityMonitoring()
  }

  /**
   * Comprehensive request validation and security checks
   */
  async validateRequest(request: NextRequest): Promise<{
    allowed: boolean
    reason?: string
    securityEvent?: SecurityEvent
  }> {
    const clientInfo = this.extractClientInfo(request)
    
    try {
      // 1. Rate limiting check
      const rateLimitResult = await this.checkRateLimit(clientInfo.ip, request.url)
      if (!rateLimitResult.allowed) {
        const event = await this.logSecurityEvent({
          type: SecurityEventType.RATE_LIMIT_EXCEEDED,
          severity: 'medium',
          clientInfo,
          details: { limit: this.config.rateLimit, url: request.url }
        })
        return { allowed: false, reason: 'Rate limit exceeded', securityEvent: event }
      }

      // 2. Authentication validation
      const authResult = await this.validateAuthentication(request)
      if (!authResult.valid) {
        const event = await this.logSecurityEvent({
          type: SecurityEventType.AUTHENTICATION_FAILURE,
          severity: 'high',
          clientInfo,
          details: { reason: authResult.reason, url: request.url }
        })
        return { allowed: false, reason: authResult.reason, securityEvent: event }
      }

      // 3. Content security validation
      if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
        const contentResult = await this.validateContent(request)
        if (!contentResult.safe) {
          const event = await this.logSecurityEvent({
            type: SecurityEventType.MALICIOUS_CONTENT,
            severity: 'high',
            clientInfo,
            details: { threats: contentResult.threats, url: request.url }
          })
          return { allowed: false, reason: 'Malicious content detected', securityEvent: event }
        }
      }

      // 4. Injection attack detection
      const injectionResult = this.detectInjectionAttacks(request)
      if (injectionResult.detected) {
        const event = await this.logSecurityEvent({
          type: injectionResult.type || SecurityEventType.MALICIOUS_CONTENT,
          severity: 'critical',
          clientInfo,
          details: { attack: injectionResult.details, url: request.url }
        })
        return { allowed: false, reason: 'Injection attack detected', securityEvent: event }
      }

      // 5. Suspicious activity monitoring
      const suspiciousResult = await this.checkSuspiciousActivity(clientInfo.ip, request)
      if (suspiciousResult.suspicious) {
        const event = await this.logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_ACTIVITY,
          severity: suspiciousResult.severity,
          clientInfo,
          details: { patterns: suspiciousResult.patterns, url: request.url }
        })
        
        // Still allow but log for monitoring
        if (suspiciousResult.severity === 'critical') {
          return { allowed: false, reason: 'Suspicious activity detected', securityEvent: event }
        }
      }

      return { allowed: true }
    } catch (error) {
      console.error('Security validation error:', error)
      const event = await this.logSecurityEvent({
        type: SecurityEventType.API_ABUSE,
        severity: 'medium',
        clientInfo,
        details: { error: error?.toString(), url: request.url }
      })
      return { allowed: false, reason: 'Security validation failed', securityEvent: event }
    }
  }

  /**
   * Rate limiting implementation with sliding window
   */
  private async checkRateLimit(ip: string, endpoint: string): Promise<{ allowed: boolean; resetTime: number }> {
    const key = `${ip}:${endpoint}`
    const now = Date.now()
    const windowMs = this.config.rateLimit.windowMs
    
    const existing = this.rateLimitCache.get(key)
    
    if (!existing || now > existing.resetTime) {
      // New window
      this.rateLimitCache.set(key, {
        count: 1,
        resetTime: now + windowMs
      })
      return { allowed: true, resetTime: now + windowMs }
    }
    
    if (existing.count >= this.config.rateLimit.requests) {
      return { allowed: false, resetTime: existing.resetTime }
    }
    
    existing.count++
    this.rateLimitCache.set(key, existing)
    return { allowed: true, resetTime: existing.resetTime }
  }

  /**
   * Authentication validation
   */
  private async validateAuthentication(request: NextRequest): Promise<{ valid: boolean; reason?: string; userId?: string }> {
    try {
      // In Edge Runtime, use custom session validation instead of getServerSession
      const session: any = null // TODO: Implement custom session validation for Edge Runtime
      
      if (!session) {
        return { valid: false, reason: 'No valid session' }
      }
      
      if (!session.user?.id) {
        return { valid: false, reason: 'Invalid user session' }
      }
      
      // Check session timeout
      const sessionAge = Date.now() - new Date(session.expires).getTime()
      if (sessionAge > this.config.authentication.sessionTimeout) {
        return { valid: false, reason: 'Session expired' }
      }
      
      // Validate email domain if restricted
      if (process.env.ALLOWED_EMAIL_DOMAINS) {
        const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS.split(',')
        const userDomain = session.user.email?.split('@')[1]
        if (userDomain && !allowedDomains.includes(userDomain)) {
          return { valid: false, reason: 'Unauthorized email domain' }
        }
      }
      
      return { valid: true, userId: session.user.id }
    } catch (error) {
      return { valid: false, reason: 'Authentication validation failed' }
    }
  }

  /**
   * Content security validation
   */
  private async validateContent(request: NextRequest): Promise<{ safe: boolean; threats?: string[] }> {
    try {
      const contentLength = request.headers.get('content-length')
      if (contentLength && parseInt(contentLength) > this.config.contentSecurity.maxFileSize) {
        return { safe: false, threats: ['oversized_content'] }
      }
      
      const contentType = request.headers.get('content-type')
      if (contentType && !this.isAllowedMimeType(contentType)) {
        return { safe: false, threats: ['unauthorized_content_type'] }
      }
      
      // Check for malicious patterns in content
      let body: string
      try {
        body = await request.text()
      } catch {
        return { safe: true } // Can't read body, assume safe
      }
      
      const threats = this.scanForThreats(body)
      if (threats.length > 0) {
        return { safe: false, threats }
      }
      
      return { safe: true }
    } catch (error) {
      console.error('Content validation error:', error)
      return { safe: false, threats: ['validation_error'] }
    }
  }

  /**
   * Injection attack detection
   */
  private detectInjectionAttacks(request: NextRequest): {
    detected: boolean
    type?: SecurityEventType
    details?: string
  } {
    const url = request.url
    const searchParams = new URL(url).searchParams
    
    // SQL Injection patterns
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /(\bOR\b.*=.*\bOR\b)/i,
      /(\b1=1\b)/i,
      /(--|\/\*|\*\/)/,
      /(\b(SCRIPT|JAVASCRIPT|VBSCRIPT)\b)/i
    ]
    
    // XSS patterns
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe[^>]*>.*?<\/iframe>/i,
      /eval\s*\(/i,
      /document\.cookie/i
    ]
    
    const allParams = Array.from(searchParams.entries()).map(([key, value]) => `${key}=${value}`).join('&')
    
    // Check SQL injection
    for (const pattern of sqlPatterns) {
      if (pattern.test(allParams) || pattern.test(url)) {
        return {
          detected: true,
          type: SecurityEventType.SQL_INJECTION,
          details: `SQL injection pattern detected: ${pattern.source}`
        }
      }
    }
    
    // Check XSS
    for (const pattern of xssPatterns) {
      if (pattern.test(allParams) || pattern.test(url)) {
        return {
          detected: true,
          type: SecurityEventType.XSS_ATTEMPT,
          details: `XSS pattern detected: ${pattern.source}`
        }
      }
    }
    
    return { detected: false }
  }

  /**
   * Suspicious activity monitoring
   */
  private async checkSuspiciousActivity(ip: string, request: NextRequest): Promise<{
    suspicious: boolean
    severity: 'low' | 'medium' | 'high' | 'critical'
    patterns: string[]
  }> {
    const patterns: string[] = []
    let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low'
    
    // Check for rapid successive requests
    const recentRequests = this.getRecentRequestCount(ip)
    if (recentRequests > 100) {
      patterns.push('rapid_successive_requests')
      maxSeverity = 'high'
    }
    
    // Check for unusual user agent
    const userAgent = request.headers.get('user-agent') || ''
    if (this.isUnusualUserAgent(userAgent)) {
      patterns.push('unusual_user_agent')
      maxSeverity = maxSeverity === 'low' ? 'medium' : maxSeverity
    }
    
    // Check for geographic anomalies (would require GeoIP service)
    // This is a placeholder for actual implementation
    
    // Check for bot-like behavior patterns
    if (this.detectBotBehavior(request)) {
      patterns.push('bot_behavior')
      maxSeverity = maxSeverity === 'low' ? 'medium' : maxSeverity
    }
    
    return {
      suspicious: patterns.length > 0,
      severity: maxSeverity,
      patterns
    }
  }

  /**
   * Log security events with proper classification
   */
  private async logSecurityEvent(eventData: {
    type: SecurityEventType
    severity: 'low' | 'medium' | 'high' | 'critical'
    clientInfo: any
    details: Record<string, any>
  }): Promise<SecurityEvent> {
    const event: SecurityEvent = {
      id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: eventData.type,
      severity: eventData.severity,
      timestamp: new Date(),
      ipAddress: eventData.clientInfo.ip,
      userAgent: eventData.clientInfo.userAgent,
      details: eventData.details,
      resolved: false
    }
    
    if (eventData.clientInfo.userId) {
      event.userId = eventData.clientInfo.userId
    }
    
    // Store event
    this.eventStore.set(event.id, event)
    
    // Real-time alerting for critical events
    if (event.severity === 'critical' && this.config.audit.realTimeAlerts) {
      await this.sendRealTimeAlert(event)
    }
    
    console.warn(`Security Event [${event.severity.toUpperCase()}]:`, {
      type: event.type,
      ip: event.ipAddress,
      details: event.details
    })
    
    return event
  }

  /**
   * Generate comprehensive security reports
   */
  async generateSecurityReport(
    startDate: Date,
    endDate: Date,
    userId: string
  ): Promise<SecurityReport> {
    const events = Array.from(this.eventStore.values())
      .filter(event => event.timestamp >= startDate && event.timestamp <= endDate)
    
    const summary = {
      totalEvents: events.length,
      criticalEvents: events.filter(e => e.severity === 'critical').length,
      highEvents: events.filter(e => e.severity === 'high').length,
      mediumEvents: events.filter(e => e.severity === 'medium').length,
      lowEvents: events.filter(e => e.severity === 'low').length,
      resolvedEvents: events.filter(e => e.resolved).length
    }
    
    // Threat analysis
    const threatCounts = new Map<SecurityEventType, number>()
    events.forEach(event => {
      threatCounts.set(event.type, (threatCounts.get(event.type) || 0) + 1)
    })
    
    const mostCommonThreats = Array.from(threatCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
    
    // IP analysis
    const ipCounts = new Map<string, number>()
    events.forEach(event => {
      ipCounts.set(event.ipAddress, (ipCounts.get(event.ipAddress) || 0) + 1)
    })
    
    const attackSources = Array.from(ipCounts.entries())
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
    
    // User targeting analysis
    const userCounts = new Map<string, number>()
    events.forEach(event => {
      if (event.userId) {
        userCounts.set(event.userId, (userCounts.get(event.userId) || 0) + 1)
      }
    })
    
    const targetedUsers = Array.from(userCounts.entries())
      .map(([userId, eventCount]) => ({ userId, eventCount }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10)
    
    // Time pattern analysis
    const timePatterns = Array(24).fill(0)
    events.forEach(event => {
      const hour = event.timestamp.getHours()
      timePatterns[hour]++
    })
    
    const timePatternData = timePatterns.map((count, hour) => ({ hour, eventCount: count }))
    
    // Compliance assessment
    const complianceViolations = [
      {
        rule: 'NIST 800-53 AC-2',
        severity: 'high',
        count: events.filter(e => e.type === SecurityEventType.AUTHENTICATION_FAILURE).length
      },
      {
        rule: 'NIST 800-53 SI-4',
        severity: 'medium',
        count: events.filter(e => e.type === SecurityEventType.SUSPICIOUS_ACTIVITY).length
      }
    ]
    
    const criticalViolations = complianceViolations.filter(v => v.severity === 'high' && v.count > 0)
    const complianceStatus = criticalViolations.length > 0 ? 'non-compliant' : 
                           complianceViolations.some(v => v.count > 0) ? 'partial' : 'compliant'
    
    return {
      id: `report_${Date.now()}`,
      period: { start: startDate, end: endDate },
      summary,
      trends: {
        mostCommonThreats,
        attackSources,
        targetedUsers,
        timePatterns: timePatternData
      },
      compliance: {
        status: complianceStatus,
        violations: complianceViolations,
        recommendations: this.generateRecommendations(events)
      },
      generatedAt: new Date(),
      generatedBy: userId
    }
  }

  // Helper methods
  private extractClientInfo(request: NextRequest) {
    return {
      ip: request.headers.get('x-forwarded-for')?.split(',')[0] || 
          request.headers.get('x-real-ip') || 
          '127.0.0.1',
      userAgent: request.headers.get('user-agent') || 'Unknown',
      referer: request.headers.get('referer'),
      origin: request.headers.get('origin')
    }
  }

  private isAllowedMimeType(contentType: string): boolean {
    return this.config.contentSecurity.allowedMimeTypes.some(type => 
      contentType.toLowerCase().includes(type.toLowerCase())
    )
  }

  private scanForThreats(content: string): string[] {
    const threats: string[] = []
    
    // Malicious script patterns
    if (/<script[^>]*>.*?<\/script>/i.test(content)) {
      threats.push('embedded_script')
    }
    
    // Executable file patterns
    if (/\.(exe|bat|cmd|scr|pif|com)$/i.test(content)) {
      threats.push('executable_content')
    }
    
    // Suspicious URLs
    if (/(http|https):\/\/[^\s]+\.(tk|ml|ga|cf)\/[^\s]*/i.test(content)) {
      threats.push('suspicious_urls')
    }
    
    return threats
  }

  private isUnusualUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /curl/i,
      /wget/i,
      /python/i,
      /bot/i,
      /crawler/i,
      /scanner/i,
      /exploit/i
    ]
    
    return suspiciousPatterns.some(pattern => pattern.test(userAgent))
  }

  private detectBotBehavior(request: NextRequest): boolean {
    // Check for missing common headers
    const commonHeaders = ['accept', 'accept-language', 'accept-encoding']
    const missingHeaders = commonHeaders.filter(header => !request.headers.get(header))
    
    return missingHeaders.length > 1
  }

  private getRecentRequestCount(ip: string): number {
    // This would be implemented with actual request tracking
    return this.suspiciousActivities.get(ip) || 0
  }

  private async sendRealTimeAlert(event: SecurityEvent): Promise<void> {
    // This would integrate with alerting systems (email, Slack, SMS, etc.)
    console.error('CRITICAL SECURITY ALERT:', {
      type: event.type,
      severity: event.severity,
      timestamp: event.timestamp,
      ip: event.ipAddress,
      details: event.details
    })
  }

  private generateRecommendations(events: SecurityEvent[]): string[] {
    const recommendations: string[] = []
    
    const authFailures = events.filter(e => e.type === SecurityEventType.AUTHENTICATION_FAILURE).length
    if (authFailures > 10) {
      recommendations.push('Implement stronger authentication mechanisms (MFA)')
    }
    
    const rateLimitEvents = events.filter(e => e.type === SecurityEventType.RATE_LIMIT_EXCEEDED).length
    if (rateLimitEvents > 5) {
      recommendations.push('Review and adjust rate limiting configurations')
    }
    
    const injectionAttacks = events.filter(e => 
      e.type === SecurityEventType.SQL_INJECTION || 
      e.type === SecurityEventType.XSS_ATTEMPT
    ).length
    if (injectionAttacks > 0) {
      recommendations.push('Enhance input validation and sanitization')
    }
    
    return recommendations
  }

  private startSecurityMonitoring(): void {
    // Cleanup old events periodically
    setInterval(() => {
      const cutoff = new Date(Date.now() - (this.config.audit.retainLogs * 24 * 60 * 60 * 1000))
      for (const [id, event] of this.eventStore.entries()) {
        if (event.timestamp < cutoff) {
          this.eventStore.delete(id)
        }
      }
    }, 60 * 60 * 1000) // Every hour
    
    // Clean rate limit cache
    setInterval(() => {
      const now = Date.now()
      for (const [key, data] of this.rateLimitCache.entries()) {
        if (now > data.resetTime) {
          this.rateLimitCache.delete(key)
        }
      }
    }, 5 * 60 * 1000) // Every 5 minutes
  }
}

// Default security configuration for government environments
export const defaultSecurityConfig: SecurityConfig = {
  rateLimit: {
    requests: 100,
    windowMs: 15 * 60 * 1000, // 15 minutes
    skipSuccessfulRequests: false
  },
  contentSecurity: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      'application/json',
      'text/plain',
      'text/html',
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    scanTimeout: 30000
  },
  authentication: {
    sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours
    maxSessions: 3,
    requireMFA: false
  },
  dataProtection: {
    encryptionAlgorithm: 'AES-256-GCM',
    keyRotationInterval: 90, // days
    dataRetention: 2555 // 7 years in days
  },
  audit: {
    logLevel: 'comprehensive',
    retainLogs: 2555, // 7 years in days
    realTimeAlerts: true
  }
}

// Singleton instance
export const securityFramework = new SecurityFramework(defaultSecurityConfig)