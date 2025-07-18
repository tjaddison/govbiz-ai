/**
 * Document Management Types
 * 
 * Core type definitions for the document management system
 */

export interface Document {
  id: string
  title: string
  content: string
  contentType: string
  fileName?: string
  fileSize?: number
  filePath?: string
  hash: string
  metadata: DocumentMetadata
  classification: DocumentClassification
  versions: DocumentVersion[]
  security: DocumentSecurity
  analytics: DocumentAnalytics
  createdAt: number
  updatedAt: number
  createdBy: string
  updatedBy: string
}

export interface DocumentMetadata {
  title: string
  description?: string
  author: string
  department?: string
  project?: string
  tags: string[]
  customFields: Record<string, any>
  extractedData: ExtractedData
  processingStatus: ProcessingStatus
  language: string
  encoding: string
}

export interface DocumentClassification {
  category: DocumentCategory
  subcategory?: string
  confidentialityLevel: ConfidentialityLevel
  businessType: BusinessType
  documentType: DocumentType
  naicsCodes: string[]
  agencies: string[]
  keywords: string[]
  entities: DocumentEntity[]
  confidence: number
  aiGenerated: boolean
  classifiedAt: number
  classifiedBy: string
  reviewRequired: boolean
}

export interface DocumentVersion {
  id: string
  documentId: string
  versionNumber: string
  title: string
  content: string
  hash: string
  changeLog: string
  changes: DocumentChange[]
  createdAt: number
  createdBy: string
  status: 'draft' | 'review' | 'approved' | 'archived'
  parentVersion?: string
  branchName?: string
}

export interface DocumentChange {
  type: 'add' | 'modify' | 'delete'
  section: string
  oldValue?: string
  newValue?: string
  line?: number
  character?: number
  description: string
}

export interface DocumentSecurity {
  accessLevel: AccessLevel
  permissions: DocumentPermission[]
  encryption: EncryptionInfo
  piiDetected: boolean
  piiTypes: PIIType[]
  complianceFlags: ComplianceFlag[]
  retentionPolicy: RetentionPolicy
  auditTrail: SecurityEvent[]
}

export interface DocumentPermission {
  userId: string
  role: string
  permissions: ('read' | 'write' | 'delete' | 'share')[]
  expiresAt?: number
  grantedBy: string
  grantedAt: number
}

export interface EncryptionInfo {
  encrypted: boolean
  algorithm?: string
  keyId?: string
  encryptedAt?: number
}

export interface RetentionPolicy {
  retentionPeriod: number
  deleteAfter: number
  archiveAfter: number
  complianceRequirement: string
  autoDelete: boolean
}

export interface SecurityEvent {
  id: string
  type: 'access' | 'modify' | 'share' | 'download' | 'delete'
  userId: string
  timestamp: number
  ipAddress?: string
  userAgent?: string
  details: Record<string, any>
}

export interface DocumentAnalytics {
  views: number
  downloads: number
  shares: number
  edits: number
  lastAccessed: number
  accessHistory: AccessEvent[]
  searchAppearances: number
  averageReadTime?: number
  popularSections: string[]
  relatedDocuments: string[]
}

export interface AccessEvent {
  userId: string
  timestamp: number
  type: 'view' | 'download' | 'edit' | 'share'
  duration?: number
  ipAddress?: string
  device?: string
}

export interface ExtractedData {
  entities: DocumentEntity[]
  keyPhrases: string[]
  sentiment?: SentimentAnalysis
  topics: string[]
  summary?: string
  structure: DocumentStructure
  tables: TableData[]
  images: ImageData[]
  links: LinkData[]
  dates: DateReference[]
  amounts: AmountReference[]
}

export interface DocumentEntity {
  text: string
  type: EntityType
  subtype?: string
  confidence: number
  startOffset: number
  endOffset: number
  metadata: Record<string, any>
}

export interface SentimentAnalysis {
  overall: 'positive' | 'negative' | 'neutral' | 'mixed'
  score: number
  confidence: number
  sections: SectionSentiment[]
}

