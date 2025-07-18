'use client'

import { useState } from 'react'
import { Copy, Check, User, Bot, RefreshCw, ThumbsUp, ThumbsDown, MoreHorizontal } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu'

import { Message } from '@/types'
import { formatDate, formatRelativeTime, copyToClipboard } from '@/lib/utils'

interface ChatMessageProps {
  message: Message
  isStreaming?: boolean
  onRegenerate?: () => void
  onFeedback?: (messageId: string, feedback: 'positive' | 'negative') => void
  onEdit?: (messageId: string, newContent: string) => void
  onDelete?: (messageId: string) => void
  showAvatar?: boolean
  showTimestamp?: boolean
  showTokens?: boolean
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isStreaming = false,
  onRegenerate,
  onFeedback,
  onEdit,
  onDelete,
  showAvatar = true,
  showTimestamp = true,
  showTokens = false
}) => {
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  
  const handleCopy = async () => {
    try {
      await copyToClipboard(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }
  
  const handleEdit = () => {
    if (isEditing) {
      onEdit?.(message.id, editContent)
      setIsEditing(false)
    } else {
      setIsEditing(true)
    }
  }
  
  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditContent(message.content)
  }
  
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isAssistant = message.role === 'assistant'
  
  const getMessageIcon = () => {
    if (isUser) return <User className="h-4 w-4" />
    if (isSystem) return <Bot className="h-4 w-4 text-orange-500" />
    return <Bot className="h-4 w-4 text-blue-500" />
  }
  
  const getMessageColor = () => {
    if (isUser) return 'bg-blue-50 dark:bg-blue-900/20'
    if (isSystem) return 'bg-orange-50 dark:bg-orange-900/20'
    return 'bg-gray-50 dark:bg-gray-800/50'
  }
  
  const getBorderColor = () => {
    if (isUser) return 'border-blue-200 dark:border-blue-800'
    if (isSystem) return 'border-orange-200 dark:border-orange-800'
    return 'border-gray-200 dark:border-gray-700'
  }
  
  return (
    <div className={`group flex gap-3 p-4 rounded-lg transition-colors ${getMessageColor()} ${getBorderColor()}`}>
      {/* Avatar */}
      {showAvatar && (
        <div className="flex-shrink-0">
          <Avatar className="h-8 w-8">
            <AvatarFallback>
              {getMessageIcon()}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      
      {/* Message Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">
            {isUser ? 'You' : isSystem ? 'System' : 'Assistant'}
          </span>
          
          {showTimestamp && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-gray-500">
                  {formatRelativeTime(message.timestamp)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {formatDate(message.timestamp)}
              </TooltipContent>
            </Tooltip>
          )}
          
          {showTokens && (
            <Badge variant="outline" className="text-xs">
              {message.tokens} tokens
            </Badge>
          )}
          
          {message.streaming && (
            <Badge variant="outline" className="text-xs animate-pulse">
              Streaming...
            </Badge>
          )}
          
          {message.error && (
            <Badge variant="destructive" className="text-xs">
              Error
            </Badge>
          )}
        </div>
        
        {/* Content */}
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full min-h-[100px] p-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleEdit}>
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {message.error ? (
              <div className="text-red-600 dark:text-red-400">
                {message.content}
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({ node, className, children, ...props }: any) {
                    const inline = !className?.includes('language-')
                    const match = /language-(\w+)/.exec(className || '')
                    const language = match ? match[1] : ''
                    
                    return !inline && language ? (
                      <div className="relative">
                        <SyntaxHighlighter
                          style={vscDarkPlus}
                          language={language}
                          PreTag="div"
                          className="rounded-md !bg-gray-900 !text-sm"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => copyToClipboard(String(children))}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    )
                  },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          {children}
                        </table>
                      </div>
                    )
                  },
                  th({ children }) {
                    return (
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800">
                        {children}
                      </th>
                    )
                  },
                  td({ children }) {
                    return (
                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
                        {children}
                      </td>
                    )
                  }
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
            
            {isStreaming && (
              <div className="inline-flex items-center gap-1 text-gray-500 animate-pulse">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            )}
          </div>
        )}
        
        {/* Metadata */}
        {message.metadata?.citations && message.metadata.citations.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-xs font-medium text-gray-500">Sources:</div>
            <div className="flex flex-wrap gap-1">
              {message.metadata.citations.map((citation, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  <a href={citation.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {citation.source}
                  </a>
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                className="h-6 w-6 p-0"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {copied ? 'Copied!' : 'Copy message'}
            </TooltipContent>
          </Tooltip>
          
          {isAssistant && onRegenerate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onRegenerate}
                  className="h-6 w-6 p-0"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Regenerate response</TooltipContent>
            </Tooltip>
          )}
          
          {isAssistant && onFeedback && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onFeedback(message.id, 'positive')}
                    className="h-6 w-6 p-0"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Good response</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onFeedback(message.id, 'negative')}
                    className="h-6 w-6 p-0"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Poor response</TooltipContent>
              </Tooltip>
            </>
          )}
          
          {(onEdit || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={handleEdit}>
                    Edit message
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem 
                    onClick={() => onDelete(message.id)}
                    className="text-red-600 dark:text-red-400"
                  >
                    Delete message
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
}