import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { securityFramework } from '@/lib/security/SecurityFramework'
import { auditLogger, AuditEventType } from '@/lib/audit/AuditLogger'

// This route uses dynamic features and should not be pre-rendered
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Check if user has security monitoring permissions
    const hasSecurityAccess = await checkSecurityPermissions(session.user.id)
    if (!hasSecurityAccess) {
      await auditLogger.logEvent({
        eventType: AuditEventType.PERMISSION_DENIED,
        severity: 'warning',
        userId: session.user.id,
        ipAddress: extractIpAddress(request),
        userAgent: request.headers.get('user-agent') || 'unknown',
        resource: 'security_status',
        action: 'read',
        outcome: 'failure',
        details: { reason: 'insufficient_permissions' }
      })
      return new NextResponse('Forbidden - Insufficient security monitoring permissions', { status: 403 })
    }

    // Generate security status report
    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const securityReport = await securityFramework.generateSecurityReport(
      last24Hours,
      now,
      session.user.id
    )

    // Calculate system health metrics
    const systemHealth = await calculateSystemHealth()
    
    // Get recent security events summary
    const recentEvents = await getRecentSecurityEvents(last24Hours, now)

    // Compliance status check
    const complianceStatus = await checkComplianceStatus()

    // Current threat level assessment
    const threatLevel = assessCurrentThreatLevel(securityReport)

    const securityStatus = {
      timestamp: now.toISOString(),
      overallStatus: determineOverallStatus(systemHealth, securityReport, complianceStatus),
      threatLevel,
      
      // System Health
      systemHealth: {
        status: systemHealth.status,
        uptime: systemHealth.uptime,
        responseTime: systemHealth.responseTime,
        errorRate: systemHealth.errorRate,
        activeConnections: systemHealth.activeConnections,
        resourceUtilization: {
          cpu: systemHealth.cpu,
          memory: systemHealth.memory,
          storage: systemHealth.storage
        }
      },

      // Security Metrics (Last 24 Hours)
      securityMetrics: {
        totalEvents: securityReport.summary.totalEvents,
        criticalEvents: securityReport.summary.criticalEvents,
        highEvents: securityReport.summary.highEvents,
        mediumEvents: securityReport.summary.mediumEvents,
        lowEvents: securityReport.summary.lowEvents,
        resolvedEvents: securityReport.summary.resolvedEvents,
        
        // Threat Analysis
        topThreats: securityReport.trends.mostCommonThreats.slice(0, 5),
        attackSources: securityReport.trends.attackSources.slice(0, 10),
        
        // Rate Limiting Stats
        rateLimitViolations: recentEvents.rateLimitViolations,
        suspiciousActivityCount: recentEvents.suspiciousActivityCount,
        authenticationFailures: recentEvents.authenticationFailures
      },

      // Compliance Status
      compliance: {
        overall: complianceStatus.overall,
        frameworks: complianceStatus.frameworks,
        lastAssessment: complianceStatus.lastAssessment,
        nextAssessmentDue: complianceStatus.nextAssessmentDue,
        violations: complianceStatus.violations.filter(v => v.severity === 'high').length,
        controlsCovered: complianceStatus.controlsCovered
      },

      // Real-time Monitoring
      monitoring: {
        activeMonitors: await getActiveMonitors(),
        alertsInLast24h: recentEvents.alertCount,
        automatedResponses: recentEvents.automatedResponseCount,
        manualInterventions: recentEvents.manualInterventionCount
      },

      // Security Configuration Status
      configuration: {
        encryptionStatus: 'enabled',
        backupStatus: 'current',
        updateStatus: await checkUpdateStatus(),
        certificateStatus: await checkCertificateStatus(),
        firewallStatus: 'active',
        intrusionDetection: 'active'
      },

      // Recommendations
      recommendations: [
        ...securityReport.compliance.recommendations,
        ...generateAdditionalRecommendations(securityReport, systemHealth)
      ],

      // Next Actions
      nextActions: generateNextActions(threatLevel, securityReport),

      metadata: {
        reportGeneratedBy: session.user.id,
        dataRetentionCompliance: 'NIST-800-53',
        classificationLevel: 'CONFIDENTIAL',
        accessControlled: true
      }
    }

    // Log security status access
    await auditLogger.logEvent({
      eventType: AuditEventType.AUDIT_TRAIL_ACCESS,
      severity: 'info',
      userId: session.user.id,
      ipAddress: extractIpAddress(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      resource: 'security_status',
      action: 'view',
      outcome: 'success',
      details: {
        overallStatus: securityStatus.overallStatus,
        threatLevel: securityStatus.threatLevel,
        criticalEvents: securityStatus.securityMetrics.criticalEvents
      }
    })

    return NextResponse.json(securityStatus)
  } catch (error) {
    console.error('Security status error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Helper functions
async function checkSecurityPermissions(userId: string): Promise<boolean> {
  // In production, this would check user roles/permissions in database
  return true
}

function extractIpAddress(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0] || 
         request.headers.get('x-real-ip') || 
         '127.0.0.1'
}

async function calculateSystemHealth(): Promise<{
  status: 'healthy' | 'warning' | 'critical'
  uptime: number
  responseTime: number
  errorRate: number
  activeConnections: number
  cpu: number
  memory: number
  storage: number
}> {
  // Mock system health data - in production this would query actual metrics
  return {
    status: 'healthy',
    uptime: 99.9,
    responseTime: 150, // ms
    errorRate: 0.1, // %
    activeConnections: 245,
    cpu: 35, // %
    memory: 60, // %
    storage: 45 // %
  }
}

async function getRecentSecurityEvents(startDate: Date, endDate: Date): Promise<{
  rateLimitViolations: number
  suspiciousActivityCount: number
  authenticationFailures: number
  alertCount: number
  automatedResponseCount: number
  manualInterventionCount: number
}> {
  // Mock recent events data - in production this would query actual events
  return {
    rateLimitViolations: 12,
    suspiciousActivityCount: 3,
    authenticationFailures: 8,
    alertCount: 15,
    automatedResponseCount: 11,
    manualInterventionCount: 4
  }
}

async function checkComplianceStatus(): Promise<{
  overall: 'compliant' | 'partial' | 'non-compliant'
  frameworks: Array<{
    name: string
    status: 'compliant' | 'partial' | 'non-compliant'
    score: number
    lastAssessed: string
  }>
  lastAssessment: string
  nextAssessmentDue: string
  violations: Array<{ control: string; severity: string; description: string }>
  controlsCovered: number
}> {
  return {
    overall: 'compliant',
    frameworks: [
      {
        name: 'NIST-800-53',
        status: 'compliant',
        score: 95,
        lastAssessed: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        name: 'FedRAMP',
        status: 'partial',
        score: 88,
        lastAssessed: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      }
    ],
    lastAssessment: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    nextAssessmentDue: new Date(Date.now() + 83 * 24 * 60 * 60 * 1000).toISOString(),
    violations: [
      {
        control: 'AC-7',
        severity: 'medium',
        description: 'Account lockout policy needs review'
      }
    ],
    controlsCovered: 156
  }
}

function assessCurrentThreatLevel(securityReport: any): 'low' | 'medium' | 'high' | 'critical' {
  const { criticalEvents, highEvents } = securityReport.summary
  
  if (criticalEvents > 0) return 'critical'
  if (highEvents > 5) return 'high'
  if (highEvents > 0) return 'medium'
  return 'low'
}

function determineOverallStatus(
  systemHealth: any,
  securityReport: any,
  complianceStatus: any
): 'operational' | 'degraded' | 'critical' {
  if (systemHealth.status === 'critical' || 
      securityReport.summary.criticalEvents > 0 ||
      complianceStatus.overall === 'non-compliant') {
    return 'critical'
  }
  
  if (systemHealth.status === 'warning' ||
      securityReport.summary.highEvents > 3 ||
      complianceStatus.overall === 'partial') {
    return 'degraded'
  }
  
  return 'operational'
}

async function getActiveMonitors(): Promise<Array<{
  name: string
  status: 'active' | 'inactive' | 'error'
  lastCheck: string
  alertsEnabled: boolean
}>> {
  return [
    {
      name: 'Intrusion Detection System',
      status: 'active',
      lastCheck: new Date().toISOString(),
      alertsEnabled: true
    },
    {
      name: 'Log Analysis Engine',
      status: 'active',
      lastCheck: new Date().toISOString(),
      alertsEnabled: true
    },
    {
      name: 'Compliance Monitor',
      status: 'active',
      lastCheck: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      alertsEnabled: true
    },
    {
      name: 'Performance Monitor',
      status: 'active',
      lastCheck: new Date().toISOString(),
      alertsEnabled: false
    }
  ]
}

async function checkUpdateStatus(): Promise<'current' | 'available' | 'critical'> {
  // Mock update status
  return 'current'
}

async function checkCertificateStatus(): Promise<'valid' | 'expiring' | 'expired'> {
  // Mock certificate status
  return 'valid'
}

function generateAdditionalRecommendations(securityReport: any, systemHealth: any): string[] {
  const recommendations: string[] = []
  
  if (systemHealth.errorRate > 1) {
    recommendations.push('Monitor and investigate elevated error rates')
  }
  
  if (systemHealth.memory > 80) {
    recommendations.push('Consider scaling resources - memory utilization is high')
  }
  
  if (securityReport.trends.attackSources.length > 10) {
    recommendations.push('Implement geographic blocking for repeated attack sources')
  }
  
  return recommendations
}

function generateNextActions(threatLevel: string, securityReport: any): Array<{
  priority: 'immediate' | 'high' | 'medium' | 'low'
  action: string
  deadline: string
  assignee: string
}> {
  const actions = []
  
  if (threatLevel === 'critical') {
    actions.push({
      priority: 'immediate' as const,
      action: 'Investigate and respond to critical security events',
      deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
      assignee: 'security_team'
    })
  }
  
  if (securityReport.summary.highEvents > 0) {
    actions.push({
      priority: 'high' as const,
      action: 'Review and triage high severity security events',
      deadline: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours
      assignee: 'security_analyst'
    })
  }
  
  actions.push({
    priority: 'medium' as const,
    action: 'Review and update security policies based on recent trends',
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week
    assignee: 'compliance_officer'
  })
  
  return actions
}