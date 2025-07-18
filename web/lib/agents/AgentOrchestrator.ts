import { EventEmitter } from 'events';
import { z } from 'zod';

// Agent communication schemas
export const AgentMessageSchema = z.object({
  id: z.string(),
  type: z.enum(['request', 'response', 'broadcast', 'notification', 'error']),
  from: z.string(),
  to: z.string().optional(),
  timestamp: z.number(),
  payload: z.any(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  correlationId: z.string().optional(),
  requiresResponse: z.boolean().default(false),
  timeout: z.number().optional(),
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const AgentCapabilitySchema = z.object({
  name: z.string(),
  description: z.string(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  cost: z.number().optional(),
  estimatedDuration: z.number().optional(),
  prerequisites: z.array(z.string()).optional(),
});

export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const AgentMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['specialist', 'orchestrator', 'utility', 'monitor']),
  description: z.string(),
  capabilities: z.array(AgentCapabilitySchema),
  status: z.enum(['idle', 'busy', 'error', 'offline']),
  version: z.string(),
  healthScore: z.number().min(0).max(100),
  lastSeen: z.number(),
  configuration: z.record(z.any()).optional(),
});

export type AgentMetadata = z.infer<typeof AgentMetadataSchema>;

export interface Agent {
  metadata: AgentMetadata;
  processMessage: (message: AgentMessage) => Promise<AgentMessage | null>;
  getCapabilities: () => AgentCapability[];
  getStatus: () => AgentMetadata['status'];
  initialize: () => Promise<void>;
  shutdown: () => Promise<void>;
}

export class AgentOrchestrator extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private messageQueue: AgentMessage[] = [];
  private responseWaiters: Map<string, {
    resolve: (message: AgentMessage) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private isProcessing: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startHealthMonitoring();
  }

  // Agent registration and management
  async registerAgent(agent: Agent): Promise<void> {
    try {
      await agent.initialize();
      this.agents.set(agent.metadata.id, agent);
      
      this.emit('agentRegistered', {
        agentId: agent.metadata.id,
        agentName: agent.metadata.name,
        capabilities: agent.getCapabilities(),
      });

      console.log(`Agent ${agent.metadata.name} (${agent.metadata.id}) registered successfully`);
    } catch (error) {
      console.error(`Failed to register agent ${agent.metadata.id}:`, error);
      throw error;
    }
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      await agent.shutdown();
      this.agents.delete(agentId);
      
      this.emit('agentUnregistered', {
        agentId,
        agentName: agent.metadata.name,
      });

      console.log(`Agent ${agentId} unregistered successfully`);
    }
  }

  // Message routing and communication
  async sendMessage(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<AgentMessage | null> {
    const fullMessage: AgentMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: Date.now(),
    };

    // Validate message
    const validatedMessage = AgentMessageSchema.parse(fullMessage);

    // Add to queue
    this.messageQueue.push(validatedMessage);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }

    // If response is required, wait for it
    if (validatedMessage.requiresResponse && validatedMessage.to) {
      return this.waitForResponse(validatedMessage);
    }

    return null;
  }

  async broadcast(message: Omit<AgentMessage, 'id' | 'timestamp' | 'to' | 'type'>): Promise<AgentMessage[]> {
    const responses: AgentMessage[] = [];
    
    for (const [agentId, agent] of this.agents) {
      if (agentId !== message.from) {
        try {
          const response = await this.sendMessage({
            ...message,
            to: agentId,
            type: 'broadcast',
          });
          
          if (response) {
            responses.push(response);
          }
        } catch (error) {
          console.error(`Failed to broadcast to agent ${agentId}:`, error);
        }
      }
    }

    return responses;
  }

  // Capability discovery and routing
  findAgentByCapability(capabilityName: string): Agent | null {
    for (const agent of this.agents.values()) {
      const hasCapability = agent.getCapabilities().some(cap => cap.name === capabilityName);
      if (hasCapability && agent.getStatus() === 'idle') {
        return agent;
      }
    }
    return null;
  }

  getAgentCapabilities(agentId: string): AgentCapability[] {
    const agent = this.agents.get(agentId);
    return agent ? agent.getCapabilities() : [];
  }

  getAllCapabilities(): Record<string, AgentCapability[]> {
    const capabilities: Record<string, AgentCapability[]> = {};
    
    for (const [agentId, agent] of this.agents) {
      capabilities[agentId] = agent.getCapabilities();
    }
    
    return capabilities;
  }

  // Workflow orchestration
  async executeWorkflow(workflowDefinition: WorkflowDefinition): Promise<WorkflowResult> {
    const workflowId = this.generateWorkflowId();
    const startTime = Date.now();

    try {
      this.emit('workflowStarted', { workflowId, definition: workflowDefinition });

      const context: WorkflowContext = {
        workflowId,
        variables: {},
        results: {},
        errors: [],
      };

      const result = await this.executeWorkflowSteps(workflowDefinition.steps, context);

      const endTime = Date.now();
      const workflowResult: WorkflowResult = {
        workflowId,
        success: result.success,
        results: result.results,
        errors: result.errors,
        duration: endTime - startTime,
        completedAt: endTime,
      };

      this.emit('workflowCompleted', workflowResult);
      return workflowResult;
    } catch (error) {
      const endTime = Date.now();
      const workflowResult: WorkflowResult = {
        workflowId,
        success: false,
        results: {},
        errors: [error instanceof Error ? error.message : String(error)],
        duration: endTime - startTime,
        completedAt: endTime,
      };

      this.emit('workflowFailed', workflowResult);
      return workflowResult;
    }
  }

  // Private methods
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        if (!message) continue;

        await this.routeMessage(message);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async routeMessage(message: AgentMessage): Promise<void> {
    try {
      if (message.to) {
        // Direct message to specific agent
        const agent = this.agents.get(message.to);
        if (agent) {
          const response = await agent.processMessage(message);
          if (response && message.requiresResponse) {
            this.handleResponse(message.id, response);
          }
        } else {
          console.error(`Agent ${message.to} not found`);
        }
      } else if (message.type === 'broadcast') {
        // Broadcast to all agents except sender
        for (const [agentId, agent] of this.agents) {
          if (agentId !== message.from) {
            try {
              await agent.processMessage(message);
            } catch (error) {
              console.error(`Failed to deliver broadcast to ${agentId}:`, error);
            }
          }
        }
      }

      this.emit('messageProcessed', message);
    } catch (error) {
      console.error('Failed to route message:', error);
      this.emit('messageError', { message, error });
    }
  }

  private waitForResponse(message: AgentMessage): Promise<AgentMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseWaiters.delete(message.id);
        reject(new Error(`Timeout waiting for response to message ${message.id}`));
      }, message.timeout || 30000);

      this.responseWaiters.set(message.id, {
        resolve,
        reject,
        timeout,
      });
    });
  }

  private handleResponse(originalMessageId: string, response: AgentMessage): void {
    const waiter = this.responseWaiters.get(originalMessageId);
    if (waiter) {
      clearTimeout(waiter.timeout);
      this.responseWaiters.delete(originalMessageId);
      waiter.resolve(response);
    }
  }

  private async executeWorkflowSteps(
    steps: WorkflowStep[],
    context: WorkflowContext
  ): Promise<{ success: boolean; results: Record<string, any>; errors: string[] }> {
    const results: Record<string, any> = {};
    const errors: string[] = [];

    for (const step of steps) {
      try {
        const stepResult = await this.executeWorkflowStep(step, context);
        results[step.id] = stepResult;
        context.results[step.id] = stepResult;

        // Update context variables if specified
        if (step.outputVariable) {
          context.variables[step.outputVariable] = stepResult;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Step ${step.id}: ${errorMessage}`);
        
        if (!step.optional) {
          return { success: false, results, errors };
        }
      }
    }

    return { success: true, results, errors };
  }

  private async executeWorkflowStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const agent = this.findAgentByCapability(step.capability);
    if (!agent) {
      throw new Error(`No agent found with capability: ${step.capability}`);
    }

    // Prepare input data
    const inputData = this.prepareStepInput(step, context);

    // Send message to agent
    const response = await this.sendMessage({
      type: 'request',
      from: 'orchestrator',
      to: agent.metadata.id,
      priority: 'medium',
      payload: {
        capability: step.capability,
        input: inputData,
        stepId: step.id,
        workflowId: context.workflowId,
      },
      requiresResponse: true,
      timeout: step.timeout || 60000,
    });

    if (!response) {
      throw new Error(`No response from agent ${agent.metadata.id} for step ${step.id}`);
    }

    if (response.type === 'error') {
      throw new Error(response.payload.message || 'Agent returned error');
    }

    return response.payload;
  }

  private prepareStepInput(step: WorkflowStep, context: WorkflowContext): any {
    if (!step.input) return {};

    const input: any = {};
    
    for (const [key, value] of Object.entries(step.input)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        // Variable reference
        const varName = value.slice(1);
        input[key] = context.variables[varName];
      } else {
        input[key] = value;
      }
    }

    return input;
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [agentId, agent] of this.agents) {
        try {
          const status = agent.getStatus();
          if (status === 'offline' || Date.now() - agent.metadata.lastSeen > 60000) {
            this.emit('agentUnhealthy', {
              agentId,
              status,
              lastSeen: agent.metadata.lastSeen,
            });
          }
        } catch (error) {
          console.error(`Health check failed for agent ${agentId}:`, error);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateWorkflowId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Cleanup
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Shutdown all agents
    const shutdownPromises = Array.from(this.agents.values()).map(agent => 
      agent.shutdown().catch(error => 
        console.error(`Error shutting down agent ${agent.metadata.id}:`, error)
      )
    );

    await Promise.all(shutdownPromises);
    this.agents.clear();
    this.messageQueue.length = 0;
    this.responseWaiters.clear();
  }

  // Getters
  getRegisteredAgents(): AgentMetadata[] {
    return Array.from(this.agents.values()).map(agent => agent.metadata);
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }

  isAgentRegistered(agentId: string): boolean {
    return this.agents.has(agentId);
  }
}

// Workflow types
export interface WorkflowStep {
  id: string;
  capability: string;
  input?: Record<string, any>;
  outputVariable?: string;
  timeout?: number;
  optional?: boolean;
  condition?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  timeout?: number;
}

export interface WorkflowContext {
  workflowId: string;
  variables: Record<string, any>;
  results: Record<string, any>;
  errors: string[];
}

export interface WorkflowResult {
  workflowId: string;
  success: boolean;
  results: Record<string, any>;
  errors: string[];
  duration: number;
  completedAt: number;
}

// Export singleton instance
export const agentOrchestrator = new AgentOrchestrator();