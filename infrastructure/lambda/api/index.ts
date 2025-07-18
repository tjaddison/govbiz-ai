import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const sqsClient = new SQSClient({});
const snsClient = new SNSClient({});
const eventBridgeClient = new EventBridgeClient({});

// Environment variables
const {
  STAGE,
  USER_TABLE,
  CONVERSATION_TABLE,
  MESSAGE_TABLE,
  OPPORTUNITY_TABLE,
  AUDIT_TABLE,
  DOCUMENT_BUCKET,
  EVENT_BUS,
  NOTIFICATION_TOPIC,
  MESSAGE_QUEUE,
} = process.env;

// Types
interface APIResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  timestamp: number;
  requestId: string;
}

interface AuditEvent {
  eventId: string;
  userId: string;
  action: string;
  resource: string;
  timestamp: number;
  details: any;
  ipAddress?: string;
  userAgent?: string;
  ttl: number;
}

// Utility functions
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

const createResponse = (
  statusCode: number,
  body: APIResponse,
  headers: Record<string, string> = {}
): APIGatewayProxyResult => ({
  statusCode,
  headers: { ...corsHeaders, ...headers },
  body: JSON.stringify(body),
});

const createAuditEvent = (
  userId: string,
  action: string,
  resource: string,
  details: any,
  event: APIGatewayProxyEvent
): AuditEvent => ({
  eventId: `${userId}-${action}-${Date.now()}`,
  userId,
  action,
  resource,
  timestamp: Date.now(),
  details,
  ipAddress: event.requestContext.identity.sourceIp,
  userAgent: event.requestContext.identity.userAgent,
  ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60), // 90 days
});

const logAuditEvent = async (auditEvent: AuditEvent) => {
  try {
    await docClient.send(new PutCommand({
      TableName: AUDIT_TABLE,
      Item: auditEvent,
    }));

    // Also send to EventBridge for real-time processing
    await eventBridgeClient.send(new PutEventsCommand({
      Entries: [{
        Source: 'govbiz.audit',
        DetailType: 'Audit Event',
        Detail: JSON.stringify(auditEvent),
        EventBusName: EVENT_BUS,
      }],
    }));
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
};

// Route handlers
const getUserProfile = async (userId: string): Promise<APIResponse> => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: USER_TABLE,
      Key: { userId },
    }));

    return {
      success: true,
      data: result.Item,
      timestamp: Date.now(),
      requestId: `get-user-${Date.now()}`,
    };
  } catch (error) {
    console.error('Get user profile error:', error);
    return {
      success: false,
      error: 'Failed to get user profile',
      timestamp: Date.now(),
      requestId: `get-user-error-${Date.now()}`,
    };
  }
};

const updateUserProfile = async (userId: string, profileData: any): Promise<APIResponse> => {
  try {
    const updateExpression = Object.keys(profileData)
      .map(key => `#${key} = :${key}`)
      .join(', ');

    const expressionAttributeNames = Object.keys(profileData).reduce((acc, key) => {
      acc[`#${key}`] = key;
      return acc;
    }, {} as Record<string, string>);

    const expressionAttributeValues = Object.keys(profileData).reduce((acc, key) => {
      acc[`:${key}`] = profileData[key];
      return acc;
    }, {} as Record<string, any>);

    const result = await docClient.send(new UpdateCommand({
      TableName: USER_TABLE,
      Key: { userId },
      UpdateExpression: `SET ${updateExpression}, updatedAt = :updatedAt`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: {
        ...expressionAttributeValues,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }));

    return {
      success: true,
      data: result.Attributes,
      timestamp: Date.now(),
      requestId: `update-user-${Date.now()}`,
    };
  } catch (error) {
    console.error('Update user profile error:', error);
    return {
      success: false,
      error: 'Failed to update user profile',
      timestamp: Date.now(),
      requestId: `update-user-error-${Date.now()}`,
    };
  }
};

const getConversations = async (userId: string, limit: number = 20): Promise<APIResponse> => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: CONVERSATION_TABLE,
      IndexName: 'user-conversations-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false,
      Limit: limit,
    }));

    return {
      success: true,
      data: {
        conversations: result.Items || [],
        count: result.Count || 0,
      },
      timestamp: Date.now(),
      requestId: `get-conversations-${Date.now()}`,
    };
  } catch (error) {
    console.error('Get conversations error:', error);
    return {
      success: false,
      error: 'Failed to get conversations',
      timestamp: Date.now(),
      requestId: `get-conversations-error-${Date.now()}`,
    };
  }
};

const getMessages = async (conversationId: string, limit: number = 50): Promise<APIResponse> => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: MESSAGE_TABLE,
      KeyConditionExpression: 'conversationId = :conversationId',
      ExpressionAttributeValues: {
        ':conversationId': conversationId,
      },
      ScanIndexForward: false,
      Limit: limit,
    }));

    return {
      success: true,
      data: {
        messages: result.Items || [],
        count: result.Count || 0,
      },
      timestamp: Date.now(),
      requestId: `get-messages-${Date.now()}`,
    };
  } catch (error) {
    console.error('Get messages error:', error);
    return {
      success: false,
      error: 'Failed to get messages',
      timestamp: Date.now(),
      requestId: `get-messages-error-${Date.now()}`,
    };
  }
};

