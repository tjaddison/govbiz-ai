/**
 * Webhook Management System
 * 
 * Manages webhook subscriptions, delivery, retries, and monitoring
 * for real-time notifications and event-driven integrations
 */

import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'

export interface WebhookConfig {
  enabled: boolean
  maxRetries: number
  retryDelay: number
  timeout: number
  verifySignatures: boolean
  supportedEvents: string[]
}

export interface WebhookEndpoint {
  id: string
  url: string
  events: string[]
  headers?: Record<string, string>
  secret?: string
  active: boolean
  userId: string
  createdAt: number
  updatedAt: number
  metadata?: Record<string, any>
}

export interface WebhookEvent {
  id: string
  type: string
  data: any
  timestamp: number
  source: string
  userId?: string
  metadata?: Record<string, any>
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  eventId: string
  url: string
  payload: any
  headers: Record<string, string>
  status: 'pending' | 'success' | 'failed' | 'retry'
  statusCode?: number
  responseTime?: number
  attempts: number
  lastAttempt: number
  nextRetry?: number
  error?: string
  createdAt: number
}

export interface WebhookStats {
  totalEndpoints: number
  activeEndpoints: number
  totalDeliveries: number
  successfulDeliveries: number
  failedDeliveries: number
  averageResponseTime: number
  eventTypes: Record<string, number>
  recentDeliveries: WebhookDelivery[]
}

export class WebhookManager {
  private config: WebhookConfig
  private endpoints: Map<string, WebhookEndpoint> = new Map()
  private deliveries: Map<string, WebhookDelivery> = new Map()
  private retryQueue: Set<string> = new Set()

  constructor(config: any) {
    this.config = {
      enabled: true,
      maxRetries: 3,
      retryDelay: 5000, // 5 seconds
      timeout: 30000,   // 30 seconds
      verifySignatures: true,
      supportedEvents: [
        'sources_sought.created',
        'sources_sought.updated',
        'sources_sought.deadline_approaching',
        'workflow.created',
        'workflow.completed',
        'workflow.failed',
        'document.generated',
        'user.profile_updated',
        'notification.created'
      ],
      ...config
    }
  }

