/**
 * Performance Tracker
 * 
 * Real-time performance monitoring, metrics collection, and optimization
 * tracking for workflow execution and system performance
 */

import {
  PerformanceMetrics,
  WorkflowMetrics,
  ResourceUtilization,
  Workflow,
  WorkflowStep
} from './types'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'

export interface PerformanceSnapshot {
  workflowId: string
  stepId?: string
  timestamp: number
  metrics: PerformanceMetrics
  context: PerformanceContext
  environment: EnvironmentInfo
}

export interface PerformanceContext {
  executionId: string
  userId?: string
  sessionId?: string
  userAgent?: string
  location?: string
  environment: 'development' | 'staging' | 'production'
  version: string
}

export interface EnvironmentInfo {
  platform: string
  cpuCores: number
  totalMemory: number
  availableMemory: number
  networkLatency: number
  serverLoad: number
}

export interface PerformanceTrend {
  metric: string
  timeframe: string
  dataPoints: PerformanceDataPoint[]
  trend: 'improving' | 'declining' | 'stable'
  changeRate: number
  forecast: PerformanceForecast
}

export interface PerformanceDataPoint {
  timestamp: number
  value: number
  context?: Record<string, any>
}

export interface PerformanceForecast {
  predictedValue: number
  confidence: number
  timeframe: string
  factors: string[]
}

export interface PerformanceAlert {
  id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  type: 'threshold' | 'trend' | 'anomaly' | 'degradation'
  metric: string
  message: string
  value: number
  threshold: number
  workflowId?: string
  stepId?: string
  timestamp: number
  resolved: boolean
  resolvedAt?: number
  actions: AlertAction[]
}

export interface AlertAction {
  action: string
  description: string
  automated: boolean
  executed: boolean
  executedAt?: number
  result?: string
}

export interface PerformanceBaseline {
  workflowId: string
  stepId?: string
  metric: string
  baselineValue: number
  sampleSize: number
  confidence: number
  calculatedAt: number
  validUntil: number
}

export interface PerformanceBenchmark {
  category: string
  metric: string
  percentiles: Record<string, number> // P50, P75, P90, P95, P99
  industry: string
  source: string
  updatedAt: number
}

export interface PerformanceOptimization {
  workflowId: string
  stepId?: string
  optimization: string
  baseline: number
  optimized: number
  improvement: number
  implementedAt: number
  validatedAt?: number
  success: boolean
  notes: string
}

export interface PerformanceReport {
  workflowId?: string
  timeframe: string
  summary: PerformanceSummary
  trends: PerformanceTrend[]
  alerts: PerformanceAlert[]
  optimizations: PerformanceOptimization[]
  recommendations: PerformanceRecommendation[]
  benchmarks: PerformanceBenchmark[]
}

export interface PerformanceSummary {
  totalExecutions: number
  averageLatency: number
  successRate: number
  errorRate: number
  throughput: number
  resourceEfficiency: number
  userSatisfaction: number
  costEfficiency: number
}

export interface PerformanceRecommendation {
  type: 'optimization' | 'scaling' | 'configuration' | 'architecture'
  priority: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  rationale: string
  expectedImprovement: number
  effort: number
  implementation: string[]
  risks: string[]
}

export interface PerformanceConfig {
  metricsRetention: number // days
  samplingRate: number // 0-1
  alertThresholds: Record<string, number>
  baselineUpdateInterval: number // hours
  trendAnalysisWindow: number // hours
}

export class PerformanceTracker {
  private snapshots: Map<string, PerformanceSnapshot[]> = new Map()
  private baselines: Map<string, PerformanceBaseline[]> = new Map()
  private alerts: Map<string, PerformanceAlert[]> = new Map()
  private optimizations: Map<string, PerformanceOptimization[]> = new Map()
  private config: PerformanceConfig

  constructor() {
    this.config = {
      metricsRetention: 30, // 30 days
      samplingRate: 1.0, // 100% sampling
      alertThresholds: {
        latency: 5000, // 5 seconds
        errorRate: 0.05, // 5%
        throughput: 10, // 10 per minute
        cpuUtilization: 0.8, // 80%
        memoryUtilization: 0.8 // 80%
      },
      baselineUpdateInterval: 24, // 24 hours
      trendAnalysisWindow: 168 // 7 days
    }
  }

