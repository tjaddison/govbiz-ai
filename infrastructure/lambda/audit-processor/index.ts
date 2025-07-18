import { SQSEvent, DynamoDBStreamEvent, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const eventBridgeClient = new EventBridgeClient({});
const snsClient = new SNSClient({});

// Environment variables
const {
  AUDIT_TABLE,
  USER_TABLE,
  EVENT_BUS,
  NOTIFICATION_TOPIC,
} = process.env;

// Types
interface SecurityEvent {
  eventId: string;
  type: 'security_alert' | 'compliance_violation' | 'suspicious_activity' | 'data_access' | 'admin_action';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  resourceId?: string;
  description: string;
  details: any;
  timestamp: number;
  source: string;
  resolved: boolean;
  ttl: number;
}

interface ComplianceRule {
  ruleId: string;
  name: string;
  description: string;
  category: 'access_control' | 'data_protection' | 'audit_trail' | 'system_integrity';
  enabled: boolean;
  alertThreshold?: number;
  actions: string[];
}

interface AuditSummary {
  userId?: string;
  date: string;
  eventCounts: {
    login: number;
    logout: number;
    dataAccess: number;
    dataModification: number;
    adminActions: number;
    securityEvents: number;
  };
  anomalies: string[];
  complianceScore: number;
}

// Compliance rules configuration
const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    ruleId: 'excessive_login_attempts',
    name: 'Excessive Login Attempts',
    description: 'Detects multiple failed login attempts from same user/IP',
    category: 'access_control',
    enabled: true,
    alertThreshold: 5,
    actions: ['alert', 'lock_account'],
  },
  {
    ruleId: 'bulk_data_access',
    name: 'Bulk Data Access',
    description: 'Detects unusual bulk data access patterns',
    category: 'data_protection',
    enabled: true,
    alertThreshold: 100,
    actions: ['alert', 'review_required'],
  },
  {
    ruleId: 'admin_action_weekend',
    name: 'Weekend Admin Actions',
    description: 'Detects administrative actions during off-hours',
    category: 'system_integrity',
    enabled: true,
    actions: ['alert', 'manual_review'],
  },
  {
    ruleId: 'data_export_large',
    name: 'Large Data Export',
    description: 'Detects large data exports that may indicate data exfiltration',
    category: 'data_protection',
    enabled: true,
    alertThreshold: 10000,
    actions: ['alert', 'suspend_user', 'immediate_review'],
  },
  {
    ruleId: 'privilege_escalation',
    name: 'Privilege Escalation',
    description: 'Detects attempts to escalate user privileges',
    category: 'access_control',
    enabled: true,
    actions: ['alert', 'block_action', 'immediate_review'],
  },
];

// Utility functions
const analyzeSecurityEvent = (event: any): SecurityEvent | null => {
  const timestamp = Date.now();
  const ttl = Math.floor(timestamp / 1000) + (365 * 24 * 60 * 60); // 1 year retention

  // Failed login analysis
  if (event.action === 'LOGIN_FAILED') {
    return {
      eventId: `security-${timestamp}-${event.userId}`,
      type: 'security_alert',
      severity: 'medium',
      userId: event.userId,
      description: 'Failed login attempt detected',
      details: {
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        timestamp: event.timestamp,
      },
      timestamp,
      source: 'auth_system',
      resolved: false,
      ttl,
    };
  }

  // Admin actions during off-hours
  if (event.action.includes('ADMIN_') || event.action.includes('DELETE_')) {
    const hour = new Date(event.timestamp).getHours();
    const isWeekend = [0, 6].includes(new Date(event.timestamp).getDay());
    
    if (hour < 6 || hour > 22 || isWeekend) {
      return {
        eventId: `security-${timestamp}-${event.userId}`,
        type: 'suspicious_activity',
        severity: 'high',
        userId: event.userId,
        description: 'Administrative action during off-hours',
        details: {
          action: event.action,
          resource: event.resource,
          timestamp: event.timestamp,
          hour,
          isWeekend,
        },
        timestamp,
        source: 'audit_system',
        resolved: false,
        ttl,
      };
    }
  }

  // Bulk data access
  if (event.action === 'BULK_DATA_ACCESS' && event.details?.recordCount > 100) {
    return {
      eventId: `security-${timestamp}-${event.userId}`,
      type: 'suspicious_activity',
      severity: 'medium',
      userId: event.userId,
      description: 'Unusual bulk data access detected',
      details: {
        recordCount: event.details.recordCount,
        resource: event.resource,
        timestamp: event.timestamp,
      },
      timestamp,
      source: 'data_access_monitor',
      resolved: false,
      ttl,
    };
  }

  return null;
};

