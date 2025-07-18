import { ScheduledEvent, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import axios from 'axios';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({});
const eventBridgeClient = new EventBridgeClient({});
const snsClient = new SNSClient({});

// Environment variables
const {
  OPPORTUNITY_TABLE,
  USER_TABLE,
  EVENT_BUS,
  MESSAGE_QUEUE,
  NOTIFICATION_TOPIC,
} = process.env;

// Types
interface SAMGovResponse {
  opportunitiesData: SAMGovOpportunity[];
  totalRecords: number;
  links: {
    self: string;
    next?: string;
  };
}

interface SAMGovOpportunity {
  noticeId: string;
  title: string;
  description: string;
  department: string;
  office: string;
  naicsCode: string;
  naicsDescription: string;
  setAside?: string;
  postedDate: string;
  responseDeadline: string;
  pointOfContact: {
    name: string;
    email: string;
    phone?: string;
  };
  uiLink: string;
  additionalInfoLink?: string;
  attachments?: {
    name: string;
    url: string;
  }[];
  solicitationNumber?: string;
  estimatedValue?: string;
  placeOfPerformance?: string;
  keywords?: string[];
}

interface MonitoringStats {
  totalOpportunities: number;
  newOpportunities: number;
  updatedOpportunities: number;
  expiredOpportunities: number;
  processedAt: string;
  errors: string[];
}

// SAM.gov API configuration
const SAM_GOV_API_BASE = 'https://api.sam.gov/prod/opportunities/v2/search';
const SAM_GOV_API_KEY = process.env.SAM_GOV_API_KEY;

// Utility functions
const fetchSourcesSoughtOpportunities = async (
  page: number = 1,
  limit: number = 100
): Promise<SAMGovResponse> => {
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

    const response = await axios.get(`${SAM_GOV_API_BASE}?${params.toString()}`, {
      timeout: 30000,
      headers: {
        'User-Agent': 'GovBiz.ai Opportunity Monitor',
        'Accept': 'application/json',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching from SAM.gov:', error);
    throw error;
  }
};

const checkOpportunityExists = async (noticeId: string): Promise<boolean> => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: OPPORTUNITY_TABLE,
      KeyConditionExpression: 'opportunityId = :opportunityId',
      ExpressionAttributeValues: {
        ':opportunityId': noticeId,
      },
    }));

    return (result.Items?.length || 0) > 0;
  } catch (error) {
    console.error('Error checking opportunity existence:', error);
    return false;
  }
};

const processNewOpportunity = async (opportunity: SAMGovOpportunity): Promise<void> => {
  try {
    // Queue for detailed processing
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: MESSAGE_QUEUE,
      MessageBody: JSON.stringify({
        type: 'sam_gov_data',
        data: opportunity,
        timestamp: new Date().toISOString(),
      }),
    }));

    // Publish to EventBridge
    await eventBridgeClient.send(new PutEventsCommand({
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
  } catch (error) {
    console.error('Error processing new opportunity:', error);
    throw error;
  }
};

const updateOpportunityStatus = async (): Promise<void> => {
  try {
    // Check for expired opportunities
    const now = new Date().toISOString();
    
    const expiredOpportunities = await docClient.send(new QueryCommand({
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
      await sqsClient.send(new SendMessageCommand({
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

    console.log(`Marked ${expiredOpportunities.Items?.length || 0} opportunities as expired`);
  } catch (error) {
    console.error('Error updating opportunity status:', error);
    throw error;
  }
};

const generateDailyReport = async (): Promise<void> => {
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // Query opportunities created in the last 24 hours
    const recentOpportunities = await docClient.send(new QueryCommand({
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
      newOpportunities: recentOpportunities.Items?.length || 0,
      totalActiveOpportunities: 0, // Would need separate query
      topAgencies: {}, // Would need aggregation
      topNAICS: {}, // Would need aggregation
      generatedAt: new Date().toISOString(),
    };

    // Publish daily report
    await snsClient.send(new PublishCommand({
      TopicArn: NOTIFICATION_TOPIC,
      Subject: 'GovBiz.ai Daily Opportunity Report',
      Message: JSON.stringify(report, null, 2),
    }));

    console.log('Daily report generated and published');
  } catch (error) {
    console.error('Error generating daily report:', error);
    throw error;
  }
};

const monitorOpportunities = async (): Promise<MonitoringStats> => {
  const stats: MonitoringStats = {
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
          } catch (error) {
            console.error(`Error processing opportunity ${opportunity.noticeId}:`, error);
            stats.errors.push(`Error processing ${opportunity.noticeId}: ${error}`);
          }
        }

        // Check if there are more pages
        hasMore = response.links.next !== undefined && response.opportunitiesData.length === pageSize;
        page++;

        // Rate limiting - avoid overwhelming SAM.gov
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
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
  } catch (error) {
    console.error('Error in monitoring process:', error);
    stats.errors.push(`Monitoring error: ${error}`);
    return stats;
  }
};

// Main handler
export const handler = async (event: ScheduledEvent, context: Context): Promise<void> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const stats = await monitorOpportunities();

    // Store monitoring stats
    await docClient.send(new PutCommand({
      TableName: `${OPPORTUNITY_TABLE}-stats`,
      Item: {
        date: new Date().toISOString().split('T')[0],
        timestamp: stats.processedAt,
        ...stats,
      },
    }));

    // Publish monitoring results
    await eventBridgeClient.send(new PutEventsCommand({
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
      await snsClient.send(new PublishCommand({
        TopicArn: NOTIFICATION_TOPIC,
        Subject: 'GovBiz.ai Monitoring Errors',
        Message: JSON.stringify({
          errors: stats.errors,
          timestamp: stats.processedAt,
        }, null, 2),
      }));
    }
  } catch (error) {
    console.error('Handler error:', error);
    
    // Send alert for critical errors
    await snsClient.send(new PublishCommand({
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