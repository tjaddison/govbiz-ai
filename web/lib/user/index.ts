/**
 * User Profile Management System
 * 
 * Comprehensive user management with profiles, preferences, settings,
 * role-based access control, and personalization for government contracting
 */

export * from './profile-manager'
export * from './preferences'
export * from './settings'
export * from './roles'
export * from './onboarding'
export * from './notifications'
export * from './analytics'

import { UserProfileManager } from './profile-manager'
import { UserPreferences as UserPreferencesClass } from './preferences'
import { UserSettings as UserSettingsClass } from './settings'
import { UserRoleManager } from './roles'
import { UserOnboarding } from './onboarding'
import { UserNotifications } from './notifications'
import { UserAnalytics } from './analytics'
import { logger } from '@/lib/monitoring/logger'

// User management configuration
export interface UserManagementConfig {
  profiles: {
    enableVerification: boolean
    requireCompanyInfo: boolean
    enableCustomFields: boolean
    cacheProfileData: boolean
  }
  preferences: {
    enablePersonalization: boolean
    trackBehavior: boolean
    enableRecommendations: boolean
    syncAcrossDevices: boolean
  }
  security: {
    requireTwoFactor: boolean
    sessionTimeout: number
    passwordPolicy: {
      minLength: number
      requireSpecialChars: boolean
      requireNumbers: boolean
      requireUppercase: boolean
    }
  }
  notifications: {
    enableEmailNotifications: boolean
    enablePushNotifications: boolean
    enableSlackIntegration: boolean
    defaultPreferences: Record<string, boolean>
  }
}

// Default configuration
const defaultConfig: UserManagementConfig = {
  profiles: {
    enableVerification: true,
    requireCompanyInfo: true,
    enableCustomFields: true,
    cacheProfileData: true
  },
  preferences: {
    enablePersonalization: true,
    trackBehavior: true,
    enableRecommendations: true,
    syncAcrossDevices: true
  },
  security: {
    requireTwoFactor: false,
    sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours
    passwordPolicy: {
      minLength: 8,
      requireSpecialChars: true,
      requireNumbers: true,
      requireUppercase: true
    }
  },
  notifications: {
    enableEmailNotifications: true,
    enablePushNotifications: true,
    enableSlackIntegration: true,
    defaultPreferences: {
      sourcesSeoughtAlerts: true,
      workflowCompletions: true,
      systemUpdates: false,
      weeklyDigest: true
    }
  }
}

// Global user management instance
let userManagementInstance: UserManagement | null = null

/**
 * Main user management orchestrator
 */
export class UserManagement {
  public readonly profileManager: UserProfileManager
  public readonly preferences: UserPreferencesClass
  public readonly settings: UserSettingsClass
  public readonly roles: UserRoleManager
  public readonly onboarding: UserOnboarding
  public readonly notifications: UserNotifications
  public readonly analytics: UserAnalytics
  private config: UserManagementConfig

  constructor(config: Partial<UserManagementConfig> = {}) {
    this.config = { ...defaultConfig, ...config }
    
    // Initialize all subsystems with dependency injection
    this.profileManager = new UserProfileManager(this.config.profiles)
    this.preferences = new UserPreferencesClass(this.config.preferences)
    this.settings = new UserSettingsClass(this.config.security)
    this.roles = new UserRoleManager()
    this.onboarding = new UserOnboarding(this.profileManager, this.preferences)
    this.notifications = new UserNotifications(this.config.notifications)
    this.analytics = new UserAnalytics(this.profileManager, this.preferences)
  }

