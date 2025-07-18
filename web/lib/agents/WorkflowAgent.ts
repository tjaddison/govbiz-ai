import { z } from 'zod';
import { UtilityAgent } from './BaseAgent';
import { AgentMessage, AgentCapability } from './AgentOrchestrator';

// Schemas for workflow operations
const WorkflowExecutionSchema = z.object({
  workflowType: z.enum(['sources_sought_response', 'deadline_monitoring', 'opportunity_analysis', 'document_generation']),
  parameters: z.record(z.any()),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  deadline: z.string().optional(),
});

const WorkflowOptimizationSchema = z.object({
  userId: z.string(),
  workflowHistory: z.array(z.any()),
  currentWorkload: z.number().min(0).max(100),
  preferences: z.record(z.any()).optional(),
});

const WorkflowSchedulingSchema = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    type: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    estimatedDuration: z.number(),
    dependencies: z.array(z.string()).optional(),
  })),
  availableAgents: z.array(z.string()),
  constraints: z.record(z.any()).optional(),
});

export class WorkflowAgent extends UtilityAgent {
  private workflowTemplates: Map<string, any> = new Map();
  private activeWorkflows: Map<string, any> = new Map();
  private optimizationRules: any[] = [];

  constructor() {
    const capabilities: AgentCapability[] = [
      {
        name: 'execute_workflow',
        description: 'Execute predefined workflows with dynamic parameters',
        inputs: ['workflowType', 'parameters', 'priority'],
        outputs: ['workflowId', 'status', 'results'],
        cost: 0.5,
        estimatedDuration: 10000,
      },
      {
        name: 'optimize_workflow',
        description: 'Analyze and optimize workflow performance',
        inputs: ['userId', 'workflowHistory', 'currentWorkload'],
        outputs: ['optimizations', 'recommendations', 'efficiency'],
        cost: 0.3,
        estimatedDuration: 5000,
      },
      {
        name: 'schedule_tasks',
        description: 'Intelligently schedule tasks across available agents',
        inputs: ['tasks', 'availableAgents', 'constraints'],
        outputs: ['schedule', 'assignments', 'timeline'],
        cost: 0.2,
        estimatedDuration: 3000,
      },
      {
        name: 'monitor_progress',
        description: 'Monitor and track workflow execution progress',
        inputs: ['workflowId'],
        outputs: ['progress', 'status', 'bottlenecks'],
        cost: 0.1,
        estimatedDuration: 1000,
      },
      {
        name: 'suggest_improvements',
        description: 'Suggest workflow improvements based on patterns',
        inputs: ['workflowData', 'performanceMetrics'],
        outputs: ['suggestions', 'impact', 'implementation'],
        cost: 0.4,
        estimatedDuration: 7000,
      },
    ];

    super(
      'Workflow Optimizer',
      'Utility agent for workflow automation, optimization, and intelligent task scheduling',
      capabilities,
      '1.5.0'
    );
  }

  protected async onInitialize(): Promise<void> {
    await this.loadWorkflowTemplates();
    await this.initializeOptimizationRules();
    this.logActivity('Workflow Agent initialized with templates and optimization rules');
  }

  protected async onShutdown(): Promise<void> {
    // Save any pending workflow states
    await this.saveWorkflowStates();
    this.logActivity('Workflow Agent shutting down');
  }

  protected async onProcessMessage(message: AgentMessage): Promise<AgentMessage | null> {
    const { capability, input } = message.payload;

    try {
      switch (capability) {
        case 'execute_workflow':
          return await this.handleExecuteWorkflow(message, input);
        
        case 'optimize_workflow':
          return await this.handleOptimizeWorkflow(message, input);
        
        case 'schedule_tasks':
          return await this.handleScheduleTasks(message, input);
        
        case 'monitor_progress':
          return await this.handleMonitorProgress(message, input);
        
        case 'suggest_improvements':
          return await this.handleSuggestImprovements(message, input);
        
        default:
          return this.createErrorResponse(message, `Unknown capability: ${capability}`);
      }
    } catch (error) {
      return this.createErrorResponse(message, error instanceof Error ? error.message : String(error));
    }
  }

