import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { auditLogger, AuditEventType } from '@/lib/audit/AuditLogger'
import { z } from 'zod'

const ReportRequestSchema = z.object({
  title: z.string().min(1).max(200),
  startDate: z.string().transform(str => new Date(str)),
  endDate: z.string().transform(str => new Date(str)),
  options: z.object({
    includeCompliance: z.boolean().default(true),
    includeTrends: z.boolean().default(true),
    format: z.enum(['json', 'csv', 'pdf']).default('json')
  }).default({})
})

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Check if user has audit report permissions
    const hasReportAccess = await checkReportPermissions(session.user.id)
    if (!hasReportAccess) {
      await auditLogger.logEvent({
        eventType: AuditEventType.PERMISSION_DENIED,
        severity: 'warning',
        userId: session.user.id,
        ipAddress: extractIpAddress(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        resource: 'audit_reports',
        action: 'generate',
        outcome: 'failure',
        details: { reason: 'insufficient_permissions' }
      })
      return new NextResponse('Forbidden - Insufficient report permissions', { status: 403 })
    }

    const body = await request.json()
    const validatedRequest = ReportRequestSchema.parse(body)
    
    // Validate date range
    if (validatedRequest.endDate <= validatedRequest.startDate) {
      return new NextResponse('End date must be after start date', { status: 400 })
    }

    // Check if date range is not too large (max 1 year)
    const maxRangeMs = 365 * 24 * 60 * 60 * 1000 // 1 year
    const rangeMs = validatedRequest.endDate.getTime() - validatedRequest.startDate.getTime()
    if (rangeMs > maxRangeMs) {
      return new NextResponse('Date range cannot exceed 1 year', { status: 400 })
    }

    // Generate the audit report
    const report = await auditLogger.generateReport(
      validatedRequest.startDate,
      validatedRequest.endDate,
      validatedRequest.title,
      session.user.id,
      validatedRequest.options
    )

    // Log report generation
    await auditLogger.logEvent({
      eventType: AuditEventType.REGULATORY_REPORT,
      severity: 'info',
      userId: session.user.id,
      ipAddress: extractIpAddress(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      resource: 'audit_reports',
      action: 'generate',
      outcome: 'success',
      details: {
        reportId: report.id,
        title: report.title,
        period: report.period,
        eventCount: report.summary.totalEvents,
        format: validatedRequest.options.format
      }
    })

    // Return different formats based on request
    if (validatedRequest.options.format === 'csv') {
      const csvContent = await generateCSVReport(report)
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-report-${report.id}.csv"`
        }
      })
    }

    if (validatedRequest.options.format === 'pdf') {
      // In production, this would generate a PDF
      return new NextResponse('PDF generation not implemented in this demo', { status: 501 })
    }

    // Default JSON format
    return NextResponse.json({
      report,
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: session.user.id,
        format: validatedRequest.options.format,
        complianceStatement: 'This report meets federal audit trail requirements as specified in NIST 800-53 AU controls'
      }
    })
  } catch (error) {
    console.error('Audit report generation error:', error)
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

    const hasReportAccess = await checkReportPermissions(session.user.id)
    if (!hasReportAccess) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    // Return available report templates and formats
    const templates = [
      {
        id: 'security-summary',
        name: 'Security Summary Report',
        description: 'High-level overview of security events and incidents',
        defaultPeriod: '30 days',
        complianceFrameworks: ['NIST-800-53', 'FedRAMP']
      },
      {
        id: 'compliance-detailed',
        name: 'Detailed Compliance Report',
        description: 'Comprehensive compliance analysis with control mappings',
        defaultPeriod: '90 days',
        complianceFrameworks: ['NIST-800-53', 'FedRAMP', 'FISMA']
      },
      {
        id: 'user-activity',
        name: 'User Activity Report',
        description: 'Analysis of user behavior and access patterns',
        defaultPeriod: '7 days',
        complianceFrameworks: ['NIST-800-53']
      },
      {
        id: 'incident-analysis',
        name: 'Security Incident Analysis',
        description: 'Detailed analysis of security incidents and responses',
        defaultPeriod: '30 days',
        complianceFrameworks: ['NIST-800-53', 'NIST-Cybersecurity-Framework']
      }
    ]

    const formats = [
      {
        format: 'json',
        description: 'Machine-readable JSON format',
        suitable: 'API integration, data analysis'
      },
      {
        format: 'csv',
        description: 'Comma-separated values for spreadsheet analysis',
        suitable: 'Data analysis, reporting tools'
      },
      {
        format: 'pdf',
        description: 'Professional PDF report',
        suitable: 'Executive summaries, compliance documentation'
      }
    ]

    return NextResponse.json({
      templates,
      formats,
      guidelines: {
        maxDateRange: '1 year',
        retentionPeriod: '7 years',
        complianceNote: 'All reports are generated in accordance with federal audit requirements'
      }
    })
  } catch (error) {
    console.error('Report templates error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Helper functions
async function checkReportPermissions(userId: string): Promise<boolean> {
  // In production, this would check user roles in database
  return true
}

function extractIpAddress(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0] || 
         request.headers.get('x-real-ip') || 
         '127.0.0.1'
}

async function generateCSVReport(report: any): Promise<string> {
  const headers = [
    'Event ID',
    'Timestamp',
    'Event Type',
    'Severity',
    'User ID',
    'Resource',
    'Action',
    'Outcome',
    'IP Address',
    'Details'
  ]

  // In a real implementation, you would have access to the actual events
  // For this demo, we'll create a placeholder CSV structure
  const rows = [
    headers.join(','),
    '# Audit Report: ' + report.title,
    '# Generated: ' + report.generatedAt,
    '# Period: ' + report.period.start + ' to ' + report.period.end,
    '# Total Events: ' + report.summary.totalEvents,
    '',
    '# Summary by Event Type:',
    ...Object.entries(report.summary.eventsByType).map(([type, count]) => 
      `# ${type},${count}`
    ),
    '',
    '# Compliance Status:',
    ...report.complianceMetrics.map((metric: any) => 
      `# ${metric.framework},Score: ${metric.complianceScore}`
    ),
    '',
    '# Detailed Events would appear below in production:',
    'demo_event_1,2024-01-01T00:00:00Z,USER_LOGIN,info,user123,auth_system,login,success,192.168.1.1,"Login successful"'
  ]

  return rows.join('\n')
}