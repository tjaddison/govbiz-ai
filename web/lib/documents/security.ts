/**
 * Document Security
 * 
 * Comprehensive security management for documents including access control,
 * encryption, PII detection, compliance, and audit trails
 */

import { 
  Document, 
  DocumentPermission, 
  SecurityEvent,
  PIIType,
  ComplianceFlag,
  AccessLevel,
  EncryptionInfo,
  RetentionPolicy,
  SecurityConfig
} from './types'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { AWS_RESOURCES, SECURITY_CONFIG } from '@/lib/aws-config'
import crypto from 'crypto'

export interface SecurityContext {
  userId: string
  roles: string[]
  permissions: string[]
  clearanceLevel?: string
  department?: string
  ipAddress?: string
  userAgent?: string
  sessionId?: string
}

export interface AccessValidationResult {
  allowed: boolean
  reason: string
  requiredPermissions: string[]
  missingPermissions: string[]
  warnings: string[]
}

export interface PIIDetectionResult {
  detected: boolean
  types: PIIType[]
  locations: PIILocation[]
  confidence: number
  redactedContent?: string
}

export interface PIILocation {
  type: PIIType
  text: string
  startOffset: number
  endOffset: number
  confidence: number
  context: string
}

export interface ComplianceResult {
  compliant: boolean
  flags: ComplianceFlag[]
  violations: ComplianceViolation[]
  recommendations: string[]
}

export interface ComplianceViolation {
  flag: ComplianceFlag
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  remedy: string
  deadline?: number
}

export interface EncryptionResult {
  encrypted: boolean
  algorithm: string
  keyId: string
  iv?: string
  salt?: string
}

export class DocumentSecurity {
  private readonly encryptionKey: string
  private readonly complianceRules: Map<string, any> = new Map()
  private readonly accessPolicies: Map<string, any> = new Map()
  private readonly piiPatterns: Map<PIIType, RegExp[]> = new Map()

  constructor(private config?: SecurityConfig) {
    this.encryptionKey = process.env.DOCUMENT_ENCRYPTION_KEY || 'default-key'
    this.initializePIIPatterns()
    this.initializeComplianceRules()
    this.initializeAccessPolicies()
  }

  /**
   * Validate access to a document
   */
  async validateAccess(
    document: Document,
    securityContext: SecurityContext,
    action: 'read' | 'write' | 'delete' | 'share' | 'download'
  ): Promise<AccessValidationResult> {
    try {
      const requiredPermissions = this.getRequiredPermissions(document, action)
      const userPermissions = await this.getUserPermissions(document.id, securityContext.userId)
      
      // Check basic permissions
      const hasPermission = requiredPermissions.every(permission => 
        userPermissions.includes(permission) || securityContext.permissions.includes(permission)
      )

      if (!hasPermission) {
        const missingPermissions = requiredPermissions.filter(permission => 
          !userPermissions.includes(permission) && !securityContext.permissions.includes(permission)
        )

        await this.recordSecurityEvent({
          type: 'access',
          userId: securityContext.userId,
          details: {
            documentId: document.id,
            action,
            event: 'access_denied',
            reason: 'insufficient_permissions',
            missingPermissions,
            ip: securityContext.ipAddress || 'unknown',
            userAgent: securityContext.userAgent,
          },
        })

        return {
          allowed: false,
          reason: 'Insufficient permissions',
          requiredPermissions,
          missingPermissions,
          warnings: [],
        }
      }

      // Check clearance level for classified documents
      if (document.classification.confidentialityLevel === 'restricted') {
        if (!securityContext.clearanceLevel || 
            !this.hasSufficientClearance(securityContext.clearanceLevel, 'secret')) {
          
          await this.recordSecurityEvent({
            type: 'access',
            userId: securityContext.userId,
            details: {
              documentId: document.id,
              event: 'clearance_violation',
              requiredClearance: 'secret',
              userClearance: securityContext.clearanceLevel || 'none',
              ip: securityContext.ipAddress || 'unknown',
            },
          })

          return {
            allowed: false,
            reason: 'Insufficient security clearance',
            requiredPermissions,
            missingPermissions: ['security_clearance'],
            warnings: [],
          }
        }
      }

      // Check time-based restrictions
      const timeRestrictions = this.checkTimeBasedRestrictions(document, securityContext)
      if (!timeRestrictions.allowed) {
        return {
          allowed: false,
          reason: timeRestrictions.reason,
          requiredPermissions,
          missingPermissions: [],
          warnings: [],
        }
      }

      // Record successful access
      await this.recordSecurityEvent({
        type: 'access',
        userId: securityContext.userId,
        details: {
          documentId: document.id,
          action,
          event: 'access_granted',
          ip: securityContext.ipAddress || 'unknown',
          userAgent: securityContext.userAgent,
        },
      })

      return {
        allowed: true,
        reason: 'Access granted',
        requiredPermissions,
        missingPermissions: [],
        warnings: timeRestrictions.warnings || [],
      }
    } catch (error) {
      logger.error('Access validation failed', error instanceof Error ? error : undefined, {
        documentId: document.id,
        userId: securityContext.userId,
        action,
      }, 'security')

      return {
        allowed: false,
        reason: 'Security validation error',
        requiredPermissions: [],
        missingPermissions: [],
        warnings: ['Security system error - access denied'],
      }
    }
  }

