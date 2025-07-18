// Core message types
export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  tokens: number
  streaming?: boolean
  error?: string
  metadata?: MessageMetadata
}

export interface MessageMetadata {
  model?: string
  temperature?: number
  maxTokens?: number
  stopSequences?: string[]
  topP?: number
  topK?: number
  conversationId?: string
  parentMessageId?: string
  citations?: Citation[]
  attachments?: Attachment[]
}

export interface Citation {
  id: string
  text: string
  source: string
  url?: string
  confidence?: number
}

export interface Attachment {
  id: string
  type: 'file' | 'image' | 'document'
  name: string
  size: number
  url: string
  mimeType: string
}

// Context management types
export interface ContextState {
  messages: Message[]
  tokenCount: number
  maxTokens: number
  compressionHistory: CompressionEvent[]
  preservedSections: PreservedSection[]
  modelConfig: ModelConfiguration
  userPreferences: ContextPreferences
}

export interface CompressionEvent {
  id: string
  timestamp: number
  beforeTokens: number
  afterTokens: number
  removedMessageIds: string[]
  strategy: CompressionStrategy
  qualityScore: number
}

export interface PreservedSection {
  id: string
  messageIds: string[]
  reason: 'important' | 'system' | 'recent' | 'code' | 'custom'
  priority: number
}

export interface ContextPreferences {
  preserveCodeBlocks: boolean
  preserveImportantAnswers: boolean
  compressionAggressiveness: 'conservative' | 'balanced' | 'aggressive'
  warningThresholds: {
    notice: number
    warning: number
    critical: number
  }
}

// Model types
export interface ModelInfo {
  id: string
  name: string
  provider: 'anthropic' | 'openai' | 'google' | 'aws'
  contextWindow: number
  maxTokens: number
  capabilities: ModelCapability[]
  speed: 'fast' | 'medium' | 'slow'
  quality: 'high' | 'higher' | 'highest'
  costPerToken: number
  description: string
}

export interface ModelCapability {
  type: 'text' | 'code' | 'analysis' | 'research' | 'math' | 'vision' | 'function_calling'
  description: string
  supported: boolean
}

export interface ModelConfiguration {
  temperature: number
  maxTokens: number
  topP: number
  topK: number
  stopSequences: string[]
  presencePenalty: number
  frequencyPenalty: number
}

// Streaming types
export interface StreamingState {
  isStreaming: boolean
  currentMessageId?: string
  tokens: string[]
  totalTokens: number
  startTime?: number
  estimatedTimeRemaining?: number
}

export interface StreamingOptions {
  messages: Message[]
  model: ModelInfo
  signal: AbortSignal
  onToken: (token: string) => void
  onComplete: (content: string) => void
  onError: (error: Error) => void
  onProgress?: (progress: StreamingProgress) => void
}

export interface StreamingProgress {
  tokensGenerated: number
  estimatedTotal: number
  timeElapsed: number
  tokensPerSecond: number
}

// Warning types
export interface Warning {
  id: string
  level: 'info' | 'notice' | 'warning' | 'critical'
  title: string
  message: string
  actions: WarningAction[]
  data: WarningData
  timestamp: number
  lastUpdated: number
  dismissed?: boolean
}

export interface WarningAction {
  id: string
  label: string
  icon: string
  variant?: 'default' | 'destructive' | 'secondary'
  confirmationRequired?: boolean
}

export interface WarningData {
  currentTokens: number
  maxTokens: number
  utilization: number
  messagesCount: number
  compressionEstimate: CompressionEstimate
  timeToLimit?: number
}

export interface CompressionEstimate {
  removedMessages: number
  tokensSaved: number
  qualityLoss: number
  strategy: string
}

// Command types
export interface Command {
  name: string
  description: string
  usage: string
  aliases: string[]
  execute: (args: string[], context: ExecutionContext) => Promise<CommandResult>
  validate?: (args: string[]) => boolean
  autocomplete?: (partial: string) => string[]
}

export interface ExecutionContext {
  contextManager: any
  messageManager: any
  currentModel: ModelInfo
  session: any
  timestamp: number
}

export interface CommandResult {
  success: boolean
  message?: string
  error?: string
  data?: any
  requiresConfirmation?: boolean
  confirmationCommand?: string
  suggestions?: string[]
}

export interface ParsedCommand {
  isValid: boolean
  command: string
  originalCommand?: string
  args: string[]
  rawInput: string
}

