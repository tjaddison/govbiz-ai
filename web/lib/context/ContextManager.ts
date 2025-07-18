import { Message, ContextState, CompressionEvent, CompressionStrategy } from '@/types'
import { TokenEstimator } from '@/lib/tokens/TokenEstimator'

interface CompressionOptions {
  strategy: CompressionStrategy
  targetTokens: number
  preserveSystem: boolean
  preserveRecent: number
  preserveImportant: boolean
}

interface CompressionResult {
  compressedMessages: Message[]
  removedCount: number
  tokensSaved: number
  qualityScore: number
  strategy: CompressionStrategy
}

export class ContextManager {
  private state: ContextState
  private tokenEstimator: TokenEstimator
  
  constructor(initialState: ContextState) {
    this.state = { ...initialState }
    this.tokenEstimator = new TokenEstimator('claude-sonnet-4') // Default model
  }
  
  // State management
  getState(): ContextState {
    return { ...this.state }
  }
  
  setState(newState: Partial<ContextState>): void {
    this.state = { ...this.state, ...newState }
  }
  
  // Message operations
  addMessage(message: Message): void {
    this.state.messages.push(message)
    this.updateTokenCount()
  }
  
  removeMessage(messageId: string): void {
    this.state.messages = this.state.messages.filter(msg => msg.id !== messageId)
    this.updateTokenCount()
  }
  
  updateMessage(messageId: string, updates: Partial<Message>): void {
    const messageIndex = this.state.messages.findIndex(msg => msg.id === messageId)
    if (messageIndex !== -1) {
      this.state.messages[messageIndex] = { ...this.state.messages[messageIndex], ...updates }
      this.updateTokenCount()
    }
  }
  
  // Token management
  private updateTokenCount(): void {
    this.state.tokenCount = this.state.messages.reduce((sum, msg) => sum + msg.tokens, 0)
  }
  
  getTokenCount(): number {
    return this.state.tokenCount
  }
  
  getUtilization(): number {
    return this.state.tokenCount / this.state.maxTokens
  }
  
  // Context analysis
  analyzeContext(): {
    totalMessages: number
    tokenDistribution: { user: number; assistant: number; system: number }
    averageMessageLength: number
    oldestMessage: Message | null
    newestMessage: Message | null
    compressionRecommendation: string
  } {
    const messages = this.state.messages
    const tokenDist = messages.reduce(
      (acc, msg) => {
        acc[msg.role] += msg.tokens
        return acc
      },
      { user: 0, assistant: 0, system: 0 }
    )
    
    const utilization = this.getUtilization()
    let recommendation = 'No action needed'
    
    if (utilization > 0.9) {
      recommendation = 'Critical: Immediate compression required'
    } else if (utilization > 0.8) {
      recommendation = 'Warning: Compression recommended'
    } else if (utilization > 0.6) {
      recommendation = 'Notice: Monitor context usage'
    }
    
    return {
      totalMessages: messages.length,
      tokenDistribution: tokenDist,
      averageMessageLength: messages.length > 0 ? this.state.tokenCount / messages.length : 0,
      oldestMessage: messages.length > 0 ? messages[0] : null,
      newestMessage: messages.length > 0 ? messages[messages.length - 1] : null,
      compressionRecommendation: recommendation
    }
  }
  
  // Compression operations
  async compressContext(options: Partial<CompressionOptions> = {}): Promise<CompressionResult> {
    const defaultOptions: CompressionOptions = {
      strategy: CompressionStrategy.PRESERVATION,
      targetTokens: Math.floor(this.state.maxTokens * 0.7),
      preserveSystem: true,
      preserveRecent: 10,
      preserveImportant: true
    }
    
    const finalOptions = { ...defaultOptions, ...options }
    
    switch (finalOptions.strategy) {
      case CompressionStrategy.PRESERVATION:
        return this.preservationCompress(finalOptions)
      case CompressionStrategy.SUMMARIZATION:
        return this.summarizationCompress(finalOptions)
      case CompressionStrategy.REMOVAL:
        return this.removalCompress(finalOptions)
      case CompressionStrategy.HYBRID:
        return this.hybridCompress(finalOptions)
      default:
        return this.preservationCompress(finalOptions)
    }
  }
  