const checkComplianceViolations = async (auditEvent: any): Promise<SecurityEvent[]> => {
  const violations: SecurityEvent[] = [];
  
  for (const rule of COMPLIANCE_RULES) {
    if (!rule.enabled) continue;

    try {
      switch (rule.ruleId) {
        case 'excessive_login_attempts':
          const recentFailures = await countRecentEvents(
            auditEvent.userId,
            'LOGIN_FAILED',
            60 * 60 * 1000 // 1 hour
          );
          
          if (recentFailures >= (rule.alertThreshold || 5)) {
            violations.push({
              eventId: `violation-${Date.now()}-${rule.ruleId}`,
              type: 'compliance_violation',
              severity: 'high',
              userId: auditEvent.userId,
              description: `${rule.name}: ${recentFailures} failed login attempts`,
              details: {
                ruleId: rule.ruleId,
                threshold: rule.alertThreshold,
                actualCount: recentFailures,
                actions: rule.actions,
              },
              timestamp: Date.now(),
              source: 'compliance_engine',
              resolved: false,
              ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60),
            });
          }
          break;

        case 'bulk_data_access':
          if (auditEvent.action === 'GET_OPPORTUNITIES' && 
              auditEvent.details?.limit > (rule.alertThreshold || 100)) {
            violations.push({
              eventId: `violation-${Date.now()}-${rule.ruleId}`,
              type: 'compliance_violation',
              severity: 'medium',
              userId: auditEvent.userId,
              description: `${rule.name}: Requested ${auditEvent.details.limit} records`,
              details: {
                ruleId: rule.ruleId,
                threshold: rule.alertThreshold,
                actualCount: auditEvent.details.limit,
                actions: rule.actions,
              },
              timestamp: Date.now(),
              source: 'compliance_engine',
              resolved: false,
              ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60),
            });
          }
          break;

        // Add more rule implementations as needed
      }
    } catch (error) {
      console.error(`Error checking compliance rule ${rule.ruleId}:`, error);
    }
  }

  return violations;
};

const countRecentEvents = async (
  userId: string,
  action: string,
  timeWindowMs: number
): Promise<number> => {
  try {
    const since = Date.now() - timeWindowMs;
    
    const result = await docClient.send(new QueryCommand({
      TableName: AUDIT_TABLE,
      IndexName: 'user-audit-index',
      KeyConditionExpression: 'userId = :userId AND #timestamp > :since',
      FilterExpression: '#action = :action',
      ExpressionAttributeNames: {
        '#timestamp': 'timestamp',
        '#action': 'action',
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':since': since,
        ':action': action,
      },
      Select: 'COUNT',
    }));

    return result.Count || 0;
  } catch (error) {
    console.error('Error counting recent events:', error);
    return 0;
  }
};

const generateDailyAuditSummary = async (userId: string, date: string): Promise<AuditSummary> => {
  try {
    const startOfDay = new Date(date).getTime();
    const endOfDay = startOfDay + (24 * 60 * 60 * 1000);

    const events = await docClient.send(new QueryCommand({
      TableName: AUDIT_TABLE,
      IndexName: 'user-audit-index',
      KeyConditionExpression: 'userId = :userId AND #timestamp BETWEEN :start AND :end',
      ExpressionAttributeNames: {
        '#timestamp': 'timestamp',
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':start': startOfDay,
        ':end': endOfDay,
      },
    }));

    const eventCounts = {
      login: 0,
      logout: 0,
      dataAccess: 0,
      dataModification: 0,
      adminActions: 0,
      securityEvents: 0,
    };

    const anomalies: string[] = [];

    for (const event of events.Items || []) {
      const action = event.action;
      
      if (action.includes('LOGIN')) eventCounts.login++;
      else if (action.includes('LOGOUT')) eventCounts.logout++;
      else if (action.includes('GET_') || action.includes('SEARCH_')) eventCounts.dataAccess++;
      else if (action.includes('UPDATE_') || action.includes('CREATE_') || action.includes('DELETE_')) {
        eventCounts.dataModification++;
        if (action.includes('ADMIN_') || action.includes('DELETE_')) {
          eventCounts.adminActions++;
        }
      }

      // Detect anomalies
      const hour = new Date(event.timestamp).getHours();
      if (hour < 6 || hour > 22) {
        anomalies.push(`Off-hours activity: ${action} at ${new Date(event.timestamp).toISOString()}`);
      }
    }

    // Calculate compliance score (0-100)
    let complianceScore = 100;
    if (eventCounts.adminActions > 10) complianceScore -= 10;
    if (anomalies.length > 5) complianceScore -= 20;
    if (eventCounts.dataAccess > 1000) complianceScore -= 15;

    return {
      userId,
      date,
      eventCounts,
      anomalies: anomalies.slice(0, 10), // Limit to 10 anomalies
      complianceScore: Math.max(0, complianceScore),
    };
  } catch (error) {
    console.error('Error generating audit summary:', error);
    throw error;
  }
};