  /**
   * Initialize performance tracker
   */
  async initialize(): Promise<void> {
    await this.loadPerformanceData()
    await this.initializeBaselines()
    
    // Set up periodic tasks
    setInterval(() => this.cleanupOldData(), 60 * 60 * 1000) // Every hour
    setInterval(() => this.updateBaselines(), this.config.baselineUpdateInterval * 60 * 60 * 1000)
    setInterval(() => this.analyzePerformanceTrends(), 30 * 60 * 1000) // Every 30 minutes
    
    logger.info('Performance tracker initialized successfully', {
      retention: this.config.metricsRetention,
      samplingRate: this.config.samplingRate
    })
  }

  /**
   * Record workflow execution metrics
   */
  async recordWorkflowExecution(
    workflowId: string,
    execution: {
      executionId: string
      startTime: number
      endTime: number
      success: boolean
      steps: { stepId: string; startTime: number; endTime: number; success: boolean; data?: any }[]
      context?: PerformanceContext
      errors?: string[]
    }
  ): Promise<void> {
    try {
      const duration = execution.endTime - execution.startTime
      const successfulSteps = execution.steps.filter(s => s.success).length
      const stepSuccessRate = execution.steps.length > 0 ? successfulSteps / execution.steps.length : 1

      // Calculate performance metrics
      const metrics: PerformanceMetrics = {
        throughput: 1, // Single execution
        latency: duration,
        errorRate: execution.success ? 0 : 1,
        resourceUtilization: await this.getCurrentResourceUtilization(),
        qualityScore: stepSuccessRate,
        userSatisfaction: execution.success ? 0.9 : 0.3,
        costEfficiency: await this.calculateCostEfficiency(workflowId, duration),
        timeToCompletion: duration,
        parallelization: await this.calculateParallelization(execution.steps),
        optimization: await this.calculateOptimizationScore(workflowId)
      }

      // Create performance snapshot
      const snapshot: PerformanceSnapshot = {
        workflowId,
        timestamp: execution.endTime,
        metrics,
        context: execution.context || this.createDefaultContext(execution.executionId),
        environment: await this.getEnvironmentInfo()
      }

      // Store snapshot
      const workflowSnapshots = this.snapshots.get(workflowId) || []
      workflowSnapshots.push(snapshot)
      this.snapshots.set(workflowId, workflowSnapshots)

      // Record individual step metrics
      for (const step of execution.steps) {
        await this.recordStepExecution(workflowId, step, execution.context)
      }

      // Check for alerts
      await this.checkPerformanceAlerts(workflowId, metrics)

      // Record metrics to monitoring system
      await metricsCollector.recordMetric(
        'workflow_execution_duration',
        duration,
        'milliseconds',
        { 
          workflowId,
          success: execution.success.toString(),
          stepCount: execution.steps.length.toString()
        }
      )

      await metricsCollector.recordMetric(
        'workflow_success_rate',
        execution.success ? 1 : 0,
        'boolean',
        { workflowId }
      )

      logger.debug('Workflow execution metrics recorded', {
        workflowId,
        executionId: execution.executionId,
        duration,
        success: execution.success,
        stepCount: execution.steps.length
      }, 'performance')

    } catch (error) {
      logger.error('Failed to record workflow execution metrics', error instanceof Error ? error : undefined, {
        workflowId,
        executionId: execution.executionId
      }, 'performance')
    }
  }

