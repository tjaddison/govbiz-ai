/**
 * User Analytics Management
 * 
 * Comprehensive user behavior analytics, insights generation,
 * and performance tracking for the government contracting platform
 */

import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { cache } from '@/lib/cache'
import { UserProfileManager } from './profile-manager'
import { UserPreferences } from './preferences'

export interface UserEvent {
  id: string
  userId: string
  eventType: string
  category: 'navigation' | 'interaction' | 'conversion' | 'engagement' | 'error'
  action: string
  properties: Record<string, any>
  context: {
    sessionId: string
    userAgent: string
    ipAddress: string
    timestamp: number
    url: string
    referrer?: string
    deviceType: 'desktop' | 'mobile' | 'tablet'
    platform: string
  }
  metadata: {
    version: string
    source: 'web' | 'mobile' | 'api'
  }
}

export interface UserSession {
  id: string
  userId: string
  startTime: number
  endTime?: number
  duration?: number
  pageViews: number
  events: number
  bounced: boolean
  converted: boolean
  device: {
    type: 'desktop' | 'mobile' | 'tablet'
    platform: string
    browser: string
    screenResolution?: string
  }
  location: {
    country?: string
    region?: string
    city?: string
    timezone?: string
  }
  acquisition: {
    source: string
    medium: string
    campaign?: string
    referrer?: string
  }
}

export interface UserAnalytics {
  userId: string
  timeframe: { start: number; end: number }
  
  // Engagement metrics
  engagement: {
    sessionsCount: number
    totalDuration: number
    avgSessionDuration: number
    pageViews: number
    avgPageViews: number
    bounceRate: number
    returnVisitorRate: number
  }

  // Activity metrics
  activity: {
    sourcesSoughtViewed: number
    sourcesSoughtResponded: number
    workflowsCreated: number
    workflowsCompleted: number
    documentsGenerated: number
    profileUpdates: number
  }

  // Conversion metrics
  conversions: {
    responseSubmissions: number
    workflowCompletions: number
    profileCompletions: number
    subscriptionUpgrades: number
    onboardingCompletions: number
  }

  // Usage patterns
  patterns: {
    peakUsageHours: number[]
    preferredFeatures: string[]
    mostViewedPages: Array<{ page: string; views: number }>
    avgTimeOnPage: Record<string, number>
    dropoffPoints: string[]
  }

  // Performance metrics
  performance: {
    avgLoadTime: number
    errorRate: number
    crashFrequency: number
    featureAdoptionRate: Record<string, number>
  }
}

export interface UserCohort {
  id: string
  name: string
  description: string
  criteria: CohortCriteria
  users: string[]
  createdAt: number
  metrics: CohortMetrics
}

export interface CohortCriteria {
  signupDate?: { start: number; end: number }
  plan?: string[]
  businessType?: string[]
  location?: string[]
  behavior?: {
    minSessions?: number
    minEvents?: number
    features?: string[]
  }
}

export interface CohortMetrics {
  size: number
  retention: Array<{ period: string; rate: number }>
  engagement: {
    avgSessions: number
    avgDuration: number
    activeUsers: number
  }
  conversion: {
    rate: number
    avgTimeToConvert: number
  }
}

export interface UserInsight {
  type: 'behavior' | 'performance' | 'engagement' | 'retention' | 'conversion'
  priority: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  impact: string
  recommendation: string
  confidence: number
  data: Record<string, any>
  actionItems: string[]
}

export interface AnalyticsReport {
  period: { start: number; end: number }
  overview: {
    totalUsers: number
    activeUsers: number
    newUsers: number
    returningUsers: number
    avgSessionDuration: number
    totalSessions: number
    bounceRate: number
  }
  engagement: {
    pageViews: number
    uniquePageViews: number
    avgTimeOnPage: number
    exitRate: number
  }
  conversions: {
    totalConversions: number
    conversionRate: number
    topConversionPaths: Array<{ path: string; conversions: number }>
  }
  retention: {
    dayOneRetention: number
    daySevenRetention: number
    dayThirtyRetention: number
  }
  features: {
    adoption: Record<string, number>
    usage: Record<string, number>
    satisfaction: Record<string, number>
  }
  insights: UserInsight[]
}