  /**
   * Initialize webhook system
   */
  async initialize(): Promise<void> {
    try {
      if (!this.config.enabled) {
        logger.info('Webhook system disabled')
        return
      }

      // Start retry processor
      this.startRetryProcessor()

      logger.info('Webhook system initialized successfully', {
        supportedEvents: this.config.supportedEvents.length,
        maxRetries: this.config.maxRetries,
        timeout: this.config.timeout
      })

    } catch (error) {
      logger.error('Failed to initialize webhook system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Create webhook endpoint
   */
  async createWebhook(endpoint: Omit<WebhookEndpoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<WebhookEndpoint> {
    try {
      // Validate URL
      const url = new URL(endpoint.url)
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Webhook URL must use HTTP or HTTPS protocol')
      }

      // Validate events
      const invalidEvents = endpoint.events.filter(event => 
        !this.config.supportedEvents.includes(event)
      )
      if (invalidEvents.length > 0) {
        throw new Error(`Unsupported events: ${invalidEvents.join(', ')}`)
      }

      const webhook: WebhookEndpoint = {
        id: this.generateWebhookId(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...endpoint
      }

      this.endpoints.set(webhook.id, webhook)

      logger.info('Webhook endpoint created', {
        webhookId: webhook.id,
        url: webhook.url,
        events: webhook.events,
        userId: webhook.userId
      })

      await this.recordMetric('webhook_created', 1, { userId: webhook.userId })

      return webhook

    } catch (error) {
      logger.error('Failed to create webhook', error instanceof Error ? error : undefined, endpoint)
      throw error
    }
  }

  /**
   * Update webhook endpoint
   */
  async updateWebhook(webhookId: string, updates: Partial<WebhookEndpoint>): Promise<WebhookEndpoint> {
    try {
      const existing = this.endpoints.get(webhookId)
      if (!existing) {
        throw new Error(`Webhook ${webhookId} not found`)
      }

      // Validate URL if updating
      if (updates.url) {
        const url = new URL(updates.url)
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('Webhook URL must use HTTP or HTTPS protocol')
        }
      }

      // Validate events if updating
      if (updates.events) {
        const invalidEvents = updates.events.filter(event => 
          !this.config.supportedEvents.includes(event)
        )
        if (invalidEvents.length > 0) {
          throw new Error(`Unsupported events: ${invalidEvents.join(', ')}`)
        }
      }

      const updated: WebhookEndpoint = {
        ...existing,
        ...updates,
        updatedAt: Date.now()
      }

      this.endpoints.set(webhookId, updated)

      logger.info('Webhook endpoint updated', {
        webhookId,
        changes: Object.keys(updates)
      })

      return updated

    } catch (error) {
      logger.error('Failed to update webhook', error instanceof Error ? error : undefined, { webhookId, updates })
      throw error
    }
  }

  /**
   * Delete webhook endpoint
   */
  async deleteWebhook(webhookId: string): Promise<boolean> {
    try {
      const webhook = this.endpoints.get(webhookId)
      if (!webhook) {
        return false
      }

      this.endpoints.delete(webhookId)

      // Clean up related deliveries (keep for audit purposes, just mark as deleted)
      for (const delivery of this.deliveries.values()) {
        if (delivery.webhookId === webhookId) {
          delivery.status = 'failed'
          delivery.error = 'Webhook deleted'
        }
      }

      logger.info('Webhook endpoint deleted', { webhookId })

      return true

    } catch (error) {
      logger.error('Failed to delete webhook', error instanceof Error ? error : undefined, { webhookId })
      throw error
    }
  }

  /**
   * Get webhook endpoints for user
   */
  async getWebhooks(userId: string): Promise<WebhookEndpoint[]> {
    try {
      const userWebhooks = Array.from(this.endpoints.values())
        .filter(webhook => webhook.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)

      return userWebhooks

    } catch (error) {
      logger.error('Failed to get webhooks', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Send webhook event
   */
  async sendEvent(event: WebhookEvent): Promise<void> {
    try {
      if (!this.config.enabled) {
        logger.debug('Webhook system disabled, skipping event', { eventType: event.type })
        return
      }

      // Find matching webhooks
      const matchingWebhooks = Array.from(this.endpoints.values())
        .filter(webhook => 
          webhook.active && 
          webhook.events.includes(event.type) &&
          (!event.userId || webhook.userId === event.userId)
        )

      if (matchingWebhooks.length === 0) {
        logger.debug('No matching webhooks for event', { eventType: event.type, eventId: event.id })
        return
      }

      logger.info('Sending webhook event', {
        eventType: event.type,
        eventId: event.id,
        webhookCount: matchingWebhooks.length
      })

      // Create deliveries for each matching webhook
      const deliveries = matchingWebhooks.map(webhook => this.createDelivery(webhook, event))

      // Send deliveries
      await Promise.all(deliveries.map(delivery => this.deliverWebhook(delivery)))

      await this.recordMetric('webhook_event_sent', 1, { 
        eventType: event.type,
        webhookCount: matchingWebhooks.length.toString()
      })

    } catch (error) {
      logger.error('Failed to send webhook event', error instanceof Error ? error : undefined, event)
      throw error
    }
  }

  /**
   * Get webhook delivery status
   */
  async getDelivery(deliveryId: string): Promise<WebhookDelivery | null> {
    try {
      return this.deliveries.get(deliveryId) || null

    } catch (error) {
      logger.error('Failed to get delivery', error instanceof Error ? error : undefined, { deliveryId })
      return null
    }
  }

  /**
   * Get webhook statistics
   */
  async getStats(userId?: string): Promise<WebhookStats> {
    try {
      const allEndpoints = Array.from(this.endpoints.values())
      const userEndpoints = userId ? 
        allEndpoints.filter(e => e.userId === userId) : 
        allEndpoints

      const allDeliveries = Array.from(this.deliveries.values())
      const relevantDeliveries = userId ?
        allDeliveries.filter(d => {
          const webhook = this.endpoints.get(d.webhookId)
          return webhook?.userId === userId
        }) :
        allDeliveries

      const successfulDeliveries = relevantDeliveries.filter(d => d.status === 'success')
      const failedDeliveries = relevantDeliveries.filter(d => d.status === 'failed')

      const eventTypes: Record<string, number> = {}
      const responseTimeSum = successfulDeliveries.reduce((sum, d) => {
        // Count event types from recent deliveries
        const webhook = this.endpoints.get(d.webhookId)
        if (webhook) {
          webhook.events.forEach(event => {
            eventTypes[event] = (eventTypes[event] || 0) + 1
          })
        }
        return sum + (d.responseTime || 0)
      }, 0)

      const recentDeliveries = relevantDeliveries
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10)

      return {
        totalEndpoints: userEndpoints.length,
        activeEndpoints: userEndpoints.filter(e => e.active).length,
        totalDeliveries: relevantDeliveries.length,
        successfulDeliveries: successfulDeliveries.length,
        failedDeliveries: failedDeliveries.length,
        averageResponseTime: successfulDeliveries.length > 0 ? 
          Math.round(responseTimeSum / successfulDeliveries.length) : 0,
        eventTypes,
        recentDeliveries
      }

    } catch (error) {
      logger.error('Failed to get webhook stats', error instanceof Error ? error : undefined, { userId })
      throw error
    }
  }

  /**
   * Test webhook endpoint
   */
  async testWebhook(webhookId: string): Promise<{ success: boolean; responseTime: number; statusCode?: number; error?: string }> {
    try {
      const webhook = this.endpoints.get(webhookId)
      if (!webhook) {
        throw new Error(`Webhook ${webhookId} not found`)
      }

      const testEvent: WebhookEvent = {
        id: 'test_' + Date.now(),
        type: 'webhook.test',
        data: {
          message: 'This is a test webhook delivery',
          timestamp: new Date().toISOString()
        },
        timestamp: Date.now(),
        source: 'webhook_test',
        userId: webhook.userId
      }

      const delivery = this.createDelivery(webhook, testEvent)
      const result = await this.deliverWebhook(delivery)

      return {
        success: result.status === 'success',
        responseTime: result.responseTime || 0,
        statusCode: result.statusCode,
        error: result.error
      }

    } catch (error) {
      logger.error('Failed to test webhook', error instanceof Error ? error : undefined, { webhookId })
      return {
        success: false,
        responseTime: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Shutdown webhook system
   */
  async shutdown(): Promise<void> {
    try {
      this.endpoints.clear()
      this.deliveries.clear()
      this.retryQueue.clear()

      logger.info('Webhook system shutdown complete')

    } catch (error) {
      logger.error('Webhook system shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private generateWebhookId(): string {
    return `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateDeliveryId(): string {
    return `whd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private createDelivery(webhook: WebhookEndpoint, event: WebhookEvent): WebhookDelivery {
    const payload = {
      id: event.id,
      type: event.type,
      data: event.data,
      timestamp: event.timestamp,
      source: event.source
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'GovBiz.ai-Webhooks/1.0',
      'X-Webhook-Event': event.type,
      'X-Webhook-ID': event.id,
      'X-Webhook-Timestamp': event.timestamp.toString(),
      ...webhook.headers
    }

    // Add signature if secret is provided
    if (webhook.secret && this.config.verifySignatures) {
      const signature = this.generateSignature(JSON.stringify(payload), webhook.secret)
      headers['X-Webhook-Signature'] = signature
    }

    const delivery: WebhookDelivery = {
      id: this.generateDeliveryId(),
      webhookId: webhook.id,
      eventId: event.id,
      url: webhook.url,
      payload,
      headers,
      status: 'pending',
      attempts: 0,
      lastAttempt: 0,
      createdAt: Date.now()
    }

    this.deliveries.set(delivery.id, delivery)
    return delivery
  }

  private async deliverWebhook(delivery: WebhookDelivery): Promise<WebhookDelivery> {
    const startTime = Date.now()
    
    try {
      delivery.attempts++
      delivery.lastAttempt = startTime
      delivery.status = 'pending'

      logger.debug('Delivering webhook', {
        deliveryId: delivery.id,
        webhookId: delivery.webhookId,
        url: delivery.url,
        attempt: delivery.attempts
      })

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

      const response = await fetch(delivery.url, {
        method: 'POST',
        headers: delivery.headers,
        body: JSON.stringify(delivery.payload),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      const endTime = Date.now()
      delivery.responseTime = endTime - startTime
      delivery.statusCode = response.status

      if (response.ok) {
        delivery.status = 'success'
        logger.debug('Webhook delivered successfully', {
          deliveryId: delivery.id,
          statusCode: response.status,
          responseTime: delivery.responseTime
        })
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

    } catch (error) {
      const endTime = Date.now()
      delivery.responseTime = endTime - startTime
      delivery.error = error instanceof Error ? error.message : 'Unknown error'

      if (delivery.attempts < this.config.maxRetries) {
        delivery.status = 'retry'
        delivery.nextRetry = Date.now() + (this.config.retryDelay * delivery.attempts)
        this.retryQueue.add(delivery.id)
        
        logger.warn('Webhook delivery failed, will retry', {
          deliveryId: delivery.id,
          attempt: delivery.attempts,
          error: delivery.error,
          nextRetry: delivery.nextRetry
        })
      } else {
        delivery.status = 'failed'
        
        logger.error('Webhook delivery failed permanently', undefined, {
          deliveryId: delivery.id,
          attempts: delivery.attempts,
          errorMessage: delivery.error
        })
      }
    }

    // Update delivery record
    this.deliveries.set(delivery.id, delivery)

    // Record metrics
    await this.recordMetric('webhook_delivery', 1, {
      status: delivery.status,
      statusCode: delivery.statusCode?.toString() || 'unknown',
      attempt: delivery.attempts.toString()
    })

    return delivery
  }

  private startRetryProcessor(): void {
    setInterval(async () => {
      if (this.retryQueue.size === 0) return

      const now = Date.now()
      const retryDeliveries: WebhookDelivery[] = []

      // Find deliveries ready for retry
      for (const deliveryId of this.retryQueue) {
        const delivery = this.deliveries.get(deliveryId)
        if (delivery && delivery.nextRetry && delivery.nextRetry <= now) {
          retryDeliveries.push(delivery)
          this.retryQueue.delete(deliveryId)
        }
      }

      // Process retries
      for (const delivery of retryDeliveries) {
        await this.deliverWebhook(delivery)
      }

    }, 5000) // Check every 5 seconds
  }

  private generateSignature(payload: string, secret: string): string {
    // In a real implementation, use HMAC-SHA256
    // This is a simplified version for demonstration
    const crypto = require('crypto')
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(payload)
    return `sha256=${hmac.digest('hex')}`
  }

  private async recordMetric(metric: string, value: number, labels: Record<string, string> = {}): Promise<void> {
    try {
      await metricsCollector.recordMetric(metric, value, 'count', labels)
    } catch (error) {
      // Ignore metrics errors to prevent webhook system disruption
      logger.debug('Failed to record webhook metric', { metric, error })
    }
  }
}

// Convenience functions for common webhook events

export const webhookEvents = {
  sourcesSoughtCreated: (opportunity: any) => ({
    id: `ss_created_${opportunity.id}_${Date.now()}`,
    type: 'sources_sought.created',
    data: opportunity,
    timestamp: Date.now(),
    source: 'sources_sought_service'
  }),

  sourcesSoughtDeadlineApproaching: (opportunity: any, daysRemaining: number) => ({
    id: `ss_deadline_${opportunity.id}_${Date.now()}`,
    type: 'sources_sought.deadline_approaching',
    data: {
      opportunity,
      daysRemaining,
      responseDeadline: opportunity.responseDeadline
    },
    timestamp: Date.now(),
    source: 'deadline_monitor'
  }),

  workflowCompleted: (workflow: any, result: any) => ({
    id: `wf_completed_${workflow.id}_${Date.now()}`,
    type: 'workflow.completed',
    data: {
      workflow,
      result,
      completedAt: new Date().toISOString()
    },
    timestamp: Date.now(),
    source: 'workflow_engine'
  }),

  documentGenerated: (document: any, userId: string) => ({
    id: `doc_generated_${document.id}_${Date.now()}`,
    type: 'document.generated',
    data: document,
    timestamp: Date.now(),
    source: 'document_service',
    userId
  })
}

export default WebhookManager