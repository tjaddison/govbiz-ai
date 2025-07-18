/**
 * Document Processor
 * 
 * AI-powered document processing pipeline with OCR, format conversion,
 * content extraction, and automated analysis capabilities
 */

import { 
  Document, 
  ProcessingJob, 
  ProcessingType,
  ProcessingStatus,
  ProcessingError,
  ExtractedData,
  DocumentClassification,
  ProcessingConfig
} from './types'
import { DocumentClassifier } from './classifier'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { AWS_RESOURCES } from '@/lib/aws-config'
import { sqsClient } from '@/lib/aws-config'
import { SendMessageCommand } from '@aws-sdk/client-sqs'

export interface ProcessingResult {
  job: ProcessingJob
  extractedData?: ExtractedData
  classification?: DocumentClassification
  convertedContent?: string
  error?: ProcessingError
}

export interface ProcessingPipeline {
  id: string
  name: string
  steps: ProcessingStep[]
  parallel: boolean
  retryAttempts: number
  timeout: number
}

export interface ProcessingStep {
  id: string
  type: ProcessingType
  processor: string
  config: Record<string, any>
  dependencies: string[]
  optional: boolean
  timeout: number
}

export interface OCRResult {
  text: string
  confidence: number
  blocks: TextBlock[]
  tables: TableBlock[]
  forms: FormBlock[]
}

export interface TextBlock {
  id: string
  text: string
  boundingBox: BoundingBox
  confidence: number
  type: 'line' | 'word' | 'paragraph'
}

export interface TableBlock {
  id: string
  rows: TableRow[]
  boundingBox: BoundingBox
  confidence: number
}

export interface TableRow {
  cells: TableCell[]
}

export interface TableCell {
  text: string
  boundingBox: BoundingBox
  isHeader: boolean
  columnSpan: number
  rowSpan: number
}

export interface FormBlock {
  id: string
  fields: FormField[]
  boundingBox: BoundingBox
}

export interface FormField {
  key: string
  value: string
  confidence: number
  boundingBox: BoundingBox
}

export interface BoundingBox {
  left: number
  top: number
  width: number
  height: number
}

export class DocumentProcessor {
  private processingJobs: Map<string, ProcessingJob> = new Map()
  private pipelines: Map<string, ProcessingPipeline> = new Map()
  private processors: Map<string, any> = new Map()

  constructor(
    private classifier: DocumentClassifier,
    private config?: ProcessingConfig
  ) {
    this.initializePipelines()
    this.initializeProcessors()
  }

  /**
   * Process a document through the complete pipeline
   */
  async process(
    document: Partial<Document>,
    pipelineId = 'default',
    options: {
      priority?: 'low' | 'normal' | 'high'
      async?: boolean
      steps?: ProcessingType[]
    } = {}
  ): Promise<ProcessingResult> {
    const startTime = Date.now()
    
    try {
      const job = this.createProcessingJob(document, pipelineId, options)
      this.processingJobs.set(job.id, job)

      if (options.async) {
        // Queue for async processing
        await this.queueProcessingJob(job)
        return { job }
      }

      // Process synchronously
      const result = await this.executeProcessingJob(job)
      
      const processingTime = Date.now() - startTime

      // Record metrics
      await metricsCollector.recordMetric(
        'document_processing_time',
        processingTime,
        'milliseconds',
        { 
          pipelineId,
          status: result.job.status,
          stepsCount: (options.steps?.length || 0).toString()
        }
      )

      logger.info('Document processing completed', {
        jobId: job.id,
        pipelineId,
        status: result.job.status,
        processingTime,
      }, 'processing')

      return result
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Document processing failed', error instanceof Error ? error : undefined, {
        pipelineId,
        processingTime,
      }, 'processing')

      const processingError: ProcessingError = {
        code: 'PROCESSING_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        recoverable: true,
      }

