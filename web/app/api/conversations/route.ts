import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

// Mock database - in production, this would be DynamoDB
const conversationStore = new Map<string, any>()
let conversationIdCounter = 1

const ConversationSchema = z.object({
  title: z.string().min(1).max(200),
  userId: z.string().min(1),
  metadata: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional()
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    const validatedConversation = ConversationSchema.parse(body)

    // Ensure user can only create conversations for themselves
    if (validatedConversation.userId !== session.user.id) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const conversation = {
      id: `conv_${conversationIdCounter++}`,
      ...validatedConversation,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      totalTokens: 0,
      lastActivity: new Date().toISOString(),
      participants: [session.user.id],
      isArchived: false,
      metadata: {
        version: '1.0',
        source: 'web',
        ...validatedConversation.metadata
      }
    }

    conversationStore.set(conversation.id, conversation)

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('Conversation creation error:', error)
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
    const limit = parseInt(searchParams.get('limit') || '20')
    const cursor = searchParams.get('cursor')
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || []
    const search = searchParams.get('search')

    // Get user's conversations
    let conversations = Array.from(conversationStore.values())
      .filter(conv => conv.participants.includes(session.user.id))

    // Apply filters
    if (!includeArchived) {
      conversations = conversations.filter(conv => !conv.isArchived)
    }

    if (tags.length > 0) {
      conversations = conversations.filter(conv => 
        conv.tags && conv.tags.some((tag: string) => tags.includes(tag))
      )
    }

    if (search) {
      const searchLower = search.toLowerCase()
      conversations = conversations.filter(conv => 
        conv.title.toLowerCase().includes(searchLower) ||
        (conv.description && conv.description.toLowerCase().includes(searchLower))
      )
    }

    // Sort by last activity (newest first)
    conversations.sort((a, b) => 
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    )

    // Apply pagination
    let startIndex = 0
    if (cursor) {
      const cursorIndex = conversations.findIndex(conv => conv.id === cursor)
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1
      }
    }

    const paginatedConversations = conversations.slice(startIndex, startIndex + limit)
    const hasMore = startIndex + limit < conversations.length
    const nextCursor = hasMore ? paginatedConversations[paginatedConversations.length - 1]?.id : undefined

    // Generate conversation summaries
    const conversationSummaries = paginatedConversations.map(conv => ({
      id: conv.id,
      title: conv.title,
      description: conv.description,
      lastActivity: conv.lastActivity,
      messageCount: conv.messageCount,
      totalTokens: conv.totalTokens,
      participants: conv.participants,
      tags: conv.tags || [],
      isArchived: conv.isArchived,
      createdAt: conv.createdAt,
      metadata: conv.metadata
    }))

    return NextResponse.json({
      conversations: conversationSummaries,
      totalCount: conversations.length,
      hasMore,
      nextCursor,
      summary: {
        total: conversations.length,
        active: conversations.filter(c => !c.isArchived).length,
        archived: conversations.filter(c => c.isArchived).length,
        totalMessages: conversations.reduce((sum, c) => sum + c.messageCount, 0),
        totalTokens: conversations.reduce((sum, c) => sum + c.totalTokens, 0)
      }
    })
  } catch (error) {
    console.error('Conversation retrieval error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}