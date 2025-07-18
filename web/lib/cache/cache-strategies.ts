/**
 * Cache Strategies
 * 
 * Intelligent caching strategies for different data types and access patterns
 * with dynamic TTL calculation and optimization
 */

import { logger } from '@/lib/monitoring/logger'

export type CacheStrategyType = 
  | 'write-through'
  | 'write-behind' 
  | 'write-around'
  | 'cache-aside'
  | 'refresh-ahead'
  | 'read-through'

export interface CacheStrategyConfig {
  defaultTTL: number
  compressionThreshold: number
  maxValueSize: number
  enableCompression: boolean
}

export interface TTLCalculation {
  l1TTL: number // Memory cache TTL
  l2TTL: number // Redis cache TTL
  reasoning: string[]
}

export interface CachePattern {
  name: string
  pattern: string
  strategy: CacheStrategyType
  ttl: number
  priority: number
  tags: string[]
}

export interface AccessPattern {
  frequency: number
  recency: number
  volatility: number
  size: number
  computeCost: number
}

export class CacheStrategy {
  private config: CacheStrategyConfig
  private accessPatterns: Map<string, AccessPattern> = new Map()
  private patterns: CachePattern[] = []

  constructor(config: CacheStrategyConfig) {
    this.config = config
    this.initializePatterns()
  }

  /**
   * Get default caching strategy for a key
   */
  getDefaultStrategy(key: string): CacheStrategyType {
    // Analyze key pattern to determine best strategy
    for (const pattern of this.patterns) {
      if (this.matchesPattern(key, pattern.pattern)) {
        return pattern.strategy
      }
    }

    // Default strategy based on key characteristics
    if (key.includes('user:')) return 'cache-aside'
    if (key.includes('config:')) return 'write-through'
    if (key.includes('analytics:')) return 'write-behind'
    if (key.includes('temp:')) return 'write-around'
    if (key.includes('workflow:')) return 'refresh-ahead'

    return 'cache-aside' // Default
  }

  /**
   * Calculate optimal TTLs for multi-layer caching
   */
  calculateTTLs(baseTTL: number, strategy: CacheStrategyType, accessPattern?: AccessPattern): TTLCalculation {
    const reasoning: string[] = []
    let l1TTL = baseTTL
    let l2TTL = baseTTL

    // Adjust based on strategy
    switch (strategy) {
      case 'write-through':
        // Keep both layers in sync
        l1TTL = Math.min(baseTTL, 5 * 60 * 1000) // 5 minutes max in L1
        l2TTL = baseTTL
        reasoning.push('Write-through: shorter L1 TTL for consistency')
        break

      case 'write-behind':
        // Longer in L1 for performance
        l1TTL = baseTTL
        l2TTL = baseTTL * 2
        reasoning.push('Write-behind: longer L2 TTL for durability')
        break

      case 'write-around':
        // Shorter L1 TTL to avoid stale data
        l1TTL = baseTTL * 0.5
        l2TTL = baseTTL
        reasoning.push('Write-around: shorter L1 TTL to avoid bypassed data')
        break

      case 'cache-aside':
        // Balanced approach
        l1TTL = Math.min(baseTTL, 10 * 60 * 1000) // 10 minutes max
        l2TTL = baseTTL
        reasoning.push('Cache-aside: balanced TTL distribution')
        break

      case 'refresh-ahead':
        // Longer TTLs with refresh before expiry
        l1TTL = baseTTL * 1.2
        l2TTL = baseTTL * 1.5
        reasoning.push('Refresh-ahead: extended TTLs with proactive refresh')
        break

      case 'read-through':
        // Standard TTLs
        l1TTL = Math.min(baseTTL, 15 * 60 * 1000) // 15 minutes max
        l2TTL = baseTTL
        reasoning.push('Read-through: standard TTL distribution')
        break
    }

    // Adjust based on access patterns
    if (accessPattern) {
      const adjustments = this.calculatePatternAdjustments(accessPattern)
      l1TTL *= adjustments.l1Multiplier
      l2TTL *= adjustments.l2Multiplier
      reasoning.push(...adjustments.reasoning)
    }

    // Ensure minimum TTLs
    l1TTL = Math.max(l1TTL, 30 * 1000) // 30 seconds minimum
    l2TTL = Math.max(l2TTL, 60 * 1000) // 1 minute minimum

    // Ensure L1 TTL is not longer than L2 TTL
    if (l1TTL > l2TTL) {
      l1TTL = l2TTL * 0.8
      reasoning.push('Adjusted L1 TTL to be shorter than L2 TTL')
    }

    return {
      l1TTL: Math.round(l1TTL),
      l2TTL: Math.round(l2TTL),
      reasoning
    }
  }

