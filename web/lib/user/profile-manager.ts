/**
 * User Profile Manager
 * 
 * Comprehensive user profile management with validation, verification,
 * company information, and government contracting specific data
 */

import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { cache } from '@/lib/cache'

export interface UserProfile {
  id: string
  email: string
  emailVerified: boolean
  firstName: string
  lastName: string
  displayName?: string
  avatarUrl?: string
  title?: string
  phone?: string
  phoneVerified: boolean
  
  // Company information
  company?: string
  companySize?: 'small' | 'medium' | 'large' | 'enterprise'
  industry?: string
  businessType?: 'prime_contractor' | 'subcontractor' | 'consultant' | 'government' | 'other'
  
  // Government contracting specific
  cageCode?: string
  duns?: string
  uei?: string
  naicsCodes?: string[]
  certifications?: BusinessCertification[]
  clearanceLevel?: 'none' | 'confidential' | 'secret' | 'top_secret'
  
  // Location information
  address?: Address
  serviceAreas?: string[] // States/regions they work in
  
  // Profile metadata
  status: 'active' | 'inactive' | 'suspended' | 'pending_verification'
  createdAt: number
  updatedAt: number
  lastLoginAt?: number
  verificationStatus: {
    email: boolean
    phone: boolean
    identity: boolean
    company: boolean
    businessLicense: boolean
  }
  
  // Custom fields
  customFields?: Record<string, any>
  
  // Privacy settings
  profileVisibility: 'public' | 'private' | 'contacts_only'
  allowContactFromOthers: boolean
  
  // Professional information
  linkedinUrl?: string
  websiteUrl?: string
  bio?: string
  expertise?: string[]
  languages?: string[]
  
  // Subscription and plan information
  plan?: 'free' | 'basic' | 'professional' | 'enterprise'
  subscriptionId?: string
  subscriptionExpires?: number
}

export interface BusinessCertification {
  type: 'sba_8a' | 'wosb' | 'vosb' | 'sdvosb' | 'hubzone' | 'sdb' | 'edwosb' | 'other'
  name: string
  issuedBy: string
  number: string
  issuedDate: number
  expiresDate?: number
  verified: boolean
  documentUrl?: string
}

export interface Address {
  street1: string
  street2?: string
  city: string
  state: string
  zipCode: string
  country: string
  coordinates?: {
    lat: number
    lng: number
  }
}

export interface ProfileValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
  suggestions: string[]
}

export interface ProfileUpdate {
  [key: string]: any
}

export interface ProfileSearchOptions {
  query?: string
  company?: string
  businessType?: string
  certifications?: string[]
  serviceAreas?: string[]
  expertise?: string[]
  limit?: number
  offset?: number
}

export interface ProfileStats {
  totalProfiles: number
  activeProfiles: number
  verifiedProfiles: number
  companiesRepresented: number
  certificationBreakdown: Record<string, number>
  businessTypeBreakdown: Record<string, number>
  geographicDistribution: Record<string, number>
}

export class UserProfileManager {
  private profiles: Map<string, UserProfile> = new Map()
  private emailIndex: Map<string, string> = new Map()
  private companyIndex: Map<string, string[]> = new Map()
  private config: {
    enableVerification: boolean
    requireCompanyInfo: boolean
    enableCustomFields: boolean
    cacheProfileData: boolean
  }

  constructor(config: any) {
    this.config = {
      enableVerification: true,
      requireCompanyInfo: false,
      enableCustomFields: true,
      cacheProfileData: true,
      ...config
    }
  }

