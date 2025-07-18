'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Bot, FileText, Code, BarChart3, FormInput } from 'lucide-react'
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
      const response = await fetch('/api/chat', {
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
              
              if (data === '[DONE]') {
                break
              }

              try {
                const parsed = JSON.parse(data)
                
                if (parsed.choices?.[0]?.delta?.content) {
                  const content = parsed.choices[0].delta.content
                  accumulatedContent += content
                  const currentMsgId = getCurrentMessageId()
                  if (currentMsgId) {
                    updateStreamingToken(currentMsgId, content)
                  }
                }
                
                // Handle artifacts if present
                if (parsed.artifact) {
                  setArtifacts(prev => [...prev, parsed.artifact])
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
    <div className="main-layout">
      {/* Header */}
      <Header
        onMenuToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isSidebarCollapsed={isSidebarCollapsed}
        currentPath="/chat"
        securityClassification={currentClassification as any}
      />

      {/* Main Content */}
      <div className="chat-container" style={{ height: 'calc(100vh - 64px)' }}>
        {/* Sidebar */}
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onNewChat={handleNewChat}
          currentConversationId={messages.length > 0 ? '1' : undefined}
        />

        {/* Chat Main Area */}
        <div className={`chat-main ${hasArtifacts ? 'flex flex-col lg:flex-row' : ''}`}>
          {/* Messages Column */}
          <div className={hasArtifacts ? 'flex-1 lg:w-3/5 flex flex-col' : 'flex-1 flex flex-col'}>
            {/* Messages */}
            <div className="chat-messages">
              <ScrollArea className="h-full p-3 sm:p-4 lg:p-6">
                <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
                  {messages.length === 0 && (
                    <div className="text-center py-8 sm:py-12">
                      <Bot className="h-8 w-8 sm:h-12 sm:w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                        Welcome to GovBiz.AI
                      </h3>
                      <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto px-4">
                        Start a conversation to get help with government contracting,
                        sources sought opportunities, and proposal writing.
                      </p>
                      <div className="mt-4 sm:mt-6 space-y-2 text-xs sm:text-sm text-gray-500">
                        <p className="hidden sm:block">Try commands like:</p>
                        <div className="space-y-1 hidden sm:block">
                          <p><code>/search</code> - Find opportunities</p>
                          <p><code>/analyze</code> - Analyze documents</p>
                          <p><code>/workflow</code> - Create workflows</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`${
                        message.role === 'user' 
                          ? 'message-user' 
                          : message.role === 'assistant'
                          ? 'message-assistant'
                          : 'message-system'
                      }`}
                    >
                      <div className="flex items-start gap-2 sm:gap-4">
                        <Avatar className="h-6 w-6 sm:h-8 sm:w-8 shrink-0">
                          <AvatarFallback className="text-xs sm:text-sm">
                            {message.role === 'user' ? (
                              session?.user?.name?.charAt(0)?.toUpperCase() || 'U'
                            ) : (
                              <Bot className="h-3 w-3 sm:h-4 sm:w-4" />
                            )}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 sm:mb-2">
                            <span className="font-medium text-xs sm:text-sm">
                              {message.role === 'user' ? (session?.user?.name || 'You') : 'Assistant'}
                            </span>
                            <span className="text-xs text-gray-500 hidden sm:inline">
                              {new Date(message.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          
                          <div className="message-content">
                            <div className="prose prose-xs sm:prose-sm max-w-none">
                              {message.content}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {streamingState.isStreaming && streamingState.tokens.length > 0 && (
                    <div className="message-assistant">
                      <div className="flex items-start gap-2 sm:gap-4">
                        <Avatar className="h-6 w-6 sm:h-8 sm:w-8 shrink-0">
                          <AvatarFallback className="text-xs sm:text-sm">
                            <Bot className="h-3 w-3 sm:h-4 sm:w-4" />
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 sm:mb-2">
                            <span className="font-medium text-xs sm:text-sm">Assistant</span>
                            <StreamingIndicator />
                          </div>
                          
                          <div className="message-content">
                            <div className="prose prose-xs sm:prose-sm max-w-none">
                              {streamingState.tokens.join('')}
                              <span className="animate-pulse">█</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
            </div>

            {/* Input Area */}
            <InputArea
              value={input}
              onChange={setInput}
              onSend={sendMessage}
              onAttachment={handleFileAttachment}
              onClassificationChange={setCurrentClassification}
              disabled={false}
              isStreaming={isStreaming()}
              onStopStreaming={stopGeneration}
              tokenCount={totalTokens}
              maxTokens={200000}
            />
          </div>

          {/* Artifacts Column */}
          {hasArtifacts && (
            <div className="w-full lg:w-2/5 mt-4 lg:mt-0 border-t lg:border-t-0 lg:border-l border-gray-200 bg-white">
              <div className="h-full flex flex-col">
                <div className="p-3 sm:p-4 border-b border-gray-200">
                  <h3 className="font-medium text-sm sm:text-base text-gray-900">Generated Artifacts</h3>
                  <p className="text-xs sm:text-sm text-gray-500">
                    {artifacts.length} item{artifacts.length !== 1 ? 's' : ''}
                  </p>
                </div>
                
                <ScrollArea className="flex-1 p-3 sm:p-4">
                  <div className="space-y-3 sm:space-y-4">
                    {artifacts.map((artifact, index) => (
                      <Artifact
                        key={artifact.id || index}
                        {...artifact}
                        className="mb-3 sm:mb-4"
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatInterface