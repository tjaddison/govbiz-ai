'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Bot, FileText, Code, BarChart3, FormInput, Plus, Send } from 'lucide-react'
import { toast } from 'sonner'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

import { ContextManager } from '@/lib/context/ContextManager'
import { MessageManager } from '@/lib/messages/MessageManager'
import { StreamingManager } from '@/lib/streaming/StreamingManager'
import { CommandParser } from '@/lib/commands/CommandParser'
import { TokenEstimator } from '@/lib/tokens/TokenEstimator'

// New components
import Header from '@/components/layout/Header'
import Sidebar from '@/components/layout/Sidebar'
import { ChatMessage } from './ChatMessage'
import { InputArea } from './InputArea'
import { Artifact } from './Artifact'
import { StreamingIndicator } from './StreamingIndicator'

import type { Message, ContextState, ModelInfo } from '@/types'
import { useContextStore } from '@/stores/contextStore'
import { useModelStore } from '@/stores/modelStore'
import { useStreamingStore } from '@/stores/streamingStore'

export const ChatInterface: React.FC = () => {
  const { data: session } = useSession()
  const [input, setInput] = useState('')
  const [isLocalStreaming, setIsLocalStreaming] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [currentClassification, setCurrentClassification] = useState('UNCLASSIFIED')
  const [artifacts, setArtifacts] = useState<any[]>([])
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Global state management
  const { 
    messages, 
    contextState, 
    addMessage, 
    updateMessage, 
    clearMessages 
  } = useContextStore()
  
  const { 
    currentModel, 
    availableModels, 
    setCurrentModel,
    getModel
  } = useModelStore()
  
  const { 
    streamingState, 
    streamingProgress,
    startStreaming, 
    stopStreaming,
    updateStreamingToken,
    isStreaming,
    getCurrentMessageId
  } = useStreamingStore()

  // Managers
  const contextManager = useRef(new ContextManager(contextState)).current
  const messageManager = useRef(new MessageManager()).current
  const streamingManager = useRef(new StreamingManager()).current
  const commandParser = useRef(new CommandParser()).current
  const tokenEstimator = useRef(new TokenEstimator(currentModel?.id || 'claude-sonnet-4')).current

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingState, scrollToBottom])

  // Send message
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming()) return

    const messageContent = input.trim()
    setInput('')

    // Check if it's a command
    if (messageContent.startsWith('/')) {
      try {
        const result = await commandParser.execute(messageContent, {
          contextManager,
          messageManager,
          currentModel: currentModel!,
          session,
          timestamp: Date.now()
        })
        addMessage({
          id: Date.now().toString(),
          role: 'user',
          content: messageContent,
          timestamp: Date.now(),
          tokens: await tokenEstimator.estimate(messageContent)
        })
        
        if (result.message) {
          addMessage({
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: result.message,
            timestamp: Date.now() + 1,
            tokens: await tokenEstimator.estimate(result.message)
          })
        }
        
        return
      } catch (error) {
        toast.error('Command execution failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
        return
      }
    }

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
      tokens: await tokenEstimator.estimate(messageContent)
    }
    
    addMessage(userMessage)

    // Check context state
    const currentContextState = contextManager.analyzeContext()

    // Start streaming response
    setIsLocalStreaming(true)
    startStreaming(userMessage.id)
    
    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          model: currentModel,
          stream: true,
          context: currentContextState,
          classification: currentClassification,
          attachedFiles: attachedFiles.map(f => ({ name: f.name, type: f.type, size: f.size }))
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulatedContent = ''
      
      const assistantMessageId = (Date.now() + 2).toString()

      try {
        while (true) {
          const { done, value } = await reader.read()
          
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              
              try {
                const parsed = JSON.parse(data)
                
                if (parsed.type === 'token' && parsed.content) {
                  const content = parsed.content
                  accumulatedContent += content
                  const currentMsgId = getCurrentMessageId()
                  if (currentMsgId) {
                    updateStreamingToken(currentMsgId, content)
                  }
                } else if (parsed.type === 'done') {
                  break
                } else if (parsed.type === 'error') {
                  throw new Error(parsed.message || 'Streaming error')
                }
                
              } catch (parseError) {
                console.warn('Failed to parse streaming data:', parseError)
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // Finalize the message
      if (accumulatedContent) {
        const finalMessage: Message = {
          id: assistantMessageId,
          role: 'assistant',
          content: accumulatedContent,
          timestamp: Date.now(),
          tokens: await tokenEstimator.estimate(accumulatedContent)
        }
        
        addMessage(finalMessage)
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        toast.info('Message generation stopped')
      } else {
        console.error('Chat error:', error)
        toast.error('Failed to send message: ' + (error instanceof Error ? error.message : 'Unknown error'))
        
        const errorContent = 'Sorry, I encountered an error while processing your request. Please try again.'
        addMessage({
          id: (Date.now() + 3).toString(),
          role: 'assistant',
          content: errorContent,
          timestamp: Date.now(),
          tokens: await tokenEstimator.estimate(errorContent)
        })
      }
    } finally {
      setIsLocalStreaming(false)
      stopStreaming()
      abortControllerRef.current = null
    }
  }, [
    input, 
    isStreaming, 
    messages, 
    currentModel, 
    addMessage, 
    contextManager, 
    commandParser, 
    tokenEstimator, 
    startStreaming, 
    stopStreaming,
    getCurrentMessageId,
    messageManager,
    session,
    updateStreamingToken,
    currentClassification,
    attachedFiles
  ])

  // Stop generation
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  // Clear context
  const clearContext = useCallback(() => {
    clearMessages()
    contextManager.clearContext()
    setArtifacts([])
    setAttachedFiles([])
    toast.success('Context cleared')
  }, [clearMessages, contextManager])

  // Handle new chat
  const handleNewChat = useCallback(() => {
    clearContext()
  }, [clearContext])

  // Handle file attachment
  const handleFileAttachment = useCallback((files: File[]) => {
    setAttachedFiles(prev => [...prev, ...files])
  }, [])

  // Calculate total tokens from messages
  const totalTokens = messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0)

  const hasArtifacts = artifacts.length > 0

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Top Navbar */}
      <div className="border-b border-gray-700 bg-gray-900 p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-gray-800 rounded-md">
              <Plus className="h-4 w-4 text-gray-400" />
            </button>
            <div className="text-sm text-gray-400">Claude Sonnet 4</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-gray-400">Write</div>
            <div className="text-sm text-gray-400">Learn</div>
            <div className="text-sm text-gray-400">Code</div>
            <div className="text-sm text-gray-400">Life stuff</div>
            <div className="text-sm text-gray-400">From your apps</div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex flex-col" style={{ height: 'calc(100vh - 73px)' }}>
        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full p-6">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center" style={{ paddingBottom: '120px' }}>
                <div className="text-center max-w-2xl mx-auto px-4">
                  <div className="mb-8">
                    <span className="text-orange-500 text-4xl mb-4 block">✳️</span>
                    <h1 className="text-3xl font-light text-gray-200 mb-8">
                      How was your day, {session?.user?.name?.split(' ')[0] || 'Terrance'}?
                    </h1>
                  </div>
                </div>
              </div>
            )}

            {/* Messages Display */}
            {messages.length > 0 && (
              <div className="max-w-3xl mx-auto space-y-6">
                {messages.map((message) => (
                  <div key={message.id} className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                      {message.role === 'user' ? (
                        <span className="text-sm font-medium text-gray-200">
                          {session?.user?.name?.charAt(0)?.toUpperCase() || 'U'}
                        </span>
                      ) : (
                        <span className="text-orange-500">✳️</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-gray-200 whitespace-pre-wrap">
                        {message.content}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

            {/* Input Area */}
        <div className="border-t border-gray-700 bg-gray-900 p-6">
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="How can I help you today?"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-4 pr-12 text-gray-100 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                rows={1}
                style={{ minHeight: '56px', maxHeight: '200px' }}
                disabled={isStreaming()}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isStreaming()}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatInterface