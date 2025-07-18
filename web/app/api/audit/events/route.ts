import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { auditLogger, AuditEventType, AuditQuery } from '@/lib/audit/AuditLogger'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Check if user has audit access permissions
    // In production, this would check user roles/permissions
    const hasAuditAccess = await checkAuditPermissions(session.user.id)
    if (!hasAuditAccess) {
      await auditLogger.logEvent({
        eventType: AuditEventType.PERMISSION_DENIED,
        severity: 'warning',
        userId: session.user.id,
        ipAddress: extractIpAddress(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        resource: 'audit_events',
        action: 'read',
        outcome: 'failure',
        details: { reason: 'insufficient_permissions' }
      })
      return new NextResponse('Forbidden - Insufficient audit permissions', { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    
    // Build audit query from request parameters
    const query: AuditQuery = {
      startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
      endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
      eventTypes: searchParams.get('eventTypes')?.split(',') as AuditEventType[] | undefined,
      userIds: searchParams.get('userIds')?.split(','),
      severity: searchParams.get('severity')?.split(',') as any,
      outcome: searchParams.get('outcome')?.split(',') as any,
      resources: searchParams.get('resources')?.split(','),
      searchQuery: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
      sortBy: (searchParams.get('sortBy') as any) || 'timestamp',
      sortOrder: (searchParams.get('sortOrder') as any) || 'desc'
    }

    // Query audit events
    const result = await auditLogger.queryEvents(query)

    // Log the audit access
    await auditLogger.logEvent({
      eventType: AuditEventType.AUDIT_TRAIL_ACCESS,
      severity: 'info',
      userId: session.user.id,
      ipAddress: extractIpAddress(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      resource: 'audit_events',
      action: 'query',
      outcome: 'success',
      details: {
        queryParameters: query,
        resultCount: result.events.length,
        totalCount: result.totalCount
      }
    })

    return NextResponse.json({
      events: result.events,
      totalCount: result.totalCount,
      hasMore: result.hasMore,
      query,
      metadata: {
        accessedAt: new Date().toISOString(),
        accessedBy: session.user.id,
        complianceNote: 'This audit data is subject to government retention requirements'
      }
    })
  } catch (error) {
    console.error('Audit events query error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Check if user has audit write permissions
    const hasAuditWriteAccess = await checkAuditWritePermissions(session.user.id)
    if (!hasAuditWriteAccess) {
      return new NextResponse('Forbidden - Insufficient audit write permissions', { status: 403 })
    }

    const body = await request.json()
    const { eventType, resource, action, outcome, details, severity } = body

    // Validate required fields
    if (!eventType || !resource || !action || !outcome) {
      return new NextResponse('Missing required fields: eventType, resource, action, outcome', { status: 400 })
    }

    // Log the audit event
    const auditEvent = await auditLogger.logEvent({
      eventType: eventType as AuditEventType,
      severity: severity || 'info',
      userId: session.user.id,
      ipAddress: extractIpAddress(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      resource,
      action,
      outcome,
      details: { 
        ...details || {},
        submittedBy: session.user.id
      },
      metadata: {
        source: 'manual_entry',
        environment: process.env.NODE_ENV as 'development' | 'staging' | 'production',
        version: process.env.npm_package_version || '1.0.0'
      }
    })

    return NextResponse.json({
      success: true,
      eventId: auditEvent.id,
      timestamp: auditEvent.timestamp
    })
  } catch (error) {
    console.error('Audit event creation error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Helper functions
async function checkAuditPermissions(userId: string): Promise<boolean> {
  // In production, this would check user roles in database
  // For now, allow all authenticated users to view audit logs
  return true
}

async function checkAuditWritePermissions(userId: string): Promise<boolean> {
  // In production, this would check admin/audit roles
  // For now, allow all authenticated users
  return true
}

function extractIpAddress(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0] || 
         request.headers.get('x-real-ip') || 
         '127.0.0.1'
}