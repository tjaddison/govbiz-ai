"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
const client_sns_1 = require("@aws-sdk/client-sns");
const axios_1 = __importDefault(require("axios"));
// Initialize AWS clients
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new client_sqs_1.SQSClient({});
const eventBridgeClient = new client_eventbridge_1.EventBridgeClient({});
const snsClient = new client_sns_1.SNSClient({});
// Environment variables
const { OPPORTUNITY_TABLE, USER_TABLE, EVENT_BUS, MESSAGE_QUEUE, NOTIFICATION_TOPIC, } = process.env;
// SAM.gov API configuration
const SAM_GOV_API_BASE = 'https://api.sam.gov/prod/opportunities/v2/search';
const SAM_GOV_API_KEY = process.env.SAM_GOV_API_KEY;
// Utility functions
const fetchSourcesSoughtOpportunities = async (page = 1, limit = 100) => {
    try {
        const params = new URLSearchParams({
            api_key: SAM_GOV_API_KEY || '',
            limit: limit.toString(),
            offset: ((page - 1) * limit).toString(),
            noticeType: 'presol', // Sources Sought notice type
            active: 'true',
            orderBy: 'modifiedDate',
            orderDirection: 'desc',
        });
        const response = await axios_1.default.get(`${SAM_GOV_API_BASE}?${params.toString()}`, {
            timeout: 30000,
            headers: {
                'User-Agent': 'GovBiz.ai Opportunity Monitor',
                'Accept': 'application/json',
            },
        });
        return response.data;
    }
    catch (error) {
        console.error('Error fetching from SAM.gov:', error);
        throw error;
    }
};
const checkOpportunityExists = async (noticeId) => {
    var _a;
    try {
        const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: OPPORTUNITY_TABLE,
            KeyConditionExpression: 'opportunityId = :opportunityId',
            ExpressionAttributeValues: {
                ':opportunityId': noticeId,
            },
        }));
        return (((_a = result.Items) === null || _a === void 0 ? void 0 : _a.length) || 0) > 0;
    }
    catch (error) {
        console.error('Error checking opportunity existence:', error);
        return false;
    }
};
const processNewOpportunity = async (opportunity) => {
    try {
        // Queue for detailed processing
        await sqsClient.send(new client_sqs_1.SendMessageCommand({
            QueueUrl: MESSAGE_QUEUE,
            MessageBody: JSON.stringify({
                type: 'sam_gov_data',
                data: opportunity,
                timestamp: new Date().toISOString(),
            }),
        }));
        // Publish to EventBridge
        await eventBridgeClient.send(new client_eventbridge_1.PutEventsCommand({
            Entries: [{
                    Source: 'govbiz.monitor',
                    DetailType: 'New Opportunity Detected',
                    Detail: JSON.stringify({
                        opportunityId: opportunity.noticeId,
                        title: opportunity.title,
                        agency: opportunity.department,
                        naicsCode: opportunity.naicsCode,
                        responseDeadline: opportunity.responseDeadline,
                        detectedAt: new Date().toISOString(),
                    }),
                    EventBusName: EVENT_BUS,
                }],
        }));
        console.log(`Queued new opportunity: ${opportunity.noticeId}`);
    }
    catch (error) {
        console.error('Error processing new opportunity:', error);
        throw error;
    }
};
const updateOpportunityStatus = async () => {
    var _a;
    try {
        // Check for expired opportunities
        const now = new Date().toISOString();
        const expiredOpportunities = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: OPPORTUNITY_TABLE,
            IndexName: 'status-index',
            KeyConditionExpression: '#status = :status',
            FilterExpression: 'responseDeadline < :now',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':status': 'active',
                ':now': now,
            },
        }));
        for (const opportunity of expiredOpportunities.Items || []) {
            await sqsClient.send(new client_sqs_1.SendMessageCommand({
                QueueUrl: MESSAGE_QUEUE,
                MessageBody: JSON.stringify({
                    type: 'opportunity_update',
                    data: {
                        opportunityId: opportunity.opportunityId,
                        status: 'expired',
                    },
                }),
            }));
        }
        console.log(`Marked ${((_a = expiredOpportunities.Items) === null || _a === void 0 ? void 0 : _a.length) || 0} opportunities as expired`);
    }
    catch (error) {
        console.error('Error updating opportunity status:', error);
        throw error;
    }
};
const generateDailyReport = async () => {
    var _a;
    try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        // Query opportunities created in the last 24 hours
        const recentOpportunities = await docClient.send(new lib_dynamodb_1.QueryCommand({
            TableName: OPPORTUNITY_TABLE,
            IndexName: 'status-index',
            KeyConditionExpression: '#status = :status',
            FilterExpression: 'createdAt > :yesterday',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':status': 'active',
                ':yesterday': yesterday,
            },
        }));
        const report = {
            date: new Date().toISOString().split('T')[0],
            newOpportunities: ((_a = recentOpportunities.Items) === null || _a === void 0 ? void 0 : _a.length) || 0,
            totalActiveOpportunities: 0, // Would need separate query
            topAgencies: {}, // Would need aggregation
            topNAICS: {}, // Would need aggregation
            generatedAt: new Date().toISOString(),
        };
        // Publish daily report
        await snsClient.send(new client_sns_1.PublishCommand({
            TopicArn: NOTIFICATION_TOPIC,
            Subject: 'GovBiz.ai Daily Opportunity Report',
            Message: JSON.stringify(report, null, 2),
        }));
        console.log('Daily report generated and published');
    }
    catch (error) {
        console.error('Error generating daily report:', error);
        throw error;
    }
};
const monitorOpportunities = async () => {
    const stats = {
        totalOpportunities: 0,
        newOpportunities: 0,
        updatedOpportunities: 0,
        expiredOpportunities: 0,
        processedAt: new Date().toISOString(),
        errors: [],
    };
    try {
        let page = 1;
        let hasMore = true;
        const pageSize = 100;
        while (hasMore) {
            try {
                const response = await fetchSourcesSoughtOpportunities(page, pageSize);
                stats.totalOpportunities += response.opportunitiesData.length;
                for (const opportunity of response.opportunitiesData) {
                    try {
                        const exists = await checkOpportunityExists(opportunity.noticeId);
                        if (!exists) {
                            await processNewOpportunity(opportunity);
                            stats.newOpportunities++;
                        }
                    }
                    catch (error) {
                        console.error(`Error processing opportunity ${opportunity.noticeId}:`, error);
                        stats.errors.push(`Error processing ${opportunity.noticeId}: ${error}`);
                    }
                }
                // Check if there are more pages
                hasMore = response.links.next !== undefined && response.opportunitiesData.length === pageSize;
                page++;
                // Rate limiting - avoid overwhelming SAM.gov
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            catch (error) {
                console.error(`Error fetching page ${page}:`, error);
                stats.errors.push(`Error fetching page ${page}: ${error}`);
                hasMore = false;
            }
        }
        // Update expired opportunities
        await updateOpportunityStatus();
        // Generate daily report if it's a new day
        const hour = new Date().getHours();
        if (hour === 6) { // 6 AM daily report
            await generateDailyReport();
        }
        return stats;
    }
    catch (error) {
        console.error('Error in monitoring process:', error);
        stats.errors.push(`Monitoring error: ${error}`);
        return stats;
    }
};
// Main handler
const handler = async (event, context) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    try {
        const stats = await monitorOpportunities();
        // Store monitoring stats
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: `${OPPORTUNITY_TABLE}-stats`,
            Item: {
                date: new Date().toISOString().split('T')[0],
                timestamp: stats.processedAt,
                ...stats,
            },
        }));
        // Publish monitoring results
        await eventBridgeClient.send(new client_eventbridge_1.PutEventsCommand({
            Entries: [{
                    Source: 'govbiz.monitor',
                    DetailType: 'Monitoring Completed',
                    Detail: JSON.stringify(stats),
                    EventBusName: EVENT_BUS,
                }],
        }));
        console.log('Monitoring completed:', stats);
        // Alert on errors
        if (stats.errors.length > 0) {
            await snsClient.send(new client_sns_1.PublishCommand({
                TopicArn: NOTIFICATION_TOPIC,
                Subject: 'GovBiz.ai Monitoring Errors',
                Message: JSON.stringify({
                    errors: stats.errors,
                    timestamp: stats.processedAt,
                }, null, 2),
            }));
        }
    }
    catch (error) {
        console.error('Handler error:', error);
        // Send alert for critical errors
        await snsClient.send(new client_sns_1.PublishCommand({
            TopicArn: NOTIFICATION_TOPIC,
            Subject: 'GovBiz.ai Critical Monitoring Error',
            Message: JSON.stringify({
                error: error.toString(),
                timestamp: new Date().toISOString(),
                context: context.awsRequestId,
            }, null, 2),
        }));
        throw error;
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBQXNHO0FBQ3RHLG9EQUFvRTtBQUNwRSxvRUFBa0Y7QUFDbEYsb0RBQWdFO0FBQ2hFLGtEQUEwQjtBQUUxQix5QkFBeUI7QUFDekIsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzVDLE1BQU0sU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUM1RCxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDcEMsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLHNDQUFpQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3BELE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUVwQyx3QkFBd0I7QUFDeEIsTUFBTSxFQUNKLGlCQUFpQixFQUNqQixVQUFVLEVBQ1YsU0FBUyxFQUNULGFBQWEsRUFDYixrQkFBa0IsR0FDbkIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDO0FBaURoQiw0QkFBNEI7QUFDNUIsTUFBTSxnQkFBZ0IsR0FBRyxrREFBa0QsQ0FBQztBQUM1RSxNQUFNLGVBQWUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQztBQUVwRCxvQkFBb0I7QUFDcEIsTUFBTSwrQkFBK0IsR0FBRyxLQUFLLEVBQzNDLE9BQWUsQ0FBQyxFQUNoQixRQUFnQixHQUFHLEVBQ00sRUFBRTtJQUMzQixJQUFJLENBQUM7UUFDSCxNQUFNLE1BQU0sR0FBRyxJQUFJLGVBQWUsQ0FBQztZQUNqQyxPQUFPLEVBQUUsZUFBZSxJQUFJLEVBQUU7WUFDOUIsS0FBSyxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUU7WUFDdkIsTUFBTSxFQUFFLENBQUMsQ0FBQyxJQUFJ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LFNBQVMsQ0FBQztnQkFDdEIsS0FBSyxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUU7Z0JBQ3ZCLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtnQkFDbkMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxZQUFZO2FBQzlCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztTQUNaLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBdkRXLFFBQUEsT0FBTyxXQXVEbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTY2hlZHVsZWRFdmVudCwgQ29udGV4dCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgU2NhbkNvbW1hbmQsIFB1dENvbW1hbmQsIFF1ZXJ5Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBTUVNDbGllbnQsIFNlbmRNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuaW1wb3J0IHsgRXZlbnRCcmlkZ2VDbGllbnQsIFB1dEV2ZW50c0NvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZXZlbnRicmlkZ2UnO1xuaW1wb3J0IHsgU05TQ2xpZW50LCBQdWJsaXNoQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zbnMnO1xuaW1wb3J0IGF4aW9zIGZyb20gJ2F4aW9zJztcblxuLy8gSW5pdGlhbGl6ZSBBV1MgY2xpZW50c1xuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xuY29uc3Qgc3FzQ2xpZW50ID0gbmV3IFNRU0NsaWVudCh7fSk7XG5jb25zdCBldmVudEJyaWRnZUNsaWVudCA9IG5ldyBFdmVudEJyaWRnZUNsaWVudCh7fSk7XG5jb25zdCBzbnNDbGllbnQgPSBuZXcgU05TQ2xpZW50KHt9KTtcblxuLy8gRW52aXJvbm1lbnQgdmFyaWFibGVzXG5jb25zdCB7XG4gIE9QUE9SVFVOSVRZX1RBQkxFLFxuICBVU0VSX1RBQkxFLFxuICBFVkVOVF9CVVMsXG4gIE1FU1NBR0VfUVVFVUUsXG4gIE5PVElGSUNBVElPTl9UT1BJQyxcbn0gPSBwcm9jZXNzLmVudjtcblxuLy8gVHlwZXNcbmludGVyZmFjZSBTQU1Hb3ZSZXNwb25zZSB7XG4gIG9wcG9ydHVuaXRpZXNEYXRhOiBTQU1Hb3ZPcHBvcnR1bml0eVtdO1xuICB0b3RhbFJlY29yZHM6IG51bWJlcjtcbiAgbGlua3M6IHtcbiAgICBzZWxmOiBzdHJpbmc7XG4gICAgbmV4dD86IHN0cmluZztcbiAgfTtcbn1cblxuaW50ZXJmYWNlIFNBTUdvdk9wcG9ydHVuaXR5IHtcbiAgbm90aWNlSWQ6IHN0cmluZztcbiAgdGl0bGU6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZGVwYXJ0bWVudDogc3RyaW5nO1xuICBvZmZpY2U6IHN0cmluZztcbiAgbmFpY3NDb2RlOiBzdHJpbmc7XG4gIG5haWNzRGVzY3JpcHRpb246IHN0cmluZztcbiAgc2V0QXNpZGU/OiBzdHJpbmc7XG4gIHBvc3RlZERhdGU6IHN0cmluZztcbiAgcmVzcG9uc2VEZWFkbGluZTogc3RyaW5nO1xuICBwb2ludE9mQ29udGFjdDoge1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBlbWFpbDogc3RyaW5nO1xuICAgIHBob25lPzogc3RyaW5nO1xuICB9O1xuICB1aUxpbms6IHN0cmluZztcbiAgYWRkaXRpb25hbEluZm9MaW5rPzogc3RyaW5nO1xuICBhdHRhY2htZW50cz86IHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgdXJsOiBzdHJpbmc7XG4gIH1bXTtcbiAgc29saWNpdGF0aW9uTnVtYmVyPzogc3RyaW5nO1xuICBlc3RpbWF0ZWRWYWx1ZT86IHN0cmluZztcbiAgcGxhY2VPZlBlcmZvcm1hbmNlPzogc3RyaW5nO1xuICBrZXl3b3Jkcz86IHN0cmluZ1tdO1xufVxuXG5pbnRlcmZhY2UgTW9uaXRvcmluZ1N0YXRzIHtcbiAgdG90YWxPcHBvcnR1bml0aWVzOiBudW1iZXI7XG4gIG5ld09wcG9ydHVuaXRpZXM6IG51bWJlcjtcbiAgdXBkYXRlZE9wcG9ydHVuaXRpZXM6IG51bWJlcjtcbiAgZXhwaXJlZE9wcG9ydHVuaXRpZXM6IG51bWJlcjtcbiAgcHJvY2Vzc2VkQXQ6IHN0cmluZztcbiAgZXJyb3JzOiBzdHJpbmdbXTtcbn1cblxuLy8gU0FNLmdvdiBBUEkgY29uZmlndXJhdGlvblxuY29uc3QgU0FNX0dPVl9BUElfQkFTRSA9ICdodHRwczovL2FwaS5zYW0uZ292L3Byb2Qvb3Bwb3J0dW5pdGllcy92Mi9zZWFyY2gnO1xuY29uc3QgU0FNX0dPVl9BUElfS0VZID0gcHJvY2Vzcy5lbnYuU0FNX0dPVl9BUElfS0VZO1xuXG4vLyBVdGlsaXR5IGZ1bmN0aW9uc1xuY29uc3QgZmV0Y2hTb3VyY2VzU291Z2h0T3Bwb3J0dW5pdGllcyA9IGFzeW5jIChcbiAgcGFnZTogbnVtYmVyID0gMSxcbiAgbGltaXQ6IG51bWJlciA9IDEwMFxuKTogUHJvbWlzZTxTQU1Hb3ZSZXNwb25zZT4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoe1xuICAgICAgYXBpX2tleTogU0FNX0dPVl9BUElfS0VZIHx8ICcnLFxuICAgICAgbGltaXQ6IGxpbWl0LnRvU3RyaW5nKCksXG4gICAgICBvZmZzZXQ6ICgocGFnZSAtIDEpICogbGltaXQpLnRvU3RyaW5nKCksXG4gICAgICBub3RpY2VUeXBlOiAncHJlc29sJywgLy8gU291cmNlcyBTb3VnaHQgbm90aWNlIHR5cGVcbiAgICAgIGFjdGl2ZTogJ3RydWUnLFxuICAgICAgb3JkZXJCeTogJ21vZGlmaWVkRGF0ZScsXG4gICAgICBvcmRlckRpcmVjdGlvbjogJ2Rlc2MnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBheGlvcy5nZXQoYCR7U0FNX0dPVl9BUElfQkFTRX0/JHtwYXJhbXMudG9TdHJpbmcoKX1gLCB7XG4gICAgICB0aW1lb3V0OiAzMDAwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ1VzZXItQWdlbnQnOiAnR292Qml6LmFpIE9wcG9ydHVuaXR5IE1vbml0b3InLFxuICAgICAgICAnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHJldHVybiByZXNwb25zZS5kYXRhO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGZldGNoaW5nIGZyb20gU0FNLmdvdjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn07XG5cbmNvbnN0IGNoZWNrT3Bwb3J0dW5pdHlFeGlzdHMgPSBhc3luYyAobm90aWNlSWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBPUFBPUlRVTklUWV9UQUJMRSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICdvcHBvcnR1bml0eUlkID0gOm9wcG9ydHVuaXR5SWQnLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAnOm9wcG9ydHVuaXR5SWQnOiBub3RpY2VJZCxcbiAgICAgIH0sXG4gICAgfSkpO1xuXG4gICAgcmV0dXJuIChyZXN1bHQuSXRlbXM/Lmxlbmd0aCB8fCAwKSA+IDA7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgY2hlY2tpbmcgb3Bwb3J0dW5pdHkgZXhpc3RlbmNlOicsIGVycm9yKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn07XG5cbmNvbnN0IHByb2Nlc3NOZXdPcHBvcnR1bml0eSA9IGFzeW5jIChvcHBvcnR1bml0eTogU0FNR292T3Bwb3J0dW5pdHkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICAvLyBRdWV1ZSBmb3IgZGV0YWlsZWQgcHJvY2Vzc2luZ1xuICAgIGF3YWl0IHNxc0NsaWVudC5zZW5kKG5ldyBTZW5kTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgUXVldWVVcmw6IE1FU1NBR0VfUVVFVUUsXG4gICAgICBNZXNzYWdlQm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICB0eXBlOiAnc2FtX2dvdl9kYXRhJyxcbiAgICAgICAgZGF0YTogb3Bwb3J0dW5pdHksXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfSksXG4gICAgfSkpO1xuXG4gICAgLy8gUHVibGlzaCB0byBFdmVudEJyaWRnZVxuICAgIGF3YWl0IGV2ZW50QnJpZGdlQ2xpZW50LnNlbmQobmV3IFB1dEV2ZW50c0NvbW1hbmQoe1xuICAgICAgRW50cmllczogW3tcbiAgICAgICAgU291cmNlOiAnZ292Yml6Lm1vbml0b3InLFxuICAgICAgICBEZXRhaWxUeXBlOiAnTmV3IE9wcG9ydHVuaXR5IERldGVjdGVkJyxcbiAgICAgICAgRGV0YWlsOiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgb3Bwb3J0dW5pdHlJZDogb3Bwb3J0dW5pdHkubm90aWNlSWQsXG4gICAgICAgICAgdGl0bGU6IG9wcG9ydHVuaXR5LnRpdGxlLFxuICAgICAgICAgIGFnZW5jeTogb3Bwb3J0dW5pdHkuZGVwYXJ0bWVudCxcbiAgICAgICAgICBuYWljc0NvZGU6IG9wcG9ydHVuaXR5Lm5haWNzQ29kZSxcbiAgICAgICAgICByZXNwb25zZURlYWRsaW5lOiBvcHBvcnR1bml0eS5yZXNwb25zZURlYWRsaW5lLFxuICAgICAgICAgIGRldGVjdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSksXG4gICAgICAgIEV2ZW50QnVzTmFtZTogRVZFTlRfQlVTLFxuICAgICAgfV0sXG4gICAgfSkpO1xuXG4gICAgY29uc29sZS5sb2coYFF1ZXVlZCBuZXcgb3Bwb3J0dW5pdHk6ICR7b3Bwb3J0dW5pdHkubm90aWNlSWR9YCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgcHJvY2Vzc2luZyBuZXcgb3Bwb3J0dW5pdHk6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59O1xuXG5jb25zdCB1cGRhdGVPcHBvcnR1bml0eVN0YXR1cyA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgdHJ5IHtcbiAgICAvLyBDaGVjayBmb3IgZXhwaXJlZCBvcHBvcnR1bml0aWVzXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgIFxuICAgIGNvbnN0IGV4cGlyZWRPcHBvcnR1bml0aWVzID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IE9QUE9SVFVOSVRZX1RBQkxFLFxuICAgICAgSW5kZXhOYW1lOiAnc3RhdHVzLWluZGV4JyxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICcjc3RhdHVzID0gOnN0YXR1cycsXG4gICAgICBGaWx0ZXJFeHByZXNzaW9uOiAncmVzcG9uc2VEZWFkbGluZSA8IDpub3cnLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7XG4gICAgICAgICcjc3RhdHVzJzogJ3N0YXR1cycsXG4gICAgICB9LFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAnOnN0YXR1cyc6ICdhY3RpdmUnLFxuICAgICAgICAnOm5vdyc6IG5vdyxcbiAgICAgIH0sXG4gICAgfSkpO1xuXG4gICAgZm9yIChjb25zdCBvcHBvcnR1bml0eSBvZiBleHBpcmVkT3Bwb3J0dW5pdGllcy5JdGVtcyB8fCBbXSkge1xuICAgICAgYXdhaXQgc3FzQ2xpZW50LnNlbmQobmV3IFNlbmRNZXNzYWdlQ29tbWFuZCh7XG4gICAgICAgIFF1ZXVlVXJsOiBNRVNTQUdFX1FVRVVFLFxuICAgICAgICBNZXNzYWdlQm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHR5cGU6ICdvcHBvcnR1bml0eV91cGRhdGUnLFxuICAgICAgICAgIGRhdGE6IHtcbiAgICAgICAgICAgIG9wcG9ydHVuaXR5SWQ6IG9wcG9ydHVuaXR5Lm9wcG9ydHVuaXR5SWQsXG4gICAgICAgICAgICBzdGF0dXM6ICdleHBpcmVkJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgTWFya2VkICR7ZXhwaXJlZE9wcG9ydHVuaXRpZXMuSXRlbXM/Lmxlbmd0aCB8fCAwfSBvcHBvcnR1bml0aWVzIGFzIGV4cGlyZWRgKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciB1cGRhdGluZyBvcHBvcnR1bml0eSBzdGF0dXM6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59O1xuXG5jb25zdCBnZW5lcmF0ZURhaWx5UmVwb3J0ID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHllc3RlcmRheSA9IG5ldyBEYXRlKERhdGUubm93KCkgLSAyNCAqIDYwICogNjAgKiAxMDAwKS50b0lTT1N0cmluZygpO1xuICAgIFxuICAgIC8vIFF1ZXJ5IG9wcG9ydHVuaXRpZXMgY3JlYXRlZCBpbiB0aGUgbGFzdCAyNCBob3Vyc1xuICAgIGNvbnN0IHJlY2VudE9wcG9ydHVuaXRpZXMgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogT1BQT1JUVU5JVFlfVEFCTEUsXG4gICAgICBJbmRleE5hbWU6ICdzdGF0dXMtaW5kZXgnLFxuICAgICAgS2V5Q29uZGl0aW9uRXhwcmVzc2lvbjogJyNzdGF0dXMgPSA6c3RhdHVzJyxcbiAgICAgIEZpbHRlckV4cHJlc3Npb246ICdjcmVhdGVkQXQgPiA6eWVzdGVyZGF5JyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVOYW1lczoge1xuICAgICAgICAnI3N0YXR1cyc6ICdzdGF0dXMnLFxuICAgICAgfSxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgJzpzdGF0dXMnOiAnYWN0aXZlJyxcbiAgICAgICAgJzp5ZXN0ZXJkYXknOiB5ZXN0ZXJkYXksXG4gICAgICB9LFxuICAgIH0pKTtcblxuICAgIGNvbnN0IHJlcG9ydCA9IHtcbiAgICAgIGRhdGU6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdLFxuICAgICAgbmV3T3Bwb3J0dW5pdGllczogcmVjZW50T3Bwb3J0dW5pdGllcy5JdGVtcz8ubGVuZ3RoIHx8IDAsXG4gICAgICB0b3RhbEFjdGl2ZU9wcG9ydHVuaXRpZXM6IDAsIC8vIFdvdWxkIG5lZWQgc2VwYXJhdGUgcXVlcnlcbiAgICAgIHRvcEFnZW5jaWVzOiB7fSwgLy8gV291bGQgbmVlZCBhZ2dyZWdhdGlvblxuICAgICAgdG9wTkFJQ1M6IHt9LCAvLyBXb3VsZCBuZWVkIGFnZ3JlZ2F0aW9uXG4gICAgICBnZW5lcmF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgIH07XG5cbiAgICAvLyBQdWJsaXNoIGRhaWx5IHJlcG9ydFxuICAgIGF3YWl0IHNuc0NsaWVudC5zZW5kKG5ldyBQdWJsaXNoQ29tbWFuZCh7XG4gICAgICBUb3BpY0FybjogTk9USUZJQ0FUSU9OX1RPUElDLFxuICAgICAgU3ViamVjdDogJ0dvdkJpei5haSBEYWlseSBPcHBvcnR1bml0eSBSZXBvcnQnLFxuICAgICAgTWVzc2FnZTogSlNPTi5zdHJpbmdpZnkocmVwb3J0LCBudWxsLCAyKSxcbiAgICB9KSk7XG5cbiAgICBjb25zb2xlLmxvZygnRGFpbHkgcmVwb3J0IGdlbmVyYXRlZCBhbmQgcHVibGlzaGVkJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgZ2VuZXJhdGluZyBkYWlseSByZXBvcnQ6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59O1xuXG5jb25zdCBtb25pdG9yT3Bwb3J0dW5pdGllcyA9IGFzeW5jICgpOiBQcm9taXNlPE1vbml0b3JpbmdTdGF0cz4gPT4ge1xuICBjb25zdCBzdGF0czogTW9uaXRvcmluZ1N0YXRzID0ge1xuICAgIHRvdGFsT3Bwb3J0dW5pdGllczogMCxcbiAgICBuZXdPcHBvcnR1bml0aWVzOiAwLFxuICAgIHVwZGF0ZWRPcHBvcnR1bml0aWVzOiAwLFxuICAgIGV4cGlyZWRPcHBvcnR1bml0aWVzOiAwLFxuICAgIHByb2Nlc3NlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgZXJyb3JzOiBbXSxcbiAgfTtcblxuICB0cnkge1xuICAgIGxldCBwYWdlID0gMTtcbiAgICBsZXQgaGFzTW9yZSA9IHRydWU7XG4gICAgY29uc3QgcGFnZVNpemUgPSAxMDA7XG5cbiAgICB3aGlsZSAoaGFzTW9yZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaFNvdXJjZXNTb3VnaHRPcHBvcnR1bml0aWVzKHBhZ2UsIHBhZ2VTaXplKTtcbiAgICAgICAgc3RhdHMudG90YWxPcHBvcnR1bml0aWVzICs9IHJlc3BvbnNlLm9wcG9ydHVuaXRpZXNEYXRhLmxlbmd0aDtcblxuICAgICAgICBmb3IgKGNvbnN0IG9wcG9ydHVuaXR5IG9mIHJlc3BvbnNlLm9wcG9ydHVuaXRpZXNEYXRhKSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGV4aXN0cyA9IGF3YWl0IGNoZWNrT3Bwb3J0dW5pdHlFeGlzdHMob3Bwb3J0dW5pdHkubm90aWNlSWQpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoIWV4aXN0cykge1xuICAgICAgICAgICAgICBhd2FpdCBwcm9jZXNzTmV3T3Bwb3J0dW5pdHkob3Bwb3J0dW5pdHkpO1xuICAgICAgICAgICAgICBzdGF0cy5uZXdPcHBvcnR1bml0aWVzKys7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIHByb2Nlc3Npbmcgb3Bwb3J0dW5pdHkgJHtvcHBvcnR1bml0eS5ub3RpY2VJZH06YCwgZXJyb3IpO1xuICAgICAgICAgICAgc3RhdHMuZXJyb3JzLnB1c2goYEVycm9yIHByb2Nlc3NpbmcgJHtvcHBvcnR1bml0eS5ub3RpY2VJZH06ICR7ZXJyb3J9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlcmUgYXJlIG1vcmUgcGFnZXNcbiAgICAgICAgaGFzTW9yZSA9IHJlc3BvbnNlLmxpbmtzLm5leHQgIT09IHVuZGVmaW5lZCAmJiByZXNwb25zZS5vcHBvcnR1bml0aWVzRGF0YS5sZW5ndGggPT09IHBhZ2VTaXplO1xuICAgICAgICBwYWdlKys7XG5cbiAgICAgICAgLy8gUmF0ZSBsaW1pdGluZyAtIGF2b2lkIG92ZXJ3aGVsbWluZyBTQU0uZ292XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwKSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBmZXRjaGluZyBwYWdlICR7cGFnZX06YCwgZXJyb3IpO1xuICAgICAgICBzdGF0cy5lcnJvcnMucHVzaChgRXJyb3IgZmV0Y2hpbmcgcGFnZSAke3BhZ2V9OiAke2Vycm9yfWApO1xuICAgICAgICBoYXNNb3JlID0gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIGV4cGlyZWQgb3Bwb3J0dW5pdGllc1xuICAgIGF3YWl0IHVwZGF0ZU9wcG9ydHVuaXR5U3RhdHVzKCk7XG5cbiAgICAvLyBHZW5lcmF0ZSBkYWlseSByZXBvcnQgaWYgaXQncyBhIG5ldyBkYXlcbiAgICBjb25zdCBob3VyID0gbmV3IERhdGUoKS5nZXRIb3VycygpO1xuICAgIGlmIChob3VyID09PSA2KSB7IC8vIDYgQU0gZGFpbHkgcmVwb3J0XG4gICAgICBhd2FpdCBnZW5lcmF0ZURhaWx5UmVwb3J0KCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHN0YXRzO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGluIG1vbml0b3JpbmcgcHJvY2VzczonLCBlcnJvcik7XG4gICAgc3RhdHMuZXJyb3JzLnB1c2goYE1vbml0b3JpbmcgZXJyb3I6ICR7ZXJyb3J9YCk7XG4gICAgcmV0dXJuIHN0YXRzO1xuICB9XG59O1xuXG4vLyBNYWluIGhhbmRsZXJcbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBTY2hlZHVsZWRFdmVudCwgY29udGV4dDogQ29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZygnRXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcblxuICB0cnkge1xuICAgIGNvbnN0IHN0YXRzID0gYXdhaXQgbW9uaXRvck9wcG9ydHVuaXRpZXMoKTtcblxuICAgIC8vIFN0b3JlIG1vbml0b3Jpbmcgc3RhdHNcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IGAke09QUE9SVFVOSVRZX1RBQkxFfS1zdGF0c2AsXG4gICAgICBJdGVtOiB7XG4gICAgICAgIGRhdGU6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdLFxuICAgICAgICB0aW1lc3RhbXA6IHN0YXRzLnByb2Nlc3NlZEF0LFxuICAgICAgICAuLi5zdGF0cyxcbiAgICAgIH0sXG4gICAgfSkpO1xuXG4gICAgLy8gUHVibGlzaCBtb25pdG9yaW5nIHJlc3VsdHNcbiAgICBhd2FpdCBldmVudEJyaWRnZUNsaWVudC5zZW5kKG5ldyBQdXRFdmVudHNDb21tYW5kKHtcbiAgICAgIEVudHJpZXM6IFt7XG4gICAgICAgIFNvdXJjZTogJ2dvdmJpei5tb25pdG9yJyxcbiAgICAgICAgRGV0YWlsVHlwZTogJ01vbml0b3JpbmcgQ29tcGxldGVkJyxcbiAgICAgICAgRGV0YWlsOiBKU09OLnN0cmluZ2lmeShzdGF0cyksXG4gICAgICAgIEV2ZW50QnVzTmFtZTogRVZFTlRfQlVTLFxuICAgICAgfV0sXG4gICAgfSkpO1xuXG4gICAgY29uc29sZS5sb2coJ01vbml0b3JpbmcgY29tcGxldGVkOicsIHN0YXRzKTtcblxuICAgIC8vIEFsZXJ0IG9uIGVycm9yc1xuICAgIGlmIChzdGF0cy5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgYXdhaXQgc25zQ2xpZW50LnNlbmQobmV3IFB1Ymxpc2hDb21tYW5kKHtcbiAgICAgICAgVG9waWNBcm46IE5PVElGSUNBVElPTl9UT1BJQyxcbiAgICAgICAgU3ViamVjdDogJ0dvdkJpei5haSBNb25pdG9yaW5nIEVycm9ycycsXG4gICAgICAgIE1lc3NhZ2U6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcnM6IHN0YXRzLmVycm9ycyxcbiAgICAgICAgICB0aW1lc3RhbXA6IHN0YXRzLnByb2Nlc3NlZEF0LFxuICAgICAgICB9LCBudWxsLCAyKSxcbiAgICAgIH0pKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignSGFuZGxlciBlcnJvcjonLCBlcnJvcik7XG4gICAgXG4gICAgLy8gU2VuZCBhbGVydCBmb3IgY3JpdGljYWwgZXJyb3JzXG4gICAgYXdhaXQgc25zQ2xpZW50LnNlbmQobmV3IFB1Ymxpc2hDb21tYW5kKHtcbiAgICAgIFRvcGljQXJuOiBOT1RJRklDQVRJT05fVE9QSUMsXG4gICAgICBTdWJqZWN0OiAnR292Qml6LmFpIENyaXRpY2FsIE1vbml0b3JpbmcgRXJyb3InLFxuICAgICAgTWVzc2FnZTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogZXJyb3IudG9TdHJpbmcoKSxcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgIGNvbnRleHQ6IGNvbnRleHQuYXdzUmVxdWVzdElkLFxuICAgICAgfSwgbnVsbCwgMiksXG4gICAgfSkpO1xuXG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn07Il19