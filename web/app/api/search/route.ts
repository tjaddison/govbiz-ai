import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchEngine, SearchQuery } from '@/lib/search/BM25SearchEngine'
import { auditLogger, AuditEventType } from '@/lib/audit/AuditLogger'
import { z } from 'zod'

const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  filters: z.object({
    types: z.array(z.string()).optional(),
    classifications: z.array(z.string()).optional(),
    dateFrom: z.string().transform(str => new Date(str)).optional(),
    dateTo: z.string().transform(str => new Date(str)).optional(),
    userId: z.string().optional(),
    conversationId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    sources: z.array(z.string()).optional(),
    minScore: z.number().min(0).max(100).optional()
  }).optional(),
  options: z.object({
    limit: z.number().min(1).max(100).default(20),
    offset: z.number().min(0).default(0),
    includeContent: z.boolean().default(true),
    includeMetadata: z.boolean().default(true),
    highlightMatches: z.boolean().default(true),
    fuzzySearch: z.boolean().default(false),
    stemming: z.boolean().default(true),
    synonyms: z.boolean().default(true)
  }).default({})
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    const validatedRequest = SearchRequestSchema.parse(body)
    
    // Build search query
    const searchQuery: SearchQuery = {
      query: validatedRequest.query,
      filters: validatedRequest.filters,
      options: validatedRequest.options,
      permissions: {
        userId: session.user.id,
        roles: ['user'] // In production, get user roles from database
      }
    }

    // Perform search
    const searchResults = await searchEngine.search(searchQuery)

    // Log search activity
    await auditLogger.logEvent({
      eventType: AuditEventType.DATA_ACCESS,
      severity: 'info',
      userId: session.user.id,
      ipAddress: extractIpAddress(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      resource: 'search_engine',
      action: 'search',
      outcome: 'success',
      details: {
        query: validatedRequest.query,
        resultCount: searchResults.results.length,
        totalCount: searchResults.totalCount,
        executionTime: searchResults.executionTime,
        filtersApplied: validatedRequest.filters,
        searchOptions: validatedRequest.options
      }
    })

    return NextResponse.json({
      ...searchResults,
      metadata: {
        ...searchResults.metadata,
        searchedAt: new Date().toISOString(),
        searchedBy: session.user.id,
        complianceNote: 'Search results filtered by user permissions and data classification'
      }
    })
  } catch (error) {
    console.error('Search error:', error)
    
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
    const query = searchParams.get('q')
    
    if (!query) {
      return new NextResponse('Query parameter "q" is required', { status: 400 })
    }

    // Parse query parameters
    const searchQuery: SearchQuery = {
      query,
      filters: {
        types: searchParams.get('types')?.split(','),
        classifications: searchParams.get('classifications')?.split(','),
        dateFrom: searchParams.get('dateFrom') ? new Date(searchParams.get('dateFrom')!) : undefined,
        dateTo: searchParams.get('dateTo') ? new Date(searchParams.get('dateTo')!) : undefined,
        userId: searchParams.get('userId') || undefined,
        conversationId: searchParams.get('conversationId') || undefined,
        tags: searchParams.get('tags')?.split(','),
        categories: searchParams.get('categories')?.split(','),
        sources: searchParams.get('sources')?.split(','),
        minScore: searchParams.get('minScore') ? parseFloat(searchParams.get('minScore')!) : undefined
      },
      options: {
        limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
        offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
        includeContent: searchParams.get('includeContent') !== 'false',
        includeMetadata: searchParams.get('includeMetadata') !== 'false',
        highlightMatches: searchParams.get('highlightMatches') !== 'false',
        fuzzySearch: searchParams.get('fuzzySearch') === 'true',
        stemming: searchParams.get('stemming') !== 'false',
        synonyms: searchParams.get('synonyms') !== 'false'
      },
      permissions: {
        userId: session.user.id,
        roles: ['user']
      }
    }

    // Perform search
    const searchResults = await searchEngine.search(searchQuery)

    // Log search activity
    await auditLogger.logEvent({
      eventType: AuditEventType.DATA_ACCESS,
      severity: 'info',
      userId: session.user.id,
      ipAddress: extractIpAddress(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      resource: 'search_engine',
      action: 'search',
      outcome: 'success',
      details: {
        query,
        resultCount: searchResults.results.length,
        totalCount: searchResults.totalCount,
        executionTime: searchResults.executionTime,
        method: 'GET'
      }
    })

    return NextResponse.json(searchResults)
  } catch (error) {
    console.error('Search error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

function extractIpAddress(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0] || 
         request.headers.get('x-real-ip') || 
         '127.0.0.1'
}