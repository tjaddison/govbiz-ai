import { ModelInfo } from '@/types'

interface TokenizationRules {
  baseCharsPerToken: number
  codeMultiplier: number
  markdownMultiplier: number
  specialTokens: Record<string, number>
  punctuationWeight: number
  numberWeight: number
}

export class TokenEstimator {
  private modelId: string
  private cache: Map<string, number>
  private rules: TokenizationRules
  
  constructor(modelId: string) {
    this.modelId = modelId
    this.cache = new Map()
    this.rules = this.loadRulesForModel(modelId)
  }
  
  private loadRulesForModel(modelId: string): TokenizationRules {
    // Different models have different tokenization characteristics
    const modelRules: Record<string, TokenizationRules> = {
      'claude-sonnet-4': {
        baseCharsPerToken: 4,
        codeMultiplier: 0.85,
        markdownMultiplier: 0.95,
        specialTokens: {
          '[INST]': 1,
          '[/INST]': 1,
          '<|im_start|>': 1,
          '<|im_end|>': 1,
          '<|endoftext|>': 1
        },
        punctuationWeight: 0.8,
        numberWeight: 0.9
      },
      'claude-opus-4': {
        baseCharsPerToken: 4,
        codeMultiplier: 0.85,
        markdownMultiplier: 0.95,
        specialTokens: {
          '[INST]': 1,
          '[/INST]': 1,
          '<|im_start|>': 1,
          '<|im_end|>': 1,
          '<|endoftext|>': 1
        },
        punctuationWeight: 0.8,
        numberWeight: 0.9
      },
      'claude-haiku-4': {
        baseCharsPerToken: 4,
        codeMultiplier: 0.85,
        markdownMultiplier: 0.95,
        specialTokens: {
          '[INST]': 1,
          '[/INST]': 1,
          '<|im_start|>': 1,
          '<|im_end|>': 1,
          '<|endoftext|>': 1
        },
        punctuationWeight: 0.8,
        numberWeight: 0.9
      }
    }
    
    return modelRules[modelId] || modelRules['claude-sonnet-4']
  }
  
  async estimate(text: string): Promise<number> {
    if (!text) return 0
    
    // Check cache first
    if (this.cache.has(text)) {
      return this.cache.get(text)!
    }
    
    let tokens = 0
    
    // Handle different content types
    if (this.containsCode(text)) {
      tokens = this.estimateCodeTokens(text)
    } else if (this.containsMarkdown(text)) {
      tokens = this.estimateMarkdownTokens(text)
    } else if (this.containsStructuredData(text)) {
      tokens = this.estimateStructuredTokens(text)
    } else {
      tokens = this.estimateTextTokens(text)
    }
    
    // Apply special token adjustments
    tokens += this.countSpecialTokens(text)
    
    // Cache the result
    this.cache.set(text, tokens)
    
    return tokens
  }
  
  private containsCode(text: string): boolean {
    return (
      text.includes('```') ||
      text.includes('function ') ||
      text.includes('class ') ||
      text.includes('import ') ||
      text.includes('export ') ||
      /\b(const|let|var|if|else|for|while|return)\b/.test(text) ||
      /[{}();]/.test(text)
    )
  }
  
  private containsMarkdown(text: string): boolean {
    return (
      text.includes('**') ||
      text.includes('*') ||
      text.includes('##') ||
      text.includes('- ') ||
      text.includes('1. ') ||
      text.includes('[') ||
      text.includes('](')
    )
  }
  
  private containsStructuredData(text: string): boolean {
    return (
      text.includes('{') ||
      text.includes('[') ||
      text.includes('<') ||
      text.includes('|') ||
      /^\s*[\w\s]+:\s*/.test(text) // Key-value pairs
    )
  }
  
  private estimateCodeTokens(text: string): number {
    // Code typically tokenizes more efficiently
    const codeBlocks = this.extractCodeBlocks(text)
    let totalTokens = 0
    
    for (const block of codeBlocks) {
      const language = block.language || 'plaintext'
      const multiplier = this.getCodeTokenMultiplier(language)
      const baseTokens = Math.ceil(block.content.length / this.rules.baseCharsPerToken)
      totalTokens += Math.floor(baseTokens * multiplier)
    }
    
    // Add tokens for non-code portions
    const nonCodeText = this.removeCodeBlocks(text)
    totalTokens += this.estimateTextTokens(nonCodeText)
    
    return totalTokens
  }
  
  private estimateMarkdownTokens(text: string): number {
    // Markdown has some token overhead for formatting
    const baseTokens = Math.ceil(text.length / this.rules.baseCharsPerToken)
    return Math.floor(baseTokens * this.rules.markdownMultiplier)
  }
  