export interface CommandSuggestion {
  command: string
  description: string
  usage: string
  similarity: number
}

// Search types
export interface SearchResult {
  id: string
  title: string
  content: string
  score: number
  metadata: SearchMetadata
  highlights: string[]
}

export interface SearchMetadata {
  source: string
  type: 'message' | 'document' | 'knowledge'
  timestamp: number
  author?: string
  tags?: string[]
  classification?: SecurityClassification
}

export interface SearchQuery {
  query: string
  filters?: SearchFilter[]
  sortBy?: 'relevance' | 'date' | 'score'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface SearchFilter {
  field: string
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'nin' | 'contains'
  value: any
}

// Security types
export interface SecurityClassification {
  level: 'UNCLASSIFIED' | 'CUI' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET'
  compartments?: string[]
  caveat?: string
  markings?: string[]
  declassifyOn?: Date
  derivedFrom?: string
  classifiedBy?: string
}

export interface UserClearance {
  level: SecurityClassification['level']
  compartments: string[]
  expiration: Date
  grantedBy: string
  verified: boolean
}

// Analytics types
export interface AnalyticsEvent {
  id: string
  type: string
  timestamp: number
  userId: string
  sessionId: string
  data: Record<string, any>
  metadata: AnalyticsMetadata
}

export interface AnalyticsMetadata {
  userAgent: string
  ip: string
  location?: string
  device?: string
  browser?: string
  referrer?: string
}

export interface ContextAnalytics {
  totalMessages: number
  tokenDistribution: TokenDistribution
  topicAnalysis: TopicAnalysis[]
  compressionHistory: CompressionEvent[]
  recommendedActions: Recommendation[]
  conversationFlow: ConversationFlow
  performanceMetrics: PerformanceMetrics
}

export interface TokenDistribution {
  user: number
  assistant: number
  system: number
  ratio: number
}

export interface TopicAnalysis {
  topic: string
  messageCount: number
  tokenCount: number
  relevanceScore: number
  keywords: string[]
}

export interface Recommendation {
  type: 'efficiency' | 'context' | 'performance' | 'security'
  message: string
  action: string
  priority: 'low' | 'medium' | 'high'
  estimatedImpact: number
}

export interface ConversationFlow {
  averageResponseTime: number
  messageFrequency: number
  topicTransitions: TopicTransition[]
  userEngagement: EngagementMetrics
}

export interface TopicTransition {
  from: string
  to: string
  frequency: number
  avgTimeBetween: number
}

export interface EngagementMetrics {
  messagesPerSession: number
  avgSessionDuration: number
  returnRate: number
  satisfactionScore?: number
}

export interface PerformanceMetrics {
  avgResponseTime: number
  tokenThroughput: number
  errorRate: number
  compressionEfficiency: number
  cacheHitRate: number
}

// API types
export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: number
  requestId: string
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>

export type ValueOf<T> = T[keyof T]

export type ArrayElement<T> = T extends (infer U)[] ? U : never

export type Flatten<T> = T extends any[] ? T[number] : T

export type NonNullable<T> = T extends null | undefined ? never : T

// Onboarding utility types
export type OnboardingStepStatus = 'pending' | 'in-progress' | 'completed' | 'skipped' | 'failed'
export type OnboardingFlowType = 'guided' | 'self-paced' | 'adaptive' | 'minimal'
export type OnboardingPersonalization = 'none' | 'basic' | 'advanced' | 'ai-driven'

// Theme types
export interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  foreground: string
  muted: string
  border: string
  input: string
  ring: string
  destructive: string
  success: string
  warning: string
  info: string
}

export interface Theme {
  name: string
  colors: ThemeColors
  dark: boolean
  government: boolean
}

// Configuration types
export interface AppConfig {
  api: {
    baseUrl: string
    timeout: number
    retries: number
  }
  models: {
    default: string
    available: string[]
    settings: Record<string, ModelConfiguration>
  }
  context: {
    maxTokens: number
    compressionThreshold: number
    warningThresholds: ContextPreferences['warningThresholds']
  }
  security: {
    allowedDomains: string[]
    sessionTimeout: number
    maxFileSize: number
    allowedFileTypes: string[]
  }
  features: {
    streaming: boolean
    compression: boolean
    commands: boolean
    analytics: boolean
    search: boolean
  }
}

