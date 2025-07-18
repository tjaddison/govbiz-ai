import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { StreamingState, StreamingProgress } from '@/types'

interface StreamingStore {
  // State
  streamingState: StreamingState
  streamingProgress: StreamingProgress | null
  
  // Actions
  startStreaming: (messageId: string) => void
  stopStreaming: () => void
  updateStreamingToken: (messageId: string, token: string) => void
  updateStreamingProgress: (progress: StreamingProgress) => void
  resetStreaming: () => void
  
  // Getters
  isStreaming: () => boolean
  getCurrentMessageId: () => string | undefined
  getTokensGenerated: () => number
  getStreamingDuration: () => number
  getTokensPerSecond: () => number
  getEstimatedTimeRemaining: () => number
  
  // Utility functions
  calculateProgress: () => StreamingProgress | null
  getStreamingStats: () => {
    totalTokens: number
    duration: number
    averageSpeed: number
    efficiency: number
  }
}

export const useStreamingStore = create<StreamingStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    streamingState: {
      isStreaming: false,
      currentMessageId: undefined,
      tokens: [],
      totalTokens: 0,
      startTime: undefined,
      estimatedTimeRemaining: undefined
    },
    streamingProgress: null,
    
    // Actions
    startStreaming: (messageId: string) => {
      set(() => ({
        streamingState: {
          isStreaming: true,
          currentMessageId: messageId,
          tokens: [],
          totalTokens: 0,
          startTime: Date.now(),
          estimatedTimeRemaining: undefined
        },
        streamingProgress: null
      }))
    },
    
    stopStreaming: () => {
      set((state) => ({
        streamingState: {
          ...state.streamingState,
          isStreaming: false,
          currentMessageId: undefined,
          estimatedTimeRemaining: undefined
        }
      }))
    },
    
    updateStreamingToken: (messageId: string, token: string) => {
      set((state) => {
        if (!state.streamingState.isStreaming || state.streamingState.currentMessageId !== messageId) {
          return state
        }
        
        const newTokens = [...state.streamingState.tokens, token]
        const now = Date.now()
        const startTime = state.streamingState.startTime || now
        const duration = now - startTime
        const tokensPerSecond = newTokens.length / (duration / 1000)
        
        // Simple estimation for remaining time (would be more sophisticated in production)
        const estimatedTotal = Math.max(100, newTokens.length * 2) // Rough estimate
        const estimatedTimeRemaining = estimatedTotal > newTokens.length 
          ? (estimatedTotal - newTokens.length) / tokensPerSecond * 1000
          : 0
        
        const progress: StreamingProgress = {
          tokensGenerated: newTokens.length,
          estimatedTotal,
          timeElapsed: duration,
          tokensPerSecond
        }
        
        return {
          streamingState: {
            ...state.streamingState,
            tokens: newTokens,
            totalTokens: newTokens.length,
            estimatedTimeRemaining
          },
          streamingProgress: progress
        }
      })
    },
    
    updateStreamingProgress: (progress: StreamingProgress) => {
      set(() => ({
        streamingProgress: progress
      }))
    },
    
    resetStreaming: () => {
      set(() => ({
        streamingState: {
          isStreaming: false,
          currentMessageId: undefined,
          tokens: [],
          totalTokens: 0,
          startTime: undefined,
          estimatedTimeRemaining: undefined
        },
        streamingProgress: null
      }))
    },
    
    // Getters
    isStreaming: () => {
      const { streamingState } = get()
      return streamingState.isStreaming
    },
    
    getCurrentMessageId: () => {
      const { streamingState } = get()
      return streamingState.currentMessageId
    },
    
    getTokensGenerated: () => {
      const { streamingState } = get()
      return streamingState.totalTokens
    },
    
    getStreamingDuration: () => {
      const { streamingState } = get()
      if (!streamingState.startTime) return 0
      return Date.now() - streamingState.startTime
    },
    
    getTokensPerSecond: () => {
      const { streamingState } = get()
      if (!streamingState.startTime || streamingState.totalTokens === 0) return 0
      const duration = (Date.now() - streamingState.startTime) / 1000
      return streamingState.totalTokens / duration
    },
    
    getEstimatedTimeRemaining: () => {
      const { streamingState } = get()
      return streamingState.estimatedTimeRemaining || 0
    },
    
    // Utility functions
    calculateProgress: () => {
      const { streamingState } = get()
      if (!streamingState.isStreaming || !streamingState.startTime) return null
      
      const now = Date.now()
      const duration = now - streamingState.startTime
      const tokensPerSecond = streamingState.totalTokens / (duration / 1000)
      
      return {
        tokensGenerated: streamingState.totalTokens,
        estimatedTotal: Math.max(100, streamingState.totalTokens * 1.5),
        timeElapsed: duration,
        tokensPerSecond
      }
    },
    
    getStreamingStats: () => {
      const { streamingState } = get()
      const duration = streamingState.startTime 
        ? Date.now() - streamingState.startTime 
        : 0
      
      const averageSpeed = duration > 0 
        ? streamingState.totalTokens / (duration / 1000) 
        : 0
      
      // Simple efficiency calculation (would be more sophisticated in production)
      const efficiency = Math.min(1, averageSpeed / 20) // Assuming 20 tokens/sec is optimal
      
      return {
        totalTokens: streamingState.totalTokens,
        duration,
        averageSpeed,
        efficiency
      }
    }
  }))
)

// Utility hook for streaming statistics
export const useStreamingStats = () => {
  const store = useStreamingStore()
  return {
    isStreaming: store.isStreaming(),
    tokensGenerated: store.getTokensGenerated(),
    duration: store.getStreamingDuration(),
    speed: store.getTokensPerSecond(),
    progress: store.streamingProgress,
    stats: store.getStreamingStats()
  }
}

// Utility hook for streaming controls
export const useStreamingControls = () => {
  const store = useStreamingStore()
  return {
    start: store.startStreaming,
    stop: store.stopStreaming,
    updateToken: store.updateStreamingToken,
    reset: store.resetStreaming,
    updateProgress: store.updateStreamingProgress
  }
}