  /**
   * Initialize user management system
   */
  async initialize(): Promise<void> {
    try {
      // Initialize all subsystems in dependency order
      await Promise.all([
        this.roles.initialize(),
        this.profileManager.initialize(),
        this.preferences.initialize(),
        this.settings.initialize(),
        this.notifications.initialize(),
        this.analytics.initialize()
      ])

      // Initialize onboarding last as it depends on other systems
      await this.onboarding.initialize()

      logger.info('User management system initialized successfully', {
        profilesEnabled: this.config.profiles.enableVerification,
        personalizationEnabled: this.config.preferences.enablePersonalization,
        notificationsEnabled: this.config.notifications.enableEmailNotifications
      })

    } catch (error) {
      logger.error('Failed to initialize user management system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Create a new user with complete setup
   */
  async createUser(userData: {
    email: string
    password: string
    firstName: string
    lastName: string
    company?: string
    role?: string
    inviteCode?: string
  }): Promise<{
    userId: string
    profile: any
    onboardingSteps: any[]
    success: boolean
  }> {
    try {
      // Create user profile
      const profile = await this.profileManager.createProfile({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        company: userData.company
      })

      // Set up user settings
      await this.settings.createUserSettings(profile.id, {
        password: userData.password,
        email: userData.email,
        securityLevel: 'standard'
      })

      // Assign role
      if (userData.role) {
        await this.roles.assignRole(profile.id, userData.role, 'system')
      } else {
        // Default role based on company info
        const defaultRole = userData.company ? 'contractor' : 'individual'
        await this.roles.assignRole(profile.id, defaultRole, 'system')
      }

      // Initialize preferences
      await this.preferences.initializeUserPreferences(profile.id)

      // Set up notifications
      await this.notifications.setupUserNotifications(profile.id, this.config.notifications.defaultPreferences)

      // Start onboarding process
      const onboardingSteps = await this.onboarding.startOnboarding(profile.id, {
        role: userData.role,
        hasCompany: !!userData.company,
        inviteCode: userData.inviteCode
      })

      // Track user creation
      await this.analytics.trackEvent(profile.id, 'user_created', {
        hasCompany: !!userData.company,
        role: userData.role || 'default'
      })

      logger.info('User created successfully', {
        userId: profile.id,
        email: userData.email,
        company: userData.company,
        role: userData.role
      })

      return {
        userId: profile.id,
        profile,
        onboardingSteps,
        success: true
      }

    } catch (error) {
      logger.error('Failed to create user', error instanceof Error ? error : undefined, {
        email: userData.email
      })
      
      return {
        userId: '',
        profile: null,
        onboardingSteps: [],
        success: false
      }
    }
  }

  /**
   * Get comprehensive user data
   */
  async getUserData(userId: string): Promise<{
    profile: any
    preferences: any
    settings: any
    roles: string[]
    notifications: any
    onboardingStatus: any
    analytics: any
  } | null> {
    try {
      const [
        profile,
        preferences,
        settings,
        roles,
        notifications,
        onboardingStatus,
        analytics
      ] = await Promise.all([
        this.profileManager.getProfile(userId),
        this.preferences.getUserPreferences(userId),
        this.settings.getUserSettings(userId),
        this.roles.getUserRoles(userId),
        this.notifications.getUserNotificationSettings(userId),
        this.onboarding.getOnboardingStatus(userId),
        this.analytics.getUserAnalytics(userId, {
          start: Date.now() - 30 * 24 * 60 * 60 * 1000, // Last 30 days
          end: Date.now()
        })
      ])

      if (!profile) {
        return null
      }

      return {
        profile,
        preferences,
        settings,
        roles,
        notifications,
        onboardingStatus,
        analytics
      }

    } catch (error) {
      logger.error('Failed to get user data', error instanceof Error ? error : undefined, { userId })
      return null
    }
  }

  /**
   * Update user profile with validation
   */
  async updateUserProfile(userId: string, updates: Record<string, any>): Promise<{
    success: boolean
    profile?: any
    errors?: string[]
  }> {
    try {
      // Validate updates
      const validation = await this.profileManager.validateProfileUpdate(userId, updates)
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors
        }
      }

      // Apply updates
      const updatedProfile = await this.profileManager.updateProfile(userId, updates)
      
      // Track profile update
      await this.analytics.trackEvent(userId, 'profile_updated', {
        fieldsUpdated: Object.keys(updates)
      })

      return {
        success: true,
        profile: updatedProfile
      }

    } catch (error) {
      logger.error('Failed to update user profile', error instanceof Error ? error : undefined, { userId })
      return {
        success: false,
        errors: ['Internal error occurred']
      }
    }
  }

  /**
   * Delete user and all associated data
   */
  async deleteUser(userId: string, options: {
    hardDelete?: boolean
    reason?: string
    retainAnalytics?: boolean
  } = {}): Promise<{
    success: boolean
    dataDeleted: string[]
    errors?: string[]
  }> {
    try {
      const dataDeleted: string[] = []

      // Delete in reverse dependency order
      if (!options.retainAnalytics) {
        await this.analytics.deleteUserData(userId)
        dataDeleted.push('analytics')
      }

      await this.notifications.deleteUserNotifications(userId)
      dataDeleted.push('notifications')

      await this.onboarding.deleteOnboardingData(userId)
      dataDeleted.push('onboarding')

      await this.settings.deleteUserSettings(userId)
      dataDeleted.push('settings')

      await this.preferences.deleteUserPreferences(userId)
      dataDeleted.push('preferences')

      await this.roles.removeAllRoles(userId)
      dataDeleted.push('roles')

      if (options.hardDelete) {
        await this.profileManager.deleteProfile(userId)
        dataDeleted.push('profile')
      } else {
        await this.profileManager.deactivateProfile(userId, options.reason)
        dataDeleted.push('profile_deactivated')
      }

      logger.info('User deletion completed', {
        userId,
        hardDelete: options.hardDelete,
        dataDeleted
      })

      return {
        success: true,
        dataDeleted
      }

    } catch (error) {
      logger.error('Failed to delete user', error instanceof Error ? error : undefined, { userId })
      return {
        success: false,
        dataDeleted: [],
        errors: ['Deletion failed']
      }
    }
  }

  /**
   * Shutdown user management system
   */
  async shutdown(): Promise<void> {
    try {
      await Promise.all([
        this.analytics.shutdown(),
        this.notifications.shutdown(),
        this.onboarding.shutdown(),
        this.settings.shutdown(),
        this.preferences.shutdown(),
        this.roles.shutdown(),
        this.profileManager.shutdown()
      ])

      logger.info('User management system shutdown complete')

    } catch (error) {
      logger.error('User management shutdown failed', error instanceof Error ? error : undefined)
    }
  }
}

/**
 * Initialize the global user management system
 */
export async function initializeUserManagement(config: Partial<UserManagementConfig> = {}): Promise<UserManagement> {
  try {
    userManagementInstance = new UserManagement(config)
    await userManagementInstance.initialize()
    return userManagementInstance
  } catch (error) {
    logger.error('Failed to initialize user management', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Get the global user management instance
 */
export function getUserManagement(): UserManagement {
  if (!userManagementInstance) {
    throw new Error('User management system not initialized. Call initializeUserManagement() first.')
  }
  return userManagementInstance
}

/**
 * Shutdown the global user management system
 */
export async function shutdownUserManagement(): Promise<void> {
  if (userManagementInstance) {
    await userManagementInstance.shutdown()
    userManagementInstance = null
  }
}

// Convenience functions for common operations
export const userManagement = {
  /**
   * Get user profile
   */
  getProfile: async (userId: string) => {
    return getUserManagement().profileManager.getProfile(userId)
  },

  /**
   * Update user preferences
   */
  updatePreferences: async (userId: string, preferences: Record<string, any>) => {
    return getUserManagement().preferences.updatePreferences(userId, preferences)
  },

  /**
   * Check user permissions
   */
  hasPermission: async (userId: string, resource: string, action: string) => {
    return getUserManagement().roles.hasPermission(userId, resource, action)
  },

  /**
   * Send notification to user
   */
  notify: async (userId: string, templateId: string, data: Record<string, any>) => {
    return getUserManagement().notifications.sendNotification(userId, templateId, data)
  },

  /**
   * Track user event
   */
  track: async (userId: string, event: string, data?: Record<string, any>) => {
    return getUserManagement().analytics.trackEvent(userId, event, data || {})
  }
}

export default UserManagement