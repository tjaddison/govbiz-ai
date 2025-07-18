/**
 * Document Classifier
 * 
 * AI-powered document classification with support for government
 * contracting documents, compliance requirements, and custom categories
 */

import { 
  Document, 
  DocumentClassification, 
  DocumentCategory,
  ConfidentialityLevel,
  BusinessType,
  DocumentType,
  DocumentEntity,
  EntityType,
  ExtractedData,
  ClassificationConfig
} from './types'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { AWS_RESOURCES } from '@/lib/aws-config'

export interface ClassificationResult {
  classification: DocumentClassification
  extractedData: ExtractedData
  confidence: number
  processingTime: number
  errors: string[]
}

export interface ClassificationRule {
  id: string
  name: string
  category: DocumentCategory
  keywords: string[]
  patterns: RegExp[]
  minConfidence: number
  weight: number
  active: boolean
}

export class DocumentClassifier {
  private rules: ClassificationRule[] = []
  private entityExtractors: Map<EntityType, RegExp[]> = new Map()
  private isInitialized = false

  constructor(private config?: ClassificationConfig) {
    this.initializeRules()
    this.initializeEntityExtractors()
  }

  /**
   * Initialize the classifier
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Load custom rules from storage if available
      await this.loadCustomRules()
      
      // Initialize AI models if configured
      if (this.config?.aiProvider) {
        await this.initializeAIModels()
      }

      this.isInitialized = true
      logger.info('Document classifier initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize document classifier', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Classify a document
   */
  async classify(document: Partial<Document>): Promise<ClassificationResult> {
    const startTime = Date.now()
    
    try {
      if (!this.isInitialized) {
        await this.initialize()
      }

      const content = document.content || ''
      const fileName = document.fileName || ''
      const metadata = document.metadata

      // Extract basic information
      const extractedData = await this.extractData(content, fileName)
      
      // Perform rule-based classification
      const ruleBasedResult = await this.classifyWithRules(content, fileName, extractedData)
      
      // Perform AI-based classification if available
      let aiResult: DocumentClassification | null = null
      if (this.config?.aiProvider && this.config.autoClassify) {
        aiResult = await this.classifyWithAI(content, extractedData)
      }

      // Combine results
      const finalClassification = this.combineClassificationResults(
        ruleBasedResult,
        aiResult,
        metadata
      )

      const processingTime = Date.now() - startTime

      // Record metrics
      await metricsCollector.recordMetric(
        'document_classification_time',
        processingTime,
        'milliseconds',
        { category: finalClassification.category }
      )

      await metricsCollector.recordMetric(
        'document_classification_confidence',
        finalClassification.confidence,
        'value',
        { category: finalClassification.category }
      )

      logger.info('Document classified successfully', {
        category: finalClassification.category,
        confidence: finalClassification.confidence,
        processingTime,
      }, 'classification')

      return {
        classification: finalClassification,
        extractedData,
        confidence: finalClassification.confidence,
        processingTime,
        errors: [],
      }
    } catch (error) {
      const processingTime = Date.now() - startTime
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      logger.error('Document classification failed', error instanceof Error ? error : undefined, {
        processingTime,
      }, 'classification')

      return {
        classification: this.getDefaultClassification(),
        extractedData: this.getDefaultExtractedData(),
        confidence: 0,
        processingTime,
        errors: [errorMessage],
      }
    }
  }

  /**
   * Extract entities and data from document content
   */
  async extractData(content: string, fileName: string = ''): Promise<ExtractedData> {
    try {
      const entities = await this.extractEntities(content)
      const keyPhrases = this.extractKeyPhrases(content)
      const structure = this.analyzeStructure(content)
      const dates = this.extractDates(content)
      const amounts = this.extractAmounts(content)
      const tables = this.extractTables(content)
      const links = this.extractLinks(content)

      return {
        entities,
        keyPhrases,
        topics: this.extractTopics(content, keyPhrases),
        summary: await this.generateSummary(content),
        structure,
        tables,
        images: [], // Would be populated for PDF/image documents
        links,
        dates,
        amounts,
      }
    } catch (error) {
      logger.error('Failed to extract document data', error instanceof Error ? error : undefined)
      return this.getDefaultExtractedData()
    }
  }