  private preservationCompress(options: CompressionOptions): CompressionResult {
    const messages = [...this.state.messages]
    const preserved: Message[] = []
    let currentTokens = 0
    
    // Always preserve system messages
    if (options.preserveSystem) {
      const systemMessages = messages.filter(msg => msg.role === 'system')
      preserved.push(...systemMessages)
      currentTokens += systemMessages.reduce((sum, msg) => sum + msg.tokens, 0)
    }
    
    // Preserve recent messages
    const nonSystemMessages = messages.filter(msg => msg.role !== 'system')
    const recentMessages = nonSystemMessages.slice(-options.preserveRecent)
    
    for (const message of recentMessages) {
      if (currentTokens + message.tokens <= options.targetTokens) {
        preserved.push(message)
        currentTokens += message.tokens
      }
    }
    
    // Preserve important messages (contains code, long responses, etc.)
    if (options.preserveImportant) {
      const importantMessages = nonSystemMessages.filter(msg => 
        !preserved.includes(msg) && this.isImportantMessage(msg)
      )
      
      for (const message of importantMessages) {
        if (currentTokens + message.tokens <= options.targetTokens) {
          preserved.push(message)
          currentTokens += message.tokens
        }
      }
    }
    
    // Sort preserved messages by timestamp
    preserved.sort((a, b) => a.timestamp - b.timestamp)
    
    const removedCount = this.state.messages.length - preserved.length
    const tokensSaved = this.state.tokenCount - currentTokens
    
    // Update state
    this.state.messages = preserved
    this.updateTokenCount()
    
    // Record compression event
    const compressionEvent: CompressionEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      beforeTokens: this.state.tokenCount + tokensSaved,
      afterTokens: this.state.tokenCount,
      removedMessageIds: messages.filter(msg => !preserved.includes(msg)).map(msg => msg.id),
      strategy: CompressionStrategy.PRESERVATION,
      qualityScore: this.calculateQualityScore(preserved, messages)
    }
    
    this.state.compressionHistory.push(compressionEvent)
    
