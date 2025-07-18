import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

// Message validation schema
const MessageSchema = z.object({
  content: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']),
  conversationId: z.string().min(1),
  type: z.enum(['text', 'code', 'image']).default('text'),
  language: z.string().optional(),
  attachments: z.array(z.object({
    id: z.string(),
    name: z.string(),
    size: z.number(),
    type: z.string(),
    url: z.string().optional()
  })).optional(),
  metadata: z.object({
    tokenCount: z.number().optional(),
    wordCount: z.number().optional(),
    characterCount: z.number().optional(),
    containsCode: z.boolean().optional(),
    processingTime: z.number().optional(),
    modelUsed: z.string().optional()
  }).optional()
})

const MessageBatchSchema = z.object({
  messages: z.array(MessageSchema)
})

// Mock database - in production, this would be DynamoDB
const messageStore = new Map<string, any>()
let messageIdCounter = 1

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    
    // Check if this is a batch operation
    if (body.messages && Array.isArray(body.messages)) {
      return handleBatchSave(body, session.user.id)
    }
    
    // Single message save
    const validatedMessage = MessageSchema.parse(body)
    
    const message = {
      id: `msg_${messageIdCounter++}`,
      ...validatedMessage,
      userId: session.user.id,
      timestamp: new Date().toISOString(),
      metadata: {
        tokenCount: estimateTokens(validatedMessage.content),
        wordCount: countWords(validatedMessage.content),
        characterCount: validatedMessage.content.length,
        containsCode: detectCodeBlocks(validatedMessage.content),
        ...validatedMessage.metadata
      }
    }

    messageStore.set(message.id, message)

    return NextResponse.json(message)
  } catch (error) {
    console.error('Message save error:', error)
    if (error instanceof z.ZodError) {
      return new NextResponse(`Validation error: ${error.message}`, { status: 400 })
    }
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    
    // Parse query parameters
    const filters = {
      userId: searchParams.get('userId') || session.user.id,
      conversationId: searchParams.get('conversationId'),
      role: searchParams.get('role') as 'user' | 'assistant' | 'system' | null,
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
      search: searchParams.get('search'),
      hasAttachments: searchParams.get('hasAttachments'),
      tokenCountMin: searchParams.get('tokenCountMin'),
      tokenCountMax: searchParams.get('tokenCountMax')
    }
    
    const limit = parseInt(searchParams.get('limit') || '50')
    const cursor = searchParams.get('cursor')

    // Filter messages based on criteria
    let messages = Array.from(messageStore.values())
      .filter(msg => msg.userId === filters.userId)

    if (filters.conversationId) {
      messages = messages.filter(msg => msg.conversationId === filters.conversationId)
    }

    if (filters.role) {
      messages = messages.filter(msg => msg.role === filters.role)
    }

    if (filters.dateFrom) {
      messages = messages.filter(msg => 
        new Date(msg.timestamp) >= new Date(filters.dateFrom!)
      )
    }

    if (filters.dateTo) {
      messages = messages.filter(msg => 
        new Date(msg.timestamp) <= new Date(filters.dateTo!)
      )
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      messages = messages.filter(msg => 
        msg.content.toLowerCase().includes(searchLower)
      )
    }

    if (filters.hasAttachments !== null) {
      const hasAttachments = filters.hasAttachments === 'true'
      messages = messages.filter(msg => 
        hasAttachments ? (msg.attachments?.length || 0) > 0 : (msg.attachments?.length || 0) === 0
      )
    }

    if (filters.tokenCountMin) {
      messages = messages.filter(msg => 
        (msg.metadata?.tokenCount || 0) >= parseInt(filters.tokenCountMin!)
      )
    }

    if (filters.tokenCountMax) {
      messages = messages.filter(msg => 
        (msg.metadata?.tokenCount || 0) <= parseInt(filters.tokenCountMax!)
      )
    }

    // Sort by timestamp (newest first)
    messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Apply pagination
    let startIndex = 0
    if (cursor) {
      const cursorIndex = messages.findIndex(msg => msg.id === cursor)
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1
      }
    }

    const paginatedMessages = messages.slice(startIndex, startIndex + limit)
    const hasMore = startIndex + limit < messages.length
    const nextCursor = hasMore ? paginatedMessages[paginatedMessages.length - 1]?.id : undefined

    return NextResponse.json({
      messages: paginatedMessages,
      totalCount: messages.length,
      hasMore,
      nextCursor
    })
  } catch (error) {
    console.error('Message retrieval error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Handle batch message save
async function handleBatchSave(body: any, userId: string) {
  try {
    const validatedBatch = MessageBatchSchema.parse(body)
    
    const savedMessages = validatedBatch.messages.map(msgData => {
      const message = {
        id: `msg_${messageIdCounter++}`,
        ...msgData,
        userId,
        timestamp: new Date().toISOString(),
        metadata: {
          tokenCount: estimateTokens(msgData.content),
          wordCount: countWords(msgData.content),
          characterCount: msgData.content.length,
          containsCode: detectCodeBlocks(msgData.content),
          ...msgData.metadata
        }
      }

      messageStore.set(message.id, message)
      return message
    })

    return NextResponse.json(savedMessages)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(`Batch validation error: ${error.message}`, { status: 400 })
    }
    throw error
  }
}

// Utility functions
function estimateTokens(content: string): number {
  // Simple token estimation - in production, use proper tokenizer
  return Math.ceil(content.length / 4)
}

function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(word => word.length > 0).length
}

function detectCodeBlocks(content: string): boolean {
  return /```[\s\S]*?```|`[^`]+`/.test(content)
}