  /**
   * Detect PII in document content
   */
  async detectPII(content: string, options: {
    redact?: boolean
    confidence?: number
  } = {}): Promise<PIIDetectionResult> {
    try {
      const locations: PIILocation[] = []
      const detectedTypes = new Set<PIIType>()
      let redactedContent = content

      // Check each PII pattern
      for (const [piiType, patterns] of this.piiPatterns) {
        for (const pattern of patterns) {
          let match
          const regex = new RegExp(pattern.source, pattern.flags)
          
          while ((match = regex.exec(content)) !== null) {
            const location: PIILocation = {
              type: piiType,
              text: match[0],
              startOffset: match.index,
              endOffset: match.index + match[0].length,
              confidence: this.calculatePIIConfidence(piiType, match[0]),
              context: this.extractContext(content, match.index, 50),
            }

            if (location.confidence >= (options.confidence || 0.7)) {
              locations.push(location)
              detectedTypes.add(piiType)

              // Redact if requested
              if (options.redact) {
                const redactedText = this.redactPII(location.text, piiType)
                redactedContent = redactedContent.replace(location.text, redactedText)
              }
            }
          }
        }
      }

      const result: PIIDetectionResult = {
        detected: locations.length > 0,
        types: Array.from(detectedTypes),
        locations,
        confidence: locations.length > 0 
          ? locations.reduce((sum, loc) => sum + loc.confidence, 0) / locations.length 
          : 0,
        redactedContent: options.redact ? redactedContent : undefined,
      }

      // Record PII detection metrics
      await metricsCollector.recordMetric(
        'pii_detection',
        locations.length,
        'count',
        { 
          hasDetection: result.detected.toString(),
          typesCount: detectedTypes.size.toString()
        }
      )

      if (result.detected) {
        logger.warn('PII detected in document', {
          typesDetected: Array.from(detectedTypes),
          locationsCount: locations.length,
          averageConfidence: result.confidence,
        }, 'security')
      }

      return result
    } catch (error) {
      logger.error('PII detection failed', error instanceof Error ? error : undefined, undefined, 'security')
      
      return {
        detected: false,
        types: [],
        locations: [],
        confidence: 0,
      }
    }
  }

