/**
 * Cache Manager
 * 
 * Orchestrates multi-layer caching with intelligent cache strategies,
 * analytics, and performance optimization
 */

import { CacheProvider } from './types'
import { CacheAnalytics } from './cache-analytics'
import { CacheStrategy, CacheStrategyType } from './cache-strategies'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'

export interface CacheManagerConfig {
  l1Cache: CacheProvider // Memory cache
  l2Cache: CacheProvider // Redis cache
  analytics?: CacheAnalytics
  config: {
    defaultTTL: number
    compressionThreshold: number
    maxValueSize: number
    enableCompression: boolean
    enableAnalytics: boolean
  }
}

export interface CacheOptions {
  ttl?: number
  strategy?: CacheStrategyType
  skipL1?: boolean
  skipL2?: boolean
  compress?: boolean
  tags?: string[]
}

export interface CacheStatistics {
  l1: {
    hits: number
    misses: number
    hitRate: number
    size: number
    keys: number
  }
  l2: {
    hits: number
    misses: number
    hitRate: number
    size: number
    keys: number
  }
  overall: {
    hits: number
    misses: number
    hitRate: number
    avgResponseTime: number
    memoryUsage: number
  }
  analytics?: any
}

export interface CacheWarmupJob {
  key: string
  factory: () => Promise<any>
  ttl?: number
  strategy?: CacheStrategyType
  priority?: number
}

