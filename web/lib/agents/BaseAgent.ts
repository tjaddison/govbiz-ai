import { Agent, AgentMetadata, AgentMessage, AgentCapability, AgentMessageSchema } from './AgentOrchestrator';

export abstract class BaseAgent implements Agent {
  public metadata: AgentMetadata;
  protected isInitialized: boolean = false;
  protected configuration: Record<string, any> = {};

  constructor(metadata: Omit<AgentMetadata, 'status' | 'lastSeen' | 'healthScore'>) {
    this.metadata = {
      ...metadata,
      status: 'offline',
      lastSeen: Date.now(),
      healthScore: 100,
    };
  }

  async initialize(): Promise<void> {
    try {
      await this.onInitialize();
      this.metadata.status = 'idle';
      this.metadata.lastSeen = Date.now();
      this.isInitialized = true;
      console.log(`Agent ${this.metadata.name} initialized successfully`);
    } catch (error) {
      this.metadata.status = 'error';
      console.error(`Failed to initialize agent ${this.metadata.name}:`, error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.onShutdown();
      this.metadata.status = 'offline';
      this.isInitialized = false;
      console.log(`Agent ${this.metadata.name} shutdown successfully`);
    } catch (error) {
      console.error(`Error shutting down agent ${this.metadata.name}:`, error);
      throw error;
    }
  }

  async processMessage(message: AgentMessage): Promise<AgentMessage | null> {
    // Validate message
    const validatedMessage = AgentMessageSchema.parse(message);

    // Update last seen
    this.metadata.lastSeen = Date.now();

    // Check if agent is available
    if (!this.isInitialized || this.metadata.status === 'offline') {
      return this.createErrorResponse(validatedMessage, 'Agent is not available');
    }

    try {
      // Set status to busy
      this.metadata.status = 'busy';
      
      // Process the message
      const response = await this.onProcessMessage(validatedMessage);
      
      // Reset status to idle
      this.metadata.status = 'idle';
      
      return response;
    } catch (error) {
      this.metadata.status = 'error';
      console.error(`Error processing message in agent ${this.metadata.name}:`, error);
      return this.createErrorResponse(validatedMessage, error instanceof Error ? error.message : String(error));
    }
  }

  getCapabilities(): AgentCapability[] {
    return this.metadata.capabilities;
  }

  getStatus(): AgentMetadata['status'] {
    return this.metadata.status;
  }

  // Protected helper methods
  protected createResponse(originalMessage: AgentMessage, payload: any): AgentMessage {
    return {
      id: this.generateMessageId(),
      type: 'response',
      priority: 'medium',
      from: this.metadata.id,
      to: originalMessage.from,
      timestamp: Date.now(),
      requiresResponse: false,
      payload,
      correlationId: originalMessage.id,
    };
  }

  protected createErrorResponse(originalMessage: AgentMessage, errorMessage: string): AgentMessage {
    return {
      id: this.generateMessageId(),
      type: 'error',
      priority: 'high',
      from: this.metadata.id,
      to: originalMessage.from,
      timestamp: Date.now(),
      requiresResponse: false,
      payload: {
        error: true,
        message: errorMessage,
      },
      correlationId: originalMessage.id,
    };
  }

  protected createNotification(payload: any, to?: string): AgentMessage {
    return {
      id: this.generateMessageId(),
      type: 'notification',
      priority: 'low',
      from: this.metadata.id,
      to,
      timestamp: Date.now(),
      requiresResponse: false,
      payload,
    };
  }

  protected generateMessageId(): string {
    return `${this.metadata.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected updateHealthScore(score: number): void {
    this.metadata.healthScore = Math.max(0, Math.min(100, score));
  }

  protected logActivity(activity: string, details?: any): void {
    console.log(`[${this.metadata.name}] ${activity}`, details ? JSON.stringify(details, null, 2) : '');
  }

  // Abstract methods that must be implemented by concrete agents
  protected abstract onInitialize(): Promise<void>;
  protected abstract onShutdown(): Promise<void>;
  protected abstract onProcessMessage(message: AgentMessage): Promise<AgentMessage | null>;

  // Optional lifecycle hooks
  protected async onConfigurationChanged(newConfig: Record<string, any>): Promise<void> {
    this.configuration = { ...this.configuration, ...newConfig };
  }

  // Utility methods for common operations
  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected validatePayload<T>(payload: any, schema: any): T {
    try {
      return schema.parse(payload);
    } catch (error) {
      throw new Error(`Invalid payload: ${error}`);
    }
  }

  protected async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        this.logActivity(`Retry ${attempt}/${maxRetries} failed, waiting ${delayMs}ms`, { error: lastError.message });
        await this.sleep(delayMs * attempt); // Exponential backoff
      }
    }
    
    throw lastError!;
  }

  // Health monitoring
  protected reportHealthCheck(): void {
    this.metadata.lastSeen = Date.now();
    
    // Simple health score calculation based on recent activity
    const timeSinceLastActivity = Date.now() - this.metadata.lastSeen;
    const baseScore = 100;
    const penaltyPerMinute = 2;
    const minutesSinceActivity = timeSinceLastActivity / (1000 * 60);
    
    this.metadata.healthScore = Math.max(0, baseScore - (minutesSinceActivity * penaltyPerMinute));
  }

  // Configuration management
  async updateConfiguration(newConfig: Record<string, any>): Promise<void> {
    await this.onConfigurationChanged(newConfig);
    this.metadata.configuration = { ...this.metadata.configuration, ...newConfig };
  }

  getConfiguration(): Record<string, any> {
    return { ...this.configuration };
  }
}

// Specialized base classes for different agent types

export abstract class SpecialistAgent extends BaseAgent {
  constructor(
    name: string,
    description: string,
    capabilities: AgentCapability[],
    version: string = '1.0.0'
  ) {
    super({
      id: `specialist_${name.toLowerCase().replace(/\s+/g, '_')}`,
      name,
      type: 'specialist',
      description,
      capabilities,
      version,
    });
  }
}

export abstract class UtilityAgent extends BaseAgent {
  constructor(
    name: string,
    description: string,
    capabilities: AgentCapability[],
    version: string = '1.0.0'
  ) {
    super({
      id: `utility_${name.toLowerCase().replace(/\s+/g, '_')}`,
      name,
      type: 'utility',
      description,
      capabilities,
      version,
    });
  }
}

export abstract class MonitorAgent extends BaseAgent {
  protected monitoringInterval: NodeJS.Timeout | null = null;
  protected monitoringFrequency: number = 60000; // 1 minute default

  constructor(
    name: string,
    description: string,
    capabilities: AgentCapability[],
    version: string = '1.0.0'
  ) {
    super({
      id: `monitor_${name.toLowerCase().replace(/\s+/g, '_')}`,
      name,
      type: 'monitor',
      description,
      capabilities,
      version,
    });
  }

  protected async onInitialize(): Promise<void> {
    await this.startMonitoring();
  }

  protected async onShutdown(): Promise<void> {
    await this.stopMonitoring();
  }

  protected async startMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performMonitoring();
      } catch (error) {
        console.error(`Monitoring error in ${this.metadata.name}:`, error);
        this.updateHealthScore(this.metadata.healthScore - 10);
      }
    }, this.monitoringFrequency);

    this.logActivity('Monitoring started');
  }

  protected async stopMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.logActivity('Monitoring stopped');
  }

  protected setMonitoringFrequency(frequencyMs: number): void {
    this.monitoringFrequency = frequencyMs;
    if (this.monitoringInterval) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  // Abstract method for monitoring implementation
  protected abstract performMonitoring(): Promise<void>;
}