const getOpportunities = async (filters: any = {}): Promise<APIResponse> => {
  try {
    let params: any = {
      TableName: OPPORTUNITY_TABLE,
      Limit: filters.limit || 20,
    };

    // Apply filters based on GSI
    if (filters.agency) {
      params.IndexName = 'agency-index';
      params.KeyConditionExpression = 'agency = :agency';
      params.ExpressionAttributeValues = { ':agency': filters.agency };
    } else if (filters.naicsCode) {
      params.IndexName = 'naics-index';
      params.KeyConditionExpression = 'naicsCode = :naicsCode';
      params.ExpressionAttributeValues = { ':naicsCode': filters.naicsCode };
    } else if (filters.status) {
      params.IndexName = 'status-index';
      params.KeyConditionExpression = 'status = :status';
      params.ExpressionAttributeValues = { ':status': filters.status };
    }

    const result = await docClient.send(new QueryCommand(params));

    return {
      success: true,
      data: {
        opportunities: result.Items || [],
        count: result.Count || 0,
      },
      timestamp: Date.now(),
      requestId: `get-opportunities-${Date.now()}`,
    };
  } catch (error) {
    console.error('Get opportunities error:', error);
    return {
      success: false,
      error: 'Failed to get opportunities',
      timestamp: Date.now(),
      requestId: `get-opportunities-error-${Date.now()}`,
    };
  }
};

const processMessage = async (messageData: any): Promise<APIResponse> => {
  try {
    // Send message to SQS for async processing
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: MESSAGE_QUEUE,
      MessageBody: JSON.stringify({
        type: 'chat_message',
        data: messageData,
      }),
    }));

    return {
      success: true,
      data: { messageId: messageData.messageId },
      message: 'Message queued for processing',
      timestamp: Date.now(),
      requestId: `process-message-${Date.now()}`,
    };
  } catch (error) {
    console.error('Process message error:', error);
    return {
      success: false,
      error: 'Failed to process message',
      timestamp: Date.now(),
      requestId: `process-message-error-${Date.now()}`,
    };
  }
};

// Main handler
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {
      success: true,
      message: 'CORS preflight',
      timestamp: Date.now(),
      requestId: context.awsRequestId,
    });
  }

  try {
    const path = event.path;
    const method = event.httpMethod;
    const pathParameters = event.pathParameters || {};
    const queryStringParameters = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};

    // Extract user ID from headers or path
    const userId = event.headers.Authorization?.replace('Bearer ', '') || pathParameters.userId;

    if (!userId && !path.includes('health')) {
      return createResponse(401, {
        success: false,
        error: 'Unauthorized',
        timestamp: Date.now(),
        requestId: context.awsRequestId,
      });
    }

    let response: APIResponse;

    // Route handling
    switch (true) {
      case path === '/health' && method === 'GET':
        response = {
          success: true,
          data: { status: 'healthy', stage: STAGE },
          timestamp: Date.now(),
          requestId: context.awsRequestId,
        };
        break;

      case path === '/user/profile' && method === 'GET':
        response = await getUserProfile(userId!);
        if (response.success) {
          await logAuditEvent(createAuditEvent(userId!, 'GET_PROFILE', 'user', {}, event));
        }
        break;

      case path === '/user/profile' && method === 'PUT':
        response = await updateUserProfile(userId!, body);
        if (response.success) {
          await logAuditEvent(createAuditEvent(userId!, 'UPDATE_PROFILE', 'user', body, event));
        }
        break;

      case path === '/conversations' && method === 'GET':
        response = await getConversations(userId!, parseInt(queryStringParameters.limit || '20'));
        if (response.success) {
          await logAuditEvent(createAuditEvent(userId!, 'GET_CONVERSATIONS', 'conversations', {}, event));
        }
        break;

      case path.startsWith('/conversations/') && path.includes('/messages') && method === 'GET':
        const conversationId = pathParameters.conversationId;
        response = await getMessages(conversationId!, parseInt(queryStringParameters.limit || '50'));
        if (response.success) {
          await logAuditEvent(createAuditEvent(userId!, 'GET_MESSAGES', 'messages', { conversationId }, event));
        }
        break;

      case path === '/opportunities' && method === 'GET':
        response = await getOpportunities(queryStringParameters);
        if (response.success) {
          await logAuditEvent(createAuditEvent(userId!, 'GET_OPPORTUNITIES', 'opportunities', queryStringParameters, event));
        }
        break;

      case path === '/messages' && method === 'POST':
        response = await processMessage(body);
        if (response.success) {
          await logAuditEvent(createAuditEvent(userId!, 'SEND_MESSAGE', 'messages', body, event));
        }
        break;

      default:
        response = {
          success: false,
          error: 'Not found',
          timestamp: Date.now(),
          requestId: context.awsRequestId,
        };
        return createResponse(404, response);
    }

    return createResponse(200, response);
  } catch (error) {
    console.error('Handler error:', error);
    return createResponse(500, {
      success: false,
      error: 'Internal server error',
      timestamp: Date.now(),
      requestId: context.awsRequestId,
    });
  }
};