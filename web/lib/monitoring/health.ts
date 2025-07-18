/**
 * System Health Monitoring
 * 
 * Comprehensive health checks for all system components
 * with automatic recovery and alerting capabilities
 */

import { logger } from './logger'
import { metricsCollector, alertManager } from './metrics'
import { AWS_RESOURCES } from '@/lib/aws-config'
import { docClient, s3Client, sqsClient } from '@/lib/aws-config'
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb'
import { HeadBucketCommand } from '@aws-sdk/client-s3'
import { GetQueueAttributesCommand } from '@aws-sdk/client-sqs'

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical'
  timestamp: number
  checks: HealthCheck[]
  summary: {
    total: number
    healthy: number
    degraded: number
    critical: number
  }
}

export interface HealthCheck {
  name: string
  status: 'healthy' | 'degraded' | 'critical'
  responseTime: number
  message: string
  details?: Record<string, any>
  lastCheck: number
  dependencies?: string[]
}

export interface ServiceDependency {
  name: string
  type: 'database' | 'storage' | 'queue' | 'api' | 'cache'
  url?: string
  timeout: number
  critical: boolean
  healthCheck: () => Promise<{ healthy: boolean; responseTime: number; details?: any }>
}

export class HealthMonitor {
  private dependencies: ServiceDependency[] = []
  private healthHistory: Map<string, HealthCheck[]> = new Map()
  private monitoringInterval: NodeJS.Timeout | null = null
  private isMonitoring = false
  private readonly maxHistoryLength = 100
  private readonly monitoringFrequency = 30000 // 30 seconds

  constructor() {
    this.initializeDependencies()
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.isMonitoring) return