  /**
   * Initialize profile manager
   */
  async initialize(): Promise<void> {
    try {
      await this.loadProfilesFromStorage()
      await this.buildIndexes()
      
      logger.info('User profile manager initialized successfully', {
        profileCount: this.profiles.size,
        verificationEnabled: this.config.enableVerification
      })

    } catch (error) {
      logger.error('Failed to initialize user profile manager', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Create a new user profile
   */
  async createProfile(profileData: {
    email: string
    firstName: string
    lastName: string
    company?: string
    businessType?: string
    phone?: string
  }): Promise<UserProfile> {
    try {
      // Validate email uniqueness
      if (this.emailIndex.has(profileData.email.toLowerCase())) {
        throw new Error('Email address already exists')
      }

      // Generate unique user ID
      const userId = this.generateUserId()

      // Create profile
      const profile: UserProfile = {
        id: userId,
        email: profileData.email.toLowerCase(),
        emailVerified: false,
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        displayName: `${profileData.firstName} ${profileData.lastName}`,
        phone: profileData.phone,
        phoneVerified: false,
        company: profileData.company,
        businessType: profileData.businessType as any,
        status: 'pending_verification',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        verificationStatus: {
          email: false,
          phone: false,
          identity: false,
          company: false,
          businessLicense: false
        },
        profileVisibility: 'private',
        allowContactFromOthers: true,
        plan: 'free'
      }

      // Validate profile
      const validation = await this.validateProfile(profile)
      if (!validation.valid) {
        throw new Error(`Profile validation failed: ${validation.errors.join(', ')}`)
      }

      // Store profile
      this.profiles.set(userId, profile)
      this.emailIndex.set(profile.email, userId)
      
      // Update company index
      if (profile.company) {
        this.updateCompanyIndex(profile.company, userId, 'add')
      }

      // Cache profile data if enabled
      if (this.config.cacheProfileData) {
        await cache.set(`profile:${userId}`, profile, 60 * 60 * 1000) // 1 hour
      }

      // Record metrics
      await metricsCollector.recordMetric(
        'user_profile_created',
        1,
        'count',
        {
          hasCompany: (!!profile.company).toString(),
          businessType: profile.businessType || 'unknown'
        }
      )

      logger.info('User profile created successfully', {
        userId,
        email: profile.email,
        company: profile.company
      })

      return profile

    } catch (error) {
      logger.error('Failed to create user profile', error instanceof Error ? error : undefined, {
        email: profileData.email
      })
      throw error
    }
  }

  /**
   * Get user profile by ID
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      // Try cache first if enabled
      if (this.config.cacheProfileData) {
        const cached = await cache.get<UserProfile>(`profile:${userId}`)
        if (cached) {
          return cached
        }
      }

      // Get from memory storage
      const profile = this.profiles.get(userId)
      
      if (profile && this.config.cacheProfileData) {
        // Cache for future requests
        await cache.set(`profile:${userId}`, profile, 60 * 60 * 1000) // 1 hour
      }

      return profile || null

    } catch (error) {
      logger.error('Failed to get user profile', error instanceof Error ? error : undefined, { userId })
      return null
    }
  }

  /**
   * Get user profile by email
   */
  async getProfileByEmail(email: string): Promise<UserProfile | null> {
    try {
      const userId = this.emailIndex.get(email.toLowerCase())
      return userId ? await this.getProfile(userId) : null

    } catch (error) {
      logger.error('Failed to get profile by email', error instanceof Error ? error : undefined, { email })
      return null
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: ProfileUpdate): Promise<UserProfile> {
    try {
      const profile = this.profiles.get(userId)
      if (!profile) {
        throw new Error('Profile not found')
      }

      // Validate updates
      const validation = await this.validateProfileUpdate(userId, updates)
      if (!validation.valid) {
        throw new Error(`Profile update validation failed: ${validation.errors.join(', ')}`)
      }

      // Handle email change
      if (updates.email && updates.email !== profile.email) {
        if (this.emailIndex.has(updates.email.toLowerCase())) {
          throw new Error('Email address already exists')
        }
        
        // Update email index
        this.emailIndex.delete(profile.email)
        this.emailIndex.set(updates.email.toLowerCase(), userId)
        
        // Reset email verification
        updates.emailVerified = false
        updates.verificationStatus = {
          ...profile.verificationStatus,
          email: false
        }
      }

      // Handle company change
      if (updates.company !== undefined && updates.company !== profile.company) {
        // Remove from old company index
        if (profile.company) {
          this.updateCompanyIndex(profile.company, userId, 'remove')
        }
        
        // Add to new company index
        if (updates.company) {
          this.updateCompanyIndex(updates.company, userId, 'add')
        }
      }

      // Apply updates
      const updatedProfile: UserProfile = {
        ...profile,
        ...updates,
        updatedAt: Date.now()
      }

      // Store updated profile
      this.profiles.set(userId, updatedProfile)

      // Update cache
      if (this.config.cacheProfileData) {
        await cache.set(`profile:${userId}`, updatedProfile, 60 * 60 * 1000)
      }

      // Record metrics
      await metricsCollector.recordMetric(
        'user_profile_updated',
        1,
        'count',
        {
          fieldsUpdated: Object.keys(updates).length.toString(),
          hasEmailChange: (!!updates.email).toString()
        }
      )

      logger.info('User profile updated successfully', {
        userId,
        fieldsUpdated: Object.keys(updates)
      })

      return updatedProfile

    } catch (error) {
      logger.error('Failed to update user profile', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Validate profile data
   */
  async validateProfile(profile: UserProfile): Promise<ProfileValidation> {
    const errors: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []

    // Required fields validation
    if (!profile.email || !this.isValidEmail(profile.email)) {
      errors.push('Valid email address is required')
    }

    if (!profile.firstName || profile.firstName.trim().length < 1) {
      errors.push('First name is required')
    }

    if (!profile.lastName || profile.lastName.trim().length < 1) {
      errors.push('Last name is required')
    }

    // Business information validation
    if (this.config.requireCompanyInfo && !profile.company) {
      errors.push('Company information is required')
    }

    // Phone validation
    if (profile.phone && !this.isValidPhone(profile.phone)) {
      warnings.push('Phone number format may be invalid')
    }

    // CAGE code validation
    if (profile.cageCode && !this.isValidCageCode(profile.cageCode)) {
      warnings.push('CAGE code format appears invalid')
    }

    // DUNS validation
    if (profile.duns && !this.isValidDuns(profile.duns)) {
      warnings.push('DUNS number format appears invalid')
    }

    // UEI validation
    if (profile.uei && !this.isValidUei(profile.uei)) {
      warnings.push('UEI format appears invalid')
    }

    // Suggestions for improvement
    if (!profile.phone) {
      suggestions.push('Adding a phone number improves your profile completeness')
    }

    if (!profile.company && profile.businessType) {
      suggestions.push('Consider adding company information to complete your business profile')
    }

    if (!profile.bio) {
      suggestions.push('Adding a professional bio helps others understand your expertise')
    }

    if (!profile.expertise || profile.expertise.length === 0) {
      suggestions.push('Adding expertise areas helps with opportunity matching')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions
    }
  }

  /**
   * Validate profile update
   */
  async validateProfileUpdate(userId: string, updates: ProfileUpdate): Promise<ProfileValidation> {
    const profile = this.profiles.get(userId)
    if (!profile) {
      return {
        valid: false,
        errors: ['Profile not found'],
        warnings: [],
        suggestions: []
      }
    }

    // Create temporary profile with updates for validation
    const tempProfile = { ...profile, ...updates }
    return await this.validateProfile(tempProfile)
  }

  /**
   * Search profiles
   */
  async searchProfiles(options: ProfileSearchOptions): Promise<{
    profiles: UserProfile[]
    total: number
    hasMore: boolean
  }> {
    try {
      let filteredProfiles = Array.from(this.profiles.values())

      // Apply filters
      if (options.query) {
        const query = options.query.toLowerCase()
        filteredProfiles = filteredProfiles.filter(p => 
          p.firstName.toLowerCase().includes(query) ||
          p.lastName.toLowerCase().includes(query) ||
          p.email.toLowerCase().includes(query) ||
          (p.company && p.company.toLowerCase().includes(query))
        )
      }

      if (options.company) {
        filteredProfiles = filteredProfiles.filter(p => 
          p.company && p.company.toLowerCase().includes(options.company!.toLowerCase())
        )
      }

      if (options.businessType) {
        filteredProfiles = filteredProfiles.filter(p => p.businessType === options.businessType)
      }

      if (options.certifications && options.certifications.length > 0) {
        filteredProfiles = filteredProfiles.filter(p => 
          p.certifications && p.certifications.some(cert => 
            options.certifications!.includes(cert.type)
          )
        )
      }

      if (options.serviceAreas && options.serviceAreas.length > 0) {
        filteredProfiles = filteredProfiles.filter(p => 
          p.serviceAreas && p.serviceAreas.some(area => 
            options.serviceAreas!.includes(area)
          )
        )
      }

      if (options.expertise && options.expertise.length > 0) {
        filteredProfiles = filteredProfiles.filter(p => 
          p.expertise && p.expertise.some(exp => 
            options.expertise!.some(reqExp => 
              exp.toLowerCase().includes(reqExp.toLowerCase())
            )
          )
        )
      }

      // Sort by relevance/update time
      filteredProfiles.sort((a, b) => b.updatedAt - a.updatedAt)

      // Apply pagination
      const limit = options.limit || 20
      const offset = options.offset || 0
      const total = filteredProfiles.length
      const paginatedProfiles = filteredProfiles.slice(offset, offset + limit)

      return {
        profiles: paginatedProfiles,
        total,
        hasMore: offset + limit < total
      }

    } catch (error) {
      logger.error('Failed to search profiles', error instanceof Error ? error : undefined)
      return { profiles: [], total: 0, hasMore: false }
    }
  }

  /**
   * Get profile statistics
   */
  async getProfileStats(): Promise<ProfileStats> {
    try {
      const profiles = Array.from(this.profiles.values())
      
      const stats: ProfileStats = {
        totalProfiles: profiles.length,
        activeProfiles: profiles.filter(p => p.status === 'active').length,
        verifiedProfiles: profiles.filter(p => p.verificationStatus.email && p.verificationStatus.identity).length,
        companiesRepresented: new Set(profiles.map(p => p.company).filter(Boolean)).size,
        certificationBreakdown: {},
        businessTypeBreakdown: {},
        geographicDistribution: {}
      }

      // Calculate certification breakdown
      profiles.forEach(p => {
        if (p.certifications) {
          p.certifications.forEach(cert => {
            stats.certificationBreakdown[cert.type] = (stats.certificationBreakdown[cert.type] || 0) + 1
          })
        }
      })

      // Calculate business type breakdown
      profiles.forEach(p => {
        if (p.businessType) {
          stats.businessTypeBreakdown[p.businessType] = (stats.businessTypeBreakdown[p.businessType] || 0) + 1
        }
      })

      // Calculate geographic distribution
      profiles.forEach(p => {
        if (p.address?.state) {
          stats.geographicDistribution[p.address.state] = (stats.geographicDistribution[p.address.state] || 0) + 1
        }
      })

      return stats

    } catch (error) {
      logger.error('Failed to get profile statistics', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Deactivate profile
   */
  async deactivateProfile(userId: string, reason?: string): Promise<boolean> {
    try {
      const profile = this.profiles.get(userId)
      if (!profile) {
        return false
      }

      profile.status = 'inactive'
      profile.updatedAt = Date.now()

      // Clear cache
      if (this.config.cacheProfileData) {
        await cache.delete(`profile:${userId}`)
      }

      logger.info('User profile deactivated', { userId, reason })
      
      return true

    } catch (error) {
      logger.error('Failed to deactivate profile', error instanceof Error ? error : undefined, { userId })
      return false
    }
  }

  /**
   * Delete profile
   */
  async deleteProfile(userId: string): Promise<boolean> {
    try {
      const profile = this.profiles.get(userId)
      if (!profile) {
        return false
      }

      // Remove from indexes
      this.emailIndex.delete(profile.email)
      if (profile.company) {
        this.updateCompanyIndex(profile.company, userId, 'remove')
      }

      // Remove profile
      this.profiles.delete(userId)

      // Clear cache
      if (this.config.cacheProfileData) {
        await cache.delete(`profile:${userId}`)
      }

      logger.info('User profile deleted', { userId })
      
      return true

    } catch (error) {
      logger.error('Failed to delete profile', error instanceof Error ? error : undefined, { userId })
      return false
    }
  }

  /**
   * Shutdown profile manager
   */
  async shutdown(): Promise<void> {
    try {
      await this.saveProfilesToStorage()
      
      this.profiles.clear()
      this.emailIndex.clear()
      this.companyIndex.clear()

      logger.info('User profile manager shutdown complete')

    } catch (error) {
      logger.error('Profile manager shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  private isValidPhone(phone: string): boolean {
    // Basic phone validation - in production use a proper phone validation library
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/
    return phoneRegex.test(phone.replace(/[\s\-\(\)\.]/g, ''))
  }

  private isValidCageCode(cageCode: string): boolean {
    // CAGE code is 5 alphanumeric characters
    const cageRegex = /^[A-Z0-9]{5}$/
    return cageRegex.test(cageCode.toUpperCase())
  }

  private isValidDuns(duns: string): boolean {
    // DUNS is 9 digits
    const dunsRegex = /^\d{9}$/
    return dunsRegex.test(duns.replace(/[\s\-]/g, ''))
  }

  private isValidUei(uei: string): boolean {
    // UEI is 12 alphanumeric characters
    const ueiRegex = /^[A-Z0-9]{12}$/
    return ueiRegex.test(uei.toUpperCase())
  }

  private updateCompanyIndex(company: string, userId: string, action: 'add' | 'remove'): void {
    const companyKey = company.toLowerCase()
    const userIds = this.companyIndex.get(companyKey) || []

    if (action === 'add') {
      if (!userIds.includes(userId)) {
        userIds.push(userId)
        this.companyIndex.set(companyKey, userIds)
      }
    } else {
      const index = userIds.indexOf(userId)
      if (index > -1) {
        userIds.splice(index, 1)
        if (userIds.length === 0) {
          this.companyIndex.delete(companyKey)
        } else {
          this.companyIndex.set(companyKey, userIds)
        }
      }
    }
  }

  private async buildIndexes(): Promise<void> {
    for (const [userId, profile] of this.profiles) {
      this.emailIndex.set(profile.email, userId)
      
      if (profile.company) {
        this.updateCompanyIndex(profile.company, userId, 'add')
      }
    }
  }

  private async loadProfilesFromStorage(): Promise<void> {
    // In production, would load from database
    // For now, using in-memory storage
  }

  private async saveProfilesToStorage(): Promise<void> {
    // In production, would save to database
    // For now, using in-memory storage
  }
}

export default UserProfileManager