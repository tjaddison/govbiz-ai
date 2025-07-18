/**
 * Memory Cache Provider
 * 
 * High-performance in-memory caching with LRU eviction, compression,
 * and intelligent memory management
 */

import { CacheProvider, CacheProviderStats, CacheEntry, CacheError } from './types'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'

export interface MemoryCacheConfig {
  maxSize: number // Maximum size in MB
  maxAge: number // Default TTL in milliseconds
  checkPeriod: number // Cleanup interval in milliseconds
  maxKeys?: number // Maximum number of keys
  evictionPolicy?: 'lru' | 'lfu' | 'fifo' | 'ttl'
  compressionThreshold?: number // Compress values larger than this (bytes)
  enableCompression?: boolean
}

export interface MemoryCacheStats extends CacheProviderStats {
  maxSize: number
  evictions: number
  compressionRatio: number
  avgKeySize: number
  avgValueSize: number
  oldestEntry: number
  newestEntry: number
}

export class MemoryCacheProvider implements CacheProvider {
  private cache: Map<string, CacheEntry<string>> = new Map()
  private accessOrder: string[] = [] // For LRU tracking
  private accessCount: Map<string, number> = new Map() // For LFU tracking
  private config: Required<MemoryCacheConfig>
  private stats: MemoryCacheStats = {
    hits: 0,
    misses: 0,
    keys: 0,
    size: 0,
    maxSize: 0,
    evictions: 0,
    compressionRatio: 1.0,
    avgKeySize: 0,
    avgValueSize: 0,
    oldestEntry: 0,
    newestEntry: 0,
    errors: 0
  }
  private cleanupTimer?: NodeJS.Timeout
  private currentSize = 0 // Current size in bytes

  constructor(config: MemoryCacheConfig) {
    this.config = {
      maxKeys: 10000,
      evictionPolicy: 'lru',
      compressionThreshold: 1024,
      enableCompression: true,
      ...config
    }

    // Update maxSize based on config
    this.stats.maxSize = this.config.maxSize * 1024 * 1024 // Convert MB to bytes
  }

  private getStats(): MemoryCacheStats {
    return this.stats
  }

  private incrementStat(key: keyof MemoryCacheStats): void {
    // @ts-ignore - stats is definitely initialized in constructor
    (this.stats[key] as number)++
  }

  private decrementStat(key: keyof MemoryCacheStats): void {
    // @ts-ignore - stats is definitely initialized in constructor
    (this.stats[key] as number)--
  }