  private async handleExecuteWorkflow(message: AgentMessage, input: any): Promise<AgentMessage> {
    const params = this.validatePayload(input, WorkflowExecutionSchema) as any;
    
    this.logActivity('Executing workflow', { type: params.workflowType, priority: params.priority });
    
    try {
      const workflowId = this.generateWorkflowId();
      const execution = await this.executeWorkflow(workflowId, params);
      
      // Store active workflow
      this.activeWorkflows.set(workflowId, {
        id: workflowId,
        type: params.workflowType,
        status: 'running',
        startedAt: Date.now(),
        parameters: params.parameters,
        progress: 0,
      });
      
      return this.createResponse(message, {
        workflowId,
        status: execution.status,
        steps: execution.steps,
        estimatedCompletion: execution.estimatedCompletion,
        executedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to execute workflow: ${error}`);
    }
  }

  private async handleOptimizeWorkflow(message: AgentMessage, input: any): Promise<AgentMessage> {
    const params = this.validatePayload(input, WorkflowOptimizationSchema) as any;
    
    this.logActivity('Optimizing workflow', { userId: params.userId });
    
    try {
      const analysis = await this.analyzeWorkflowPerformance(params);
      const optimizations = await this.generateOptimizations(analysis);
      
      return this.createResponse(message, {
        optimizations,
        recommendations: optimizations.recommendations,
        efficiency: analysis.currentEfficiency,
        potentialImprovement: optimizations.estimatedImprovement,
        optimizedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to optimize workflow: ${error}`);
    }
  }

  private async handleScheduleTasks(message: AgentMessage, input: any): Promise<AgentMessage> {
    const params = this.validatePayload(input, WorkflowSchedulingSchema) as any;
    
    this.logActivity('Scheduling tasks', { taskCount: params.tasks.length });
    
    try {
      const schedule = await this.optimizeTaskScheduling(params);
      
      return this.createResponse(message, {
        schedule: schedule.timeline,
        assignments: schedule.agentAssignments,
        timeline: schedule.completionEstimate,
        efficiency: schedule.utilizationScore,
        scheduledAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to schedule tasks: ${error}`);
    }
  }

  private async handleMonitorProgress(message: AgentMessage, input: any): Promise<AgentMessage> {
    const { workflowId } = input;
    
    this.logActivity('Monitoring progress', { workflowId });
    
    try {
      const workflow = this.activeWorkflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }
      
      const progress = await this.calculateWorkflowProgress(workflow);
      const bottlenecks = await this.identifyBottlenecks(workflow);
      
      return this.createResponse(message, {
        progress: progress.percentage,
        status: workflow.status,
        bottlenecks,
        estimatedCompletion: progress.estimatedCompletion,
        checkedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to monitor progress: ${error}`);
    }
  }

  private async handleSuggestImprovements(message: AgentMessage, input: any): Promise<AgentMessage> {
    const { workflowData, performanceMetrics } = input;
    
    this.logActivity('Suggesting improvements', { workflows: workflowData?.length || 0 });
    
    try {
      const suggestions = await this.analyzeAndSuggestImprovements(workflowData, performanceMetrics);
      
      return this.createResponse(message, {
        suggestions,
        impact: suggestions.map((s: any) => s.estimatedImpact),
        implementation: suggestions.map((s: any) => s.implementationSteps),
        suggestedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to suggest improvements: ${error}`);
    }
  }

  // Private implementation methods
  private async loadWorkflowTemplates(): Promise<void> {
    const templates = {
      sources_sought_response: {
        steps: [
          { id: 'search_opportunities', agent: 'sources_sought', capability: 'search_opportunities' },
          { id: 'analyze_fit', agent: 'sources_sought', capability: 'analyze_opportunity' },
          { id: 'generate_response', agent: 'sources_sought', capability: 'generate_response' },
          { id: 'validate_compliance', agent: 'document', capability: 'validate_compliance' },
        ],
        estimatedDuration: 20000,
      },
      deadline_monitoring: {
        steps: [
          { id: 'check_deadlines', agent: 'sources_sought', capability: 'monitor_deadlines' },
          { id: 'generate_alerts', agent: 'notification', capability: 'send_alert' },
        ],
        estimatedDuration: 5000,
      },
      opportunity_analysis: {
        steps: [
          { id: 'fetch_opportunity', agent: 'sources_sought', capability: 'search_opportunities' },
          { id: 'analyze_requirements', agent: 'sources_sought', capability: 'analyze_opportunity' },
          { id: 'classify_documents', agent: 'document', capability: 'classify_document' },
          { id: 'extract_contacts', agent: 'sources_sought', capability: 'extract_contacts' },
        ],
        estimatedDuration: 15000,
      },
      document_generation: {
        steps: [
          { id: 'prepare_data', agent: 'document', capability: 'extract_entities' },
          { id: 'generate_document', agent: 'document', capability: 'generate_document' },
          { id: 'validate_compliance', agent: 'document', capability: 'validate_compliance' },
        ],
        estimatedDuration: 12000,
      },
    };

    Object.entries(templates).forEach(([key, template]) => {
      this.workflowTemplates.set(key, template);
    });
  }

  private async initializeOptimizationRules(): Promise<void> {
    this.optimizationRules = [
      {
        name: 'parallel_execution',
        description: 'Execute independent tasks in parallel',
        condition: (tasks: any[]) => tasks.some(t => !t.dependencies?.length),
        optimization: 'Run independent tasks simultaneously',
        impact: 'high',
      },
      {
        name: 'agent_load_balancing',
        description: 'Distribute tasks across available agents',
        condition: (agents: any[]) => agents.length > 1,
        optimization: 'Balance workload across agents',
        impact: 'medium',
      },
      {
        name: 'priority_scheduling',
        description: 'Prioritize critical tasks',
        condition: (tasks: any[]) => tasks.some(t => t.priority === 'critical'),
        optimization: 'Schedule high-priority tasks first',
        impact: 'high',
      },
      {
        name: 'resource_pooling',
        description: 'Share resources between similar tasks',
        condition: (tasks: any[]) => tasks.length > 3,
        optimization: 'Pool common resources',
        impact: 'medium',
      },
    ];
  }

  private async executeWorkflow(workflowId: string, params: any) {
    const template = this.workflowTemplates.get(params.workflowType);
    if (!template) {
      throw new Error(`Unknown workflow type: ${params.workflowType}`);
    }

    // Simulate workflow execution
    const results = {
      status: 'initiated',
      steps: template.steps.map((step: any) => ({
        id: step.id,
        status: 'pending',
        agent: step.agent,
        capability: step.capability,
      })),
      estimatedCompletion: Date.now() + template.estimatedDuration,
    };

    return results;
  }

  private async analyzeWorkflowPerformance(params: any) {
    // Analyze historical workflow performance
    const history = params.workflowHistory || [];
    
    const analysis = {
      currentEfficiency: this.calculateEfficiency(history),
      commonBottlenecks: this.identifyCommonBottlenecks(history),
      averageCompletionTime: this.calculateAverageTime(history),
      successRate: this.calculateSuccessRate(history),
      resourceUtilization: params.currentWorkload / 100,
    };

    return analysis;
  }

  private async generateOptimizations(analysis: any) {
    const optimizations = {
      recommendations: [] as Array<{
        type: string;
        action: string;
        impact: number;
        effort: string;
      }>,
      estimatedImprovement: 0,
      implementationComplexity: 'medium',
    };

    // Generate recommendations based on analysis
    if (analysis.currentEfficiency < 0.7) {
      optimizations.recommendations.push({
        type: 'efficiency',
        action: 'Implement parallel processing for independent tasks',
        impact: 25,
        effort: 'medium',
      });
    }

    if (analysis.commonBottlenecks.length > 0) {
      optimizations.recommendations.push({
        type: 'bottleneck_removal',
        action: 'Add additional agent capacity for bottleneck operations',
        impact: 30,
        effort: 'high',
      });
    }

    if (analysis.resourceUtilization > 0.8) {
      optimizations.recommendations.push({
        type: 'load_balancing',
        action: 'Distribute workload more evenly across agents',
        impact: 20,
        effort: 'low',
      });
    }

    optimizations.estimatedImprovement = optimizations.recommendations.reduce(
      (total: number, rec: any) => total + rec.impact,
      0
    );

    return optimizations;
  }

  private async optimizeTaskScheduling(params: any) {
    const { tasks, availableAgents, constraints } = params;
    
    // Sort tasks by priority and dependencies
    const sortedTasks = this.prioritizeTasks(tasks);
    
    // Assign tasks to agents optimally
    const assignments = this.assignTasksToAgents(sortedTasks, availableAgents);
    
    // Calculate completion timeline
    const timeline = this.calculateTimeline(assignments);
    
    return {
      timeline,
      agentAssignments: assignments,
      completionEstimate: timeline.totalDuration,
      utilizationScore: this.calculateUtilization(assignments, availableAgents),
    };
  }

  private async calculateWorkflowProgress(workflow: any) {
    // Mock progress calculation based on time elapsed
    const elapsed = Date.now() - workflow.startedAt;
    const estimated = workflow.estimatedDuration || 30000;
    const percentage = Math.min((elapsed / estimated) * 100, 95); // Cap at 95% until complete
    
    return {
      percentage,
      estimatedCompletion: workflow.startedAt + estimated,
      currentStep: Math.floor((percentage / 100) * workflow.steps?.length || 0),
    };
  }

  private async identifyBottlenecks(workflow: any) {
    // Identify potential bottlenecks in workflow execution
    return [
      {
        type: 'agent_capacity',
        description: 'Document processing agent at capacity',
        severity: 'medium',
        suggestion: 'Consider adding additional document processing capacity',
      },
      {
        type: 'api_rate_limit',
        description: 'SAM.gov API rate limiting detected',
        severity: 'low',
        suggestion: 'Implement request queuing and retry logic',
      },
    ];
  }

  private async analyzeAndSuggestImprovements(workflowData: any[], performanceMetrics: any) {
    const suggestions = [];

    // Analyze workflow patterns
    if (performanceMetrics?.averageResponseTime > 30000) {
      suggestions.push({
        category: 'performance',
        title: 'Optimize response generation',
        description: 'Response generation taking longer than optimal',
        estimatedImpact: 40,
        implementationSteps: [
          'Cache frequently used templates',
          'Implement parallel document processing',
          'Optimize AI model calls',
        ],
      });
    }

    if (performanceMetrics?.errorRate > 0.05) {
      suggestions.push({
        category: 'reliability',
        title: 'Improve error handling',
        description: 'Error rate above acceptable threshold',
        estimatedImpact: 60,
        implementationSteps: [
          'Add comprehensive retry logic',
          'Implement circuit breakers',
          'Enhance error monitoring',
        ],
      });
    }

    // Analyze workflow efficiency
    const avgSteps = workflowData?.reduce((sum, w) => sum + (w.steps?.length || 0), 0) / (workflowData?.length || 1);
    if (avgSteps > 5) {
      suggestions.push({
        category: 'efficiency',
        title: 'Simplify workflow steps',
        description: 'Workflows have too many steps, causing delays',
        estimatedImpact: 25,
        implementationSteps: [
          'Combine related steps',
          'Eliminate redundant operations',
          'Implement smart defaults',
        ],
      });
    }

    return suggestions;
  }

  // Utility methods
  private generateWorkflowId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateEfficiency(history: any[]): number {
    if (!history.length) return 0.8; // Default efficiency
    
    const completed = history.filter(w => w.status === 'completed').length;
    return completed / history.length;
  }

  private identifyCommonBottlenecks(history: any[]): string[] {
    // Mock bottleneck identification
    return ['document_processing', 'api_rate_limits'];
  }

  private calculateAverageTime(history: any[]): number {
    if (!history.length) return 30000; // Default 30 seconds
    
    const times = history.map(w => w.duration || 30000);
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  private calculateSuccessRate(history: any[]): number {
    if (!history.length) return 0.95; // Default 95%
    
    const successful = history.filter(w => w.status === 'completed').length;
    return successful / history.length;
  }

  private prioritizeTasks(tasks: any[]): any[] {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    
    return tasks.sort((a, b) => {
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 1;
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 1;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      
      // Secondary sort by estimated duration (shorter first)
      return a.estimatedDuration - b.estimatedDuration;
    });
  }

  private assignTasksToAgents(tasks: any[], agents: string[]): any[] {
    const assignments: any[] = [];
    const agentWorkload: Record<string, number> = {};
    
    // Initialize workload tracking
    agents.forEach(agent => {
      agentWorkload[agent] = 0;
    });
    
    // Assign tasks to least loaded agents
    tasks.forEach(task => {
      const leastLoadedAgent = agents.reduce((min, agent) => 
        agentWorkload[agent] < agentWorkload[min] ? agent : min
      );
      
      assignments.push({
        taskId: task.id,
        agentId: leastLoadedAgent,
        startTime: agentWorkload[leastLoadedAgent],
        duration: task.estimatedDuration,
      });
      
      agentWorkload[leastLoadedAgent] += task.estimatedDuration;
    });
    
    return assignments;
  }

  private calculateTimeline(assignments: any[]): any {
    const maxCompletion = Math.max(...assignments.map(a => a.startTime + a.duration));
    
    return {
      totalDuration: maxCompletion,
      steps: assignments.map(a => ({
        taskId: a.taskId,
        agentId: a.agentId,
        startTime: a.startTime,
        endTime: a.startTime + a.duration,
      })),
    };
  }

  private calculateUtilization(assignments: any[], agents: string[]): number {
    const totalWork = assignments.reduce((sum, a) => sum + a.duration, 0);
    const totalCapacity = agents.length * Math.max(...assignments.map(a => a.startTime + a.duration));
    
    return totalCapacity > 0 ? totalWork / totalCapacity : 0;
  }

  private async saveWorkflowStates(): Promise<void> {
    // In production, this would save to persistent storage
    this.logActivity('Saving workflow states', { activeCount: this.activeWorkflows.size });
  }
}