  /**
   * Calculate L1 cache TTL based on base TTL
   */
  calculateL1TTL(baseTTL: number): number {
    // L1 cache should have shorter TTL for memory efficiency
    return Math.min(baseTTL, 10 * 60 * 1000) // Max 10 minutes in L1
  }

  /**
   * Record access pattern for a key
   */
  recordAccess(key: string, accessInfo: {
    timestamp: number
    hitL1?: boolean
    hitL2?: boolean
    generateTime?: number
    size?: number
  }): void {
    try {
      const existing = this.accessPatterns.get(key)
      const now = Date.now()

      if (existing) {
        // Update existing pattern
        existing.frequency += 1
        existing.recency = now - accessInfo.timestamp
        
        if (accessInfo.size) {
          existing.size = (existing.size + accessInfo.size) / 2 // Moving average
        }
        
        if (accessInfo.generateTime) {
          existing.computeCost = (existing.computeCost + accessInfo.generateTime) / 2 // Moving average
        }

        // Calculate volatility (how often the pattern changes)
        const timeSinceLastAccess = now - (existing.recency || now)
        existing.volatility = this.calculateVolatility(existing.frequency, timeSinceLastAccess)
      } else {
        // Create new pattern
        this.accessPatterns.set(key, {
          frequency: 1,
          recency: now - accessInfo.timestamp,
          volatility: 0.5, // Default medium volatility
          size: accessInfo.size || 1024, // Default 1KB
          computeCost: accessInfo.generateTime || 100 // Default 100ms
        })
      }

      // Cleanup old patterns periodically
      if (this.accessPatterns.size > 10000) {
        this.cleanupAccessPatterns()
      }
    } catch (error) {
      logger.error('Failed to record access pattern', error instanceof Error ? error : undefined, { key })
    }
  }

  /**
   * Get access pattern for a key
   */
  getAccessPattern(key: string): AccessPattern | undefined {
    return this.accessPatterns.get(key)
  }

  /**
   * Suggest optimal strategy for a key based on access patterns
   */
  suggestStrategy(key: string): {
    strategy: CacheStrategyType
    confidence: number
    reasoning: string[]
  } {
    const pattern = this.accessPatterns.get(key)
    const reasoning: string[] = []
    let strategy: CacheStrategyType = 'cache-aside'
    let confidence = 0.5

    if (!pattern) {
      reasoning.push('No access pattern data available, using default strategy')
      return { strategy, confidence, reasoning }
    }

    // High frequency access
    if (pattern.frequency > 100) {
      if (pattern.volatility < 0.3) {
        strategy = 'write-through'
        confidence = 0.8
        reasoning.push('High frequency, low volatility: write-through for consistency')
      } else {
        strategy = 'cache-aside'
        confidence = 0.7
        reasoning.push('High frequency, high volatility: cache-aside for flexibility')
      }
    }
    
    // Medium frequency access
    else if (pattern.frequency > 10) {
      if (pattern.computeCost > 1000) {
        strategy = 'refresh-ahead'
        confidence = 0.8
        reasoning.push('Medium frequency, high compute cost: refresh-ahead to avoid cache misses')
      } else {
        strategy = 'read-through'
        confidence = 0.7
        reasoning.push('Medium frequency, low compute cost: read-through for simplicity')
      }
    }
    
    // Low frequency access
    else {
      if (pattern.size > 1024 * 1024) { // 1MB
        strategy = 'write-around'
        confidence = 0.7
        reasoning.push('Low frequency, large size: write-around to avoid cache pollution')
      } else {
        strategy = 'cache-aside'
        confidence = 0.6
        reasoning.push('Low frequency, small size: cache-aside for occasional access')
      }
    }

    // Recent access boost
    if (pattern.recency < 5 * 60 * 1000) { // 5 minutes
      confidence = Math.min(confidence + 0.1, 0.9)
      reasoning.push('Recently accessed: increased confidence')
    }

    return { strategy, confidence, reasoning }
  }

