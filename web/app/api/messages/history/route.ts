import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Mock database - in production, this would be DynamoDB
const messageStore = new Map<string, any>()

// This route uses dynamic features and should not be pre-rendered
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')
    const maxTokens = searchParams.get('maxTokens') ? parseInt(searchParams.get('maxTokens')!) : undefined
    const beforeMessageId = searchParams.get('beforeMessageId')

    if (!conversationId) {
      return new NextResponse('Conversation ID is required', { status: 400 })
    }

    // Get all messages for the conversation
    let messages = Array.from(messageStore.values())
      .filter(msg => 
        msg.conversationId === conversationId && 
        msg.userId === session.user.id &&
        !msg.isDeleted
      )

    // Sort by timestamp (oldest first for proper context reconstruction)
    messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // If beforeMessageId is specified, only include messages before that message
    if (beforeMessageId) {
      const beforeMessageIndex = messages.findIndex(msg => msg.id === beforeMessageId)
      if (beforeMessageIndex !== -1) {
        messages = messages.slice(0, beforeMessageIndex)
      }
    }

    // If maxTokens is specified, trim messages to fit within token limit
    if (maxTokens) {
      let totalTokens = 0
      const trimmedMessages: any[] = []

      // Start from the most recent messages and work backwards
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        const msgTokens = msg.metadata?.tokenCount || estimateTokens(msg.content)
        
        if (totalTokens + msgTokens <= maxTokens) {
          trimmedMessages.unshift(msg)
          totalTokens += msgTokens
        } else {
          // Check if we can fit a partial message (for very long messages)
          const remainingTokens = maxTokens - totalTokens
          if (remainingTokens > 100 && msgTokens > remainingTokens) {
            // Create a truncated version of the message
            const truncatedContent = truncateToTokens(msg.content, remainingTokens - 20)
            const truncatedMsg = {
              ...msg,
              content: truncatedContent + '\n\n[... message truncated for context ...]',
              metadata: {
                ...msg.metadata,
                tokenCount: remainingTokens,
                isTruncated: true,
                originalTokenCount: msgTokens
              }
            }
            trimmedMessages.unshift(truncatedMsg)
            totalTokens = maxTokens
          }
          break
        }
      }

      messages = trimmedMessages
    }

    // Calculate context statistics
    const contextStats = {
      totalMessages: messages.length,
      totalTokens: messages.reduce((sum, msg) => sum + (msg.metadata?.tokenCount || 0), 0),
      totalCharacters: messages.reduce((sum, msg) => sum + msg.content.length, 0),
      messagesByRole: {
        user: messages.filter(msg => msg.role === 'user').length,
        assistant: messages.filter(msg => msg.role === 'assistant').length,
        system: messages.filter(msg => msg.role === 'system').length
      },
      dateRange: {
        earliest: messages.length > 0 ? messages[0].timestamp : null,
        latest: messages.length > 0 ? messages[messages.length - 1].timestamp : null
      },
      hasCodeBlocks: messages.some(msg => msg.metadata?.containsCode),
      hasAttachments: messages.some(msg => msg.attachments && msg.attachments.length > 0),
      isTruncated: maxTokens ? messages.some(msg => msg.metadata?.isTruncated) : false
    }

    return NextResponse.json({
      messages,
      contextStats,
      conversationId,
      requestParams: {
        maxTokens,
        beforeMessageId,
        appliedTokenLimit: maxTokens ? contextStats.totalTokens >= (maxTokens * 0.9) : false
      }
    })
  } catch (error) {
    console.error('Message history retrieval error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Utility functions
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4)
}

function truncateToTokens(content: string, maxTokens: number): string {
  // Simple approximation: 4 characters per token
  const maxChars = maxTokens * 4
  if (content.length <= maxChars) {
    return content
  }

  // Try to truncate at sentence boundaries
  const truncated = content.slice(0, maxChars)
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  )

  if (lastSentenceEnd > maxChars * 0.7) {
    return truncated.slice(0, lastSentenceEnd + 1)
  }

  // Fallback to word boundaries
  const lastSpaceIndex = truncated.lastIndexOf(' ')
  if (lastSpaceIndex > maxChars * 0.8) {
    return truncated.slice(0, lastSpaceIndex)
  }

  // Hard truncation
  return truncated
}