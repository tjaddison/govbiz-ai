/**
 * Comprehensive Logging System
 * 
 * Structured logging with multiple levels, audit trails,
 * and compliance features for government requirements
 */

import { MONITORING_CONFIG, SECURITY_CONFIG, AWS_RESOURCES } from '@/lib/aws-config'
import { docClient } from '@/lib/aws-config'
import { PutCommand } from '@aws-sdk/lib-dynamodb'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical'

export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  message: string
  category: string
  userId?: string
  sessionId?: string
  traceId?: string
  metadata?: Record<string, any>
  stackTrace?: string
  source: {
    file?: string
    function?: string
    line?: number
  }
  context: {
    environment: string
    service: string
    version: string
    requestId?: string
  }
}

export interface AuditEntry {
  id: string
  timestamp: number
  userId: string
  action: string
  resource: string
  resourceId?: string
  outcome: 'success' | 'failure' | 'partial'
  details: Record<string, any>
  ipAddress?: string
  userAgent?: string
  sessionId?: string
  compliance: {
    dataClassification: 'public' | 'internal' | 'confidential' | 'restricted'
    retentionPeriod: number
    piiDetected: boolean
  }
}

export interface SecurityEvent {
  id: string
  timestamp: number
  type: 'authentication' | 'authorization' | 'access' | 'data' | 'system'
  severity: 'low' | 'medium' | 'high' | 'critical'
  event: string
  userId?: string
  source: {
    ip: string
    userAgent?: string
    location?: string
  }
  details: Record<string, any>
  threat: {
    level: number
    indicators: string[]
    automated: boolean
  }
}

class Logger {
  private readonly logLevel: LogLevel
  private readonly context: LogEntry['context']
  private readonly buffer: LogEntry[] = []
  private readonly auditBuffer: AuditEntry[] = []
  private readonly securityBuffer: SecurityEvent[] = []
  private flushInterval: NodeJS.Timeout | null = null
  private readonly bufferSize = 50
  private readonly flushIntervalMs = 30000 // 30 seconds

  constructor() {
    this.logLevel = this.parseLogLevel(MONITORING_CONFIG.LOGGING.LEVEL)
    this.context = {
      environment: process.env.NODE_ENV || 'development',
      service: 'govbiz-ai',
      version: '1.0.0',
    }
    
    this.startAutoFlush()
  }

  /**
   * Debug level logging
   */
  debug(message: string, metadata?: Record<string, any>, category = 'general'): void {
    this.log('debug', message, category, metadata)
  }

  /**
   * Info level logging
   */
  info(message: string, metadata?: Record<string, any>, category = 'general'): void {
    this.log('info', message, category, metadata)
  }

  /**
   * Warning level logging
   */
  warn(message: string, metadata?: Record<string, any>, category = 'general'): void {
    this.log('warn', message, category, metadata)
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error, metadata?: Record<string, any>, category = 'general'): void {
    const errorMetadata = {
      ...metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    }
    
    this.log('error', message, category, errorMetadata, error?.stack)
  }

  /**
   * Critical level logging
   */
  critical(message: string, error?: Error, metadata?: Record<string, any>, category = 'general'): void {
    const errorMetadata = {
      ...metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    }
    
    this.log('critical', message, category, errorMetadata, error?.stack)
  }

  /**
   * Structured logging with context
   */
  withContext(
    userId?: string,
    sessionId?: string,
    traceId?: string,
    requestId?: string
  ): ContextualLogger {
    return new ContextualLogger(this, { userId, sessionId, traceId, requestId })
  }

  /**
   * Log audit trail entry
   */
  async audit(entry: Omit<AuditEntry, 'id' | 'timestamp' | 'compliance'>): Promise<void> {
    const auditEntry: AuditEntry = {
      id: this.generateId('audit'),
      timestamp: Date.now(),
      ...entry,
      compliance: {
        dataClassification: this.classifyData(entry.details),
        retentionPeriod: SECURITY_CONFIG.COMPLIANCE.DATA_RETENTION_DAYS,
        piiDetected: this.detectPII(JSON.stringify(entry.details)),
      },
    }

    this.auditBuffer.push(auditEntry)

    // Log critical audit events immediately
    if (entry.outcome === 'failure' || this.isCriticalAction(entry.action)) {
      await this.flushAuditLogs()
    }

    // Also log as regular log entry
    this.info('Audit event recorded', {
      action: entry.action,
      resource: entry.resource,
      outcome: entry.outcome,
      userId: entry.userId,
    }, 'audit')
  }

  /**
   * Log security event
   */
  async security(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      id: this.generateId('security'),
      timestamp: Date.now(),
      ...event,
    }

    this.securityBuffer.push(securityEvent)

    // Immediately flush high/critical security events
    if (event.severity === 'high' || event.severity === 'critical') {
      await this.flushSecurityEvents()
    }