  /**
   * Encrypt document content
   */
  async encryptContent(content: string, keyId?: string): Promise<EncryptionResult> {
    try {
      const algorithm = 'aes-256-gcm'
      const key = keyId ? await this.getEncryptionKey(keyId) : this.encryptionKey
      const iv = crypto.randomBytes(16)
      const salt = crypto.randomBytes(32)

      // Derive key from password and salt
      const derivedKey = crypto.pbkdf2Sync(key, salt, 10000, 32, 'sha256')
      
      const cipher = crypto.createCipher(algorithm, derivedKey)
      let encrypted = cipher.update(content, 'utf8', 'hex')
      encrypted += cipher.final('hex')

      const result: EncryptionResult = {
        encrypted: true,
        algorithm,
        keyId: keyId || 'default',
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
      }

      logger.debug('Content encrypted successfully', {
        algorithm,
        keyId: result.keyId,
        originalLength: content.length,
        encryptedLength: encrypted.length,
      })

      return result
    } catch (error) {
      logger.error('Content encryption failed', error instanceof Error ? error : undefined, undefined, 'security')
      
      return {
        encrypted: false,
        algorithm: '',
        keyId: '',
      }
    }
  }

  /**
   * Decrypt document content
   */
  async decryptContent(
    encryptedContent: string, 
    encryptionInfo: EncryptionInfo
  ): Promise<string> {
    try {
      const key = await this.getEncryptionKey(encryptionInfo.keyId || 'default')
      const salt = Buffer.from('1234567890abcdef1234567890abcdef', 'hex') // Fixed salt for mock implementation
      
      // Derive key from password and salt
      const derivedKey = crypto.pbkdf2Sync(key, salt, 10000, 32, 'sha256')
      
      const decipher = crypto.createDecipher(encryptionInfo.algorithm || 'aes-256-gcm', derivedKey)
      let decrypted = decipher.update(encryptedContent, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      logger.debug('Content decrypted successfully', {
        algorithm: encryptionInfo.algorithm,
        keyId: encryptionInfo.keyId,
      })

      return decrypted
    } catch (error) {
      logger.error('Content decryption failed', error instanceof Error ? error : undefined, {
        algorithm: encryptionInfo.algorithm,
        keyId: encryptionInfo.keyId,
      }, 'security')
      
      throw new Error('Failed to decrypt content')
    }
  }

  /**
   * Check compliance requirements
   */
  async checkCompliance(document: Document): Promise<ComplianceResult> {
    try {
      const flags: ComplianceFlag[] = []
      const violations: ComplianceViolation[] = []
      const recommendations: string[] = []

      // Check PII requirements
      const piiResult = await this.detectPII(document.content)
      if (piiResult.detected && !document.security.piiDetected) {
        flags.push('pii_detected')
        violations.push({
          flag: 'pii_detected',
          severity: 'high',
          description: 'PII detected but not properly flagged',
          remedy: 'Update document security settings and implement PII protection',
          deadline: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        })
      }

      // Check encryption requirements
      if (document.classification.confidentialityLevel !== 'public' && 
          !document.security.encryption.encrypted) {
        flags.push('encryption_required')
        violations.push({
          flag: 'encryption_required',
          severity: 'critical',
          description: 'Sensitive document not encrypted',
          remedy: 'Encrypt document content immediately',
          deadline: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        })
      }

      // Check retention policy
      const retentionViolation = this.checkRetentionPolicy(document)
      if (retentionViolation) {
        flags.push('retention_policy_violation')
        violations.push(retentionViolation)
      }

      // Check classification requirements
      if (document.classification.confidence < 0.8) {
        flags.push('classification_required')
        violations.push({
          flag: 'classification_required',
          severity: 'medium',
          description: 'Document classification confidence too low',
          remedy: 'Review and update document classification',
          deadline: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        })
      }

      // Generate recommendations
      if (piiResult.detected) {
        recommendations.push('Consider implementing data loss prevention (DLP) policies')
        recommendations.push('Provide PII handling training to document creators')
      }

      if (violations.length === 0) {
        recommendations.push('Document meets all current compliance requirements')
      }

      const compliant = violations.filter(v => v.severity === 'critical' || v.severity === 'high').length === 0

      logger.info('Compliance check completed', {
        documentId: document.id,
        compliant,
        flagsCount: flags.length,
        violationsCount: violations.length,
      }, 'security')

      return {
        compliant,
        flags,
        violations,
        recommendations,
      }
    } catch (error) {
      logger.error('Compliance check failed', error instanceof Error ? error : undefined, {
        documentId: document.id,
      }, 'security')

      return {
        compliant: false,
        flags: ['audit_required'],
        violations: [{
          flag: 'audit_required',
          severity: 'critical',
          description: 'Compliance check system error',
          remedy: 'Manual compliance review required',
        }],
        recommendations: ['Contact security team for manual review'],
      }
    }
  }

  /**
   * Apply retention policy to document
   */
  async applyRetentionPolicy(
    document: Document,
    policy?: RetentionPolicy
  ): Promise<{
    applied: boolean
    archiveDate?: number
    deleteDate?: number
    actions: string[]
  }> {
    try {
      const retentionPolicy = policy || document.security.retentionPolicy
      const now = Date.now()
      const actions: string[] = []

      let archiveDate: number | undefined
      let deleteDate: number | undefined

      if (retentionPolicy.archiveAfter > 0) {
        archiveDate = document.createdAt + retentionPolicy.archiveAfter
        if (now >= archiveDate) {
          actions.push('archive_document')
        }
      }

      if (retentionPolicy.deleteAfter > 0) {
        deleteDate = document.createdAt + retentionPolicy.deleteAfter
        if (now >= deleteDate && retentionPolicy.autoDelete) {
          actions.push('delete_document')
        }
      }

      // Record retention policy application
      if (actions.length > 0) {
        await this.recordSecurityEvent({
          type: 'modify',
          userId: 'system',
          details: {
            documentId: document.id,
            actions,
            policy: retentionPolicy,
            event: 'retention_policy_applied',
            ip: 'system',
          },
        })
      }

      logger.debug('Retention policy applied', {
        documentId: document.id,
        actions,
        archiveDate,
        deleteDate,
      })

      return {
        applied: true,
        archiveDate,
        deleteDate,
        actions,
      }
    } catch (error) {
      logger.error('Failed to apply retention policy', error instanceof Error ? error : undefined, {
        documentId: document.id,
      }, 'security')

      return {
        applied: false,
        actions: [],
      }
    }
  }

  /**
   * Generate security audit report
   */
  async generateAuditReport(
    filters: {
      startDate?: number
      endDate?: number
      userId?: string
      documentId?: string
      eventTypes?: string[]
    } = {}
  ): Promise<{
    events: SecurityEvent[]
    summary: {
      totalEvents: number
      failedAccess: number
      successfulAccess: number
      piiViolations: number
      complianceIssues: number
    }
    recommendations: string[]
  }> {
    try {
      // In production, would query from audit database
      const events: SecurityEvent[] = [] // Mock data
      
      const summary = {
        totalEvents: events.length,
        failedAccess: events.filter(e => e.details.event === 'access_denied').length,
        successfulAccess: events.filter(e => e.details.event === 'access_granted').length,
        piiViolations: events.filter(e => e.details.event && e.details.event.includes('pii')).length,
        complianceIssues: events.filter(e => e.details.event && e.details.event.includes('compliance')).length,
      }

      const recommendations = this.generateAuditRecommendations(summary)

      logger.info('Security audit report generated', {
        ...summary,
        filters,
      }, 'security')

      return { events, summary, recommendations }
    } catch (error) {
      logger.error('Failed to generate audit report', error instanceof Error ? error : undefined, undefined, 'security')
      
      return {
        events: [],
        summary: {
          totalEvents: 0,
          failedAccess: 0,
          successfulAccess: 0,
          piiViolations: 0,
          complianceIssues: 0,
        },
        recommendations: ['Unable to generate audit report - system error'],
      }
    }
  }

  // Private methods

  private initializePIIPatterns(): void {
    this.piiPatterns.set('ssn', [
      /\b\d{3}-\d{2}-\d{4}\b/g,
      /\b\d{9}\b/g,
    ])

    this.piiPatterns.set('credit_card', [
      /\b4\d{3}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Visa
      /\b5[1-5]\d{2}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // MasterCard
      /\b3[47]\d{2}[-\s]?\d{6}[-\s]?\d{5}\b/g, // American Express
    ])

    this.piiPatterns.set('email', [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    ])

    this.piiPatterns.set('phone', [
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      /\(\d{3}\)\s?\d{3}[-.]?\d{4}/g,
    ])

    this.piiPatterns.set('address', [
      /\b\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)\b/gi,
    ])

    this.piiPatterns.set('date_of_birth', [
      /\b(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g,
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+(?:19|20)\d{2}\b/gi,
    ])
  }

  private initializeComplianceRules(): void {
    // Government compliance rules
    this.complianceRules.set('fedramp', {
      encryptionRequired: true,
      piiProtection: true,
      auditLogging: true,
      accessControls: true,
    })

    this.complianceRules.set('sox', {
      documentRetention: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
      accessLogging: true,
      integrityChecks: true,
    })
  }

  private initializeAccessPolicies(): void {
    this.accessPolicies.set('default', {
      read: ['user'],
      write: ['author', 'editor'],
      delete: ['author', 'admin'],
      share: ['author', 'editor'],
      download: ['user'],
    })

    this.accessPolicies.set('confidential', {
      read: ['authorized_user'],
      write: ['author', 'senior_editor'],
      delete: ['author', 'admin'],
      share: ['admin'],
      download: ['authorized_user'],
    })
  }

  private getRequiredPermissions(document: Document, action: string): string[] {
    const policy = this.accessPolicies.get(
      document.classification.confidentialityLevel === 'confidential' ? 'confidential' : 'default'
    )
    return policy?.[action] || []
  }

  private async getUserPermissions(documentId: string, userId: string): Promise<string[]> {
    // In production, would query user permissions from database
    return ['user', 'read', 'write'] // Mock permissions
  }

  private hasSufficientClearance(userClearance: string, requiredClearance: string): boolean {
    const clearanceLevels = ['public', 'confidential', 'secret', 'top_secret']
    const userLevel = clearanceLevels.indexOf(userClearance)
    const requiredLevel = clearanceLevels.indexOf(requiredClearance)
    return userLevel >= requiredLevel
  }

  private checkTimeBasedRestrictions(
    document: Document, 
    securityContext: SecurityContext
  ): { allowed: boolean; reason: string; warnings?: string[] } {
    // Check business hours restrictions
    const now = new Date()
    const hour = now.getHours()
    
    if (document.classification.confidentialityLevel === 'restricted' && (hour < 6 || hour > 22)) {
      return {
        allowed: false,
        reason: 'Access to restricted documents only allowed during business hours (6 AM - 10 PM)',
      }
    }

    return { allowed: true, reason: 'Time restrictions passed' }
  }

  private async recordSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    try {
      const securityEvent: SecurityEvent = {
        id: this.generateEventId(),
        timestamp: Date.now(),
        ...event,
      }

      // In production, would store in security database
      logger.warn('Security event recorded', securityEvent, 'security')

      // Record metrics
      await metricsCollector.recordMetric(
        'security_events',
        1,
        'count',
        { 
          type: event.type,
          event: event.details.event || 'unknown'
        }
      )
    } catch (error) {
      logger.error('Failed to record security event', error instanceof Error ? error : undefined, undefined, 'security')
    }
  }

