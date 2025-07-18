import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Mock databases - in production, these would be DynamoDB
const conversationStore = new Map<string, any>()
const messageStore = new Map<string, any>()

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

    // Get all messages for this conversation
    const messages = Array.from(messageStore.values())
      .filter(msg => msg.conversationId === conversationId && !msg.isDeleted)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    if (messages.length === 0) {
      return NextResponse.json({
        conversationId,
        isEmpty: true,
        totalMessages: 0,
        totalTokens: 0,
        totalCharacters: 0,
        totalWords: 0,
        messagesByRole: { user: 0, assistant: 0, system: 0 },
        averageMessageLength: 0,
        averageTokensPerMessage: 0,
        conversationDuration: 0,
        messagesPerHour: 0,
        codeBlockCount: 0,
        attachmentCount: 0,
        topKeywords: [],
        activityPattern: [],
        modelUsage: {},
        compressionStats: {
          originalSize: 0,
          compressedSize: 0,
          compressionRatio: 0,
          timesCompressed: 0
        }
      })
    }

    // Calculate basic statistics
    const totalMessages = messages.length
    const totalTokens = messages.reduce((sum, msg) => sum + (msg.metadata?.tokenCount || 0), 0)
    const totalCharacters = messages.reduce((sum, msg) => sum + msg.content.length, 0)
    const totalWords = messages.reduce((sum, msg) => sum + (msg.metadata?.wordCount || 0), 0)

    // Messages by role
    const messagesByRole = {
      user: messages.filter(msg => msg.role === 'user').length,
      assistant: messages.filter(msg => msg.role === 'assistant').length,
      system: messages.filter(msg => msg.role === 'system').length
    }

    // Calculate conversation duration
    const firstMessage = messages[0]
    const lastMessage = messages[messages.length - 1]
    const conversationDuration = new Date(lastMessage.timestamp).getTime() - new Date(firstMessage.timestamp).getTime()
    const conversationHours = conversationDuration / (1000 * 60 * 60)

    // Activity pattern analysis (messages per hour of day)
    const activityPattern = Array(24).fill(0)
    messages.forEach(msg => {
      const hour = new Date(msg.timestamp).getHours()
      activityPattern[hour]++
    })

    // Model usage statistics
    const modelUsage: Record<string, number> = {}
    messages.forEach(msg => {
      if (msg.metadata?.modelUsed) {
        modelUsage[msg.metadata.modelUsed] = (modelUsage[msg.metadata.modelUsed] || 0) + 1
      }
    })

    // Content analysis
    const codeBlockCount = messages.filter(msg => msg.metadata?.containsCode).length
    const attachmentCount = messages.reduce((sum, msg) => sum + (msg.attachments?.length || 0), 0)

    // Extract keywords (simplified)
    const allContent = messages.map(msg => msg.content).join(' ')
    const topKeywords = extractTopKeywords(allContent, 10)

    // Performance metrics
    const averageProcessingTime = messages
      .filter(msg => msg.metadata?.processingTime)
      .reduce((sum, msg, _, arr) => sum + (msg.metadata?.processingTime || 0) / arr.length, 0)

    // Compression statistics
    const compressionEvents = messages.filter(msg => msg.metadata?.compressionApplied)
    const originalSizes = compressionEvents.map(msg => msg.metadata?.originalSize || 0)
    const compressedSizes = compressionEvents.map(msg => msg.metadata?.compressedSize || 0)
    
    const compressionStats = {
      originalSize: originalSizes.reduce((sum, size) => sum + size, 0),
      compressedSize: compressedSizes.reduce((sum, size) => sum + size, 0),
      compressionRatio: originalSizes.length > 0 ? 
        compressedSizes.reduce((sum, size) => sum + size, 0) / originalSizes.reduce((sum, size) => sum + size, 0) : 0,
      timesCompressed: compressionEvents.length
    }

    // Message frequency over time (daily)
    const messageCounts = new Map<string, number>()
    messages.forEach(msg => {
      const date = new Date(msg.timestamp).toISOString().split('T')[0]
      messageCounts.set(date, (messageCounts.get(date) || 0) + 1)
    })

    const messageFrequency = Array.from(messageCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Advanced metrics
    const responseTimeAnalysis = calculateResponseTimes(messages)
    const engagementScore = calculateEngagementScore(messages)
    const conversationQuality = calculateQualityScore(messages)

    const stats = {
      conversationId,
      isEmpty: false,
      
      // Basic counts
      totalMessages,
      totalTokens,
      totalCharacters,
      totalWords,
      messagesByRole,
      
      // Averages
      averageMessageLength: Math.round(totalCharacters / totalMessages),
      averageTokensPerMessage: Math.round(totalTokens / totalMessages),
      averageWordsPerMessage: Math.round(totalWords / totalMessages),
      averageProcessingTime: Math.round(averageProcessingTime),
      
      // Time-based metrics
      conversationDuration,
      conversationDurationHours: Math.round(conversationHours * 100) / 100,
      messagesPerHour: conversationHours > 0 ? Math.round((totalMessages / conversationHours) * 100) / 100 : 0,
      activityPattern,
      messageFrequency,
      
      // Content analysis
      codeBlockCount,
      attachmentCount,
      topKeywords,
      modelUsage,
      
      // Performance
      responseTimeAnalysis,
      engagementScore,
      conversationQuality,
      compressionStats,
      
      // Metadata
      firstMessageAt: firstMessage.timestamp,
      lastMessageAt: lastMessage.timestamp,
      participants: conversation.participants,
      lastUpdated: new Date().toISOString()
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Conversation stats error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Utility functions
function extractTopKeywords(text: string, limit: number): string[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)

  // Simple frequency counting
  const frequency = new Map<string, number>()
  words.forEach(word => {
    frequency.set(word, (frequency.get(word) || 0) + 1)
  })

  // Remove common stop words
  const stopWords = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'this', 'that', 'these', 'those', 'what', 'when', 'where', 'how',
    'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might',
    'have', 'has', 'had', 'been', 'being', 'are', 'was', 'were', 'is'
  ])

  return Array.from(frequency.entries())
    .filter(([word]) => !stopWords.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word)
}

