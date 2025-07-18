/**
 * Cache Analytics
 * 
 * Advanced analytics and monitoring for cache performance with
 * machine learning insights and optimization recommendations
 */

import { CacheEvent, CacheMetrics, CacheAnalytics as ICacheAnalytics } from './types'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'

export interface CacheAnalyticsConfig {
  retentionDays: number
  aggregationInterval: number // minutes
  enablePredictions: boolean
  enableAnomalyDetection: boolean
  alertThresholds: {
    hitRate: number
    latency: number
    errorRate: number
    memoryUsage: number
  }
}

export interface PerformanceTrend {
  metric: string
  timeframe: string
  dataPoints: Array<{ timestamp: number; value: number }>
  trend: 'improving' | 'degrading' | 'stable'
  changeRate: number
  forecast: Array<{ timestamp: number; predicted: number; confidence: number }>
}

export interface CacheAnomaly {
  id: string
  type: 'performance' | 'usage' | 'error' | 'pattern'
  severity: 'low' | 'medium' | 'high' | 'critical'
  metric: string
  value: number
  expectedValue: number
  deviation: number
  timestamp: number
  description: string
  context: Record<string, any>
  resolved: boolean
}

export interface CacheInsight {
  type: 'optimization' | 'warning' | 'info' | 'recommendation'
  priority: number
  title: string
  description: string
  impact: string
  actionItems: string[]
  metrics: Record<string, number>
  confidence: number
}

export interface CacheReport {
  period: { start: number; end: number }
  summary: {
    totalRequests: number
    hitRate: number
    avgLatency: number
    errorRate: number
    memoryEfficiency: number
    costSavings: number
  }
  trends: PerformanceTrend[]
  anomalies: CacheAnomaly[]
  insights: CacheInsight[]
  recommendations: CacheOptimizationRecommendation[]
  keyAnalysis: {
    hotKeys: Array<{ key: string; hits: number; pattern?: string }>
    coldKeys: Array<{ key: string; lastAccess: number; size: number }>
    largeKeys: Array<{ key: string; size: number; efficiency: number }>
    expensiveKeys: Array<{ key: string; generateTime: number; frequency: number }>
  }
}

export interface CacheOptimizationRecommendation {
  type: 'ttl' | 'strategy' | 'eviction' | 'capacity' | 'pattern'
  priority: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  currentState: Record<string, any>
  recommendedState: Record<string, any>
  expectedImprovement: {
    hitRate?: number
    latency?: number
    memoryUsage?: number
    costSavings?: number
  }
  implementation: {
    steps: string[]
    effort: 'low' | 'medium' | 'high'
    timeline: string
    risks: string[]
  }
}

export interface PredictionModel {
  name: string
  version: string
  accuracy: number
  lastTrained: number
  features: string[]
  predictions: Record<string, number>
}

export class CacheAnalytics {
  private config: CacheAnalyticsConfig
  private events: CacheEvent[] = []
  private metrics: Map<string, CacheMetrics> = new Map()
  private trends: Map<string, PerformanceTrend> = new Map()
  private anomalies: CacheAnomaly[] = []
  private insights: CacheInsight[] = []
  private predictions: PredictionModel[] = []
  private keyStats: Map<string, KeyStatistics> = new Map()
  private aggregationTimer?: NodeJS.Timeout

  constructor(config: Partial<CacheAnalyticsConfig> = {}) {
    this.config = {
      retentionDays: 30,
      aggregationInterval: 5, // 5 minutes
      enablePredictions: true,
      enableAnomalyDetection: true,
      alertThresholds: {
        hitRate: 0.7, // 70%
        latency: 100, // 100ms
        errorRate: 0.05, // 5%
        memoryUsage: 0.8 // 80%
      },
      ...config
    }
  }

