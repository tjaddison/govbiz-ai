/**
 * User Settings Management
 * 
 * Security settings, account configuration, and system preferences
 * with strong password policies and session management
 */

import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { cache } from '@/lib/cache'

export interface UserSettingsData {
  userId: string
  
  // Security settings
  security: {
    password: {
      hash: string
      salt: string
      lastChanged: number
      expiresAt?: number
      history: string[] // Hashed previous passwords
    }
    twoFactor: {
      enabled: boolean
      method: 'sms' | 'email' | 'app' | 'hardware'
      secret?: string
      backupCodes: string[]
      lastUsed?: number
    }
    sessions: {
      maxConcurrent: number
      timeoutMinutes: number
      requireReauth: boolean
      trustedDevices: TrustedDevice[]
    }
    apiKeys: {
      enabled: boolean
      keys: ApiKey[]
      rateLimits: Record<string, number>
    }
    ipWhitelist: {
      enabled: boolean
      addresses: string[]
    }
  }

  // Account settings
  account: {
    status: 'active' | 'suspended' | 'pending' | 'locked'
    emailVerified: boolean
    phoneVerified: boolean
    identityVerified: boolean
    lastLogin: number
    loginAttempts: number
    lockoutUntil?: number
    agreementVersion: string
    agreedAt: number
  }

  // Billing settings
  billing: {
    plan: 'free' | 'basic' | 'professional' | 'enterprise'
    billingCycle: 'monthly' | 'annual'
    paymentMethod?: {
      type: 'card' | 'ach' | 'invoice'
      last4?: string
      expiresAt?: string
    }
    billingAddress?: {
      company?: string
      street1: string
      street2?: string
      city: string
      state: string
      zipCode: string
      country: string
    }
    invoiceEmail?: string
    autoRenewal: boolean
  }

  // Data settings
  data: {
    retention: {
      logs: number // days
      analytics: number // days
      documents: number // days
      backups: number // days
    }
    backup: {
      enabled: boolean
      frequency: 'daily' | 'weekly' | 'monthly'
      location: 's3' | 'local' | 'external'
      encryption: boolean
    }
    export: {
      format: 'json' | 'csv' | 'xml'
      includePersonalData: boolean
      compression: boolean
    }
  }

  // Compliance settings
  compliance: {
    gdprConsent: boolean
    ccpaOptOut: boolean
    dataProcessingAgreement: boolean
    auditLogRetention: number // days
    complianceReports: boolean
  }

  // Integration settings
  integrations: {
    oauth: {
      google: OAuthConnection
      microsoft: OAuthConnection
      github: OAuthConnection
    }
    webhooks: {
      enabled: boolean
      endpoints: WebhookEndpoint[]
      retryPolicy: {
        maxRetries: number
        backoffMultiplier: number
      }
    }
    apis: {
      enabledServices: string[]
      rateLimits: Record<string, number>
      quotas: Record<string, number>
    }
  }

  // System settings
  system: {
    locale: string
    timezone: string
    dateFormat: string
    timeFormat: '12h' | '24h'
    currency: string
    units: 'metric' | 'imperial'
    accessibility: {
      highContrast: boolean
      largeText: boolean
      screenReader: boolean
      keyboardNavigation: boolean
    }
  }

  // Metadata
  createdAt: number
  updatedAt: number
  version: string
}

export interface TrustedDevice {
  id: string
  name: string
  fingerprint: string
  userAgent: string
  ipAddress: string
  location?: string
  addedAt: number
  lastUsed: number
  trusted: boolean
}

export interface ApiKey {
  id: string
  name: string
  key: string
  permissions: string[]
  createdAt: number
  expiresAt?: number
  lastUsed?: number
  usage: {
    requests: number
    errors: number
  }
}

export interface OAuthConnection {
  enabled: boolean
  connected: boolean
  accountId?: string
  scopes: string[]
  connectedAt?: number
  lastSync?: number
}

export interface WebhookEndpoint {
  id: string
  url: string
  events: string[]
  secret: string
  enabled: boolean
  createdAt: number
  lastTriggered?: number
  failures: number
}

export interface SecurityAuditLog {
  id: string
  userId: string
  action: string
  timestamp: number
  ipAddress: string
  userAgent: string
  success: boolean
  details: Record<string, any>
}