    // Also log as regular log entry
    this.warn('Security event detected', {
      type: event.type,
      event: event.event,
      severity: event.severity,
      userId: event.userId,
      sourceIp: event.source.ip,
    }, 'security')
  }

  /**
   * Performance logging
   */
  performance(
    operation: string,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    this.info(`Performance: ${operation}`, {
      duration,
      operation,
      ...metadata,
    }, 'performance')
  }

  /**
   * Business metrics logging
   */
  business(
    metric: string,
    value: number | string,
    metadata?: Record<string, any>
  ): void {
    this.info(`Business metric: ${metric}`, {
      metric,
      value,
      ...metadata,
    }, 'business')
  }

  /**
   * Flush all buffers
   */
  async flush(): Promise<void> {
    await Promise.all([
      this.flushLogs(),
      this.flushAuditLogs(),
      this.flushSecurityEvents(),
    ])
  }

  /**
   * Shutdown logger
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    
    await this.flush()
  }

  // Private methods
  private log(
    level: LogLevel,
    message: string,
    category: string,
    metadata?: Record<string, any>,
    stackTrace?: string
  ): void {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      id: this.generateId('log'),
      timestamp: Date.now(),
      level,
      message,
      category,
      metadata: this.sanitizeMetadata(metadata),
      stackTrace,
      source: this.getCallSite(),
      context: { ...this.context },
    }

    this.buffer.push(entry)

    // Console output based on environment
    if (process.env.NODE_ENV !== 'production' || level === 'critical') {
      this.consoleOutput(entry)
    }

    // Flush immediately for critical logs
    if (level === 'critical') {
      this.flushLogs().catch(console.error)
    }

    // Flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      this.flushLogs().catch(console.error)
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'critical']
    const currentLevelIndex = levels.indexOf(this.logLevel)
    const logLevelIndex = levels.indexOf(level)
    
    return logLevelIndex >= currentLevelIndex
  }

  private parseLogLevel(level: string): LogLevel {
    const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'critical']
    return validLevels.includes(level as LogLevel) ? (level as LogLevel) : 'info'
  }

  private sanitizeMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
    if (!metadata) return undefined

    const sanitized = { ...metadata }
    
    // Remove sensitive data
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'ssn', 'creditcard']
    
    const sanitizeObject = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj
      
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject)
      }
      
      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase()
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          result[key] = '[REDACTED]'
        } else {
          result[key] = sanitizeObject(value)
        }
      }
      return result
    }

    return sanitizeObject(sanitized)
  }

  private getCallSite(): LogEntry['source'] {
    if (!MONITORING_CONFIG.LOGGING.INCLUDE_STACK_TRACES) {
      return {}
    }

    const stack = new Error().stack
    if (!stack) return {}

    const lines = stack.split('\n')
    // Skip the first few lines (Error, this function, log function)
    const callerLine = lines[4] || ''
    
    const match = callerLine.match(/at (.+) \((.+):(\d+):(\d+)\)/)
    if (match) {
      return {
        function: match[1],
        file: match[2],
        line: parseInt(match[3], 10),
      }
    }

    return {}
  }

  private consoleOutput(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString()
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.category}]`
    
    const message = `${prefix} ${entry.message}`
    const details = entry.metadata ? JSON.stringify(entry.metadata, null, 2) : ''

    switch (entry.level) {
      case 'debug':
        console.debug(message, details)
        break
      case 'info':
        console.log(message, details)
        break
      case 'warn':
        console.warn(message, details)
        break
      case 'error':
      case 'critical':
        console.error(message, details)
        if (entry.stackTrace) {
          console.error(entry.stackTrace)
        }
        break
    }
  }

  private async flushLogs(): Promise<void> {
    if (this.buffer.length === 0) return

    const logsToFlush = [...this.buffer]
    this.buffer.length = 0

    try {
      await this.persistLogs(logsToFlush)
    } catch (error) {
      console.error('Failed to flush logs:', error)
      // Re-add logs to buffer for retry
      this.buffer.unshift(...logsToFlush)
    }
  }

  private async flushAuditLogs(): Promise<void> {
    if (this.auditBuffer.length === 0) return

    const auditLogsToFlush = [...this.auditBuffer]
    this.auditBuffer.length = 0

    try {
      await this.persistAuditLogs(auditLogsToFlush)
    } catch (error) {
      console.error('Failed to flush audit logs:', error)
      this.auditBuffer.unshift(...auditLogsToFlush)
    }
  }

  private async flushSecurityEvents(): Promise<void> {
    if (this.securityBuffer.length === 0) return

    const securityEventsToFlush = [...this.securityBuffer]
    this.securityBuffer.length = 0

    try {
      await this.persistSecurityEvents(securityEventsToFlush)
    } catch (error) {
      console.error('Failed to flush security events:', error)
      this.securityBuffer.unshift(...securityEventsToFlush)
    }
  }

  private async persistLogs(logs: LogEntry[]): Promise<void> {
    // In production, would batch write to DynamoDB
    for (const log of logs) {
      try {
        await docClient.send(new PutCommand({
          TableName: AWS_RESOURCES.TABLES.AUDIT,
          Item: {
            pk: 'LOG',
            sk: `LOG#${log.timestamp}#${log.id}`,
            logId: log.id,
            timestamp: log.timestamp,
            level: log.level,
            message: log.message,
            category: log.category,
            userId: log.userId,
            sessionId: log.sessionId,
            traceId: log.traceId,
            metadata: log.metadata || {},
            stackTrace: log.stackTrace,
            source: log.source,
            context: log.context,
            ttl: Math.floor((Date.now() + 90 * 24 * 60 * 60 * 1000) / 1000), // 90 days TTL
          },
        }))
      } catch (error) {
        console.error('Failed to persist log entry:', error)
      }
    }
  }

  private async persistAuditLogs(auditLogs: AuditEntry[]): Promise<void> {
    for (const audit of auditLogs) {
      try {
        await docClient.send(new PutCommand({
          TableName: AWS_RESOURCES.TABLES.AUDIT,
          Item: {
            pk: 'AUDIT',
            sk: `AUDIT#${audit.timestamp}#${audit.id}`,
            auditId: audit.id,
            timestamp: audit.timestamp,
            userId: audit.userId,
            action: audit.action,
            resource: audit.resource,
            resourceId: audit.resourceId,
            outcome: audit.outcome,
            details: audit.details,
            ipAddress: audit.ipAddress,
            userAgent: audit.userAgent,
            sessionId: audit.sessionId,
            compliance: audit.compliance,
            ttl: Math.floor((Date.now() + SECURITY_CONFIG.COMPLIANCE.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000) / 1000),
          },
        }))
      } catch (error) {
        console.error('Failed to persist audit entry:', error)
      }
    }
  }

  private async persistSecurityEvents(securityEvents: SecurityEvent[]): Promise<void> {
    for (const event of securityEvents) {
      try {
        await docClient.send(new PutCommand({
          TableName: AWS_RESOURCES.TABLES.AUDIT,
          Item: {
            pk: 'SECURITY',
            sk: `SECURITY#${event.timestamp}#${event.id}`,
            securityId: event.id,
            timestamp: event.timestamp,
            type: event.type,
            severity: event.severity,
            event: event.event,
            userId: event.userId,
            source: event.source,
            details: event.details,
            threat: event.threat,
            ttl: Math.floor((Date.now() + SECURITY_CONFIG.COMPLIANCE.DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000) / 1000),
          },
        }))
      } catch (error) {
        console.error('Failed to persist security event:', error)
      }
    }
  }

  private classifyData(data: Record<string, any>): AuditEntry['compliance']['dataClassification'] {
    const dataString = JSON.stringify(data).toLowerCase()
    
    if (dataString.includes('classified') || dataString.includes('secret')) {
      return 'restricted'
    }
    
    if (dataString.includes('confidential') || dataString.includes('proprietary')) {
      return 'confidential'
    }
    
    if (dataString.includes('internal') || dataString.includes('employee')) {
      return 'internal'
    }
    
    return 'public'
  }

  private detectPII(text: string): boolean {
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone
    ]

    return piiPatterns.some(pattern => pattern.test(text))
  }

  private isCriticalAction(action: string): boolean {
    const criticalActions = [
      'user_login_failed',
      'user_account_locked',
      'data_export',
      'admin_access',
      'security_configuration_changed',
      'audit_log_accessed',
    ]

    return criticalActions.includes(action)
  }

  private startAutoFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch(console.error)
    }, this.flushIntervalMs)
  }

  private generateId(type: string): string {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

class ContextualLogger {
  constructor(
    private logger: Logger,
    private context: {
      userId?: string
      sessionId?: string
      traceId?: string
      requestId?: string
    }
  ) {}

  debug(message: string, metadata?: Record<string, any>, category = 'general'): void {
    this.logger.debug(message, { ...metadata, ...this.context }, category)
  }

  info(message: string, metadata?: Record<string, any>, category = 'general'): void {
    this.logger.info(message, { ...metadata, ...this.context }, category)
  }

  warn(message: string, metadata?: Record<string, any>, category = 'general'): void {
    this.logger.warn(message, { ...metadata, ...this.context }, category)
  }

  error(message: string, error?: Error, metadata?: Record<string, any>, category = 'general'): void {
    this.logger.error(message, error, { ...metadata, ...this.context }, category)
  }

  critical(message: string, error?: Error, metadata?: Record<string, any>, category = 'general'): void {
    this.logger.critical(message, error, { ...metadata, ...this.context }, category)
  }

  async audit(entry: Omit<AuditEntry, 'id' | 'timestamp' | 'compliance'>): Promise<void> {
    await this.logger.audit({
      ...entry,
      userId: entry.userId || this.context.userId || 'anonymous',
      sessionId: entry.sessionId || this.context.sessionId,
    })
  }

  performance(operation: string, duration: number, metadata?: Record<string, any>): void {
    this.logger.performance(operation, duration, { ...metadata, ...this.context })
  }

  business(metric: string, value: number | string, metadata?: Record<string, any>): void {
    this.logger.business(metric, value, { ...metadata, ...this.context })
  }
}

// Singleton logger instance
export const logger = new Logger()

// Export convenience functions
export const createLogger = (): Logger => new Logger()

export const withContext = (
  userId?: string,
  sessionId?: string,
  traceId?: string,
  requestId?: string
): ContextualLogger => logger.withContext(userId, sessionId, traceId, requestId)

export default logger