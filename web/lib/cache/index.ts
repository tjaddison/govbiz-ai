/**
 * Advanced Caching System
 * 
 * Multi-layer caching with intelligent cache management, performance optimization,
 * and automatic cache warming for government contracting workflows
 */

export * from './redis-cache'
export * from './memory-cache'
export * from './cache-manager'
export * from './cache-strategies'
export * from './cache-analytics'

import { RedisCacheProvider } from './redis-cache'
import { MemoryCacheProvider } from './memory-cache'
import { CacheManager } from './cache-manager'
import { CacheAnalytics } from './cache-analytics'
import { logger } from '@/lib/monitoring/logger'

// Cache configuration
export interface CacheConfig {
  redis: {
    host: string
    port: number
    password?: string
    db: number
    keyPrefix: string
    maxRetries: number
    retryDelay: number
  }
  memory: {
    maxSize: number // MB
    maxAge: number // milliseconds
    checkPeriod: number // milliseconds
  }
  strategies: {
    defaultTTL: number
    compressionThreshold: number
    maxValueSize: number
    enableCompression: boolean
    enableAnalytics: boolean
  }
}

// Default configuration
const defaultConfig: CacheConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: 'govbiz:',
    maxRetries: 3,
    retryDelay: 1000
  },
  memory: {
    maxSize: 100, // 100MB
    maxAge: 5 * 60 * 1000, // 5 minutes
    checkPeriod: 60 * 1000 // 1 minute
  },
  strategies: {
    defaultTTL: 30 * 60 * 1000, // 30 minutes
    compressionThreshold: 1024, // 1KB
    maxValueSize: 10 * 1024 * 1024, // 10MB
    enableCompression: true,
    enableAnalytics: true
  }
}

// Global cache instance
let cacheInstance: CacheManager | null = null

/**
 * Initialize the caching system
 */
export async function initializeCache(config: Partial<CacheConfig> = {}): Promise<CacheManager> {
  try {
    const finalConfig = { ...defaultConfig, ...config }
    
    // Initialize cache providers
    const redisCache = new RedisCacheProvider(finalConfig.redis)
    const memoryCache = new MemoryCacheProvider(finalConfig.memory)
    
    // Initialize analytics if enabled
    const analytics = finalConfig.strategies.enableAnalytics 
      ? new CacheAnalytics()
      : undefined
    
    // Create cache manager
    cacheInstance = new CacheManager({
      l1Cache: memoryCache,
      l2Cache: redisCache,
      analytics,
      config: finalConfig.strategies
    })
    
    // Initialize all components
    await cacheInstance.initialize()
    
    logger.info('Cache system initialized successfully', {
      redis: {
        host: finalConfig.redis.host,
        port: finalConfig.redis.port,
        db: finalConfig.redis.db
      },
      memory: {
        maxSize: finalConfig.memory.maxSize,
        maxAge: finalConfig.memory.maxAge
      },
      analytics: finalConfig.strategies.enableAnalytics
    })
    
    return cacheInstance
  } catch (error) {
    logger.error('Failed to initialize cache system', error instanceof Error ? error : undefined)
    throw error
  }
}

/**
 * Get the global cache instance
 */
export function getCache(): CacheManager {
  if (!cacheInstance) {
    throw new Error('Cache system not initialized. Call initializeCache() first.')
  }
  return cacheInstance
}

/**
 * Shutdown the caching system
 */
export async function shutdownCache(): Promise<void> {
  if (cacheInstance) {
    await cacheInstance.shutdown()
    cacheInstance = null
    logger.info('Cache system shutdown complete')
  }
}

// Convenience functions for common cache operations
export const cache = {
  /**
   * Get value from cache
   */
  get: async <T>(key: string): Promise<T | null> => {
    return getCache().get<T>(key)
  },

  /**
   * Set value in cache
   */
  set: async <T>(key: string, value: T, ttl?: number): Promise<void> => {
    return getCache().set(key, value, ttl)
  },

  /**
   * Delete value from cache
   */
  delete: async (key: string): Promise<boolean> => {
    return getCache().delete(key)
  },

  /**
   * Check if key exists in cache
   */
  exists: async (key: string): Promise<boolean> => {
    return getCache().exists(key)
  },

  /**
   * Get or set value with function
   */
  getOrSet: async <T>(
    key: string, 
    factory: () => Promise<T>, 
    ttl?: number
  ): Promise<T> => {
    return getCache().getOrSet(key, factory, ttl)
  },

  /**
   * Invalidate cache by pattern
   */
  invalidatePattern: async (pattern: string): Promise<number> => {
    return getCache().invalidatePattern(pattern)
  },

  /**
   * Get cache statistics
   */
  getStats: async () => {
    return getCache().getStatistics()
  },

  /**
   * Warm cache with data
   */
  warm: async (keys: Array<{ key: string; factory: () => Promise<any>; ttl?: number }>): Promise<void> => {
    return getCache().warmCache(keys)
  }
}

export default cache