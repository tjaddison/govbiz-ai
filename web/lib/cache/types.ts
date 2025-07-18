/**
 * Cache System Types
 * 
 * Core type definitions for the advanced caching system
 */

export interface CacheProvider {
  /**
   * Initialize the cache provider
   */
  initialize(): Promise<void>

  /**
   * Get value from cache
   */
  get<T>(key: string): Promise<T | null>

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>

  /**
   * Delete value from cache
   */
  delete(key: string): Promise<boolean>

  /**
   * Check if key exists
   */
  exists(key: string): Promise<boolean>

  /**
   * Clear all cache entries
   */
  clear(): Promise<void>

  /**
   * Get cache statistics
   */
  getStatistics(): Promise<CacheProviderStats>

  /**
   * Invalidate cache entries by pattern
   */
  invalidatePattern(pattern: string): Promise<number>

  /**
   * Cleanup expired entries (optional)
   */
  cleanup?(): Promise<void>

  /**
   * Shutdown the cache provider
   */
  shutdown(): Promise<void>
}

export interface CacheProviderStats {
  hits?: number
  misses?: number
  keys?: number
  size?: number // bytes
  memoryUsage?: number
  connections?: number
  errors?: number
}

export interface CacheEntry<T = any> {
  key: string
  value: T
  ttl: number
  createdAt: number
  expiresAt: number
  hits: number
  lastAccessed: number
  size: number
  compressed: boolean
  tags?: string[]
}

export interface CacheEvent {
  type: 'hit' | 'miss' | 'set' | 'delete' | 'expire' | 'evict'
  key: string
  timestamp: number
  layer: 'l1' | 'l2'
  metadata?: Record<string, any>
}

export interface CachePattern {
  pattern: string
  description: string
  ttl: number
  strategy: 'write-through' | 'write-behind' | 'write-around' | 'read-through'
  tags?: string[]
}

export interface CacheMetrics {
  requests: {
    total: number
    hits: number
    misses: number
    errors: number
  }
  latency: {
    avg: number
    p50: number
    p95: number
    p99: number
  }
  memory: {
    used: number
    available: number
    fragmentation: number
  }
  operations: {
    gets: number
    sets: number
    deletes: number
    invalidations: number
  }
  hitRate: number
  errorRate: number
}

export interface CacheHealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'
  provider: string
  timestamp: number
  metrics: {
    responseTime: number
    errorRate: number
    memoryUsage: number
    connectionCount: number
  }
  issues: CacheIssue[]
}

export interface CacheIssue {
  severity: 'low' | 'medium' | 'high' | 'critical'
  type: 'performance' | 'connectivity' | 'memory' | 'configuration'
  message: string
  details?: Record<string, any>
  timestamp: number
}

export interface CacheConfiguration {
  provider: 'memory' | 'redis' | 'hybrid'
  maxSize: number
  defaultTTL: number
  compressionEnabled: boolean
  compressionThreshold: number
  evictionPolicy: 'lru' | 'lfu' | 'fifo' | 'ttl'
  persistenceEnabled: boolean
  replicationEnabled: boolean
}

export interface CacheOperation {
  operation: 'get' | 'set' | 'delete' | 'exists' | 'clear' | 'invalidate'
  key: string
  startTime: number
  endTime?: number
  success: boolean
  error?: string
  metadata?: Record<string, any>
}

export interface CacheKey {
  namespace: string
  identifier: string
  version?: string
  tags?: string[]
}

export interface CacheTags {
  add(key: string, tags: string[]): Promise<void>
  remove(key: string, tags: string[]): Promise<void>
  invalidateByTag(tag: string): Promise<number>
  getKeysByTag(tag: string): Promise<string[]>
}

export interface CacheCompression {
  compress(data: any): Promise<Buffer | string>
  decompress(data: Buffer | string): Promise<any>
  isCompressed(data: any): boolean
  getCompressionRatio(original: any, compressed: any): number
}

export interface CacheSerializer {
  serialize<T>(value: T): string | Buffer
  deserialize<T>(data: string | Buffer): T
  canSerialize(value: any): boolean
}

export interface CacheEvictionPolicy {
  shouldEvict(entries: CacheEntry[], newEntry: CacheEntry): CacheEntry[]
  selectVictims(entries: CacheEntry[], count: number): CacheEntry[]
  updateAccessInfo(entry: CacheEntry): void
}

export interface CachePartition {
  id: string
  keyPattern: string
  config: Partial<CacheConfiguration>
  stats: CacheProviderStats
}

export interface CacheCluster {
  nodes: CacheNode[]
  strategy: 'consistent-hash' | 'range' | 'round-robin'
  replicationFactor: number
  failoverEnabled: boolean
}

export interface CacheNode {
  id: string
  host: string
  port: number
  weight: number
  status: 'active' | 'inactive' | 'maintenance'
  stats: CacheProviderStats
}

export interface CacheBackup {
  id: string
  timestamp: number
  entries: CacheEntry[]
  metadata: {
    version: string
    provider: string
    compressed: boolean
  }
}

export interface CacheRestore {
  backupId: string
  strategy: 'replace' | 'merge' | 'selective'
  filters?: {
    keys?: string[]
    tags?: string[]
    maxAge?: number
  }
}

