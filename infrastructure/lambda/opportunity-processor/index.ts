import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({});
const eventBridgeClient = new EventBridgeClient({});

// Environment variables
const {
  OPPORTUNITY_TABLE,
  USER_TABLE,
  EVENT_BUS,
  MESSAGE_QUEUE,
} = process.env;

// Types
interface SourcesSoughtOpportunity {
  opportunityId: string;
  title: string;
  description: string;
  agency: string;
  office: string;
  naicsCode: string;
  naicsDescription: string;
  setAsideCode?: string;
  postedDate: string;
  responseDeadline: string;
  pointOfContact: {
    name: string;
    email: string;
    phone?: string;
  };
  requirements: string[];
  attachments?: {
    name: string;
    url: string;
  }[];
  solicitationNumber?: string;
  estimatedValue?: string;
  placeOfPerformance?: string;
  status: 'active' | 'cancelled' | 'awarded' | 'expired';
  keywords: string[];
  createdAt: string;
  updatedAt: string;
}

interface UserProfile {
  userId: string;
  naicsCodes: string[];
  keywords: string[];
  agencies: string[];
  certifications: string[];
  alertPreferences: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
}

interface OpportunityMatch {
  userId: string;
  opportunityId: string;
  matchScore: number;
  matchReasons: string[];
  notificationSent: boolean;
  createdAt: string;
}

// Utility functions
const calculateMatchScore = (opportunity: SourcesSoughtOpportunity, user: UserProfile): number => {
  let score = 0;
  const reasons: string[] = [];

  // NAICS code match (highest weight)
  if (user.naicsCodes.includes(opportunity.naicsCode)) {
    score += 50;
    reasons.push('NAICS code match');
  }

  // Keyword matches
  const keywordMatches = opportunity.keywords.filter(keyword => 
    user.keywords.some(userKeyword => 
      keyword.toLowerCase().includes(userKeyword.toLowerCase()) ||
      userKeyword.toLowerCase().includes(keyword.toLowerCase())
    )
  );
  score += keywordMatches.length * 10;
  if (keywordMatches.length > 0) {
    reasons.push(`${keywordMatches.length} keyword matches`);
  }

  // Agency preference
  if (user.agencies.includes(opportunity.agency)) {
    score += 20;
    reasons.push('Preferred agency');
  }

  // Set-aside match
  if (opportunity.setAsideCode && user.certifications.includes(opportunity.setAsideCode)) {
    score += 30;
    reasons.push('Certification match');
  }

  // Title/description keyword match
  const titleDescriptionText = `${opportunity.title} ${opportunity.description}`.toLowerCase();
  const titleMatches = user.keywords.filter(keyword => 
    titleDescriptionText.includes(keyword.toLowerCase())
  );
  score += titleMatches.length * 5;
  if (titleMatches.length > 0) {
    reasons.push(`${titleMatches.length} title/description matches`);
  }

  return Math.min(score, 100); // Cap at 100
};

