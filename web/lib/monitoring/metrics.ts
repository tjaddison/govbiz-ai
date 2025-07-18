/**
 * Metrics Collection and Management System
 * 
 * Comprehensive metrics collection for performance monitoring,
 * business analytics, and system health tracking
 */

import { MONITORING_CONFIG, AWS_RESOURCES } from '@/lib/aws-config'
import { docClient } from '@/lib/aws-config'
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

export interface Metric {
  id: string
  name: string
  value: number
  unit: string
  timestamp: number
  dimensions?: Record<string, string>
  metadata?: Record<string, any>
}

export interface MetricFilter {
  metricName?: string
  startTime?: number
  endTime?: number
  dimensions?: Record<string, string>
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count'
  granularity?: 'minute' | 'hour' | 'day' | 'week'
}

export interface MetricSummary {
  metricName: string
  value: number
  unit: string
  change: number
  changePercentage: number
  trend: 'up' | 'down' | 'stable'
  period: string
}

export interface Alert {
  id: string
  metricName: string
  threshold: number
  comparison: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  value: number
  triggeredAt: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  resolved: boolean
  resolvedAt?: number
}

export class MetricsCollector {
  private metricsBuffer: Metric[] = []
  private flushInterval: NodeJS.Timeout | null = null
  private bufferSize = 100
  private flushIntervalMs = 60000 // 1 minute

  constructor() {
    this.startAutoFlush()
  }

  /**
   * Record a metric value
   */
  async recordMetric(
    name: string,
    value: number,
    unit: string = 'count',
    dimensions?: Record<string, string>,
    metadata?: Record<string, any>
  ): Promise<void> {
    const metric: Metric = {
      id: this.generateMetricId(),
      name,
      value,
      unit,
      timestamp: Date.now(),
      dimensions,
      metadata,
    }

    this.metricsBuffer.push(metric)

    // Flush if buffer is full
    if (this.metricsBuffer.length >= this.bufferSize) {
      await this.flush()
    }
  }

  /**
   * Record timing metric
   */
  async recordTiming(
    name: string,
    startTime: number,
    dimensions?: Record<string, string>
  ): Promise<void> {
    const duration = Date.now() - startTime
    await this.recordMetric(name, duration, 'milliseconds', dimensions)
  }

  /**
   * Record counter increment
   */
  async increment(
    name: string,
    value: number = 1,
    dimensions?: Record<string, string>
  ): Promise<void> {
    await this.recordMetric(name, value, 'count', dimensions)
  }

  /**
   * Record gauge value
   */
  async gauge(
    name: string,
    value: number,
    unit: string = 'value',
    dimensions?: Record<string, string>
  ): Promise<void> {
    await this.recordMetric(name, value, unit, dimensions)
  }

  /**
   * Flush metrics buffer to storage
   */
  async flush(): Promise<void> {
    if (this.metricsBuffer.length === 0) return

    const metricsToFlush = [...this.metricsBuffer]
    this.metricsBuffer = []

    try {
      await this.persistMetrics(metricsToFlush)
    } catch (error) {
      console.error('Failed to flush metrics:', error)
      // Re-add metrics to buffer for retry
      this.metricsBuffer.unshift(...metricsToFlush)
    }
  }