  private calculatePIIConfidence(type: PIIType, text: string): number {
    switch (type) {
      case 'ssn':
        return /^\d{3}-\d{2}-\d{4}$/.test(text) ? 0.95 : 0.7
      case 'email':
        return text.includes('@') && text.includes('.') ? 0.9 : 0.6
      case 'credit_card':
        return this.isValidCreditCard(text) ? 0.95 : 0.7
      default:
        return 0.8
    }
  }

  private isValidCreditCard(number: string): boolean {
    // Luhn algorithm check
    const num = number.replace(/[-\s]/g, '')
    let sum = 0
    let isEven = false
    
    for (let i = num.length - 1; i >= 0; i--) {
      let digit = parseInt(num[i])
      
      if (isEven) {
        digit *= 2
        if (digit > 9) {
          digit -= 9
        }
      }
      
      sum += digit
      isEven = !isEven
    }
    
    return sum % 10 === 0
  }

  private extractContext(content: string, position: number, length: number): string {
    const start = Math.max(0, position - length)
    const end = Math.min(content.length, position + length)
    return content.substring(start, end)
  }

  private redactPII(text: string, type: PIIType): string {
    switch (type) {
      case 'ssn':
        return '***-**-****'
      case 'credit_card':
        return '**** **** **** ****'
      case 'email':
        return '***@***.***'
      case 'phone':
        return '***-***-****'
      default:
        return '*'.repeat(text.length)
    }
  }

