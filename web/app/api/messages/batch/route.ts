import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

// Mock database - in production, this would be DynamoDB
const messageStore = new Map<string, any>()
let messageIdCounter = 1

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
  messages: z.array(MessageSchema).min(1).max(100) // Limit batch size
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    const validatedBatch = MessageBatchSchema.parse(body)
    
    const startTime = Date.now()
    const savedMessages: any[] = []
    const errors: string[] = []

    // Process messages in batch
    for (const msgData of validatedBatch.messages) {
      try {
        const message = {
          id: `msg_${messageIdCounter++}`,
          ...msgData,
          userId: session.user.id,
          timestamp: new Date().toISOString(),
          metadata: {
            tokenCount: estimateTokens(msgData.content),
            wordCount: countWords(msgData.content),
            characterCount: msgData.content.length,
            containsCode: detectCodeBlocks(msgData.content),
            batchId: `batch_${Date.now()}`,
            batchIndex: savedMessages.length,
            ...msgData.metadata
          }
        }

        messageStore.set(message.id, message)
        savedMessages.push(message)
      } catch (error) {
        errors.push(`Failed to save message ${savedMessages.length}: ${error}`)
      }
    }

    const processingTime = Date.now() - startTime

    return NextResponse.json({
      messages: savedMessages,
      batchStats: {
        totalRequested: validatedBatch.messages.length,
        totalSaved: savedMessages.length,
        totalErrors: errors.length,
        processingTimeMs: processingTime,
        averageTimePerMessage: processingTime / savedMessages.length || 0
      },
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Batch message save error:', error)
    if (error instanceof z.ZodError) {
      return new NextResponse(`Validation error: ${error.message}`, { status: 400 })
    }
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