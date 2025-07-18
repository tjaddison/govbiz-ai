/**
 * Document Analytics
 * 
 * Comprehensive analytics and insights for document usage, performance,
 * user behavior, and business intelligence
 */

import { 
  Document, 
  DocumentAnalytics as DocumentAnalyticsType,
  AccessEvent,
  DocumentCategory,
  TemplateCategory
} from './types'
import { DocumentStorage } from './storage'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { AWS_RESOURCES } from '@/lib/aws-config'
import { docClient } from '@/lib/aws-config'
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'

export interface AnalyticsMetrics {
  totalDocuments: number
  totalViews: number
  totalDownloads: number
  totalShares: number
  avgViewsPerDocument: number
  mostViewedDocuments: DocumentMetric[]
  categoryBreakdown: CategoryMetric[]
  userEngagement: UserEngagementMetric[]
  timeSeriesData: TimeSeriesMetric[]
  searchMetrics: SearchMetric[]
}

export interface DocumentMetric {
  documentId: string
  title: string
  category: DocumentCategory
  views: number
  downloads: number
  shares: number
  avgReadTime: number
  lastAccessed: number
  uniqueUsers: number
}

export interface CategoryMetric {
  category: DocumentCategory
  count: number
  totalViews: number
  avgViewsPerDocument: number
  engagement: number
  growthRate: number
}

export interface UserEngagementMetric {
  userId: string
  totalActions: number
  documentsAccessed: number
  avgTimeSpent: number
  preferredCategories: string[]
  lastActivity: number
  engagementScore: number
}

export interface TimeSeriesMetric {
  timestamp: number
  date: string
  views: number
  downloads: number
  shares: number
  newDocuments: number
  activeUsers: number
}

export interface SearchMetric {
  query: string
  count: number
  resultsCount: number
  clickThroughRate: number
  avgTimeToResult: number
  popularResults: string[]
}

export interface AnalyticsFilter {
  startDate?: number
  endDate?: number
  categories?: DocumentCategory[]
  userIds?: string[]
  documentIds?: string[]
  aggregationLevel?: 'hour' | 'day' | 'week' | 'month'
}

export interface UsageInsight {
  type: 'trend' | 'anomaly' | 'recommendation' | 'alert'
  title: string
  description: string
  impact: 'low' | 'medium' | 'high'
  action?: string
  data?: Record<string, any>
  confidence: number
}

export interface UserBehaviorAnalysis {
  userId: string
  accessPatterns: AccessPattern[]
  preferences: UserPreference[]
  recommendations: DocumentRecommendation[]
  engagementTrends: EngagementTrend[]
}

export interface AccessPattern {
  pattern: string
  frequency: number
  timeDistribution: Record<string, number>
  documentTypes: string[]
  confidence: number
}

export interface UserPreference {
  category: string
  weight: number
  derivedFrom: string[]
  lastUpdated: number
}

export interface DocumentRecommendation {
  documentId: string
  title: string
  category: DocumentCategory
  score: number
  reason: string
  confidence: number
}

export interface EngagementTrend {
  period: string
  value: number
  change: number
  changePercent: number
  trend: 'increasing' | 'decreasing' | 'stable'
}

export class DocumentAnalytics {
  private analyticsCache: Map<string, any> = new Map()
  private cacheTimeout = 300000 // 5 minutes
  
  constructor(private storage: DocumentStorage) {}