const processAuditEvent = async (auditEvent: any): Promise<void> => {
  try {
    // Check for security events
    const securityEvent = analyzeSecurityEvent(auditEvent);
    if (securityEvent) {
      // Store security event
      await docClient.send(new PutCommand({
        TableName: `${AUDIT_TABLE}-security`,
        Item: securityEvent,
      }));

      // Send alert if high severity
      if (securityEvent.severity === 'high' || securityEvent.severity === 'critical') {
        await snsClient.send(new PublishCommand({
          TopicArn: NOTIFICATION_TOPIC,
          Subject: `Security Alert: ${securityEvent.description}`,
          Message: JSON.stringify(securityEvent, null, 2),
        }));
      }

      // Publish to EventBridge
      await eventBridgeClient.send(new PutEventsCommand({
        Entries: [{
          Source: 'govbiz.security',
          DetailType: 'Security Event Detected',
          Detail: JSON.stringify(securityEvent),
          EventBusName: EVENT_BUS,
        }],
      }));
    }

    // Check compliance violations
    const violations = await checkComplianceViolations(auditEvent);
    for (const violation of violations) {
      // Store violation
      await docClient.send(new PutCommand({
        TableName: `${AUDIT_TABLE}-compliance`,
        Item: violation,
      }));

      // Send alert
      await snsClient.send(new PublishCommand({
        TopicArn: NOTIFICATION_TOPIC,
        Subject: `Compliance Violation: ${violation.description}`,
        Message: JSON.stringify(violation, null, 2),
      }));

      // Publish to EventBridge
      await eventBridgeClient.send(new PutEventsCommand({
        Entries: [{
          Source: 'govbiz.compliance',
          DetailType: 'Compliance Violation',
          Detail: JSON.stringify(violation),
          EventBusName: EVENT_BUS,
        }],
      }));
    }

    console.log(`Processed audit event ${auditEvent.eventId}: ${securityEvent ? '1 security event' : '0 security events'}, ${violations.length} violations`);
  } catch (error) {
    console.error('Error processing audit event:', error);
    throw error;
  }
};

const processDynamoDBStream = async (record: any): Promise<void> => {
  try {
    if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
      const auditEvent = record.dynamodb.NewImage;
      
      // Convert DynamoDB format to regular object
      const processedEvent = {
        eventId: auditEvent.eventId?.S,
        userId: auditEvent.userId?.S,
        action: auditEvent.action?.S,
        resource: auditEvent.resource?.S,
        timestamp: auditEvent.timestamp?.N ? parseInt(auditEvent.timestamp.N) : Date.now(),
        details: auditEvent.details?.M ? JSON.parse(auditEvent.details.M) : {},
        ipAddress: auditEvent.ipAddress?.S,
        userAgent: auditEvent.userAgent?.S,
      };

      await processAuditEvent(processedEvent);
    }
  } catch (error) {
    console.error('Error processing DynamoDB stream record:', error);
    throw error;
  }
};

// Main handler
export const handler = async (
  event: SQSEvent | DynamoDBStreamEvent,
  context: Context
): Promise<void> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Handle SQS events
    if ('Records' in event && event.Records[0]?.eventSource === 'aws:sqs') {
      const sqsEvent = event as SQSEvent;
      
      for (const record of sqsEvent.Records) {
        const messageBody = JSON.parse(record.body);
        
        switch (messageBody.type) {
          case 'audit_event':
            await processAuditEvent(messageBody.data);
            break;

          case 'generate_daily_summary':
            const summary = await generateDailyAuditSummary(
              messageBody.data.userId,
              messageBody.data.date
            );
            
            // Store summary
            await docClient.send(new PutCommand({
              TableName: `${AUDIT_TABLE}-summaries`,
              Item: {
                ...summary,
                summaryId: `${summary.userId}-${summary.date}`,
                generatedAt: new Date().toISOString(),
              },
            }));
            break;

          default:
            console.warn('Unknown message type:', messageBody.type);
        }
      }
    }

    // Handle DynamoDB stream events
    if ('Records' in event && event.Records[0]?.eventSource === 'aws:dynamodb') {
      const streamEvent = event as DynamoDBStreamEvent;
      
      for (const record of streamEvent.Records) {
        await processDynamoDBStream(record);
      }
    }
  } catch (error) {
    console.error('Handler error:', error);
    throw error;
  }
};