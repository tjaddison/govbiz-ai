import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

// Mock database - in production, this would be DynamoDB
const messageStore = new Map<string, any>()

const MessageUpdateSchema = z.object({
  content: z.string().optional(),
  type: z.enum(['text', 'code', 'image']).optional(),
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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const messageId = params.id
    const message = messageStore.get(messageId)

    if (!message) {
      return new NextResponse('Message not found', { status: 404 })
    }

    // Check if user has access to this message
    if (message.userId !== session.user.id) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    return NextResponse.json(message)
  } catch (error) {
    console.error('Message retrieval error:', error)
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

    const messageId = params.id
    const message = messageStore.get(messageId)

    if (!message) {
      return new NextResponse('Message not found', { status: 404 })
    }

    // Check if user has access to this message
    if (message.userId !== session.user.id) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const body = await request.json()
    const validatedUpdates = MessageUpdateSchema.parse(body)

    // Update message
    const updatedMessage = {
      ...message,
      ...validatedUpdates,
      updatedAt: new Date().toISOString(),
      // Recalculate metadata if content changed
      ...(validatedUpdates.content && {
        metadata: {
          ...message.metadata,
          tokenCount: estimateTokens(validatedUpdates.content),
          wordCount: countWords(validatedUpdates.content),
          characterCount: validatedUpdates.content.length,
          containsCode: detectCodeBlocks(validatedUpdates.content),
          ...validatedUpdates.metadata
        }
      })
    }

    messageStore.set(messageId, updatedMessage)

    return NextResponse.json(updatedMessage)
  } catch (error) {
    console.error('Message update error:', error)
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

    const messageId = params.id
    const message = messageStore.get(messageId)

    if (!message) {
      return new NextResponse('Message not found', { status: 404 })
    }

    // Check if user has access to this message
    if (message.userId !== session.user.id) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    
    // Soft delete - mark as deleted but keep record for audit
    const deletedMessage = {
      ...message,
      deletedAt: new Date().toISOString(),
      deleteReason: body.reason || 'User deleted',
      isDeleted: true
    }

    messageStore.set(messageId, deletedMessage)

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Message deletion error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Utility functions
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4)
}

function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(word => word.length > 0).length
}

function detectCodeBlocks(content: string): boolean {
  return /```[\s\S]*?```|`[^`]+`/.test(content)
}