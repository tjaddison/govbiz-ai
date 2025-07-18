/**
 * User Onboarding Management
 * 
 * Comprehensive onboarding flow with personalized guidance,
 * progressive disclosure, and completion tracking
 */

import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { cache } from '@/lib/cache'
import { UserProfileManager } from './profile-manager'
import { UserPreferences } from './preferences'

export interface OnboardingStep {
  id: string
  title: string
  description: string
  type: 'profile' | 'preferences' | 'verification' | 'integration' | 'tutorial' | 'action'
  category: string
  priority: number
  estimatedMinutes: number
  prerequisites: string[] // Step IDs that must be completed first
  conditions?: OnboardingCondition[]
  content: OnboardingContent
  validation?: OnboardingValidation
  metadata: {
    isOptional: boolean
    isPersonalized: boolean
    showProgress: boolean
    allowSkip: boolean
  }
}

export interface OnboardingCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'exists' | 'not_exists'
  value?: any
}

export interface OnboardingContent {
  type: 'form' | 'guide' | 'video' | 'checklist' | 'interactive'
  title: string
  subtitle?: string
  instructions: string[]
  fields?: OnboardingField[]
  media?: {
    type: 'video' | 'image' | 'animation'
    url: string
    thumbnail?: string
    duration?: number
  }
  tips: string[]
  helpUrl?: string
}

export interface OnboardingField {
  id: string
  type: 'text' | 'email' | 'phone' | 'select' | 'multiselect' | 'checkbox' | 'file' | 'date'
  label: string
  placeholder?: string
  required: boolean
  options?: Array<{ value: string; label: string }>
  validation?: {
    pattern?: string
    minLength?: number
    maxLength?: number
    customValidator?: string
  }
  defaultValue?: any
}

export interface OnboardingValidation {
  type: 'automatic' | 'manual' | 'external'
  rules: OnboardingValidationRule[]
}

export interface OnboardingValidationRule {
  field: string
  required: boolean
  validator: string
  errorMessage: string
}

export interface OnboardingProgress {
  userId: string
  currentStep: string
  completedSteps: string[]
  skippedSteps: string[]
  stepData: Record<string, any>
  timeSpent: Record<string, number> // Step ID -> milliseconds
  startedAt: number
  lastActivity: number
  completedAt?: number
  completionRate: number
  personalizedSteps: string[]
  recommendedNextSteps: string[]
}

export interface OnboardingFlow {
  id: string
  name: string
  description: string
  targetUserType: string
  steps: OnboardingStep[]
  estimatedDuration: number
  completionReward?: {
    type: 'badge' | 'points' | 'access' | 'trial'
    value: string
  }
}

export interface OnboardingMetrics {
  totalUsers: number
  completionRate: number
  avgCompletionTime: number
  dropoffPoints: Array<{ stepId: string; dropoffRate: number }>
  stepMetrics: Array<{ 
    stepId: string
    completionRate: number
    avgTime: number
    skipRate: number
  }>
  userTypeMetrics: Record<string, {
    completionRate: number
    avgTime: number
    preferredFlow: string
  }>
}

export class UserOnboarding {
  private flows: Map<string, OnboardingFlow> = new Map()
  private userProgress: Map<string, OnboardingProgress> = new Map()
  private stepDefinitions: Map<string, OnboardingStep> = new Map()
  private profileManager: UserProfileManager
  private preferences: UserPreferences

  constructor(profileManager: UserProfileManager, preferences: UserPreferences) {
    this.profileManager = profileManager
    this.preferences = preferences
    this.initializeDefaultFlows()
  }

