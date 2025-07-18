import { Message, ModelInfo, StreamingOptions, StreamingProgress } from '@/types'

interface StreamingResponse {
  id: string
  message: Message
  model: ModelInfo
  startTime: number
  endTime?: number
  tokens: string[]
  totalTokens: number
  error?: string
}

export class StreamingManager {
  private activeStreams: Map<string, AbortController>
  private streamingResponses: Map<string, StreamingResponse>
  private eventSources: Map<string, EventSource>
  
  constructor() {
    this.activeStreams = new Map()
    this.streamingResponses = new Map()
    this.eventSources = new Map()
  }
  
  async streamResponse(options: StreamingOptions): Promise<void> {
    const streamId = crypto.randomUUID()
    
    try {
      // Set up abort controller
      this.activeStreams.set(streamId, new AbortController())
      
      // Initialize streaming response
      const streamingResponse: StreamingResponse = {
        id: streamId,
        message: options.messages[options.messages.length - 1],
        model: options.model,
        startTime: Date.now(),
        tokens: [],
        totalTokens: 0
      }
      
      this.streamingResponses.set(streamId, streamingResponse)
      
      // Choose streaming method based on availability
      if (typeof EventSource !== 'undefined') {
        await this.streamWithSSE(streamId, options)
      } else {
        await this.streamWithFetch(streamId, options)
      }
      
    } catch (error) {
      this.handleStreamingError(streamId, error as Error, options)
    } finally {
      this.cleanup(streamId)
    }
  }
  