export interface PasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
  preventReuse: number
  maxAge: number // days
}

export class UserSettings {
  private settings: Map<string, UserSettingsData> = new Map()
  private auditLogs: Map<string, SecurityAuditLog[]> = new Map()
  private passwordPolicy: PasswordPolicy
  private config: {
    requireTwoFactor: boolean
    sessionTimeout: number
    maxLoginAttempts: number
    lockoutDuration: number
  }

  constructor(config: any) {
    this.config = {
      requireTwoFactor: false,
      sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours
      maxLoginAttempts: 5,
      lockoutDuration: 30 * 60 * 1000, // 30 minutes
      ...config
    }

    this.passwordPolicy = config.passwordPolicy || {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      preventReuse: 5,
      maxAge: 90
    }
  }

  /**
   * Initialize user settings system
   */
  async initialize(): Promise<void> {
    try {
      await this.loadSettingsFromStorage()
      
      logger.info('User settings system initialized successfully', {
        settingsCount: this.settings.size,
        twoFactorRequired: this.config.requireTwoFactor
      })

    } catch (error) {
      logger.error('Failed to initialize user settings system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Create user settings for a new user
   */
  async createUserSettings(userId: string, initialData: {
    password: string
    email: string
    securityLevel?: 'basic' | 'standard' | 'enhanced'
  }): Promise<UserSettingsData> {
    try {
      // Validate password
      const passwordValidation = this.validatePassword(initialData.password)
      if (!passwordValidation.valid) {
        throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`)
      }

      // Hash password
      const { hash, salt } = await this.hashPassword(initialData.password)

      const securityLevel = initialData.securityLevel || 'standard'
      const defaultSettings: UserSettingsData = {
        userId,
        security: {
          password: {
            hash,
            salt,
            lastChanged: Date.now(),
            history: []
          },
          twoFactor: {
            enabled: securityLevel === 'enhanced',
            method: 'email',
            backupCodes: this.generateBackupCodes()
          },
          sessions: {
            maxConcurrent: securityLevel === 'enhanced' ? 2 : 5,
            timeoutMinutes: securityLevel === 'enhanced' ? 240 : 480, // 4-8 hours
            requireReauth: securityLevel === 'enhanced',
            trustedDevices: []
          },
          apiKeys: {
            enabled: false,
            keys: [],
            rateLimits: {}
          },
          ipWhitelist: {
            enabled: false,
            addresses: []
          }
        },
        account: {
          status: 'pending',
          emailVerified: false,
          phoneVerified: false,
          identityVerified: false,
          lastLogin: 0,
          loginAttempts: 0,
          agreementVersion: '1.0',
          agreedAt: Date.now()
        },
        billing: {
          plan: 'free',
          billingCycle: 'monthly',
          autoRenewal: true
        },
        data: {
          retention: {
            logs: 90,
            analytics: 365,
            documents: 2555, // 7 years
            backups: 90
          },
          backup: {
            enabled: true,
            frequency: 'weekly',
            location: 's3',
            encryption: true
          },
          export: {
            format: 'json',
            includePersonalData: false,
            compression: true
          }
        },
        compliance: {
          gdprConsent: false,
          ccpaOptOut: false,
          dataProcessingAgreement: false,
          auditLogRetention: 2555, // 7 years
          complianceReports: false
        },
        integrations: {
          oauth: {
            google: { enabled: false, connected: false, scopes: [] },
            microsoft: { enabled: false, connected: false, scopes: [] },
            github: { enabled: false, connected: false, scopes: [] }
          },
          webhooks: {
            enabled: false,
            endpoints: [],
            retryPolicy: {
              maxRetries: 3,
              backoffMultiplier: 2
            }
          },
          apis: {
            enabledServices: [],
            rateLimits: {},
            quotas: {}
          }
        },
        system: {
          locale: 'en-US',
          timezone: 'America/New_York',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h',
          currency: 'USD',
          units: 'imperial',
          accessibility: {
            highContrast: false,
            largeText: false,
            screenReader: false,
            keyboardNavigation: false
          }
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '1.0.0'
      }

      // Store settings
      this.settings.set(userId, defaultSettings)

      // Cache settings
      await cache.set(`settings:${userId}`, defaultSettings, this.config.sessionTimeout)

      // Create audit log
      await this.logSecurityEvent(userId, 'account_created', {
        securityLevel,
        email: initialData.email
      })

      // Record metrics
      await metricsCollector.recordMetric(
        'user_settings_created',
        1,
        'count',
        { securityLevel }
      )

      logger.info('User settings created', { userId, securityLevel })

      return defaultSettings

    } catch (error) {
      logger.error('Failed to create user settings', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Get user settings
   */
  async getUserSettings(userId: string): Promise<UserSettingsData | null> {
    try {
      // Try cache first
      const cached = await cache.get<UserSettingsData>(`settings:${userId}`)
      if (cached) {
        return cached
      }

      // Get from memory storage
      const settings = this.settings.get(userId)
      
      if (settings) {
        // Cache for future requests
        await cache.set(`settings:${userId}`, settings, this.config.sessionTimeout)
      }

      return settings || null

    } catch (error) {
      logger.error('Failed to get user settings', error instanceof Error ? error : undefined, { userId })
      return null
    }
  }

  /**
   * Update user settings
   */
  async updateUserSettings(userId: string, updates: Partial<UserSettingsData>): Promise<UserSettingsData> {
    try {
      const currentSettings = this.settings.get(userId)
      if (!currentSettings) {
        throw new Error('User settings not found')
      }

      // Validate updates
      const validation = await this.validateSettings(updates)
      if (!validation.valid) {
        throw new Error(`Settings validation failed: ${validation.errors.join(', ')}`)
      }

      // Apply updates
      const updatedSettings = this.deepMerge(currentSettings, updates)
      updatedSettings.updatedAt = Date.now()

      // Store updated settings
      this.settings.set(userId, updatedSettings)

      // Update cache
      await cache.set(`settings:${userId}`, updatedSettings, this.config.sessionTimeout)

      // Log security-relevant changes
      if (this.isSecurityUpdate(updates)) {
        await this.logSecurityEvent(userId, 'settings_updated', {
          updatedFields: Object.keys(updates)
        })
      }

      // Record metrics
      await metricsCollector.recordMetric(
        'user_settings_updated',
        1,
        'count',
        {
          userId,
          fieldsUpdated: Object.keys(updates).length.toString()
        }
      )

      logger.info('User settings updated', {
        userId,
        fieldsUpdated: Object.keys(updates)
      })

      return updatedSettings

    } catch (error) {
      logger.error('Failed to update user settings', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    try {
      const settings = this.settings.get(userId)
      if (!settings) {
        throw new Error('User settings not found')
      }

      // Verify current password
      const isValid = await this.verifyPassword(currentPassword, settings.security.password.hash, settings.security.password.salt)
      if (!isValid) {
        await this.logSecurityEvent(userId, 'password_change_failed', { reason: 'invalid_current_password' })
        throw new Error('Current password is incorrect')
      }

      // Validate new password
      const validation = this.validatePassword(newPassword)
      if (!validation.valid) {
        throw new Error(`Password validation failed: ${validation.errors.join(', ')}`)
      }

      // Check password history
      for (const oldHash of settings.security.password.history) {
        const isReused = await this.verifyPassword(newPassword, oldHash, settings.security.password.salt)
        if (isReused) {
          throw new Error('Password has been used recently and cannot be reused')
        }
      }

      // Hash new password
      const { hash, salt } = await this.hashPassword(newPassword)

      // Update password settings
      settings.security.password.history.unshift(settings.security.password.hash)
      if (settings.security.password.history.length > this.passwordPolicy.preventReuse) {
        settings.security.password.history = settings.security.password.history.slice(0, this.passwordPolicy.preventReuse)
      }

      settings.security.password.hash = hash
      settings.security.password.salt = salt
      settings.security.password.lastChanged = Date.now()
      settings.updatedAt = Date.now()

      // Store updated settings
      this.settings.set(userId, settings)
      await cache.set(`settings:${userId}`, settings, this.config.sessionTimeout)

      // Log security event
      await this.logSecurityEvent(userId, 'password_changed', { success: true })

      logger.info('Password changed successfully', { userId })

      return true

    } catch (error) {
      await this.logSecurityEvent(userId, 'password_change_failed', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      logger.error('Failed to change password', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Enable two-factor authentication
   */
  async enableTwoFactor(userId: string, method: 'sms' | 'email' | 'app' | 'hardware', contact?: string): Promise<{
    secret?: string
    qrCode?: string
    backupCodes: string[]
  }> {
    try {
      const settings = this.settings.get(userId)
      if (!settings) {
        throw new Error('User settings not found')
      }

      let secret: string | undefined
      let qrCode: string | undefined

      if (method === 'app') {
        secret = this.generateTwoFactorSecret()
        qrCode = this.generateQRCode(userId, secret)
      }

      // Generate new backup codes
      const backupCodes = this.generateBackupCodes()

      // Update settings
      settings.security.twoFactor = {
        enabled: true,
        method,
        secret,
        backupCodes
      }
      settings.updatedAt = Date.now()

      // Store updated settings
      this.settings.set(userId, settings)
      await cache.set(`settings:${userId}`, settings, this.config.sessionTimeout)

      // Log security event
      await this.logSecurityEvent(userId, 'two_factor_enabled', { method })

      logger.info('Two-factor authentication enabled', { userId, method })

      return { secret, qrCode, backupCodes }

    } catch (error) {
      logger.error('Failed to enable two-factor authentication', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Disable two-factor authentication
   */
  async disableTwoFactor(userId: string, verificationCode?: string): Promise<boolean> {
    try {
      const settings = this.settings.get(userId)
      if (!settings) {
        throw new Error('User settings not found')
      }

      // Verify current 2FA if it's enabled
      if (settings.security.twoFactor.enabled && verificationCode) {
        const isValid = this.verifyTwoFactorCode(settings.security.twoFactor, verificationCode)
        if (!isValid) {
          await this.logSecurityEvent(userId, 'two_factor_disable_failed', { reason: 'invalid_code' })
          throw new Error('Invalid verification code')
        }
      }

      // Disable 2FA
      settings.security.twoFactor = {
        enabled: false,
        method: 'email',
        backupCodes: []
      }
      settings.updatedAt = Date.now()

      // Store updated settings
      this.settings.set(userId, settings)
      await cache.set(`settings:${userId}`, settings, this.config.sessionTimeout)

      // Log security event
      await this.logSecurityEvent(userId, 'two_factor_disabled', {})

      logger.info('Two-factor authentication disabled', { userId })

      return true

    } catch (error) {
      logger.error('Failed to disable two-factor authentication', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Add trusted device
   */
  async addTrustedDevice(userId: string, deviceInfo: {
    name: string
    userAgent: string
    ipAddress: string
    location?: string
  }): Promise<string> {
    try {
      const settings = this.settings.get(userId)
      if (!settings) {
        throw new Error('User settings not found')
      }

      const deviceId = this.generateDeviceId()
      const fingerprint = this.generateDeviceFingerprint(deviceInfo)

      const trustedDevice: TrustedDevice = {
        id: deviceId,
        name: deviceInfo.name,
        fingerprint,
        userAgent: deviceInfo.userAgent,
        ipAddress: deviceInfo.ipAddress,
        location: deviceInfo.location,
        addedAt: Date.now(),
        lastUsed: Date.now(),
        trusted: true
      }

      // Add to trusted devices
      settings.security.sessions.trustedDevices.push(trustedDevice)
      
      // Limit number of trusted devices
      if (settings.security.sessions.trustedDevices.length > 10) {
        settings.security.sessions.trustedDevices.sort((a, b) => b.lastUsed - a.lastUsed)
        settings.security.sessions.trustedDevices = settings.security.sessions.trustedDevices.slice(0, 10)
      }

      settings.updatedAt = Date.now()

      // Store updated settings
      this.settings.set(userId, settings)
      await cache.set(`settings:${userId}`, settings, this.config.sessionTimeout)

      // Log security event
      await this.logSecurityEvent(userId, 'trusted_device_added', { deviceId, deviceName: deviceInfo.name })

      logger.info('Trusted device added', { userId, deviceId })

      return deviceId

    } catch (error) {
      logger.error('Failed to add trusted device', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Get security audit logs
   */
  async getSecurityAuditLogs(userId: string, limit: number = 100): Promise<SecurityAuditLog[]> {
    try {
      const logs = this.auditLogs.get(userId) || []
      return logs
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit)

    } catch (error) {
      logger.error('Failed to get security audit logs', error instanceof Error ? error : undefined, { userId })
      return []
    }
  }

  /**
   * Delete user settings
   */
  async deleteUserSettings(userId: string): Promise<boolean> {
    try {
      // Remove from memory
      this.settings.delete(userId)
      this.auditLogs.delete(userId)

      // Remove from cache
      await cache.delete(`settings:${userId}`)

      logger.info('User settings deleted', { userId })
      
      return true

    } catch (error) {
      logger.error('Failed to delete user settings', error instanceof Error ? error : undefined, { userId })
      return false
    }
  }

  /**
   * Shutdown user settings system
   */
  async shutdown(): Promise<void> {
    try {
      await this.saveSettingsToStorage()
      
      this.settings.clear()
      this.auditLogs.clear()

      logger.info('User settings system shutdown complete')

    } catch (error) {
      logger.error('User settings shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (password.length < this.passwordPolicy.minLength) {
      errors.push(`Password must be at least ${this.passwordPolicy.minLength} characters`)
    }

    if (this.passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter')
    }

    if (this.passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter')
    }

    if (this.passwordPolicy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number')
    }

    if (this.passwordPolicy.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  private async validateSettings(settings: Partial<UserSettingsData>): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []

    // Add validation logic for different settings
    return {
      valid: errors.length === 0,
      errors
    }
  }

  private async hashPassword(password: string): Promise<{ hash: string; salt: string }> {
    // In production, use proper password hashing like bcrypt
    const salt = Math.random().toString(36).substring(2, 15)
    const hash = `hashed_${password}_with_${salt}`
    return { hash, salt }
  }

  private async verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
    // In production, use proper password verification
    const expectedHash = `hashed_${password}_with_${salt}`
    return hash === expectedHash
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = []
    for (let i = 0; i < 10; i++) {
      codes.push(Math.random().toString(36).substring(2, 10).toUpperCase())
    }
    return codes
  }

  private generateTwoFactorSecret(): string {
    return Math.random().toString(36).substring(2, 18).toUpperCase()
  }

  private generateQRCode(userId: string, secret: string): string {
    // In production, generate actual QR code
    return `qr_code_for_${userId}_${secret}`
  }

  private verifyTwoFactorCode(twoFactor: UserSettingsData['security']['twoFactor'], code: string): boolean {
    // In production, implement proper 2FA verification
    return code.length === 6 && /^\d+$/.test(code)
  }

  private generateDeviceId(): string {
    return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateDeviceFingerprint(deviceInfo: any): string {
    // In production, create proper device fingerprint
    return `fp_${Math.random().toString(36).substr(2, 16)}`
  }

  private isSecurityUpdate(updates: Partial<UserSettingsData>): boolean {
    const securityPaths = ['security', 'account.status', 'billing', 'integrations.oauth']
    return securityPaths.some(path => this.hasPropertyPath(updates, path))
  }

  private hasPropertyPath(obj: any, path: string): boolean {
    return path.split('.').reduce((current, prop) => current && current[prop], obj) !== undefined
  }

  private async logSecurityEvent(userId: string, action: string, details: Record<string, any>): Promise<void> {
    try {
      const log: SecurityAuditLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        action,
        timestamp: Date.now(),
        ipAddress: '127.0.0.1', // Would get from request
        userAgent: 'unknown', // Would get from request
        success: true,
        details
      }

      const userLogs = this.auditLogs.get(userId) || []
      userLogs.push(log)

      // Keep only last 1000 logs per user
      if (userLogs.length > 1000) {
        userLogs.sort((a, b) => b.timestamp - a.timestamp)
        this.auditLogs.set(userId, userLogs.slice(0, 1000))
      } else {
        this.auditLogs.set(userId, userLogs)
      }

    } catch (error) {
      logger.error('Failed to log security event', error instanceof Error ? error : undefined, { userId, action })
    }
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target }
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }
    
    return result
  }

  private async loadSettingsFromStorage(): Promise<void> {
    // In production, would load from database
    // For now, using in-memory storage
  }

  private async saveSettingsToStorage(): Promise<void> {
    // In production, would save to database
    // For now, using in-memory storage
  }
}

export default UserSettings