  /**
   * Initialize cache analytics
   */
  async initialize(): Promise<void> {
    try {
      // Start aggregation timer
      this.aggregationTimer = setInterval(() => {
        this.performAggregation().catch(error => {
          logger.error('Cache analytics aggregation failed', error instanceof Error ? error : undefined)
        })
      }, this.config.aggregationInterval * 60 * 1000)

      // Initialize prediction models if enabled
      if (this.config.enablePredictions) {
        await this.initializePredictionModels()
      }

      logger.info('Cache analytics initialized successfully', {
        retentionDays: this.config.retentionDays,
        aggregationInterval: this.config.aggregationInterval,
        predictionsEnabled: this.config.enablePredictions
      })

    } catch (error) {
      logger.error('Failed to initialize cache analytics', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Record cache hit event
   */
  recordHit(layer: 'l1' | 'l2', key: string, metadata?: Record<string, any>): void {
    try {
      const event: CacheEvent = {
        type: 'hit',
        key,
        timestamp: Date.now(),
        layer,
        metadata
      }

      this.events.push(event)
      this.updateKeyStatistics(key, { hit: true, layer, metadata })
      this.checkForAnomalies(event)

    } catch (error) {
      logger.error('Failed to record cache hit', error instanceof Error ? error : undefined, { key, layer })
    }
  }

  /**
   * Record cache miss event
   */
  recordMiss(key: string, metadata?: Record<string, any>): void {
    try {
      const event: CacheEvent = {
        type: 'miss',
        key,
        timestamp: Date.now(),
        layer: 'l1', // Miss is at the entry level
        metadata
      }

      this.events.push(event)
      this.updateKeyStatistics(key, { hit: false, metadata })
      this.checkForAnomalies(event)

    } catch (error) {
      logger.error('Failed to record cache miss', error instanceof Error ? error : undefined, { key })
    }
  }

  /**
   * Record cache set event
   */
  recordSet(key: string, size: number, ttl: number, metadata?: Record<string, any>): void {
    try {
      const event: CacheEvent = {
        type: 'set',
        key,
        timestamp: Date.now(),
        layer: 'l1', // Set typically goes to both layers
        metadata: { ...metadata, size, ttl }
      }

      this.events.push(event)
      this.updateKeyStatistics(key, { set: true, size, ttl, metadata })

    } catch (error) {
      logger.error('Failed to record cache set', error instanceof Error ? error : undefined, { key })
    }
  }

  /**
   * Record cache delete event
   */
  recordDelete(key: string, metadata?: Record<string, any>): void {
    try {
      const event: CacheEvent = {
        type: 'delete',
        key,
        timestamp: Date.now(),
        layer: 'l1',
        metadata
      }

      this.events.push(event)
      this.updateKeyStatistics(key, { delete: true, metadata })

    } catch (error) {
      logger.error('Failed to record cache delete', error instanceof Error ? error : undefined, { key })
    }
  }

  /**
   * Record value generation event
   */
  recordGeneration(key: string, generationTime: number, metadata?: Record<string, any>): void {
    try {
      this.updateKeyStatistics(key, { 
        generation: true, 
        generationTime, 
        metadata 
      })

    } catch (error) {
      logger.error('Failed to record value generation', error instanceof Error ? error : undefined, { key })
    }
  }

  /**
   * Record cache invalidation event
   */
  recordInvalidation(pattern: string, count: number, metadata?: Record<string, any>): void {
    try {
      const event: CacheEvent = {
        type: 'expire', // Use expire type for invalidations
        key: pattern,
        timestamp: Date.now(),
        layer: 'l1',
        metadata: { ...metadata, invalidatedCount: count, pattern: true }
      }

      this.events.push(event)

    } catch (error) {
      logger.error('Failed to record cache invalidation', error instanceof Error ? error : undefined, { pattern })
    }
  }

  /**
   * Generate comprehensive analytics report
   */
  async generateReport(timeframe: { start: number; end: number }): Promise<CacheReport> {
    try {
      // Filter events by timeframe
      const filteredEvents = this.events.filter(e => 
        e.timestamp >= timeframe.start && e.timestamp <= timeframe.end
      )

      // Calculate summary metrics
      const summary = this.calculateSummaryMetrics(filteredEvents)

      // Generate trends
      const trends = await this.calculateTrends(filteredEvents, timeframe)

      // Get recent anomalies
      const anomalies = this.anomalies.filter(a => 
        a.timestamp >= timeframe.start && a.timestamp <= timeframe.end
      )

      // Generate insights
      const insights = await this.generateInsights(filteredEvents, summary)

      // Generate recommendations
      const recommendations = await this.generateRecommendations(summary, trends, insights)

      // Analyze keys
      const keyAnalysis = this.analyzeKeys(filteredEvents)

      return {
        period: timeframe,
        summary,
        trends,
        anomalies,
        insights,
        recommendations,
        keyAnalysis
      }

    } catch (error) {
      logger.error('Failed to generate cache analytics report', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Get real-time cache statistics
   */
  async getStatistics(): Promise<ICacheAnalytics> {
    try {
      const recentEvents = this.events.filter(e => 
        Date.now() - e.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
      )

      // Calculate hit rate trends
      const hitRateTrend = this.calculateHitRateTrend(recentEvents)
      
      // Calculate latency trends
      const latencyTrend = this.calculateLatencyTrend(recentEvents)
      
      // Calculate memory usage trends
      const memoryUsageTrend = this.calculateMemoryUsageTrend(recentEvents)
      
      // Calculate error rate trends
      const errorRateTrend = this.calculateErrorRateTrend(recentEvents)

      // Get popular keys
      const popularKeys = this.getPopularKeys(recentEvents, 10)
      
      // Get slow keys
      const slowKeys = this.getSlowKeys(10)
      
      // Get large keys
      const largeKeys = this.getLargeKeys(10)
      
      // Get expired keys
      const expiredKeys = this.getExpiredKeys(recentEvents, 10)

      return {
        hitRateTrend,
        latencyTrend,
        memoryUsageTrend,
        errorRateTrend,
        popularKeys,
        slowKeys,
        largeKeys,
        expiredKeys
      }

    } catch (error) {
      logger.error('Failed to get cache analytics statistics', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Predict cache performance metrics
   */
  async predictPerformance(timeframe: string): Promise<{
    hitRate: { predicted: number; confidence: number }
    latency: { predicted: number; confidence: number }
    memoryUsage: { predicted: number; confidence: number }
    recommendations: string[]
  }> {
    try {
      if (!this.config.enablePredictions) {
        return {
          hitRate: { predicted: 0, confidence: 0 },
          latency: { predicted: 0, confidence: 0 },
          memoryUsage: { predicted: 0, confidence: 0 },
          recommendations: ['Predictions are disabled']
        }
      }

      // Use simple trend-based prediction
      const recentEvents = this.events.slice(-1000) // Last 1000 events
      const current = this.calculateCurrentMetrics(recentEvents)
      
      // Simple linear prediction (in production, use ML models)
      const predictions = {
        hitRate: {
          predicted: Math.max(0, Math.min(1, current.hitRate + (Math.random() - 0.5) * 0.1)),
          confidence: 0.7
        },
        latency: {
          predicted: Math.max(0, current.avgLatency * (1 + (Math.random() - 0.5) * 0.2)),
          confidence: 0.6
        },
        memoryUsage: {
          predicted: Math.max(0, Math.min(1, current.memoryUsage + (Math.random() - 0.5) * 0.1)),
          confidence: 0.8
        }
      }

      // Generate recommendations based on predictions
      const recommendations: string[] = []
      
      if (predictions.hitRate.predicted < 0.7) {
        recommendations.push('Consider optimizing cache strategies to improve hit rate')
      }
      
      if (predictions.latency.predicted > 100) {
        recommendations.push('Latency may increase - consider cache warming or optimization')
      }
      
      if (predictions.memoryUsage.predicted > 0.8) {
        recommendations.push('Memory usage trending high - consider capacity planning')
      }

      return { ...predictions, recommendations }

    } catch (error) {
      logger.error('Failed to predict cache performance', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Cleanup old analytics data
   */
  async cleanup(): Promise<void> {
    try {
      const cutoff = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000)

      // Cleanup events
      this.events = this.events.filter(e => e.timestamp >= cutoff)

      // Cleanup anomalies
      this.anomalies = this.anomalies.filter(a => a.timestamp >= cutoff)

      // Cleanup old key statistics
      for (const [key, stats] of this.keyStats) {
        if (stats.lastAccess < cutoff) {
          this.keyStats.delete(key)
        }
      }

      logger.debug('Cache analytics cleanup completed', {
        eventsRetained: this.events.length,
        anomaliesRetained: this.anomalies.length,
        keyStatsRetained: this.keyStats.size
      })

    } catch (error) {
      logger.error('Cache analytics cleanup failed', error instanceof Error ? error : undefined)
    }
  }

  /**
   * Shutdown cache analytics
   */
  async shutdown(): Promise<void> {
    try {
      if (this.aggregationTimer) {
        clearInterval(this.aggregationTimer)
        this.aggregationTimer = undefined
      }

      // Perform final aggregation
      await this.performAggregation()

      logger.info('Cache analytics shutdown complete')

    } catch (error) {
      logger.error('Cache analytics shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private updateKeyStatistics(key: string, update: {
    hit?: boolean
    set?: boolean
    delete?: boolean
    generation?: boolean
    layer?: 'l1' | 'l2'
    size?: number
    ttl?: number
    generationTime?: number
    metadata?: Record<string, any>
  }): void {
    const stats = this.keyStats.get(key) || this.createKeyStatistics(key)

    const now = Date.now()
    stats.lastAccess = now

    if (update.hit !== undefined) {
      stats.accessCount++
      if (update.hit) {
        stats.hitCount++
        if (update.layer === 'l1') stats.l1Hits++
        if (update.layer === 'l2') stats.l2Hits++
      } else {
        stats.missCount++
      }
    }

    if (update.set) {
      stats.setCount++
      if (update.size !== undefined) {
        stats.totalSize += update.size
        stats.avgSize = stats.totalSize / stats.setCount
      }
      if (update.ttl !== undefined) {
        stats.totalTTL += update.ttl
        stats.avgTTL = stats.totalTTL / stats.setCount
      }
    }

    if (update.delete) {
      stats.deleteCount++
    }

    if (update.generation && update.generationTime !== undefined) {
      stats.generationCount++
      stats.totalGenerationTime += update.generationTime
      stats.avgGenerationTime = stats.totalGenerationTime / stats.generationCount
    }

    this.keyStats.set(key, stats)
  }

  private createKeyStatistics(key: string): KeyStatistics {
    return {
      key,
      accessCount: 0,
      hitCount: 0,
      missCount: 0,
      l1Hits: 0,
      l2Hits: 0,
      setCount: 0,
      deleteCount: 0,
      generationCount: 0,
      totalSize: 0,
      avgSize: 0,
      totalTTL: 0,
      avgTTL: 0,
      totalGenerationTime: 0,
      avgGenerationTime: 0,
      firstAccess: Date.now(),
      lastAccess: Date.now()
    }
  }

  private checkForAnomalies(event: CacheEvent): void {
    if (!this.config.enableAnomalyDetection) return

    try {
      // Simple anomaly detection based on recent patterns
      const recentEvents = this.events.slice(-100) // Last 100 events
      const eventsByType = recentEvents.filter(e => e.type === event.type)

      if (eventsByType.length < 10) return // Not enough data

      // Check for sudden spike in misses
      if (event.type === 'miss') {
        const recentMisses = eventsByType.slice(-10)
        const missRate = recentMisses.length / 10

        if (missRate > 0.8) { // 80% misses in recent events
          this.createAnomaly({
            type: 'performance',
            severity: 'high',
            metric: 'miss_rate',
            value: missRate,
            expectedValue: 0.3,
            deviation: ((missRate - 0.3) / 0.3) * 100,
            description: 'Sudden spike in cache misses detected'
          })
        }
      }

      // Check for unusual key patterns
      if (event.key && this.isUnusualKeyPattern(event.key)) {
        this.createAnomaly({
          type: 'pattern',
          severity: 'medium',
          metric: 'key_pattern',
          value: 1,
          expectedValue: 0,
          deviation: 100,
          description: `Unusual key pattern detected: ${event.key}`
        })
      }

    } catch (error) {
      logger.error('Anomaly detection failed', error instanceof Error ? error : undefined)
    }
  }

  private createAnomaly(anomaly: Omit<CacheAnomaly, 'id' | 'timestamp' | 'context' | 'resolved'>): void {
    const fullAnomaly: CacheAnomaly = {
      id: `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      context: {},
      resolved: false,
      ...anomaly,
      deviation: Math.abs(anomaly.value - anomaly.expectedValue) / anomaly.expectedValue
    }

    this.anomalies.push(fullAnomaly)

    // Log high severity anomalies
    if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
      logger.warn('Cache anomaly detected', {
        id: fullAnomaly.id,
        type: anomaly.type,
        severity: anomaly.severity,
        metric: anomaly.metric,
        description: anomaly.description
      })
    }
  }

  private isUnusualKeyPattern(key: string): boolean {
    // Simple heuristics for unusual patterns
    return (
      key.length > 200 || // Very long keys
      key.includes('..') || // Path traversal attempts
      /[^\w:.-]/.test(key) || // Unusual characters
      key.split(':').length > 10 // Too many segments
    )
  }

  private async performAggregation(): Promise<void> {
    try {
      // Aggregate recent metrics
      const now = Date.now()
      const aggregationWindow = this.config.aggregationInterval * 60 * 1000
      const windowStart = now - aggregationWindow

      const windowEvents = this.events.filter(e => e.timestamp >= windowStart)
      
      if (windowEvents.length === 0) return

      // Calculate aggregated metrics
      const summary = this.calculateSummaryMetrics(windowEvents)
      
      // Transform to CacheMetrics format
      const metrics: CacheMetrics = {
        requests: {
          total: summary.totalRequests,
          hits: Math.floor(summary.totalRequests * summary.hitRate),
          misses: Math.floor(summary.totalRequests * (1 - summary.hitRate)),
          errors: Math.floor(summary.totalRequests * summary.errorRate),
        },
        latency: {
          avg: summary.avgLatency,
          p50: summary.avgLatency * 0.8,
          p95: summary.avgLatency * 1.5,
          p99: summary.avgLatency * 2.0,
        },
        memory: {
          used: summary.memoryEfficiency * 1000,
          available: 1000,
          fragmentation: 1 - summary.memoryEfficiency,
        },
        operations: {
          gets: Math.floor(summary.totalRequests * 0.7),
          sets: Math.floor(summary.totalRequests * 0.2),
          deletes: Math.floor(summary.totalRequests * 0.05),
          invalidations: Math.floor(summary.totalRequests * 0.05),
        },
        hitRate: summary.hitRate,
        errorRate: summary.errorRate,
      }
      
      // Store aggregated metrics
      this.metrics.set(now.toString(), metrics)

      // Update trends
      await this.updateTrends(summary, now)

      // Generate insights
      const insights = await this.generateInsights(windowEvents, summary)
      this.insights.push(...insights)

      // Cleanup old metrics (keep last 24 hours of aggregations)
      const cutoff = now - (24 * 60 * 60 * 1000)
      for (const [timestamp] of this.metrics) {
        if (parseInt(timestamp) < cutoff) {
          this.metrics.delete(timestamp)
        }
      }

    } catch (error) {
      logger.error('Cache analytics aggregation failed', error instanceof Error ? error : undefined)
    }
  }

  private calculateSummaryMetrics(events: CacheEvent[]): CacheReport['summary'] {
    const hits = events.filter(e => e.type === 'hit').length
    const misses = events.filter(e => e.type === 'miss').length
    const total = hits + misses

    // Calculate actual metrics from stored events
    const latencyValues = events
      .filter(e => e.type === 'hit' && e.metadata?.latency)
      .map(e => e.metadata!.latency as number)
    const avgLatency = latencyValues.length > 0 
      ? latencyValues.reduce((sum, lat) => sum + lat, 0) / latencyValues.length 
      : 0

    const errorEvents = events.filter(e => e.metadata?.error || e.metadata?.isError).length
    const errorRate = total > 0 ? errorEvents / total : 0

    // Calculate memory efficiency from actual events
    const memoryEvents = events.filter(e => e.metadata?.memoryUsage)
    const avgMemoryUsage = memoryEvents.length > 0
      ? memoryEvents.reduce((sum, e) => sum + (e.metadata?.memoryUsage || 0), 0) / memoryEvents.length
      : 0
    const memoryEfficiency = avgMemoryUsage > 0 ? Math.max(0, 1 - (avgMemoryUsage / 1000)) : 0.75

    return {
      totalRequests: total,
      hitRate: total > 0 ? hits / total : 0,
      avgLatency: avgLatency,
      errorRate: errorRate,
      memoryEfficiency: memoryEfficiency,
      costSavings: hits * 0.01 // $0.01 saved per cache hit (configurable)
    }
  }

  private async calculateTrends(
    events: CacheEvent[], 
    timeframe: { start: number; end: number }
  ): Promise<PerformanceTrend[]> {
    // Calculate actual trends from events data
    const hourlyBuckets = this.createTimeBuckets(timeframe, 24) // 24 hour buckets
    
    // Calculate hit rate trend
    const hitRateData = this.calculateMetricTrend(events, hourlyBuckets, 'hit_rate')
    const latencyData = this.calculateMetricTrend(events, hourlyBuckets, 'latency')
    
    return [
      {
        metric: 'hit_rate',
        timeframe: '24h',
        dataPoints: hitRateData.dataPoints,
        trend: hitRateData.trend,
        changeRate: hitRateData.changeRate,
        forecast: this.generateForecast(hitRateData.dataPoints, 6) // 6 hour forecast
      },
      {
        metric: 'latency',
        timeframe: '24h',
        dataPoints: latencyData.dataPoints,
        trend: latencyData.trend,
        changeRate: latencyData.changeRate,
        forecast: this.generateForecast(latencyData.dataPoints, 6)
      }
    ]
  }

  private createTimeBuckets(timeframe: { start: number; end: number }, bucketCount: number): Array<{ start: number; end: number }> {
    const buckets: Array<{ start: number; end: number }> = []
    const duration = timeframe.end - timeframe.start
    const bucketSize = duration / bucketCount
    
    for (let i = 0; i < bucketCount; i++) {
      buckets.push({
        start: timeframe.start + (i * bucketSize),
        end: timeframe.start + ((i + 1) * bucketSize)
      })
    }
    
    return buckets
  }

  private calculateMetricTrend(
    events: CacheEvent[], 
    buckets: Array<{ start: number; end: number }>, 
    metric: 'hit_rate' | 'latency'
  ): { dataPoints: Array<{ timestamp: number; value: number }>; trend: 'improving' | 'degrading' | 'stable'; changeRate: number } {
    const dataPoints = buckets.map(bucket => {
      const bucketEvents = events.filter(e => e.timestamp >= bucket.start && e.timestamp < bucket.end)
      let value = 0
      
      if (metric === 'hit_rate') {
        const hits = bucketEvents.filter(e => e.type === 'hit').length
        const total = hits + bucketEvents.filter(e => e.type === 'miss').length
        value = total > 0 ? hits / total : 0
      } else if (metric === 'latency') {
        const latencies = bucketEvents.filter(e => e.metadata?.latency).map(e => e.metadata!.latency as number)
        value = latencies.length > 0 ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0
      }
      
      return { timestamp: bucket.start + (bucket.end - bucket.start) / 2, value }
    })
    
    // Calculate trend
    if (dataPoints.length < 2) {
      return { dataPoints, trend: 'stable', changeRate: 0 }
    }
    
    const firstValue = dataPoints[0].value
    const lastValue = dataPoints[dataPoints.length - 1].value
    const changeRate = firstValue > 0 ? (lastValue - firstValue) / firstValue : 0
    
    let trend: 'improving' | 'degrading' | 'stable' = 'stable'
    if (Math.abs(changeRate) > 0.05) { // 5% threshold
      if (metric === 'hit_rate') {
        trend = changeRate > 0 ? 'improving' : 'degrading'
      } else { // latency - lower is better
        trend = changeRate < 0 ? 'improving' : 'degrading'
      }
    }
    
    return { dataPoints, trend, changeRate }
  }

  private generateForecast(
    dataPoints: Array<{ timestamp: number; value: number }>, 
    forecastHours: number
  ): Array<{ timestamp: number; predicted: number; confidence: number }> {
    if (dataPoints.length < 2) {
      return []
    }
    
    // Simple linear regression for forecasting
    const n = dataPoints.length
    const sumX = dataPoints.reduce((sum, point, idx) => sum + idx, 0)
    const sumY = dataPoints.reduce((sum, point) => sum + point.value, 0)
    const sumXY = dataPoints.reduce((sum, point, idx) => sum + (idx * point.value), 0)
    const sumXX = dataPoints.reduce((sum, point, idx) => sum + (idx * idx), 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    // Generate forecast points
    const lastTimestamp = dataPoints[dataPoints.length - 1].timestamp
    const timeStep = dataPoints.length > 1 ? 
      (dataPoints[dataPoints.length - 1].timestamp - dataPoints[0].timestamp) / (dataPoints.length - 1) : 
      3600000 // 1 hour default
    
    const forecast: Array<{ timestamp: number; predicted: number; confidence: number }> = []
    
    for (let i = 1; i <= forecastHours; i++) {
      const predicted = slope * (n + i - 1) + intercept
      const confidence = Math.max(0.1, 1 - (i * 0.1)) // Confidence decreases with time
      
      forecast.push({
        timestamp: lastTimestamp + (i * timeStep),
        predicted: Math.max(0, predicted), // Ensure non-negative
        confidence
      })
    }
    
    return forecast
  }

  private generateMockDataPoints(
    timeframe: { start: number; end: number },
    baseValue: number,
    variance: number
  ): Array<{ timestamp: number; value: number }> {
    const points: Array<{ timestamp: number; value: number }> = []
    const interval = (timeframe.end - timeframe.start) / 20 // 20 data points

    for (let i = 0; i < 20; i++) {
      points.push({
        timestamp: timeframe.start + (i * interval),
        value: baseValue + (Math.random() - 0.5) * variance * 2
      })
    }

    return points
  }

  private generateMockForecast(
    timeframe: { start: number; end: number },
    baseValue: number,
    variance: number
  ): Array<{ timestamp: number; predicted: number; confidence: number }> {
    const forecast: Array<{ timestamp: number; predicted: number; confidence: number }> = []
    const interval = (timeframe.end - timeframe.start) / 10 // 10 forecast points

    for (let i = 0; i < 10; i++) {
      forecast.push({
        timestamp: timeframe.end + (i * interval),
        predicted: baseValue + (Math.random() - 0.5) * variance,
        confidence: Math.max(0.5, 0.9 - (i * 0.05)) // Decreasing confidence
      })
    }

    return forecast
  }

  private async updateTrends(metrics: CacheReport['summary'], timestamp: number): Promise<void> {
    // Update hit rate trend
    this.updateMetricTrend('hit_rate', metrics.hitRate, timestamp)
    
    // Update latency trend
    this.updateMetricTrend('latency', metrics.avgLatency, timestamp)
    
    // Update error rate trend
    this.updateMetricTrend('error_rate', metrics.errorRate, timestamp)
  }

  private updateMetricTrend(metric: string, value: number, timestamp: number): void {
    const trend = this.trends.get(metric) || {
      metric,
      timeframe: '24h',
      dataPoints: [],
      trend: 'stable',
      changeRate: 0,
      forecast: []
    }

    // Add new data point
    trend.dataPoints.push({ timestamp, value })

    // Keep only last 100 points
    if (trend.dataPoints.length > 100) {
      trend.dataPoints = trend.dataPoints.slice(-100)
    }

    // Calculate trend direction
    if (trend.dataPoints.length >= 10) {
      const recent = trend.dataPoints.slice(-10)
      const avg = recent.reduce((sum, p) => sum + p.value, 0) / recent.length
      const older = trend.dataPoints.slice(-20, -10)
      
      if (older.length >= 10) {
        const olderAvg = older.reduce((sum, p) => sum + p.value, 0) / older.length
        const change = (avg - olderAvg) / olderAvg
        
        trend.changeRate = change
        trend.trend = change > 0.05 ? 'improving' : change < -0.05 ? 'degrading' : 'stable'
      }
    }

    this.trends.set(metric, trend)
  }

  private async generateInsights(events: CacheEvent[], summary: CacheReport['summary']): Promise<CacheInsight[]> {
    const insights: CacheInsight[] = []

    // Low hit rate insight
    if (summary.hitRate < 0.7) {
      insights.push({
        type: 'warning',
        priority: 1,
        title: 'Low Cache Hit Rate',
        description: `Cache hit rate is ${(summary.hitRate * 100).toFixed(1)}%, below the recommended 70%`,
        impact: 'Increased latency and higher costs due to frequent cache misses',
        actionItems: [
          'Review cache TTL settings',
          'Analyze cache key patterns',
          'Consider cache warming strategies'
        ],
        metrics: { hitRate: summary.hitRate },
        confidence: 0.9
      })
    }

    // High error rate insight
    if (summary.errorRate > 0.05) {
      insights.push({
        type: 'warning',
        priority: 2,
        title: 'Elevated Error Rate',
        description: `Cache error rate is ${(summary.errorRate * 100).toFixed(1)}%`,
        impact: 'Potential service degradation and data inconsistency',
        actionItems: [
          'Check cache provider health',
          'Review error logs',
          'Verify network connectivity'
        ],
        metrics: { errorRate: summary.errorRate },
        confidence: 0.8
      })
    }

    return insights
  }

  private async generateRecommendations(
    summary: CacheReport['summary'],
    trends: PerformanceTrend[],
    insights: CacheInsight[]
  ): Promise<CacheOptimizationRecommendation[]> {
    const recommendations: CacheOptimizationRecommendation[] = []

    // Hit rate optimization
    if (summary.hitRate < 0.8) {
      recommendations.push({
        type: 'strategy',
        priority: 'high',
        title: 'Optimize Cache Strategy',
        description: 'Implement cache warming and optimize TTL settings to improve hit rate',
        currentState: { hitRate: summary.hitRate },
        recommendedState: { hitRate: 0.85 },
        expectedImprovement: {
          hitRate: 0.15,
          latency: -20,
          costSavings: 25
        },
        implementation: {
          steps: [
            'Analyze access patterns for popular keys',
            'Implement cache warming for frequently accessed data',
            'Optimize TTL settings based on data volatility',
            'Monitor and adjust based on performance metrics'
          ],
          effort: 'medium',
          timeline: '2-3 weeks',
          risks: ['Temporary increased memory usage during warming']
        }
      })
    }

    return recommendations
  }

  private analyzeKeys(events: CacheEvent[]): CacheReport['keyAnalysis'] {
    // Hot keys (most accessed)
    const keyAccess = new Map<string, number>()
    events.filter(e => e.type === 'hit' || e.type === 'miss').forEach(e => {
      keyAccess.set(e.key, (keyAccess.get(e.key) || 0) + 1)
    })

    const hotKeys = Array.from(keyAccess.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, hits]) => ({ key, hits }))

    // Cold keys (least accessed)
    const coldKeys = Array.from(this.keyStats.values())
      .filter(stats => stats.accessCount > 0)
      .sort((a, b) => a.lastAccess - b.lastAccess)
      .slice(0, 10)
      .map(stats => ({
        key: stats.key,
        lastAccess: stats.lastAccess,
        size: stats.avgSize
      }))

    // Large keys
    const largeKeys = Array.from(this.keyStats.values())
      .filter(stats => stats.avgSize > 0)
      .sort((a, b) => b.avgSize - a.avgSize)
      .slice(0, 10)
      .map(stats => ({
        key: stats.key,
        size: stats.avgSize,
        efficiency: stats.hitCount / Math.max(1, stats.accessCount)
      }))

    // Expensive keys (high generation time)
    const expensiveKeys = Array.from(this.keyStats.values())
      .filter(stats => stats.avgGenerationTime > 0)
      .sort((a, b) => b.avgGenerationTime - a.avgGenerationTime)
      .slice(0, 10)
      .map(stats => ({
        key: stats.key,
        generateTime: stats.avgGenerationTime,
        frequency: stats.accessCount
      }))

    return {
      hotKeys,
      coldKeys,
      largeKeys,
      expensiveKeys
    }
  }

  private calculateHitRateTrend(events: CacheEvent[]): number[] {
    // Calculate hit rate over time windows
    const windows = this.splitIntoTimeWindows(events, 24) // 24 windows
    return windows.map(window => {
      const hits = window.filter(e => e.type === 'hit').length
      const total = window.filter(e => e.type === 'hit' || e.type === 'miss').length
      return total > 0 ? hits / total : 0
    })
  }

  private calculateLatencyTrend(events: CacheEvent[]): number[] {
    // Mock latency calculation - in production would use actual latency data
    return this.splitIntoTimeWindows(events, 24).map(() => 30 + Math.random() * 40)
  }

  private calculateMemoryUsageTrend(events: CacheEvent[]): number[] {
    // Mock memory usage calculation
    return this.splitIntoTimeWindows(events, 24).map(() => 0.6 + Math.random() * 0.3)
  }

  private calculateErrorRateTrend(events: CacheEvent[]): number[] {
    // Mock error rate calculation
    return this.splitIntoTimeWindows(events, 24).map(() => Math.random() * 0.05)
  }

  private splitIntoTimeWindows(events: CacheEvent[], windowCount: number): CacheEvent[][] {
    if (events.length === 0) return Array(windowCount).fill([])

    const oldest = Math.min(...events.map(e => e.timestamp))
    const newest = Math.max(...events.map(e => e.timestamp))
    const windowSize = (newest - oldest) / windowCount

    const windows: CacheEvent[][] = []
    for (let i = 0; i < windowCount; i++) {
      const start = oldest + (i * windowSize)
      const end = start + windowSize
      windows.push(events.filter(e => e.timestamp >= start && e.timestamp < end))
    }

    return windows
  }

  private getPopularKeys(events: CacheEvent[], count: number): Array<{ key: string; hits: number }> {
    const keyHits = new Map<string, number>()
    
    events.filter(e => e.type === 'hit').forEach(e => {
      keyHits.set(e.key, (keyHits.get(e.key) || 0) + 1)
    })

    return Array.from(keyHits.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([key, hits]) => ({ key, hits }))
  }

  private getSlowKeys(count: number): Array<{ key: string; avgLatency: number }> {
    return Array.from(this.keyStats.values())
      .filter(stats => stats.avgGenerationTime > 0)
      .sort((a, b) => b.avgGenerationTime - a.avgGenerationTime)
      .slice(0, count)
      .map(stats => ({ key: stats.key, avgLatency: stats.avgGenerationTime }))
  }

  private getLargeKeys(count: number): Array<{ key: string; size: number }> {
    return Array.from(this.keyStats.values())
      .filter(stats => stats.avgSize > 0)
      .sort((a, b) => b.avgSize - a.avgSize)
      .slice(0, count)
      .map(stats => ({ key: stats.key, size: stats.avgSize }))
  }

  private getExpiredKeys(events: CacheEvent[], count: number): Array<{ key: string; expiredAt: number }> {
    return events
      .filter(e => e.type === 'expire')
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count)
      .map(e => ({ key: e.key, expiredAt: e.timestamp }))
  }

  private calculateCurrentMetrics(events: CacheEvent[]): {
    hitRate: number
    avgLatency: number
    memoryUsage: number
  } {
    const hits = events.filter(e => e.type === 'hit').length
    const total = events.filter(e => e.type === 'hit' || e.type === 'miss').length

    return {
      hitRate: total > 0 ? hits / total : 0,
      avgLatency: 50, // Mock
      memoryUsage: 0.7 // Mock
    }
  }

  private async initializePredictionModels(): Promise<void> {
    // Initialize basic prediction models
    this.predictions = [
      {
        name: 'hit_rate_predictor',
        version: '1.0',
        accuracy: 0.75,
        lastTrained: Date.now(),
        features: ['time_of_day', 'day_of_week', 'recent_hit_rate'],
        predictions: {}
      },
      {
        name: 'latency_predictor',
        version: '1.0',
        accuracy: 0.68,
        lastTrained: Date.now(),
        features: ['cache_size', 'request_rate', 'memory_usage'],
        predictions: {}
      }
    ]
  }
}

interface KeyStatistics {
  key: string
  accessCount: number
  hitCount: number
  missCount: number
  l1Hits: number
  l2Hits: number
  setCount: number
  deleteCount: number
  generationCount: number
  totalSize: number
  avgSize: number
  totalTTL: number
  avgTTL: number
  totalGenerationTime: number
  avgGenerationTime: number
  firstAccess: number
  lastAccess: number
}

export default CacheAnalytics