      return {
        job: {
          id: 'failed',
          documentId: document.id || 'unknown',
          type: 'analysis',
          status: 'failed',
          progress: 0,
          startedAt: startTime,
          completedAt: Date.now(),
          error: processingError,
          metadata: {},
        },
        error: processingError,
      }
    }
  }

  /**
   * Perform OCR on document images
   */
  async performOCR(
    imageData: Buffer | string,
    options: {
      language?: string
      detectTables?: boolean
      detectForms?: boolean
      enhanceImage?: boolean
    } = {}
  ): Promise<OCRResult> {
    const startTime = Date.now()
    
    try {
      // In production, would use AWS Textract or similar service
      const mockResult: OCRResult = {
        text: this.mockOCRExtraction(imageData),
        confidence: 0.95,
        blocks: [],
        tables: [],
        forms: [],
      }

      const processingTime = Date.now() - startTime

      await metricsCollector.recordMetric(
        'ocr_processing_time',
        processingTime,
        'milliseconds',
        { 
          confidence: mockResult.confidence.toString(),
          textLength: mockResult.text.length.toString()
        }
      )

      logger.debug('OCR processing completed', {
        textLength: mockResult.text.length,
        confidence: mockResult.confidence,
        processingTime,
      })

      return mockResult
    } catch (error) {
      logger.error('OCR processing failed', error instanceof Error ? error : undefined)
      
      return {
        text: '',
        confidence: 0,
        blocks: [],
        tables: [],
        forms: [],
      }
    }
  }

  /**
   * Convert document between formats
   */
  async convertFormat(
    content: string | Buffer,
    fromFormat: string,
    toFormat: string,
    options: Record<string, any> = {}
  ): Promise<string | Buffer> {
    const startTime = Date.now()
    
    try {
      let convertedContent: string | Buffer = content

      // Simple format conversion logic
      if (fromFormat === 'pdf' && toFormat === 'text') {
        // Extract text from PDF
        convertedContent = await this.extractTextFromPDF(content as Buffer)
      } else if (fromFormat === 'docx' && toFormat === 'text') {
        // Extract text from Word document
        convertedContent = await this.extractTextFromDocx(content as Buffer)
      } else if (fromFormat === 'html' && toFormat === 'text') {
        // Strip HTML tags
        convertedContent = this.stripHtmlTags(content as string)
      } else if (fromFormat === 'markdown' && toFormat === 'html') {
        // Convert Markdown to HTML
        convertedContent = this.convertMarkdownToHtml(content as string)
      } else {
        // No conversion needed or unsupported
        convertedContent = content
      }

      const processingTime = Date.now() - startTime

      await metricsCollector.recordMetric(
        'format_conversion_time',
        processingTime,
        'milliseconds',
        { fromFormat, toFormat }
      )

      logger.debug('Format conversion completed', {
        fromFormat,
        toFormat,
        processingTime,
      })

      return convertedContent
    } catch (error) {
      logger.error('Format conversion failed', error instanceof Error ? error : undefined, {
        fromFormat,
        toFormat,
      })
      
      return content
    }
  }

  /**
   * Extract structured data from document
   */
  async extractStructuredData(
    content: string,
    extractionRules: {
      entities: string[]
      patterns: Record<string, RegExp>
      tables: boolean
      forms: boolean
    }
  ): Promise<ExtractedData> {
    try {
      const extractedData = await this.classifier.extractData(content)
      
      // Apply custom extraction rules
      if (extractionRules.patterns) {
        for (const [name, pattern] of Object.entries(extractionRules.patterns)) {
          const matches = content.match(pattern) || []
          extractedData.keyPhrases.push(...matches)
        }
      }

      // Extract tables if requested
      if (extractionRules.tables) {
        const additionalTables = this.extractTablesFromText(content)
        extractedData.tables.push(...additionalTables)
      }

      logger.debug('Structured data extraction completed', {
        entitiesFound: extractedData.entities.length,
        keyPhrasesFound: extractedData.keyPhrases.length,
        tablesFound: extractedData.tables.length,
      })

      return extractedData
    } catch (error) {
      logger.error('Structured data extraction failed', error instanceof Error ? error : undefined)
      
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

  /**
   * Validate document content and structure
   */
  async validateDocument(
    document: Partial<Document>,
    validationRules: {
      requiredFields: string[]
      maxSize: number
      allowedFormats: string[]
      contentRules: ValidationRule[]
    }
  ): Promise<{
    isValid: boolean
    errors: string[]
    warnings: string[]
  }> {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      // Check required fields
      for (const field of validationRules.requiredFields) {
        if (!document[field as keyof Document]) {
          errors.push(`Required field '${field}' is missing`)
        }
      }

      // Check file size
      if (document.fileSize && document.fileSize > validationRules.maxSize) {
        errors.push(`Document size ${document.fileSize} exceeds maximum ${validationRules.maxSize}`)
      }

      // Check format
      if (document.contentType && !validationRules.allowedFormats.includes(document.contentType)) {
        errors.push(`Document format '${document.contentType}' is not allowed`)
      }

      // Apply content validation rules
      if (document.content) {
        for (const rule of validationRules.contentRules) {
          const result = this.applyValidationRule(document.content, rule)
          if (!result.valid) {
            if (result.severity === 'error') {
              errors.push(result.message)
            } else {
              warnings.push(result.message)
            }
          }
        }
      }

      const isValid = errors.length === 0

      logger.debug('Document validation completed', {
        isValid,
        errorCount: errors.length,
        warningCount: warnings.length,
      })

      return { isValid, errors, warnings }
    } catch (error) {
      logger.error('Document validation failed', error instanceof Error ? error : undefined)
      
      return {
        isValid: false,
        errors: ['Validation process failed'],
        warnings: [],
      }
    }
  }

  /**
   * Get processing job status
   */
  getJobStatus(jobId: string): ProcessingJob | null {
    return this.processingJobs.get(jobId) || null
  }

  /**
   * Cancel a processing job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    try {
      const job = this.processingJobs.get(jobId)
      if (!job) return false

      job.status = 'cancelled'
      job.completedAt = Date.now()

      logger.info('Processing job cancelled', { jobId })
      return true
    } catch (error) {
      logger.error('Failed to cancel processing job', error instanceof Error ? error : undefined, { jobId })
      return false
    }
  }

  // Private methods

  private initializePipelines(): void {
    // Default processing pipeline
    this.pipelines.set('default', {
      id: 'default',
      name: 'Default Document Processing',
      steps: [
        {
          id: 'classification',
          type: 'classification',
          processor: 'ai_classifier',
          config: {},
          dependencies: [],
          optional: false,
          timeout: 30000,
        },
        {
          id: 'extraction',
          type: 'extraction',
          processor: 'data_extractor',
          config: {},
          dependencies: ['classification'],
          optional: false,
          timeout: 20000,
        },
        {
          id: 'analysis',
          type: 'analysis',
          processor: 'content_analyzer',
          config: {},
          dependencies: ['extraction'],
          optional: true,
          timeout: 15000,
        },
      ],
      parallel: false,
      retryAttempts: 2,
      timeout: 120000,
    })

    // OCR pipeline for scanned documents
    this.pipelines.set('ocr', {
      id: 'ocr',
      name: 'OCR Processing Pipeline',
      steps: [
        {
          id: 'ocr',
          type: 'ocr',
          processor: 'textract',
          config: { detectTables: true, detectForms: true },
          dependencies: [],
          optional: false,
          timeout: 60000,
        },
        {
          id: 'classification',
          type: 'classification',
          processor: 'ai_classifier',
          config: {},
          dependencies: ['ocr'],
          optional: false,
          timeout: 30000,
        },
      ],
      parallel: false,
      retryAttempts: 3,
      timeout: 180000,
    })
  }

  private initializeProcessors(): void {
    // Initialize various processors
    this.processors.set('ai_classifier', this.classifier)
    this.processors.set('data_extractor', this)
    this.processors.set('content_analyzer', this)
    this.processors.set('textract', this)
  }

  private createProcessingJob(
    document: Partial<Document>,
    pipelineId: string,
    options: any
  ): ProcessingJob {
    return {
      id: this.generateJobId(),
      documentId: document.id || 'temp',
      type: 'analysis',
      status: 'pending',
      progress: 0,
      startedAt: Date.now(),
      metadata: {
        pipelineId,
        options,
        priority: options.priority || 'normal',
      },
    }
  }

  private async executeProcessingJob(job: ProcessingJob): Promise<ProcessingResult> {
    try {
      job.status = 'processing'
      job.progress = 0

      const pipeline = this.pipelines.get(job.metadata.pipelineId)
      if (!pipeline) {
        throw new Error(`Pipeline '${job.metadata.pipelineId}' not found`)
      }

      let extractedData: ExtractedData | undefined
      let classification: DocumentClassification | undefined
      let convertedContent: string | undefined

      // Execute pipeline steps
      for (let i = 0; i < pipeline.steps.length; i++) {
        const step = pipeline.steps[i]
        job.progress = (i / pipeline.steps.length) * 100

        try {
          const result = await this.executeProcessingStep(step, job)
          
          // Store results based on step type
          switch (step.type) {
            case 'classification':
              classification = result.classification
              break
            case 'extraction':
              extractedData = result.extractedData
              break
            case 'conversion':
              convertedContent = result.convertedContent
              break
          }
        } catch (stepError) {
          if (!step.optional) {
            throw stepError
          }
          // Log but continue for optional steps
          logger.error('Optional processing step failed', stepError instanceof Error ? stepError : undefined, {
            jobId: job.id,
            stepId: step.id,
          }, 'processor')
        }
      }

      job.status = 'completed'
      job.progress = 100
      job.completedAt = Date.now()

      return {
        job,
        extractedData,
        classification,
        convertedContent,
      }
    } catch (error) {
      job.status = 'failed'
      job.completedAt = Date.now()
      job.error = {
        code: 'EXECUTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        recoverable: true,
      }

      return { job, error: job.error }
    }
  }

  private async executeProcessingStep(step: ProcessingStep, job: ProcessingJob): Promise<any> {
    const processor = this.processors.get(step.processor)
    if (!processor) {
      throw new Error(`Processor '${step.processor}' not found`)
    }

    switch (step.type) {
      case 'classification':
        const classificationResult = await this.classifier.classify({
          id: job.documentId,
          content: 'sample content', // Would get from job context
        } as Document)
        return { classification: classificationResult.classification }

      case 'extraction':
        const extractedData = await this.extractStructuredData(
          'sample content', // Would get from job context
          {
            entities: ['person', 'organization', 'location'],
            patterns: {},
            tables: true,
            forms: true,
          }
        )
        return { extractedData }

      case 'ocr':
        const ocrResult = await this.performOCR('sample image data', step.config)
        return { convertedContent: ocrResult.text }

      default:
        throw new Error(`Unsupported step type: ${step.type}`)
    }
  }

  private async queueProcessingJob(job: ProcessingJob): Promise<void> {
    try {
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: AWS_RESOURCES.QUEUES.MESSAGES,
        MessageBody: JSON.stringify(job),
        MessageAttributes: {
          priority: {
            StringValue: job.metadata.priority || 'normal',
            DataType: 'String',
          },
        },
      }))

      logger.debug('Processing job queued', { jobId: job.id })
    } catch (error) {
      logger.error('Failed to queue processing job', error instanceof Error ? error : undefined, {
        jobId: job.id,
      })
      throw error
    }
  }

  // Mock implementation methods (would be replaced with real services)

  private mockOCRExtraction(imageData: Buffer | string): string {
    return 'This is extracted text from OCR processing. In production, this would use AWS Textract or similar service.'
  }

  private async extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
    // Mock PDF text extraction
    return 'Extracted text from PDF document. In production, would use PDF parsing library.'
  }

  private async extractTextFromDocx(docxBuffer: Buffer): Promise<string> {
    // Mock Word document text extraction
    return 'Extracted text from Word document. In production, would use Office document parsing library.'
  }

  private stripHtmlTags(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim()
  }

  private convertMarkdownToHtml(markdown: string): string {
    // Simple markdown to HTML conversion
    return markdown
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
  }

  private extractTablesFromText(content: string): any[] {
    // Simple table extraction from tab-separated or space-separated values
    const tables: any[] = []
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.includes('\t') || /\s{3,}/.test(line)) {
        const cells = line.split(/\t|\s{3,}/).filter(cell => cell.trim())
        if (cells.length >= 2) {
          tables.push({
            id: `extracted_table_${i}`,
            headers: cells,
            rows: [],
            position: { line: i, startOffset: 0, endOffset: line.length },
            extracted: true,
          })
        }
      }
    }
    
    return tables
  }

  private applyValidationRule(content: string, rule: any): {
    valid: boolean
    message: string
    severity: 'error' | 'warning'
  } {
    // Simple validation rule application
    switch (rule.type) {
      case 'minLength':
        return {
          valid: content.length >= rule.value,
          message: `Content must be at least ${rule.value} characters`,
          severity: rule.severity || 'error',
        }
      case 'maxLength':
        return {
          valid: content.length <= rule.value,
          message: `Content must not exceed ${rule.value} characters`,
          severity: rule.severity || 'error',
        }
      case 'pattern':
        return {
          valid: rule.value.test(content),
          message: rule.message || 'Content does not match required pattern',
          severity: rule.severity || 'error',
        }
      default:
        return { valid: true, message: '', severity: 'error' }
    }
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

interface ValidationRule {
  type: 'minLength' | 'maxLength' | 'pattern' | 'required'
  value: any
  message?: string
  severity?: 'error' | 'warning'
}

export default DocumentProcessor