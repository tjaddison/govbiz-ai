/**
 * User Preferences Management
 * 
 * Comprehensive user preference and personalization system for
 * government contracting platform with intelligent recommendations
 */

import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { cache } from '@/lib/cache'

export interface UserPreferencesData {
  userId: string
  
  // Sources Sought preferences
  sourcesSeought: {
    enableAlerts: boolean
    alertFrequency: 'immediate' | 'daily' | 'weekly'
    naicsCodeFilters: string[]
    agencyFilters: string[]
    contractValueMin?: number
    contractValueMax?: number
    responseDeadlineNotice: number // days before deadline
    autoResponseEnabled: boolean
    preferredResponseFormat: 'standard' | 'detailed' | 'concise'
  }

  // Workflow preferences  
  workflow: {
    defaultTemplate: string
    autoSaveInterval: number // minutes
    enableSmartSuggestions: boolean
    parallelProcessing: boolean
    approvalWorkflow: 'single' | 'multi' | 'none'
    notificationPoints: ('start' | 'milestone' | 'completion' | 'error')[]
  }

  // Notification preferences
  notifications: {
    email: {
      enabled: boolean
      frequency: 'immediate' | 'hourly' | 'daily' | 'weekly'
      types: {
        sourcesSeought: boolean
        workflowUpdates: boolean
        systemAlerts: boolean
        weeklyDigest: boolean
        securityAlerts: boolean
      }
    }
    push: {
      enabled: boolean
      quiet_hours: {
        enabled: boolean
        startTime: string // HH:MM format
        endTime: string   // HH:MM format
        timezone: string
      }
      types: {
        urgentAlerts: boolean
        workflowNotifications: boolean
        chatMessages: boolean
      }
    }
    slack: {
      enabled: boolean
      webhookUrl?: string
      channelMappings: Record<string, string> // notification type -> channel
    }
  }

  // Dashboard preferences
  dashboard: {
    layout: 'compact' | 'detailed' | 'cards'
    refreshInterval: number // seconds
    defaultTimeRange: '24h' | '7d' | '30d' | '90d'
    visibleWidgets: string[]
    widgetOrder: string[]
    theme: 'light' | 'dark' | 'auto'
    showAdvancedMetrics: boolean
  }

  // AI & Automation preferences
  ai: {
    enableAutoCompletion: boolean
    suggestionConfidenceThreshold: number // 0-1
    autoApproveHighConfidence: boolean
    learningFromFeedback: boolean
    personalizedRecommendations: boolean
    explainabilityLevel: 'basic' | 'detailed' | 'technical'
  }

  // Communication preferences
  communication: {
    preferredLanguage: string
    timezone: string
    businessHours: {
      startTime: string
      endTime: string
      workDays: number[] // 0-6, Sunday=0
    }
    responseTimePreference: 'immediate' | 'business_hours' | 'flexible'
    escalationRules: {
      enabled: boolean
      urgentThreshold: number // hours
      escalationContacts: string[]
    }
  }

  // Privacy preferences
  privacy: {
    dataSharing: {
      analytics: boolean
      marketResearch: boolean
      platformImprovement: boolean
    }
    profileVisibility: 'public' | 'network' | 'private'
    searchableProfile: boolean
    allowContactFromOthers: boolean
    activityTracking: boolean
  }

  // Integration preferences
  integrations: {
    calendar: {
      enabled: boolean
      provider: 'google' | 'outlook' | 'apple'
      syncDeadlines: boolean
      createMeetings: boolean
    }
    crm: {
      enabled: boolean
      provider: string
      syncContacts: boolean
      syncOpportunities: boolean
    }
    document: {
      defaultStorage: 'local' | 's3' | 'google_drive' | 'sharepoint'
      autoBackup: boolean
      versionControl: boolean
    }
  }

  // Advanced preferences
  advanced: {
    apiAccess: boolean
    webhookEndpoints: string[]
    customFields: Record<string, any>
    experimentalFeatures: boolean
    debugMode: boolean
    performanceMode: 'balanced' | 'speed' | 'quality'
  }