  /**
   * Record step execution metrics
   */
  async recordStepExecution(
    workflowId: string,
    step: {
      stepId: string
      startTime: number
      endTime: number
      success: boolean
      data?: any
    },
    context?: PerformanceContext
  ): Promise<void> {
    try {
      const duration = step.endTime - step.startTime

      const metrics: PerformanceMetrics = {
        throughput: 1,
        latency: duration,
        errorRate: step.success ? 0 : 1,
        resourceUtilization: await this.getCurrentResourceUtilization(),
        qualityScore: step.success ? 1 : 0,
        userSatisfaction: step.success ? 0.9 : 0.3,
        costEfficiency: await this.calculateStepCostEfficiency(workflowId, step.stepId, duration),
        timeToCompletion: duration,
        parallelization: 0, // Individual step doesn't have parallelization
        optimization: 0.5 // Default optimization score
      }

      const snapshot: PerformanceSnapshot = {
        workflowId,
        stepId: step.stepId,
        timestamp: step.endTime,
        metrics,
        context: context || this.createDefaultContext(`${workflowId}_${step.stepId}`),
        environment: await this.getEnvironmentInfo()
      }

      // Store step snapshot
      const stepKey = `${workflowId}:${step.stepId}`
      const stepSnapshots = this.snapshots.get(stepKey) || []
      stepSnapshots.push(snapshot)
      this.snapshots.set(stepKey, stepSnapshots)

      // Record step metrics
      await metricsCollector.recordMetric(
        'step_execution_duration',
        duration,
        'milliseconds',
        { 
          workflowId,
          stepId: step.stepId,
          success: step.success.toString()
        }
      )

    } catch (error) {
      logger.error('Failed to record step execution metrics', error instanceof Error ? error : undefined, {
        workflowId,
        stepId: step.stepId
      }, 'performance')
    }
  }

  /**
   * Get workflow performance metrics
   */
  async getWorkflowMetrics(workflowId: string, timeframe?: number): Promise<WorkflowMetrics> {
    try {
      const snapshots = this.getFilteredSnapshots(workflowId, timeframe)
      
      if (snapshots.length === 0) {
        return this.getDefaultWorkflowMetrics()
      }

      const executionCount = snapshots.length
      const successfulExecutions = snapshots.filter(s => s.metrics.errorRate === 0).length
      const successRate = successfulExecutions / executionCount

      const avgDuration = snapshots.reduce((sum, s) => sum + s.metrics.latency, 0) / snapshots.length
      const lastDuration = snapshots[snapshots.length - 1]?.metrics.latency || 0
      const avgErrorRate = snapshots.reduce((sum, s) => sum + s.metrics.errorRate, 0) / snapshots.length

      // Calculate bottlenecks
      const bottlenecks = await this.identifyBottlenecks(workflowId, snapshots)

      // Aggregate performance metrics
      const performance: PerformanceMetrics = {
        throughput: executionCount / (timeframe || 24), // Per hour
        latency: avgDuration,
        errorRate: avgErrorRate,
        resourceUtilization: this.aggregateResourceUtilization(snapshots),
        qualityScore: snapshots.reduce((sum, s) => sum + s.metrics.qualityScore, 0) / snapshots.length,
        userSatisfaction: snapshots.reduce((sum, s) => sum + s.metrics.userSatisfaction, 0) / snapshots.length,
        costEfficiency: snapshots.reduce((sum, s) => sum + s.metrics.costEfficiency, 0) / snapshots.length,
        timeToCompletion: avgDuration,
        parallelization: snapshots.reduce((sum, s) => sum + s.metrics.parallelization, 0) / snapshots.length,
        optimization: snapshots.reduce((sum, s) => sum + s.metrics.optimization, 0) / snapshots.length
      }

      const efficiency = this.calculateEfficiencyMetrics(snapshots)
      const quality = this.calculateQualityMetrics(snapshots)
      const cost = this.calculateCostMetrics(workflowId, snapshots)

      return {
        executionCount,
        successRate,
        averageDuration: avgDuration,
        lastDuration,
        errorRate: avgErrorRate,
        bottlenecks,
        performance,
        efficiency,
        qualityMetrics: quality,
        costMetrics: cost
      }

    } catch (error) {
      logger.error('Failed to get workflow metrics', error instanceof Error ? error : undefined, {
        workflowId
      }, 'performance')
      
      return this.getDefaultWorkflowMetrics()
    }
  }