  /**
   * Initialize onboarding system
   */
  async initialize(): Promise<void> {
    try {
      await this.loadOnboardingData()
      
      logger.info('User onboarding system initialized successfully', {
        flowsCount: this.flows.size,
        stepsCount: this.stepDefinitions.size
      })

    } catch (error) {
      logger.error('Failed to initialize user onboarding system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Start onboarding for a user
   */
  async startOnboarding(userId: string, options: {
    role?: string
    hasCompany?: boolean
    inviteCode?: string
    preferredFlow?: string
  } = {}): Promise<OnboardingStep[]> {
    try {
      // Determine appropriate flow
      const flowId = this.selectOnboardingFlow(options)
      const flow = this.flows.get(flowId)
      
      if (!flow) {
        throw new Error(`Onboarding flow not found: ${flowId}`)
      }

      // Get user profile for personalization
      const profile = await this.profileManager.getProfile(userId)
      
      // Personalize steps based on user data
      const personalizedSteps = await this.personalizeSteps(flow.steps, profile, options)

      // Initialize progress
      const progress: OnboardingProgress = {
        userId,
        currentStep: personalizedSteps[0]?.id || '',
        completedSteps: [],
        skippedSteps: [],
        stepData: {},
        timeSpent: {},
        startedAt: Date.now(),
        lastActivity: Date.now(),
        completionRate: 0,
        personalizedSteps: personalizedSteps.map(s => s.id),
        recommendedNextSteps: this.getRecommendedNextSteps(personalizedSteps, [])
      }

      // Store progress
      this.userProgress.set(userId, progress)

      // Cache progress
      await cache.set(`onboarding:${userId}`, progress, 24 * 60 * 60 * 1000) // 24 hours

      // Record metrics
      await metricsCollector.recordMetric(
        'onboarding_started',
        1,
        'count',
        {
          userId,
          flowId,
          stepsCount: personalizedSteps.length.toString(),
          hasCompany: (!!options.hasCompany).toString(),
          role: options.role || 'unknown'
        }
      )

      logger.info('Onboarding started for user', {
        userId,
        flowId,
        stepsCount: personalizedSteps.length
      })

      return personalizedSteps

    } catch (error) {
      logger.error('Failed to start onboarding', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Get onboarding progress for user
   */
  async getOnboardingStatus(userId: string): Promise<OnboardingProgress | null> {
    try {
      // Try cache first
      const cached = await cache.get<OnboardingProgress>(`onboarding:${userId}`)
      if (cached) {
        return cached
      }

      // Get from memory storage
      const progress = this.userProgress.get(userId)
      
      if (progress) {
        // Cache for future requests
        await cache.set(`onboarding:${userId}`, progress, 24 * 60 * 60 * 1000)
      }

      return progress || null

    } catch (error) {
      logger.error('Failed to get onboarding status', error instanceof Error ? error : undefined, { userId })
      return null
    }
  }

  /**
   * Complete onboarding step
   */
  async completeStep(userId: string, stepId: string, stepData?: Record<string, any>): Promise<{
    success: boolean
    nextStep?: OnboardingStep
    completed: boolean
    progress: number
  }> {
    try {
      const progress = this.userProgress.get(userId)
      if (!progress) {
        throw new Error('Onboarding progress not found')
      }

      const step = this.stepDefinitions.get(stepId)
      if (!step) {
        throw new Error('Onboarding step not found')
      }

      // Record time spent on step
      const stepStartTime = progress.lastActivity
      const timeSpent = Date.now() - stepStartTime
      progress.timeSpent[stepId] = (progress.timeSpent[stepId] || 0) + timeSpent

      // Validate step data if provided
      if (stepData && step.validation) {
        const validation = await this.validateStepData(step, stepData)
        if (!validation.valid) {
          return {
            success: false,
            completed: false,
            progress: progress.completionRate
          }
        }
      }

      // Mark step as completed
      if (!progress.completedSteps.includes(stepId)) {
        progress.completedSteps.push(stepId)
      }

      // Store step data
      if (stepData) {
        progress.stepData[stepId] = stepData

        // Apply step data to user profile/preferences
        await this.applyStepData(userId, step, stepData)
      }

      // Calculate completion rate
      progress.completionRate = progress.completedSteps.length / progress.personalizedSteps.length

      // Check if onboarding is complete
      const isComplete = progress.completedSteps.length === progress.personalizedSteps.length
      if (isComplete) {
        progress.completedAt = Date.now()
      }

      // Get next step
      const nextStep = this.getNextStep(progress)
      if (nextStep) {
        progress.currentStep = nextStep.id
        progress.recommendedNextSteps = this.getRecommendedNextSteps(
          this.getPersonalizedSteps(progress.personalizedSteps),
          progress.completedSteps
        )
      }

      progress.lastActivity = Date.now()

      // Update storage
      this.userProgress.set(userId, progress)
      await cache.set(`onboarding:${userId}`, progress, 24 * 60 * 60 * 1000)

      // Record metrics
      await metricsCollector.recordMetric(
        'onboarding_step_completed',
        1,
        'count',
        {
          userId,
          stepId,
          timeSpent: timeSpent.toString(),
          stepType: step.type,
          isComplete: isComplete.toString()
        }
      )

      logger.info('Onboarding step completed', {
        userId,
        stepId,
        progress: progress.completionRate,
        isComplete,
        nextStep: nextStep?.id
      })

      return {
        success: true,
        nextStep: nextStep || undefined,
        completed: isComplete,
        progress: progress.completionRate
      }

    } catch (error) {
      logger.error('Failed to complete onboarding step', error instanceof Error ? error : undefined, {
        userId,
        stepId
      })
      throw error
    }
  }

  /**
   * Skip onboarding step
   */
  async skipStep(userId: string, stepId: string, reason?: string): Promise<{
    success: boolean
    nextStep?: OnboardingStep
  }> {
    try {
      const progress = this.userProgress.get(userId)
      if (!progress) {
        throw new Error('Onboarding progress not found')
      }

      const step = this.stepDefinitions.get(stepId)
      if (!step || !step.metadata.allowSkip) {
        throw new Error('Step cannot be skipped')
      }

      // Mark step as skipped
      if (!progress.skippedSteps.includes(stepId)) {
        progress.skippedSteps.push(stepId)
      }

      // Get next step
      const nextStep = this.getNextStep(progress)
      if (nextStep) {
        progress.currentStep = nextStep.id
      }

      progress.lastActivity = Date.now()

      // Update storage
      this.userProgress.set(userId, progress)
      await cache.set(`onboarding:${userId}`, progress, 24 * 60 * 60 * 1000)

      // Record metrics
      await metricsCollector.recordMetric(
        'onboarding_step_skipped',
        1,
        'count',
        {
          userId,
          stepId,
          reason: reason || 'user_choice'
        }
      )

      logger.info('Onboarding step skipped', {
        userId,
        stepId,
        reason,
        nextStep: nextStep?.id
      })

      return {
        success: true,
        nextStep: nextStep || undefined
      }

    } catch (error) {
      logger.error('Failed to skip onboarding step', error instanceof Error ? error : undefined, {
        userId,
        stepId
      })
      throw error
    }
  }

  /**
   * Get onboarding metrics
   */
  async getOnboardingMetrics(): Promise<OnboardingMetrics> {
    try {
      const allProgress = Array.from(this.userProgress.values())
      const totalUsers = allProgress.length
      
      if (totalUsers === 0) {
        return {
          totalUsers: 0,
          completionRate: 0,
          avgCompletionTime: 0,
          dropoffPoints: [],
          stepMetrics: [],
          userTypeMetrics: {}
        }
      }

      // Calculate completion rate
      const completedUsers = allProgress.filter(p => p.completedAt).length
      const completionRate = completedUsers / totalUsers

      // Calculate average completion time
      const completedWithTime = allProgress.filter(p => p.completedAt)
      const avgCompletionTime = completedWithTime.length > 0
        ? completedWithTime.reduce((sum, p) => sum + (p.completedAt! - p.startedAt), 0) / completedWithTime.length
        : 0

      // Calculate step metrics
      const stepMetrics = this.calculateStepMetrics(allProgress)

      // Calculate dropoff points
      const dropoffPoints = this.calculateDropoffPoints(allProgress)

      // Calculate user type metrics
      const userTypeMetrics = await this.calculateUserTypeMetrics(allProgress)

      return {
        totalUsers,
        completionRate,
        avgCompletionTime,
        dropoffPoints,
        stepMetrics,
        userTypeMetrics
      }

    } catch (error) {
      logger.error('Failed to get onboarding metrics', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Delete onboarding data
   */
  async deleteOnboardingData(userId: string): Promise<boolean> {
    try {
      // Remove from memory
      this.userProgress.delete(userId)

      // Remove from cache
      await cache.delete(`onboarding:${userId}`)

      logger.info('Onboarding data deleted', { userId })
      
      return true

    } catch (error) {
      logger.error('Failed to delete onboarding data', error instanceof Error ? error : undefined, { userId })
      return false
    }
  }

  /**
   * Shutdown onboarding system
   */
  async shutdown(): Promise<void> {
    try {
      await this.saveOnboardingData()
      
      this.flows.clear()
      this.userProgress.clear()
      this.stepDefinitions.clear()

      logger.info('User onboarding system shutdown complete')

    } catch (error) {
      logger.error('User onboarding shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private initializeDefaultFlows(): void {
    // Contractor onboarding flow
    const contractorFlow: OnboardingFlow = {
      id: 'contractor',
      name: 'Contractor Onboarding',
      description: 'Complete setup for government contractors',
      targetUserType: 'contractor',
      estimatedDuration: 30,
      steps: this.createContractorSteps(),
      completionReward: {
        type: 'access',
        value: 'advanced_features'
      }
    }

    // Individual/consultant onboarding flow
    const individualFlow: OnboardingFlow = {
      id: 'individual',
      name: 'Individual Onboarding',
      description: 'Quick setup for individual users',
      targetUserType: 'individual',
      estimatedDuration: 15,
      steps: this.createIndividualSteps()
    }

    // Government user onboarding flow
    const governmentFlow: OnboardingFlow = {
      id: 'government',
      name: 'Government User Onboarding',
      description: 'Specialized setup for government personnel',
      targetUserType: 'government',
      estimatedDuration: 20,
      steps: this.createGovernmentSteps()
    }

    this.flows.set('contractor', contractorFlow)
    this.flows.set('individual', individualFlow)
    this.flows.set('government', governmentFlow)

    // Store all step definitions
    for (const flow of [contractorFlow, individualFlow, governmentFlow]) {
      for (const step of flow.steps) {
        this.stepDefinitions.set(step.id, step)
      }
    }
  }

  private createContractorSteps(): OnboardingStep[] {
    return [
      {
        id: 'welcome',
        title: 'Welcome to GovBiz.ai',
        description: 'Let\'s get your account set up for government contracting success',
        type: 'tutorial',
        category: 'introduction',
        priority: 1,
        estimatedMinutes: 2,
        prerequisites: [],
        content: {
          type: 'guide',
          title: 'Welcome to Government Contracting Automation',
          instructions: [
            'GovBiz.ai helps you find and respond to Sources Sought opportunities',
            'We\'ll guide you through setting up your profile and preferences',
            'This process takes about 30 minutes and will significantly improve your success rate'
          ],
          tips: [
            'Complete all steps for the best experience',
            'You can always update your information later',
            'Skip optional steps if you\'re in a hurry'
          ]
        },
        metadata: {
          isOptional: false,
          isPersonalized: false,
          showProgress: true,
          allowSkip: false
        }
      },
      {
        id: 'company_profile',
        title: 'Company Information',
        description: 'Tell us about your business and capabilities',
        type: 'profile',
        category: 'business_setup',
        priority: 2,
        estimatedMinutes: 10,
        prerequisites: ['welcome'],
        content: {
          type: 'form',
          title: 'Company Profile Setup',
          subtitle: 'This information helps match you with relevant opportunities',
          instructions: [
            'Provide accurate company information',
            'Add all relevant NAICS codes',
            'Include current certifications'
          ],
          fields: [
            {
              id: 'company_name',
              type: 'text',
              label: 'Company Name',
              required: true
            },
            {
              id: 'cage_code',
              type: 'text',
              label: 'CAGE Code',
              required: false
            },
            {
              id: 'duns',
              type: 'text',
              label: 'DUNS Number',
              required: false
            },
            {
              id: 'uei',
              type: 'text',
              label: 'UEI Number',
              required: true
            },
            {
              id: 'naics_codes',
              type: 'multiselect',
              label: 'NAICS Codes',
              required: true,
              options: [
                { value: '541511', label: '541511 - Custom Computer Programming Services' },
                { value: '541512', label: '541512 - Computer Systems Design Services' },
                { value: '541513', label: '541513 - Computer Facilities Management Services' }
              ]
            }
          ],
          tips: [
            'Your NAICS codes determine which opportunities you\'ll see',
            'Add both primary and secondary codes',
            'UEI is required for government contracting'
          ]
        },
        metadata: {
          isOptional: false,
          isPersonalized: true,
          showProgress: true,
          allowSkip: false
        }
      },
      {
        id: 'sources_sought_preferences',
        title: 'Sources Sought Preferences',
        description: 'Configure how you want to find and track opportunities',
        type: 'preferences',
        category: 'opportunity_setup',
        priority: 3,
        estimatedMinutes: 8,
        prerequisites: ['company_profile'],
        content: {
          type: 'form',
          title: 'Sources Sought Configuration',
          instructions: [
            'Set up alerts for new opportunities',
            'Choose your preferred agencies',
            'Set response preferences'
          ],
          fields: [
            {
              id: 'alert_frequency',
              type: 'select',
              label: 'Alert Frequency',
              required: true,
              options: [
                { value: 'immediate', label: 'Immediate' },
                { value: 'daily', label: 'Daily Digest' },
                { value: 'weekly', label: 'Weekly Summary' }
              ],
              defaultValue: 'daily'
            },
            {
              id: 'agency_filters',
              type: 'multiselect',
              label: 'Preferred Agencies',
              required: false,
              options: [
                { value: 'dod', label: 'Department of Defense' },
                { value: 'va', label: 'Veterans Affairs' },
                { value: 'dhs', label: 'Homeland Security' }
              ]
            }
          ],
          tips: [
            'Daily digest is recommended for most users',
            'You can always adjust these settings later'
          ]
        },
        metadata: {
          isOptional: false,
          isPersonalized: true,
          showProgress: true,
          allowSkip: false
        }
      },
      {
        id: 'first_response',
        title: 'Create Your First Response',
        description: 'Practice with our guided response builder',
        type: 'action',
        category: 'tutorial',
        priority: 4,
        estimatedMinutes: 15,
        prerequisites: ['sources_sought_preferences'],
        content: {
          type: 'interactive',
          title: 'Guided Response Creation',
          instructions: [
            'We\'ll walk you through creating a sample response',
            'Learn our templates and best practices',
            'See how AI suggestions work'
          ],
          tips: [
            'This is just practice - nothing will be submitted',
            'Focus on understanding the process'
          ]
        },
        metadata: {
          isOptional: true,
          isPersonalized: true,
          showProgress: true,
          allowSkip: true
        }
      }
    ]
  }

  private createIndividualSteps(): OnboardingStep[] {
    return [
      {
        id: 'welcome_individual',
        title: 'Welcome!',
        description: 'Quick setup for your account',
        type: 'tutorial',
        category: 'introduction',
        priority: 1,
        estimatedMinutes: 1,
        prerequisites: [],
        content: {
          type: 'guide',
          title: 'Welcome to GovBiz.ai',
          instructions: [
            'Set up your profile for government opportunities',
            'This quick setup takes about 15 minutes'
          ],
          tips: ['You can upgrade to business features anytime']
        },
        metadata: {
          isOptional: false,
          isPersonalized: false,
          showProgress: true,
          allowSkip: false
        }
      },
      {
        id: 'basic_preferences',
        title: 'Preferences',
        description: 'Set your basic preferences',
        type: 'preferences',
        category: 'setup',
        priority: 2,
        estimatedMinutes: 5,
        prerequisites: ['welcome_individual'],
        content: {
          type: 'form',
          title: 'Basic Setup',
          instructions: ['Configure your basic preferences'],
          fields: [
            {
              id: 'notification_frequency',
              type: 'select',
              label: 'Email Notifications',
              required: true,
              options: [
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' }
              ]
            }
          ],
          tips: []
        },
        metadata: {
          isOptional: false,
          isPersonalized: false,
          showProgress: true,
          allowSkip: false
        }
      }
    ]
  }

  private createGovernmentSteps(): OnboardingStep[] {
    return [
      {
        id: 'welcome_government',
        title: 'Government User Setup',
        description: 'Specialized setup for government personnel',
        type: 'tutorial',
        category: 'introduction',
        priority: 1,
        estimatedMinutes: 2,
        prerequisites: [],
        content: {
          type: 'guide',
          title: 'Welcome Government User',
          instructions: [
            'Configure your account for government use',
            'Set up agency-specific preferences'
          ],
          tips: ['Special features available for government users']
        },
        metadata: {
          isOptional: false,
          isPersonalized: false,
          showProgress: true,
          allowSkip: false
        }
      }
    ]
  }

  private selectOnboardingFlow(options: {
    role?: string
    hasCompany?: boolean
    preferredFlow?: string
  }): string {
    if (options.preferredFlow && this.flows.has(options.preferredFlow)) {
      return options.preferredFlow
    }

    if (options.role === 'government') {
      return 'government'
    }

    if (options.hasCompany || options.role === 'contractor') {
      return 'contractor'
    }

    return 'individual'
  }

  private async personalizeSteps(steps: OnboardingStep[], profile: any, options: any): Promise<OnboardingStep[]> {
    // Filter and customize steps based on user data
    return steps.filter(step => {
      // Check conditions
      if (step.conditions) {
        for (const condition of step.conditions) {
          if (!this.evaluateCondition(condition, profile, options)) {
            return false
          }
        }
      }
      return true
    })
  }

  private evaluateCondition(condition: OnboardingCondition, profile: any, options: any): boolean {
    const context = { ...profile, ...options }
    const value = context[condition.field]

    switch (condition.operator) {
      case 'equals':
        return value === condition.value
      case 'not_equals':
        return value !== condition.value
      case 'exists':
        return value !== undefined && value !== null
      case 'not_exists':
        return value === undefined || value === null
      default:
        return true
    }
  }

  private getRecommendedNextSteps(steps: OnboardingStep[], completed: string[]): string[] {
    const available = steps.filter(step => 
      !completed.includes(step.id) &&
      step.prerequisites.every(prereq => completed.includes(prereq))
    )

    return available
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3)
      .map(step => step.id)
  }

  private getNextStep(progress: OnboardingProgress): OnboardingStep | null {
    const personalizedSteps = this.getPersonalizedSteps(progress.personalizedSteps)
    
    for (const step of personalizedSteps) {
      if (!progress.completedSteps.includes(step.id) && 
          !progress.skippedSteps.includes(step.id) &&
          step.prerequisites.every(prereq => progress.completedSteps.includes(prereq))) {
        return step
      }
    }

    return null
  }

  private getPersonalizedSteps(stepIds: string[]): OnboardingStep[] {
    return stepIds
      .map(id => this.stepDefinitions.get(id))
      .filter(step => step !== undefined) as OnboardingStep[]
  }

  private async validateStepData(step: OnboardingStep, data: Record<string, any>): Promise<{ valid: boolean; errors: string[] }> {
    // Simplified validation - in production, implement comprehensive validation
    return { valid: true, errors: [] }
  }

  private async applyStepData(userId: string, step: OnboardingStep, data: Record<string, any>): Promise<void> {
    try {
      if (step.type === 'profile') {
        // Update user profile
        await this.profileManager.updateProfile(userId, data)
      } else if (step.type === 'preferences') {
        // Update user preferences
        await this.preferences.updatePreferences(userId, data)
      }
    } catch (error) {
      logger.error('Failed to apply step data', error instanceof Error ? error : undefined, {
        userId,
        stepId: step.id
      })
    }
  }

  private calculateStepMetrics(allProgress: OnboardingProgress[]): Array<{
    stepId: string
    completionRate: number
    avgTime: number
    skipRate: number
  }> {
    const stepStats = new Map<string, {
      attempted: number
      completed: number
      skipped: number
      totalTime: number
    }>()

    // Collect data for each step
    for (const progress of allProgress) {
      for (const stepId of progress.personalizedSteps) {
        if (!stepStats.has(stepId)) {
          stepStats.set(stepId, { attempted: 0, completed: 0, skipped: 0, totalTime: 0 })
        }

        const stats = stepStats.get(stepId)!
        stats.attempted++

        if (progress.completedSteps.includes(stepId)) {
          stats.completed++
          stats.totalTime += progress.timeSpent[stepId] || 0
        } else if (progress.skippedSteps.includes(stepId)) {
          stats.skipped++
        }
      }
    }

    // Calculate metrics
    const metrics = []
    for (const [stepId, stats] of stepStats) {
      metrics.push({
        stepId,
        completionRate: stats.attempted > 0 ? stats.completed / stats.attempted : 0,
        avgTime: stats.completed > 0 ? stats.totalTime / stats.completed : 0,
        skipRate: stats.attempted > 0 ? stats.skipped / stats.attempted : 0
      })
    }

    return metrics
  }

  private calculateDropoffPoints(allProgress: OnboardingProgress[]): Array<{
    stepId: string
    dropoffRate: number
  }> {
    // Calculate where users abandon the onboarding process
    const stepDropoffs = new Map<string, number>()
    
    for (const progress of allProgress) {
      if (!progress.completedAt) {
        // User didn't complete onboarding
        const lastActiveStep = progress.currentStep
        if (lastActiveStep) {
          stepDropoffs.set(lastActiveStep, (stepDropoffs.get(lastActiveStep) || 0) + 1)
        }
      }
    }

    return Array.from(stepDropoffs.entries()).map(([stepId, dropoffs]) => ({
      stepId,
      dropoffRate: dropoffs / allProgress.length
    }))
  }

  private async calculateUserTypeMetrics(allProgress: OnboardingProgress[]): Promise<Record<string, {
    completionRate: number
    avgTime: number
    preferredFlow: string
  }>> {
    // Group by user type and calculate metrics
    const userTypeGroups = new Map<string, OnboardingProgress[]>()
    
    for (const progress of allProgress) {
      // Would need to get user type from profile
      const userType = 'contractor' // Simplified
      if (!userTypeGroups.has(userType)) {
        userTypeGroups.set(userType, [])
      }
      userTypeGroups.get(userType)!.push(progress)
    }

    const metrics: Record<string, any> = {}
    
    for (const [userType, progressList] of userTypeGroups) {
      const completed = progressList.filter(p => p.completedAt)
      const avgTime = completed.length > 0
        ? completed.reduce((sum, p) => sum + (p.completedAt! - p.startedAt), 0) / completed.length
        : 0

      metrics[userType] = {
        completionRate: progressList.length > 0 ? completed.length / progressList.length : 0,
        avgTime,
        preferredFlow: 'contractor' // Would calculate most used flow
      }
    }

    return metrics
  }

  private async loadOnboardingData(): Promise<void> {
    // In production, would load from database
    // For now, using in-memory initialization
  }

  private async saveOnboardingData(): Promise<void> {
    // In production, would save to database
    // For now, using in-memory storage
  }
}

export default UserOnboarding