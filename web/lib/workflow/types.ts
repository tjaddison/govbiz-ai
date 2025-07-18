/**
 * Workflow Optimization Types
 * 
 * Core type definitions for AI-powered workflow optimization system
 */

export interface Workflow {
  id: string
  name: string
  description: string
  category: WorkflowCategory
  steps: WorkflowStep[]
  triggers: WorkflowTrigger[]
  conditions: WorkflowCondition[]
  metadata: WorkflowMetadata
  metrics: WorkflowMetrics
  status: WorkflowStatus
  createdAt: number
  updatedAt: number
  createdBy: string
  lastExecutedAt?: number
  nextScheduledAt?: number
  version: string
}

export interface WorkflowStep {
  id: string
  name: string
  type: StepType
  description: string
  order: number
  duration: number
  dependencies: string[]
  inputs: StepInput[]
  outputs: StepOutput[]
  conditions: StepCondition[]
  automation: StepAutomation
  performance: StepPerformance
  isOptional: boolean
  isParallel: boolean
  retryPolicy: RetryPolicy
  timeoutMs: number
  agentAssignment?: string
  humanRequired: boolean
}

export interface WorkflowTrigger {
  id: string
  type: TriggerType
  event: string
  conditions: TriggerCondition[]
  schedule?: ScheduleConfig
  priority: 'low' | 'normal' | 'high' | 'critical'
  enabled: boolean
}

export interface WorkflowCondition {
  id: string
  type: 'prerequisite' | 'gate' | 'branch' | 'loop'
  expression: string
  variables: string[]
  operator: ConditionOperator
  value: any
  onTrue: string
  onFalse: string
}

export interface WorkflowMetadata {
  tags: string[]
  category: WorkflowCategory
  complexity: ComplexityLevel
  estimatedDuration: number
  resourceRequirements: ResourceRequirement[]
  successCriteria: SuccessCriteria[]
  businessValue: BusinessValue
  riskLevel: RiskLevel
  complianceRequirements: string[]
}

export interface WorkflowMetrics {
  executionCount: number
  successRate: number
  averageDuration: number
  lastDuration: number
  errorRate: number
  bottlenecks: Bottleneck[]
  performance: PerformanceMetrics
  efficiency: EfficiencyMetrics
  qualityMetrics: QualityMetrics
  costMetrics: CostMetrics
}

export interface StepInput {
  name: string
  type: InputType
  required: boolean
  source: InputSource
  validation: ValidationRule[]
  defaultValue?: any
  description: string
}

export interface StepOutput {
  name: string
  type: OutputType
  destination: OutputDestination
  format: string
  validation: ValidationRule[]
  description: string
}

export interface StepCondition {
  type: 'skip' | 'retry' | 'escalate' | 'branch'
  expression: string
  action: string
  parameters: Record<string, any>
}

export interface StepAutomation {
  automated: boolean
  automationType: AutomationType
  confidence: number
  humanFallback: boolean
  approvalRequired: boolean
  escalationRules: EscalationRule[]
}

export interface StepPerformance {
  averageDuration: number
  successRate: number
  errorTypes: ErrorType[]
  optimization: OptimizationOpportunity[]
  bottleneckIndicators: string[]
}

export interface RetryPolicy {
  maxAttempts: number
  backoffStrategy: 'fixed' | 'exponential' | 'linear'
  baseDelayMs: number
  maxDelayMs: number
  retryableErrors: string[]
}

export interface OptimizationSuggestion {
  id: string
  workflowId: string
  stepId?: string
  type: OptimizationType
  category: SuggestionCategory
  title: string
  description: string
  rationale: string
  impact: OptimizationImpact
  effort: ImplementationEffort
  confidence: number
  priority: SuggestionPriority
  implementation: ImplementationPlan
  metrics: ExpectedMetrics
  risks: Risk[]
  dependencies: string[]
  status: SuggestionStatus
  createdAt: number
  estimatedSavings: EstimatedSavings
}

