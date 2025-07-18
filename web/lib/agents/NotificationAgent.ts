import { z } from 'zod';
import { UtilityAgent } from './BaseAgent';
import { AgentMessage, AgentCapability } from './AgentOrchestrator';

// Schemas for notification operations
const EmailNotificationSchema = z.object({
  to: z.array(z.string().email()),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string(),
  body: z.string(),
  template: z.string().optional(),
  templateData: z.record(z.any()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.string(),
    contentType: z.string(),
  })).optional(),
});

const SlackNotificationSchema = z.object({
  channel: z.string(),
  message: z.string(),
  username: z.string().optional(),
  iconEmoji: z.string().optional(),
  attachments: z.array(z.any()).optional(),
  blocks: z.array(z.any()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

const AlertNotificationSchema = z.object({
  alertType: z.enum(['deadline', 'opportunity', 'system', 'compliance', 'error']),
  severity: z.enum(['info', 'warning', 'error', 'critical']),
  title: z.string(),
  message: z.string(),
  recipients: z.array(z.string()),
  channels: z.array(z.enum(['email', 'slack', 'sms', 'webhook'])),
  metadata: z.record(z.any()).optional(),
  suppressUntil: z.number().optional(),
});

const BulkNotificationSchema = z.object({
  notifications: z.array(z.object({
    type: z.enum(['email', 'slack', 'sms', 'webhook']),
    recipient: z.string(),
    message: z.string(),
    subject: z.string().optional(),
    templateId: z.string().optional(),
    templateData: z.record(z.any()).optional(),
  })),
  batchSize: z.number().min(1).max(100).default(10),
  delayBetweenBatches: z.number().min(100).default(1000),
});

export class NotificationAgent extends UtilityAgent {
  private emailTemplates: Map<string, any> = new Map();
  private slackTemplates: Map<string, any> = new Map();
  private deliveryStatus: Map<string, any> = new Map();
  private rateLimiter: Map<string, any> = new Map();
  private suppressions: Map<string, number> = new Map();

  constructor() {
    const capabilities: AgentCapability[] = [
      {
        name: 'send_email',
        description: 'Send email notifications with templates and attachments',
        inputs: ['to', 'subject', 'body', 'template', 'attachments'],
        outputs: ['messageId', 'status', 'deliveryTime'],
        cost: 0.05,
        estimatedDuration: 2000,
      },
      {
        name: 'send_slack',
        description: 'Send Slack notifications with rich formatting',
        inputs: ['channel', 'message', 'attachments', 'blocks'],
        outputs: ['messageId', 'status', 'timestamp'],
        cost: 0.02,
        estimatedDuration: 1000,
      },
      {
        name: 'send_alert',
        description: 'Send multi-channel alerts for important events',
        inputs: ['alertType', 'severity', 'message', 'recipients', 'channels'],
        outputs: ['alertId', 'deliveryStatus', 'failedChannels'],
        cost: 0.1,
        estimatedDuration: 3000,
      },
      {
        name: 'bulk_notify',
        description: 'Send bulk notifications with rate limiting and batching',
        inputs: ['notifications', 'batchSize', 'delayBetweenBatches'],
        outputs: ['batchId', 'progress', 'failures'],
        cost: 0.3,
        estimatedDuration: 10000,
      },
      {
        name: 'schedule_notification',
        description: 'Schedule notifications for future delivery',
        inputs: ['notification', 'scheduleTime', 'timezone'],
        outputs: ['scheduleId', 'status', 'deliveryTime'],
        cost: 0.03,
        estimatedDuration: 500,
      },
      {
        name: 'manage_subscriptions',
        description: 'Manage user notification preferences and subscriptions',
        inputs: ['userId', 'preferences', 'action'],
        outputs: ['subscriptions', 'status'],
        cost: 0.01,
        estimatedDuration: 1000,
      },
    ];

    super(
      'Notification Service',
      'Utility agent for multi-channel notifications, alerts, and communication management',
      capabilities,
      '2.0.0'
    );
  }

  protected async onInitialize(): Promise<void> {
    await this.loadEmailTemplates();
    await this.loadSlackTemplates();
    await this.initializeRateLimiting();
    this.logActivity('Notification Agent initialized with templates and rate limiting');
  }

  protected async onShutdown(): Promise<void> {
    await this.flushPendingNotifications();
    this.logActivity('Notification Agent shutting down');
  }

  protected async onProcessMessage(message: AgentMessage): Promise<AgentMessage | null> {
    const { capability, input } = message.payload;

    try {
      switch (capability) {
        case 'send_email':
          return await this.handleSendEmail(message, input);
        
        case 'send_slack':
          return await this.handleSendSlack(message, input);
        
        case 'send_alert':
          return await this.handleSendAlert(message, input);
        
        case 'bulk_notify':
          return await this.handleBulkNotify(message, input);
        
        case 'schedule_notification':
          return await this.handleScheduleNotification(message, input);
        
        case 'manage_subscriptions':
          return await this.handleManageSubscriptions(message, input);
        
        default:
          return this.createErrorResponse(message, `Unknown capability: ${capability}`);
      }
    } catch (error) {
      return this.createErrorResponse(message, error instanceof Error ? error.message : String(error));
    }
  }

  private async handleSendEmail(message: AgentMessage, input: any): Promise<AgentMessage> {
    const params = this.validatePayload(input, EmailNotificationSchema) as any;
    
    this.logActivity('Sending email', { to: params.to, subject: params.subject });
    
    try {
      // Check rate limiting
      await this.checkRateLimit('email', params.to[0]);
      
      const emailData = await this.prepareEmail(params);
      const result = await this.sendEmail(emailData);
      
      // Track delivery status
      this.deliveryStatus.set(result.messageId, {
        type: 'email',
        status: 'sent',
        sentAt: Date.now(),
        recipients: params.to,
      });
      
      return this.createResponse(message, {
        messageId: result.messageId,
        status: result.status,
        deliveryTime: Date.now(),
        recipients: params.to,
      });
    } catch (error) {
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  private async handleSendSlack(message: AgentMessage, input: any): Promise<AgentMessage> {
    const params = this.validatePayload(input, SlackNotificationSchema) as any;
    
    this.logActivity('Sending Slack message', { channel: params.channel });
    
    try {
      // Check rate limiting
      await this.checkRateLimit('slack', params.channel);
      
      const slackData = await this.prepareSlackMessage(params);
      const result = await this.sendSlackMessage(slackData);
      
      // Track delivery status
      this.deliveryStatus.set(result.messageId, {
        type: 'slack',
        status: 'sent',
        sentAt: Date.now(),
        channel: params.channel,
      });
      
      return this.createResponse(message, {
        messageId: result.messageId,
        status: result.status,
        timestamp: result.timestamp,
        channel: params.channel,
      });
    } catch (error) {
      throw new Error(`Failed to send Slack message: ${error}`);
    }
  }

  private async handleSendAlert(message: AgentMessage, input: any): Promise<AgentMessage> {
    const params = this.validatePayload(input, AlertNotificationSchema) as any;
    
    this.logActivity('Sending alert', { type: params.alertType, severity: params.severity });
    
    try {
      // Check if alert is suppressed
      const suppressionKey = `${params.alertType}_${params.title}`;
      if (this.isAlertSuppressed(suppressionKey)) {
        return this.createResponse(message, {
          alertId: this.generateAlertId(),
          status: 'suppressed',
          reason: 'Alert suppression active',
        });
      }
      
      const alertId = this.generateAlertId();
      const deliveryResults = await this.sendMultiChannelAlert(alertId, params);
      
      // Apply suppression if specified
      if (params.suppressUntil) {
        this.suppressions.set(suppressionKey, params.suppressUntil);
      }
      
      return this.createResponse(message, {
        alertId,
        deliveryStatus: deliveryResults.successes,
        failedChannels: deliveryResults.failures,
        sentAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to send alert: ${error}`);
    }
  }

  private async handleBulkNotify(message: AgentMessage, input: any): Promise<AgentMessage> {
    const params = this.validatePayload(input, BulkNotificationSchema) as any;
    
    this.logActivity('Starting bulk notification', { count: params.notifications.length });
    
    try {
      const batchId = this.generateBatchId();
      const results = await this.processBulkNotifications(batchId, params);
      
      return this.createResponse(message, {
        batchId,
        progress: results.progress,
        failures: results.failures,
        processedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to process bulk notifications: ${error}`);
    }
  }

  private async handleScheduleNotification(message: AgentMessage, input: any): Promise<AgentMessage> {
    const { notification, scheduleTime, timezone = 'UTC' } = input;
    
    this.logActivity('Scheduling notification', { scheduleTime, timezone });
    
    try {
      const scheduleId = this.generateScheduleId();
      const deliveryTime = await this.scheduleNotification(scheduleId, notification, scheduleTime, timezone);
      
      return this.createResponse(message, {
        scheduleId,
        status: 'scheduled',
        deliveryTime,
        scheduledAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to schedule notification: ${error}`);
    }
  }

  private async handleManageSubscriptions(message: AgentMessage, input: any): Promise<AgentMessage> {
    const { userId, preferences, action = 'update' } = input;
    
    this.logActivity('Managing subscriptions', { userId, action });
    
    try {
      const subscriptions = await this.manageUserSubscriptions(userId, preferences, action);
      
      return this.createResponse(message, {
        subscriptions,
        status: 'updated',
        updatedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to manage subscriptions: ${error}`);
    }
  }

  // Private implementation methods
  private async loadEmailTemplates(): Promise<void> {
    const templates = {
      deadline_reminder: {
        subject: 'Upcoming Deadline: {{opportunityTitle}}',
        body: `
Dear {{userName}},

This is a reminder that the response deadline for the following opportunity is approaching:

Opportunity: {{opportunityTitle}}
Agency: {{agency}}
Deadline: {{deadline}}
Days Remaining: {{daysRemaining}}

Please ensure you submit your response before the deadline.

Best regards,
GovBiz.ai Team
        `,
      },
      opportunity_match: {
        subject: 'New Opportunity Match: {{opportunityTitle}}',
        body: `
Dear {{userName}},

We found a new Sources Sought opportunity that matches your profile:

Opportunity: {{opportunityTitle}}
Agency: {{agency}}
NAICS Code: {{naicsCode}}
Match Score: {{matchScore}}%
Posted: {{postedDate}}
Deadline: {{deadline}}

View opportunity details and generate a response in your dashboard.

Best regards,
GovBiz.ai Team
        `,
      },
      response_generated: {
        subject: 'Response Generated: {{opportunityTitle}}',
        body: `
Dear {{userName}},

Your Sources Sought response has been generated successfully:

Opportunity: {{opportunityTitle}}
Agency: {{agency}}
Generated: {{generatedAt}}
Word Count: {{wordCount}}

Please review the response in your dashboard before submission.

Best regards,
GovBiz.ai Team
        `,
      },
      system_alert: {
        subject: 'System Alert: {{alertTitle}}',
        body: `
System Alert Notification

Alert Type: {{alertType}}
Severity: {{severity}}
Time: {{timestamp}}

Description:
{{message}}

{{#if recommendations}}
Recommendations:
{{#each recommendations}}
- {{this}}
{{/each}}
{{/if}}

Please take appropriate action if required.

GovBiz.ai Monitoring System
        `,
      },
    };

    Object.entries(templates).forEach(([key, template]) => {
      this.emailTemplates.set(key, template);
    });
  }

  private async loadSlackTemplates(): Promise<void> {
    const templates = {
      deadline_alert: {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⏰ Deadline Alert',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*{{opportunityTitle}}*\nDeadline: {{deadline}} ({{daysRemaining}} days remaining)',
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View Opportunity',
                },
                value: '{{opportunityId}}',
                action_id: 'view_opportunity',
              },
            ],
          },
        ],
      },
      system_status: {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🔧 System Status Update',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: '*Status:* {{status}}',
              },
              {
                type: 'mrkdwn',
                text: '*Uptime:* {{uptime}}',
              },
              {
                type: 'mrkdwn',
                text: '*Response Time:* {{responseTime}}ms',
              },
              {
                type: 'mrkdwn',
                text: '*Error Rate:* {{errorRate}}%',
              },
            ],
          },
        ],
      },
    };

    Object.entries(templates).forEach(([key, template]) => {
      this.slackTemplates.set(key, template);
    });
  }

  private async initializeRateLimiting(): Promise<void> {
    // Initialize rate limiting for different channels
    const limits = {
      email: { limit: 100, window: 3600000 }, // 100 emails per hour
      slack: { limit: 200, window: 3600000 }, // 200 messages per hour
      sms: { limit: 50, window: 3600000 }, // 50 SMS per hour
    };

    Object.entries(limits).forEach(([channel, config]) => {
      this.rateLimiter.set(channel, {
        ...config,
        usage: [],
      });
    });
  }

  private async checkRateLimit(channel: string, identifier: string): Promise<void> {
    const limiter = this.rateLimiter.get(channel);
    if (!limiter) return;

    const now = Date.now();
    const windowStart = now - limiter.window;
    
    // Clean old usage records
    limiter.usage = limiter.usage.filter((timestamp: number) => timestamp > windowStart);
    
    // Check if limit exceeded
    if (limiter.usage.length >= limiter.limit) {
      throw new Error(`Rate limit exceeded for ${channel}. Try again later.`);
    }
    
    // Record this usage
    limiter.usage.push(now);
  }

  private async prepareEmail(params: any) {
    let { subject, body } = params;
    
    // Apply template if specified
    if (params.template && this.emailTemplates.has(params.template)) {
      const template = this.emailTemplates.get(params.template);
      subject = this.renderTemplate(template.subject, params.templateData || {});
      body = this.renderTemplate(template.body, params.templateData || {});
    }
    
    return {
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject,
      body,
      attachments: params.attachments,
      priority: params.priority,
    };
  }

  private async sendEmail(emailData: any) {
    // Mock email sending - in production would use SES, SendGrid, etc.
    const messageId = this.generateNotificationId('email');
    
    // Simulate sending delay
    await this.sleep(100 + Math.random() * 200);
    
    // Simulate occasional failures
    if (Math.random() < 0.05) {
      throw new Error('Email delivery failed');
    }
    
    return {
      messageId,
      status: 'sent',
      provider: 'aws-ses',
    };
  }

  private async prepareSlackMessage(params: any) {
    const message = params.message;
    let blocks = params.blocks;
    
    // Apply template if specified and message looks like template key
    if (this.slackTemplates.has(message)) {
      const template = this.slackTemplates.get(message);
      blocks = this.renderSlackTemplate(template.blocks, params);
    }
    
    return {
      channel: params.channel,
      text: message,
      blocks,
      username: params.username,
      icon_emoji: params.iconEmoji,
      attachments: params.attachments,
    };
  }

  private async sendSlackMessage(slackData: any) {
    // Mock Slack sending - in production would use Slack API
    const messageId = this.generateNotificationId('slack');
    
    // Simulate sending delay
    await this.sleep(50 + Math.random() * 100);
    
    // Simulate occasional failures
    if (Math.random() < 0.02) {
      throw new Error('Slack delivery failed');
    }
    
    return {
      messageId,
      status: 'sent',
      timestamp: Date.now(),
    };
  }

  private isAlertSuppressed(suppressionKey: string): boolean {
    const suppressUntil = this.suppressions.get(suppressionKey);
    if (!suppressUntil) return false;
    
    if (Date.now() > suppressUntil) {
      this.suppressions.delete(suppressionKey);
      return false;
    }
    
    return true;
  }

  private async sendMultiChannelAlert(alertId: string, params: any) {
    const successes: any[] = [];
    const failures: any[] = [];
    
    for (const channel of params.channels) {
      try {
        let result;
        
        switch (channel) {
          case 'email':
            result = await this.sendAlertEmail(params);
            break;
          case 'slack':
            result = await this.sendAlertSlack(params);
            break;
          case 'sms':
            result = await this.sendAlertSMS(params);
            break;
          case 'webhook':
            result = await this.sendAlertWebhook(params);
            break;
          default:
            throw new Error(`Unknown channel: ${channel}`);
        }
        
        successes.push({ channel, result });
      } catch (error) {
        failures.push({
          channel,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return { successes, failures };
  }

  private async processBulkNotifications(batchId: string, params: any) {
    const { notifications, batchSize, delayBetweenBatches } = params;
    const failures: any[] = [];
    let processed = 0;
    
    // Process in batches
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (notification: any) => {
        try {
          await this.sendSingleNotification(notification);
          processed++;
        } catch (error) {
          failures.push({
            notification,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
      
      await Promise.all(batchPromises);
      
      // Delay between batches (except for last batch)
      if (i + batchSize < notifications.length) {
        await this.sleep(delayBetweenBatches);
      }
    }
    
    return {
      progress: {
        total: notifications.length,
        processed,
        failed: failures.length,
        percentage: (processed / notifications.length) * 100,
      },
      failures,
    };
  }

  private async scheduleNotification(scheduleId: string, notification: any, scheduleTime: string, timezone: string) {
    // In production, would use a job scheduler like AWS EventBridge or cron
    const deliveryTime = new Date(scheduleTime).getTime();
    const delay = deliveryTime - Date.now();
    
    if (delay <= 0) {
      throw new Error('Schedule time must be in the future');
    }
    
    // Mock scheduling
    setTimeout(async () => {
      try {
        await this.sendSingleNotification(notification);
        this.logActivity('Scheduled notification sent', { scheduleId });
      } catch (error) {
        this.logActivity('Scheduled notification failed', { scheduleId, error });
      }
    }, Math.min(delay, 2147483647)); // Max setTimeout value
    
    return deliveryTime;
  }

  private async manageUserSubscriptions(userId: string, preferences: any, action: string) {
    // Mock subscription management - in production would use database
    const currentSubscriptions = {
      deadlineReminders: true,
      opportunityMatches: true,
      systemAlerts: false,
      weeklyDigest: true,
      email: true,
      slack: false,
      sms: false,
    };
    
    switch (action) {
      case 'update':
        return { ...currentSubscriptions, ...preferences };
      case 'disable_all':
        return Object.keys(currentSubscriptions).reduce((acc, key) => {
          acc[key] = false;
          return acc;
        }, {} as Record<string, boolean>);
      case 'enable_all':
        return Object.keys(currentSubscriptions).reduce((acc, key) => {
          acc[key] = true;
          return acc;
        }, {} as Record<string, boolean>);
      default:
        return currentSubscriptions;
    }
  }

  // Utility methods
  private renderTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  private renderSlackTemplate(blocks: any[], data: Record<string, any>): any[] {
    const json = JSON.stringify(blocks);
    const rendered = this.renderTemplate(json, data);
    return JSON.parse(rendered);
  }

  private async sendSingleNotification(notification: any): Promise<void> {
    const { type, recipient, message, subject, templateId, templateData } = notification;
    
    switch (type) {
      case 'email':
        await this.sendEmail({
          to: [recipient],
          subject: subject || 'Notification',
          body: message,
          template: templateId,
          templateData,
        });
        break;
      case 'slack':
        await this.sendSlackMessage({
          channel: recipient,
          text: message,
        });
        break;
      case 'sms':
        await this.sendSMS(recipient, message);
        break;
      default:
        throw new Error(`Unknown notification type: ${type}`);
    }
  }

  private async sendAlertEmail(params: any): Promise<any> {
    return this.sendEmail({
      to: params.recipients,
      subject: `Alert: ${params.title}`,
      body: params.message,
      template: 'system_alert',
      templateData: params,
    });
  }

  private async sendAlertSlack(params: any): Promise<any> {
    // Send to each recipient's DM or a specific channel
    const channel = params.metadata?.slackChannel || '#alerts';
    return this.sendSlackMessage({
      channel,
      text: `${params.severity.toUpperCase()}: ${params.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${params.title}*\n${params.message}`,
          },
        },
      ],
    });
  }

  private async sendAlertSMS(params: any): Promise<any> {
    // Mock SMS sending
    const messageId = this.generateNotificationId('sms');
    
    for (const recipient of params.recipients) {
      await this.sendSMS(recipient, `ALERT: ${params.title} - ${params.message}`);
    }
    
    return { messageId, status: 'sent' };
  }

  private async sendAlertWebhook(params: any): Promise<any> {
    // Mock webhook sending
    const webhookUrl = params.metadata?.webhookUrl;
    if (!webhookUrl) {
      throw new Error('Webhook URL not provided');
    }
    
    // In production, would make HTTP POST request
    await this.sleep(100);
    
    return {
      messageId: this.generateNotificationId('webhook'),
      status: 'sent',
      url: webhookUrl,
    };
  }

  private async sendSMS(recipient: string, message: string): Promise<any> {
    // Mock SMS sending - in production would use SNS, Twilio, etc.
    const messageId = this.generateNotificationId('sms');
    
    await this.sleep(100);
    
    if (Math.random() < 0.03) {
      throw new Error('SMS delivery failed');
    }
    
    return {
      messageId,
      status: 'sent',
      recipient,
    };
  }

  private generateNotificationId(type: string): string {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  private generateScheduleId(): string {
    return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  private async flushPendingNotifications(): Promise<void> {
    // In production, would ensure all pending notifications are sent or saved
    this.logActivity('Flushing pending notifications');
  }
}