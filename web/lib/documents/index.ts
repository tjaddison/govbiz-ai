/**
 * Document Management System
 * 
 * Comprehensive document management with AI-powered classification,
 * version control, search capabilities, and compliance features
 */

export * from './classifier'
export * from './storage'
export * from './search'
export * from './versioning'
export * from './processor'
export * from './templates'
export * from './security'
export * from './analytics'

// Main document manager interface
export interface DocumentManager {
  classifier: DocumentClassifier
  storage: DocumentStorage
  search: DocumentSearch
  versioning: DocumentVersioning
  processor: DocumentProcessor
  templates: DocumentTemplates
  security: DocumentSecurity
  analytics: DocumentAnalytics
}

// Re-export main types for convenience
export type {
  Document,
  DocumentMetadata,
  DocumentClassification,
  DocumentVersion,
  SearchQuery,
  SearchResult,
  DocumentTemplate
} from './types'

// Main document manager implementation
import { DocumentClassifier } from './classifier'
import { DocumentStorage } from './storage'
import { DocumentSearch } from './search'
import { DocumentVersioning } from './versioning'
import { DocumentProcessor } from './processor'
import { DocumentTemplates } from './templates'
import { DocumentSecurity } from './security'
import { DocumentAnalytics } from './analytics'

class DocumentManagerImpl implements DocumentManager {
  public readonly classifier: DocumentClassifier
  public readonly storage: DocumentStorage
  public readonly search: DocumentSearch
  public readonly versioning: DocumentVersioning
  public readonly processor: DocumentProcessor
  public readonly templates: DocumentTemplates
  public readonly security: DocumentSecurity
  public readonly analytics: DocumentAnalytics

  constructor() {
    this.storage = new DocumentStorage()
    this.classifier = new DocumentClassifier()
    this.search = new DocumentSearch(this.storage)
    this.versioning = new DocumentVersioning(this.storage)
    this.processor = new DocumentProcessor(this.classifier)
    this.templates = new DocumentTemplates(this.storage)
    this.security = new DocumentSecurity()
    this.analytics = new DocumentAnalytics(this.storage)
  }

  /**
   * Initialize all document management components
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.storage.initialize(),
      this.search.initialize(),
      this.classifier.initialize(),
      this.templates.initialize(),
    ])
  }

  /**
   * Shutdown and cleanup resources
   */
  async shutdown(): Promise<void> {
    await Promise.all([
      this.storage.shutdown(),
      this.search.shutdown(),
      this.analytics.shutdown(),
    ])
  }
}

// Singleton instance
export const documentManager = new DocumentManagerImpl()

// Convenience functions
export const classifyDocument = documentManager.classifier.classify.bind(documentManager.classifier)
export const storeDocument = documentManager.storage.store.bind(documentManager.storage)
export const searchDocuments = documentManager.search.search.bind(documentManager.search)
export const createVersion = documentManager.versioning.createVersion.bind(documentManager.versioning)
export const processDocument = documentManager.processor.process.bind(documentManager.processor)
export const getTemplate = documentManager.templates.getTemplate.bind(documentManager.templates)
export const validateSecurity = documentManager.security.validateAccess.bind(documentManager.security)
export const getAnalytics = documentManager.analytics.getAnalytics.bind(documentManager.analytics)

export default documentManager