export interface AutomationRule {
  id: string
  name: string
  description: string
  workflowId: string
  stepIds: string[]
  trigger: AutomationTrigger
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  configuration: AutomationConfig
  status: AutomationStatus
  performance: AutomationPerformance
  createdAt: number
  lastExecutedAt?: number
  executionCount: number
  successRate: number
}

export interface WorkflowPattern {
  id: string
  name: string
  type: PatternType
  description: string
  frequency: number
  confidence: number
  context: PatternContext
  triggers: PatternTrigger[]
  outcomes: PatternOutcome[]
  variations: PatternVariation[]
  applications: PatternApplication[]
  metrics: PatternMetrics
  discovered: number
  lastSeen: number
}

export interface PerformanceMetrics {
  throughput: number
  latency: number
  errorRate: number
  resourceUtilization: ResourceUtilization
  qualityScore: number
  userSatisfaction: number
  costEfficiency: number
  timeToCompletion: number
  parallelization: number
  optimization: number
}

export interface WorkflowPrediction {
  workflowId: string
  predictionType: PredictionType
  timeframe: string
  confidence: number
  predictions: Prediction[]
  factors: PredictionFactor[]
  recommendations: PredictionRecommendation[]
  risks: PredictionRisk[]
  alternatives: PredictionAlternative[]
  createdAt: number
  validUntil: number
}

export interface WorkflowRecommendation {
  id: string
  workflowId: string
  type: RecommendationType
  category: RecommendationCategory
  title: string
  description: string
  reasoning: string
  benefits: Benefit[]
  implementation: RecommendationImplementation
  impact: RecommendationImpact
  urgency: RecommendationUrgency
  confidence: number
  personalizedFor?: string
  contextFactors: ContextFactor[]
  alternatives: RecommendationAlternative[]
  feedback: RecommendationFeedback[]
  status: RecommendationStatus
  createdAt: number
}

// Supporting interfaces and types

export interface ResourceRequirement {
  type: 'cpu' | 'memory' | 'storage' | 'network' | 'human' | 'external'
  amount: number
  unit: string
  critical: boolean
}

export interface SuccessCriteria {
  metric: string
  target: number
  threshold: number
  weight: number
}

export interface BusinessValue {
  category: 'cost_reduction' | 'time_savings' | 'quality_improvement' | 'compliance' | 'revenue'
  value: number
  unit: string
  timeframe: string
}

export interface Bottleneck {
  stepId: string
  type: 'resource' | 'dependency' | 'approval' | 'data' | 'external'
  severity: number
  frequency: number
  impact: number
  suggestions: string[]
}

export interface EfficiencyMetrics {
  resourceUtilization: number
  wasteReduction: number
  parallelizationRatio: number
  automationRatio: number
  cycleTimeReduction: number
}

export interface QualityMetrics {
  accuracy: number
  completeness: number
  consistency: number
  compliance: number
  userSatisfaction: number
}

export interface CostMetrics {
  totalCost: number
  costPerExecution: number
  laborCost: number
  resourceCost: number
  opportunityCost: number
}

export interface OptimizationOpportunity {
  type: OptimizationType
  description: string
  impact: number
  effort: number
  confidence: number
}

export interface OptimizationImpact {
  timeReduction: number
  costReduction: number
  qualityImprovement: number
  riskReduction: number
  complianceImprovement: number
}

export interface ImplementationPlan {
  phases: ImplementationPhase[]
  timeline: string
  resources: ResourceRequirement[]
  dependencies: string[]
  risks: Risk[]
  rollbackPlan: string
}

export interface ImplementationPhase {
  name: string
  description: string
  duration: string
  prerequisites: string[]
  deliverables: string[]
  successCriteria: string[]
}

export interface ExpectedMetrics {
  performanceImprovement: number
  costSavings: number
  timeReduction: number
  qualityIncrease: number
  riskReduction: number
}