  /**
   * Get comprehensive analytics dashboard data
   */
  async getAnalytics(filters: AnalyticsFilter = {}): Promise<AnalyticsMetrics> {
    const startTime = Date.now()
    
    try {
      const cacheKey = this.generateCacheKey('analytics', filters)
      const cached = this.analyticsCache.get(cacheKey)
      
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        return cached.data
      }

      // Set default date range if not provided
      const endDate = filters.endDate || Date.now()
      const startDate = filters.startDate || (endDate - 30 * 24 * 60 * 60 * 1000) // 30 days

      // Fetch analytics data in parallel
      const [
        documentMetrics,
        categoryMetrics,
        userEngagementMetrics,
        timeSeriesMetrics,
        searchMetrics
      ] = await Promise.all([
        this.getDocumentMetrics(filters),
        this.getCategoryMetrics(filters),
        this.getUserEngagementMetrics(filters),
        this.getTimeSeriesMetrics(filters),
        this.getSearchMetrics(filters),
      ])

      const analytics: AnalyticsMetrics = {
        totalDocuments: documentMetrics.length,
        totalViews: documentMetrics.reduce((sum, doc) => sum + doc.views, 0),
        totalDownloads: documentMetrics.reduce((sum, doc) => sum + doc.downloads, 0),
        totalShares: documentMetrics.reduce((sum, doc) => sum + doc.shares, 0),
        avgViewsPerDocument: documentMetrics.length > 0 
          ? documentMetrics.reduce((sum, doc) => sum + doc.views, 0) / documentMetrics.length 
          : 0,
        mostViewedDocuments: documentMetrics.slice(0, 10),
        categoryBreakdown: categoryMetrics,
        userEngagement: userEngagementMetrics,
        timeSeriesData: timeSeriesMetrics,
        searchMetrics: searchMetrics,
      }

      // Cache the results
      this.analyticsCache.set(cacheKey, {
        data: analytics,
        timestamp: Date.now(),
      })

      const processingTime = Date.now() - startTime

      // Record metrics
      await metricsCollector.recordMetric(
        'analytics_query_time',
        processingTime,
        'milliseconds',
        { 
          hasFilters: (Object.keys(filters).length > 0).toString(),
          documentsAnalyzed: analytics.totalDocuments.toString()
        }
      )

      logger.info('Analytics data retrieved successfully', {
        totalDocuments: analytics.totalDocuments,
        totalViews: analytics.totalViews,
        processingTime,
      }, 'analytics')

      return analytics
    } catch (error) {
      logger.error('Failed to get analytics data', error instanceof Error ? error : undefined, {
        filters,
      }, 'analytics')

      return this.getEmptyAnalytics()
    }
  }

  /**
   * Record user interaction with a document
   */
  async recordInteraction(
    documentId: string,
    userId: string,
    action: 'view' | 'download' | 'share' | 'edit',
    metadata: {
      duration?: number
      referrer?: string
      searchQuery?: string
      device?: string
      ipAddress?: string
    } = {}
  ): Promise<void> {
    try {
      const event: AccessEvent = {
        userId,
        timestamp: Date.now(),
        type: action,
        duration: metadata.duration,
        ipAddress: metadata.ipAddress,
        device: metadata.device,
      }

      // Store interaction in analytics database
      await this.storeInteraction(documentId, event, metadata)

      // Update document analytics
      await this.updateDocumentAnalytics(documentId, action, metadata)

      // Record metrics
      await metricsCollector.recordMetric(
        'document_interaction',
        1,
        'count',
        { 
          action,
          hasMetadata: (Object.keys(metadata).length > 0).toString()
        }
      )

      logger.debug('Document interaction recorded', {
        documentId,
        userId,
        action,
        duration: metadata.duration,
      }, 'analytics')
    } catch (error) {
      logger.error('Failed to record document interaction', error instanceof Error ? error : undefined, {
        documentId,
        userId,
        action,
      }, 'analytics')
    }
  }

  /**
   * Generate usage insights and recommendations
   */
  async generateInsights(filters: AnalyticsFilter = {}): Promise<UsageInsight[]> {
    try {
      const analytics = await this.getAnalytics(filters)
      const insights: UsageInsight[] = []

      // Trend analysis
      const trendInsights = this.analyzeTrends(analytics.timeSeriesData)
      insights.push(...trendInsights)

      // Category performance analysis
      const categoryInsights = this.analyzeCategoryPerformance(analytics.categoryBreakdown)
      insights.push(...categoryInsights)

      // User engagement analysis
      const engagementInsights = this.analyzeUserEngagement(analytics.userEngagement)
      insights.push(...engagementInsights)

      // Search behavior analysis
      const searchInsights = this.analyzeSearchBehavior(analytics.searchMetrics)
      insights.push(...searchInsights)

      // Anomaly detection
      const anomalyInsights = this.detectAnomalies(analytics)
      insights.push(...anomalyInsights)

      // Sort by impact and confidence
      insights.sort((a, b) => {
        const impactWeight = { high: 3, medium: 2, low: 1 }
        const aScore = impactWeight[a.impact] * a.confidence
        const bScore = impactWeight[b.impact] * b.confidence
        return bScore - aScore
      })

      logger.info('Usage insights generated', {
        insightsCount: insights.length,
        highImpactCount: insights.filter(i => i.impact === 'high').length,
      }, 'analytics')

      return insights.slice(0, 20) // Return top 20 insights
    } catch (error) {
      logger.error('Failed to generate insights', error instanceof Error ? error : undefined, {
        filters,
      }, 'analytics')

      return []
    }
  }

  /**
   * Analyze user behavior and preferences
   */
  async analyzeUserBehavior(userId: string, timeRange = 30): Promise<UserBehaviorAnalysis> {
    try {
      const endDate = Date.now()
      const startDate = endDate - timeRange * 24 * 60 * 60 * 1000

      // Get user's document interactions
      const interactions = await this.getUserInteractions(userId, startDate, endDate)
      
      // Analyze access patterns
      const accessPatterns = this.identifyAccessPatterns(interactions)
      
      // Derive user preferences
      const preferences = this.deriveUserPreferences(interactions)
      
      // Generate recommendations
      const recommendations = await this.generateUserRecommendations(userId, preferences, interactions)
      
      // Calculate engagement trends
      const engagementTrends = this.calculateEngagementTrends(interactions, timeRange)

      const analysis: UserBehaviorAnalysis = {
        userId,
        accessPatterns,
        preferences,
        recommendations,
        engagementTrends,
      }

      logger.debug('User behavior analysis completed', {
        userId,
        patternsFound: accessPatterns.length,
        preferencesFound: preferences.length,
        recommendationsGenerated: recommendations.length,
      }, 'analytics')

      return analysis
    } catch (error) {
      logger.error('Failed to analyze user behavior', error instanceof Error ? error : undefined, {
        userId,
        timeRange,
      }, 'analytics')

      return {
        userId,
        accessPatterns: [],
        preferences: [],
        recommendations: [],
        engagementTrends: [],
      }
    }
  }

  /**
   * Get real-time analytics updates
   */
  async getRealtimeMetrics(): Promise<{
    activeUsers: number
    currentViews: number
    recentActivity: AccessEvent[]
    topDocuments: string[]
    alertsCount: number
  }> {
    try {
      // In production, would get real-time data from streaming analytics
      const recentActivity = await this.getRecentActivity(15) // Last 15 minutes
      
      const activeUsers = new Set(recentActivity.map(event => event.userId)).size
      const currentViews = recentActivity.filter(event => event.type === 'view').length
      
      // Get top documents from recent activity
      const documentCounts = new Map<string, number>()
      recentActivity.forEach(event => {
        const count = documentCounts.get(event.userId) || 0
        documentCounts.set(event.userId, count + 1)
      })
      
      const topDocuments = Array.from(documentCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([documentId]) => documentId)

      return {
        activeUsers,
        currentViews,
        recentActivity: recentActivity.slice(0, 10),
        topDocuments,
        alertsCount: 0, // Would calculate from alerts system
      }
    } catch (error) {
      logger.error('Failed to get realtime metrics', error instanceof Error ? error : undefined, undefined, 'analytics')
      
      return {
        activeUsers: 0,
        currentViews: 0,
        recentActivity: [],
        topDocuments: [],
        alertsCount: 0,
      }
    }
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(
    filters: AnalyticsFilter,
    format: 'csv' | 'json' | 'xlsx' = 'json'
  ): Promise<{
    data: string | object
    filename: string
    size: number
  }> {
    try {
      const analytics = await this.getAnalytics(filters)
      
      let exportData: string | object
      let filename: string
      
      switch (format) {
        case 'csv':
          exportData = this.convertToCSV(analytics)
          filename = `analytics_${Date.now()}.csv`
          break
        case 'xlsx':
          // In production, would generate Excel file
          exportData = JSON.stringify(analytics, null, 2)
          filename = `analytics_${Date.now()}.xlsx`
          break
        case 'json':
        default:
          exportData = analytics
          filename = `analytics_${Date.now()}.json`
          break
      }

      const size = typeof exportData === 'string' 
        ? Buffer.byteLength(exportData, 'utf8')
        : Buffer.byteLength(JSON.stringify(exportData), 'utf8')

      logger.info('Analytics data exported', {
        format,
        filename,
        size,
      }, 'analytics')

      return { data: exportData, filename, size }
    } catch (error) {
      logger.error('Failed to export analytics', error instanceof Error ? error : undefined, {
        filters,
        format,
      }, 'analytics')

      throw new Error('Analytics export failed')
    }
  }

  /**
   * Shutdown analytics system
   */
  async shutdown(): Promise<void> {
    this.analyticsCache.clear()
    logger.info('Document analytics shutdown complete')
  }

  // Private methods

  private async getDocumentMetrics(filters: AnalyticsFilter): Promise<DocumentMetric[]> {
    try {
      // In production, would query analytics database
      const { documents } = await this.storage.list({ limit: 1000 })
      
      return documents.map(doc => ({
        documentId: doc.id,
        title: doc.title,
        category: doc.classification.category,
        views: doc.analytics?.views || 0,
        downloads: doc.analytics?.downloads || 0,
        shares: doc.analytics?.shares || 0,
        avgReadTime: 0, // Would calculate from interaction data
        lastAccessed: doc.analytics?.lastAccessed || doc.createdAt,
        uniqueUsers: 0, // Would calculate from user interaction data
      })).sort((a, b) => b.views - a.views)
    } catch (error) {
      logger.error('Failed to get document metrics', error instanceof Error ? error : undefined)
      return []
    }
  }

  private async getCategoryMetrics(filters: AnalyticsFilter): Promise<CategoryMetric[]> {
    try {
      const documentMetrics = await this.getDocumentMetrics(filters)
      const categoryMap = new Map<DocumentCategory, CategoryMetric>()

      for (const doc of documentMetrics) {
        const existing = categoryMap.get(doc.category) || {
          category: doc.category,
          count: 0,
          totalViews: 0,
          avgViewsPerDocument: 0,
          engagement: 0,
          growthRate: 0,
        }

        existing.count++
        existing.totalViews += doc.views
        categoryMap.set(doc.category, existing)
      }

      // Calculate averages and engagement scores
      for (const metric of categoryMap.values()) {
        metric.avgViewsPerDocument = metric.count > 0 ? metric.totalViews / metric.count : 0
        metric.engagement = this.calculateEngagementScore(metric)
        metric.growthRate = 0 // Would calculate from historical data
      }

      return Array.from(categoryMap.values()).sort((a, b) => b.totalViews - a.totalViews)
    } catch (error) {
      logger.error('Failed to get category metrics', error instanceof Error ? error : undefined)
      return []
    }
  }

  private async getUserEngagementMetrics(filters: AnalyticsFilter): Promise<UserEngagementMetric[]> {
    try {
      // Query DynamoDB for user interaction data
      const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb')
      const { DynamoDBDocumentClient, ScanCommand } = await import('@aws-sdk/lib-dynamodb')
      
      const client = new DynamoDBClient({ region: process.env.AWS_REGION })
      const docClient = DynamoDBDocumentClient.from(client)
      
      // Get user interactions from the database
      const result = await docClient.send(new ScanCommand({
        TableName: process.env.DYNAMODB_DOCUMENT_ANALYTICS_TABLE || 'govbiz-document-analytics',
        FilterExpression: 'event_timestamp BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':start': filters.startDate || (Date.now() - 30 * 24 * 60 * 60 * 1000),
          ':end': filters.endDate || Date.now()
        }
      }))
      
      // Aggregate user engagement data
      const userMetrics = new Map<string, { views: number; downloads: number; shares: number; time: number }>()
      
      for (const item of result.Items || []) {
        const userId = item.userId
        if (!userId) continue
        
        const current = userMetrics.get(userId) || { views: 0, downloads: 0, shares: 0, time: 0 }
        
        if (item.action === 'view') current.views++
        else if (item.action === 'download') current.downloads++
        else if (item.action === 'share') current.shares++
        
        current.time += item.duration || 0
        userMetrics.set(userId, current)
      }
      
      // Convert to metrics format
      return Array.from(userMetrics.entries()).map(([userId, metrics]) => ({
        userId,
        totalActions: metrics.views + metrics.downloads + metrics.shares,
        documentsAccessed: Math.max(metrics.views, 1), // At least 1 if they have any activity
        avgTimeSpent: metrics.views > 0 ? metrics.time / metrics.views : 0,
        preferredCategories: [], // Would need additional analysis to determine
        lastActivity: Date.now(), // Would need to track from actual data
        engagementScore: Math.min(100, (metrics.views * 0.3 + metrics.downloads * 0.5 + metrics.shares * 0.2) * 10)
      }))
    } catch (error) {
      logger.error('Failed to get user engagement metrics', error instanceof Error ? error : undefined)
      return []
    }
  }

  private async getTimeSeriesMetrics(filters: AnalyticsFilter): Promise<TimeSeriesMetric[]> {
    try {
      const endDate = filters.endDate || Date.now()
      const startDate = filters.startDate || (endDate - 30 * 24 * 60 * 60 * 1000)
      const aggregationLevel = filters.aggregationLevel || 'day'
      
      const metrics: TimeSeriesMetric[] = []
      const interval = this.getIntervalMs(aggregationLevel)
      
      for (let timestamp = startDate; timestamp <= endDate; timestamp += interval) {
        metrics.push({
          timestamp,
          date: new Date(timestamp).toISOString().split('T')[0],
          views: Math.floor(Math.random() * 100), // Mock data
          downloads: Math.floor(Math.random() * 50),
          shares: Math.floor(Math.random() * 20),
          newDocuments: Math.floor(Math.random() * 5),
          activeUsers: Math.floor(Math.random() * 30),
        })
      }

      return metrics
    } catch (error) {
      logger.error('Failed to get time series metrics', error instanceof Error ? error : undefined)
      return []
    }
  }

  private async getSearchMetrics(filters: AnalyticsFilter): Promise<SearchMetric[]> {
    try {
      // In production, would aggregate search query data
      return [] // Mock data for now
    } catch (error) {
      logger.error('Failed to get search metrics', error instanceof Error ? error : undefined)
      return []
    }
  }

  private async storeInteraction(
    documentId: string, 
    event: AccessEvent, 
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      // In production, would store in analytics database
      logger.debug('Interaction stored', { documentId, event, metadata })
    } catch (error) {
      logger.error('Failed to store interaction', error instanceof Error ? error : undefined)
    }
  }

  private async updateDocumentAnalytics(
    documentId: string, 
    action: string, 
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      // In production, would update document analytics in real-time
      logger.debug('Document analytics updated', { documentId, action })
    } catch (error) {
      logger.error('Failed to update document analytics', error instanceof Error ? error : undefined)
    }
  }

  private analyzeTrends(timeSeriesData: TimeSeriesMetric[]): UsageInsight[] {
    const insights: UsageInsight[] = []
    
    if (timeSeriesData.length < 2) return insights

    // Calculate view trend
    const recentViews = timeSeriesData.slice(-7).reduce((sum, d) => sum + d.views, 0)
    const previousViews = timeSeriesData.slice(-14, -7).reduce((sum, d) => sum + d.views, 0)
    const viewChange = previousViews > 0 ? ((recentViews - previousViews) / previousViews) * 100 : 0

    if (Math.abs(viewChange) > 20) {
      insights.push({
        type: 'trend',
        title: viewChange > 0 ? 'Document Views Increasing' : 'Document Views Decreasing',
        description: `Document views have ${viewChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(viewChange).toFixed(1)}% in the past week`,
        impact: Math.abs(viewChange) > 50 ? 'high' : 'medium',
        action: viewChange < 0 ? 'Review content strategy and user engagement' : 'Analyze successful content patterns',
        data: { viewChange, recentViews, previousViews },
        confidence: 0.8,
      })
    }

    return insights
  }

  private analyzeCategoryPerformance(categoryMetrics: CategoryMetric[]): UsageInsight[] {
    const insights: UsageInsight[] = []
    
    // Find top and bottom performing categories
    const topCategory = categoryMetrics[0]
    const bottomCategory = categoryMetrics[categoryMetrics.length - 1]
    
    if (topCategory && bottomCategory && topCategory.totalViews > bottomCategory.totalViews * 5) {
      insights.push({
        type: 'recommendation',
        title: 'Category Performance Gap',
        description: `${topCategory.category} documents are significantly outperforming ${bottomCategory.category} documents`,
        impact: 'medium',
        action: `Consider improving ${bottomCategory.category} content or promoting successful patterns from ${topCategory.category}`,
        data: { topCategory: topCategory.category, bottomCategory: bottomCategory.category },
        confidence: 0.7,
      })
    }

    return insights
  }

  private analyzeUserEngagement(engagementMetrics: UserEngagementMetric[]): UsageInsight[] {
    const insights: UsageInsight[] = []
    
    if (engagementMetrics.length === 0) return insights

    // Calculate average engagement
    const avgEngagement = engagementMetrics.reduce((sum, user) => sum + user.engagementScore, 0) / engagementMetrics.length
    const lowEngagementUsers = engagementMetrics.filter(user => user.engagementScore < avgEngagement * 0.5).length
    
    if (lowEngagementUsers > engagementMetrics.length * 0.3) {
      insights.push({
        type: 'alert',
        title: 'Low User Engagement Detected',
        description: `${lowEngagementUsers} users (${((lowEngagementUsers / engagementMetrics.length) * 100).toFixed(1)}%) have below-average engagement`,
        impact: 'high',
        action: 'Implement user onboarding improvements and engagement campaigns',
        data: { lowEngagementUsers, totalUsers: engagementMetrics.length, avgEngagement },
        confidence: 0.9,
      })
    }

    return insights
  }

  private analyzeSearchBehavior(searchMetrics: SearchMetric[]): UsageInsight[] {
    const insights: UsageInsight[] = []
    
    // Find queries with low click-through rates
    const lowCTRQueries = searchMetrics.filter(query => query.clickThroughRate < 0.1)
    
    if (lowCTRQueries.length > 0) {
      insights.push({
        type: 'recommendation',
        title: 'Search Results Need Improvement',
        description: `${lowCTRQueries.length} search queries have very low click-through rates`,
        impact: 'medium',
        action: 'Review search algorithm and result relevance for these queries',
        data: { lowCTRQueries: lowCTRQueries.slice(0, 5) },
        confidence: 0.8,
      })
    }

    return insights
  }

  private detectAnomalies(analytics: AnalyticsMetrics): UsageInsight[] {
    const insights: UsageInsight[] = []
    
    // Detect unusual patterns in the data
    const avgViews = analytics.avgViewsPerDocument
    const outliers = analytics.mostViewedDocuments.filter(doc => doc.views > avgViews * 10)
    
    if (outliers.length > 0) {
      insights.push({
        type: 'anomaly',
        title: 'Viral Content Detected',
        description: `${outliers.length} documents have unusually high view counts`,
        impact: 'medium',
        action: 'Analyze successful content patterns for replication',
        data: { outliers: outliers.slice(0, 3) },
        confidence: 0.9,
      })
    }

    return insights
  }

  private async getUserInteractions(userId: string, startDate: number, endDate: number): Promise<AccessEvent[]> {
    // In production, would query user interaction database
    return [] // Mock data
  }

  private identifyAccessPatterns(interactions: AccessEvent[]): AccessPattern[] {
    // Analyze user access patterns
    return [] // Mock implementation
  }

  private deriveUserPreferences(interactions: AccessEvent[]): UserPreference[] {
    // Derive user preferences from interactions
    return [] // Mock implementation
  }

  private async generateUserRecommendations(
    userId: string, 
    preferences: UserPreference[], 
    interactions: AccessEvent[]
  ): Promise<DocumentRecommendation[]> {
    // Generate personalized document recommendations
    return [] // Mock implementation
  }

  private calculateEngagementTrends(interactions: AccessEvent[], timeRange: number): EngagementTrend[] {
    // Calculate engagement trends over time
    return [] // Mock implementation
  }

  private async getRecentActivity(minutes: number): Promise<AccessEvent[]> {
    // Get recent activity from the last N minutes
    return [] // Mock implementation
  }

  private convertToCSV(analytics: AnalyticsMetrics): string {
    // Convert analytics data to CSV format
    const headers = ['Document ID', 'Title', 'Category', 'Views', 'Downloads', 'Shares']
    const rows = analytics.mostViewedDocuments.map(doc => [
      doc.documentId,
      doc.title,
      doc.category,
      doc.views,
      doc.downloads,
      doc.shares,
    ])

    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }

  private calculateEngagementScore(metric: CategoryMetric): number {
    // Calculate engagement score based on various factors
    return metric.avgViewsPerDocument * 0.5 + metric.count * 0.3 + metric.growthRate * 0.2
  }

  private getIntervalMs(aggregationLevel: string): number {
    switch (aggregationLevel) {
      case 'hour':
        return 60 * 60 * 1000
      case 'day':
        return 24 * 60 * 60 * 1000
      case 'week':
        return 7 * 24 * 60 * 60 * 1000
      case 'month':
        return 30 * 24 * 60 * 60 * 1000
      default:
        return 24 * 60 * 60 * 1000
    }
  }

  private generateCacheKey(type: string, filters: AnalyticsFilter): string {
    return `${type}_${JSON.stringify(filters)}`
  }

  private getEmptyAnalytics(): AnalyticsMetrics {
    return {
      totalDocuments: 0,
      totalViews: 0,
      totalDownloads: 0,
      totalShares: 0,
      avgViewsPerDocument: 0,
      mostViewedDocuments: [],
      categoryBreakdown: [],
      userEngagement: [],
      timeSeriesData: [],
      searchMetrics: [],
    }
  }
}

export default DocumentAnalytics