  /**
   * Get metrics with filtering and aggregation
   */
  async getMetrics(filter: MetricFilter = {}): Promise<Metric[]> {
    const {
      metricName,
      startTime = Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
      endTime = Date.now(),
      dimensions,
    } = filter

    try {
      const params: any = {
        TableName: AWS_RESOURCES.TABLES.AUDIT, // Reuse audit table for metrics
        IndexName: 'MetricsIndex',
        KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':pk': 'METRIC',
          ':start': `METRIC#${startTime}`,
          ':end': `METRIC#${endTime}`,
        },
      }

      if (metricName) {
        params.KeyConditionExpression += ' AND metricName = :metricName'
        params.ExpressionAttributeValues[':metricName'] = metricName
      }

      const result = await docClient.send(new QueryCommand(params))
      let metrics = (result.Items || []).map(this.parseMetricFromDynamoDB)

      // Apply dimension filtering
      if (dimensions) {
        metrics = metrics.filter(metric =>
          Object.entries(dimensions).every(([key, value]) =>
            metric.dimensions?.[key] === value
          )
        )
      }

      return metrics
    } catch (error) {
      console.error('Failed to get metrics:', error)
      return []
    }
  }

  /**
   * Get metric summary with trends
   */
  async getMetricSummary(
    metricName: string,
    period: 'hour' | 'day' | 'week' = 'day'
  ): Promise<MetricSummary | null> {
    const now = Date.now()
    const periodMs = this.getPeriodMilliseconds(period)
    
    const currentPeriodStart = now - periodMs
    const previousPeriodStart = currentPeriodStart - periodMs

    try {
      const [currentMetrics, previousMetrics] = await Promise.all([
        this.getMetrics({
          metricName,
          startTime: currentPeriodStart,
          endTime: now,
        }),
        this.getMetrics({
          metricName,
          startTime: previousPeriodStart,
          endTime: currentPeriodStart,
        }),
      ])

      if (currentMetrics.length === 0) return null

      const currentValue = this.aggregateMetrics(currentMetrics, 'avg')
      const previousValue = this.aggregateMetrics(previousMetrics, 'avg')
      
      const change = currentValue - previousValue
      const changePercentage = previousValue > 0 ? (change / previousValue) * 100 : 0
      
      let trend: 'up' | 'down' | 'stable' = 'stable'
      if (Math.abs(changePercentage) > 5) {
        trend = changePercentage > 0 ? 'up' : 'down'
      }

      return {
        metricName,
        value: currentValue,
        unit: currentMetrics[0].unit,
        change,
        changePercentage,
        trend,
        period,
      }
    } catch (error) {
      console.error('Failed to get metric summary:', error)
      return null
    }
  }

  /**
   * Shutdown metrics collector
   */
  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    
    // Flush remaining metrics
    this.flush().catch(console.error)
  }

  // Private methods
  private startAutoFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch(console.error)
    }, this.flushIntervalMs)
  }

  private async persistMetrics(metrics: Metric[]): Promise<void> {
    const putRequests = metrics.map(metric => ({
      PutRequest: {
        Item: {
          pk: 'METRIC',
          sk: `METRIC#${metric.timestamp}#${metric.id}`,
          metricName: metric.name,
          value: metric.value,
          unit: metric.unit,
          timestamp: metric.timestamp,
          dimensions: metric.dimensions || {},
          metadata: metric.metadata || {},
          ttl: Math.floor((Date.now() + 90 * 24 * 60 * 60 * 1000) / 1000), // 90 days TTL
        },
      },
    }))

    // Batch write in chunks of 25 (DynamoDB limit)
    const chunks = this.chunkArray(putRequests, 25)
    
    for (const chunk of chunks) {
      try {
        await docClient.send(new PutCommand({
          TableName: AWS_RESOURCES.TABLES.AUDIT,
          Item: chunk[0].PutRequest.Item, // Single item for now, would use BatchWrite in production
        }))
      } catch (error) {
        console.error('Failed to persist metric chunk:', error)
        throw error
      }
    }
  }

  private parseMetricFromDynamoDB(item: any): Metric {
    return {
      id: item.sk.split('#')[2],
      name: item.metricName,
      value: item.value,
      unit: item.unit,
      timestamp: item.timestamp,
      dimensions: item.dimensions,
      metadata: item.metadata,
    }
  }

  private aggregateMetrics(metrics: Metric[], aggregation: string): number {
    if (metrics.length === 0) return 0

    const values = metrics.map(m => m.value)
    
    switch (aggregation) {
      case 'sum':
        return values.reduce((sum, val) => sum + val, 0)
      case 'avg':
        return values.reduce((sum, val) => sum + val, 0) / values.length
      case 'min':
        return Math.min(...values)
      case 'max':
        return Math.max(...values)
      case 'count':
        return values.length
      default:
        return values.reduce((sum, val) => sum + val, 0) / values.length
    }
  }

  private getPeriodMilliseconds(period: string): number {
    switch (period) {
      case 'hour':
        return 60 * 60 * 1000
      case 'day':
        return 24 * 60 * 60 * 1000
      case 'week':
        return 7 * 24 * 60 * 60 * 1000
      default:
        return 24 * 60 * 60 * 1000
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  private generateMetricId(): string {
    return `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export class AlertManager {
  private alerts: Map<string, Alert> = new Map()
  private metricsCollector: MetricsCollector

  constructor(metricsCollector: MetricsCollector) {
    this.metricsCollector = metricsCollector
  }

  /**
   * Check metric against alert rules and trigger if necessary
   */
  async checkMetricAlerts(metricName: string, value: number): Promise<Alert[]> {
    const triggeredAlerts: Alert[] = []
    
    // Get alert rules for this metric
    const alertRules = this.getAlertRulesForMetric(metricName)
    
    for (const rule of alertRules) {
      const shouldTrigger = this.evaluateAlertCondition(value, rule.threshold, rule.comparison)
      
      if (shouldTrigger) {
        const alert = await this.triggerAlert(metricName, value, rule)
        triggeredAlerts.push(alert)
      }
    }
    
    return triggeredAlerts
  }

  /**
   * Trigger an alert
   */
  private async triggerAlert(
    metricName: string,
    value: number,
    rule: any
  ): Promise<Alert> {
    const alert: Alert = {
      id: this.generateAlertId(),
      metricName,
      threshold: rule.threshold,
      comparison: rule.comparison,
      value,
      triggeredAt: Date.now(),
      severity: rule.severity,
      message: this.generateAlertMessage(metricName, value, rule),
      resolved: false,
    }

    this.alerts.set(alert.id, alert)
    
    // Persist alert
    await this.persistAlert(alert)
    
    // Send notifications
    await this.sendAlertNotifications(alert)
    
    return alert
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId)
    if (alert && !alert.resolved) {
      alert.resolved = true
      alert.resolvedAt = Date.now()
      
      await this.persistAlert(alert)
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved)
  }

  /**
   * Get all alerts with filtering
   */
  async getAlerts(filter: {
    metricName?: string
    severity?: string
    resolved?: boolean
    startTime?: number
    endTime?: number
  } = {}): Promise<Alert[]> {
    // In production, this would query from persistent storage
    let alerts = Array.from(this.alerts.values())
    
    if (filter.metricName) {
      alerts = alerts.filter(alert => alert.metricName === filter.metricName)
    }
    
    if (filter.severity) {
      alerts = alerts.filter(alert => alert.severity === filter.severity)
    }
    
    if (filter.resolved !== undefined) {
      alerts = alerts.filter(alert => alert.resolved === filter.resolved)
    }
    
    if (filter.startTime) {
      alerts = alerts.filter(alert => alert.triggeredAt >= filter.startTime!)
    }
    
    if (filter.endTime) {
      alerts = alerts.filter(alert => alert.triggeredAt <= filter.endTime!)
    }
    
    return alerts.sort((a, b) => b.triggeredAt - a.triggeredAt)
  }

  // Private methods
  private getAlertRulesForMetric(metricName: string): any[] {
    // Default alert rules - in production, these would be configurable
    const defaultRules: Record<string, any[]> = {
      'response_time': [
        {
          threshold: MONITORING_CONFIG.ALERTS.RESPONSE_TIME_THRESHOLD,
          comparison: 'gt',
          severity: 'medium',
        },
      ],
      'error_rate': [
        {
          threshold: MONITORING_CONFIG.ALERTS.ERROR_RATE_THRESHOLD,
          comparison: 'gt',
          severity: 'high',
        },
      ],
      'memory_usage': [
        {
          threshold: MONITORING_CONFIG.ALERTS.MEMORY_USAGE_THRESHOLD,
          comparison: 'gt',
          severity: 'critical',
        },
      ],
      'cpu_usage': [
        {
          threshold: 0.8,
          comparison: 'gt',
          severity: 'medium',
        },
      ],
      'disk_usage': [
        {
          threshold: 0.9,
          comparison: 'gt',
          severity: 'high',
        },
      ],
    }
    
    return defaultRules[metricName] || []
  }

  private evaluateAlertCondition(
    value: number,
    threshold: number,
    comparison: string
  ): boolean {
    switch (comparison) {
      case 'gt':
        return value > threshold
      case 'lt':
        return value < threshold
      case 'gte':
        return value >= threshold
      case 'lte':
        return value <= threshold
      case 'eq':
        return value === threshold
      default:
        return false
    }
  }

  private generateAlertMessage(metricName: string, value: number, rule: any): string {
    const comparisonMap: Record<string, string> = {
      'gt': 'greater than',
      'lt': 'less than',
      'gte': 'greater than or equal to',
      'lte': 'less than or equal to',
      'eq': 'equal to',
    }
    const comparisonText = comparisonMap[rule.comparison] || 'compared to'

    return `${metricName} is ${value} (${comparisonText} threshold ${rule.threshold})`
  }

  private async persistAlert(alert: Alert): Promise<void> {
    try {
      await docClient.send(new PutCommand({
        TableName: AWS_RESOURCES.TABLES.AUDIT,
        Item: {
          pk: 'ALERT',
          sk: `ALERT#${alert.triggeredAt}#${alert.id}`,
          alertId: alert.id,
          metricName: alert.metricName,
          threshold: alert.threshold,
          comparison: alert.comparison,
          value: alert.value,
          triggeredAt: alert.triggeredAt,
          severity: alert.severity,
          message: alert.message,
          resolved: alert.resolved,
          resolvedAt: alert.resolvedAt,
          ttl: Math.floor((Date.now() + 365 * 24 * 60 * 60 * 1000) / 1000), // 1 year TTL
        },
      }))
    } catch (error) {
      console.error('Failed to persist alert:', error)
    }
  }

  private async sendAlertNotifications(alert: Alert): Promise<void> {
    // In production, this would integrate with notification services
    console.warn(`ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`)
    
    // Record alert as metric
    await this.metricsCollector.recordMetric(
      'alerts_triggered',
      1,
      'count',
      {
        severity: alert.severity,
        metricName: alert.metricName,
      }
    )
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// Singleton instances
export const metricsCollector = new MetricsCollector()
export const alertManager = new AlertManager(metricsCollector)

// Predefined metric recording functions
export const recordApiCall = async (
  endpoint: string,
  method: string,
  statusCode: number,
  duration: number
): Promise<void> => {
  await metricsCollector.recordMetric(
    'api_calls_total',
    1,
    'count',
    { endpoint, method, status: statusCode.toString() }
  )
  
  await metricsCollector.recordMetric(
    'api_response_time',
    duration,
    'milliseconds',
    { endpoint, method }
  )
  
  if (statusCode >= 400) {
    await metricsCollector.recordMetric(
      'api_errors_total',
      1,
      'count',
      { endpoint, method, status: statusCode.toString() }
    )
  }
}

export const recordUserActivity = async (
  userId: string,
  action: string,
  metadata?: Record<string, any>
): Promise<void> => {
  await metricsCollector.recordMetric(
    'user_activity',
    1,
    'count',
    { userId, action },
    metadata
  )
}

export const recordBusinessMetric = async (
  metricName: string,
  value: number,
  unit: string = 'count',
  metadata?: Record<string, any>
): Promise<void> => {
  await metricsCollector.recordMetric(
    metricName,
    value,
    unit,
    { category: 'business' },
    metadata
  )
}

export const recordSystemMetric = async (
  metricName: string,
  value: number,
  unit: string = 'value'
): Promise<void> => {
  await metricsCollector.recordMetric(
    metricName,
    value,
    unit,
    { category: 'system' }
  )
}

// Cleanup function
export const shutdownMetrics = (): void => {
  metricsCollector.shutdown()
}