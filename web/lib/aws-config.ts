import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { SNSClient } from '@aws-sdk/client-sns';

// Environment configuration
const AWS_REGION = process.env.AWS_REGION || process.env.NEXT_PUBLIC_REGION || 'us-east-1';
const STAGE = process.env.NEXT_PUBLIC_STAGE || 'dev';

// AWS Client Configuration
const clientConfig = {
  region: AWS_REGION,
  // For server-side operations, credentials will be provided by IAM roles
  // For client-side operations, configure Cognito or temporary credentials
};

// Initialize AWS clients
export const dynamoClient = new DynamoDBClient(clientConfig);
export const docClient = DynamoDBDocumentClient.from(dynamoClient);
export const s3Client = new S3Client(clientConfig);
export const sqsClient = new SQSClient(clientConfig);
export const eventBridgeClient = new EventBridgeClient(clientConfig);
export const snsClient = new SNSClient(clientConfig);

// Table names and resource identifiers
export const AWS_RESOURCES = {
  // DynamoDB Tables
  TABLES: {
    USERS: process.env.USER_TABLE_NAME || `govbiz-users-${STAGE}`,
    CONVERSATIONS: process.env.CONVERSATION_TABLE_NAME || `govbiz-conversations-${STAGE}`,
    MESSAGES: process.env.MESSAGE_TABLE_NAME || `govbiz-messages-${STAGE}`,
    OPPORTUNITIES: process.env.OPPORTUNITY_TABLE_NAME || `govbiz-opportunities-${STAGE}`,
    AUDIT: process.env.AUDIT_TABLE_NAME || `govbiz-audit-${STAGE}`,
    DOCUMENTS: process.env.DOCUMENT_TABLE_NAME || `govbiz-documents-${STAGE}`,
  },
  
  // S3 Buckets
  BUCKETS: {
    DOCUMENTS: process.env.DOCUMENT_BUCKET_NAME || `govbiz-documents-${STAGE}`,
  },
  
  // SQS Queues
  QUEUES: {
    MESSAGES: process.env.MESSAGE_QUEUE_URL || `govbiz-messages-${STAGE}`,
    DEAD_LETTER: process.env.DLQ_URL || `govbiz-dlq-${STAGE}`,
  },
  
  // EventBridge
  EVENT_BUS: process.env.EVENT_BUS_NAME || `govbiz-events-${STAGE}`,
  
  // SNS Topics
  TOPICS: {
    NOTIFICATIONS: process.env.NOTIFICATION_TOPIC_ARN || `arn:aws:sns:${AWS_REGION}:*:govbiz-notifications-${STAGE}`,
    ALERTS: process.env.ALERT_TOPIC_ARN || `arn:aws:sns:${AWS_REGION}:*:govbiz-alerts-${STAGE}`,
  },
  
  // API Gateway
  API: {
    BASE_URL: process.env.NEXT_PUBLIC_API_URL || `https://api.govbiz-${STAGE}.example.com`,
    STAGE: STAGE,
  }
};

// API Configuration
export const API_CONFIG = {
  baseURL: AWS_RESOURCES.API.BASE_URL,
  timeout: 30000,
  retries: 3,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Version': '2024-01-01',
  },
};

// Feature flags
export const FEATURE_FLAGS = {
  AI_RESPONSE_GENERATION: process.env.NEXT_PUBLIC_ENABLE_AI_RESPONSES === 'true',
  BULK_OPERATIONS: process.env.NEXT_PUBLIC_ENABLE_BULK_OPS === 'true',
  ADVANCED_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
  REAL_TIME_MONITORING: process.env.NEXT_PUBLIC_ENABLE_MONITORING === 'true',
  ONBOARDING_FLOW: process.env.NEXT_PUBLIC_ENABLE_ONBOARDING !== 'false',
  SOURCES_SOUGHT_AUTOMATION: true,
  GOVERNMENT_COMPLIANCE: true,
};