  /**
   * Get step performance metrics
   */
  async getStepMetrics(workflowId: string, stepId: string, timeframe?: number): Promise<{
    averageDuration: number
    medianDuration: number
    p95Duration: number
    successRate: number
    errorRate: number
    retryRate: number
    resourceUsage: Record<string, number>
    waitTime: number
    processingTime: number
  }> {
    try {
      const stepKey = `${workflowId}:${stepId}`
      const snapshots = this.getFilteredSnapshots(stepKey, timeframe)
      
      if (snapshots.length === 0) {
        return {
          averageDuration: 0,
          medianDuration: 0,
          p95Duration: 0,
          successRate: 0,
          errorRate: 0,
          retryRate: 0,
          resourceUsage: {},
          waitTime: 0,
          processingTime: 0
        }
      }

      const durations = snapshots.map(s => s.metrics.latency).sort((a, b) => a - b)
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length
      const medianDuration = durations[Math.floor(durations.length / 2)]
      const p95Duration = durations[Math.floor(durations.length * 0.95)]

      const successfulExecutions = snapshots.filter(s => s.metrics.errorRate === 0).length
      const successRate = successfulExecutions / snapshots.length
      const errorRate = 1 - successRate

      const resourceUsage = this.aggregateResourceUtilization(snapshots)

      return {
        averageDuration: avgDuration,
        medianDuration,
        p95Duration,
        successRate,
        errorRate,
        retryRate: 0, // Would be calculated from retry data
        resourceUsage: {
          cpu: resourceUsage.cpu,
          memory: resourceUsage.memory,
          storage: resourceUsage.storage,
          network: resourceUsage.network,
          human: resourceUsage.human
        },
        waitTime: avgDuration * 0.1, // Mock - 10% of total time
        processingTime: avgDuration * 0.9 // Mock - 90% of total time
      }

    } catch (error) {
      logger.error('Failed to get step metrics', error instanceof Error ? error : undefined, {
        workflowId,
        stepId
      }, 'performance')
      
      throw error
    }
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(
    workflowId?: string,
    timeframe = '7d'
  ): Promise<PerformanceReport> {
    try {
      const timeframeDays = this.parseTimeframe(timeframe)
      const since = Date.now() - (timeframeDays * 24 * 60 * 60 * 1000)

      // Get summary metrics
      const summary = await this.calculatePerformanceSummary(workflowId, since)
      
      // Analyze trends
      const trends = await this.analyzePerformanceTrends(workflowId, since)
      
      // Get recent alerts
      const alerts = await this.getRecentAlerts(workflowId, since)
      
      // Get optimizations
      const optimizations = await this.getOptimizations(workflowId, since)
      
      // Generate recommendations
      const recommendations = await this.generatePerformanceRecommendations(workflowId, summary, trends)
      
      // Get benchmarks
      const benchmarks = await this.getPerformanceBenchmarks(workflowId)

      return {
        workflowId,
        timeframe,
        summary,
        trends,
        alerts,
        optimizations,
        recommendations,
        benchmarks
      }

    } catch (error) {
      logger.error('Failed to generate performance report', error instanceof Error ? error : undefined, {
        workflowId,
        timeframe
      }, 'performance')
      
      throw error
    }
  }

  /**
   * Set performance baseline
   */
  async setPerformanceBaseline(
    workflowId: string,
    stepId?: string,
    metric?: string
  ): Promise<PerformanceBaseline[]> {
    try {
      const key = stepId ? `${workflowId}:${stepId}` : workflowId
      const snapshots = this.getFilteredSnapshots(key, 24) // Last 24 hours
      
      if (snapshots.length < 10) {
        throw new Error('Insufficient data for baseline calculation (minimum 10 samples required)')
      }

      const baselines: PerformanceBaseline[] = []
      const metrics = metric ? [metric] : ['latency', 'errorRate', 'throughput', 'resourceUtilization']

      for (const metricName of metrics) {
        const values = snapshots.map(s => this.extractMetricValue(s.metrics, metricName))
        const baselineValue = values.reduce((sum, v) => sum + v, 0) / values.length
        
        const baseline: PerformanceBaseline = {
          workflowId,
          stepId,
          metric: metricName,
          baselineValue,
          sampleSize: values.length,
          confidence: this.calculateBaselineConfidence(values),
          calculatedAt: Date.now(),
          validUntil: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
        }

        baselines.push(baseline)
      }

      // Store baselines
      const existingBaselines = this.baselines.get(key) || []
      const updatedBaselines = [...existingBaselines.filter(b => !baselines.some(nb => nb.metric === b.metric)), ...baselines]
      this.baselines.set(key, updatedBaselines)

      logger.info('Performance baselines set', {
        workflowId,
        stepId,
        metrics: baselines.length,
        sampleSize: snapshots.length
      }, 'performance')

      return baselines

    } catch (error) {
      logger.error('Failed to set performance baseline', error instanceof Error ? error : undefined, {
        workflowId,
        stepId,
        metric
      }, 'performance')
      
      throw error
    }
  }

  /**
   * Check for performance alerts
   */
  async checkPerformanceAlerts(
    workflowId: string,
    metrics: PerformanceMetrics
  ): Promise<PerformanceAlert[]> {
    try {
      const alerts: PerformanceAlert[] = []

      // Check latency threshold
      if (metrics.latency > this.config.alertThresholds.latency) {
        alerts.push(this.createAlert(
          'high_latency',
          'High Latency Detected',
          `Workflow latency ${metrics.latency}ms exceeds threshold ${this.config.alertThresholds.latency}ms`,
          metrics.latency,
          this.config.alertThresholds.latency,
          workflowId
        ))
      }

      // Check error rate threshold
      if (metrics.errorRate > this.config.alertThresholds.errorRate) {
        alerts.push(this.createAlert(
          'high_error_rate',
          'High Error Rate Detected',
          `Error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds threshold ${(this.config.alertThresholds.errorRate * 100).toFixed(2)}%`,
          metrics.errorRate,
          this.config.alertThresholds.errorRate,
          workflowId
        ))
      }

      // Check resource utilization
      if (metrics.resourceUtilization.cpu > this.config.alertThresholds.cpuUtilization) {
        alerts.push(this.createAlert(
          'high_cpu_usage',
          'High CPU Usage Detected',
          `CPU utilization ${(metrics.resourceUtilization.cpu * 100).toFixed(2)}% exceeds threshold ${(this.config.alertThresholds.cpuUtilization * 100).toFixed(2)}%`,
          metrics.resourceUtilization.cpu,
          this.config.alertThresholds.cpuUtilization,
          workflowId
        ))
      }

      // Store alerts
      if (alerts.length > 0) {
        const workflowAlerts = this.alerts.get(workflowId) || []
        workflowAlerts.push(...alerts)
        this.alerts.set(workflowId, workflowAlerts)

        // Log alerts
        for (const alert of alerts) {
          logger.warn('Performance alert triggered', {
            alertId: alert.id,
            workflowId,
            metric: alert.metric,
            value: alert.value,
            threshold: alert.threshold
          }, 'performance')
        }
      }

      return alerts

    } catch (error) {
      logger.error('Failed to check performance alerts', error instanceof Error ? error : undefined, {
        workflowId
      }, 'performance')
      
      return []
    }
  }

  /**
   * Shutdown performance tracker
   */
  async shutdown(): Promise<void> {
    await this.savePerformanceData()
    
    this.snapshots.clear()
    this.baselines.clear()
    this.alerts.clear()
    this.optimizations.clear()
    
    logger.info('Performance tracker shutdown complete')
  }

  // Private helper methods

  private getFilteredSnapshots(key: string, timeframe?: number): PerformanceSnapshot[] {
    const snapshots = this.snapshots.get(key) || []
    
    if (!timeframe) {
      return snapshots
    }

    const cutoff = Date.now() - (timeframe * 60 * 60 * 1000) // timeframe in hours
    return snapshots.filter(s => s.timestamp >= cutoff)
  }

  private async getCurrentResourceUtilization(): Promise<ResourceUtilization> {
    // In production, would get actual resource metrics
    return {
      cpu: Math.random() * 0.8 + 0.1, // 10-90%
      memory: Math.random() * 0.6 + 0.2, // 20-80%
      storage: Math.random() * 0.4 + 0.1, // 10-50%
      network: Math.random() * 0.3 + 0.05, // 5-35%
      human: 0 // Automated execution
    }
  }

  private async calculateCostEfficiency(workflowId: string, duration: number): Promise<number> {
    // Mock cost efficiency calculation
    const baseCost = 0.001 // $0.001 per second
    const actualCost = (duration / 1000) * baseCost
    const targetCost = 0.1 // $0.10 target
    
    return Math.max(0, Math.min(1, targetCost / actualCost))
  }

  private async calculateStepCostEfficiency(workflowId: string, stepId: string, duration: number): Promise<number> {
    // Mock step cost efficiency calculation
    return this.calculateCostEfficiency(workflowId, duration)
  }

  private async calculateParallelization(steps: any[]): Promise<number> {
    // Calculate how much parallelization was achieved
    if (steps.length <= 1) return 0

    const totalDuration = steps.reduce((sum, s) => sum + (s.endTime - s.startTime), 0)
    const maxDuration = Math.max(...steps.map(s => s.endTime - s.startTime))
    
    return Math.max(0, 1 - (maxDuration / totalDuration))
  }

  private async calculateOptimizationScore(workflowId: string): Promise<number> {
    // Mock optimization score based on recent optimizations
    const optimizations = this.optimizations.get(workflowId) || []
    const recentOptimizations = optimizations.filter(o => 
      Date.now() - o.implementedAt < 30 * 24 * 60 * 60 * 1000 // Last 30 days
    )
    
    if (recentOptimizations.length === 0) return 0.5

    const avgImprovement = recentOptimizations.reduce((sum, o) => sum + o.improvement, 0) / recentOptimizations.length
    return Math.min(1, avgImprovement / 100) // Convert percentage to 0-1 scale
  }

  private createDefaultContext(executionId: string): PerformanceContext {
    return {
      executionId,
      environment: process.env.NODE_ENV as any || 'development',
      version: '1.0.0'
    }
  }

  private async getEnvironmentInfo(): Promise<EnvironmentInfo> {
    // In production, would get actual environment info
    return {
      platform: process.platform,
      cpuCores: 4,
      totalMemory: 8192, // 8GB
      availableMemory: 4096, // 4GB
      networkLatency: 50, // 50ms
      serverLoad: 0.3 // 30%
    }
  }

  private getDefaultWorkflowMetrics(): WorkflowMetrics {
    return {
      executionCount: 0,
      successRate: 0,
      averageDuration: 0,
      lastDuration: 0,
      errorRate: 0,
      bottlenecks: [],
      performance: {
        throughput: 0,
        latency: 0,
        errorRate: 0,
        resourceUtilization: { cpu: 0, memory: 0, storage: 0, network: 0, human: 0 },
        qualityScore: 0,
        userSatisfaction: 0,
        costEfficiency: 0,
        timeToCompletion: 0,
        parallelization: 0,
        optimization: 0
      },
      efficiency: {
        resourceUtilization: 0,
        wasteReduction: 0,
        parallelizationRatio: 0,
        automationRatio: 0,
        cycleTimeReduction: 0
      },
      qualityMetrics: {
        accuracy: 0,
        completeness: 0,
        consistency: 0,
        compliance: 0,
        userSatisfaction: 0
      },
      costMetrics: {
        totalCost: 0,
        costPerExecution: 0,
        laborCost: 0,
        resourceCost: 0,
        opportunityCost: 0
      }
    }
  }

  private async identifyBottlenecks(workflowId: string, snapshots: PerformanceSnapshot[]): Promise<any[]> {
    // Mock bottleneck identification
    return []
  }

  private aggregateResourceUtilization(snapshots: PerformanceSnapshot[]): ResourceUtilization {
    if (snapshots.length === 0) {
      return { cpu: 0, memory: 0, storage: 0, network: 0, human: 0 }
    }

    return {
      cpu: snapshots.reduce((sum, s) => sum + s.metrics.resourceUtilization.cpu, 0) / snapshots.length,
      memory: snapshots.reduce((sum, s) => sum + s.metrics.resourceUtilization.memory, 0) / snapshots.length,
      storage: snapshots.reduce((sum, s) => sum + s.metrics.resourceUtilization.storage, 0) / snapshots.length,
      network: snapshots.reduce((sum, s) => sum + s.metrics.resourceUtilization.network, 0) / snapshots.length,
      human: snapshots.reduce((sum, s) => sum + s.metrics.resourceUtilization.human, 0) / snapshots.length
    }
  }

  private calculateEfficiencyMetrics(snapshots: PerformanceSnapshot[]): any {
    return {
      resourceUtilization: 0.7,
      wasteReduction: 0.3,
      parallelizationRatio: 0.4,
      automationRatio: 0.8,
      cycleTimeReduction: 0.2
    }
  }

  private calculateQualityMetrics(snapshots: PerformanceSnapshot[]): any {
    return {
      accuracy: 0.95,
      completeness: 0.98,
      consistency: 0.92,
      compliance: 0.99,
      userSatisfaction: 0.87
    }
  }

  private calculateCostMetrics(workflowId: string, snapshots: PerformanceSnapshot[]): any {
    return {
      totalCost: 100,
      costPerExecution: 5,
      laborCost: 60,
      resourceCost: 30,
      opportunityCost: 10
    }
  }

  private parseTimeframe(timeframe: string): number {
    const match = timeframe.match(/^(\d+)([hdw])$/)
    if (!match) return 7 // Default 7 days

    const value = parseInt(match[1])
    const unit = match[2]

    switch (unit) {
      case 'h': return value / 24 // Convert hours to days
      case 'd': return value
      case 'w': return value * 7
      default: return 7
    }
  }

  private async calculatePerformanceSummary(workflowId?: string, since?: number): Promise<PerformanceSummary> {
    // Mock summary calculation
    return {
      totalExecutions: 150,
      averageLatency: 2500,
      successRate: 0.95,
      errorRate: 0.05,
      throughput: 25,
      resourceEfficiency: 0.75,
      userSatisfaction: 0.88,
      costEfficiency: 0.82
    }
  }

  private async analyzePerformanceTrends(workflowId?: string, since?: number): Promise<PerformanceTrend[]> {
    // Mock trends analysis
    return [
      {
        metric: 'latency',
        timeframe: '7d',
        dataPoints: [
          { timestamp: Date.now() - 6*24*60*60*1000, value: 2800 },
          { timestamp: Date.now() - 3*24*60*60*1000, value: 2600 },
          { timestamp: Date.now(), value: 2400 }
        ],
        trend: 'improving',
        changeRate: -0.14, // 14% improvement
        forecast: {
          predictedValue: 2200,
          confidence: 0.8,
          timeframe: '7d',
          factors: ['optimization_improvements', 'reduced_load']
        }
      }
    ]
  }

  private async getRecentAlerts(workflowId?: string, since?: number): Promise<PerformanceAlert[]> {
    const allAlerts = workflowId 
      ? this.alerts.get(workflowId) || []
      : Array.from(this.alerts.values()).flat()

    return since 
      ? allAlerts.filter(a => a.timestamp >= since)
      : allAlerts.slice(-10) // Last 10 alerts
  }

  private async getOptimizations(workflowId?: string, since?: number): Promise<PerformanceOptimization[]> {
    const allOptimizations = workflowId
      ? this.optimizations.get(workflowId) || []
      : Array.from(this.optimizations.values()).flat()

    return since
      ? allOptimizations.filter(o => o.implementedAt >= since)
      : allOptimizations.slice(-10) // Last 10 optimizations
  }

  private async generatePerformanceRecommendations(
    workflowId?: string,
    summary?: PerformanceSummary,
    trends?: PerformanceTrend[]
  ): Promise<PerformanceRecommendation[]> {
    const recommendations: PerformanceRecommendation[] = []

    if (summary && summary.averageLatency > 3000) {
      recommendations.push({
        type: 'optimization',
        priority: 'high',
        title: 'Optimize High Latency',
        description: 'Average latency exceeds 3 seconds',
        rationale: 'High latency impacts user experience and system throughput',
        expectedImprovement: 30,
        effort: 6,
        implementation: [
          'Identify bottleneck steps',
          'Implement caching where appropriate',
          'Optimize database queries',
          'Consider parallelization'
        ],
        risks: ['Temporary performance impact during optimization']
      })
    }

    if (summary && summary.resourceEfficiency < 0.6) {
      recommendations.push({
        type: 'scaling',
        priority: 'medium',
        title: 'Improve Resource Efficiency',
        description: 'Resource efficiency is below optimal threshold',
        rationale: 'Poor resource efficiency increases costs and reduces capacity',
        expectedImprovement: 25,
        effort: 4,
        implementation: [
          'Right-size resource allocation',
          'Implement resource pooling',
          'Optimize resource usage patterns'
        ],
        risks: ['May require infrastructure changes']
      })
    }

    return recommendations
  }

  private async getPerformanceBenchmarks(workflowId?: string): Promise<PerformanceBenchmark[]> {
    // Mock benchmarks
    return [
      {
        category: 'workflow_automation',
        metric: 'latency',
        percentiles: {
          P50: 1500,
          P75: 2200,
          P90: 3000,
          P95: 4000,
          P99: 6000
        },
        industry: 'government_contracting',
        source: 'industry_study_2024',
        updatedAt: Date.now() - 30*24*60*60*1000
      }
    ]
  }

  private extractMetricValue(metrics: PerformanceMetrics, metricName: string): number {
    switch (metricName) {
      case 'latency': return metrics.latency
      case 'errorRate': return metrics.errorRate
      case 'throughput': return metrics.throughput
      case 'resourceUtilization': return (
        metrics.resourceUtilization.cpu + 
        metrics.resourceUtilization.memory + 
        metrics.resourceUtilization.storage + 
        metrics.resourceUtilization.network
      ) / 4
      default: return 0
    }
  }

  private calculateBaselineConfidence(values: number[]): number {
    if (values.length < 10) return 0.5

    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)
    const coefficientOfVariation = stdDev / mean

    // Lower coefficient of variation = higher confidence
    return Math.max(0.1, Math.min(0.95, 1 - coefficientOfVariation))
  }

