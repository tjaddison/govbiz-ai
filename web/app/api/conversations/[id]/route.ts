import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

// Mock database - in production, this would be DynamoDB
const conversationStore = new Map<string, any>()

const ConversationUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional()
})

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const conversationId = params.id
    const conversation = conversationStore.get(conversationId)

    if (!conversation) {
      return new NextResponse('Conversation not found', { status: 404 })
    }

    // Check if user has access to this conversation
    if (!conversation.participants.includes(session.user.id)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('Conversation retrieval error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const conversationId = params.id
    const conversation = conversationStore.get(conversationId)

    if (!conversation) {
      return new NextResponse('Conversation not found', { status: 404 })
    }

    // Check if user has access to this conversation
    if (!conversation.participants.includes(session.user.id)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const body = await request.json()
    const validatedUpdates = ConversationUpdateSchema.parse(body)

    // Update conversation
    const updatedConversation = {
      ...conversation,
      ...validatedUpdates,
      updatedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      metadata: {
        ...conversation.metadata,
        ...validatedUpdates.metadata,
        lastModifiedBy: session.user.id
      }
    }

    conversationStore.set(conversationId, updatedConversation)

    return NextResponse.json(updatedConversation)
  } catch (error) {
    console.error('Conversation update error:', error)
    if (error instanceof z.ZodError) {
      return new NextResponse(`Validation error: ${error.message}`, { status: 400 })
    }
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const conversationId = params.id
    const conversation = conversationStore.get(conversationId)

    if (!conversation) {
      return new NextResponse('Conversation not found', { status: 404 })
    }

    // Check if user has access to this conversation
    if (!conversation.participants.includes(session.user.id)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    // Soft delete - mark as deleted but keep record for audit
    const deletedConversation = {
      ...conversation,
      deletedAt: new Date().toISOString(),
      deletedBy: session.user.id,
      isDeleted: true,
      isArchived: true
    }

    conversationStore.set(conversationId, deletedConversation)

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Conversation deletion error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}