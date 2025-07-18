'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Send, Square, RotateCcw, Settings, MessageSquare, Bot, User, AlertTriangle, Zap, Clock } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { ContextManager } from '@/lib/context/ContextManager'
import { MessageManager } from '@/lib/messages/MessageManager'
import { StreamingManager } from '@/lib/streaming/StreamingManager'
import { CommandParser } from '@/lib/commands/CommandParser'
import { TokenEstimator } from '@/lib/tokens/TokenEstimator'

import { ChatMessage } from './ChatMessage'
import { ContextWarning } from './ContextWarning'
import { ModelSelector } from './ModelSelector'
import { CommandSuggestions } from './CommandSuggestions'
import { ContextDashboard } from './ContextDashboard'
import { StreamingIndicator } from './StreamingIndicator'

import type { Message, ContextState, ModelInfo } from '@/types'
import { useContextStore } from '@/stores/contextStore'
import { useModelStore } from '@/stores/modelStore'
import { useStreamingStore } from '@/stores/streamingStore'

export const ChatInterface: React.FC = () => {
  const { data: session } = useSession()
  const [input, setInput] = useState('')
  const [isLocalStreaming, setIsLocalStreaming] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false)
  const [commandSuggestions, setCommandSuggestions] = useState<string[]>([])
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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

  // Handle input changes and command detection
  const handleInputChange = useCallback((value: string) => {
    setInput(value)
    
    // Check for commands
    if (value.startsWith('/')) {
      const suggestions = commandParser.getSuggestions(value)
      setCommandSuggestions(suggestions)
      setShowCommandSuggestions(suggestions.length > 0)
    } else {
      setShowCommandSuggestions(false)
    }
  }, [commandParser])

  // Handle command selection
  const handleCommandSelect = useCallback((command: string) => {
    setInput(command + ' ')
    setShowCommandSuggestions(false)
    textareaRef.current?.focus()
  }, [])

  // Send message
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming()) return

    const messageContent = input.trim()
    setInput('')
    setShowCommandSuggestions(false)

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
        
        // Handle special data in result if needed
        if (result.data) {
          // Process any data returned by the command
          console.log('Command data:', result.data)
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
    
    // Log context analysis for debugging
    console.log('Context analysis:', currentContextState)

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
          context: currentContextState
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
                  // Update streaming content through store
                  const currentMsgId = getCurrentMessageId()
                  if (currentMsgId) {
                    updateStreamingToken(currentMsgId, content)
                  }
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
        
        // Add error message
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
    updateStreamingToken
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
    toast.success('Context cleared')
  }, [clearMessages, contextManager])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'Enter':
            e.preventDefault()
            if (!isStreaming()) sendMessage()
            break
          case 'k':
            e.preventDefault()
            clearContext()
            break
          case 'd':
            e.preventDefault()
            setShowDashboard(!showDashboard)
            break
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sendMessage, isStreaming, clearContext, showDashboard])

  // Handle textarea resize
  const handleTextareaResize = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [])

  useEffect(() => {
    handleTextareaResize()
  }, [input, handleTextareaResize])

  const [tokenCount, setTokenCount] = useState(0)
  
  // Update token count when input changes
  useEffect(() => {
    if (input.trim()) {
      tokenEstimator.estimate(input).then(setTokenCount)
    } else {
      setTokenCount(0)
    }
  }, [input, tokenEstimator])
  // Calculate total tokens from messages
  const totalTokens = messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0)
  const contextInfo = { totalTokens }

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        {/* Sidebar */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-6 w-6 text-blue-600" />
                <span className="font-semibold text-lg">GovBiz.AI</span>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDashboard(!showDashboard)}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Toggle Dashboard (Ctrl+D)</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearContext}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clear Context (Ctrl+K)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            
            {/* Model Selector */}
            <div className="mt-4">
              <ModelSelector
                currentModel={currentModel}
                availableModels={availableModels}
                onModelChange={(modelId: string) => {
                  const model = getModel(modelId)
                  if (model) setCurrentModel(model)
                }}
              />
            </div>
          </div>

          {/* Context Information */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Messages</span>
              <Badge variant="secondary">{messages.length}</Badge>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Tokens</span>
              <Badge 
                variant={contextInfo.totalTokens > 4000 ? "destructive" : "secondary"}
              >
                {contextInfo.totalTokens.toLocaleString()}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Model</span>
              <Badge variant="outline">{currentModel?.name || 'Unknown'}</Badge>
            </div>

          </div>

          <Separator />

          {/* Keyboard Shortcuts */}
          <div className="p-4 space-y-2">
            <div className="text-xs text-gray-600 dark:text-gray-400 font-medium">
              Keyboard Shortcuts
            </div>
            <div className="space-y-1 text-xs text-gray-500 dark:text-gray-500">
              <div className="flex justify-between">
                <span>Send message</span>
                <span>Ctrl+Enter</span>
              </div>
              <div className="flex justify-between">
                <span>Clear context</span>
                <span>Ctrl+K</span>
              </div>
              <div className="flex justify-between">
                <span>Toggle dashboard</span>
                <span>Ctrl+D</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full p-6">
              <div className="space-y-6 max-w-4xl mx-auto">
                {messages.length === 0 && (
                  <div className="text-center py-12">
                    <Bot className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Welcome to GovBiz.AI
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                      Start a conversation to get help with government contracting,
                      sources sought opportunities, and proposal writing.
                    </p>
                    <div className="mt-6 space-y-2 text-sm text-gray-500 dark:text-gray-500">
                      <p>Try commands like:</p>
                      <div className="space-y-1">
                        <p><code>/search</code> - Find opportunities</p>
                        <p><code>/analyze</code> - Analyze documents</p>
                        <p><code>/workflow</code> - Create workflows</p>
                      </div>
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    isStreaming={false}
                  />
                ))}

                {streamingState.isStreaming && streamingState.tokens.length > 0 && (
                  <div className="flex items-start gap-4 group">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback>
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm">Assistant</span>
                        <StreamingIndicator />
                      </div>
                      
                      <Card className="p-4 bg-gray-50 dark:bg-gray-800">
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          {streamingState.tokens.join('')}
                          <span className="animate-pulse">█</span>
                        </div>
                      </Card>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="p-6 max-w-4xl mx-auto">
              {/* Command Suggestions */}
              {showCommandSuggestions && (
                <div className="mb-4">
                  <CommandSuggestions
                    suggestions={commandSuggestions}
                    onSelect={handleCommandSelect}
                  />
                </div>
              )}

              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder="Ask about government contracting, sources sought, or anything else..."
                  className="min-h-[60px] max-h-[200px] resize-none pr-24"
                  disabled={isStreaming()}
                />

                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  {tokenCount > 0 && (
                    <Badge 
                      variant={tokenCount > 1000 ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      {tokenCount}
                    </Badge>
                  )}

                  {isStreaming() ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={stopGeneration}
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={sendMessage}
                      disabled={!input.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-500">
                <span>
                  Press Ctrl+Enter to send
                </span>
                <span>
                  {messages.length} messages • {contextInfo.totalTokens} tokens
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Overlay */}
        {showDashboard && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
              <ContextDashboard 
                contextState={contextState}
                messages={messages}
                onAction={(action: string, data?: any) => {
                  console.log('Dashboard action:', action, data)
                  // Handle dashboard actions here
                }}
                onClose={() => setShowDashboard(false)}
              />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

export default ChatInterface