  // Metadata
  createdAt: number
  updatedAt: number
  version: string
  lastSyncedAt?: number
}

export interface PreferenceUpdate {
  [path: string]: any
}

export interface PreferenceValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface PersonalizationInsight {
  type: 'recommendation' | 'optimization' | 'pattern'
  category: string
  title: string
  description: string
  impact: 'low' | 'medium' | 'high'
  actionItems: string[]
  confidence: number
}

export interface UserBehaviorPattern {
  userId: string
  pattern: string
  frequency: number
  lastOccurrence: number
  confidence: number
  metadata: Record<string, any>
}

export class UserPreferences {
  private preferences: Map<string, UserPreferencesData> = new Map()
  private behaviorPatterns: Map<string, UserBehaviorPattern[]> = new Map()
  private config: {
    enablePersonalization: boolean
    trackBehavior: boolean
    enableRecommendations: boolean
    syncAcrossDevices: boolean
    cacheTimeout: number
  }

  constructor(config: any) {
    this.config = {
      enablePersonalization: true,
      trackBehavior: true,
      enableRecommendations: true,
      syncAcrossDevices: true,
      cacheTimeout: 30 * 60 * 1000, // 30 minutes
      ...config
    }
  }

  /**
   * Initialize user preferences system
   */
  async initialize(): Promise<void> {
    try {
      await this.loadPreferencesFromStorage()
      
      logger.info('User preferences system initialized successfully', {
        preferenceCount: this.preferences.size,
        personalizationEnabled: this.config.enablePersonalization
      })

    } catch (error) {
      logger.error('Failed to initialize user preferences system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Initialize default preferences for a new user
   */
  async initializeUserPreferences(userId: string): Promise<UserPreferencesData> {
    try {
      const defaultPreferences: UserPreferencesData = {
        userId,
        sourcesSeought: {
          enableAlerts: true,
          alertFrequency: 'daily',
          naicsCodeFilters: [],
          agencyFilters: [],
          responseDeadlineNotice: 3,
          autoResponseEnabled: false,
          preferredResponseFormat: 'standard'
        },
        workflow: {
          defaultTemplate: 'standard_response',
          autoSaveInterval: 5,
          enableSmartSuggestions: true,
          parallelProcessing: true,
          approvalWorkflow: 'single',
          notificationPoints: ['start', 'completion', 'error']
        },
        notifications: {
          email: {
            enabled: true,
            frequency: 'daily',
            types: {
              sourcesSeought: true,
              workflowUpdates: true,
              systemAlerts: true,
              weeklyDigest: true,
              securityAlerts: true
            }
          },
          push: {
            enabled: true,
            quiet_hours: {
              enabled: false,
              startTime: '22:00',
              endTime: '08:00',
              timezone: 'America/New_York'
            },
            types: {
              urgentAlerts: true,
              workflowNotifications: true,
              chatMessages: false
            }
          },
          slack: {
            enabled: false,
            channelMappings: {}
          }
        },
        dashboard: {
          layout: 'cards',
          refreshInterval: 300, // 5 minutes
          defaultTimeRange: '7d',
          visibleWidgets: ['recent_opportunities', 'workflow_status', 'alerts'],
          widgetOrder: ['recent_opportunities', 'workflow_status', 'alerts'],
          theme: 'auto',
          showAdvancedMetrics: false
        },
        ai: {
          enableAutoCompletion: true,
          suggestionConfidenceThreshold: 0.7,
          autoApproveHighConfidence: false,
          learningFromFeedback: true,
          personalizedRecommendations: true,
          explainabilityLevel: 'detailed'
        },
        communication: {
          preferredLanguage: 'en-US',
          timezone: 'America/New_York',
          businessHours: {
            startTime: '09:00',
            endTime: '17:00',
            workDays: [1, 2, 3, 4, 5] // Monday-Friday
          },
          responseTimePreference: 'business_hours',
          escalationRules: {
            enabled: false,
            urgentThreshold: 24,
            escalationContacts: []
          }
        },
        privacy: {
          dataSharing: {
            analytics: true,
            marketResearch: false,
            platformImprovement: true
          },
          profileVisibility: 'network',
          searchableProfile: true,
          allowContactFromOthers: true,
          activityTracking: true
        },
        integrations: {
          calendar: {
            enabled: false,
            provider: 'google',
            syncDeadlines: true,
            createMeetings: false
          },
          crm: {
            enabled: false,
            provider: '',
            syncContacts: false,
            syncOpportunities: false
          },
          document: {
            defaultStorage: 's3',
            autoBackup: true,
            versionControl: true
          }
        },
        advanced: {
          apiAccess: false,
          webhookEndpoints: [],
          customFields: {},
          experimentalFeatures: false,
          debugMode: false,
          performanceMode: 'balanced'
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '1.0.0'
      }

      // Store preferences
      this.preferences.set(userId, defaultPreferences)

      // Cache preferences
      await cache.set(`preferences:${userId}`, defaultPreferences, this.config.cacheTimeout)

      // Record metrics
      await metricsCollector.recordMetric(
        'user_preferences_initialized',
        1,
        'count',
        { userId }
      )

      logger.info('User preferences initialized', { userId })

      return defaultPreferences

    } catch (error) {
      logger.error('Failed to initialize user preferences', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferencesData | null> {
    try {
      // Try cache first
      const cached = await cache.get<UserPreferencesData>(`preferences:${userId}`)
      if (cached) {
        return cached
      }

      // Get from memory storage
      const preferences = this.preferences.get(userId)
      
      if (preferences) {
        // Cache for future requests
        await cache.set(`preferences:${userId}`, preferences, this.config.cacheTimeout)
      }

      return preferences || null

    } catch (error) {
      logger.error('Failed to get user preferences', error instanceof Error ? error : undefined, { userId })
      return null
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, updates: PreferenceUpdate): Promise<UserPreferencesData> {
    try {
      const currentPreferences = this.preferences.get(userId)
      if (!currentPreferences) {
        throw new Error('User preferences not found')
      }

      // Validate updates
      const validation = await this.validatePreferences(updates)
      if (!validation.valid) {
        throw new Error(`Preference validation failed: ${validation.errors.join(', ')}`)
      }

      // Apply updates using deep merge
      const updatedPreferences = this.deepMerge(currentPreferences, updates)
      updatedPreferences.updatedAt = Date.now()

      // Store updated preferences
      this.preferences.set(userId, updatedPreferences)

      // Update cache
      await cache.set(`preferences:${userId}`, updatedPreferences, this.config.cacheTimeout)

      // Track behavior pattern if enabled
      if (this.config.trackBehavior) {
        await this.trackBehaviorPattern(userId, 'preference_update', { 
          updatedFields: Object.keys(updates),
          updateCount: Object.keys(updates).length
        })
      }

      // Record metrics
      await metricsCollector.recordMetric(
        'user_preferences_updated',
        1,
        'count',
        {
          userId,
          fieldsUpdated: Object.keys(updates).length.toString()
        }
      )

      logger.info('User preferences updated', {
        userId,
        fieldsUpdated: Object.keys(updates)
      })

      return updatedPreferences

    } catch (error) {
      logger.error('Failed to update user preferences', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Get personalized recommendations
   */
  async getPersonalizedRecommendations(userId: string): Promise<PersonalizationInsight[]> {
    try {
      if (!this.config.enableRecommendations) {
        return []
      }

      const preferences = await this.getUserPreferences(userId)
      const patterns = this.behaviorPatterns.get(userId) || []
      
      if (!preferences) {
        return []
      }

      const insights: PersonalizationInsight[] = []

      // Analyze notification frequency
      if (preferences.notifications.email.frequency === 'immediate') {
        const emailPattern = patterns.find(p => p.pattern === 'email_interaction')
        if (emailPattern && emailPattern.frequency < 0.3) {
          insights.push({
            type: 'optimization',
            category: 'notifications',
            title: 'Reduce Email Frequency',
            description: 'You receive many immediate emails but interact with only 30%. Consider daily digest.',
            impact: 'medium',
            actionItems: [
              'Switch to daily email digest',
              'Customize notification types',
              'Set quiet hours'
            ],
            confidence: 0.8
          })
        }
      }

      // Analyze workflow efficiency
      if (!preferences.workflow.enableSmartSuggestions) {
        insights.push({
          type: 'recommendation',
          category: 'workflow',
          title: 'Enable Smart Suggestions',
          description: 'Smart suggestions can improve your workflow efficiency by 25-40%.',
          impact: 'high',
          actionItems: [
            'Enable smart suggestions in workflow settings',
            'Set confidence threshold to 0.7',
            'Allow learning from feedback'
          ],
          confidence: 0.9
        })
      }

      // Analyze dashboard usage
      const dashboardPattern = patterns.find(p => p.pattern === 'dashboard_usage')
      if (dashboardPattern && preferences.dashboard.visibleWidgets.length > 6) {
        insights.push({
          type: 'optimization',
          category: 'dashboard',
          title: 'Optimize Dashboard Layout',
          description: 'You have many widgets but focus on only a few. Simplify for better performance.',
          impact: 'medium',
          actionItems: [
            'Remove unused widgets',
            'Reorder widgets by importance',
            'Consider compact layout'
          ],
          confidence: 0.7
        })
      }

      // Sources Sought optimization
      if (preferences.sourcesSeought.naicsCodeFilters.length === 0) {
        insights.push({
          type: 'recommendation',
          category: 'sources_sought',
          title: 'Set NAICS Code Filters',
          description: 'Adding NAICS filters will help you receive more relevant opportunities.',
          impact: 'high',
          actionItems: [
            'Review your business NAICS codes',
            'Add primary and secondary codes',
            'Set up agency filters'
          ],
          confidence: 0.85
        })
      }

      // Privacy optimization
      if (preferences.privacy.dataSharing.analytics && !preferences.ai.personalizedRecommendations) {
        insights.push({
          type: 'optimization',
          category: 'privacy',
          title: 'Inconsistent Privacy Settings',
          description: 'You share analytics data but disabled personalized recommendations.',
          impact: 'low',
          actionItems: [
            'Review privacy preferences',
            'Enable personalized recommendations',
            'Or disable analytics sharing'
          ],
          confidence: 0.6
        })
      }

      return insights

    } catch (error) {
      logger.error('Failed to get personalized recommendations', error instanceof Error ? error : undefined, { userId })
      return []
    }
  }

  /**
   * Track user behavior pattern
   */
  async trackBehaviorPattern(userId: string, pattern: string, metadata: Record<string, any>): Promise<void> {
    try {
      if (!this.config.trackBehavior) {
        return
      }

      const userPatterns = this.behaviorPatterns.get(userId) || []
      const existingPattern = userPatterns.find(p => p.pattern === pattern)

      if (existingPattern) {
        // Update existing pattern
        existingPattern.frequency = Math.min(1.0, existingPattern.frequency + 0.1)
        existingPattern.lastOccurrence = Date.now()
        existingPattern.metadata = { ...existingPattern.metadata, ...metadata }
      } else {
        // Create new pattern
        userPatterns.push({
          userId,
          pattern,
          frequency: 0.1,
          lastOccurrence: Date.now(),
          confidence: 0.5,
          metadata
        })
      }

      this.behaviorPatterns.set(userId, userPatterns)

      // Cleanup old patterns (keep last 100 per user)
      if (userPatterns.length > 100) {
        userPatterns.sort((a, b) => b.lastOccurrence - a.lastOccurrence)
        this.behaviorPatterns.set(userId, userPatterns.slice(0, 100))
      }

    } catch (error) {
      logger.error('Failed to track behavior pattern', error instanceof Error ? error : undefined, { userId, pattern })
    }
  }

  /**
   * Export user preferences
   */
  async exportPreferences(userId: string): Promise<string> {
    try {
      const preferences = await this.getUserPreferences(userId)
      if (!preferences) {
        throw new Error('User preferences not found')
      }

      // Remove sensitive data
      const exportData = {
        ...preferences,
        notifications: {
          ...preferences.notifications,
          slack: {
            enabled: preferences.notifications.slack.enabled,
            channelMappings: {}
          }
        },
        integrations: {
          ...preferences.integrations,
          calendar: {
            ...preferences.integrations.calendar,
            provider: undefined
          }
        },
        advanced: {
          ...preferences.advanced,
          webhookEndpoints: [],
          customFields: {}
        }
      }

      return JSON.stringify(exportData, null, 2)

    } catch (error) {
      logger.error('Failed to export preferences', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Import user preferences
   */
  async importPreferences(userId: string, preferencesData: string): Promise<UserPreferencesData> {
    try {
      const importedPreferences = JSON.parse(preferencesData)
      
      // Validate imported data
      const validation = await this.validatePreferences(importedPreferences)
      if (!validation.valid) {
        throw new Error(`Invalid preference data: ${validation.errors.join(', ')}`)
      }

      // Merge with current preferences
      const currentPreferences = await this.getUserPreferences(userId)
      const mergedPreferences = currentPreferences 
        ? this.deepMerge(currentPreferences, importedPreferences)
        : importedPreferences

      mergedPreferences.userId = userId
      mergedPreferences.updatedAt = Date.now()

      // Store merged preferences
      return await this.updatePreferences(userId, mergedPreferences)

    } catch (error) {
      logger.error('Failed to import preferences', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Reset preferences to defaults
   */
  async resetPreferences(userId: string): Promise<UserPreferencesData> {
    try {
      // Delete current preferences
      this.preferences.delete(userId)
      await cache.delete(`preferences:${userId}`)

      // Initialize with defaults
      return await this.initializeUserPreferences(userId)

    } catch (error) {
      logger.error('Failed to reset preferences', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Delete user preferences
   */
  async deleteUserPreferences(userId: string): Promise<boolean> {
    try {
      // Remove from memory
      this.preferences.delete(userId)
      this.behaviorPatterns.delete(userId)

      // Remove from cache
      await cache.delete(`preferences:${userId}`)

      logger.info('User preferences deleted', { userId })
      
      return true

    } catch (error) {
      logger.error('Failed to delete user preferences', error instanceof Error ? error : undefined, { userId })
      return false
    }
  }

  /**
   * Shutdown user preferences system
   */
  async shutdown(): Promise<void> {
    try {
      await this.savePreferencesToStorage()
      
      this.preferences.clear()
      this.behaviorPatterns.clear()

      logger.info('User preferences system shutdown complete')

    } catch (error) {
      logger.error('User preferences shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private async validatePreferences(preferences: Partial<UserPreferencesData>): Promise<PreferenceValidation> {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      // Validate notification settings
      if (preferences.notifications?.email?.frequency) {
        const validFrequencies = ['immediate', 'hourly', 'daily', 'weekly']
        if (!validFrequencies.includes(preferences.notifications.email.frequency)) {
          errors.push('Invalid email frequency')
        }
      }

      // Validate dashboard settings
      if (preferences.dashboard?.refreshInterval && preferences.dashboard.refreshInterval < 30) {
        warnings.push('Refresh interval below 30 seconds may impact performance')
      }

      // Validate AI settings
      if (preferences.ai?.suggestionConfidenceThreshold) {
        const threshold = preferences.ai.suggestionConfidenceThreshold
        if (threshold < 0 || threshold > 1) {
          errors.push('Confidence threshold must be between 0 and 1')
        }
      }

      // Validate timezone
      if (preferences.communication?.timezone) {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: preferences.communication.timezone })
        } catch {
          errors.push('Invalid timezone')
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      }

    } catch (error) {
      return {
        valid: false,
        errors: ['Validation failed'],
        warnings: []
      }
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

  private async loadPreferencesFromStorage(): Promise<void> {
    // In production, would load from database
    // For now, using in-memory storage
  }

  private async savePreferencesToStorage(): Promise<void> {
    // In production, would save to database
    // For now, using in-memory storage
  }
}

export default UserPreferences