const findMatchingUsers = async (opportunity: SourcesSoughtOpportunity): Promise<OpportunityMatch[]> => {
  const matches: OpportunityMatch[] = [];

  try {
    // Query users who have the same NAICS code
    const naicsUsers = await docClient.send(new QueryCommand({
      TableName: USER_TABLE,
      IndexName: 'naics-index', // Assumes GSI exists
      KeyConditionExpression: 'naicsCode = :naicsCode',
      ExpressionAttributeValues: {
        ':naicsCode': opportunity.naicsCode,
      },
    }));

    // Also scan for users with keyword matches (expensive, but necessary)
    // In production, consider using OpenSearch or similar for text search
    const allUsers = await docClient.send(new QueryCommand({
      TableName: USER_TABLE,
      // This would need to be a more sophisticated query in production
    }));

    const users = [...(naicsUsers.Items || []), ...(allUsers.Items || [])];
    const uniqueUsers = users.filter((user, index, self) => 
      index === self.findIndex(u => u.userId === user.userId)
    );

    for (const user of uniqueUsers) {
      const matchScore = calculateMatchScore(opportunity, user as UserProfile);
      
      if (matchScore >= 30) { // Minimum threshold for notification
        matches.push({
          userId: user.userId,
          opportunityId: opportunity.opportunityId,
          matchScore,
          matchReasons: [], // Would be populated by calculateMatchScore
          notificationSent: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return matches;
  } catch (error) {
    console.error('Error finding matching users:', error);
    return [];
  }
};

const processOpportunity = async (opportunity: SourcesSoughtOpportunity): Promise<void> => {
  try {
    // Store opportunity in DynamoDB
    await docClient.send(new PutCommand({
      TableName: OPPORTUNITY_TABLE,
      Item: {
        ...opportunity,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));

    // Find matching users
    const matches = await findMatchingUsers(opportunity);

    // Store matches and queue notifications
    for (const match of matches) {
      // Store match record
      await docClient.send(new PutCommand({
        TableName: `${OPPORTUNITY_TABLE}-matches`, // Separate table for matches
        Item: match,
      }));

      // Queue notification
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: MESSAGE_QUEUE,
        MessageBody: JSON.stringify({
          type: 'opportunity_notification',
          data: {
            userId: match.userId,
            opportunityId: match.opportunityId,
            matchScore: match.matchScore,
            matchReasons: match.matchReasons,
          },
        }),
      }));
    }

    // Publish event to EventBridge
    await eventBridgeClient.send(new PutEventsCommand({
      Entries: [{
        Source: 'govbiz.opportunities',
        DetailType: 'Opportunity Processed',
        Detail: JSON.stringify({
          opportunityId: opportunity.opportunityId,
          title: opportunity.title,
          agency: opportunity.agency,
          naicsCode: opportunity.naicsCode,
          matchCount: matches.length,
          processedAt: new Date().toISOString(),
        }),
        EventBusName: EVENT_BUS,
      }],
    }));

    console.log(`Processed opportunity ${opportunity.opportunityId} with ${matches.length} matches`);
  } catch (error) {
    console.error('Error processing opportunity:', error);
    throw error;
  }
};

const processSAMGovData = async (samData: any): Promise<SourcesSoughtOpportunity> => {
  // Transform SAM.gov data to our internal format
  return {
    opportunityId: samData.noticeId || `ss-${Date.now()}`,
    title: samData.title || 'Untitled Opportunity',
    description: samData.description || '',
    agency: samData.department || 'Unknown Agency',
    office: samData.office || 'Unknown Office',
    naicsCode: samData.naicsCode || '000000',
    naicsDescription: samData.naicsDescription || 'Unknown NAICS',
    setAsideCode: samData.setAside,
    postedDate: samData.postedDate || new Date().toISOString(),
    responseDeadline: samData.responseDeadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    pointOfContact: {
      name: samData.contactName || 'Unknown Contact',
      email: samData.contactEmail || 'unknown@agency.gov',
      phone: samData.contactPhone,
    },
    requirements: samData.requirements || [],
    attachments: samData.attachments || [],
    solicitationNumber: samData.solicitationNumber,
    estimatedValue: samData.estimatedValue,
    placeOfPerformance: samData.placeOfPerformance,
    status: 'active',
    keywords: extractKeywords(samData.title + ' ' + samData.description),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

const extractKeywords = (text: string): string[] => {
  // Simple keyword extraction - in production, use NLP
  const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an'];
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.includes(word));
  
  return [...new Set(words)].slice(0, 20); // Limit to 20 unique keywords
};

// Main handler
export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.body);
      
      switch (messageBody.type) {
        case 'sam_gov_data':
          const opportunity = await processSAMGovData(messageBody.data);
          await processOpportunity(opportunity);
          break;

        case 'opportunity_update':
          // Handle opportunity updates
          await docClient.send(new UpdateCommand({
            TableName: OPPORTUNITY_TABLE,
            Key: { opportunityId: messageBody.data.opportunityId },
            UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':status': messageBody.data.status,
              ':updatedAt': new Date().toISOString(),
            },
          }));
          break;

        default:
          console.warn('Unknown message type:', messageBody.type);
      }
    } catch (error) {
      console.error('Error processing record:', error);
      // In production, implement dead letter queue handling
      throw error;
    }
  }
};