    return {
      compressedMessages: preserved,
      removedCount,
      tokensSaved,
      qualityScore: compressionEvent.qualityScore,
      strategy: CompressionStrategy.PRESERVATION
    }
  }
  
  private summarizationCompress(options: CompressionOptions): CompressionResult {
    // Simplified summarization - in production, would use AI to create summaries
    const messages = [...this.state.messages]
    const preserved: Message[] = []
    
    // Keep system messages
    const systemMessages = messages.filter(msg => msg.role === 'system')
    preserved.push(...systemMessages)
    
    // Keep recent messages
    const recentMessages = messages.slice(-options.preserveRecent)
    preserved.push(...recentMessages)
    
    // Create summary for middle messages
    const middleMessages = messages.slice(systemMessages.length, -options.preserveRecent)
    if (middleMessages.length > 0) {
      const summaryContent = this.createSummary(middleMessages)
      const summaryMessage: Message = {
        id: crypto.randomUUID(),
        role: 'system',
        content: summaryContent,
        timestamp: middleMessages[0].timestamp,
        tokens: Math.floor(summaryContent.length / 4), // Rough estimate
        metadata: {
          conversationId: 'summary',
          parentMessageId: middleMessages[0].id
        }
      }
      
      preserved.splice(systemMessages.length, 0, summaryMessage)
    }
    
    // Sort by timestamp
    preserved.sort((a, b) => a.timestamp - b.timestamp)
    
    const removedCount = this.state.messages.length - preserved.length
    const tokensSaved = this.state.tokenCount - preserved.reduce((sum, msg) => sum + msg.tokens, 0)
    
    // Update state
    this.state.messages = preserved
    this.updateTokenCount()
    
    return {
      compressedMessages: preserved,
      removedCount,
      tokensSaved,
      qualityScore: 0.7, // Summarization typically has moderate quality loss
      strategy: CompressionStrategy.SUMMARIZATION
    }
  }
  
  private removalCompress(options: CompressionOptions): CompressionResult {
    const messages = [...this.state.messages]
    const preserved: Message[] = []
    let currentTokens = 0
    
    // Always preserve system messages
    const systemMessages = messages.filter(msg => msg.role === 'system')
    preserved.push(...systemMessages)
    currentTokens += systemMessages.reduce((sum, msg) => sum + msg.tokens, 0)
    
    // Preserve recent messages first
    const nonSystemMessages = messages.filter(msg => msg.role !== 'system')
    const recentMessages = nonSystemMessages.slice(-options.preserveRecent)
    
    for (const message of recentMessages.reverse()) {
      if (currentTokens + message.tokens <= options.targetTokens) {
        preserved.unshift(message)
        currentTokens += message.tokens
      }
    }
    
    // Sort by timestamp
    preserved.sort((a, b) => a.timestamp - b.timestamp)
    
    const removedCount = this.state.messages.length - preserved.length
    const tokensSaved = this.state.tokenCount - currentTokens
    
    // Update state
    this.state.messages = preserved
    this.updateTokenCount()
    
    return {
      compressedMessages: preserved,
      removedCount,
      tokensSaved,
      qualityScore: 0.5, // Removal has higher quality loss
      strategy: CompressionStrategy.REMOVAL
    }
  }
  
  private hybridCompress(options: CompressionOptions): CompressionResult {
    // Combine strategies based on context
    const utilization = this.getUtilization()
    
    if (utilization > 0.95) {
      // Emergency mode - aggressive removal
      return this.removalCompress({ ...options, preserveRecent: 5 })
    } else if (utilization > 0.85) {
      // Moderate compression with summarization
      return this.summarizationCompress(options)
    } else {
      // Conservative preservation
      return this.preservationCompress(options)
    }
  }
  
  // Helper methods
  private isImportantMessage(message: Message): boolean {
    const content = message.content.toLowerCase()
    return (
      content.includes('```') || // Code blocks
      content.length > 500 || // Long messages
      content.includes('important') ||
      content.includes('summary') ||
      content.includes('conclusion') ||
      message.role === 'assistant' && content.includes('analysis')
    )
  }
  
  private createSummary(messages: Message[]): string {
    const topics = this.extractTopics(messages)
    const keyPoints = this.extractKeyPoints(messages)
    
    return `[Context Summary: Discussion covered ${topics.join(', ')}. Key points: ${keyPoints.join('; ')}. ${messages.length} messages summarized.]`
  }
  
  private extractTopics(messages: Message[]): string[] {
    // Simple topic extraction - in production, would use NLP
    const topics = new Set<string>()
    
    for (const message of messages) {
      const words = message.content.toLowerCase().split(/\s+/)
      // Look for topic indicators
      const topicKeywords = ['about', 'regarding', 'concerning', 'discuss', 'explain', 'analyze']
      
      for (let i = 0; i < words.length - 1; i++) {
        if (topicKeywords.includes(words[i])) {
          topics.add(words[i + 1])
        }
      }
    }
    
    return Array.from(topics).slice(0, 5) // Limit to top 5 topics
  }
  
  private extractKeyPoints(messages: Message[]): string[] {
    // Simple key point extraction
    const keyPoints: string[] = []
    
    for (const message of messages) {
      const sentences = message.content.split(/[.!?]+/)
      for (const sentence of sentences) {
        if (sentence.toLowerCase().includes('important') || 
            sentence.toLowerCase().includes('key') ||
            sentence.toLowerCase().includes('main')) {
          keyPoints.push(sentence.trim())
        }
      }
    }
    
    return keyPoints.slice(0, 3) // Limit to top 3 key points
  }
  
  private calculateQualityScore(preserved: Message[], original: Message[]): number {
    // Simple quality score calculation
    const preservationRatio = preserved.length / original.length
    const tokenRatio = preserved.reduce((sum, msg) => sum + msg.tokens, 0) / 
                     original.reduce((sum, msg) => sum + msg.tokens, 0)
    
    // Quality score based on preservation ratio and token ratio
    return Math.min(1, (preservationRatio + tokenRatio) / 2)
  }
  
  // Context clearing
  clearContext(): void {
    this.state.messages = []
    this.state.tokenCount = 0
    this.state.compressionHistory = []
    this.state.preservedSections = []
  }
  
  // Export functionality
  exportContext(): string {
    return JSON.stringify({
      messages: this.state.messages,
      metadata: {
        totalTokens: this.state.tokenCount,
        messageCount: this.state.messages.length,
        compressionHistory: this.state.compressionHistory,
        exportedAt: new Date().toISOString()
      }
    }, null, 2)
  }
  
  // Import functionality
  importContext(contextData: string): void {
    try {
      const data = JSON.parse(contextData)
      this.state.messages = data.messages || []
      this.state.compressionHistory = data.metadata?.compressionHistory || []
      this.updateTokenCount()
    } catch (error) {
      throw new Error('Invalid context data format')
    }
  }
}