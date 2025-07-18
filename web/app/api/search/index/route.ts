import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchEngine, SearchDocument, searchUtils } from '@/lib/search/BM25SearchEngine'
import { auditLogger, AuditEventType } from '@/lib/audit/AuditLogger'
import { z } from 'zod'

const IndexDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  type: z.enum(['message', 'conversation', 'document', 'sources_sought', 'proposal', 'contract']),
  classification: z.enum(['public', 'sensitive', 'confidential', 'secret']).default('confidential'),
  metadata: z.object({
    userId: z.string().optional(),
    conversationId: z.string().optional(),
    createdAt: z.string().transform(str => new Date(str)).optional(),
    updatedAt: z.string().transform(str => new Date(str)).optional(),
    tags: z.array(z.string()).default([]),
    category: z.string().default('general'),
    source: z.string().default('web_interface'),
    language: z.string().default('en'),
    tokenCount: z.number().default(0),
    wordCount: z.number().optional()
  }).default({}),
  permissions: z.object({
    read: z.array(z.string()).default([]),
    write: z.array(z.string()).default([]),
    admin: z.array(z.string()).default([])
  }).default({})
})

const BulkIndexSchema = z.object({
  documents: z.array(IndexDocumentSchema).min(1).max(100)
})

// Index a single document
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Check if user has indexing permissions
    const hasIndexPermission = await checkIndexPermissions(session.user.id)
    if (!hasIndexPermission) {
      await auditLogger.logEvent({
        eventType: AuditEventType.PERMISSION_DENIED,
        severity: 'warning',
        userId: session.user.id,
        ipAddress: extractIpAddress(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        resource: 'search_index',
        action: 'index_document',
        outcome: 'failure',
        details: { reason: 'insufficient_permissions' }
      })
      return new NextResponse('Forbidden - Insufficient indexing permissions', { status: 403 })
    }

    const body = await request.json()
    
    // Check if this is a bulk operation
    if (body.documents && Array.isArray(body.documents)) {
      return handleBulkIndex(body, session.user.id, request)
    }

    // Single document indexing
    const validatedDocument = IndexDocumentSchema.parse(body)
    
    // Prepare document for indexing
    const searchDocument: SearchDocument = {
      id: validatedDocument.id,
      title: validatedDocument.title,
      content: validatedDocument.content,
      type: validatedDocument.type,
      classification: validatedDocument.classification,
      metadata: {
        userId: validatedDocument.metadata.userId || session.user.id,
        conversationId: validatedDocument.metadata.conversationId,
        createdAt: validatedDocument.metadata.createdAt || new Date(),
        updatedAt: validatedDocument.metadata.updatedAt || new Date(),
        tags: validatedDocument.metadata.tags,
        category: validatedDocument.metadata.category,
        source: validatedDocument.metadata.source,
        language: validatedDocument.metadata.language,
        tokenCount: validatedDocument.metadata.tokenCount,
        wordCount: validatedDocument.metadata.wordCount || validatedDocument.content.split(' ').length
      },
      permissions: {
        read: validatedDocument.permissions.read.length > 0 
          ? validatedDocument.permissions.read 
          : [session.user.id, 'admin'],
        write: validatedDocument.permissions.write.length > 0 
          ? validatedDocument.permissions.write 
          : [session.user.id, 'admin'],
        admin: validatedDocument.permissions.admin.length > 0 
          ? validatedDocument.permissions.admin 
          : ['admin']
      }
    }

    // Index the document
    await searchEngine.indexDocument(searchDocument)

    // Log indexing activity
    await auditLogger.logEvent({
      eventType: AuditEventType.DATA_CREATED,
      severity: 'info',
      userId: session.user.id,
      ipAddress: extractIpAddress(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      resource: 'search_index',
      action: 'index_document',
      outcome: 'success',
      details: {
        documentId: searchDocument.id,
        documentType: searchDocument.type,
        classification: searchDocument.classification,
        contentLength: searchDocument.content.length,
        tokenCount: searchDocument.metadata.tokenCount
      }
    })

    return NextResponse.json({
      success: true,
      documentId: searchDocument.id,
      indexedAt: new Date().toISOString(),
      metadata: {
        contentLength: searchDocument.content.length,
        wordCount: searchDocument.metadata.wordCount,
        tokenCount: searchDocument.metadata.tokenCount,
        classification: searchDocument.classification
      }
    })
  } catch (error) {
    console.error('Document indexing error:', error)
    
    if (error instanceof z.ZodError) {
      return new NextResponse(`Validation error: ${error.message}`, { status: 400 })
    }
    
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Get index statistics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const hasIndexPermission = await checkIndexPermissions(session.user.id)
    if (!hasIndexPermission) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const stats = searchEngine.getIndexStats()

    // Log stats access
    await auditLogger.logEvent({
      eventType: AuditEventType.DATA_ACCESS,
      severity: 'info',
      userId: session.user.id,
      ipAddress: extractIpAddress(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      resource: 'search_index_stats',
      action: 'view',
      outcome: 'success',
      details: {
        totalDocuments: stats.totalDocuments,
        totalTerms: stats.totalTerms,
        indexSize: stats.indexSize
      }
    })

    return NextResponse.json({
      ...stats,
      metadata: {
        accessedAt: new Date().toISOString(),
        accessedBy: session.user.id,
        complianceNote: 'Index statistics are subject to access controls and audit requirements'
      }
    })
  } catch (error) {
    console.error('Index stats error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Delete a document from the index
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const hasIndexPermission = await checkIndexPermissions(session.user.id)
    if (!hasIndexPermission) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('id')
    
    if (!documentId) {
      return new NextResponse('Document ID is required', { status: 400 })
    }

    // Remove document from index
    const removed = await searchEngine.removeDocument(documentId)
    
    if (!removed) {
      return new NextResponse('Document not found in index', { status: 404 })
    }

    // Log removal activity
    await auditLogger.logEvent({
      eventType: AuditEventType.DATA_DELETED,
      severity: 'info',
      userId: session.user.id,
      ipAddress: extractIpAddress(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      resource: 'search_index',
      action: 'remove_document',
      outcome: 'success',
      details: {
        documentId,
        removedBy: session.user.id
      }
    })

    return NextResponse.json({
      success: true,
      documentId,
      removedAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('Document removal error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Bulk index multiple documents
async function handleBulkIndex(body: any, userId: string, request: NextRequest) {
  try {
    const validatedBulk = BulkIndexSchema.parse(body)
    
    const results = {
      totalRequested: validatedBulk.documents.length,
      successful: 0,
      failed: 0,
      errors: [] as string[]
    }

    const startTime = Date.now()

    for (const docData of validatedBulk.documents) {
      try {
        const searchDocument: SearchDocument = {
          id: docData.id,
          title: docData.title,
          content: docData.content,
          type: docData.type,
          classification: docData.classification,
          metadata: {
            userId: docData.metadata.userId || userId,
            conversationId: docData.metadata.conversationId,
            createdAt: docData.metadata.createdAt || new Date(),
            updatedAt: docData.metadata.updatedAt || new Date(),
            tags: docData.metadata.tags,
            category: docData.metadata.category,
            source: docData.metadata.source,
            language: docData.metadata.language,
            tokenCount: docData.metadata.tokenCount,
            wordCount: docData.metadata.wordCount || docData.content.split(' ').length
          },
          permissions: {
            read: docData.permissions.read.length > 0 
              ? docData.permissions.read 
              : [userId, 'admin'],
            write: docData.permissions.write.length > 0 
              ? docData.permissions.write 
              : [userId, 'admin'],
            admin: docData.permissions.admin.length > 0 
              ? docData.permissions.admin 
              : ['admin']
          }
        }

        await searchEngine.indexDocument(searchDocument)
        results.successful++
      } catch (error) {
        results.failed++
        results.errors.push(`Document ${docData.id}: ${error}`)
      }
    }

    const processingTime = Date.now() - startTime

    // Log bulk indexing activity
    await auditLogger.logEvent({
      eventType: AuditEventType.BULK_OPERATION,
      severity: results.failed > 0 ? 'warning' : 'info',
      userId,
      ipAddress: extractIpAddress(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      resource: 'search_index',
      action: 'bulk_index',
      outcome: results.failed === 0 ? 'success' : 'partial',
      details: {
        totalRequested: results.totalRequested,
        successful: results.successful,
        failed: results.failed,
        processingTimeMs: processingTime,
        averageTimePerDocument: processingTime / results.totalRequested
      }
    })

    return NextResponse.json({
      ...results,
      processingTime,
      indexedAt: new Date().toISOString()
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new NextResponse(`Bulk validation error: ${error.message}`, { status: 400 })
    }
    throw error
  }
}

// Helper functions
async function checkIndexPermissions(userId: string): Promise<boolean> {
  // In production, this would check user roles/permissions in database
  return true
}

function extractIpAddress(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0] || 
         request.headers.get('x-real-ip') || 
         '127.0.0.1'
}