  /**
   * Optimize cache strategies based on collected patterns
   */
  optimizeStrategies(): {
    optimizations: Array<{
      pattern: string
      oldStrategy: CacheStrategyType
      newStrategy: CacheStrategyType
      expectedImprovement: number
    }>
    summary: {
      totalPatterns: number
      optimizedPatterns: number
      avgImprovement: number
    }
  } {
    const optimizations: Array<{
      pattern: string
      oldStrategy: CacheStrategyType
      newStrategy: CacheStrategyType
      expectedImprovement: number
    }> = []

    let totalImprovement = 0

    for (const pattern of this.patterns) {
      const suggestion = this.suggestOptimalStrategyForPattern(pattern)
      
      if (suggestion.strategy !== pattern.strategy && suggestion.confidence > 0.7) {
        const expectedImprovement = this.calculateExpectedImprovement(
          pattern.strategy,
          suggestion.strategy,
          suggestion.accessPattern
        )

        if (expectedImprovement > 0.1) { // 10% improvement threshold
          optimizations.push({
            pattern: pattern.pattern,
            oldStrategy: pattern.strategy,
            newStrategy: suggestion.strategy,
            expectedImprovement
          })

          totalImprovement += expectedImprovement
        }
      }
    }

    return {
      optimizations,
      summary: {
        totalPatterns: this.patterns.length,
        optimizedPatterns: optimizations.length,
        avgImprovement: optimizations.length > 0 ? totalImprovement / optimizations.length : 0
      }
    }
  }

  /**
   * Get cache strategy recommendations
   */
  getRecommendations(): Array<{
    type: 'strategy' | 'ttl' | 'pattern'
    priority: 'low' | 'medium' | 'high'
    title: string
    description: string
    implementation: string[]
    expectedBenefit: string
  }> {
    const recommendations: Array<{
      type: 'strategy' | 'ttl' | 'pattern'
      priority: 'low' | 'medium' | 'high'
      title: string
      description: string
      implementation: string[]
      expectedBenefit: string
    }> = []

    // Analyze access patterns for recommendations
    const patternAnalysis = this.analyzeAccessPatterns()

    // High-frequency keys with suboptimal strategies
    if (patternAnalysis.highFrequencySuboptimal > 0) {
      recommendations.push({
        type: 'strategy',
        priority: 'high',
        title: 'Optimize High-Frequency Cache Strategies',
        description: `${patternAnalysis.highFrequencySuboptimal} high-frequency keys using suboptimal caching strategies`,
        implementation: [
          'Analyze access patterns for high-frequency keys',
          'Migrate to write-through or refresh-ahead strategies',
          'Monitor cache hit rates and latency improvements'
        ],
        expectedBenefit: '20-40% reduction in cache misses and improved response times'
      })
    }

    // TTL optimization opportunities
    if (patternAnalysis.shortLivedKeys > 0) {
      recommendations.push({
        type: 'ttl',
        priority: 'medium',
        title: 'Optimize TTL for Short-Lived Data',
        description: `${patternAnalysis.shortLivedKeys} keys with unnecessarily long TTLs`,
        implementation: [
          'Reduce TTLs for rarely accessed data',
          'Implement dynamic TTL based on access patterns',
          'Set up TTL monitoring and adjustment'
        ],
        expectedBenefit: '15-25% reduction in memory usage'
      })
    }

    // Pattern optimization
    if (patternAnalysis.inefficientPatterns > 0) {
      recommendations.push({
        type: 'pattern',
        priority: 'medium',
        title: 'Consolidate Similar Cache Patterns',
        description: `${patternAnalysis.inefficientPatterns} cache patterns could be consolidated`,
        implementation: [
          'Group similar access patterns',
          'Create unified caching strategies',
          'Implement pattern-based cache policies'
        ],
        expectedBenefit: '10-20% improvement in cache efficiency'
      })
    }

    return recommendations
  }