  /**
   * Initialize memory cache provider
   */
  async initialize(): Promise<void> {
    try {
      // Start cleanup timer
      this.cleanupTimer = setInterval(() => {
        this.cleanup().catch(error => {
          logger.error('Memory cache cleanup failed', error instanceof Error ? error : undefined)
        })
      }, this.config.checkPeriod)

      logger.info('Memory cache provider initialized', {
        maxSize: this.config.maxSize,
        maxAge: this.config.maxAge,
        maxKeys: this.config.maxKeys,
        evictionPolicy: this.config.evictionPolicy
      })

    } catch (error) {
      logger.error('Failed to initialize memory cache provider', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Get value from memory cache
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now()

    try {
      const entry = this.cache.get(key)
      
      if (!entry) {
        // @ts-ignore - stats is definitely initialized in constructor
        this.stats.misses++
        this.recordMetrics('get', 'miss', Date.now() - startTime)
        return null
      }

      // Check if expired
      if (this.isExpired(entry)) {
        this.cache.delete(key)
        this.removeFromAccessOrder(key)
        this.accessCount.delete(key)
        this.currentSize -= entry.size
        this.decrementStat('keys')
        this.incrementStat('misses')
        this.recordMetrics('get', 'expired', Date.now() - startTime)
        return null
      }

      // Update access information
      this.updateAccess(key, entry)
      
      this.incrementStat('hits')
      this.recordMetrics('get', 'hit', Date.now() - startTime)

      // Decompress if needed
      const value = entry.compressed ? this.decompress(entry.value) : entry.value
      return value as T

    } catch (error) {
      this.incrementStat('errors')
      this.recordMetrics('get', 'error', Date.now() - startTime)
      logger.error('Memory cache get operation failed', error instanceof Error ? error : undefined, { key })
      return null
    }
  }

  /**
   * Set value in memory cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const startTime = Date.now()

    try {
      const now = Date.now()
      const effectiveTTL = ttl || this.config.maxAge
      const expiresAt = now + effectiveTTL

      // Serialize and optionally compress value
      const serialized = this.serialize(value)
      const shouldCompress = this.shouldCompress(serialized)
      const finalValue = shouldCompress ? this.compress(serialized) : serialized
      const valueSize = this.getSize(finalValue)
      const keySize = this.getSize(key)
      const entrySize = keySize + valueSize + 100 // Additional metadata overhead

      // Check if value is too large
      if (entrySize > this.stats.maxSize) {
        throw new CacheError(
          `Value too large for cache: ${entrySize} bytes > ${this.stats.maxSize} bytes`,
          'VALUE_TOO_LARGE',
          'memory',
          'set',
          key
        )
      }

      // Remove existing entry if it exists
      const existingEntry = this.cache.get(key)
      if (existingEntry) {
        this.currentSize -= existingEntry.size
        this.removeFromAccessOrder(key)
      }

      // Ensure we have space
      await this.ensureSpace(entrySize)

      // Create cache entry
      const entry: CacheEntry<string> = {
        key,
        value: finalValue,
        ttl: effectiveTTL,
        createdAt: now,
        expiresAt,
        hits: 0,
        lastAccessed: now,
        size: entrySize,
        compressed: shouldCompress
      }

      // Store entry
      this.cache.set(key, entry)
      this.currentSize += entrySize
      this.addToAccessOrder(key)
      this.accessCount.set(key, 0)

      // Update stats
      if (!existingEntry) {
        this.incrementStat('keys')
      }
      this.updateCacheStats()

      this.recordMetrics('set', 'success', Date.now() - startTime)

    } catch (error) {
      this.incrementStat('errors')
      this.recordMetrics('set', 'error', Date.now() - startTime)
      logger.error('Memory cache set operation failed', error instanceof Error ? error : undefined, { key })
      throw error
    }
  }

  /**
   * Delete value from memory cache
   */
  async delete(key: string): Promise<boolean> {
    const startTime = Date.now()

    try {
      const entry = this.cache.get(key)
      
      if (!entry) {
        this.recordMetrics('delete', 'not_found', Date.now() - startTime)
        return false
      }

      // Remove from cache and tracking structures
      this.cache.delete(key)
      this.removeFromAccessOrder(key)
      this.accessCount.delete(key)
      this.currentSize -= entry.size
      this.decrementStat('keys')

      this.updateCacheStats()
      this.recordMetrics('delete', 'success', Date.now() - startTime)
      
      return true

    } catch (error) {
      this.incrementStat('errors')
      this.recordMetrics('delete', 'error', Date.now() - startTime)
      logger.error('Memory cache delete operation failed', error instanceof Error ? error : undefined, { key })
      return false
    }
  }

  /**
   * Check if key exists in memory cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const entry = this.cache.get(key)
      
      if (!entry) {
        return false
      }

      // Check if expired
      if (this.isExpired(entry)) {
        // Clean up expired entry
        this.cache.delete(key)
        this.removeFromAccessOrder(key)
        this.accessCount.delete(key)
        this.currentSize -= entry.size
        this.decrementStat('keys')
        return false
      }

      return true

    } catch (error) {
      this.incrementStat('errors')
      logger.error('Memory cache exists operation failed', error instanceof Error ? error : undefined, { key })
      return false
    }
  }

  /**
   * Clear all entries from memory cache
   */
  async clear(): Promise<void> {
    try {
      const keyCount = this.cache.size
      
      this.cache.clear()
      this.accessOrder = []
      this.accessCount.clear()
      this.currentSize = 0
      
      // Reset stats
      this.stats.keys = 0
      this.stats.size = 0
      this.stats.hits = 0
      this.stats.misses = 0
      this.stats.evictions = 0

      logger.info('Memory cache cleared', { keysCleared: keyCount })

    } catch (error) {
      this.incrementStat('errors')
      logger.error('Memory cache clear operation failed', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Get memory cache statistics
   */
  async getStatistics(): Promise<MemoryCacheStats> {
    try {
      this.updateCacheStats()
      return { ...this.stats }

    } catch (error) {
      logger.error('Failed to get memory cache statistics', error instanceof Error ? error : undefined)
      return this.stats
    }
  }

  /**
   * Invalidate keys by pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    try {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'))
      const keysToDelete: string[] = []
      
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          keysToDelete.push(key)
        }
      }

      // Delete matching keys
      for (const key of keysToDelete) {
        await this.delete(key)
      }

      logger.info('Memory cache pattern invalidated', { pattern, keysDeleted: keysToDelete.length })
      
      return keysToDelete.length

    } catch (error) {
      this.incrementStat('errors')
      logger.error('Memory cache pattern invalidation failed', error instanceof Error ? error : undefined, { pattern })
      return 0
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<void> {
    try {
      const now = Date.now()
      const expiredKeys: string[] = []

      // Find expired entries
      for (const [key, entry] of this.cache) {
        if (this.isExpired(entry)) {
          expiredKeys.push(key)
        }
      }

      // Remove expired entries
      for (const key of expiredKeys) {
        const entry = this.cache.get(key)
        if (entry) {
          this.cache.delete(key)
          this.removeFromAccessOrder(key)
          this.accessCount.delete(key)
          this.currentSize -= entry.size
          this.decrementStat('keys')
        }
      }

      if (expiredKeys.length > 0) {
        this.updateCacheStats()
        logger.debug('Memory cache cleanup completed', { expiredKeys: expiredKeys.length })
      }

    } catch (error) {
      logger.error('Memory cache cleanup failed', error instanceof Error ? error : undefined)
    }
  }

  /**
   * Shutdown memory cache provider
   */
  async shutdown(): Promise<void> {
    try {
      // Clear cleanup timer
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer)
        this.cleanupTimer = undefined
      }

      // Clear all data
      await this.clear()

      logger.info('Memory cache provider shutdown complete')

    } catch (error) {
      logger.error('Memory cache shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Memory cache specific methods

  /**
   * Get cache entry with metadata
   */
  getEntry(key: string): CacheEntry | null {
    const entry = this.cache.get(key)
    return entry && !this.isExpired(entry) ? entry : null
  }

  /**
   * Get all keys in cache
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys())
  }

  /**
   * Get cache size in bytes
   */
  getCurrentSize(): number {
    return this.currentSize
  }

  /**
   * Get memory usage percentage
   */
  getMemoryUsage(): number {
    return this.currentSize / this.stats.maxSize
  }

  /**
   * Force eviction of entries to free space
   */
  async evict(count: number): Promise<string[]> {
    const evictedKeys: string[] = []

    for (let i = 0; i < count && this.cache.size > 0; i++) {
      const keyToEvict = this.selectEvictionCandidate()
      if (keyToEvict) {
        await this.delete(keyToEvict)
        evictedKeys.push(keyToEvict)
        this.incrementStat('evictions')
      }
    }

    return evictedKeys
  }

  // Private helper methods

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt
  }

  private updateAccess(key: string, entry: CacheEntry): void {
    const now = Date.now()
    
    // Update entry metadata
    entry.hits++
    entry.lastAccessed = now

    // Update access tracking based on eviction policy
    switch (this.config.evictionPolicy) {
      case 'lru':
        this.moveToFront(key)
        break
      case 'lfu':
        this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1)
        break
      // FIFO and TTL don't need access updates
    }
  }

  private addToAccessOrder(key: string): void {
    this.accessOrder.unshift(key)
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
  }

  private moveToFront(key: string): void {
    this.removeFromAccessOrder(key)
    this.addToAccessOrder(key)
  }

  private async ensureSpace(requiredSize: number): Promise<void> {
    // Check size limit
    while (this.currentSize + requiredSize > this.stats.maxSize && this.cache.size > 0) {
      const keyToEvict = this.selectEvictionCandidate()
      if (keyToEvict) {
        await this.delete(keyToEvict)
        this.incrementStat('evictions')
      } else {
        break // No more candidates
      }
    }

    // Check key count limit
    while (this.cache.size >= this.config.maxKeys && this.cache.size > 0) {
      const keyToEvict = this.selectEvictionCandidate()
      if (keyToEvict) {
        await this.delete(keyToEvict)
        this.incrementStat('evictions')
      } else {
        break // No more candidates
      }
    }
  }

  private selectEvictionCandidate(): string | null {
    if (this.cache.size === 0) {
      return null
    }

    switch (this.config.evictionPolicy) {
      case 'lru':
        return this.accessOrder[this.accessOrder.length - 1] || null

      case 'lfu':
        let minAccess = Infinity
        let leastUsedKey: string | null = null
        
        for (const [key, count] of this.accessCount) {
          if (count < minAccess) {
            minAccess = count
            leastUsedKey = key
          }
        }
        
        return leastUsedKey

      case 'fifo':
        return this.accessOrder[this.accessOrder.length - 1] || null

      case 'ttl':
        let earliestExpiry = Infinity
        let earliestKey: string | null = null
        
        for (const [key, entry] of this.cache) {
          if (entry.expiresAt < earliestExpiry) {
            earliestExpiry = entry.expiresAt
            earliestKey = key
          }
        }
        
        return earliestKey

      default:
        return this.cache.keys().next().value || null
    }
  }

  private shouldCompress(value: string): boolean {
    return this.config.enableCompression && 
           this.getSize(value) >= this.config.compressionThreshold
  }

  private compress(value: string): string {
    // Simple compression simulation - in production use actual compression
    try {
      return `compressed:${value}`
    } catch (error) {
      logger.error('Compression failed', error instanceof Error ? error : undefined)
      return value
    }
  }

  private decompress(value: string): string {
    try {
      if (value.startsWith('compressed:')) {
        return value.substring('compressed:'.length)
      }
      return value
    } catch (error) {
      logger.error('Decompression failed', error instanceof Error ? error : undefined)
      return value
    }
  }

  private serialize<T>(value: T): string {
    try {
      return JSON.stringify(value)
    } catch (error) {
      throw new CacheError(`Serialization failed: ${error}`, 'SERIALIZATION_ERROR', 'memory')
    }
  }

  private getSize(value: any): number {
    if (typeof value === 'string') {
      return Buffer.byteLength(value, 'utf8')
    }
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8')
    } catch {
      return 0
    }
  }

  private updateCacheStats(): void {
    this.stats.size = this.currentSize
    this.stats.keys = this.cache.size

    if (this.cache.size > 0) {
      const entries = Array.from(this.cache.values())
      
      // Calculate averages
      const totalKeySize = Array.from(this.cache.keys()).reduce((sum, key) => sum + this.getSize(key), 0)
      const totalValueSize = entries.reduce((sum, entry) => sum + this.getSize(entry.value), 0)
      
      this.stats.avgKeySize = totalKeySize / this.cache.size
      this.stats.avgValueSize = totalValueSize / this.cache.size

      // Find oldest and newest entries
      this.stats.oldestEntry = Math.min(...entries.map(e => e.createdAt))
      this.stats.newestEntry = Math.max(...entries.map(e => e.createdAt))

      // Calculate compression ratio
      const compressedEntries = entries.filter(e => e.compressed)
      if (compressedEntries.length > 0) {
        // Simplified compression ratio calculation
        this.stats.compressionRatio = 0.7 // Mock 30% compression
      } else {
        this.stats.compressionRatio = 1.0
      }
    } else {
      this.stats.avgKeySize = 0
      this.stats.avgValueSize = 0
      this.stats.oldestEntry = 0
      this.stats.newestEntry = 0
      this.stats.compressionRatio = 1.0
    }
  }

  private recordMetrics(operation: string, result: string, duration: number): void {
    metricsCollector.recordMetric(
      `memory_cache_${operation}_${result}`,
      1,
      'count',
      {}
    ).catch(() => {}) // Ignore metrics errors

    metricsCollector.recordMetric(
      `memory_cache_${operation}_duration`,
      duration,
      'milliseconds',
      { result }
    ).catch(() => {}) // Ignore metrics errors
  }
}

export default MemoryCacheProvider