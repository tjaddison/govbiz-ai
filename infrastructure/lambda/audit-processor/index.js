"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
const client_sns_1 = require("@aws-sdk/client-sns");
// Initialize AWS clients
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const eventBridgeClient = new client_eventbridge_1.EventBridgeClient({});
const snsClient = new client_sns_1.SNSClient({});
// Environment variables
const { AUDIT_TABLE, USER_TABLE, EVENT_BUS, NOTIFICATION_TOPIC, } = process.env;
// Compliance rules configuration
const COMPLIANCE_RULES = [
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
const analyzeSecurityEvent = (event) => {
    var _a;
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
    if (event.action === 'BULK_DATA_ACCESS' && ((_a = event.details) === null || _a === void 0 ? void 0 : _a.recordCount) > 100) {
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
const checkComplianceViolations = async (auditEvent) => {
    var _a;
    const violations = [];
    for (const rule of COMPLIANCE_RULES) {
        if (!rule.enabled)
            continue;
        try {
            switch (rule.ruleId) {
                case 'excessive_login_attempts':
                    const recentFailures = await countRecentEvents(auditEvent.userId, 'LOGIN_FAILED', 60 * 60 * 1000 // 1 hour
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
                        ((_a = auditEvent.details) === null || _a === void 0 ? void 0 : _a.limit) > (rule.alertThreshold || 100)) {
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
        }
        catch (error) {
            console.error(`Error checking compliance rule ${rule.ruleId}:`, error);
        }
    }
    return violations;
};
const countRecentEvents = async (userId, action, timeWindowMs) => {
    try {
        const since = Date.now() - timeWindowMs;
        const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
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
    }
    catch (error) {
        console.error('Error counting recent events:', error);
        return 0;
    }
};
const generateDailyAuditSummary = async (userId, date) => {
    try {
        const startOfDay = new Date(date).getTime();
        const endOfDay = startOfDay + (24 * 60 * 60 * 1000);
        const events = await docClient.send(new lib_dynamodb_1.QueryCommand({
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
        const anomalies = [];
        for (const event of events.Items || []) {
            const action = event.action;
            if (action.includes('LOGIN'))
                eventCounts.login++;
            else if (action.includes('LOGOUT'))
                eventCounts.logout++;
            else if (action.includes('GET_') || action.includes('SEARCH_'))
                eventCounts.dataAccess++;
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
        if (eventCounts.adminActions > 10)
            complianceScore -= 10;
        if (anomalies.length > 5)
            complianceScore -= 20;
        if (eventCounts.dataAccess > 1000)
            complianceScore -= 15;
        return {
            userId,
            date,
            eventCounts,
            anomalies: anomalies.slice(0, 10), // Limit to 10 anomalies
            complianceScore: Math.max(0, complianceScore),
        };
    }
    catch (error) {
        console.error('Error generating audit summary:', error);
        throw error;
    }
};
const processAuditEvent = async (auditEvent) => {
    try {
        // Check for security events
        const securityEvent = analyzeSecurityEvent(auditEvent);
        if (securityEvent) {
            // Store security event
            await docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: `${AUDIT_TABLE}-security`,
                Item: securityEvent,
            }));
            // Send alert if high severity
            if (securityEvent.severity === 'high' || securityEvent.severity === 'critical') {
                await snsClient.send(new client_sns_1.PublishCommand({
                    TopicArn: NOTIFICATION_TOPIC,
                    Subject: `Security Alert: ${securityEvent.description}`,
                    Message: JSON.stringify(securityEvent, null, 2),
                }));
            }
            // Publish to EventBridge
            await eventBridgeClient.send(new client_eventbridge_1.PutEventsCommand({
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
            await docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: `${AUDIT_TABLE}-compliance`,
                Item: violation,
            }));
            // Send alert
            await snsClient.send(new client_sns_1.PublishCommand({
                TopicArn: NOTIFICATION_TOPIC,
                Subject: `Compliance Violation: ${violation.description}`,
                Message: JSON.stringify(violation, null, 2),
            }));
            // Publish to EventBridge
            await eventBridgeClient.send(new client_eventbridge_1.PutEventsCommand({
                Entries: [{
                        Source: 'govbiz.compliance',
                        DetailType: 'Compliance Violation',
                        Detail: JSON.stringify(violation),
                        EventBusName: EVENT_BUS,
                    }],
            }));
        }
        console.log(`Processed audit event ${auditEvent.eventId}: ${securityEvent ? '1 security event' : '0 security events'}, ${violations.length} violations`);
    }
    catch (error) {
        console.error('Error processing audit event:', error);
        throw error;
    }
};
const processDynamoDBStream = async (record) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
            const auditEvent = record.dynamodb.NewImage;
            // Convert DynamoDB format to regular object
            const processedEvent = {
                eventId: (_a = auditEvent.eventId) === null || _a === void 0 ? void 0 : _a.S,
                userId: (_b = auditEvent.userId) === null || _b === void 0 ? void 0 : _b.S,
                action: (_c = auditEvent.action) === null || _c === void 0 ? void 0 : _c.S,
                resource: (_d = auditEvent.resource) === null || _d === void 0 ? void 0 : _d.S,
                timestamp: ((_e = auditEvent.timestamp) === null || _e === void 0 ? void 0 : _e.N) ? parseInt(auditEvent.timestamp.N) : Date.now(),
                details: ((_f = auditEvent.details) === null || _f === void 0 ? void 0 : _f.M) ? JSON.parse(auditEvent.details.M) : {},
                ipAddress: (_g = auditEvent.ipAddress) === null || _g === void 0 ? void 0 : _g.S,
                userAgent: (_h = auditEvent.userAgent) === null || _h === void 0 ? void 0 : _h.S,
            };
            await processAuditEvent(processedEvent);
        }
    }
    catch (error) {
        console.error('Error processing DynamoDB stream record:', error);
        throw error;
    }
};
// Main handler
const handler = async (event, context) => {
    var _a, _b;
    console.log('Event:', JSON.stringify(event, null, 2));
    try {
        // Handle SQS events
        if ('Records' in event && ((_a = event.Records[0]) === null || _a === void 0 ? void 0 : _a.eventSource) === 'aws:sqs') {
            const sqsEvent = event;
            for (const record of sqsEvent.Records) {
                const messageBody = JSON.parse(record.body);
                switch (messageBody.type) {
                    case 'audit_event':
                        await processAuditEvent(messageBody.data);
                        break;
                    case 'generate_daily_summary':
                        const summary = await generateDailyAuditSummary(messageBody.data.userId, messageBody.data.date);
                        // Store summary
                        await docClient.send(new lib_dynamodb_1.PutCommand({
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
        if ('Records' in event && ((_b = event.Records[0]) === null || _b === void 0 ? void 0 : _b.eventSource) === 'aws:dynamodb') {
            const streamEvent = event;
            for (const record of streamEvent.Records) {
                await processDynamoDBStream(record);
            }
        }
    }
    catch (error) {
        console.error('Handler error:', error);
        throw error;
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBQXdHO0FBQ3hHLG9FQUFrRjtBQUNsRixvREFBZ0U7QUFFaEUseUJBQXlCO0FBQ3pCLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDNUQsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLHNDQUFpQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3BELE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUVwQyx3QkFBd0I7QUFDeEIsTUFBTSxFQUNKLFdBQVcsRUFDWCxVQUFVLEVBQ1YsU0FBUyxFQUNULGtCQUFrQixHQUNuQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUM7QUEwQ2hCLGlDQUFpQztBQUNqQyxNQUFNLGdCQUFnQixHQUFxQjtJQUN6QztRQUNFLE1BQU0sRUFBRSwwQkFBMEI7UUFDbEMsSUFBSSxFQUFFLDBCQUEwQjtRQUNoQyxXQUFXLEVBQUUsMERBQTBEO1FBQ3ZFLFFBQVEsRUFBRSxnQkFBZ0I7UUFDMUIsT0FBTyxFQUFFLElBQUk7UUFDYixjQUFjLEVBQUUsQ0FBQztRQUNqQixPQUFPLEVBQUUsQ0FBQyxPQUFPLEVBQUUsY0FBYyxDQUFDO0tBQ25DO0lBQ0Q7UUFDRSxNQUFNLEVBQUUsa0JBQWtCO1FBQzFCLElBQUksRUFBRSxrQkFBa0I7UUFDeEIsV0FBVyxFQUFFLDJDQUEyQztRQUN4RCxRQUFRLEVBQUUsaUJBQWlCO1FBQzNCLE9BQU8sRUFBRSxJQUFJO1FBQ2IsY0FBYyxFQUFFLEdBQUc7UUFDbkIsT0FBTyxFQUFFLENBQUMsT0FBTyxFQUFFLGlCQUFpQixDQUFDO0tBQ3RDO0lBQ0Q7UUFDRSxNQUFNLEVB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LElBQUksQ0FBQyxJQUFJLHlCQUFVLENBQUM7NEJBQ2xDLFNBQVMsRUFBRSxHQUFHLFdBQVcsWUFBWTs0QkFDckMsSUFBSSxFQUFFO2dDQUNKLEdBQUcsT0FBTztnQ0FDVixTQUFTLEVBQUUsR0FBRyxPQUFPLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEVBQUU7Z0NBQzlDLFdBQVcsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTs2QkFDdEM7eUJBQ0YsQ0FBQyxDQUFDLENBQUM7d0JBQ0osTUFBTTtvQkFFUjt3QkFDRSxPQUFPLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDNUQsQ0FBQztZQUNILENBQUM7UUFDSCxDQUFDO1FBRUQsZ0NBQWdDO1FBQ2hDLElBQUksU0FBUyxJQUFJLEtBQUssSUFBSSxDQUFBLE1BQUEsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsMENBQUUsV0FBVyxNQUFLLGNBQWMsRUFBRSxDQUFDO1lBQzNFLE1BQU0sV0FBVyxHQUFHLEtBQTRCLENBQUM7WUFFakQsS0FBSyxNQUFNLE1BQU0sSUFBSSxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3pDLE1BQU0scUJBQXFCLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdEMsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdkMsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBdERXLFFBQUEsT0FBTyxXQXNEbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTUVNFdmVudCwgRHluYW1vREJTdHJlYW1FdmVudCwgQ29udGV4dCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCwgUXVlcnlDb21tYW5kLCBVcGRhdGVDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IEV2ZW50QnJpZGdlQ2xpZW50LCBQdXRFdmVudHNDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWV2ZW50YnJpZGdlJztcbmltcG9ydCB7IFNOU0NsaWVudCwgUHVibGlzaENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc25zJztcblxuLy8gSW5pdGlhbGl6ZSBBV1MgY2xpZW50c1xuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xuY29uc3QgZXZlbnRCcmlkZ2VDbGllbnQgPSBuZXcgRXZlbnRCcmlkZ2VDbGllbnQoe30pO1xuY29uc3Qgc25zQ2xpZW50ID0gbmV3IFNOU0NsaWVudCh7fSk7XG5cbi8vIEVudmlyb25tZW50IHZhcmlhYmxlc1xuY29uc3Qge1xuICBBVURJVF9UQUJMRSxcbiAgVVNFUl9UQUJMRSxcbiAgRVZFTlRfQlVTLFxuICBOT1RJRklDQVRJT05fVE9QSUMsXG59ID0gcHJvY2Vzcy5lbnY7XG5cbi8vIFR5cGVzXG5pbnRlcmZhY2UgU2VjdXJpdHlFdmVudCB7XG4gIGV2ZW50SWQ6IHN0cmluZztcbiAgdHlwZTogJ3NlY3VyaXR5X2FsZXJ0JyB8ICdjb21wbGlhbmNlX3Zpb2xhdGlvbicgfCAnc3VzcGljaW91c19hY3Rpdml0eScgfCAnZGF0YV9hY2Nlc3MnIHwgJ2FkbWluX2FjdGlvbic7XG4gIHNldmVyaXR5OiAnbG93JyB8ICdtZWRpdW0nIHwgJ2hpZ2gnIHwgJ2NyaXRpY2FsJztcbiAgdXNlcklkPzogc3RyaW5nO1xuICByZXNvdXJjZUlkPzogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkZXRhaWxzOiBhbnk7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xuICBzb3VyY2U6IHN0cmluZztcbiAgcmVzb2x2ZWQ6IGJvb2xlYW47XG4gIHR0bDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQ29tcGxpYW5jZVJ1bGUge1xuICBydWxlSWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBjYXRlZ29yeTogJ2FjY2Vzc19jb250cm9sJyB8ICdkYXRhX3Byb3RlY3Rpb24nIHwgJ2F1ZGl0X3RyYWlsJyB8ICdzeXN0ZW1faW50ZWdyaXR5JztcbiAgZW5hYmxlZDogYm9vbGVhbjtcbiAgYWxlcnRUaHJlc2hvbGQ/OiBudW1iZXI7XG4gIGFjdGlvbnM6IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgQXVkaXRTdW1tYXJ5IHtcbiAgdXNlcklkPzogc3RyaW5nO1xuICBkYXRlOiBzdHJpbmc7XG4gIGV2ZW50Q291bnRzOiB7XG4gICAgbG9naW46IG51bWJlcjtcbiAgICBsb2dvdXQ6IG51bWJlcjtcbiAgICBkYXRhQWNjZXNzOiBudW1iZXI7XG4gICAgZGF0YU1vZGlmaWNhdGlvbjogbnVtYmVyO1xuICAgIGFkbWluQWN0aW9uczogbnVtYmVyO1xuICAgIHNlY3VyaXR5RXZlbnRzOiBudW1iZXI7XG4gIH07XG4gIGFub21hbGllczogc3RyaW5nW107XG4gIGNvbXBsaWFuY2VTY29yZTogbnVtYmVyO1xufVxuXG4vLyBDb21wbGlhbmNlIHJ1bGVzIGNvbmZpZ3VyYXRpb25cbmNvbnN0IENPTVBMSUFOQ0VfUlVMRVM6IENvbXBsaWFuY2VSdWxlW10gPSBbXG4gIHtcbiAgICBydWxlSWQ6ICdleGNlc3NpdmVfbG9naW5fYXR0ZW1wdHMnLFxuICAgIG5hbWU6ICdFeGNlc3NpdmUgTG9naW4gQXR0ZW1wdHMnLFxuICAgIGRlc2NyaXB0aW9uOiAnRGV0ZWN0cyBtdWx0aXBsZSBmYWlsZWQgbG9naW4gYXR0ZW1wdHMgZnJvbSBzYW1lIHVzZXIvSVAnLFxuICAgIGNhdGVnb3J5OiAnYWNjZXNzX2NvbnRyb2wnLFxuICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgYWxlcnRUaHJlc2hvbGQ6IDUsXG4gICAgYWN0aW9uczogWydhbGVydCcsICdsb2NrX2FjY291bnQnXSxcbiAgfSxcbiAge1xuICAgIHJ1bGVJZDogJ2J1bGtfZGF0YV9hY2Nlc3MnLFxuICAgIG5hbWU6ICdCdWxrIERhdGEgQWNjZXNzJyxcbiAgICBkZXNjcmlwdGlvbjogJ0RldGVjdHMgdW51c3VhbCBidWxrIGRhdGEgYWNjZXNzIHBhdHRlcm5zJyxcbiAgICBjYXRlZ29yeTogJ2RhdGFfcHJvdGVjdGlvbicsXG4gICAgZW5hYmxlZDogdHJ1ZSxcbiAgICBhbGVydFRocmVzaG9sZDogMTAwLFxuICAgIGFjdGlvbnM6IFsnYWxlcnQnLCAncmV2aWV3X3JlcXVpcmVkJ10sXG4gIH0sXG4gIHtcbiAgICBydWxlSWQ6ICdhZG1pbl9hY3Rpb25fd2Vla2VuZCcsXG4gICAgbmFtZTogJ1dlZWtlbmQgQWRtaW4gQWN0aW9ucycsXG4gICAgZGVzY3JpcHRpb246ICdEZXRlY3RzIGFkbWluaXN0cmF0aXZlIGFjdGlvbnMgZHVyaW5nIG9mZi1ob3VycycsXG4gICAgY2F0ZWdvcnk6ICdzeXN0ZW1faW50ZWdyaXR5JyxcbiAgICBlbmFibGVkOiB0cnVlLFxuICAgIGFjdGlvbnM6IFsnYWxlcnQnLCAnbWFudWFsX3JldmlldyddLFxuICB9LFxuICB7XG4gICAgcnVsZUlkOiAnZGF0YV9leHBvcnRfbGFyZ2UnLFxuICAgIG5hbWU6ICdMYXJnZSBEYXRhIEV4cG9ydCcsXG4gICAgZGVzY3JpcHRpb246ICdEZXRlY3RzIGxhcmdlIGRhdGEgZXhwb3J0cyB0aGF0IG1heSBpbmRpY2F0ZSBkYXRhIGV4ZmlsdHJhdGlvbicsXG4gICAgY2F0ZWdvcnk6ICdkYXRhX3Byb3RlY3Rpb24nLFxuICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgYWxlcnRUaHJlc2hvbGQ6IDEwMDAwLFxuICAgIGFjdGlvbnM6IFsnYWxlcnQnLCAnc3VzcGVuZF91c2VyJywgJ2ltbWVkaWF0ZV9yZXZpZXcnXSxcbiAgfSxcbiAge1xuICAgIHJ1bGVJZDogJ3ByaXZpbGVnZV9lc2NhbGF0aW9uJyxcbiAgICBuYW1lOiAnUHJpdmlsZWdlIEVzY2FsYXRpb24nLFxuICAgIGRlc2NyaXB0aW9uOiAnRGV0ZWN0cyBhdHRlbXB0cyB0byBlc2NhbGF0ZSB1c2VyIHByaXZpbGVnZXMnLFxuICAgIGNhdGVnb3J5OiAnYWNjZXNzX2NvbnRyb2wnLFxuICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgYWN0aW9uczogWydhbGVydCcsICdibG9ja19hY3Rpb24nLCAnaW1tZWRpYXRlX3JldmlldyddLFxuICB9LFxuXTtcblxuLy8gVXRpbGl0eSBmdW5jdGlvbnNcbmNvbnN0IGFuYWx5emVTZWN1cml0eUV2ZW50ID0gKGV2ZW50OiBhbnkpOiBTZWN1cml0eUV2ZW50IHwgbnVsbCA9PiB7XG4gIGNvbnN0IHRpbWVzdGFtcCA9IERhdGUubm93KCk7XG4gIGNvbnN0IHR0bCA9IE1hdGguZmxvb3IodGltZXN0YW1wIC8gMTAwMCkgKyAoMzY1ICogMjQgKiA2MCAqIDYwKTsgLy8gMSB5ZWFyIHJldGVudGlvblxuXG4gIC8vIEZhaWxlZCBsb2dpbiBhbmFseXNpc1xuICBpZiAoZXZlbnQuYWN0aW9uID09PSAnTE9HSU5fRkFJTEVEJykge1xuICAgIHJldHVybiB7XG4gICAgICBldmVudElkOiBgc2VjdXJpdHktJHt0aW1lc3RhbXB9LSR7ZXZlbnQudXNlcklkfWAsXG4gICAgICB0eXBlOiAnc2VjdXJpdHlfYWxlcnQnLFxuICAgICAgc2V2ZXJpdHk6ICdtZWRpdW0nLFxuICAgICAgdXNlcklkOiBldmVudC51c2VySWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0ZhaWxlZCBsb2dpbiBhdHRlbXB0IGRldGVjdGVkJyxcbiAgICAgIGRldGFpbHM6IHtcbiAgICAgICAgaXBBZGRyZXNzOiBldmVudC5pcEFkZHJlc3MsXG4gICAgICAgIHVzZXJBZ2VudDogZXZlbnQudXNlckFnZW50LFxuICAgICAgICB0aW1lc3RhbXA6IGV2ZW50LnRpbWVzdGFtcCxcbiAgICAgIH0sXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzb3VyY2U6ICdhdXRoX3N5c3RlbScsXG4gICAgICByZXNvbHZlZDogZmFsc2UsXG4gICAgICB0dGwsXG4gICAgfTtcbiAgfVxuXG4gIC8vIEFkbWluIGFjdGlvbnMgZHVyaW5nIG9mZi1ob3Vyc1xuICBpZiAoZXZlbnQuYWN0aW9uLmluY2x1ZGVzKCdBRE1JTl8nKSB8fCBldmVudC5hY3Rpb24uaW5jbHVkZXMoJ0RFTEVURV8nKSkge1xuICAgIGNvbnN0IGhvdXIgPSBuZXcgRGF0ZShldmVudC50aW1lc3RhbXApLmdldEhvdXJzKCk7XG4gICAgY29uc3QgaXNXZWVrZW5kID0gWzAsIDZdLmluY2x1ZGVzKG5ldyBEYXRlKGV2ZW50LnRpbWVzdGFtcCkuZ2V0RGF5KCkpO1xuICAgIFxuICAgIGlmIChob3VyIDwgNiB8fCBob3VyID4gMjIgfHwgaXNXZWVrZW5kKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBldmVudElkOiBgc2VjdXJpdHktJHt0aW1lc3RhbXB9LSR7ZXZlbnQudXNlcklkfWAsXG4gICAgICAgIHR5cGU6ICdzdXNwaWNpb3VzX2FjdGl2aXR5JyxcbiAgICAgICAgc2V2ZXJpdHk6ICdoaWdoJyxcbiAgICAgICAgdXNlcklkOiBldmVudC51c2VySWQsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQWRtaW5pc3RyYXRpdmUgYWN0aW9uIGR1cmluZyBvZmYtaG91cnMnLFxuICAgICAgICBkZXRhaWxzOiB7XG4gICAgICAgICAgYWN0aW9uOiBldmVudC5hY3Rpb24sXG4gICAgICAgICAgcmVzb3VyY2U6IGV2ZW50LnJlc291cmNlLFxuICAgICAgICAgIHRpbWVzdGFtcDogZXZlbnQudGltZXN0YW1wLFxuICAgICAgICAgIGhvdXIsXG4gICAgICAgICAgaXNXZWVrZW5kLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIHNvdXJjZTogJ2F1ZGl0X3N5c3RlbScsXG4gICAgICAgIHJlc29sdmVkOiBmYWxzZSxcbiAgICAgICAgdHRsLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICAvLyBCdWxrIGRhdGEgYWNjZXNzXG4gIGlmIChldmVudC5hY3Rpb24gPT09ICdCVUxLX0RBVEFfQUNDRVNTJyAmJiBldmVudC5kZXRhaWxzPy5yZWNvcmRDb3VudCA+IDEwMCkge1xuICAgIHJldHVybiB7XG4gICAgICBldmVudElkOiBgc2VjdXJpdHktJHt0aW1lc3RhbXB9LSR7ZXZlbnQudXNlcklkfWAsXG4gICAgICB0eXBlOiAnc3VzcGljaW91c19hY3Rpdml0eScsXG4gICAgICBzZXZlcml0eTogJ21lZGl1bScsXG4gICAgICB1c2VySWQ6IGV2ZW50LnVzZXJJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVW51c3VhbCBidWxrIGRhdGEgYWNjZXNzIGRldGVjdGVkJyxcbiAgICAgIGRldGFpbHM6IHtcbiAgICAgICAgcmVjb3JkQ291bnQ6IGV2ZW50LmRldGFpbHMucmVjb3JkQ291bnQsXG4gICAgICAgIHJlc291cmNlOiBldmVudC5yZXNvdXJjZSxcbiAgICAgICAgdGltZXN0YW1wOiBldmVudC50aW1lc3RhbXAsXG4gICAgICB9LFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc291cmNlOiAnZGF0YV9hY2Nlc3NfbW9uaXRvcicsXG4gICAgICByZXNvbHZlZDogZmFsc2UsXG4gICAgICB0dGwsXG4gICAgfTtcbiAgfVxuXG4gIHJldHVybiBudWxsO1xufTtcblxuY29uc3QgY2hlY2tDb21wbGlhbmNlVmlvbGF0aW9ucyA9IGFzeW5jIChhdWRpdEV2ZW50OiBhbnkpOiBQcm9taXNlPFNlY3VyaXR5RXZlbnRbXT4gPT4ge1xuICBjb25zdCB2aW9sYXRpb25zOiBTZWN1cml0eUV2ZW50W10gPSBbXTtcbiAgXG4gIGZvciAoY29uc3QgcnVsZSBvZiBDT01QTElBTkNFX1JVTEVTKSB7XG4gICAgaWYgKCFydWxlLmVuYWJsZWQpIGNvbnRpbnVlO1xuXG4gICAgdHJ5IHtcbiAgICAgIHN3aXRjaCAocnVsZS5ydWxlSWQpIHtcbiAgICAgICAgY2FzZSAnZXhjZXNzaXZlX2xvZ2luX2F0dGVtcHRzJzpcbiAgICAgICAgICBjb25zdCByZWNlbnRGYWlsdXJlcyA9IGF3YWl0IGNvdW50UmVjZW50RXZlbnRzKFxuICAgICAgICAgICAgYXVkaXRFdmVudC51c2VySWQsXG4gICAgICAgICAgICAnTE9HSU5fRkFJTEVEJyxcbiAgICAgICAgICAgIDYwICogNjAgKiAxMDAwIC8vIDEgaG91clxuICAgICAgICAgICk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKHJlY2VudEZhaWx1cmVzID49IChydWxlLmFsZXJ0VGhyZXNob2xkIHx8IDUpKSB7XG4gICAgICAgICAgICB2aW9sYXRpb25zLnB1c2goe1xuICAgICAgICAgICAgICBldmVudElkOiBgdmlvbGF0aW9uLSR7RGF0ZS5ub3coKX0tJHtydWxlLnJ1bGVJZH1gLFxuICAgICAgICAgICAgICB0eXBlOiAnY29tcGxpYW5jZV92aW9sYXRpb24nLFxuICAgICAgICAgICAgICBzZXZlcml0eTogJ2hpZ2gnLFxuICAgICAgICAgICAgICB1c2VySWQ6IGF1ZGl0RXZlbnQudXNlcklkLFxuICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYCR7cnVsZS5uYW1lfTogJHtyZWNlbnRGYWlsdXJlc30gZmFpbGVkIGxvZ2luIGF0dGVtcHRzYCxcbiAgICAgICAgICAgICAgZGV0YWlsczoge1xuICAgICAgICAgICAgICAgIHJ1bGVJZDogcnVsZS5ydWxlSWQsXG4gICAgICAgICAgICAgICAgdGhyZXNob2xkOiBydWxlLmFsZXJ0VGhyZXNob2xkLFxuICAgICAgICAgICAgICAgIGFjdHVhbENvdW50OiByZWNlbnRGYWlsdXJlcyxcbiAgICAgICAgICAgICAgICBhY3Rpb25zOiBydWxlLmFjdGlvbnMsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICAgICAgc291cmNlOiAnY29tcGxpYW5jZV9lbmdpbmUnLFxuICAgICAgICAgICAgICByZXNvbHZlZDogZmFsc2UsXG4gICAgICAgICAgICAgIHR0bDogTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkgKyAoMzY1ICogMjQgKiA2MCAqIDYwKSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlICdidWxrX2RhdGFfYWNjZXNzJzpcbiAgICAgICAgICBpZiAoYXVkaXRFdmVudC5hY3Rpb24gPT09ICdHRVRfT1BQT1JUVU5JVElFUycgJiYgXG4gICAgICAgICAgICAgIGF1ZGl0RXZlbnQuZGV0YWlscz8ubGltaXQgPiAocnVsZS5hbGVydFRocmVzaG9sZCB8fCAxMDApKSB7XG4gICAgICAgICAgICB2aW9sYXRpb25zLnB1c2goe1xuICAgICAgICAgICAgICBldmVudElkOiBgdmlvbGF0aW9uLSR7RGF0ZS5ub3coKX0tJHtydWxlLnJ1bGVJZH1gLFxuICAgICAgICAgICAgICB0eXBlOiAnY29tcGxpYW5jZV92aW9sYXRpb24nLFxuICAgICAgICAgICAgICBzZXZlcml0eTogJ21lZGl1bScsXG4gICAgICAgICAgICAgIHVzZXJJZDogYXVkaXRFdmVudC51c2VySWQsXG4gICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgJHtydWxlLm5hbWV9OiBSZXF1ZXN0ZWQgJHthdWRpdEV2ZW50LmRldGFpbHMubGltaXR9IHJlY29yZHNgLFxuICAgICAgICAgICAgICBkZXRhaWxzOiB7XG4gICAgICAgICAgICAgICAgcnVsZUlkOiBydWxlLnJ1bGVJZCxcbiAgICAgICAgICAgICAgICB0aHJlc2hvbGQ6IHJ1bGUuYWxlcnRUaHJlc2hvbGQsXG4gICAgICAgICAgICAgICAgYWN0dWFsQ291bnQ6IGF1ZGl0RXZlbnQuZGV0YWlscy5saW1pdCxcbiAgICAgICAgICAgICAgICBhY3Rpb25zOiBydWxlLmFjdGlvbnMsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICAgICAgICAgICAgc291cmNlOiAnY29tcGxpYW5jZV9lbmdpbmUnLFxuICAgICAgICAgICAgICByZXNvbHZlZDogZmFsc2UsXG4gICAgICAgICAgICAgIHR0bDogTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCkgKyAoMzY1ICogMjQgKiA2MCAqIDYwKSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcblxuICAgICAgICAvLyBBZGQgbW9yZSBydWxlIGltcGxlbWVudGF0aW9ucyBhcyBuZWVkZWRcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgY2hlY2tpbmcgY29tcGxpYW5jZSBydWxlICR7cnVsZS5ydWxlSWR9OmAsIGVycm9yKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdmlvbGF0aW9ucztcbn07XG5cbmNvbnN0IGNvdW50UmVjZW50RXZlbnRzID0gYXN5bmMgKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgYWN0aW9uOiBzdHJpbmcsXG4gIHRpbWVXaW5kb3dNczogbnVtYmVyXG4pOiBQcm9taXNlPG51bWJlcj4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHNpbmNlID0gRGF0ZS5ub3coKSAtIHRpbWVXaW5kb3dNcztcbiAgICBcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogQVVESVRfVEFCTEUsXG4gICAgICBJbmRleE5hbWU6ICd1c2VyLWF1ZGl0LWluZGV4JyxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd1c2VySWQgPSA6dXNlcklkIEFORCAjdGltZXN0YW1wID4gOnNpbmNlJyxcbiAgICAgIEZpbHRlckV4cHJlc3Npb246ICcjYWN0aW9uID0gOmFjdGlvbicsXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlTmFtZXM6IHtcbiAgICAgICAgJyN0aW1lc3RhbXAnOiAndGltZXN0YW1wJyxcbiAgICAgICAgJyNhY3Rpb24nOiAnYWN0aW9uJyxcbiAgICAgIH0sXG4gICAgICBFeHByZXNzaW9uQXR0cmlidXRlVmFsdWVzOiB7XG4gICAgICAgICc6dXNlcklkJzogdXNlcklkLFxuICAgICAgICAnOnNpbmNlJzogc2luY2UsXG4gICAgICAgICc6YWN0aW9uJzogYWN0aW9uLFxuICAgICAgfSxcbiAgICAgIFNlbGVjdDogJ0NPVU5UJyxcbiAgICB9KSk7XG5cbiAgICByZXR1cm4gcmVzdWx0LkNvdW50IHx8IDA7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgY291bnRpbmcgcmVjZW50IGV2ZW50czonLCBlcnJvcik7XG4gICAgcmV0dXJuIDA7XG4gIH1cbn07XG5cbmNvbnN0IGdlbmVyYXRlRGFpbHlBdWRpdFN1bW1hcnkgPSBhc3luYyAodXNlcklkOiBzdHJpbmcsIGRhdGU6IHN0cmluZyk6IFByb21pc2U8QXVkaXRTdW1tYXJ5PiA9PiB7XG4gIHRyeSB7XG4gICAgY29uc3Qgc3RhcnRPZkRheSA9IG5ldyBEYXRlKGRhdGUpLmdldFRpbWUoKTtcbiAgICBjb25zdCBlbmRPZkRheSA9IHN0YXJ0T2ZEYXkgKyAoMjQgKiA2MCAqIDYwICogMTAwMCk7XG5cbiAgICBjb25zdCBldmVudHMgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogQVVESVRfVEFCTEUsXG4gICAgICBJbmRleE5hbWU6ICd1c2VyLWF1ZGl0LWluZGV4JyxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd1c2VySWQgPSA6dXNlcklkIEFORCAjdGltZXN0YW1wIEJFVFdFRU4gOnN0YXJ0IEFORCA6ZW5kJyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczoge1xuICAgICAgICAnI3RpbWVzdGFtcCc6ICd0aW1lc3RhbXAnLFxuICAgICAgfSxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgJzp1c2VySWQnOiB1c2VySWQsXG4gICAgICAgICc6c3RhcnQnOiBzdGFydE9mRGF5LFxuICAgICAgICAnOmVuZCc6IGVuZE9mRGF5LFxuICAgICAgfSxcbiAgICB9KSk7XG5cbiAgICBjb25zdCBldmVudENvdW50cyA9IHtcbiAgICAgIGxvZ2luOiAwLFxuICAgICAgbG9nb3V0OiAwLFxuICAgICAgZGF0YUFjY2VzczogMCxcbiAgICAgIGRhdGFNb2RpZmljYXRpb246IDAsXG4gICAgICBhZG1pbkFjdGlvbnM6IDAsXG4gICAgICBzZWN1cml0eUV2ZW50czogMCxcbiAgICB9O1xuXG4gICAgY29uc3QgYW5vbWFsaWVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBldmVudCBvZiBldmVudHMuSXRlbXMgfHwgW10pIHtcbiAgICAgIGNvbnN0IGFjdGlvbiA9IGV2ZW50LmFjdGlvbjtcbiAgICAgIFxuICAgICAgaWYgKGFjdGlvbi5pbmNsdWRlcygnTE9HSU4nKSkgZXZlbnRDb3VudHMubG9naW4rKztcbiAgICAgIGVsc2UgaWYgKGFjdGlvbi5pbmNsdWRlcygnTE9HT1VUJykpIGV2ZW50Q291bnRzLmxvZ291dCsrO1xuICAgICAgZWxzZSBpZiAoYWN0aW9uLmluY2x1ZGVzKCdHRVRfJykgfHwgYWN0aW9uLmluY2x1ZGVzKCdTRUFSQ0hfJykpIGV2ZW50Q291bnRzLmRhdGFBY2Nlc3MrKztcbiAgICAgIGVsc2UgaWYgKGFjdGlvbi5pbmNsdWRlcygnVVBEQVRFXycpIHx8IGFjdGlvbi5pbmNsdWRlcygnQ1JFQVRFXycpIHx8IGFjdGlvbi5pbmNsdWRlcygnREVMRVRFXycpKSB7XG4gICAgICAgIGV2ZW50Q291bnRzLmRhdGFNb2RpZmljYXRpb24rKztcbiAgICAgICAgaWYgKGFjdGlvbi5pbmNsdWRlcygnQURNSU5fJykgfHwgYWN0aW9uLmluY2x1ZGVzKCdERUxFVEVfJykpIHtcbiAgICAgICAgICBldmVudENvdW50cy5hZG1pbkFjdGlvbnMrKztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBEZXRlY3QgYW5vbWFsaWVzXG4gICAgICBjb25zdCBob3VyID0gbmV3IERhdGUoZXZlbnQudGltZXN0YW1wKS5nZXRIb3VycygpO1xuICAgICAgaWYgKGhvdXIgPCA2IHx8IGhvdXIgPiAyMikge1xuICAgICAgICBhbm9tYWxpZXMucHVzaChgT2ZmLWhvdXJzIGFjdGl2aXR5OiAke2FjdGlvbn0gYXQgJHtuZXcgRGF0ZShldmVudC50aW1lc3RhbXApLnRvSVNPU3RyaW5nKCl9YCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2FsY3VsYXRlIGNvbXBsaWFuY2Ugc2NvcmUgKDAtMTAwKVxuICAgIGxldCBjb21wbGlhbmNlU2NvcmUgPSAxMDA7XG4gICAgaWYgKGV2ZW50Q291bnRzLmFkbWluQWN0aW9ucyA+IDEwKSBjb21wbGlhbmNlU2NvcmUgLT0gMTA7XG4gICAgaWYgKGFub21hbGllcy5sZW5ndGggPiA1KSBjb21wbGlhbmNlU2NvcmUgLT0gMjA7XG4gICAgaWYgKGV2ZW50Q291bnRzLmRhdGFBY2Nlc3MgPiAxMDAwKSBjb21wbGlhbmNlU2NvcmUgLT0gMTU7XG5cbiAgICByZXR1cm4ge1xuICAgICAgdXNlcklkLFxuICAgICAgZGF0ZSxcbiAgICAgIGV2ZW50Q291bnRzLFxuICAgICAgYW5vbWFsaWVzOiBhbm9tYWxpZXMuc2xpY2UoMCwgMTApLCAvLyBMaW1pdCB0byAxMCBhbm9tYWxpZXNcbiAgICAgIGNvbXBsaWFuY2VTY29yZTogTWF0aC5tYXgoMCwgY29tcGxpYW5jZVNjb3JlKSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGdlbmVyYXRpbmcgYXVkaXQgc3VtbWFyeTonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn07XG5cbmNvbnN0IHByb2Nlc3NBdWRpdEV2ZW50ID0gYXN5bmMgKGF1ZGl0RXZlbnQ6IGFueSk6IFByb21pc2U8dm9pZD4gPT4ge1xuICB0cnkge1xuICAgIC8vIENoZWNrIGZvciBzZWN1cml0eSBldmVudHNcbiAgICBjb25zdCBzZWN1cml0eUV2ZW50ID0gYW5hbHl6ZVNlY3VyaXR5RXZlbnQoYXVkaXRFdmVudCk7XG4gICAgaWYgKHNlY3VyaXR5RXZlbnQpIHtcbiAgICAgIC8vIFN0b3JlIHNlY3VyaXR5IGV2ZW50XG4gICAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogYCR7QVVESVRfVEFCTEV9LXNlY3VyaXR5YCxcbiAgICAgICAgSXRlbTogc2VjdXJpdHlFdmVudCxcbiAgICAgIH0pKTtcblxuICAgICAgLy8gU2VuZCBhbGVydCBpZiBoaWdoIHNldmVyaXR5XG4gICAgICBpZiAoc2VjdXJpdHlFdmVudC5zZXZlcml0eSA9PT0gJ2hpZ2gnIHx8IHNlY3VyaXR5RXZlbnQuc2V2ZXJpdHkgPT09ICdjcml0aWNhbCcpIHtcbiAgICAgICAgYXdhaXQgc25zQ2xpZW50LnNlbmQobmV3IFB1Ymxpc2hDb21tYW5kKHtcbiAgICAgICAgICBUb3BpY0FybjogTk9USUZJQ0FUSU9OX1RPUElDLFxuICAgICAgICAgIFN1YmplY3Q6IGBTZWN1cml0eSBBbGVydDogJHtzZWN1cml0eUV2ZW50LmRlc2NyaXB0aW9ufWAsXG4gICAgICAgICAgTWVzc2FnZTogSlNPTi5zdHJpbmdpZnkoc2VjdXJpdHlFdmVudCwgbnVsbCwgMiksXG4gICAgICAgIH0pKTtcbiAgICAgIH1cblxuICAgICAgLy8gUHVibGlzaCB0byBFdmVudEJyaWRnZVxuICAgICAgYXdhaXQgZXZlbnRCcmlkZ2VDbGllbnQuc2VuZChuZXcgUHV0RXZlbnRzQ29tbWFuZCh7XG4gICAgICAgIEVudHJpZXM6IFt7XG4gICAgICAgICAgU291cmNlOiAnZ292Yml6LnNlY3VyaXR5JyxcbiAgICAgICAgICBEZXRhaWxUeXBlOiAnU2VjdXJpdHkgRXZlbnQgRGV0ZWN0ZWQnLFxuICAgICAgICAgIERldGFpbDogSlNPTi5zdHJpbmdpZnkoc2VjdXJpdHlFdmVudCksXG4gICAgICAgICAgRXZlbnRCdXNOYW1lOiBFVkVOVF9CVVMsXG4gICAgICAgIH1dLFxuICAgICAgfSkpO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGNvbXBsaWFuY2UgdmlvbGF0aW9uc1xuICAgIGNvbnN0IHZpb2xhdGlvbnMgPSBhd2FpdCBjaGVja0NvbXBsaWFuY2VWaW9sYXRpb25zKGF1ZGl0RXZlbnQpO1xuICAgIGZvciAoY29uc3QgdmlvbGF0aW9uIG9mIHZpb2xhdGlvbnMpIHtcbiAgICAgIC8vIFN0b3JlIHZpb2xhdGlvblxuICAgICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IGAke0FVRElUX1RBQkxFfS1jb21wbGlhbmNlYCxcbiAgICAgICAgSXRlbTogdmlvbGF0aW9uLFxuICAgICAgfSkpO1xuXG4gICAgICAvLyBTZW5kIGFsZXJ0XG4gICAgICBhd2FpdCBzbnNDbGllbnQuc2VuZChuZXcgUHVibGlzaENvbW1hbmQoe1xuICAgICAgICBUb3BpY0FybjogTk9USUZJQ0FUSU9OX1RPUElDLFxuICAgICAgICBTdWJqZWN0OiBgQ29tcGxpYW5jZSBWaW9sYXRpb246ICR7dmlvbGF0aW9uLmRlc2NyaXB0aW9ufWAsXG4gICAgICAgIE1lc3NhZ2U6IEpTT04uc3RyaW5naWZ5KHZpb2xhdGlvbiwgbnVsbCwgMiksXG4gICAgICB9KSk7XG5cbiAgICAgIC8vIFB1Ymxpc2ggdG8gRXZlbnRCcmlkZ2VcbiAgICAgIGF3YWl0IGV2ZW50QnJpZGdlQ2xpZW50LnNlbmQobmV3IFB1dEV2ZW50c0NvbW1hbmQoe1xuICAgICAgICBFbnRyaWVzOiBbe1xuICAgICAgICAgIFNvdXJjZTogJ2dvdmJpei5jb21wbGlhbmNlJyxcbiAgICAgICAgICBEZXRhaWxUeXBlOiAnQ29tcGxpYW5jZSBWaW9sYXRpb24nLFxuICAgICAgICAgIERldGFpbDogSlNPTi5zdHJpbmdpZnkodmlvbGF0aW9uKSxcbiAgICAgICAgICBFdmVudEJ1c05hbWU6IEVWRU5UX0JVUyxcbiAgICAgICAgfV0sXG4gICAgICB9KSk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYFByb2Nlc3NlZCBhdWRpdCBldmVudCAke2F1ZGl0RXZlbnQuZXZlbnRJZH06ICR7c2VjdXJpdHlFdmVudCA/ICcxIHNlY3VyaXR5IGV2ZW50JyA6ICcwIHNlY3VyaXR5IGV2ZW50cyd9LCAke3Zpb2xhdGlvbnMubGVuZ3RofSB2aW9sYXRpb25zYCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgcHJvY2Vzc2luZyBhdWRpdCBldmVudDonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn07XG5cbmNvbnN0IHByb2Nlc3NEeW5hbW9EQlN0cmVhbSA9IGFzeW5jIChyZWNvcmQ6IGFueSk6IFByb21pc2U8dm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGlmIChyZWNvcmQuZXZlbnROYW1lID09PSAnSU5TRVJUJyB8fCByZWNvcmQuZXZlbnROYW1lID09PSAnTU9ESUZZJykge1xuICAgICAgY29uc3QgYXVkaXRFdmVudCA9IHJlY29yZC5keW5hbW9kYi5OZXdJbWFnZTtcbiAgICAgIFxuICAgICAgLy8gQ29udmVydCBEeW5hbW9EQiBmb3JtYXQgdG8gcmVndWxhciBvYmplY3RcbiAgICAgIGNvbnN0IHByb2Nlc3NlZEV2ZW50ID0ge1xuICAgICAgICBldmVudElkOiBhdWRpdEV2ZW50LmV2ZW50SWQ/LlMsXG4gICAgICAgIHVzZXJJZDogYXVkaXRFdmVudC51c2VySWQ/LlMsXG4gICAgICAgIGFjdGlvbjogYXVkaXRFdmVudC5hY3Rpb24/LlMsXG4gICAgICAgIHJlc291cmNlOiBhdWRpdEV2ZW50LnJlc291cmNlPy5TLFxuICAgICAgICB0aW1lc3RhbXA6IGF1ZGl0RXZlbnQudGltZXN0YW1wPy5OID8gcGFyc2VJbnQoYXVkaXRFdmVudC50aW1lc3RhbXAuTikgOiBEYXRlLm5vdygpLFxuICAgICAgICBkZXRhaWxzOiBhdWRpdEV2ZW50LmRldGFpbHM/Lk0gPyBKU09OLnBhcnNlKGF1ZGl0RXZlbnQuZGV0YWlscy5NKSA6IHt9LFxuICAgICAgICBpcEFkZHJlc3M6IGF1ZGl0RXZlbnQuaXBBZGRyZXNzPy5TLFxuICAgICAgICB1c2VyQWdlbnQ6IGF1ZGl0RXZlbnQudXNlckFnZW50Py5TLFxuICAgICAgfTtcblxuICAgICAgYXdhaXQgcHJvY2Vzc0F1ZGl0RXZlbnQocHJvY2Vzc2VkRXZlbnQpO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBwcm9jZXNzaW5nIER5bmFtb0RCIHN0cmVhbSByZWNvcmQ6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59O1xuXG4vLyBNYWluIGhhbmRsZXJcbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogU1FTRXZlbnQgfCBEeW5hbW9EQlN0cmVhbUV2ZW50LFxuICBjb250ZXh0OiBDb250ZXh0XG4pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc29sZS5sb2coJ0V2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG5cbiAgdHJ5IHtcbiAgICAvLyBIYW5kbGUgU1FTIGV2ZW50c1xuICAgIGlmICgnUmVjb3JkcycgaW4gZXZlbnQgJiYgZXZlbnQuUmVjb3Jkc1swXT8uZXZlbnRTb3VyY2UgPT09ICdhd3M6c3FzJykge1xuICAgICAgY29uc3Qgc3FzRXZlbnQgPSBldmVudCBhcyBTUVNFdmVudDtcbiAgICAgIFxuICAgICAgZm9yIChjb25zdCByZWNvcmQgb2Ygc3FzRXZlbnQuUmVjb3Jkcykge1xuICAgICAgICBjb25zdCBtZXNzYWdlQm9keSA9IEpTT04ucGFyc2UocmVjb3JkLmJvZHkpO1xuICAgICAgICBcbiAgICAgICAgc3dpdGNoIChtZXNzYWdlQm9keS50eXBlKSB7XG4gICAgICAgICAgY2FzZSAnYXVkaXRfZXZlbnQnOlxuICAgICAgICAgICAgYXdhaXQgcHJvY2Vzc0F1ZGl0RXZlbnQobWVzc2FnZUJvZHkuZGF0YSk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIGNhc2UgJ2dlbmVyYXRlX2RhaWx5X3N1bW1hcnknOlxuICAgICAgICAgICAgY29uc3Qgc3VtbWFyeSA9IGF3YWl0IGdlbmVyYXRlRGFpbHlBdWRpdFN1bW1hcnkoXG4gICAgICAgICAgICAgIG1lc3NhZ2VCb2R5LmRhdGEudXNlcklkLFxuICAgICAgICAgICAgICBtZXNzYWdlQm9keS5kYXRhLmRhdGVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFN0b3JlIHN1bW1hcnlcbiAgICAgICAgICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgICAgICAgVGFibGVOYW1lOiBgJHtBVURJVF9UQUJMRX0tc3VtbWFyaWVzYCxcbiAgICAgICAgICAgICAgSXRlbToge1xuICAgICAgICAgICAgICAgIC4uLnN1bW1hcnksXG4gICAgICAgICAgICAgICAgc3VtbWFyeUlkOiBgJHtzdW1tYXJ5LnVzZXJJZH0tJHtzdW1tYXJ5LmRhdGV9YCxcbiAgICAgICAgICAgICAgICBnZW5lcmF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSkpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdVbmtub3duIG1lc3NhZ2UgdHlwZTonLCBtZXNzYWdlQm9keS50eXBlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEhhbmRsZSBEeW5hbW9EQiBzdHJlYW0gZXZlbnRzXG4gICAgaWYgKCdSZWNvcmRzJyBpbiBldmVudCAmJiBldmVudC5SZWNvcmRzWzBdPy5ldmVudFNvdXJjZSA9PT0gJ2F3czpkeW5hbW9kYicpIHtcbiAgICAgIGNvbnN0IHN0cmVhbUV2ZW50ID0gZXZlbnQgYXMgRHluYW1vREJTdHJlYW1FdmVudDtcbiAgICAgIFxuICAgICAgZm9yIChjb25zdCByZWNvcmQgb2Ygc3RyZWFtRXZlbnQuUmVjb3Jkcykge1xuICAgICAgICBhd2FpdCBwcm9jZXNzRHluYW1vREJTdHJlYW0ocmVjb3JkKTtcbiAgICAgIH1cbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignSGFuZGxlciBlcnJvcjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn07Il19