  // Private helper methods

  private initializePatterns(): void {
    this.patterns = [
      {
        name: 'User Sessions',
        pattern: 'user:session:*',
        strategy: 'write-through',
        ttl: 30 * 60 * 1000, // 30 minutes
        priority: 1,
        tags: ['user', 'session']
      },
      {
        name: 'User Profiles',
        pattern: 'user:profile:*',
        strategy: 'cache-aside',
        ttl: 60 * 60 * 1000, // 1 hour
        priority: 2,
        tags: ['user', 'profile']
      },
      {
        name: 'Configuration',
        pattern: 'config:*',
        strategy: 'write-through',
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        priority: 1,
        tags: ['config']
      },
      {
        name: 'Analytics Data',
        pattern: 'analytics:*',
        strategy: 'write-behind',
        ttl: 5 * 60 * 1000, // 5 minutes
        priority: 3,
        tags: ['analytics']
      },
      {
        name: 'Temporary Data',
        pattern: 'temp:*',
        strategy: 'write-around',
        ttl: 60 * 1000, // 1 minute
        priority: 4,
        tags: ['temporary']
      },
      {
        name: 'Workflow Results',
        pattern: 'workflow:result:*',
        strategy: 'refresh-ahead',
        ttl: 2 * 60 * 60 * 1000, // 2 hours
        priority: 2,
        tags: ['workflow']
      },
      {
        name: 'Search Results',
        pattern: 'search:*',
        strategy: 'cache-aside',
        ttl: 15 * 60 * 1000, // 15 minutes
        priority: 3,
        tags: ['search']
      },
      {
        name: 'API Responses',
        pattern: 'api:response:*',
        strategy: 'read-through',
        ttl: 10 * 60 * 1000, // 10 minutes
        priority: 3,
        tags: ['api']
      }
    ]
  }

  private matchesPattern(key: string, pattern: string): boolean {
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(key)
  }

  private calculatePatternAdjustments(pattern: AccessPattern): {
    l1Multiplier: number
    l2Multiplier: number
    reasoning: string[]
  } {
    const reasoning: string[] = []
    let l1Multiplier = 1.0
    let l2Multiplier = 1.0

    // High frequency access - longer L1 TTL
    if (pattern.frequency > 50) {
      l1Multiplier *= 1.5
      reasoning.push('High frequency: extended L1 TTL')
    }

    // High compute cost - longer TTLs
    if (pattern.computeCost > 1000) {
      l1Multiplier *= 1.3
      l2Multiplier *= 1.5
      reasoning.push('High compute cost: extended TTLs')
    }

    // High volatility - shorter TTLs
    if (pattern.volatility > 0.7) {
      l1Multiplier *= 0.7
      l2Multiplier *= 0.8
      reasoning.push('High volatility: reduced TTLs')
    }

    // Large size - shorter L1 TTL for memory efficiency
    if (pattern.size > 100 * 1024) { // 100KB
      l1Multiplier *= 0.5
      reasoning.push('Large size: reduced L1 TTL for memory efficiency')
    }

    // Recent access - slightly longer TTLs
    if (pattern.recency < 5 * 60 * 1000) { // 5 minutes
      l1Multiplier *= 1.1
      l2Multiplier *= 1.1
      reasoning.push('Recent access: slightly extended TTLs')
    }

    return { l1Multiplier, l2Multiplier, reasoning }
  }

  private calculateVolatility(frequency: number, timeSinceLastAccess: number): number {
    // Simple volatility calculation based on access frequency and recency
    const expectedInterval = 24 * 60 * 60 * 1000 / frequency // Expected access interval
    const actualInterval = timeSinceLastAccess
    
    const volatility = Math.min(1.0, Math.abs(actualInterval - expectedInterval) / expectedInterval)
    return volatility
  }

  private cleanupAccessPatterns(): void {
    // Remove old or infrequently accessed patterns
    const now = Date.now()
    const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days
    
    for (const [key, pattern] of this.accessPatterns) {
      if (pattern.frequency < 5 && (now - pattern.recency) > maxAge) {
        this.accessPatterns.delete(key)
      }
    }
  }