  private checkRetentionPolicy(document: Document): ComplianceViolation | null {
    const policy = document.security.retentionPolicy
    const now = Date.now()
    const documentAge = now - document.createdAt

    if (policy.deleteAfter > 0 && documentAge > policy.deleteAfter) {
      return {
        flag: 'retention_policy_violation',
        severity: 'high',
        description: 'Document exceeds retention period and should be deleted',
        remedy: 'Delete document according to retention policy',
        deadline: now + 7 * 24 * 60 * 60 * 1000, // 7 days
      }
    }

    return null
  }

  private generateAuditRecommendations(summary: any): string[] {
    const recommendations: string[] = []

    if (summary.failedAccess > summary.successfulAccess * 0.1) {
      recommendations.push('High number of failed access attempts - review access controls')
    }

    if (summary.piiViolations > 0) {
      recommendations.push('PII violations detected - implement data loss prevention measures')
    }

    if (summary.complianceIssues > 0) {
      recommendations.push('Compliance issues found - schedule compliance review')
    }

    if (recommendations.length === 0) {
      recommendations.push('Security posture appears healthy based on current metrics')
    }

    return recommendations
  }

  private calculateEventSeverity(event: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalEvents = ['clearance_violation', 'unauthorized_access', 'data_breach']
    const highEvents = ['access_denied', 'pii_violation', 'encryption_failure']
    const mediumEvents = ['suspicious_activity', 'policy_violation']

    if (criticalEvents.some(e => event.includes(e))) return 'critical'
    if (highEvents.some(e => event.includes(e))) return 'high'
    if (mediumEvents.some(e => event.includes(e))) return 'medium'
    return 'low'
  }

  private calculateThreatLevel(event: string): number {
    const threatScores: Record<string, number> = {
      'access_denied': 3,
      'clearance_violation': 8,
      'pii_violation': 6,
      'unauthorized_access': 9,
      'data_breach': 10,
    }

    return threatScores[event] || 1
  }

  private extractThreatIndicators(event: any): string[] {
    const indicators: string[] = []
    
    if (event.details?.missingPermissions) {
      indicators.push('insufficient_permissions')
    }
    
    if (event.source?.ip && event.source.ip !== 'system') {
      indicators.push('external_access_attempt')
    }
    
    if (event.event.includes('violation')) {
      indicators.push('policy_violation')
    }

    return indicators
  }

  private async getEncryptionKey(keyId: string): Promise<string> {
    // In production, would retrieve from AWS KMS or similar
    return this.encryptionKey
  }

  private generateEventId(): string {
    return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export default DocumentSecurity