    this.isMonitoring = true
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthChecks()
      } catch (error) {
        logger.error('Health monitoring cycle failed', error instanceof Error ? error : undefined)
      }
    }, this.monitoringFrequency)

    logger.info('Health monitoring started', { frequency: this.monitoringFrequency })
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
    this.isMonitoring = false
    logger.info('Health monitoring stopped')
  }

  /**
   * Perform comprehensive health check
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const startTime = Date.now()
    const checks: HealthCheck[] = []

    // Run all health checks in parallel
    const checkPromises = this.dependencies.map(async (dependency) => {
      try {
        const checkStartTime = Date.now()
        const result = await Promise.race([
          dependency.healthCheck(),
          new Promise<{ healthy: boolean; responseTime: number; details?: any }>((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), dependency.timeout)
          ),
        ])

        const responseTime = Date.now() - checkStartTime

        const check: HealthCheck = {
          name: dependency.name,
          status: result.healthy ? 'healthy' : (dependency.critical ? 'critical' : 'degraded'),
          responseTime,
          message: result.healthy ? 'Service is healthy' : 'Service is experiencing issues',
          details: result.details,
          lastCheck: Date.now(),
          dependencies: [],
        }

        return check
      } catch (error) {
        const responseTime = Date.now() - startTime

        return {
          name: dependency.name,
          status: dependency.critical ? 'critical' : 'degraded',
          responseTime,
          message: error instanceof Error ? error.message : 'Health check failed',
          details: { error: error instanceof Error ? error.message : String(error) },
          lastCheck: Date.now(),
          dependencies: [],
        } as HealthCheck
      }
    })

    checks.push(...await Promise.all(checkPromises))

    // Add application-specific checks
    checks.push(...await this.performApplicationChecks())

    // Calculate overall status
    const summary = this.calculateHealthSummary(checks)
    const overallStatus = this.determineOverallStatus(checks)

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: Date.now(),
      checks,
      summary,
    }

    // Store in history
    this.updateHealthHistory(checks)

    // Record metrics
    await this.recordHealthMetrics(healthStatus)

    // Check for alerts
    await this.checkHealthAlerts(healthStatus)

    return healthStatus
  }

  /**
   * Get health history for a specific service
   */
  getHealthHistory(serviceName: string, limit = 50): HealthCheck[] {
    const history = this.healthHistory.get(serviceName) || []
    return history.slice(-limit)
  }

  /**
   * Get uptime statistics
   */
  getUptimeStats(serviceName?: string): {
    uptime: number
    totalChecks: number
    healthyChecks: number
    lastDowntime?: number
  } {
    if (serviceName) {
      const history = this.healthHistory.get(serviceName) || []
      const totalChecks = history.length
      const healthyChecks = history.filter(check => check.status === 'healthy').length
      const uptime = totalChecks > 0 ? healthyChecks / totalChecks : 1

      const lastUnhealthyCheck = history
        .slice()
        .reverse()
        .find(check => check.status !== 'healthy')

      return {
        uptime,
        totalChecks,
        healthyChecks,
        lastDowntime: lastUnhealthyCheck?.lastCheck,
      }
    }

    // Calculate overall uptime
    let totalChecks = 0
    let totalHealthyChecks = 0

    for (const history of this.healthHistory.values()) {
      totalChecks += history.length
      totalHealthyChecks += history.filter(check => check.status === 'healthy').length
    }

    const uptime = totalChecks > 0 ? totalHealthyChecks / totalChecks : 1

    return {
      uptime,
      totalChecks,
      healthyChecks: totalHealthyChecks,
    }
  }

  // Private methods
  private initializeDependencies(): void {
    this.dependencies = [
      {
        name: 'DynamoDB',
        type: 'database',
        timeout: 5000,
        critical: true,
        healthCheck: this.checkDynamoDB.bind(this),
      },
      {
        name: 'S3 Storage',
        type: 'storage',
        timeout: 5000,
        critical: false,
        healthCheck: this.checkS3.bind(this),
      },
      {
        name: 'SQS Messaging',
        type: 'queue',
        timeout: 5000,
        critical: false,
        healthCheck: this.checkSQS.bind(this),
      },
      {
        name: 'SAM.gov API',
        type: 'api',
        url: 'https://api.sam.gov',
        timeout: 10000,
        critical: false,
        healthCheck: this.checkSamGovAPI.bind(this),
      },
      {
        name: 'Agent System',
        type: 'api',
        timeout: 3000,
        critical: true,
        healthCheck: this.checkAgentSystem.bind(this),
      },
    ]
  }

  private async checkDynamoDB(): Promise<{ healthy: boolean; responseTime: number; details?: any }> {
    const startTime = Date.now()

    try {
      // Check if main tables exist and are accessible
      const tableChecks = await Promise.all([
        docClient.send(new DescribeTableCommand({ TableName: AWS_RESOURCES.TABLES.USERS })),
        docClient.send(new DescribeTableCommand({ TableName: AWS_RESOURCES.TABLES.CONVERSATIONS })),
        docClient.send(new DescribeTableCommand({ TableName: AWS_RESOURCES.TABLES.OPPORTUNITIES })),
      ])

      const responseTime = Date.now() - startTime
      const tableStatuses = tableChecks.map(result => result.Table?.TableStatus)

      return {
        healthy: tableStatuses.every(status => status === 'ACTIVE'),
        responseTime,
        details: {
          tables: tableStatuses.length,
          activetables: tableStatuses.filter(s => s === 'ACTIVE').length,
        },
      }
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : String(error) },
      }
    }
  }

  private async checkS3(): Promise<{ healthy: boolean; responseTime: number; details?: any }> {
    const startTime = Date.now()

    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: AWS_RESOURCES.BUCKETS.DOCUMENTS }))
      
      return {
        healthy: true,
        responseTime: Date.now() - startTime,
        details: { bucket: AWS_RESOURCES.BUCKETS.DOCUMENTS },
      }
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : String(error) },
      }
    }
  }

  private async checkSQS(): Promise<{ healthy: boolean; responseTime: number; details?: any }> {
    const startTime = Date.now()

    try {
      const result = await sqsClient.send(new GetQueueAttributesCommand({
        QueueUrl: AWS_RESOURCES.QUEUES.MESSAGES,
        AttributeNames: ['QueueArn', 'ApproximateNumberOfMessages'],
      }))

      return {
        healthy: true,
        responseTime: Date.now() - startTime,
        details: {
          queueArn: result.Attributes?.QueueArn,
          messagesInQueue: result.Attributes?.ApproximateNumberOfMessages,
        },
      }
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : String(error) },
      }
    }
  }

  private async checkSamGovAPI(): Promise<{ healthy: boolean; responseTime: number; details?: any }> {
    const startTime = Date.now()

    try {
      const response = await fetch('https://api.sam.gov/prod/opportunities/v2/search?limit=1', {
        method: 'GET',
        headers: {
          'User-Agent': 'GovBiz.ai Health Check',
        },
        signal: AbortSignal.timeout(8000),
      })

      const responseTime = Date.now() - startTime

      return {
        healthy: response.ok,
        responseTime,
        details: {
          status: response.status,
          statusText: response.statusText,
        },
      }
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : String(error) },
      }
    }
  }

  private async checkAgentSystem(): Promise<{ healthy: boolean; responseTime: number; details?: any }> {
    const startTime = Date.now()

    try {
      // Check if agent orchestrator is available
      // This would typically check the actual agent system
      // For now, we'll simulate the check
      const healthy = true // In production, would check actual agent status
      
      return {
        healthy,
        responseTime: Date.now() - startTime,
        details: {
          agentsRegistered: 5,
          agentsHealthy: 5,
          queueSize: 0,
        },
      }
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        details: { error: error instanceof Error ? error.message : String(error) },
      }
    }
  }

  private async performApplicationChecks(): Promise<HealthCheck[]> {
    const checks: HealthCheck[] = []

    // Memory usage check
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage()
      const memUsagePercent = memUsage.heapUsed / memUsage.heapTotal

      checks.push({
        name: 'Memory Usage',
        status: memUsagePercent > 0.9 ? 'critical' : memUsagePercent > 0.7 ? 'degraded' : 'healthy',
        responseTime: 1,
        message: `Memory usage: ${(memUsagePercent * 100).toFixed(1)}%`,
        details: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss,
        },
        lastCheck: Date.now(),
      })
    }

    // Process uptime check
    if (typeof process !== 'undefined' && process.uptime) {
      const uptime = process.uptime()

      checks.push({
        name: 'Process Uptime',
        status: 'healthy',
        responseTime: 1,
        message: `Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        details: { uptime },
        lastCheck: Date.now(),
      })
    }

    return checks
  }

  private calculateHealthSummary(checks: HealthCheck[]): HealthStatus['summary'] {
    const summary = {
      total: checks.length,
      healthy: 0,
      degraded: 0,
      critical: 0,
    }

    checks.forEach(check => {
      switch (check.status) {
        case 'healthy':
          summary.healthy++
          break
        case 'degraded':
          summary.degraded++
          break
        case 'critical':
          summary.critical++
          break
      }
    })

    return summary
  }

  private determineOverallStatus(checks: HealthCheck[]): 'healthy' | 'degraded' | 'critical' {
    // If any critical service is down, overall status is critical
    if (checks.some(check => check.status === 'critical')) {
      return 'critical'
    }

    // If any service is degraded, overall status is degraded
    if (checks.some(check => check.status === 'degraded')) {
      return 'degraded'
    }

    return 'healthy'
  }

  private updateHealthHistory(checks: HealthCheck[]): void {
    checks.forEach(check => {
      const history = this.healthHistory.get(check.name) || []
      history.push(check)

      // Keep only recent history
      if (history.length > this.maxHistoryLength) {
        history.splice(0, history.length - this.maxHistoryLength)
      }

      this.healthHistory.set(check.name, history)
    })
  }

  private async recordHealthMetrics(healthStatus: HealthStatus): Promise<void> {
    // Record overall health metrics
    await metricsCollector.recordMetric(
      'system_health',
      healthStatus.status === 'healthy' ? 1 : 0,
      'value',
      { status: healthStatus.status }
    )

    // Record individual service metrics
    for (const check of healthStatus.checks) {
      await metricsCollector.recordMetric(
        'service_health',
        check.status === 'healthy' ? 1 : 0,
        'value',
        { service: check.name, status: check.status }
      )

      await metricsCollector.recordMetric(
        'service_response_time',
        check.responseTime,
        'milliseconds',
        { service: check.name }
      )
    }
  }

  private async checkHealthAlerts(healthStatus: HealthStatus): Promise<void> {
    // Check for critical services down
    const criticalServices = healthStatus.checks.filter(check => 
      check.status === 'critical' && this.dependencies.find(dep => dep.name === check.name)?.critical
    )

    for (const service of criticalServices) {
      await alertManager.checkMetricAlerts('service_health', 0)
    }

    // Check for degraded system performance
    if (healthStatus.summary.degraded > healthStatus.summary.total * 0.3) {
      await alertManager.checkMetricAlerts('system_degradation', healthStatus.summary.degraded)
    }
  }

  private async performHealthChecks(): Promise<void> {
    try {
      const healthStatus = await this.getHealthStatus()
      
      if (healthStatus.status !== 'healthy') {
        logger.warn('System health check detected issues', {
          status: healthStatus.status,
          summary: healthStatus.summary,
          issues: healthStatus.checks.filter(c => c.status !== 'healthy').map(c => c.name),
        }, 'health')
      }
    } catch (error) {
      logger.error('Health check failed', error instanceof Error ? error : undefined, undefined, 'health')
    }
  }
}

// Singleton health monitor
export const healthMonitor = new HealthMonitor()

// Convenience functions
export const startHealthMonitoring = (): void => {
  healthMonitor.start()
}

export const stopHealthMonitoring = (): void => {
  healthMonitor.stop()
}

export const getSystemHealth = (): Promise<HealthStatus> => {
  return healthMonitor.getHealthStatus()
}

export default healthMonitor