function calculateResponseTimes(messages: any[]): any {
  const responseTimes: number[] = []
  
  for (let i = 1; i < messages.length; i++) {
    const prevMsg = messages[i - 1]
    const currentMsg = messages[i]
    
    // Calculate response time between user and assistant messages
    if ((prevMsg.role === 'user' && currentMsg.role === 'assistant') ||
        (prevMsg.role === 'assistant' && currentMsg.role === 'user')) {
      const responseTime = new Date(currentMsg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime()
      responseTimes.push(responseTime)
    }
  }

  if (responseTimes.length === 0) {
    return {
      averageResponseTime: 0,
      medianResponseTime: 0,
      fastestResponse: 0,
      slowestResponse: 0,
      totalExchanges: 0
    }
  }

  responseTimes.sort((a, b) => a - b)
  
  return {
    averageResponseTime: Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length),
    medianResponseTime: responseTimes[Math.floor(responseTimes.length / 2)],
    fastestResponse: responseTimes[0],
    slowestResponse: responseTimes[responseTimes.length - 1],
    totalExchanges: responseTimes.length
  }
}

function calculateEngagementScore(messages: any[]): number {
  // Simple engagement scoring based on message length, frequency, and interaction patterns
  let score = 0
  
  // Factor 1: Message variety (different message lengths)
  const lengths = messages.map(msg => msg.content.length)
  const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length
  const lengthVariety = lengths.filter(len => Math.abs(len - avgLength) > avgLength * 0.3).length / lengths.length
  score += lengthVariety * 25
  
  // Factor 2: Back-and-forth conversation pattern
  let exchanges = 0
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role !== messages[i - 1].role) {
      exchanges++
    }
  }
  const exchangeRate = exchanges / Math.max(messages.length - 1, 1)
  score += exchangeRate * 50
  
  // Factor 3: Content richness (code blocks, attachments, detailed responses)
  const richContent = messages.filter(msg => 
    msg.metadata?.containsCode || 
    (msg.attachments && msg.attachments.length > 0) ||
    msg.content.length > 500
  ).length
  score += (richContent / messages.length) * 25
  
  return Math.min(100, Math.round(score))
}

function calculateQualityScore(messages: any[]): number {
  // Quality score based on message structure, length distribution, and content coherence
  let score = 0
  
  // Factor 1: Average message quality (not too short, not too long)
  const avgLength = messages.reduce((sum, msg) => sum + msg.content.length, 0) / messages.length
  if (avgLength > 50 && avgLength < 2000) {
    score += 30
  } else {
    score += Math.max(0, 30 - Math.abs(avgLength - 500) / 100)
  }
  
  // Factor 2: Proper conversation flow
  const userMessages = messages.filter(msg => msg.role === 'user').length
  const assistantMessages = messages.filter(msg => msg.role === 'assistant').length
  const balanceScore = 1 - Math.abs(userMessages - assistantMessages) / Math.max(userMessages, assistantMessages, 1)
  score += balanceScore * 30
  
  // Factor 3: Technical content quality
  const codeQuality = messages.filter(msg => msg.metadata?.containsCode).length / messages.length
  score += Math.min(20, codeQuality * 100)
  
  // Factor 4: Response completeness (avoiding very short responses)
  const completeResponses = messages.filter(msg => 
    msg.role === 'assistant' && msg.content.length > 100
  ).length
  const assistantCompleteness = assistantMessages > 0 ? completeResponses / assistantMessages : 0
  score += assistantCompleteness * 20
  
  return Math.min(100, Math.round(score))
}