  private estimateStructuredTokens(text: string): number {
    // Structured data often has more punctuation and special characters
    const baseTokens = Math.ceil(text.length / this.rules.baseCharsPerToken)
    
    // Count punctuation and adjust
    const punctuationCount = (text.match(/[{}\\[\\](),;:]/g) || []).length
    const punctuationTokens = Math.floor(punctuationCount * this.rules.punctuationWeight)
    
    return baseTokens + punctuationTokens
  }
  
  private estimateTextTokens(text: string): number {
    // Standard text estimation
    const baseTokens = Math.ceil(text.length / this.rules.baseCharsPerToken)
    
    // Adjust for numbers (they often tokenize differently)
    const numberCount = (text.match(/\\d+/g) || []).length
    const numberAdjustment = Math.floor(numberCount * this.rules.numberWeight)
    
    return baseTokens + numberAdjustment
  }
  
  private extractCodeBlocks(text: string): Array<{ language: string; content: string }> {
    const codeBlocks: Array<{ language: string; content: string }> = []
    const regex = /```(\\w+)?\\n?([\\s\\S]*?)```/g
    let match
    
    while ((match = regex.exec(text)) !== null) {
      codeBlocks.push({
        language: match[1] || 'plaintext',
        content: match[2] || ''
      })
    }
    
    return codeBlocks
  }
  
  private removeCodeBlocks(text: string): string {
    return text.replace(/```[\\s\\S]*?```/g, '')
  }
  
  private getCodeTokenMultiplier(language: string): number {
    const multipliers: Record<string, number> = {
      'javascript': 0.85,
      'typescript': 0.85,
      'python': 0.90,
      'java': 0.80,
      'cpp': 0.80,
      'c': 0.80,
      'rust': 0.85,
      'go': 0.85,
      'html': 0.90,
      'css': 0.90,
      'json': 0.95,
      'yaml': 0.95,
      'xml': 0.90,
      'sql': 0.85,
      'bash': 0.85,
      'shell': 0.85,
      'plaintext': 1.0
    }
    
    return multipliers[language.toLowerCase()] || this.rules.codeMultiplier
  }
  
  private countSpecialTokens(text: string): number {
    let count = 0
    
    for (const [token, tokenCount] of Object.entries(this.rules.specialTokens)) {
      const occurrences = (text.match(new RegExp(token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'g')) || []).length
      count += occurrences * tokenCount
    }
    
    return count
  }
  
  // Batch estimation for multiple texts
  async estimateBatch(texts: string[]): Promise<number[]> {
    const results: number[] = []
    
    for (const text of texts) {
      results.push(await this.estimate(text))
    }
    
    return results
  }
  
  // Get total tokens for a conversation
  async estimateConversation(messages: Array<{ role: string; content: string }>): Promise<number> {
    let totalTokens = 0
    
    for (const message of messages) {
      // Add role prefix tokens (approximate)
      totalTokens += 3 // For role prefix like "Human: " or "Assistant: "
      totalTokens += await this.estimate(message.content)
    }
    
    return totalTokens
  }
  
  // Estimate tokens for a specific model
  async estimateForModel(text: string, modelId: string): Promise<number> {
    const originalModelId = this.modelId
    this.modelId = modelId
    this.rules = this.loadRulesForModel(modelId)
    
    const tokens = await this.estimate(text)
    
    // Restore original model
    this.modelId = originalModelId
    this.rules = this.loadRulesForModel(originalModelId)
    
    return tokens
  }
  
  // Clear cache
  clearCache(): void {
    this.cache.clear()
  }
  
  // Get cache statistics
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0 // Would need to track hits/misses for accurate rate
    }
  }
  
  // Estimate tokens remaining in context window
  estimateRemainingTokens(currentTokens: number, maxTokens: number): number {
    return Math.max(0, maxTokens - currentTokens)
  }
  
  // Check if text fits in remaining context
  async canFitInContext(text: string, currentTokens: number, maxTokens: number): Promise<boolean> {
    const textTokens = await this.estimate(text)
    return (currentTokens + textTokens) <= maxTokens
  }
  
  // Truncate text to fit in token limit
  async truncateToTokenLimit(text: string, maxTokens: number): Promise<string> {
    const currentTokens = await this.estimate(text)
    
    if (currentTokens <= maxTokens) {
      return text
    }
    
    // Binary search to find the right length
    let left = 0
    let right = text.length
    let bestLength = 0
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const truncated = text.substring(0, mid)
      const tokens = await this.estimate(truncated)
      
      if (tokens <= maxTokens) {
        bestLength = mid
        left = mid + 1
      } else {
        right = mid - 1
      }
    }
    
    return text.substring(0, bestLength)
  }
}