// Export compression strategy as enum
export enum CompressionStrategy {
  PRESERVATION = 'preservation',
  SUMMARIZATION = 'summarization',
  REMOVAL = 'removal',
  HYBRID = 'hybrid'
}

// Enhanced Message Management Types
export interface MessageAttachment {
  id: string
  name: string
  size: number
  type: string
  url?: string
  mimeType: string
  metadata?: Record<string, any>
}

export interface EnhancedMessageMetadata extends MessageMetadata {
  tokenCount: number
  wordCount: number
  characterCount: number
  containsCode: boolean
  processingTime?: number
  modelUsed?: string
  compressionApplied?: boolean
  originalSize?: number
  compressedSize?: number
  batchId?: string
  batchIndex?: number
  isTruncated?: boolean
  originalTokenCount?: number
}

export interface Conversation {
  id: string
  title: string
  description?: string
  userId: string
  participants: string[]
  messageCount: number
  totalTokens: number
  createdAt: string
  updatedAt: string
  lastActivity: string
  isArchived: boolean
  isDeleted?: boolean
  deletedAt?: string
  deletedBy?: string
  tags?: string[]
  metadata: Record<string, any>
}

export interface ConversationStats {
  conversationId: string
  isEmpty: boolean
  totalMessages: number
  totalTokens: number
  totalCharacters: number
  totalWords: number
  messagesByRole: {
    user: number
    assistant: number
    system: number
  }
  averageMessageLength: number
  averageTokensPerMessage: number
  averageWordsPerMessage: number
  averageProcessingTime: number
  conversationDuration: number
  conversationDurationHours: number
  messagesPerHour: number
  activityPattern: number[]
  messageFrequency: Array<{ date: string; count: number }>
  codeBlockCount: number
  attachmentCount: number
  topKeywords: string[]
  modelUsage: Record<string, number>
  responseTimeAnalysis: {
    averageResponseTime: number
    medianResponseTime: number
    fastestResponse: number
    slowestResponse: number
    totalExchanges: number
  }
  engagementScore: number
  conversationQuality: number
  compressionStats: {
    originalSize: number
    compressedSize: number
    compressionRatio: number
    timesCompressed: number
  }
  firstMessageAt: string
  lastMessageAt: string
  participants: string[]
  lastUpdated: string
}

export interface MessageFilter {
  userId?: string
  conversationId?: string
  role?: 'user' | 'assistant' | 'system'
  dateFrom?: Date
  dateTo?: Date
  searchQuery?: string
  hasAttachments?: boolean
  tokenCountMin?: number
  tokenCountMax?: number
}

export interface MessageBatch {
  messages: Message[]
  totalCount: number
  hasMore: boolean
  nextCursor?: string
}

export interface ConversationSummary {
  id: string
  title: string
  description?: string
  lastActivity: string
  messageCount: number
  totalTokens: number
  participants: string[]
  tags: string[]
  isArchived: boolean
  createdAt: string
  metadata: Record<string, any>
}

// Onboarding types
export interface OnboardingStep {
  id: string
  title: string
  description: string
  type: 'welcome' | 'capabilities' | 'setup' | 'tutorial' | 'completion'
  order: number
  isOptional: boolean
  isCompleted: boolean
  estimatedDuration: number
  requirements?: string[]
  actions?: OnboardingAction[]
  validationRules?: ValidationRule[]
}

export interface OnboardingAction {
  id: string
  type: 'button' | 'input' | 'selection' | 'confirmation' | 'demo'
  label: string
  description?: string
  required: boolean
  options?: string[]
  defaultValue?: any
  validation?: ValidationRule
}

export interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'custom'
  value?: any
  message: string
  validator?: (value: any) => boolean
}

export interface OnboardingProgress {
  userId: string
  currentStep: number
  completedSteps: string[]
  skippedSteps: string[]
  totalSteps: number
  completionPercentage: number
  startedAt: string
  lastUpdated: string
  estimatedTimeRemaining: number
  userResponses: Record<string, any>
  isCompleted: boolean
  completedAt?: string
}

export interface OnboardingConfiguration {
  steps: OnboardingStep[]
  theme: 'default' | 'government' | 'professional'
  personalizedContent: boolean
  adaptiveFlow: boolean
  skipEnabled: boolean
  progressSaving: boolean
  analyticsEnabled: boolean
  interactiveElements: boolean
  chatIntegration: boolean
  contextualHelp: boolean
}