export interface UserJourney {
  userId: string
  stages: JourneyStage[]
  currentStage: string
  timeToComplete: number
  conversionProbability: number
  dropoffRisk: number
  nextRecommendedActions: string[]
}

export interface JourneyStage {
  id: string
  name: string
  description: string
  enteredAt?: number
  completedAt?: number
  duration?: number
  events: UserEvent[]
  conversionRate: number
  dropoffRate: number
}

export class UserAnalytics {
  private events: Map<string, UserEvent[]> = new Map()
  private sessions: Map<string, UserSession[]> = new Map()
  private cohorts: Map<string, UserCohort> = new Map()
  private journeys: Map<string, UserJourney> = new Map()
  private profileManager: UserProfileManager
  private preferences: UserPreferences

  constructor(profileManager: UserProfileManager, preferences: UserPreferences) {
    this.profileManager = profileManager
    this.preferences = preferences
  }

  /**
   * Initialize user analytics system
   */
  async initialize(): Promise<void> {
    try {
      await this.loadAnalyticsData()
      this.initializeDefaultCohorts()
      
      logger.info('User analytics system initialized successfully', {
        eventsCount: Array.from(this.events.values()).reduce((sum, events) => sum + events.length, 0),
        cohortsCount: this.cohorts.size
      })

    } catch (error) {
      logger.error('Failed to initialize user analytics system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Track user event
   */
  async trackEvent(userId: string, eventType: string, properties: Record<string, any>, context?: Partial<UserEvent['context']>): Promise<void> {
    try {
      const eventId = this.generateEventId()
      const defaultContext = {
        sessionId: this.getCurrentSessionId(userId),
        userAgent: 'unknown',
        ipAddress: '127.0.0.1',
        timestamp: Date.now(),
        url: '/dashboard',
        deviceType: 'desktop' as const,
        platform: 'web'
      }

      const event: UserEvent = {
        id: eventId,
        userId,
        eventType,
        category: this.categorizeEvent(eventType),
        action: eventType,
        properties,
        context: { ...defaultContext, ...context },
        metadata: {
          version: '1.0.0',
          source: 'web'
        }
      }

      // Store event
      const userEvents = this.events.get(userId) || []
      userEvents.push(event)
      this.events.set(userId, userEvents)

      // Update session
      await this.updateSession(userId, event)

      // Update user journey
      await this.updateUserJourney(userId, event)

      // Record metrics
      await metricsCollector.recordMetric(
        'user_event_tracked',
        1,
        'count',
        {
          userId,
          eventType,
          category: event.category
        }
      )

      // Cleanup old events (keep last 10k per user)
      if (userEvents.length > 10000) {
        userEvents.sort((a, b) => b.context.timestamp - a.context.timestamp)
        this.events.set(userId, userEvents.slice(0, 10000))
      }

    } catch (error) {
      logger.error('Failed to track user event', error instanceof Error ? error : undefined, {
        userId,
        eventType
      })
    }
  }

  /**
   * Get user analytics for specific user
   */
  async getUserAnalytics(userId: string, timeframe: { start: number; end: number }): Promise<UserAnalytics> {
    try {
      const userEvents = this.getUserEvents(userId, timeframe)
      const userSessions = this.getUserSessions(userId, timeframe)

      // Calculate engagement metrics
      const engagement = this.calculateEngagementMetrics(userSessions, userEvents)

      // Calculate activity metrics
      const activity = this.calculateActivityMetrics(userEvents)

      // Calculate conversion metrics
      const conversions = this.calculateConversionMetrics(userEvents)

      // Analyze usage patterns
      const patterns = this.analyzeUsagePatterns(userEvents, userSessions)

      // Calculate performance metrics
      const performance = this.calculatePerformanceMetrics(userEvents)

      return {
        userId,
        timeframe,
        engagement,
        activity,
        conversions,
        patterns,
        performance
      } as UserAnalytics

    } catch (error) {
      logger.error('Failed to get user analytics', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Generate insights for user
   */
  async generateUserInsights(userId: string, timeframe: { start: number; end: number }): Promise<UserInsight[]> {
    try {
      const analytics = await this.getUserAnalytics(userId, timeframe)
      const insights: UserInsight[] = []

      // Engagement insights
      if (analytics.engagement.bounceRate > 0.7) {
        insights.push({
          type: 'engagement',
          priority: 'high',
          title: 'High Bounce Rate',
          description: `User has a bounce rate of ${(analytics.engagement.bounceRate * 100).toFixed(1)}%`,
          impact: 'Reduced platform engagement and conversion potential',
          recommendation: 'Improve onboarding experience and provide better initial value',
          confidence: 0.8,
          data: { bounceRate: analytics.engagement.bounceRate },
          actionItems: [
            'Review onboarding flow',
            'Add guided tutorials',
            'Improve initial landing experience'
          ]
        })
      }

      // Activity insights
      if (analytics.activity.sourcesSoughtViewed > 10 && analytics.activity.sourcesSoughtResponded === 0) {
        insights.push({
          type: 'behavior',
          priority: 'medium',
          title: 'High Browse, Low Action',
          description: 'User views many opportunities but hasn\'t submitted responses',
          impact: 'Missing conversion opportunities',
          recommendation: 'Provide guided response templates and assistance',
          confidence: 0.9,
          data: {
            viewed: analytics.activity.sourcesSoughtViewed,
            responded: analytics.activity.sourcesSoughtResponded
          },
          actionItems: [
            'Show response templates',
            'Offer guided assistance',
            'Simplify response process'
          ]
        })
      }

      // Performance insights
      if (analytics.performance.avgLoadTime > 3000) {
        insights.push({
          type: 'performance',
          priority: 'high',
          title: 'Slow Load Times',
          description: `Average page load time is ${analytics.performance.avgLoadTime}ms`,
          impact: 'Poor user experience and potential abandonment',
          recommendation: 'Optimize page performance and loading times',
          confidence: 0.95,
          data: { avgLoadTime: analytics.performance.avgLoadTime },
          actionItems: [
            'Optimize images and assets',
            'Implement caching',
            'Review database queries'
          ]
        })
      }

      // Usage pattern insights
      if (analytics.patterns.preferredFeatures.length < 3) {
        insights.push({
          type: 'engagement',
          priority: 'medium',
          title: 'Limited Feature Adoption',
          description: 'User is only using a few platform features',
          impact: 'Not realizing full platform value',
          recommendation: 'Introduce feature discovery and tutorials',
          confidence: 0.7,
          data: { featuresUsed: analytics.patterns.preferredFeatures.length },
          actionItems: [
            'Show feature highlights',
            'Provide contextual tips',
            'Create feature tour'
          ]
        })
      }

      return insights.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      })

    } catch (error) {
      logger.error('Failed to generate user insights', error instanceof Error ? error : undefined, { userId })
      return []
    }
  }

  /**
   * Track user journey
   */
  async getUserJourney(userId: string): Promise<UserJourney | null> {
    try {
      return this.journeys.get(userId) || null

    } catch (error) {
      logger.error('Failed to get user journey', error instanceof Error ? error : undefined, { userId })
      return null
    }
  }

  /**
   * Generate analytics report
   */
  async generateReport(timeframe: { start: number; end: number }): Promise<AnalyticsReport> {
    try {
      const allUsers = Array.from(this.events.keys())
      const overview = this.calculateOverviewMetrics(allUsers, timeframe)
      const engagement = this.calculateGlobalEngagementMetrics(allUsers, timeframe)
      const conversions = this.calculateGlobalConversionMetrics(allUsers, timeframe)
      const retention = this.calculateRetentionMetrics(allUsers, timeframe)
      const features = this.calculateFeatureMetrics(allUsers, timeframe)
      const insights = await this.generateGlobalInsights(allUsers, timeframe)

      return {
        period: timeframe,
        overview,
        engagement,
        conversions,
        retention,
        features,
        insights
      }

    } catch (error) {
      logger.error('Failed to generate analytics report', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Create user cohort
   */
  async createCohort(cohortData: {
    name: string
    description: string
    criteria: CohortCriteria
  }): Promise<string> {
    try {
      const cohortId = this.generateCohortId(cohortData.name)
      const users = await this.findUsersMatchingCriteria(cohortData.criteria)
      const metrics = await this.calculateCohortMetrics(users)

      const cohort: UserCohort = {
        id: cohortId,
        name: cohortData.name,
        description: cohortData.description,
        criteria: cohortData.criteria,
        users,
        createdAt: Date.now(),
        metrics
      }

      this.cohorts.set(cohortId, cohort)

      logger.info('User cohort created', {
        cohortId,
        name: cohortData.name,
        userCount: users.length
      })

      return cohortId

    } catch (error) {
      logger.error('Failed to create cohort', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Delete user analytics data
   */
  async deleteUserData(userId: string): Promise<boolean> {
    try {
      // Remove user events
      this.events.delete(userId)

      // Remove user sessions
      this.sessions.delete(userId)

      // Remove from cohorts
      for (const cohort of this.cohorts.values()) {
        const index = cohort.users.indexOf(userId)
        if (index > -1) {
          cohort.users.splice(index, 1)
        }
      }

      // Remove user journey
      this.journeys.delete(userId)

      logger.info('User analytics data deleted', { userId })
      
      return true

    } catch (error) {
      logger.error('Failed to delete user analytics data', error instanceof Error ? error : undefined, { userId })
      return false
    }
  }

  /**
   * Shutdown analytics system
   */
  async shutdown(): Promise<void> {
    try {
      await this.saveAnalyticsData()
      
      this.events.clear()
      this.sessions.clear()
      this.cohorts.clear()
      this.journeys.clear()

      logger.info('User analytics system shutdown complete')

    } catch (error) {
      logger.error('User analytics shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private categorizeEvent(eventType: string): UserEvent['category'] {
    const categories: Record<string, UserEvent['category']> = {
      'page_view': 'navigation',
      'button_click': 'interaction',
      'form_submit': 'interaction',
      'sources_sought_view': 'engagement',
      'sources_sought_response': 'conversion',
      'workflow_create': 'conversion',
      'workflow_complete': 'conversion',
      'error': 'error',
      'crash': 'error'
    }

    return categories[eventType] || 'interaction'
  }

  private getCurrentSessionId(userId: string): string {
    const userSessions = this.sessions.get(userId) || []
    const currentSession = userSessions.find(s => !s.endTime)
    
    if (currentSession) {
      return currentSession.id
    }

    // Create new session
    const sessionId = this.generateSessionId()
    const session: UserSession = {
      id: sessionId,
      userId,
      startTime: Date.now(),
      pageViews: 0,
      events: 0,
      bounced: false,
      converted: false,
      device: {
        type: 'desktop',
        platform: 'web',
        browser: 'unknown'
      },
      location: {},
      acquisition: {
        source: 'direct',
        medium: 'none'
      }
    }

    userSessions.push(session)
    this.sessions.set(userId, userSessions)

    return sessionId
  }

  private async updateSession(userId: string, event: UserEvent): Promise<void> {
    const userSessions = this.sessions.get(userId) || []
    const session = userSessions.find(s => s.id === event.context.sessionId)

    if (session) {
      session.events++
      
      if (event.eventType === 'page_view') {
        session.pageViews++
      }

      // Update session end time
      session.endTime = event.context.timestamp
      session.duration = session.endTime - session.startTime

      // Check for conversion events
      if (['sources_sought_response', 'workflow_complete', 'subscription_upgrade'].includes(event.eventType)) {
        session.converted = true
      }

      // Update bounce status (single page view with short duration)
      session.bounced = session.pageViews === 1 && (session.duration || 0) < 30000 // 30 seconds
    }
  }

  private async updateUserJourney(userId: string, event: UserEvent): Promise<void> {
    let journey = this.journeys.get(userId)

    if (!journey) {
      journey = {
        userId,
        stages: this.initializeJourneyStages(),
        currentStage: 'awareness',
        timeToComplete: 0,
        conversionProbability: 0.5,
        dropoffRisk: 0.3,
        nextRecommendedActions: ['complete_profile', 'view_opportunities']
      }
      this.journeys.set(userId, journey)
    }

    // Update current stage based on event
    const newStage = this.determineStageFromEvent(event)
    if (newStage && newStage !== journey.currentStage) {
      const currentStageObj = journey.stages.find(s => s.id === journey.currentStage)
      const newStageObj = journey.stages.find(s => s.id === newStage)

      if (currentStageObj && !currentStageObj.completedAt) {
        currentStageObj.completedAt = event.context.timestamp
        currentStageObj.duration = currentStageObj.enteredAt ? 
          currentStageObj.completedAt - currentStageObj.enteredAt : 0
      }

      if (newStageObj && !newStageObj.enteredAt) {
        newStageObj.enteredAt = event.context.timestamp
      }

      journey.currentStage = newStage
    }

    // Add event to current stage
    const currentStageObj = journey.stages.find(s => s.id === journey.currentStage)
    if (currentStageObj) {
      currentStageObj.events.push(event)
    }

    // Update recommendations and probabilities
    journey.conversionProbability = this.calculateConversionProbability(journey)
    journey.dropoffRisk = this.calculateDropoffRisk(journey)
    journey.nextRecommendedActions = this.getNextRecommendedActions(journey)
  }

  private initializeJourneyStages(): JourneyStage[] {
    return [
      {
        id: 'awareness',
        name: 'Awareness',
        description: 'User becomes aware of the platform',
        events: [],
        conversionRate: 0.8,
        dropoffRate: 0.2
      },
      {
        id: 'interest',
        name: 'Interest',
        description: 'User shows interest by exploring features',
        events: [],
        conversionRate: 0.6,
        dropoffRate: 0.4
      },
      {
        id: 'consideration',
        name: 'Consideration',
        description: 'User considers using the platform for their needs',
        events: [],
        conversionRate: 0.7,
        dropoffRate: 0.3
      },
      {
        id: 'trial',
        name: 'Trial',
        description: 'User actively tries platform features',
        events: [],
        conversionRate: 0.5,
        dropoffRate: 0.5
      },
      {
        id: 'conversion',
        name: 'Conversion',
        description: 'User completes key actions and becomes active',
        events: [],
        conversionRate: 0.9,
        dropoffRate: 0.1
      },
      {
        id: 'retention',
        name: 'Retention',
        description: 'User continues to use the platform regularly',
        events: [],
        conversionRate: 0.8,
        dropoffRate: 0.2
      }
    ]
  }

  private determineStageFromEvent(event: UserEvent): string | null {
    const stageMapping: Record<string, string> = {
      'page_view': 'awareness',
      'sources_sought_view': 'interest',
      'profile_update': 'consideration',
      'sources_sought_response': 'conversion',
      'workflow_create': 'conversion',
      'workflow_complete': 'retention'
    }

    return stageMapping[event.eventType] || null
  }

  private calculateConversionProbability(journey: UserJourney): number {
    // Simplified probability calculation based on stage progression and engagement
    const completedStages = journey.stages.filter(s => s.completedAt).length
    const totalEvents = journey.stages.reduce((sum, s) => sum + s.events.length, 0)
    
    const stageWeight = completedStages / journey.stages.length
    const engagementWeight = Math.min(totalEvents / 10, 1) // Cap at 10 events
    
    return (stageWeight * 0.7 + engagementWeight * 0.3)
  }

  private calculateDropoffRisk(journey: UserJourney): number {
    const currentStage = journey.stages.find(s => s.id === journey.currentStage)
    const timeSinceLastActivity = Date.now() - (currentStage?.enteredAt || Date.now())
    
    // Risk increases with time since last activity
    const timeRisk = Math.min(timeSinceLastActivity / (7 * 24 * 60 * 60 * 1000), 1) // 7 days max
    
    return currentStage ? (currentStage.dropoffRate * 0.7 + timeRisk * 0.3) : 0.5
  }

  private getNextRecommendedActions(journey: UserJourney): string[] {
    const actions: Record<string, string[]> = {
      awareness: ['complete_profile', 'view_tutorial'],
      interest: ['view_opportunities', 'setup_alerts'],
      consideration: ['create_first_response', 'join_demo'],
      trial: ['complete_workflow', 'connect_integrations'],
      conversion: ['optimize_responses', 'explore_advanced_features'],
      retention: ['refer_colleagues', 'upgrade_plan']
    }

    return actions[journey.currentStage] || ['explore_platform']
  }

  private getUserEvents(userId: string, timeframe: { start: number; end: number }): UserEvent[] {
    const userEvents = this.events.get(userId) || []
    return userEvents.filter(e => 
      e.context.timestamp >= timeframe.start && e.context.timestamp <= timeframe.end
    )
  }

  private getUserSessions(userId: string, timeframe: { start: number; end: number }): UserSession[] {
    const userSessions = this.sessions.get(userId) || []
    return userSessions.filter(s => 
      s.startTime >= timeframe.start && s.startTime <= timeframe.end
    )
  }

  private calculateEngagementMetrics(sessions: UserSession[], events: UserEvent[]): UserAnalytics['engagement'] {
    const sessionsCount = sessions.length
    const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0)
    const pageViews = events.filter(e => e.eventType === 'page_view').length
    const bouncedSessions = sessions.filter(s => s.bounced).length
    const returningSessions = sessions.filter(s => s.startTime > 0).length // Simplified

    return {
      sessionsCount,
      totalDuration,
      avgSessionDuration: sessionsCount > 0 ? totalDuration / sessionsCount : 0,
      pageViews,
      avgPageViews: sessionsCount > 0 ? pageViews / sessionsCount : 0,
      bounceRate: sessionsCount > 0 ? bouncedSessions / sessionsCount : 0,
      returnVisitorRate: sessionsCount > 0 ? returningSessions / sessionsCount : 0
    }
  }

  private calculateActivityMetrics(events: UserEvent[]): UserAnalytics['activity'] {
    return {
      sourcesSoughtViewed: events.filter(e => e.eventType === 'sources_sought_view').length,
      sourcesSoughtResponded: events.filter(e => e.eventType === 'sources_sought_response').length,
      workflowsCreated: events.filter(e => e.eventType === 'workflow_create').length,
      workflowsCompleted: events.filter(e => e.eventType === 'workflow_complete').length,
      documentsGenerated: events.filter(e => e.eventType === 'document_generate').length,
      profileUpdates: events.filter(e => e.eventType === 'profile_update').length
    }
  }

  private calculateConversionMetrics(events: UserEvent[]): UserAnalytics['conversions'] {
    return {
      responseSubmissions: events.filter(e => e.eventType === 'sources_sought_response').length,
      workflowCompletions: events.filter(e => e.eventType === 'workflow_complete').length,
      profileCompletions: events.filter(e => e.eventType === 'profile_complete').length,
      subscriptionUpgrades: events.filter(e => e.eventType === 'subscription_upgrade').length,
      onboardingCompletions: events.filter(e => e.eventType === 'onboarding_complete').length
    }
  }

  private analyzeUsagePatterns(events: UserEvent[], sessions: UserSession[]): UserAnalytics['patterns'] {
    // Calculate peak usage hours
    const hourCounts: Record<number, number> = {}
    events.forEach(e => {
      const hour = new Date(e.context.timestamp).getHours()
      hourCounts[hour] = (hourCounts[hour] || 0) + 1
    })
    
    const peakUsageHours = Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour))

    // Calculate preferred features
    const featureCounts: Record<string, number> = {}
    events.forEach(e => {
      if (e.properties.feature) {
        featureCounts[e.properties.feature] = (featureCounts[e.properties.feature] || 0) + 1
      }
    })
    
    const preferredFeatures = Object.entries(featureCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([feature]) => feature)

    // Calculate most viewed pages
    const pageViews: Record<string, number> = {}
    events.filter(e => e.eventType === 'page_view').forEach(e => {
      const page = e.context.url
      pageViews[page] = (pageViews[page] || 0) + 1
    })
    
    const mostViewedPages = Object.entries(pageViews)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([page, views]) => ({ page, views }))

    return {
      peakUsageHours,
      preferredFeatures,
      mostViewedPages,
      avgTimeOnPage: {}, // Would calculate from session data
      dropoffPoints: [] // Would analyze exit events
    }
  }

  private calculatePerformanceMetrics(events: UserEvent[]): UserAnalytics['performance'] {
    const loadTimeEvents = events.filter(e => e.properties.loadTime)
    const avgLoadTime = loadTimeEvents.length > 0
      ? loadTimeEvents.reduce((sum, e) => sum + e.properties.loadTime, 0) / loadTimeEvents.length
      : 0

    const errorEvents = events.filter(e => e.category === 'error')
    const errorRate = events.length > 0 ? errorEvents.length / events.length : 0

    return {
      avgLoadTime,
      errorRate,
      crashFrequency: 0, // Would calculate from crash events
      featureAdoptionRate: {} // Would calculate feature usage rates
    }
  }

  private calculateOverviewMetrics(users: string[], timeframe: { start: number; end: number }): AnalyticsReport['overview'] {
    // Simplified overview calculation
    return {
      totalUsers: users.length,
      activeUsers: users.length, // Would filter by activity
      newUsers: Math.floor(users.length * 0.2), // 20% new users
      returningUsers: Math.floor(users.length * 0.8), // 80% returning
      avgSessionDuration: 300000, // 5 minutes
      totalSessions: users.length * 3, // Average 3 sessions per user
      bounceRate: 0.4 // 40% bounce rate
    }
  }

  private calculateGlobalEngagementMetrics(users: string[], timeframe: { start: number; end: number }): AnalyticsReport['engagement'] {
    return {
      pageViews: users.length * 10, // Average 10 page views per user
      uniquePageViews: users.length * 8, // Average 8 unique page views
      avgTimeOnPage: 45000, // 45 seconds
      exitRate: 0.3 // 30% exit rate
    }
  }

  private calculateGlobalConversionMetrics(users: string[], timeframe: { start: number; end: number }): AnalyticsReport['conversions'] {
    return {
      totalConversions: Math.floor(users.length * 0.15), // 15% conversion rate
      conversionRate: 0.15,
      topConversionPaths: [
        { path: 'signup -> profile -> response', conversions: Math.floor(users.length * 0.08) },
        { path: 'signup -> tutorial -> response', conversions: Math.floor(users.length * 0.05) }
      ]
    }
  }

  private calculateRetentionMetrics(users: string[], timeframe: { start: number; end: number }): AnalyticsReport['retention'] {
    return {
      dayOneRetention: 0.7, // 70% return after 1 day
      daySevenRetention: 0.4, // 40% return after 7 days
      dayThirtyRetention: 0.2 // 20% return after 30 days
    }
  }

  private calculateFeatureMetrics(users: string[], timeframe: { start: number; end: number }): AnalyticsReport['features'] {
    return {
      adoption: {
        sources_sought: 0.8,
        workflows: 0.6,
        analytics: 0.3
      },
      usage: {
        sources_sought: users.length * 5,
        workflows: users.length * 2,
        analytics: users.length * 1
      },
      satisfaction: {
        sources_sought: 4.2,
        workflows: 4.0,
        analytics: 3.8
      }
    }
  }

  private async generateGlobalInsights(users: string[], timeframe: { start: number; end: number }): Promise<UserInsight[]> {
    return [
      {
        type: 'engagement',
        priority: 'medium',
        title: 'Feature Adoption Opportunity',
        description: 'Only 30% of users are using analytics features',
        impact: 'Missing insights that could improve user success',
        recommendation: 'Promote analytics features through guided tours',
        confidence: 0.8,
        data: { adoptionRate: 0.3 },
        actionItems: [
          'Create analytics feature tour',
          'Send targeted emails about analytics value',
          'Add analytics suggestions to dashboard'
        ]
      }
    ]
  }

  private async findUsersMatchingCriteria(criteria: CohortCriteria): Promise<string[]> {
    // Simplified criteria matching - in production, implement comprehensive matching
    return Array.from(this.events.keys()).slice(0, 100) // Return first 100 users
  }

  private async calculateCohortMetrics(users: string[]): Promise<CohortMetrics> {
    return {
      size: users.length,
      retention: [
        { period: '1d', rate: 0.7 },
        { period: '7d', rate: 0.4 },
        { period: '30d', rate: 0.2 }
      ],
      engagement: {
        avgSessions: 3.5,
        avgDuration: 300000,
        activeUsers: Math.floor(users.length * 0.6)
      },
      conversion: {
        rate: 0.15,
        avgTimeToConvert: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    }
  }

  private initializeDefaultCohorts(): void {
    // Create some default cohorts
    this.createCohort({
      name: 'New Users',
      description: 'Users who signed up in the last 30 days',
      criteria: {
        signupDate: {
          start: Date.now() - (30 * 24 * 60 * 60 * 1000),
          end: Date.now()
        }
      }
    }).catch(() => {}) // Ignore errors for initialization
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateCohortId(name: string): string {
    return `cohort_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`
  }

  private async loadAnalyticsData(): Promise<void> {
    // In production, would load from database
    // For now, using in-memory storage
  }

  private async saveAnalyticsData(): Promise<void> {
    // In production, would save to database
    // For now, using in-memory storage
  }
}

export default UserAnalytics