export class CacheManager {
  private l1Cache: CacheProvider
  private l2Cache: CacheProvider
  private analytics?: CacheAnalytics
  private config: CacheManagerConfig['config']
  private strategy: CacheStrategy
  private stats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    totalRequests: 0,
    totalResponseTime: 0
  }
  private warmupQueue: CacheWarmupJob[] = []
  private isWarmingUp = false

  constructor(config: CacheManagerConfig) {
    this.l1Cache = config.l1Cache
    this.l2Cache = config.l2Cache
    this.analytics = config.analytics
    this.config = config.config
    this.strategy = new CacheStrategy(this.config)
  }

  /**
   * Initialize cache manager and all providers
   */
  async initialize(): Promise<void> {
    try {
      // Initialize cache providers
      await Promise.all([
        this.l1Cache.initialize(),
        this.l2Cache.initialize()
      ])

      // Initialize analytics if enabled
      if (this.analytics) {
        await this.analytics.initialize()
      }

      // Start background tasks
      this.startBackgroundTasks()

      logger.info('Cache manager initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize cache manager', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Get value from cache with multi-layer fallback
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const startTime = Date.now()
    
    try {
      this.stats.totalRequests++

      // Try L1 cache first (memory)
      if (!options.skipL1) {
        const l1Value = await this.l1Cache.get<T>(key)
        if (l1Value !== null) {
          this.stats.l1Hits++
          this.recordMetrics('get', 'l1_hit', Date.now() - startTime)
          this.analytics?.recordHit('l1', key)
          return l1Value
        }
        this.stats.l1Misses++
      }

      // Try L2 cache (Redis)
      if (!options.skipL2) {
        const l2Value = await this.l2Cache.get<T>(key)
        if (l2Value !== null) {
          this.stats.l2Hits++
          
          // Promote to L1 cache
          if (!options.skipL1) {
            const l1TTL = this.strategy.calculateL1TTL(options.ttl || this.config.defaultTTL)
            await this.l1Cache.set(key, l2Value, l1TTL)
          }
          
          this.recordMetrics('get', 'l2_hit', Date.now() - startTime)
          this.analytics?.recordHit('l2', key)
          return l2Value
        }
        this.stats.l2Misses++
      }

      // Cache miss
      this.recordMetrics('get', 'miss', Date.now() - startTime)
      this.analytics?.recordMiss(key)
      return null

    } catch (error) {
      logger.error('Cache get operation failed', error instanceof Error ? error : undefined, { key })
      this.recordMetrics('get', 'error', Date.now() - startTime)
      return null
    } finally {
      this.stats.totalResponseTime += Date.now() - startTime
    }
  }

  /**
   * Set value in cache with intelligent distribution
   */
  async set<T>(key: string, value: T, ttl?: number, options: CacheOptions = {}): Promise<void> {
    const startTime = Date.now()
    
    try {
      const effectiveTTL = ttl || this.config.defaultTTL
      const shouldCompress = this.shouldCompress(value, options.compress)
      const processedValue = shouldCompress ? await this.compress(value) : value

      // Validate value size
      if (this.getValueSize(processedValue) > this.config.maxValueSize) {
        logger.warn('Value too large for cache', { key, size: this.getValueSize(processedValue) })
        return
      }

      // Set in both caches based on strategy
      const strategy = options.strategy || this.strategy.getDefaultStrategy(key)
      const { l1TTL, l2TTL } = this.strategy.calculateTTLs(effectiveTTL, strategy)

      const operations: Promise<void>[] = []

      // Set in L1 cache (memory)
      if (!options.skipL1 && l1TTL > 0) {
        operations.push(this.l1Cache.set(key, processedValue, l1TTL))
      }

      // Set in L2 cache (Redis)
      if (!options.skipL2 && l2TTL > 0) {
        operations.push(this.l2Cache.set(key, processedValue, l2TTL))
      }

      await Promise.all(operations)

      // Record analytics
      this.analytics?.recordSet(key, this.getValueSize(processedValue), effectiveTTL)
      this.recordMetrics('set', 'success', Date.now() - startTime)

    } catch (error) {
      logger.error('Cache set operation failed', error instanceof Error ? error : undefined, { key })
      this.recordMetrics('set', 'error', Date.now() - startTime)
      throw error
    }
  }

  /**
   * Delete value from all cache layers
   */
  async delete(key: string): Promise<boolean> {
    const startTime = Date.now()
    
    try {
      const results = await Promise.allSettled([
        this.l1Cache.delete(key),
        this.l2Cache.delete(key)
      ])

      const deleted = results.some(result => 
        result.status === 'fulfilled' && result.value === true
      )

      this.analytics?.recordDelete(key)
      this.recordMetrics('delete', 'success', Date.now() - startTime)
      
      return deleted

    } catch (error) {
      logger.error('Cache delete operation failed', error instanceof Error ? error : undefined, { key })
      this.recordMetrics('delete', 'error', Date.now() - startTime)
      return false
    }
  }

  /**
   * Check if key exists in any cache layer
   */
  async exists(key: string): Promise<boolean> {
    try {
      // Check L1 first for speed
      if (await this.l1Cache.exists(key)) {
        return true
      }

      // Check L2
      return await this.l2Cache.exists(key)

    } catch (error) {
      logger.error('Cache exists operation failed', error instanceof Error ? error : undefined, { key })
      return false
    }
  }

  /**
   * Get or set value with factory function
   */
  async getOrSet<T>(
    key: string, 
    factory: () => Promise<T>, 
    ttl?: number, 
    options: CacheOptions = {}
  ): Promise<T> {
    try {
      // Try to get existing value
      const existing = await this.get<T>(key, options)
      if (existing !== null) {
        return existing
      }

      // Generate new value
      const startTime = Date.now()
      const value = await factory()
      const generationTime = Date.now() - startTime

      // Store in cache
      await this.set(key, value, ttl, options)

      // Record analytics
      this.analytics?.recordGeneration(key, generationTime)

      return value

    } catch (error) {
      logger.error('Cache getOrSet operation failed', error instanceof Error ? error : undefined, { key })
      throw error
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    try {
      const results = await Promise.all([
        this.l1Cache.invalidatePattern(pattern),
        this.l2Cache.invalidatePattern(pattern)
      ])

      const totalInvalidated = results.reduce((sum, count) => sum + count, 0)
      
      this.analytics?.recordInvalidation(pattern, totalInvalidated)
      
      logger.info('Cache pattern invalidated', { pattern, count: totalInvalidated })
      
      return totalInvalidated

    } catch (error) {
      logger.error('Cache pattern invalidation failed', error instanceof Error ? error : undefined, { pattern })
      return 0
    }
  }

  /**
   * Warm cache with multiple keys
   */
  async warmCache(jobs: CacheWarmupJob[]): Promise<void> {
    try {
      // Add jobs to warmup queue
      this.warmupQueue.push(...jobs)
      
      // Start warmup if not already running
      if (!this.isWarmingUp) {
        this.processWarmupQueue()
      }

      logger.info('Cache warmup initiated', { jobCount: jobs.length })

    } catch (error) {
      logger.error('Cache warmup failed', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Get comprehensive cache statistics
   */
  async getStatistics(): Promise<CacheStatistics> {
    try {
      const [l1Stats, l2Stats] = await Promise.all([
        this.l1Cache.getStatistics(),
        this.l2Cache.getStatistics()
      ])

      const totalHits = this.stats.l1Hits + this.stats.l2Hits
      const totalMisses = this.stats.l1Misses + this.stats.l2Misses
      const totalRequests = totalHits + totalMisses

      return {
        l1: {
          hits: this.stats.l1Hits,
          misses: this.stats.l1Misses,
          hitRate: this.stats.l1Hits / Math.max(1, this.stats.l1Hits + this.stats.l1Misses),
          size: l1Stats.size || 0,
          keys: l1Stats.keys || 0
        },
        l2: {
          hits: this.stats.l2Hits,
          misses: this.stats.l2Misses,
          hitRate: this.stats.l2Hits / Math.max(1, this.stats.l2Hits + this.stats.l2Misses),
          size: l2Stats.size || 0,
          keys: l2Stats.keys || 0
        },
        overall: {
          hits: totalHits,
          misses: totalMisses,
          hitRate: totalHits / Math.max(1, totalRequests),
          avgResponseTime: this.stats.totalResponseTime / Math.max(1, this.stats.totalRequests),
          memoryUsage: (l1Stats.size || 0) + (l2Stats.size || 0)
        },
        analytics: this.analytics ? await this.analytics.getStatistics() : undefined
      }

    } catch (error) {
      logger.error('Failed to get cache statistics', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    try {
      await Promise.all([
        this.l1Cache.clear(),
        this.l2Cache.clear()
      ])

      // Reset stats
      this.stats = {
        l1Hits: 0,
        l1Misses: 0,
        l2Hits: 0,
        l2Misses: 0,
        totalRequests: 0,
        totalResponseTime: 0
      }

      logger.info('All caches cleared')

    } catch (error) {
      logger.error('Failed to clear caches', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Shutdown cache manager and all providers
   */
  async shutdown(): Promise<void> {
    try {
      await Promise.all([
        this.l1Cache.shutdown(),
        this.l2Cache.shutdown(),
        this.analytics?.shutdown()
      ])

      logger.info('Cache manager shutdown complete')

    } catch (error) {
      logger.error('Cache manager shutdown failed', error instanceof Error ? error : undefined)
      throw error
    }
  }

  // Private helper methods

  private shouldCompress<T>(value: T, forceCompress?: boolean): boolean {
    if (forceCompress !== undefined) {
      return forceCompress
    }

    if (!this.config.enableCompression) {
      return false
    }

    const size = this.getValueSize(value)
    return size >= this.config.compressionThreshold
  }

  private async compress<T>(value: T): Promise<string> {
    try {
      const jsonString = JSON.stringify(value)
      // In production, would use actual compression library like zlib
      return `compressed:${jsonString}`
    } catch (error) {
      logger.error('Compression failed', error instanceof Error ? error : undefined)
      return value as any
    }
  }

  private async decompress<T>(value: string): Promise<T> {
    try {
      if (value.startsWith('compressed:')) {
        const jsonString = value.substring('compressed:'.length)
        return JSON.parse(jsonString)
      }
      return value as any
    } catch (error) {
      logger.error('Decompression failed', error instanceof Error ? error : undefined)
      return value as any
    }
  }

  private getValueSize<T>(value: T): number {
    try {
      return JSON.stringify(value).length
    } catch {
      return 0
    }
  }

  private recordMetrics(operation: string, result: string, duration: number): void {
    metricsCollector.recordMetric(
      `cache_${operation}_${result}`,
      1,
      'count',
      {}
    ).catch(() => {}) // Ignore metrics errors

    metricsCollector.recordMetric(
      `cache_${operation}_duration`,
      duration,
      'milliseconds',
      { result }
    ).catch(() => {}) // Ignore metrics errors
  }

  private startBackgroundTasks(): void {
    // Periodic cache cleanup
    setInterval(async () => {
      try {
        await this.cleanup()
      } catch (error) {
        logger.error('Cache cleanup failed', error instanceof Error ? error : undefined)
      }
    }, 5 * 60 * 1000) // Every 5 minutes

    // Periodic statistics reporting
    setInterval(async () => {
      try {
        const stats = await this.getStatistics()
        logger.debug('Cache statistics', stats)
      } catch (error) {
        logger.debug('Failed to report cache statistics', error instanceof Error ? error : undefined)
      }
    }, 15 * 60 * 1000) // Every 15 minutes
  }

  private async cleanup(): Promise<void> {
    try {
      // Cleanup expired entries
      await Promise.all([
        this.l1Cache.cleanup?.(),
        this.l2Cache.cleanup?.()
      ])

      // Analytics cleanup
      await this.analytics?.cleanup?.()

    } catch (error) {
      logger.error('Cache cleanup failed', error instanceof Error ? error : undefined)
    }
  }

  private async processWarmupQueue(): Promise<void> {
    if (this.isWarmingUp || this.warmupQueue.length === 0) {
      return
    }

    this.isWarmingUp = true

    try {
      // Sort by priority (higher first)
      this.warmupQueue.sort((a, b) => (b.priority || 0) - (a.priority || 0))

      // Process jobs in batches
      const batchSize = 5
      while (this.warmupQueue.length > 0) {
        const batch = this.warmupQueue.splice(0, batchSize)
        
        await Promise.all(batch.map(async (job) => {
          try {
            const value = await job.factory()
            await this.set(job.key, value, job.ttl, { strategy: job.strategy })
          } catch (error) {
            logger.error('Cache warmup job failed', error instanceof Error ? error : undefined, { key: job.key })
          }
        }))

        // Small delay between batches to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100))
      }

    } finally {
      this.isWarmingUp = false
    }
  }
}

export default CacheManager