/**
 * GovBiz.ai Multi-Agent System
 * 
 * This module exports all agents and orchestration components for the 
 * GovBiz.ai platform's multi-agent communication system.
 */

// Core orchestration
export { AgentOrchestrator, agentOrchestrator } from './AgentOrchestrator';
export type {
  Agent,
  AgentMessage,
  AgentCapability,
  AgentMetadata,
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  WorkflowResult,
} from './AgentOrchestrator';

// Base agent classes
export { BaseAgent, SpecialistAgent, UtilityAgent, MonitorAgent } from './BaseAgent';

// Specialized agents
export { SourcesSoughtAgent } from './SourcesSoughtAgent';
export { DocumentAgent } from './DocumentAgent';
export { WorkflowAgent } from './WorkflowAgent';
export { MonitoringAgent } from './MonitoringAgent';
export { NotificationAgent } from './NotificationAgent';

// Import classes for internal use
import { AgentOrchestrator, agentOrchestrator, type WorkflowDefinition, type AgentMessage } from './AgentOrchestrator';
import { SourcesSoughtAgent } from './SourcesSoughtAgent';
import { DocumentAgent } from './DocumentAgent';
import { WorkflowAgent } from './WorkflowAgent';
import { MonitoringAgent } from './MonitoringAgent';
import { NotificationAgent } from './NotificationAgent';

// Agent initialization and setup
export const initializeAgentSystem = async () => {
  const orchestrator = agentOrchestrator;
  
  // Initialize all agents
  const agents = [
    new SourcesSoughtAgent(),
    new DocumentAgent(),
    new WorkflowAgent(),
    new MonitoringAgent(),
    new NotificationAgent(),
  ];
  
  // Register all agents with the orchestrator
  for (const agent of agents) {
    await orchestrator.registerAgent(agent);
  }
  
  return {
    orchestrator,
    agents: agents.map(agent => ({
      id: agent.metadata.id,
      name: agent.metadata.name,
      type: agent.metadata.type,
      capabilities: agent.getCapabilities(),
    })),
  };
};

// Utility functions for common agent operations
export const createSourcesSoughtWorkflow = (opportunityId: string, userProfile: any): WorkflowDefinition => ({
  id: `sources_sought_${opportunityId}`,
  name: 'Sources Sought Response Generation',
  description: 'Complete workflow for finding and responding to Sources Sought opportunities',
  steps: [
    {
      id: 'search_opportunities',
      capability: 'search_opportunities',
      input: {
        keywords: userProfile.keywords,
        naicsCodes: userProfile.naicsCodes,
        limit: 50,
      },
      outputVariable: 'opportunities',
    },
    {
      id: 'analyze_opportunity',
      capability: 'analyze_opportunity',
      input: {
        opportunityId: '$opportunityId',
        userProfile: userProfile,
      },
      outputVariable: 'analysis',
    },
    {
      id: 'generate_response',
      capability: 'generate_response',
      input: {
        opportunityId: '$opportunityId',
        userProfile: userProfile,
        analysis: '$analysis',
      },
      outputVariable: 'response',
      optional: false,
    },
    {
      id: 'validate_compliance',
      capability: 'validate_compliance',
      input: {
        content: '$response.content',
        standard: 'government',
      },
      outputVariable: 'compliance',
    },
    {
      id: 'send_notification',
      capability: 'send_email',
      input: {
        to: [userProfile.email],
        subject: 'Sources Sought Response Generated',
        template: 'response_generated',
        templateData: {
          userName: userProfile.name,
          opportunityTitle: '$opportunities[0].title',
          generatedAt: new Date().toISOString(),
          wordCount: '$response.metadata.wordCount',
        },
      },
      optional: true,
    },
  ],
  timeout: 300000, // 5 minutes
});

export const createDeadlineMonitoringWorkflow = (userId: string): WorkflowDefinition => ({
  id: `deadline_monitoring_${userId}`,
  name: 'Deadline Monitoring',
  description: 'Monitor upcoming deadlines and send alerts',
  steps: [
    {
      id: 'check_deadlines',
      capability: 'monitor_deadlines',
      input: {
        userId: userId,
      },
      outputVariable: 'deadlines',
    },
    {
      id: 'generate_alerts',
      capability: 'send_alert',
      input: {
        alertType: 'deadline',
        severity: 'warning',
        title: 'Upcoming Deadlines',
        message: 'You have upcoming response deadlines',
        recipients: ['$userEmail'],
        channels: ['email', 'slack'],
      },
      condition: '$deadlines.alerts.length > 0',
      optional: true,
    },
  ],
  timeout: 60000, // 1 minute
});