  /**
   * Get classification confidence score
   */
  getConfidenceScore(classification: DocumentClassification): number {
    return classification.confidence
  }

  /**
   * Update classification rules
   */
  async updateRules(rules: ClassificationRule[]): Promise<void> {
    this.rules = rules
    // In production, would persist to storage
    logger.info('Classification rules updated', { count: rules.length })
  }

  /**
   * Get available categories
   */
  getAvailableCategories(): DocumentCategory[] {
    return [
      'sources_sought_response',
      'capability_statement',
      'past_performance',
      'technical_proposal',
      'cost_proposal',
      'contract_document',
      'compliance_document',
      'reference_material',
      'template',
      'other',
    ]
  }

  // Private methods

  private initializeRules(): void {
    this.rules = [
      {
        id: 'sources_sought_rule',
        name: 'Sources Sought Response',
        category: 'sources_sought_response',
        keywords: [
          'sources sought', 'rfi', 'request for information', 'market research',
          'capability response', 'vendor information', 'industry day'
        ],
        patterns: [
          /sources\s+sought/i,
          /request\s+for\s+information/i,
          /capability\s+statement/i,
          /past\s+performance/i,
        ],
        minConfidence: 0.7,
        weight: 1.0,
        active: true,
      },
      {
        id: 'capability_statement_rule',
        name: 'Capability Statement',
        category: 'capability_statement',
        keywords: [
          'capability statement', 'core competencies', 'naics', 'cage code',
          'small business', 'past performance', 'differentiators'
        ],
        patterns: [
          /capability\s+statement/i,
          /core\s+competencies/i,
          /naics\s+code/i,
          /cage\s+code/i,
          /small\s+business/i,
        ],
        minConfidence: 0.6,
        weight: 0.9,
        active: true,
      },
      {
        id: 'contract_document_rule',
        name: 'Contract Document',
        category: 'contract_document',
        keywords: [
          'contract', 'agreement', 'terms and conditions', 'statement of work',
          'scope of work', 'deliverables', 'performance period'
        ],
        patterns: [
          /\bcontract\b/i,
          /agreement/i,
          /statement\s+of\s+work/i,
          /scope\s+of\s+work/i,
          /terms\s+and\s+conditions/i,
        ],
        minConfidence: 0.8,
        weight: 1.0,
        active: true,
      },
      {
        id: 'proposal_rule',
        name: 'Technical Proposal',
        category: 'technical_proposal',
        keywords: [
          'technical proposal', 'technical approach', 'methodology',
          'solution architecture', 'implementation plan'
        ],
        patterns: [
          /technical\s+proposal/i,
          /technical\s+approach/i,
          /methodology/i,
          /solution\s+architecture/i,
          /implementation\s+plan/i,
        ],
        minConfidence: 0.7,
        weight: 0.8,
        active: true,
      },
    ]
  }