// Configuration validation
export const validateConfig = (): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Check required environment variables
  if (!AWS_REGION) {
    errors.push('AWS_REGION is required');
  }
  
  if (!AWS_RESOURCES.API.BASE_URL || AWS_RESOURCES.API.BASE_URL.includes('example.com')) {
    errors.push('Valid API_URL is required');
  }
  
  // Check table names are properly formatted
  const tableNamePattern = /^[a-zA-Z0-9._-]+$/;
  Object.values(AWS_RESOURCES.TABLES).forEach((tableName, index) => {
    if (!tableNamePattern.test(tableName)) {
      errors.push(`Invalid table name format: ${tableName}`);
    }
  });
  
  // Check bucket names are valid
  const bucketNamePattern = /^[a-z0-9.-]+$/;
  Object.values(AWS_RESOURCES.BUCKETS).forEach((bucketName, index) => {
    if (!bucketNamePattern.test(bucketName)) {
      errors.push(`Invalid bucket name format: ${bucketName}`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Retry configuration for AWS operations
export const RETRY_CONFIG = {
  maxAttempts: 3,
  retryDelayOptions: {
    base: 1000, // 1 second base delay
    customBackoff: (retryCount: number) => Math.pow(2, retryCount) * 1000, // Exponential backoff
  },
};

// Security configuration
export const SECURITY_CONFIG = {
  ENCRYPTION: {
    ALGORITHM: 'AES-256-GCM',
    KEY_ID: process.env.ENCRYPTION_KEY_ID || 'alias/govbiz-ai-encryption-key',
  },
  
  SESSION: {
    TIMEOUT: 8 * 60 * 60, // 8 hours in seconds
    REFRESH_THRESHOLD: 30 * 60, // 30 minutes in seconds
  },
  
  RATE_LIMITING: {
    API_CALLS_PER_MINUTE: 60,
    BULK_OPERATIONS_PER_HOUR: 10,
    FILE_UPLOADS_PER_DAY: 100,
  },
  
  COMPLIANCE: {
    AUDIT_ALL_ACTIONS: true,
    DATA_RETENTION_DAYS: 2555, // 7 years for government compliance
    ENABLE_PII_DETECTION: true,
    REQUIRE_MFA_FOR_ADMIN: true,
  },
};

// Performance configuration
export const PERFORMANCE_CONFIG = {
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
  },
  
  CACHING: {
    OPPORTUNITIES_TTL: 15 * 60, // 15 minutes
    USER_PROFILE_TTL: 60 * 60, // 1 hour
    STATIC_CONTENT_TTL: 24 * 60 * 60, // 24 hours
  },
  
  TIMEOUTS: {
    API_REQUEST: 30000, // 30 seconds
    FILE_UPLOAD: 300000, // 5 minutes
    REPORT_GENERATION: 600000, // 10 minutes
  },
};

// Monitoring configuration
export const MONITORING_CONFIG = {
  METRICS: {
    COLLECT_PERFORMANCE_METRICS: true,
    COLLECT_USER_ANALYTICS: true,
    COLLECT_ERROR_METRICS: true,
  },
  
  ALERTS: {
    ERROR_RATE_THRESHOLD: 0.05, // 5%
    RESPONSE_TIME_THRESHOLD: 2000, // 2 seconds
    MEMORY_USAGE_THRESHOLD: 0.8, // 80%
  },
  
  LOGGING: {
    LEVEL: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    INCLUDE_STACK_TRACES: process.env.NODE_ENV !== 'production',
    LOG_SENSITIVE_DATA: false,
  },
};

// Export default configuration object
export const CONFIG = {
  AWS_REGION,
  STAGE,
  AWS_RESOURCES,
  API_CONFIG,
  FEATURE_FLAGS,
  RETRY_CONFIG,
  SECURITY_CONFIG,
  PERFORMANCE_CONFIG,
  MONITORING_CONFIG,
} as const;

// Utility function to get environment-specific configuration
export const getEnvironmentConfig = () => {
  const config = validateConfig();
  
  if (!config.isValid) {
    console.error('Configuration validation failed:', config.errors);
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid configuration in production environment');
    }
  }
  
  return {
    ...CONFIG,
    isValid: config.isValid,
    errors: config.errors,
  };
};

// Development helpers
export const isDevelopment = () => process.env.NODE_ENV === 'development';
export const isProduction = () => process.env.NODE_ENV === 'production';
export const isStaging = () => STAGE === 'staging';

// API client factory
export const createAPIClient = (baseURL?: string) => {
  return {
    baseURL: baseURL || API_CONFIG.baseURL,
    timeout: API_CONFIG.timeout,
    headers: API_CONFIG.headers,
    retries: API_CONFIG.retries,
  };
};

// Export individual clients for direct use
export {
  dynamoClient as dynamo,
  docClient as dynamoDoc,
  s3Client as s3,
  sqsClient as sqs,
  eventBridgeClient as eventBridge,
  snsClient as sns,
};