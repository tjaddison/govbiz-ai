// Environment setup for Jest tests

// Mock environment variables for testing
process.env.NODE_ENV = 'test'
process.env.AWS_REGION = 'us-east-1'
process.env.NEXT_PUBLIC_STAGE = 'test'
process.env.NEXT_PUBLIC_REGION = 'us-east-1'

// AWS Resource Names for Testing
process.env.USER_TABLE_NAME = 'govbiz-users-test'
process.env.CONVERSATION_TABLE_NAME = 'govbiz-conversations-test'
process.env.MESSAGE_TABLE_NAME = 'govbiz-messages-test'
process.env.OPPORTUNITY_TABLE_NAME = 'govbiz-opportunities-test'
process.env.AUDIT_TABLE_NAME = 'govbiz-audit-test'

// S3 Buckets
process.env.DOCUMENT_BUCKET_NAME = 'govbiz-documents-test'

// SQS Queues
process.env.MESSAGE_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/govbiz-messages-test'
process.env.DLQ_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/govbiz-dlq-test'

// EventBridge
process.env.EVENT_BUS_NAME = 'govbiz-events-test'

// SNS Topics
process.env.NOTIFICATION_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:govbiz-notifications-test'
process.env.ALERT_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:govbiz-alerts-test'

// API Configuration
process.env.NEXT_PUBLIC_API_URL = 'https://api.govbiz-test.example.com'

// Feature Flags
process.env.NEXT_PUBLIC_ENABLE_AI_RESPONSES = 'true'
process.env.NEXT_PUBLIC_ENABLE_BULK_OPS = 'true'
process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = 'true'
process.env.NEXT_PUBLIC_ENABLE_MONITORING = 'true'
process.env.NEXT_PUBLIC_ENABLE_ONBOARDING = 'true'

// Security
process.env.ENCRYPTION_KEY_ID = 'alias/govbiz-ai-encryption-key-test'

// SAM.gov API
process.env.SAM_GOV_API_KEY = 'test-sam-gov-api-key-12345'

// Database credentials (mocked)
process.env.DB_USERNAME = 'test_user'
process.env.DB_PASSWORD = 'test_password'
process.env.DB_HOST = 'localhost'
process.env.DB_PORT = '5432'
process.env.DB_NAME = 'govbiz_test'

// Redis (for caching tests)
process.env.REDIS_URL = 'redis://localhost:6379'

// Email service configuration
process.env.EMAIL_SERVICE = 'mock'
process.env.SMTP_HOST = 'localhost'
process.env.SMTP_PORT = '587'
process.env.EMAIL_FROM = 'test@govbiz.ai'

// Slack configuration
process.env.SLACK_BOT_TOKEN = 'xoxb-test-token'
process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test/webhook'

// Authentication
process.env.NEXTAUTH_SECRET = 'test-secret-key-for-jwt-signing'
process.env.NEXTAUTH_URL = 'http://localhost:3000'

// Google OAuth (for testing)
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret'

// AI/ML Services
process.env.OPENAI_API_KEY = 'test-openai-api-key'
process.env.ANTHROPIC_API_KEY = 'test-anthropic-api-key'

// Monitoring and observability
process.env.SENTRY_DSN = 'https://test@sentry.io/test'
process.env.DATADOG_API_KEY = 'test-datadog-api-key'

// Rate limiting
process.env.RATE_LIMIT_REDIS_URL = 'redis://localhost:6379'

// File upload limits
process.env.MAX_FILE_SIZE = '10485760' // 10MB
process.env.ALLOWED_FILE_TYPES = 'pdf,doc,docx,txt'

// Session configuration
process.env.SESSION_SECRET = 'test-session-secret'
process.env.SESSION_TIMEOUT = '28800' // 8 hours

// Security headers
process.env.CORS_ORIGIN = 'http://localhost:3000'
process.env.CSP_NONCE = 'test-csp-nonce'

// Webhook secrets
process.env.GITHUB_WEBHOOK_SECRET = 'test-github-webhook-secret'
process.env.STRIPE_WEBHOOK_SECRET = 'test-stripe-webhook-secret'

// Performance monitoring
process.env.ENABLE_PERFORMANCE_MONITORING = 'true'
process.env.PERFORMANCE_SAMPLE_RATE = '1.0'

// Logging
process.env.LOG_LEVEL = 'debug'
process.env.LOG_FORMAT = 'json'

// Health check endpoints
process.env.HEALTH_CHECK_PATH = '/api/health'
process.env.READY_CHECK_PATH = '/api/ready'

// Background job processing
process.env.JOB_QUEUE_URL = 'redis://localhost:6379'
process.env.JOB_CONCURRENCY = '5'

// Compliance and audit
process.env.AUDIT_LOG_RETENTION_DAYS = '2555' // 7 years
process.env.PII_DETECTION_ENABLED = 'true'
process.env.GDPR_COMPLIANCE_MODE = 'true'

// Testing specific
process.env.TEST_DATABASE_URL = 'postgresql://test_user:test_password@localhost:5432/govbiz_test'
process.env.TEST_REDIS_URL = 'redis://localhost:6380' // Different port for test
process.env.MOCK_EXTERNAL_APIS = 'true'
process.env.DISABLE_TELEMETRY = 'true'

// CI/CD environment detection
if (process.env.CI) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.REDIS_URL = process.env.TEST_REDIS_URL
}