  private async streamWithSSE(streamId: string, options: StreamingOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.buildSSEUrl(options)
      const eventSource = new EventSource(url)
      
      this.eventSources.set(streamId, eventSource)
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleSSEMessage(streamId, data, options)
        } catch (error) {
          console.error('Failed to parse SSE message:', error)
        }
      }
      
      eventSource.onerror = (error) => {
        console.error('SSE error:', error)
        eventSource.close()
        reject(new Error('SSE connection failed'))
      }
      
      eventSource.addEventListener('done', () => {
        eventSource.close()
        this.handleStreamingComplete(streamId, options)
        resolve()
      })
      
      eventSource.addEventListener('error', (event) => {
        eventSource.close()
        const errorData = JSON.parse((event as any).data)
        reject(new Error(errorData.message || 'Streaming error'))
      })
      
      // Handle abort
      options.signal.addEventListener('abort', () => {
        eventSource.close()
        reject(new Error('Stream aborted'))
      })
    })
  }
  
  private async streamWithFetch(streamId: string, options: StreamingOptions): Promise<void> {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: options.messages,
        model: options.model.id,
        stream: true
      }),
      signal: options.signal
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }
    
    const decoder = new TextDecoder()
    let buffer = ''
    
    try {
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          break
        }
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\\n')
        
        // Process complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim()
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6))
              this.handleStreamingData(streamId, data, options)
            } catch (error) {
              console.error('Failed to parse streaming data:', error)
            }
          }
        }
        
        // Keep the last incomplete line in buffer
        buffer = lines[lines.length - 1]
      }
      
      this.handleStreamingComplete(streamId, options)
      
    } finally {
      reader.releaseLock()
    }
  }
  
  private buildSSEUrl(options: StreamingOptions): string {
    const params = new URLSearchParams({
      model: options.model.id,
      messages: JSON.stringify(options.messages),
      stream: 'true'
    })
    
    return `/api/chat/stream?${params.toString()}`
  }
  
  private handleSSEMessage(streamId: string, data: any, options: StreamingOptions): void {
    this.handleStreamingData(streamId, data, options)
  }
  
  private handleStreamingData(streamId: string, data: any, options: StreamingOptions): void {
    const response = this.streamingResponses.get(streamId)
    if (!response) return
    
    switch (data.type) {
      case 'token':
        this.handleToken(streamId, data.content, options)
        break
      case 'progress':
        this.handleProgress(streamId, data.progress, options)
        break
      case 'metadata':
        this.handleMetadata(streamId, data.metadata, options)
        break
      case 'error':
        this.handleStreamingError(streamId, new Error(data.message), options)
        break
      case 'done':
        this.handleStreamingComplete(streamId, options)
        break
    }
  }
  
  private handleToken(streamId: string, token: string, options: StreamingOptions): void {
    const response = this.streamingResponses.get(streamId)
    if (!response) return
    
    response.tokens.push(token)
    response.totalTokens++
    
    // Call the token callback
    options.onToken(token)
    
    // Calculate and call progress callback if available
    if (options.onProgress) {
      const progress = this.calculateProgress(response)
      options.onProgress(progress)
    }
  }
  
  private handleProgress(streamId: string, progress: StreamingProgress, options: StreamingOptions): void {
    if (options.onProgress) {
      options.onProgress(progress)
    }
  }
  
  private handleMetadata(streamId: string, metadata: any, options: StreamingOptions): void {
    const response = this.streamingResponses.get(streamId)
    if (!response) return
    
    // Update response with metadata
    response.message.metadata = { ...response.message.metadata, ...metadata }
  }
  
  private handleStreamingComplete(streamId: string, options: StreamingOptions): void {
    const response = this.streamingResponses.get(streamId)
    if (!response) return
    
    response.endTime = Date.now()
    
    const finalContent = response.tokens.join('')
    options.onComplete(finalContent)
  }
  
  private handleStreamingError(streamId: string, error: Error, options: StreamingOptions): void {
    const response = this.streamingResponses.get(streamId)
    if (response) {
      response.error = error.message
      response.endTime = Date.now()
    }
    
    options.onError(error)
  }
  
  private calculateProgress(response: StreamingResponse): StreamingProgress {
    const now = Date.now()
    const timeElapsed = now - response.startTime
    const tokensPerSecond = response.totalTokens / (timeElapsed / 1000)
    
    // Simple estimation for total tokens (would be more sophisticated in production)
    const estimatedTotal = Math.max(100, response.totalTokens * 2)
    
    return {
      tokensGenerated: response.totalTokens,
      estimatedTotal,
      timeElapsed,
      tokensPerSecond
    }
  }
  
  // Stop a specific stream
  stopStream(streamId: string): void {
    const controller = this.activeStreams.get(streamId)
    if (controller) {
      controller.abort()
    }
    
    const eventSource = this.eventSources.get(streamId)
    if (eventSource) {
      eventSource.close()
    }
    
    this.cleanup(streamId)
  }
  
  // Stop all active streams
  stopAllStreams(): void {
    for (const [streamId] of this.activeStreams) {
      this.stopStream(streamId)
    }
  }
  
  // Clean up resources for a stream
  private cleanup(streamId: string): void {
    this.activeStreams.delete(streamId)
    this.eventSources.delete(streamId)
    
    // Keep response data for a while for debugging
    setTimeout(() => {
      this.streamingResponses.delete(streamId)
    }, 60000) // 1 minute
  }
  
  // Get active streams
  getActiveStreams(): string[] {
    return Array.from(this.activeStreams.keys())
  }
  
  // Get streaming statistics
  getStreamingStats(streamId: string): StreamingResponse | undefined {
    return this.streamingResponses.get(streamId)
  }
  
  // Get all streaming statistics
  getAllStreamingStats(): StreamingResponse[] {
    return Array.from(this.streamingResponses.values())
  }
  
  // Check if any streams are active
  hasActiveStreams(): boolean {
    return this.activeStreams.size > 0
  }
  
  // Get average streaming performance
  getAveragePerformance(): {
    averageTokensPerSecond: number
    averageResponseTime: number
    totalStreams: number
  } {
    const responses = Array.from(this.streamingResponses.values())
    const completedResponses = responses.filter(r => r.endTime)
    
    if (completedResponses.length === 0) {
      return {
        averageTokensPerSecond: 0,
        averageResponseTime: 0,
        totalStreams: 0
      }
    }
    
    const totalTokensPerSecond = completedResponses.reduce((sum, response) => {
      const duration = (response.endTime! - response.startTime) / 1000
      return sum + (response.totalTokens / duration)
    }, 0)
    
    const totalResponseTime = completedResponses.reduce((sum, response) => {
      return sum + (response.endTime! - response.startTime)
    }, 0)
    
    return {
      averageTokensPerSecond: totalTokensPerSecond / completedResponses.length,
      averageResponseTime: totalResponseTime / completedResponses.length,
      totalStreams: completedResponses.length
    }
  }
  
  // Estimate streaming time for a given number of tokens
  estimateStreamingTime(tokenCount: number): number {
    const performance = this.getAveragePerformance()
    
    if (performance.averageTokensPerSecond === 0) {
      // Default estimate if no historical data
      return tokenCount * 50 // 50ms per token
    }
    
    return (tokenCount / performance.averageTokensPerSecond) * 1000 // Convert to milliseconds
  }
  
  // Buffer management for smooth streaming
  private tokenBuffer: string[] = []
  private bufferFlushInterval: NodeJS.Timeout | null = null
  
  private startBufferFlushing(streamId: string, options: StreamingOptions): void {
    if (this.bufferFlushInterval) return
    
    this.bufferFlushInterval = setInterval(() => {
      if (this.tokenBuffer.length > 0) {
        const token = this.tokenBuffer.shift()!
        this.handleToken(streamId, token, options)
      }
    }, 50) // Flush every 50ms for smooth display
  }
  
  private stopBufferFlushing(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval)
      this.bufferFlushInterval = null
    }
  }
  
  private addToBuffer(token: string): void {
    this.tokenBuffer.push(token)
  }
}