export const createSystemHealthWorkflow = (): WorkflowDefinition => ({
  id: 'system_health_check',
  name: 'System Health Check',
  description: 'Comprehensive system health monitoring',
  steps: [
    {
      id: 'collect_metrics',
      capability: 'collect_metrics',
      input: {
        metricType: 'performance',
        timeRange: {
          start: new Date(Date.now() - 3600000).toISOString(), // Last hour
          end: new Date().toISOString(),
        },
      },
      outputVariable: 'metrics',
    },
    {
      id: 'health_check',
      capability: 'health_check',
      input: {
        services: ['api', 'database', 'storage', 'messaging'],
        depth: 'comprehensive',
      },
      outputVariable: 'health',
    },
    {
      id: 'detect_anomalies',
      capability: 'detect_anomalies',
      input: {
        metricData: '$metrics.metrics',
        sensitivity: 0.8,
      },
      outputVariable: 'anomalies',
    },
    {
      id: 'alert_if_issues',
      capability: 'send_alert',
      input: {
        alertType: 'system',
        severity: 'critical',
        title: 'System Health Issues Detected',
        message: 'System health check detected issues requiring attention',
        recipients: ['admin@govbiz.ai'],
        channels: ['email', 'slack'],
      },
      condition: '$health.status !== "healthy" || $anomalies.length > 0',
      optional: true,
    },
  ],
  timeout: 120000, // 2 minutes
});

// Agent capability discovery helpers
export const findAgentsByCapability = async (capabilityName: string) => {
  const orchestrator = agentOrchestrator;
  const agents = orchestrator.getRegisteredAgents();
  
  return agents.filter(agent => 
    agent.capabilities.some(cap => cap.name === capabilityName)
  );
};

export const getSystemCapabilities = async () => {
  const orchestrator = agentOrchestrator;
  return orchestrator.getAllCapabilities();
};

// Common agent message helpers
export const createAgentRequest = (
  from: string,
  to: string,
  capability: string,
  input: any,
  options: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    timeout?: number;
    requiresResponse?: boolean;
  } = {}
): Omit<AgentMessage, 'id' | 'timestamp'> => ({
  type: 'request',
  from,
  to,
  payload: {
    capability,
    input,
  },
  priority: options.priority || 'medium',
  timeout: options.timeout,
  requiresResponse: options.requiresResponse ?? true,
});

export const createBroadcastMessage = (
  from: string,
  capability: string,
  input: any,
  priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): Omit<AgentMessage, 'id' | 'timestamp'> => ({
  type: 'broadcast',
  from,
  requiresResponse: false,
  payload: {
    capability,
    input,
  },
  priority,
});

// Error handling helpers
export const isAgentError = (message: AgentMessage): boolean => {
  return message.type === 'error';
};

export const extractErrorMessage = (message: AgentMessage): string => {
  if (message.type === 'error' && message.payload?.message) {
    return message.payload.message;
  }
  return 'Unknown error';
};

// Agent system status and diagnostics
export const getAgentSystemStatus = async () => {
  const orchestrator = agentOrchestrator;
  const agents = orchestrator.getRegisteredAgents();
  
  return {
    orchestrator: {
      isRunning: true,
      queueSize: orchestrator.getQueueSize(),
      registeredAgents: agents.length,
    },
    agents: agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      healthScore: agent.healthScore,
      lastSeen: agent.lastSeen,
      capabilities: agent.capabilities.length,
    })),
    summary: {
      totalCapabilities: agents.reduce((sum, agent) => sum + agent.capabilities.length, 0),
      healthyAgents: agents.filter(agent => agent.status === 'idle').length,
      busyAgents: agents.filter(agent => agent.status === 'busy').length,
      errorAgents: agents.filter(agent => agent.status === 'error').length,
      offlineAgents: agents.filter(agent => agent.status === 'offline').length,
    },
  };
};

// Shutdown helper
export const shutdownAgentSystem = async () => {
  const orchestrator = agentOrchestrator;
  await orchestrator.shutdown();
};

const agentSystem = {
  initializeAgentSystem,
  createSourcesSoughtWorkflow,
  createDeadlineMonitoringWorkflow,
  createSystemHealthWorkflow,
  findAgentsByCapability,
  getSystemCapabilities,
  createAgentRequest,
  createBroadcastMessage,
  isAgentError,
  extractErrorMessage,
  getAgentSystemStatus,
  shutdownAgentSystem,
};

export default agentSystem;