export interface CacheWarmup {
  keys: CacheWarmupKey[]
  strategy: 'sequential' | 'parallel' | 'batch'
  batchSize?: number
  delayBetweenBatches?: number
  priority: number
}

export interface CacheWarmupKey {
  key: string
  factory: () => Promise<any>
  ttl?: number
  priority?: number
  dependencies?: string[]
}

export interface CacheMiddleware {
  name: string
  beforeGet?(key: string, options?: any): Promise<void>
  afterGet?(key: string, value: any, options?: any): Promise<any>
  beforeSet?(key: string, value: any, ttl?: number, options?: any): Promise<any>
  afterSet?(key: string, value: any, ttl?: number, options?: any): Promise<void>
  beforeDelete?(key: string, options?: any): Promise<void>
  afterDelete?(key: string, deleted: boolean, options?: any): Promise<void>
}

export interface CacheHook {
  event: 'hit' | 'miss' | 'set' | 'delete' | 'expire' | 'evict' | 'error'
  handler: (event: CacheEvent) => Promise<void> | void
  priority?: number
  async?: boolean
}

export interface CachePlugin {
  name: string
  version: string
  initialize?(config: any): Promise<void>
  middleware?: CacheMiddleware[]
  hooks?: CacheHook[]
  shutdown?(): Promise<void>
}

export interface CacheMonitoring {
  alerts: CacheAlert[]
  thresholds: CacheThreshold[]
  healthChecks: CacheHealthCheck[]
  metrics: CacheMetrics
}

export interface CacheAlert {
  id: string
  type: 'performance' | 'memory' | 'error' | 'connectivity'
  severity: 'info' | 'warning' | 'error' | 'critical'
  message: string
  threshold: number
  currentValue: number
  timestamp: number
  resolved: boolean
  resolvedAt?: number
}

export interface CacheThreshold {
  metric: string
  warning: number
  error: number
  critical: number
  enabled: boolean
}

export interface CacheAnalytics {
  hitRateTrend: number[]
  latencyTrend: number[]
  memoryUsageTrend: number[]
  errorRateTrend: number[]
  popularKeys: Array<{ key: string; hits: number }>
  slowKeys: Array<{ key: string; avgLatency: number }>
  largeKeys: Array<{ key: string; size: number }>
  expiredKeys: Array<{ key: string; expiredAt: number }>
}

export interface CachePolicy {
  name: string
  patterns: string[]
  ttl: number
  strategy: 'cache-first' | 'cache-only' | 'network-first' | 'network-only'
  compression: boolean
  tags?: string[]
  priority: number
}

export interface CacheTransaction {
  id: string
  operations: CacheOperation[]
  startTime: number
  endTime?: number
  status: 'pending' | 'committed' | 'aborted'
  rollbackOperations?: CacheOperation[]
}

export interface CacheSync {
  source: string
  target: string
  strategy: 'push' | 'pull' | 'bidirectional'
  filters?: {
    patterns?: string[]
    tags?: string[]
    maxAge?: number
  }
  schedule?: string // cron expression
  enabled: boolean
}

export interface CacheDistribution {
  strategy: 'replication' | 'sharding' | 'hybrid'
  replicas: number
  shards: number
  consistencyLevel: 'eventual' | 'strong' | 'weak'
  conflictResolution: 'last-write-wins' | 'version-vector' | 'custom'
}

// Utility types

export type CacheKeyBuilder = (...args: any[]) => string
export type CacheValueTransformer<T, U> = (value: T) => U | Promise<U>
export type CacheInvalidationStrategy = 'ttl' | 'manual' | 'event-driven' | 'dependency-based'
export type CacheConsistencyModel = 'strong' | 'eventual' | 'weak' | 'session'
export type CacheReplicationMode = 'master-slave' | 'master-master' | 'peer-to-peer'

// Event types for cache system
export type CacheEventType = 
  | 'cache:hit'
  | 'cache:miss' 
  | 'cache:set'
  | 'cache:delete'
  | 'cache:expire'
  | 'cache:evict'
  | 'cache:error'
  | 'cache:clear'
  | 'cache:warmup'
  | 'cache:invalidate'

// Error types
export class CacheError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: string,
    public operation?: string,
    public key?: string
  ) {
    super(message)
    this.name = 'CacheError'
  }
}

export class CacheConnectionError extends CacheError {
  constructor(message: string, provider: string) {
    super(message, 'CONNECTION_ERROR', provider)
    this.name = 'CacheConnectionError'
  }
}

export class CacheTimeoutError extends CacheError {
  constructor(message: string, operation: string, key?: string) {
    super(message, 'TIMEOUT_ERROR', undefined, operation, key)
    this.name = 'CacheTimeoutError'
  }
}

export class CacheSerializationError extends CacheError {
  constructor(message: string, key: string) {
    super(message, 'SERIALIZATION_ERROR', undefined, 'serialize', key)
    this.name = 'CacheSerializationError'
  }
}

export class CacheQuotaExceededError extends CacheError {
  constructor(message: string, provider: string) {
    super(message, 'QUOTA_EXCEEDED', provider)
    this.name = 'CacheQuotaExceededError'
  }
}