  private suggestOptimalStrategyForPattern(pattern: CachePattern): {
    strategy: CacheStrategyType
    confidence: number
    accessPattern?: AccessPattern
  } {
    // Aggregate access patterns for keys matching this pattern
    const matchingPatterns: AccessPattern[] = []
    
    for (const [key, accessPattern] of this.accessPatterns) {
      if (this.matchesPattern(key, pattern.pattern)) {
        matchingPatterns.push(accessPattern)
      }
    }

    if (matchingPatterns.length === 0) {
      return { strategy: pattern.strategy, confidence: 0.5 }
    }

    // Calculate aggregate access pattern
    const aggregatePattern: AccessPattern = {
      frequency: matchingPatterns.reduce((sum, p) => sum + p.frequency, 0) / matchingPatterns.length,
      recency: matchingPatterns.reduce((sum, p) => sum + p.recency, 0) / matchingPatterns.length,
      volatility: matchingPatterns.reduce((sum, p) => sum + p.volatility, 0) / matchingPatterns.length,
      size: matchingPatterns.reduce((sum, p) => sum + p.size, 0) / matchingPatterns.length,
      computeCost: matchingPatterns.reduce((sum, p) => sum + p.computeCost, 0) / matchingPatterns.length
    }

    // Use existing suggestion logic with aggregate pattern
    const suggestion = this.suggestStrategy(pattern.pattern)
    
    return {
      strategy: suggestion.strategy,
      confidence: suggestion.confidence,
      accessPattern: aggregatePattern
    }
  }

  private calculateExpectedImprovement(
    oldStrategy: CacheStrategyType,
    newStrategy: CacheStrategyType,
    accessPattern?: AccessPattern
  ): number {
    // Simplified improvement calculation
    const strategyScores = {
      'write-through': 0.8,
      'write-behind': 0.7,
      'write-around': 0.6,
      'cache-aside': 0.7,
      'refresh-ahead': 0.9,
      'read-through': 0.8
    }

    const oldScore = strategyScores[oldStrategy] || 0.5
    const newScore = strategyScores[newStrategy] || 0.5
    
    let improvement = (newScore - oldScore) / oldScore
    
    // Adjust based on access pattern
    if (accessPattern) {
      if (accessPattern.frequency > 50 && newStrategy === 'refresh-ahead') {
        improvement *= 1.5 // High frequency benefits more from refresh-ahead
      }
      
      if (accessPattern.volatility > 0.7 && newStrategy === 'cache-aside') {
        improvement *= 1.3 // High volatility benefits from cache-aside flexibility
      }
    }

    return Math.max(0, improvement)
  }

  private analyzeAccessPatterns(): {
    highFrequencySuboptimal: number
    shortLivedKeys: number
    inefficientPatterns: number
  } {
    let highFrequencySuboptimal = 0
    let shortLivedKeys = 0
    let inefficientPatterns = 0

    // Analyze individual access patterns
    for (const [key, pattern] of this.accessPatterns) {
      // High frequency with suboptimal strategy
      if (pattern.frequency > 100) {
        const suggestion = this.suggestStrategy(key)
        if (suggestion.confidence > 0.7) {
          highFrequencySuboptimal++
        }
      }

      // Short-lived keys (high recency, low frequency)
      if (pattern.frequency < 5 && pattern.recency > 24 * 60 * 60 * 1000) {
        shortLivedKeys++
      }
    }

    // Count patterns that could be consolidated
    const patternGroups = new Map<string, number>()
    for (const pattern of this.patterns) {
      const basePattern = pattern.pattern.split(':')[0]
      patternGroups.set(basePattern, (patternGroups.get(basePattern) || 0) + 1)
    }

    for (const [, count] of patternGroups) {
      if (count > 3) { // More than 3 similar patterns
        inefficientPatterns += count - 1 // Could consolidate to 1
      }
    }

    return {
      highFrequencySuboptimal,
      shortLivedKeys,
      inefficientPatterns
    }
  }
}

export default CacheStrategy