  private createAlert(
    type: string,
    title: string,
    message: string,
    value: number,
    threshold: number,
    workflowId?: string,
    stepId?: string
  ): PerformanceAlert {
    const severity = this.calculateAlertSeverity(value, threshold, type)
    
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      severity,
      type: 'threshold',
      metric: type,
      message,
      value,
      threshold,
      workflowId,
      stepId,
      timestamp: Date.now(),
      resolved: false,
      actions: [
        {
          action: 'investigate',
          description: 'Investigate the root cause of the performance issue',
          automated: false,
          executed: false
        },
        {
          action: 'notify_team',
          description: 'Notify the development team',
          automated: true,
          executed: false
        }
      ]
    }
  }

  private calculateAlertSeverity(value: number, threshold: number, type: string): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = value / threshold

    if (ratio >= 3) return 'critical'
    if (ratio >= 2) return 'high'
    if (ratio >= 1.5) return 'medium'
    return 'low'
  }

  // Periodic maintenance methods
  private async cleanupOldData(): Promise<void> {
    const cutoff = Date.now() - (this.config.metricsRetention * 24 * 60 * 60 * 1000)

    // Clean up old snapshots
    for (const [key, snapshots] of this.snapshots) {
      const filtered = snapshots.filter(s => s.timestamp >= cutoff)
      this.snapshots.set(key, filtered)
    }

    // Clean up old alerts
    for (const [key, alerts] of this.alerts) {
      const filtered = alerts.filter(a => a.timestamp >= cutoff)
      this.alerts.set(key, filtered)
    }
  }

  private async updateBaselines(): Promise<void> {
    // Update performance baselines for all workflows
    for (const workflowId of this.snapshots.keys()) {
      if (!workflowId.includes(':')) { // Workflow-level snapshots only
        try {
          await this.setPerformanceBaseline(workflowId)
        } catch (error) {
          logger.debug('Failed to update baseline', { workflowId }, 'performance')
        }
      }
    }
  }

  // Data persistence methods
  private async loadPerformanceData(): Promise<void> {
    // In production, load from database
  }

  private async savePerformanceData(): Promise<void> {
    // In production, save to database
  }

  private async initializeBaselines(): Promise<void> {
    // In production, load existing baselines
  }
}

export default PerformanceTracker