export interface OnboardingContext {
  userProfile: UserProfile
  systemCapabilities: SystemCapability[]
  recommendedWorkflows: RecommendedWorkflow[]
  customization: UserCustomization
  preferences: UserPreferences
}

export interface UserProfile {
  id: string
  name: string
  email: string
  role: string
  organization?: string
  department?: string
  experience: 'beginner' | 'intermediate' | 'advanced'
  primaryUseCase: string
  goals: string[]
  preferences: UserPreferences
  clearanceLevel?: SecurityClassification['level']
  onboardingCompleted: boolean
  lastLogin?: string
  createdAt: string
}

export interface SystemCapability {
  id: string
  name: string
  category: 'core' | 'advanced' | 'specialized'
  description: string
  benefits: string[]
  requirements?: string[]
  enabled: boolean
  demoAvailable: boolean
  tutorialSteps?: TutorialStep[]
}

export interface TutorialStep {
  id: string
  title: string
  description: string
  action: 'click' | 'type' | 'observe' | 'wait'
  target?: string
  expectedResult: string
  hint?: string
  screenshot?: string
}

export interface RecommendedWorkflow {
  id: string
  name: string
  description: string
  category: 'sources-sought' | 'general' | 'research' | 'automation'
  difficulty: 'easy' | 'medium' | 'hard'
  estimatedTime: number
  steps: WorkflowStep[]
  benefits: string[]
  prerequisites?: string[]
  popularity: number
  successRate: number
}

export interface WorkflowStep {
  id: string
  title: string
  description: string
  type: 'action' | 'decision' | 'input' | 'output' | 'review'
  order: number
  isOptional: boolean
  expectedOutcome: string
  hints?: string[]
  resources?: string[]
}

export interface UserCustomization {
  theme: 'light' | 'dark' | 'auto'
  colorScheme: 'default' | 'government' | 'professional'
  layout: 'compact' | 'comfortable' | 'spacious'
  shortcuts: KeyboardShortcut[]
  notifications: NotificationPreference[]
  widgets: DashboardWidget[]
  quickActions: QuickAction[]
}

export interface KeyboardShortcut {
  id: string
  key: string
  action: string
  description: string
  context?: string
  enabled: boolean
}

export interface NotificationPreference {
  type: 'email' | 'push' | 'in-app' | 'desktop'
  category: 'system' | 'opportunities' | 'updates' | 'reminders'
  enabled: boolean
  frequency: 'immediate' | 'daily' | 'weekly' | 'never'
  threshold?: number
}

export interface DashboardWidget {
  id: string
  type: 'chart' | 'list' | 'metric' | 'feed' | 'calendar'
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  config: Record<string, any>
  enabled: boolean
}

export interface QuickAction {
  id: string
  label: string
  icon: string
  shortcut?: string
  command: string
  category: 'common' | 'advanced' | 'custom'
  enabled: boolean
  order: number
}

export interface UserPreferences {
  language: string
  timezone: string
  dateFormat: string
  timeFormat: string
  numberFormat: string
  currency: string
  autoSave: boolean
  confirmActions: boolean
  showTooltips: boolean
  animationsEnabled: boolean
  soundEnabled: boolean
  keyboardNavigation: boolean
  highContrast: boolean
  reducedMotion: boolean
  fontSize: 'small' | 'medium' | 'large'
  compactMode: boolean
}

export interface OnboardingAnalytics {
  stepCompletionRates: Record<string, number>
  averageCompletionTime: number
  dropOffPoints: Array<{ step: string; rate: number }>
  userFeedback: Array<{ step: string; rating: number; comments: string }>
  commonIssues: Array<{ step: string; issue: string; frequency: number }>
  successMetrics: {
    totalStarted: number
    totalCompleted: number
    completionRate: number
    averageSteps: number
    returnUsers: number
  }
}

export interface OnboardingFeedback {
  userId: string
  stepId: string
  rating: number
  comments: string
  suggestions: string
  difficulty: 'too-easy' | 'just-right' | 'too-hard'
  clarity: 'very-clear' | 'clear' | 'confusing' | 'very-confusing'
  usefulness: 'very-useful' | 'useful' | 'not-useful' | 'harmful'
  timestamp: string
}

export interface OnboardingError {
  id: string
  userId: string
  stepId: string
  errorType: 'validation' | 'technical' | 'user' | 'system'
  message: string
  details: string
  resolved: boolean
  resolution?: string
  timestamp: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}