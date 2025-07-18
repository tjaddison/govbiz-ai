import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Mock database - in production, this would be DynamoDB with ElasticSearch/OpenSearch
const messageStore = new Map<string, any>()

// This route uses dynamic features and should not be pre-rendered
export const dynamic = 'force-dynamic'

// Simple BM25-like scoring implementation
function calculateBM25Score(query: string, document: string, documentLength: number, avgDocLength: number): number {
  const k1 = 1.2
  const b = 0.75
  
  const queryTerms = query.toLowerCase().split(/\s+/)
  let score = 0
  
  for (const term of queryTerms) {
    const termFreq = (document.toLowerCase().match(new RegExp(term, 'g')) || []).length
    if (termFreq > 0) {
      const idf = Math.log((messageStore.size + 1) / (1 + termFreq)) // Simplified IDF
      const tf = (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * (documentLength / avgDocLength)))
      score += idf * tf
    }
  }
  
  return score
}

function highlightMatches(text: string, query: string): string {
  const queryTerms = query.toLowerCase().split(/\s+/)
  let highlightedText = text
  
  for (const term of queryTerms) {
    const regex = new RegExp(`(${term})`, 'gi')
    highlightedText = highlightedText.replace(regex, '<mark>$1</mark>')
  }
  
  return highlightedText
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    
    if (!query || query.trim().length === 0) {
      return new NextResponse('Search query is required', { status: 400 })
    }

    // Parse optional filters
    const filters = {
      userId: searchParams.get('userId') || session.user.id,
      conversationId: searchParams.get('conversationId'),
      role: searchParams.get('role') as 'user' | 'assistant' | 'system' | null,
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo')
    }
    
    const limit = parseInt(searchParams.get('limit') || '50')

    // Get all messages for the user
    let messages = Array.from(messageStore.values())
      .filter(msg => msg.userId === filters.userId && !msg.isDeleted)

    // Apply filters
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

    // Calculate average document length for BM25
    const avgDocLength = messages.reduce((sum, msg) => sum + msg.content.length, 0) / messages.length

    // Search and score messages
    const searchResults = messages
      .map(msg => {
        const score = calculateBM25Score(query, msg.content, msg.content.length, avgDocLength)
        
        // Only include messages with positive scores (containing search terms)
        if (score > 0) {
          return {
            ...msg,
            searchScore: score,
            highlightedContent: highlightMatches(msg.content, query),
            excerpt: generateExcerpt(msg.content, query)
          }
        }
        return null
      })
      .filter(result => result !== null)
      .sort((a, b) => b!.searchScore - a!.searchScore) // Sort by relevance score
      .slice(0, limit)

    // Group results by conversation for better context
    const conversationGroups = new Map<string, any[]>()
    searchResults.forEach(result => {
      if (!conversationGroups.has(result!.conversationId)) {
        conversationGroups.set(result!.conversationId, [])
      }
      conversationGroups.get(result!.conversationId)!.push(result)
    })

    return NextResponse.json({
      messages: searchResults,
      totalCount: searchResults.length,
      hasMore: false, // For simplicity, not implementing pagination in search
      query,
      conversationGroups: Object.fromEntries(conversationGroups),
      searchStats: {
        totalSearched: messages.length,
        totalMatches: searchResults.length,
        averageScore: searchResults.reduce((sum, r) => sum + r!.searchScore, 0) / searchResults.length || 0
      }
    })
  } catch (error) {
    console.error('Message search error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

function generateExcerpt(content: string, query: string, maxLength = 200): string {
  const queryTerms = query.toLowerCase().split(/\s+/)
  const contentLower = content.toLowerCase()
  
  // Find the first occurrence of any query term
  let firstMatchIndex = content.length
  for (const term of queryTerms) {
    const index = contentLower.indexOf(term)
    if (index !== -1 && index < firstMatchIndex) {
      firstMatchIndex = index
    }
  }
  
  if (firstMatchIndex === content.length) {
    // No matches found, return beginning of content
    return content.slice(0, maxLength) + (content.length > maxLength ? '...' : '')
  }
  
  // Create excerpt around the first match
  const start = Math.max(0, firstMatchIndex - 50)
  const end = Math.min(content.length, start + maxLength)
  
  let excerpt = content.slice(start, end)
  
  // Add ellipsis if needed
  if (start > 0) excerpt = '...' + excerpt
  if (end < content.length) excerpt = excerpt + '...'
  
  return excerpt
}