  private initializeEntityExtractors(): void {
    this.entityExtractors.set('naics_code', [
      /naics\s*(?:code)?[:\s]*(\d{6})/gi,
      /\b(\d{6})\s*-\s*[a-zA-Z]/gi,
    ])

    this.entityExtractors.set('cage_code', [
      /cage\s*(?:code)?[:\s]*([a-zA-Z0-9]{5})/gi,
      /\bcage[:\s]*([a-zA-Z0-9]{5})\b/gi,
    ])

    this.entityExtractors.set('contract_number', [
      /contract\s*(?:number|#)?[:\s]*([a-zA-Z0-9\-]+)/gi,
      /award\s*(?:number|#)?[:\s]*([a-zA-Z0-9\-]+)/gi,
    ])

    this.entityExtractors.set('email', [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    ])

    this.entityExtractors.set('phone', [
      /(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?([2-9]\d{2})[-.\s]?(\d{4})/g,
    ])

    this.entityExtractors.set('money', [
      /\$[\d,]+(?:\.\d{2})?/g,
      /\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|USD)\b/gi,
    ])

    this.entityExtractors.set('date', [
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
      /\b\d{4}-\d{2}-\d{2}\b/g,
    ])
  }

  private async classifyWithRules(
    content: string,
    fileName: string,
    extractedData: ExtractedData
  ): Promise<DocumentClassification> {
    const scores = new Map<DocumentCategory, number>()
    const matchedKeywords = new Set<string>()
    
    // Score based on rules
    for (const rule of this.rules.filter(r => r.active)) {
      let score = 0
      
      // Check keywords
      for (const keyword of rule.keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
        const matches = content.match(regex)
        if (matches) {
          score += matches.length * 0.1
          matchedKeywords.add(keyword)
        }
      }
      
      // Check patterns
      for (const pattern of rule.patterns) {
        const matches = content.match(pattern)
        if (matches) {
          score += matches.length * 0.2
        }
      }
      
      // Apply rule weight
      score *= rule.weight
      
      if (score >= rule.minConfidence) {
        scores.set(rule.category, Math.max(scores.get(rule.category) || 0, score))
      }
    }

    // Find best category
    let bestCategory: DocumentCategory = 'other'
    let bestScore = 0
    
    for (const [category, score] of scores) {
      if (score > bestScore) {
        bestCategory = category
        bestScore = score
      }
    }

    // Normalize confidence to 0-1 range
    const confidence = Math.min(bestScore, 1.0)

    return {
      category: bestCategory,
      subcategory: this.getSubcategory(bestCategory, extractedData),
      confidentialityLevel: this.determineConfidentialityLevel(content, extractedData),
      businessType: this.determineBusinessType(extractedData),
      documentType: this.determineDocumentType(fileName, content),
      naicsCodes: this.extractNAICSCodes(extractedData.entities),
      agencies: this.extractAgencies(extractedData.entities),
      keywords: Array.from(matchedKeywords),
      entities: extractedData.entities,
      confidence,
      aiGenerated: false,
      classifiedAt: Date.now(),
      classifiedBy: 'rule_engine',
      reviewRequired: confidence < 0.8,
    }
  }

  private async classifyWithAI(
    content: string,
    extractedData: ExtractedData
  ): Promise<DocumentClassification | null> {
    try {
      // In production, this would call AWS Bedrock or other AI service
      // For now, return null to indicate AI classification is not available
      return null
    } catch (error) {
      logger.error('AI classification failed', error instanceof Error ? error : undefined)
      return null
    }
  }

  private combineClassificationResults(
    ruleResult: DocumentClassification,
    aiResult: DocumentClassification | null,
    metadata?: any
  ): DocumentClassification {
    if (!aiResult) {
      return ruleResult
    }

    // Combine rule-based and AI results
    // Prefer AI result if confidence is higher
    if (aiResult.confidence > ruleResult.confidence) {
      return {
        ...aiResult,
        keywords: [...ruleResult.keywords, ...aiResult.keywords],
        reviewRequired: aiResult.confidence < 0.9,
      }
    }

    return {
      ...ruleResult,
      reviewRequired: ruleResult.confidence < 0.8,
    }
  }

  private async extractEntities(content: string): Promise<DocumentEntity[]> {
    const entities: DocumentEntity[] = []
    
    for (const [entityType, patterns] of this.entityExtractors) {
      for (const pattern of patterns) {
        let match
        const regex = new RegExp(pattern.source, pattern.flags)
        
        while ((match = regex.exec(content)) !== null) {
          entities.push({
            text: match[0],
            type: entityType,
            confidence: 0.8,
            startOffset: match.index,
            endOffset: match.index + match[0].length,
            metadata: {},
          })
        }
      }
    }

    return entities
  }

  private extractKeyPhrases(content: string): string[] {
    // Simple keyword extraction - in production would use NLP
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
    
    const frequency = new Map<string, number>()
    words.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1)
    })
    