export interface EstimatedSavings {
  timePerExecution: number
  costPerExecution: number
  annualTimeSavings: number
  annualCostSavings: number
  roi: number
  paybackPeriod: number
}

export interface AutomationTrigger {
  type: 'event' | 'schedule' | 'condition' | 'manual'
  event?: string
  schedule?: ScheduleConfig
  condition?: string
}

export interface AutomationCondition {
  field: string
  operator: ConditionOperator
  value: any
  logicalOperator?: 'AND' | 'OR' | 'NOT'
}

export interface AutomationAction {
  type: ActionType
  target: string
  parameters: Record<string, any>
  retryPolicy?: RetryPolicy
  rollbackAction?: AutomationAction
}

export interface AutomationConfig {
  maxConcurrency: number
  timeout: number
  retryAttempts: number
  failureHandling: 'stop' | 'continue' | 'rollback'
  notifications: NotificationConfig[]
  logging: LoggingConfig
}

export interface AutomationPerformance {
  executionTime: number
  successRate: number
  errorTypes: string[]
  resourceUsage: ResourceUtilization
  userSatisfaction: number
}

export interface PatternContext {
  domain: string
  category: WorkflowCategory
  complexity: ComplexityLevel
  userType: string
  timeframe: string
  conditions: string[]
}

export interface PatternTrigger {
  event: string
  frequency: number
  conditions: string[]
  timing: PatternTiming
}

export interface PatternOutcome {
  result: string
  probability: number
  impact: number
  metrics: Record<string, number>
}

export interface PatternVariation {
  name: string
  description: string
  frequency: number
  conditions: string[]
  differences: string[]
}

export interface PatternApplication {
  workflowId: string
  stepId?: string
  applied: number
  success: boolean
  outcome: string
  metrics: Record<string, number>
}

export interface PatternMetrics {
  accuracy: number
  coverage: number
  stability: number
  reliability: number
  impact: number
}

export interface Prediction {
  metric: string
  value: number
  confidence: number
  range: { min: number; max: number }
  factors: string[]
}

export interface PredictionFactor {
  name: string
  impact: number
  confidence: number
  trend: 'increasing' | 'decreasing' | 'stable'
}

export interface PredictionRecommendation {
  action: string
  rationale: string
  impact: number
  urgency: number
}

export interface PredictionRisk {
  type: string
  probability: number
  impact: number
  mitigation: string
}

export interface PredictionAlternative {
  scenario: string
  probability: number
  outcome: string
  changes: string[]
}

export interface Benefit {
  type: string
  description: string
  quantification: number
  unit: string
  timeframe: string
}

export interface RecommendationImplementation {
  steps: string[]
  resources: ResourceRequirement[]
  timeline: string
  prerequisites: string[]
  validation: string[]
}

export interface RecommendationImpact {
  scope: 'step' | 'workflow' | 'process' | 'organization'
  magnitude: number
  certainty: number
  timeToRealize: string
}

export interface ContextFactor {
  name: string
  value: any
  weight: number
  source: string
}

export interface RecommendationAlternative {
  title: string
  description: string
  pros: string[]
  cons: string[]
  comparison: Record<string, number>
}

export interface RecommendationFeedback {
  userId: string
  rating: number
  comment: string
  implemented: boolean
  outcome?: string
  timestamp: number
}

export interface ResourceUtilization {
  cpu: number
  memory: number
  storage: number
  network: number
  human: number
}

export interface Risk {
  type: string
  description: string
  probability: number
  impact: number
  mitigation: string
}

export interface EscalationRule {
  condition: string
  action: string
  target: string
  timeout: number
}

export interface ScheduleConfig {
  type: 'cron' | 'interval' | 'once'
  expression: string
  timezone: string
  enabled: boolean
}

export interface TriggerCondition {
  field: string
  operator: ConditionOperator
  value: any
}

export interface ValidationRule {
  type: string
  parameters: Record<string, any>
  message: string
}

export interface NotificationConfig {
  type: 'email' | 'slack' | 'webhook'
  target: string
  events: string[]
  template: string
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error'
  destination: string
  retention: number
}

