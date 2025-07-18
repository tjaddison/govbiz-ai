import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { Message, ContextState, Warning, CompressionEvent, PreservedSection } from '@/types'

interface ContextStore {
  // State
  messages: Message[]
  contextState: ContextState
  warnings: Warning[]
  
  // Actions
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  removeMessage: (id: string) => void
  clearMessages: () => void
  
  // Context operations
  clearContext: () => void
  compressContext: () => Promise<void>
  updateContextState: (updates: Partial<ContextState>) => void
  
  // Warning management
  addWarning: (warning: Warning) => void
  dismissWarning: (id: string) => void
  clearWarnings: () => void
  
  // Utility functions
  getTokenCount: () => number
  getUtilization: () => number
  getRecentMessages: (count: number) => Message[]
  getMessagesByRole: (role: Message['role']) => Message[]
  searchMessages: (query: string) => Message[]
  
  // Compression history
  addCompressionEvent: (event: CompressionEvent) => void
  getCompressionHistory: () => CompressionEvent[]
  
  // Preserved sections
  addPreservedSection: (section: PreservedSection) => void
  removePreservedSection: (id: string) => void
  getPreservedSections: () => PreservedSection[]
}

export const useContextStore = create<ContextStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    messages: [],
    contextState: {
      messages: [],
      tokenCount: 0,
      maxTokens: 200000,
      compressionHistory: [],
      preservedSections: [],
      modelConfig: {
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.95,
        topK: 40,
        stopSequences: [],
        presencePenalty: 0,
        frequencyPenalty: 0
      },
      userPreferences: {
        preserveCodeBlocks: true,
        preserveImportantAnswers: true,
        compressionAggressiveness: 'balanced',
        warningThresholds: {
          notice: 0.75,
          warning: 0.85,
          critical: 0.95
        }
      }
    },
    warnings: [],
    
    // Message operations
    addMessage: (message: Message) => {
      set((state) => {
        const newMessages = [...state.messages, message]
        const newTokenCount = newMessages.reduce((sum, msg) => sum + msg.tokens, 0)
        
        return {
          messages: newMessages,
          contextState: {
            ...state.contextState,
            messages: newMessages,
            tokenCount: newTokenCount
          }
        }
      })
      
      // Check if we need to trigger warnings
      const { contextState } = get()
      const utilization = contextState.tokenCount / contextState.maxTokens
      
      if (utilization >= contextState.userPreferences.warningThresholds.critical) {
        get().addWarning({
          id: crypto.randomUUID(),
          level: 'critical',
          title: 'Context Limit Critical',
          message: 'Context is critically full. Immediate action required.',
          actions: [
            { id: 'clear', label: 'Clear Context', icon: 'trash' },
            { id: 'compress', label: 'Compress Now', icon: 'compress' },
            { id: 'export', label: 'Export & Clear', icon: 'download' }
          ],
          data: {
            currentTokens: contextState.tokenCount,
            maxTokens: contextState.maxTokens,
            utilization,
            messagesCount: contextState.messages.length,
            compressionEstimate: {
              removedMessages: Math.floor(contextState.messages.length * 0.5),
              tokensSaved: Math.floor(contextState.tokenCount * 0.5),
              qualityLoss: 0.3,
              strategy: 'hybrid'
            }
          },
          timestamp: Date.now(),
          lastUpdated: Date.now()
        })
      } else if (utilization >= contextState.userPreferences.warningThresholds.warning) {
        get().addWarning({
          id: crypto.randomUUID(),
          level: 'warning',
          title: 'Context Approaching Limit',
          message: 'Context will be compressed on next response.',
          actions: [
            { id: 'compress', label: 'Compress Now', icon: 'compress' },
            { id: 'clear', label: 'Clear Context', icon: 'trash' },
            { id: 'export', label: 'Export First', icon: 'download' }
          ],
          data: {
            currentTokens: contextState.tokenCount,
            maxTokens: contextState.maxTokens,
            utilization,
            messagesCount: contextState.messages.length,
            compressionEstimate: {
              removedMessages: Math.floor(contextState.messages.length * 0.3),
              tokensSaved: Math.floor(contextState.tokenCount * 0.3),
              qualityLoss: 0.2,
              strategy: 'preservation'
            }
          },
          timestamp: Date.now(),
          lastUpdated: Date.now()
        })
      } else if (utilization >= contextState.userPreferences.warningThresholds.notice) {
        get().addWarning({
          id: crypto.randomUUID(),
          level: 'notice',
          title: 'Context Usage Notice',
          message: 'Context approaching limit. Consider clearing or compressing.',
          actions: [
            { id: 'view', label: 'View Context', icon: 'eye' },
            { id: 'compress', label: 'Compress Now', icon: 'compress' }
          ],
          data: {
            currentTokens: contextState.tokenCount,
            maxTokens: contextState.maxTokens,
            utilization,
            messagesCount: contextState.messages.length,
            compressionEstimate: {
              removedMessages: Math.floor(contextState.messages.length * 0.2),
              tokensSaved: Math.floor(contextState.tokenCount * 0.2),
              qualityLoss: 0.1,
              strategy: 'removal'
            }
          },
          timestamp: Date.now(),
          lastUpdated: Date.now()
        })
      }
    },
    
    updateMessage: (id: string, updates: Partial<Message>) => {
      set((state) => {
        const messageIndex = state.messages.findIndex(msg => msg.id === id)
        if (messageIndex === -1) return state
        
        const updatedMessages = [...state.messages]
        updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], ...updates }
        
        const newTokenCount = updatedMessages.reduce((sum, msg) => sum + msg.tokens, 0)
        
        return {
          messages: updatedMessages,
          contextState: {
            ...state.contextState,
            messages: updatedMessages,
            tokenCount: newTokenCount
          }
        }
      })
    },
    
    removeMessage: (id: string) => {
      set((state) => {
        const newMessages = state.messages.filter(msg => msg.id !== id)
        const newTokenCount = newMessages.reduce((sum, msg) => sum + msg.tokens, 0)
        
        return {
          messages: newMessages,
          contextState: {
            ...state.contextState,
            messages: newMessages,
            tokenCount: newTokenCount
          }
        }
      })
    },
    
    clearMessages: () => {
      set((state) => ({
        messages: [],
        contextState: {
          ...state.contextState,
          messages: [],
          tokenCount: 0
        }
      }))
    },
    
    // Context operations
    clearContext: () => {
      set((state) => ({
        messages: [],
        contextState: {
          ...state.contextState,
          messages: [],
          tokenCount: 0
        },
        warnings: []
      }))
    },
    
    compressContext: async () => {
      const { messages, contextState } = get()
      
      // Simple compression strategy - keep system messages and recent user/assistant pairs
      const systemMessages = messages.filter(msg => msg.role === 'system')
      const recentMessages = messages.slice(-10).filter(msg => msg.role !== 'system')
      
      const compressedMessages = [...systemMessages, ...recentMessages]
      const newTokenCount = compressedMessages.reduce((sum, msg) => sum + msg.tokens, 0)
      
      const compressionEvent: CompressionEvent = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        beforeTokens: contextState.tokenCount,
        afterTokens: newTokenCount,
        removedMessageIds: messages
          .filter(msg => !compressedMessages.includes(msg))
          .map(msg => msg.id),
        strategy: 'preservation' as any,
        qualityScore: 0.8
      }
      
      set((state) => ({
        messages: compressedMessages,
        contextState: {
          ...state.contextState,
          messages: compressedMessages,
          tokenCount: newTokenCount,
          compressionHistory: [...state.contextState.compressionHistory, compressionEvent]
        },
        warnings: []
      }))
    },
    
    updateContextState: (updates: Partial<ContextState>) => {
      set((state) => ({
        contextState: {
          ...state.contextState,
          ...updates
        }
      }))
    },
    
    // Warning management
    addWarning: (warning: Warning) => {
      set((state) => ({
        warnings: [...state.warnings.filter(w => w.level !== warning.level), warning]
      }))
    },
    
    dismissWarning: (id: string) => {
      set((state) => ({
        warnings: state.warnings.filter(w => w.id !== id)
      }))
    },
    
    clearWarnings: () => {
      set(() => ({
        warnings: []
      }))
    },
    
    // Utility functions
    getTokenCount: () => {
      const { contextState } = get()
      return contextState.tokenCount
    },
    
    getUtilization: () => {
      const { contextState } = get()
      return contextState.tokenCount / contextState.maxTokens
    },
    
    getRecentMessages: (count: number) => {
      const { messages } = get()
      return messages.slice(-count)
    },
    
    getMessagesByRole: (role: Message['role']) => {
      const { messages } = get()
      return messages.filter(msg => msg.role === role)
    },
    
    searchMessages: (query: string) => {
      const { messages } = get()
      return messages.filter(msg => 
        msg.content.toLowerCase().includes(query.toLowerCase())
      )
    },
    
    // Compression history
    addCompressionEvent: (event: CompressionEvent) => {
      set((state) => ({
        contextState: {
          ...state.contextState,
          compressionHistory: [...state.contextState.compressionHistory, event]
        }
      }))
    },
    
    getCompressionHistory: () => {
      const { contextState } = get()
      return contextState.compressionHistory
    },
    
    // Preserved sections
    addPreservedSection: (section: PreservedSection) => {
      set((state) => ({
        contextState: {
          ...state.contextState,
          preservedSections: [...state.contextState.preservedSections, section]
        }
      }))
    },
    
    removePreservedSection: (id: string) => {
      set((state) => ({
        contextState: {
          ...state.contextState,
          preservedSections: state.contextState.preservedSections.filter(s => s.id !== id)
        }
      }))
    },
    
    getPreservedSections: () => {
      const { contextState } = get()
      return contextState.preservedSections
    }
  }))
)