    return Array.from(frequency.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word)
  }

  private extractTopics(content: string, keyPhrases: string[]): string[] {
    // Simple topic extraction based on key phrases
    const topics = new Set<string>()
    
    const topicKeywords = {
      'software_development': ['software', 'development', 'programming', 'code', 'application'],
      'cybersecurity': ['security', 'cyber', 'vulnerability', 'threat', 'protection'],
      'cloud_services': ['cloud', 'aws', 'azure', 'saas', 'infrastructure'],
      'data_analytics': ['data', 'analytics', 'analysis', 'intelligence', 'reporting'],
      'consulting': ['consulting', 'advisory', 'strategy', 'planning', 'management'],
    }
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const matches = keywords.filter(keyword => 
        keyPhrases.some(phrase => phrase.includes(keyword))
      ).length
      
      if (matches >= 2) {
        topics.add(topic)
      }
    }
    
    return Array.from(topics)
  }

  private async generateSummary(content: string): Promise<string | undefined> {
    // Simple extractive summary - first few sentences
    const sentences = content.match(/[^\.!?]+[\.!?]+/g) || []
    if (sentences.length === 0) return undefined
    
    return sentences.slice(0, 3).join(' ').trim()
  }

  private analyzeStructure(content: string): any {
    const lines = content.split('\n')
    const wordCount = content.split(/\s+/).length
    const characterCount = content.length
    
    return {
      sections: [],
      headers: [],
      footers: [],
      pageCount: 1,
      wordCount,
      characterCount,
      outline: [],
    }
  }

  private extractDates(content: string): any[] {
    const dates: any[] = []
    const datePattern = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi
    
    let match
    while ((match = datePattern.exec(content)) !== null) {
      dates.push({
        text: match[0],
        date: new Date(match[0]),
        type: 'absolute',
        confidence: 0.9,
        position: {
          startOffset: match.index,
          endOffset: match.index + match[0].length,
        },
      })
    }
    
    return dates
  }

  private extractAmounts(content: string): any[] {
    const amounts: any[] = []
    const moneyPattern = /\$[\d,]+(?:\.\d{2})?/g
    
    let match
    while ((match = moneyPattern.exec(content)) !== null) {
      const amountText = match[0]
      const amount = parseFloat(amountText.replace(/[$,]/g, ''))
      
      amounts.push({
        text: amountText,
        amount,
        currency: 'USD',
        type: 'monetary',
        confidence: 0.95,
        position: {
          startOffset: match.index,
          endOffset: match.index + amountText.length,
        },
      })
    }
    
    return amounts
  }

  private extractTables(content: string): any[] {
    // Simple table detection - look for tab-separated or multiple space-separated values
    const lines = content.split('\n')
    const tables: any[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.includes('\t') || /\s{3,}/.test(line)) {
        // Potential table row
        const cells = line.split(/\t|\s{3,}/).filter(cell => cell.trim())
        if (cells.length >= 2) {
          tables.push({
            id: `table_${i}`,
            headers: cells,
            rows: [],
            position: {
              line: i,
              startOffset: 0,
              endOffset: line.length,
            },
            extracted: true,
          })
        }
      }
    }
    
    return tables
  }

  private extractLinks(content: string): any[] {
    const links: any[] = []
    const urlPattern = /(https?:\/\/[^\s]+)/g
    
    let match
    while ((match = urlPattern.exec(content)) !== null) {
      links.push({
        text: match[0],
        url: match[0],
        type: 'external',
        position: {
          startOffset: match.index,
          endOffset: match.index + match[0].length,
        },
      })
    }
    
    return links
  }

  private getSubcategory(category: DocumentCategory, extractedData: ExtractedData): string | undefined {
    switch (category) {
      case 'sources_sought_response':
        if (extractedData.keyPhrases.some(k => k.includes('pre-solicitation'))) {
          return 'pre_solicitation'
        }
        if (extractedData.keyPhrases.some(k => k.includes('market research'))) {
          return 'market_research'
        }
        return undefined
      
      case 'technical_proposal':
        if (extractedData.topics.includes('software_development')) {
          return 'software_development'
        }
        if (extractedData.topics.includes('cybersecurity')) {
          return 'cybersecurity'
        }
        return undefined
      
      default:
        return undefined
    }
  }

  private determineConfidentialityLevel(content: string, extractedData: ExtractedData): ConfidentialityLevel {
    const sensitiveKeywords = ['confidential', 'proprietary', 'classified', 'restricted']
    
    for (const keyword of sensitiveKeywords) {
      if (content.toLowerCase().includes(keyword)) {
        return 'confidential'
      }
    }
    
    // Check for PII
    const hasPII = extractedData.entities.some(entity => 
      ['email', 'phone'].includes(entity.type)
    )
    
    if (hasPII) {
      return 'internal'
    }
    
    return 'public'
  }

  private determineBusinessType(extractedData: ExtractedData): BusinessType {
    const content = extractedData.entities.map(e => e.text).join(' ').toLowerCase()
    
    if (content.includes('8(a)') || content.includes('8a')) {
      return '8a_certified'
    }
    if (content.includes('woman-owned') || content.includes('wosb')) {
      return 'woman_owned'
    }
    if (content.includes('veteran-owned') || content.includes('sdvosb')) {
      return 'veteran_owned'
    }
    if (content.includes('hubzone')) {
      return 'hubzone'
    }
    if (content.includes('small business')) {
      return 'small_business'
    }
    
    return 'other'
  }

  private determineDocumentType(fileName: string, content: string): DocumentType {
    const extension = fileName.split('.').pop()?.toLowerCase()
    
    switch (extension) {
      case 'pdf':
        return 'pdf'
      case 'doc':
      case 'docx':
        return 'word'
      case 'txt':
        return 'text'
      case 'xls':
      case 'xlsx':
        return 'spreadsheet'
      case 'ppt':
      case 'pptx':
        return 'presentation'
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return 'image'
      default:
        // Analyze content for document type hints
        if (content.includes('<html') || content.includes('<body')) {
          return 'web_page'
        }
        return 'other'
    }
  }

  private extractNAICSCodes(entities: DocumentEntity[]): string[] {
    return entities
      .filter(entity => entity.type === 'naics_code')
      .map(entity => entity.text)
      .filter(code => /^\d{6}$/.test(code))
  }

  private extractAgencies(entities: DocumentEntity[]): string[] {
    // Extract organization entities that might be government agencies
    const agencies = new Set<string>()
    const agencyKeywords = [
      'department', 'agency', 'bureau', 'office', 'administration',
      'dod', 'va', 'gsa', 'dhs', 'nasa', 'nih', 'epa'
    ]
    
    entities
      .filter(entity => entity.type === 'organization')
      .forEach(entity => {
        const text = entity.text.toLowerCase()
        if (agencyKeywords.some(keyword => text.includes(keyword))) {
          agencies.add(entity.text)
        }
      })
    
    return Array.from(agencies)
  }

  private async loadCustomRules(): Promise<void> {
    // In production, would load from database
    logger.debug('Loading custom classification rules')
  }

  private async initializeAIModels(): Promise<void> {
    // In production, would initialize AI service connections
    logger.debug('Initializing AI classification models')
  }

  private getDefaultClassification(): DocumentClassification {
    return {
      category: 'other',
      confidentialityLevel: 'internal',
      businessType: 'other',
      documentType: 'other',
      naicsCodes: [],
      agencies: [],
      keywords: [],
      entities: [],
      confidence: 0,
      aiGenerated: false,
      classifiedAt: Date.now(),
      classifiedBy: 'fallback',
      reviewRequired: true,
    }
  }

  private getDefaultExtractedData(): ExtractedData {
    return {
      entities: [],
      keyPhrases: [],
      topics: [],
      structure: {
        sections: [],
        headers: [],
        footers: [],
        pageCount: 0,
        wordCount: 0,
        characterCount: 0,
        outline: [],
      },
      tables: [],
      images: [],
      links: [],
      dates: [],
      amounts: [],
    }
  }
}

export default DocumentClassifier