export interface SectionSentiment {
  section: string
  sentiment: 'positive' | 'negative' | 'neutral'
  score: number
}

export interface DocumentStructure {
  sections: DocumentSection[]
  headers: HeaderInfo[]
  footers: HeaderInfo[]
  pageCount: number
  wordCount: number
  characterCount: number
  outline: OutlineItem[]
}

export interface DocumentSection {
  id: string
  title: string
  level: number
  startPage?: number
  endPage?: number
  startOffset: number
  endOffset: number
  content: string
  subsections: DocumentSection[]
}

export interface HeaderInfo {
  content: string
  pageNumber?: number
  position: 'left' | 'center' | 'right'
}

export interface OutlineItem {
  title: string
  level: number
  page?: number
  children: OutlineItem[]
}

export interface TableData {
  id: string
  caption?: string
  headers: string[]
  rows: string[][]
  position: Position
  extracted: boolean
}

export interface ImageData {
  id: string
  caption?: string
  altText?: string
  format: string
  size: {
    width: number
    height: number
  }
  position: Position
  extracted: boolean
  ocrText?: string
}

export interface LinkData {
  text: string
  url: string
  type: 'internal' | 'external'
  position: Position
}

export interface DateReference {
  text: string
  date: Date
  type: 'absolute' | 'relative'
  confidence: number
  position: Position
}

export interface AmountReference {
  text: string
  amount: number
  currency?: string
  type: 'monetary' | 'quantity' | 'percentage'
  confidence: number
  position: Position
}

export interface Position {
  page?: number
  line?: number
  startOffset: number
  endOffset: number
}

// Search types
export interface SearchQuery {
  query: string
  filters: SearchFilter[]
  sort: SearchSort
  pagination: SearchPagination
  options: SearchOptions
}

export interface SearchFilter {
  field: string
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'range'
  value: any
}

export interface SearchSort {
  field: string
  direction: 'asc' | 'desc'
}

export interface SearchPagination {
  offset: number
  limit: number
}

export interface SearchOptions {
  includeContent: boolean
  includeMetadata: boolean
  includeVersions: boolean
  includeAnalytics: boolean
  fuzzyMatch: boolean
  semanticSearch: boolean
  boostFields: Record<string, number>
}

export interface SearchResult {
  documents: DocumentSearchResult[]
  totalResults: number
  facets: SearchFacet[]
  suggestions: string[]
  queryTime: number
  filters: SearchFilter[]
  pagination: SearchPagination
}

export interface DocumentSearchResult {
  document: Document
  score: number
  highlights: SearchHighlight[]
  explanation?: string
}

export interface SearchHighlight {
  field: string
  fragments: string[]
}

export interface SearchFacet {
  field: string
  values: FacetValue[]
}

export interface FacetValue {
  value: string
  count: number
  selected: boolean
}

// Template types
export interface DocumentTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategory
  format: DocumentFormat
  content: string
  variables: TemplateVariable[]
  sections: TemplateSection[]
  metadata: TemplateMetadata
  validation: ValidationRule[]
  version: string
  isActive: boolean
  createdAt: number
  updatedAt: number
  createdBy: string
}

export interface TemplateVariable {
  name: string
  type: 'text' | 'number' | 'date' | 'boolean' | 'list' | 'object'
  required: boolean
  defaultValue?: any
  validation?: ValidationRule
  description: string
  placeholder?: string
}

export interface TemplateSection {
  id: string
  name: string
  order: number
  required: boolean
  repeatable: boolean
  content: string
  variables: string[]
  conditions: TemplateCondition[]
}

export interface TemplateCondition {
  field: string
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'empty'
  value: any
  action: 'show' | 'hide' | 'require'
}

export interface TemplateMetadata {
  author: string
  lastModifiedBy: string
  version: string
  changelog: string
  usage: TemplateUsage
  tags: string[]
  category: TemplateCategory
}

export interface TemplateUsage {
  timesUsed: number
  lastUsed?: number
  avgCompletionTime?: number
  successRate: number
  userRatings: UserRating[]
}

export interface UserRating {
  userId: string
  rating: number
  comment?: string
  createdAt: number
}

export interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'custom'
  value?: any
  message: string
  severity: 'error' | 'warning' | 'info'
}

// Processing types
export interface ProcessingJob {
  id: string
  documentId: string
  type: ProcessingType
  status: ProcessingStatus
  progress: number
  startedAt: number
  completedAt?: number
  error?: ProcessingError
  result?: any
  metadata: Record<string, any>
}

export interface ProcessingError {
  code: string
  message: string
  details?: any
  recoverable: boolean
}

// Enums and constants
export type DocumentCategory = 
  | 'sources_sought_response'
  | 'capability_statement'
  | 'past_performance'
  | 'technical_proposal'
  | 'cost_proposal'
  | 'contract_document'
  | 'compliance_document'
  | 'reference_material'
  | 'template'
  | 'other'

export type ConfidentialityLevel = 
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted'

export type BusinessType = 
  | 'small_business'
  | 'large_business'
  | '8a_certified'
  | 'woman_owned'
  | 'veteran_owned'
  | 'hubzone'
  | 'sdvosb'
  | 'other'

export type DocumentType = 
  | 'pdf'
  | 'word'
  | 'text'
  | 'spreadsheet'
  | 'presentation'
  | 'image'
  | 'email'
  | 'web_page'
  | 'other'

export type AccessLevel = 
  | 'public'
  | 'internal'
  | 'restricted'
  | 'confidential'
  | 'secret'

export type PIIType = 
  | 'ssn'
  | 'credit_card'
  | 'email'
  | 'phone'
  | 'address'
  | 'name'
  | 'date_of_birth'
  | 'driver_license'
  | 'passport'
  | 'other'

export type ComplianceFlag = 
  | 'pii_detected'
  | 'classification_required'
  | 'retention_policy_violation'
  | 'encryption_required'
  | 'audit_required'
  | 'export_controlled'
  | 'other'

export type EntityType = 
  | 'person'
  | 'organization'
  | 'location'
  | 'date'
  | 'money'
  | 'phone'
  | 'email'
  | 'url'
  | 'naics_code'
  | 'contract_number'
  | 'cage_code'
  | 'other'

export type TemplateCategory = 
  | 'sources_sought'
  | 'proposal'
  | 'contract'
  | 'compliance'
  | 'marketing'
  | 'administrative'
  | 'custom'

export type DocumentFormat = 
  | 'pdf'
  | 'docx'
  | 'html'
  | 'markdown'
  | 'plain_text'

export type ProcessingType = 
  | 'classification'
  | 'extraction'
  | 'analysis'
  | 'conversion'
  | 'validation'
  | 'indexing'
  | 'ocr'
  | 'translation'

export type ProcessingStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

// Configuration types
export interface DocumentConfig {
  storage: StorageConfig
  classification: ClassificationConfig
  search: SearchConfig
  security: SecurityConfig
  processing: ProcessingConfig
}

export interface StorageConfig {
  provider: 'aws_s3' | 'azure_blob' | 'gcp_storage' | 'local'
  bucket: string
  region?: string
  encryption: boolean
  compression: boolean
  maxFileSize: number
  allowedTypes: string[]
}

export interface ClassificationConfig {
  aiProvider: 'aws_bedrock' | 'azure_openai' | 'openai' | 'custom'
  modelName: string
  confidenceThreshold: number
  autoClassify: boolean
  reviewThreshold: number
  customCategories: string[]
}

export interface SearchConfig {
  provider: 'elasticsearch' | 'opensearch' | 'algolia' | 'custom'
  indexName: string
  maxResults: number
  fuzzyMatch: boolean
  semanticSearch: boolean
  facets: string[]
}

export interface SecurityConfig {
  encryptionRequired: boolean
  piiDetection: boolean
  accessLogging: boolean
  retentionDays: number
  complianceMode: 'sox' | 'hipaa' | 'fedramp' | 'custom'
}

export interface ProcessingConfig {
  maxConcurrentJobs: number
  timeout: number
  retryAttempts: number
  queueName: string
  ocrEnabled: boolean
  aiAnalysisEnabled: boolean
}