export interface PatternTiming {
  duration: number
  frequency: number
  seasonality: string[]
  peaks: string[]
}

export interface ErrorType {
  code: string
  message: string
  frequency: number
  impact: number
  resolution: string
}

// Enums and string literals

export type WorkflowCategory = 
  | 'sources_sought'
  | 'proposal_development'
  | 'contract_management'
  | 'compliance'
  | 'document_processing'
  | 'communication'
  | 'analysis'
  | 'reporting'
  | 'administration'
  | 'custom'

export type WorkflowStatus = 
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'archived'

export type StepType = 
  | 'data_input'
  | 'processing'
  | 'decision'
  | 'approval'
  | 'notification'
  | 'integration'
  | 'validation'
  | 'transformation'
  | 'analysis'
  | 'output'

export type TriggerType = 
  | 'manual'
  | 'scheduled'
  | 'event'
  | 'webhook'
  | 'file'
  | 'email'
  | 'api'

export type ConditionOperator = 
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'exists'
  | 'in_list'
  | 'matches_pattern'

export type ComplexityLevel = 
  | 'simple'
  | 'moderate'
  | 'complex'
  | 'enterprise'

export type RiskLevel = 
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

export type InputType = 
  | 'text'
  | 'number'
  | 'date'
  | 'file'
  | 'selection'
  | 'boolean'
  | 'json'
  | 'array'

export type OutputType = 
  | 'text'
  | 'number'
  | 'date'
  | 'file'
  | 'json'
  | 'report'
  | 'notification'
  | 'data'

export type InputSource = 
  | 'user_input'
  | 'previous_step'
  | 'database'
  | 'api'
  | 'file'
  | 'constant'

export type OutputDestination = 
  | 'next_step'
  | 'database'
  | 'file'
  | 'api'
  | 'notification'
  | 'report'

export type AutomationType = 
  | 'full'
  | 'partial'
  | 'assisted'
  | 'supervised'

export type OptimizationType = 
  | 'performance'
  | 'cost'
  | 'quality'
  | 'time'
  | 'automation'
  | 'parallelization'
  | 'consolidation'
  | 'elimination'

export type SuggestionCategory = 
  | 'process_improvement'
  | 'automation'
  | 'performance'
  | 'cost_optimization'
  | 'quality_enhancement'
  | 'compliance'
  | 'user_experience'

export type ImplementationEffort = 
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'significant'

export type SuggestionPriority = 
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

export type SuggestionStatus = 
  | 'pending'
  | 'reviewed'
  | 'approved'
  | 'implemented'
  | 'rejected'
  | 'deferred'

export type AutomationStatus = 
  | 'draft'
  | 'testing'
  | 'active'
  | 'paused'
  | 'failed'
  | 'deprecated'

export type PatternType = 
  | 'sequential'
  | 'parallel'
  | 'conditional'
  | 'loop'
  | 'exception'
  | 'optimization'
  | 'anti_pattern'

export type PredictionType = 
  | 'duration'
  | 'cost'
  | 'success_rate'
  | 'resource_usage'
  | 'bottlenecks'
  | 'risks'

export type RecommendationType = 
  | 'optimization'
  | 'automation'
  | 'process_change'
  | 'tool_adoption'
  | 'training'
  | 'resource_allocation'

export type RecommendationCategory = 
  | 'immediate'
  | 'short_term'
  | 'long_term'
  | 'strategic'

export type RecommendationUrgency = 
  | 'low'
  | 'medium'
  | 'high'
  | 'urgent'

export type RecommendationStatus = 
  | 'new'
  | 'viewed'
  | 'considering'
  | 'planned'
  | 'implementing'
  | 'completed'
  | 'dismissed'

export type ActionType = 
  | 'execute_step'
  | 'skip_step'
  | 'retry_step'
  | 'notify'
  | 'update_data'
  | 'create_task'
  | 'escalate'
  | 'branch_workflow'