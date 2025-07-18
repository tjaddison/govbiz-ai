/**
 * AI-Powered Workflow Optimization System
 * 
 * Intelligent workflow analysis, optimization suggestions, and automation
 * for government contracting processes with machine learning insights
 */

export { WorkflowAnalyzer } from './analyzer'
export { ProcessOptimizer } from './optimizer'
export { SuggestionEngine } from './suggestions'
export { AutomationEngine } from './automation'
export { PatternRecognition } from './patterns'
export { PerformanceTracker } from './performance'

// Main workflow optimization interface
export interface WorkflowOptimizer {
  analyzer: WorkflowAnalyzer
  optimizer: ProcessOptimizer
  suggestions: SuggestionEngine
  automation: AutomationEngine
  patterns: PatternRecognition
  performance: PerformanceTracker
}

// Re-export main types for convenience
export type {
  Workflow,
  WorkflowStep,
  WorkflowMetrics,
  OptimizationSuggestion,
  AutomationRule,
  WorkflowPattern,
  PerformanceMetrics
} from './types'

// Main workflow optimization implementation
import { WorkflowAnalyzer } from './analyzer'
import { ProcessOptimizer } from './optimizer'
import { SuggestionEngine } from './suggestions'
import { AutomationEngine } from './automation'
import { PatternRecognition } from './patterns'
import { PerformanceTracker } from './performance'

class WorkflowOptimizerImpl implements WorkflowOptimizer {
  public readonly analyzer: WorkflowAnalyzer
  public readonly optimizer: ProcessOptimizer
  public readonly suggestions: SuggestionEngine
  public readonly automation: AutomationEngine
  public readonly patterns: PatternRecognition
  public readonly performance: PerformanceTracker

  constructor() {
    this.performance = new PerformanceTracker()
    this.patterns = new PatternRecognition(this.performance)
    this.analyzer = new WorkflowAnalyzer(this.performance, this.patterns)
    this.optimizer = new ProcessOptimizer(this.analyzer, this.patterns)
    this.suggestions = new SuggestionEngine(this.analyzer, this.optimizer)
    this.automation = new AutomationEngine(this.optimizer, this.patterns)
  }

  /**
   * Initialize all workflow optimization components
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.performance.initialize(),
      this.patterns.initialize(),
      this.analyzer.initialize(),
      this.optimizer.initialize(),
      this.suggestions.initialize(),
      this.automation.initialize(),
    ])
  }

  /**
   * Perform comprehensive workflow analysis and optimization
   */
  async optimizeWorkflow(workflowId: string): Promise<{
    analysis: any
    optimizations: any
    suggestions: any
    automations: any[]
  }> {
    // Analyze current workflow
    const analysis = await this.analyzer.analyzeWorkflow(workflowId)
    
    // Generate optimizations
    const optimizations = await this.optimizer.optimizeProcess(workflowId, analysis)
    
    // Create suggestions
    const suggestions = await this.suggestions.generateSuggestions(workflowId, analysis)
    
    // Identify automation opportunities
    const automations = await this.automation.identifyAutomationOpportunities(workflowId, analysis)

    return {
      analysis,
      optimizations,
      suggestions,
      automations,
    }
  }

  /**
   * Shutdown all components
   */
  async shutdown(): Promise<void> {
    await Promise.all([
      this.performance.shutdown(),
      this.patterns.shutdown(),
      this.analyzer.shutdown(),
      this.optimizer.shutdown(),
      this.suggestions.shutdown(),
      this.automation.shutdown(),
    ])
  }
}

// Singleton instance
export const workflowOptimizer = new WorkflowOptimizerImpl()

// Convenience functions
export const analyzeWorkflow = workflowOptimizer.analyzer.analyzeWorkflow.bind(workflowOptimizer.analyzer)
export const optimizeProcess = workflowOptimizer.optimizer.optimizeProcess.bind(workflowOptimizer.optimizer)
export const generateSuggestions = workflowOptimizer.suggestions.generateSuggestions.bind(workflowOptimizer.suggestions)
export const automateWorkflow = workflowOptimizer.automation.createAutomationRule.bind(workflowOptimizer.automation)

export default workflowOptimizer