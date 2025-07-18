/**
 * Document Templates System
 * 
 * Comprehensive template management for government contracting documents
 * with variable substitution, conditional logic, and validation
 */

import { 
  DocumentTemplate, 
  DocumentMetadata,
  TemplateVariable, 
  TemplateSection,
  TemplateMetadata,
  TemplateUsage,
  TemplateCategory,
  DocumentFormat,
  ValidationRule,
  Document
} from './types'
import { DocumentStorage } from './storage'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { AWS_RESOURCES } from '@/lib/aws-config'

export interface TemplateRenderOptions {
  variables: Record<string, any>
  format: DocumentFormat
  includeOptionalSections: boolean
  validateBeforeRender: boolean
  generateMetadata: boolean
}

export interface TemplateRenderResult {
  content: string
  metadata: DocumentMetadata
  usedVariables: string[]
  skippedSections: string[]
  validationErrors: string[]
  renderTime: number
}

export interface TemplateLibrary {
  category: TemplateCategory
  templates: DocumentTemplate[]
  count: number
  lastUpdated: number
}

export class DocumentTemplates {
  private templates: Map<string, DocumentTemplate> = new Map()
  private templateLibraries: Map<TemplateCategory, TemplateLibrary> = new Map()
  private isInitialized = false

  constructor(private storage: DocumentStorage) {}

  /**
   * Initialize the template system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Load built-in templates
      await this.loadBuiltInTemplates()
      
      // Load custom templates from storage
      await this.loadCustomTemplates()
      
      // Initialize template libraries
      this.initializeLibraries()
      
      this.isInitialized = true
      logger.info('Document templates system initialized successfully', {
        templateCount: this.templates.size,
        libraryCount: this.templateLibraries.size,
      })
    } catch (error) {
      logger.error('Failed to initialize document templates', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<DocumentTemplate | null> {
    try {
      if (!this.isInitialized) {
        await this.initialize()
      }

      const template = this.templates.get(templateId)
      if (!template) {
        logger.warn('Template not found', { templateId })
        return null
      }

      // Update usage statistics
      await this.updateTemplateUsage(templateId, 'retrieved')

      return template
    } catch (error) {
      logger.error('Failed to get template', error instanceof Error ? error : undefined, { templateId })
      return null
    }
  }

  /**
   * Render template with provided variables
   */
  async renderTemplate(
    templateId: string,
    options: TemplateRenderOptions
  ): Promise<TemplateRenderResult> {
    const startTime = Date.now()
    
    try {
      const template = await this.getTemplate(templateId)
      if (!template) {
        throw new Error(`Template '${templateId}' not found`)
      }

      // Validate variables if requested
      let validationErrors: string[] = []
      if (options.validateBeforeRender) {
        validationErrors = this.validateTemplateVariables(template, options.variables)
        if (validationErrors.length > 0 && template.validation.some(rule => rule.severity === 'error')) {
          throw new Error(`Template validation failed: ${validationErrors.join(', ')}`)
        }
      }

      // Process sections based on conditions
      const { processedSections, skippedSections } = this.processSections(
        template.sections,
        options.variables,
        options.includeOptionalSections
      )

      // Render content
      let renderedContent = template.content
      const usedVariables: string[] = []

      // Replace variables in template content
      renderedContent = this.replaceVariables(
        renderedContent,
        options.variables,
        usedVariables
      )

      // Process sections
      for (const section of processedSections) {
        const sectionContent = this.replaceVariables(
          section.content,
          options.variables,
          usedVariables
        )
        
        // Insert section content at appropriate location
        const sectionPlaceholder = `{{section:${section.name}}}`
        renderedContent = renderedContent.replace(sectionPlaceholder, sectionContent)
      }

      // Convert to requested format
      if (options.format !== 'plain_text') {
        renderedContent = await this.convertToFormat(renderedContent, options.format)
      }

      // Generate metadata if requested
      let metadata: DocumentMetadata | undefined
      if (options.generateMetadata) {
        metadata = this.generateDocumentMetadata(template, options.variables, usedVariables)
      }

      const renderTime = Date.now() - startTime

      // Update template usage
      await this.updateTemplateUsage(templateId, 'rendered', renderTime)

      // Record metrics
      await metricsCollector.recordMetric(
        'template_render_time',
        renderTime,
        'milliseconds',
        { 
          templateId: template.id,
          category: template.category,
          format: options.format
        }
      )

      await metricsCollector.recordMetric(
        'template_variables_used',
        usedVariables.length,
        'count',
        { templateId: template.id }
      )

      logger.info('Template rendered successfully', {
        templateId,
        variablesUsed: usedVariables.length,
        sectionsSkipped: skippedSections.length,
        renderTime,
      }, 'templates')

      return {
        content: renderedContent,
        metadata: metadata || this.getDefaultMetadata(),
        usedVariables,
        skippedSections,
        validationErrors,
        renderTime,
      }
    } catch (error) {
      const renderTime = Date.now() - startTime
      
      logger.error('Template rendering failed', error instanceof Error ? error : undefined, {
        templateId,
        renderTime,
      }, 'templates')

      return {
        content: '',
        metadata: this.getDefaultMetadata(),
        usedVariables: [],
        skippedSections: [],
        validationErrors: [error instanceof Error ? error.message : 'Unknown error'],
        renderTime,
      }
    }
  }

  /**
   * List templates by category
   */
  async listTemplates(category?: TemplateCategory, includeInactive = false): Promise<DocumentTemplate[]> {
    try {
      if (!this.isInitialized) {
        await this.initialize()
      }

      let templates = Array.from(this.templates.values())

      // Filter by category
      if (category) {
        templates = templates.filter(t => t.category === category)
      }

      // Filter by active status
      if (!includeInactive) {
        templates = templates.filter(t => t.isActive)
      }

      // Sort by usage and name
      templates.sort((a, b) => {
        const usageA = a.metadata.usage.timesUsed
        const usageB = b.metadata.usage.timesUsed
        
        if (usageA !== usageB) {
          return usageB - usageA // More used first
        }
        
        return a.name.localeCompare(b.name)
      })

      return templates
    } catch (error) {
      logger.error('Failed to list templates', error instanceof Error ? error : undefined, { category })
      return []
    }
  }

  /**
   * Create a new template
   */
  async createTemplate(templateData: Omit<DocumentTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<DocumentTemplate> {
    try {
      const template: DocumentTemplate = {
        ...templateData,
        id: this.generateTemplateId(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: {
          ...templateData.metadata,
          usage: {
            timesUsed: 0,
            successRate: 1.0,
            userRatings: [],
          },
        },
      }

      // Validate template
      const validationErrors = this.validateTemplate(template)
      if (validationErrors.length > 0) {
        throw new Error(`Template validation failed: ${validationErrors.join(', ')}`)
      }

      // Store template
      this.templates.set(template.id, template)

      // Save to persistent storage
      await this.saveTemplate(template)

      // Update library
      this.updateTemplateLibrary(template)

      logger.info('Template created successfully', {
        templateId: template.id,
        name: template.name,
        category: template.category,
      }, 'templates')

      return template
    } catch (error) {
      logger.error('Failed to create template', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Update an existing template
   */
  async updateTemplate(templateId: string, updates: Partial<DocumentTemplate>): Promise<DocumentTemplate | null> {
    try {
      const existingTemplate = this.templates.get(templateId)
      if (!existingTemplate) {
        throw new Error(`Template '${templateId}' not found`)
      }

      const updatedTemplate: DocumentTemplate = {
        ...existingTemplate,
        ...updates,
        id: templateId, // Ensure ID doesn't change
        updatedAt: Date.now(),
        version: this.incrementVersion(existingTemplate.version),
      }

      // Validate updated template
      const validationErrors = this.validateTemplate(updatedTemplate)
      if (validationErrors.length > 0) {
        throw new Error(`Template validation failed: ${validationErrors.join(', ')}`)
      }

      // Update in memory
      this.templates.set(templateId, updatedTemplate)

      // Save to persistent storage
      await this.saveTemplate(updatedTemplate)

      // Update library
      this.updateTemplateLibrary(updatedTemplate)

      logger.info('Template updated successfully', {
        templateId,
        version: updatedTemplate.version,
      }, 'templates')

      return updatedTemplate
    } catch (error) {
      logger.error('Failed to update template', error instanceof Error ? error : undefined, { templateId })
      return null
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string, hardDelete = false): Promise<boolean> {
    try {
      const template = this.templates.get(templateId)
      if (!template) {
        return false
      }

      if (hardDelete) {
        // Remove completely
        this.templates.delete(templateId)
        await this.removeTemplateFromStorage(templateId)
      } else {
        // Soft delete
        const updatedTemplate = { ...template, isActive: false, updatedAt: Date.now() }
        this.templates.set(templateId, updatedTemplate)
        await this.saveTemplate(updatedTemplate)
      }

      // Update library
      this.updateTemplateLibrary(template)

      logger.info('Template deleted successfully', {
        templateId,
        hardDelete,
      }, 'templates')

      return true
    } catch (error) {
      logger.error('Failed to delete template', error instanceof Error ? error : undefined, { templateId })
      return false
    }
  }

  /**
   * Get template usage analytics
   */
  getTemplateAnalytics(templateId?: string): {
    totalTemplates: number
    totalUsage: number
    topTemplates: { template: DocumentTemplate; usage: number }[]
    categoryBreakdown: Record<TemplateCategory, number>
    avgRating: number
  } {
    const templates = templateId 
      ? [this.templates.get(templateId)].filter(Boolean) as DocumentTemplate[]
      : Array.from(this.templates.values())

    const totalUsage = templates.reduce((sum, t) => sum + t.metadata.usage.timesUsed, 0)
    
    const topTemplates = templates
      .map(template => ({ template, usage: template.metadata.usage.timesUsed }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10)

    const categoryBreakdown = templates.reduce((acc, template) => {
      acc[template.category] = (acc[template.category] || 0) + template.metadata.usage.timesUsed
      return acc
    }, {} as Record<TemplateCategory, number>)

    const allRatings = templates.flatMap(t => t.metadata.usage.userRatings.map(r => r.rating))
    const avgRating = allRatings.length > 0 
      ? allRatings.reduce((sum, rating) => sum + rating, 0) / allRatings.length 
      : 0

    return {
      totalTemplates: templates.length,
      totalUsage,
      topTemplates,
      categoryBreakdown,
      avgRating,
    }
  }

  // Private methods

  private async loadBuiltInTemplates(): Promise<void> {
    const builtInTemplates: Omit<DocumentTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        name: 'Sources Sought Response',
        description: 'Standard response template for Sources Sought notices',
        category: 'sources_sought',
        format: 'docx',
        content: this.getSourcesSoughtTemplate(),
        variables: this.getSourcesSoughtVariables(),
        sections: this.getSourcesSoughtSections(),
        metadata: this.getTemplateMetadata('Sources Sought Response', 'sources_sought'),
        validation: this.getSourcesSoughtValidation(),
        version: '1.0.0',
        isActive: true,
        createdBy: 'system',
      },
      {
        name: 'Capability Statement',
        description: 'Comprehensive capability statement template',
        category: 'proposal',
        format: 'pdf',
        content: this.getCapabilityStatementTemplate(),
        variables: this.getCapabilityStatementVariables(),
        sections: this.getCapabilityStatementSections(),
        metadata: this.getTemplateMetadata('Capability Statement', 'proposal'),
        validation: this.getCapabilityStatementValidation(),
        version: '1.0.0',
        isActive: true,
        createdBy: 'system',
      },
      {
        name: 'Technical Proposal',
        description: 'Technical proposal template for government contracts',
        category: 'proposal',
        format: 'docx',
        content: this.getTechnicalProposalTemplate(),
        variables: this.getTechnicalProposalVariables(),
        sections: this.getTechnicalProposalSections(),
        metadata: this.getTemplateMetadata('Technical Proposal', 'proposal'),
        validation: this.getTechnicalProposalValidation(),
        version: '1.0.0',
        isActive: true,
        createdBy: 'system',
      },
    ]

    for (const templateData of builtInTemplates) {
      await this.createTemplate(templateData)
    }

    logger.info('Built-in templates loaded', { count: builtInTemplates.length })
  }

  private async loadCustomTemplates(): Promise<void> {
    try {
      // In production, would load from database/storage
      logger.debug('Custom templates loaded')
    } catch (error) {
      logger.error('Failed to load custom templates', error instanceof Error ? error : undefined)
    }
  }

  private initializeLibraries(): void {
    const categories: TemplateCategory[] = [
      'sources_sought', 'proposal', 'contract', 'compliance', 
      'marketing', 'administrative', 'custom'
    ]

    for (const category of categories) {
      const categoryTemplates = Array.from(this.templates.values())
        .filter(t => t.category === category)

      this.templateLibraries.set(category, {
        category,
        templates: categoryTemplates,
        count: categoryTemplates.length,
        lastUpdated: Date.now(),
      })
    }
  }

  private validateTemplate(template: DocumentTemplate): string[] {
    const errors: string[] = []

    // Check required fields
    if (!template.name?.trim()) errors.push('Template name is required')
    if (!template.content?.trim()) errors.push('Template content is required')
    if (!template.category) errors.push('Template category is required')

    // Validate variables
    for (const variable of template.variables) {
      if (!variable.name?.trim()) errors.push('Variable name is required')
      if (variable.required && !variable.defaultValue) {
        // Check if variable is used in content
        const variablePattern = new RegExp(`{{\\s*${variable.name}\\s*}}`, 'g')
        if (!variablePattern.test(template.content)) {
          errors.push(`Required variable '${variable.name}' is not used in template content`)
        }
      }
    }

    // Validate sections
    for (const section of template.sections) {
      if (!section.name?.trim()) errors.push('Section name is required')
      if (!section.content?.trim()) errors.push(`Section '${section.name}' content is required`)
    }

    return errors
  }

  private validateTemplateVariables(template: DocumentTemplate, variables: Record<string, any>): string[] {
    const errors: string[] = []

    for (const templateVar of template.variables) {
      const value = variables[templateVar.name]

      // Check required variables
      if (templateVar.required && (value === undefined || value === null || value === '')) {
        errors.push(`Required variable '${templateVar.name}' is missing`)
        continue
      }

      // Skip validation if variable is not provided and not required
      if (value === undefined || value === null) continue

      // Type validation
      switch (templateVar.type) {
        case 'number':
          if (isNaN(Number(value))) {
            errors.push(`Variable '${templateVar.name}' must be a number`)
          }
          break
        case 'date':
          if (!(value instanceof Date) && isNaN(Date.parse(value))) {
            errors.push(`Variable '${templateVar.name}' must be a valid date`)
          }
          break
        case 'boolean':
          if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
            errors.push(`Variable '${templateVar.name}' must be a boolean`)
          }
          break
        case 'list':
          if (!Array.isArray(value)) {
            errors.push(`Variable '${templateVar.name}' must be an array`)
          }
          break
      }

      // Custom validation
      if (templateVar.validation) {
        const result = this.applyVariableValidation(value, templateVar.validation)
        if (!result.valid) {
          errors.push(result.message)
        }
      }
    }

    return errors
  }

  private processSections(
    sections: TemplateSection[],
    variables: Record<string, any>,
    includeOptional: boolean
  ): { processedSections: TemplateSection[]; skippedSections: string[] } {
    const processedSections: TemplateSection[] = []
    const skippedSections: string[] = []

    for (const section of sections) {
      // Check if section should be included
      let includeSection = section.required || includeOptional

      // Evaluate conditions
      if (section.conditions.length > 0) {
        includeSection = this.evaluateSectionConditions(section.conditions, variables)
      }

      if (includeSection) {
        processedSections.push(section)
      } else {
        skippedSections.push(section.name)
      }
    }

    // Sort by order
    processedSections.sort((a, b) => a.order - b.order)

    return { processedSections, skippedSections }
  }

  private evaluateSectionConditions(conditions: any[], variables: Record<string, any>): boolean {
    return conditions.every(condition => {
      const fieldValue = variables[condition.field]
      
      switch (condition.operator) {
        case 'eq':
          return fieldValue === condition.value
        case 'ne':
          return fieldValue !== condition.value
        case 'gt':
          return fieldValue > condition.value
        case 'lt':
          return fieldValue < condition.value
        case 'contains':
          return String(fieldValue).includes(condition.value)
        case 'empty':
          return !fieldValue || fieldValue === ''
        default:
          return true
      }
    })
  }

  private replaceVariables(
    content: string,
    variables: Record<string, any>,
    usedVariables: string[]
  ): string {
    return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, variableName) => {
      const value = variables[variableName]
      
      if (value !== undefined && value !== null) {
        usedVariables.push(variableName)
        return String(value)
      }
      
      return match // Keep placeholder if variable not found
    })
  }

  private async convertToFormat(content: string, format: DocumentFormat): Promise<string> {
    switch (format) {
      case 'html':
        return this.convertToHtml(content)
      case 'markdown':
        return this.convertToMarkdown(content)
      case 'pdf':
        // In production, would generate PDF
        return content
      case 'docx':
        // In production, would generate Word document
        return content
      default:
        return content
    }
  }

  private convertToHtml(content: string): string {
    return content
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>')
  }

  private convertToMarkdown(content: string): string {
    // Basic markdown conversion
    return content
      .replace(/^([A-Z][^a-z\n]*?)$/gm, '# $1') // Headers
      .replace(/^(\d+\.\s)/gm, '$1') // Keep numbered lists
      .replace(/^(-\s)/gm, '$1') // Keep bullet lists
  }

  private generateDocumentMetadata(
    template: DocumentTemplate,
    variables: Record<string, any>,
    usedVariables: string[]
  ): DocumentMetadata {
    return {
      title: variables.title || template.name,
      description: variables.description || template.description,
      author: variables.author || 'GovBiz.ai',
      tags: [template.category, ...usedVariables.slice(0, 5)],
      customFields: variables,
      extractedData: {
        entities: [],
        keyPhrases: usedVariables,
        topics: [template.category],
        structure: {
          sections: [],
          headers: [],
          footers: [],
          pageCount: 1,
          wordCount: template.content.split(/\s+/).length,
          characterCount: template.content.length,
          outline: [],
        },
        tables: [],
        images: [],
        links: [],
        dates: [],
        amounts: [],
      },
      processingStatus: 'completed',
      language: 'en',
      encoding: 'utf-8',
    }
  }

  private async updateTemplateUsage(templateId: string, action: string, duration?: number): Promise<void> {
    try {
      const template = this.templates.get(templateId)
      if (!template) return

      const usage = template.metadata.usage
      
      switch (action) {
        case 'retrieved':
          // Don't count retrieval as usage
          break
        case 'rendered':
          usage.timesUsed++
          usage.lastUsed = Date.now()
          if (duration) {
            usage.avgCompletionTime = usage.avgCompletionTime 
              ? (usage.avgCompletionTime + duration) / 2 
              : duration
          }
          break
      }

      // Update template
      this.templates.set(templateId, template)
      
      // Save to storage
      await this.saveTemplate(template)
    } catch (error) {
      logger.error('Failed to update template usage', error instanceof Error ? error : undefined, { templateId })
    }
  }

  private updateTemplateLibrary(template: DocumentTemplate): void {
    const library = this.templateLibraries.get(template.category)
    if (library) {
      // Update existing library
      const templateIndex = library.templates.findIndex(t => t.id === template.id)
      if (templateIndex >= 0) {
        library.templates[templateIndex] = template
      } else {
        library.templates.push(template)
      }
      library.count = library.templates.length
      library.lastUpdated = Date.now()
    }
  }

  private async saveTemplate(template: DocumentTemplate): Promise<void> {
    // In production, would save to database/storage
    logger.debug('Template saved', { templateId: template.id })
  }

  private async removeTemplateFromStorage(templateId: string): Promise<void> {
    // In production, would remove from database/storage
    logger.debug('Template removed from storage', { templateId })
  }

  private applyVariableValidation(value: any, validation: ValidationRule): { valid: boolean; message: string } {
    switch (validation.type) {
      case 'required':
        return {
          valid: value !== undefined && value !== null && value !== '',
          message: validation.message || 'This field is required'
        }
      case 'minLength':
        return {
          valid: String(value).length >= validation.value,
          message: validation.message || `Must be at least ${validation.value} characters`
        }
      case 'maxLength':
        return {
          valid: String(value).length <= validation.value,
          message: validation.message || `Must not exceed ${validation.value} characters`
        }
      case 'pattern':
        return {
          valid: validation.value.test(String(value)),
          message: validation.message || 'Invalid format'
        }
      default:
        return { valid: true, message: '' }
    }
  }

  private generateTemplateId(): string {
    return `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private incrementVersion(currentVersion: string): string {
    const [major, minor, patch] = currentVersion.split('.').map(Number)
    return `${major}.${minor}.${patch + 1}`
  }

  private getDefaultMetadata(): DocumentMetadata {
    return {
      title: 'Untitled Document',
      author: 'GovBiz.ai',
      tags: [],
      customFields: {},
      extractedData: {
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
      },
      processingStatus: 'completed',
      language: 'en',
      encoding: 'utf-8',
    }
  }

  // Template content generators (simplified for example)
  
  private getSourcesSoughtTemplate(): string {
    return `{{companyLetterhead}}

{{date}}

{{contactPerson}}
{{agency}}
{{address}}

RE: Sources Sought Notice - {{noticeTitle}}
Notice ID: {{noticeId}}

Dear {{contactPerson}},

{{companyName}} is pleased to submit this response to the above-referenced sources sought notice. We are a {{businessSize}} capable of providing the requested {{serviceType}}.

{{section:companyInformation}}

{{section:relevantExperience}}

{{section:capabilities}}

{{section:recommendations}}

We appreciate the opportunity to respond and look forward to the potential solicitation.

Sincerely,

{{authorName}}
{{authorTitle}}
{{companyName}}`
  }

  private getSourcesSoughtVariables(): TemplateVariable[] {
    return [
      { name: 'companyLetterhead', type: 'text', required: true, description: 'Company letterhead', placeholder: '[COMPANY LETTERHEAD]' },
      { name: 'date', type: 'date', required: true, description: 'Document date', placeholder: 'Current date' },
      { name: 'contactPerson', type: 'text', required: true, description: 'Government contact person', placeholder: 'Contact name' },
      { name: 'agency', type: 'text', required: true, description: 'Government agency', placeholder: 'Agency name' },
      { name: 'address', type: 'text', required: true, description: 'Agency address', placeholder: 'Agency address' },
      { name: 'noticeTitle', type: 'text', required: true, description: 'Sources sought notice title', placeholder: 'Notice title' },
      { name: 'noticeId', type: 'text', required: true, description: 'Notice ID number', placeholder: 'Notice ID' },
      { name: 'companyName', type: 'text', required: true, description: 'Your company name', placeholder: 'Company name' },
      { name: 'businessSize', type: 'text', required: true, description: 'Business size designation', placeholder: 'Small business' },
      { name: 'serviceType', type: 'text', required: true, description: 'Type of services', placeholder: 'Service type' },
      { name: 'authorName', type: 'text', required: true, description: 'Author name', placeholder: 'Your name' },
      { name: 'authorTitle', type: 'text', required: true, description: 'Author title', placeholder: 'Your title' },
    ]
  }

  private getSourcesSoughtSections(): TemplateSection[] {
    return [
      {
        id: 'companyInfo',
        name: 'companyInformation',
        order: 1,
        required: true,
        repeatable: false,
        content: `COMPANY INFORMATION:
- Company Name: {{companyName}}
- Address: {{companyAddress}}
- SAM UEI: {{ueiNumber}}
- CAGE Code: {{cageCode}}
- Business Certifications: {{certifications}}`,
        variables: ['companyName', 'companyAddress', 'ueiNumber', 'cageCode', 'certifications'],
        conditions: [],
      },
      {
        id: 'experience',
        name: 'relevantExperience',
        order: 2,
        required: true,
        repeatable: true,
        content: `RELEVANT EXPERIENCE:
{{#each pastPerformance}}
Project: {{title}}
Customer: {{customer}}
Contract Value: {{value}}
Period: {{period}}
Description: {{description}}
{{/each}}`,
        variables: ['pastPerformance'],
        conditions: [],
      },
    ]
  }

  private getSourcesSoughtValidation(): ValidationRule[] {
    return [
      { type: 'required', value: true, message: 'All required fields must be completed', severity: 'error' },
      { type: 'minLength', value: 10, message: 'Company name must be at least 10 characters', severity: 'warning' },
    ]
  }

  // Similar generators for other templates...
  private getCapabilityStatementTemplate(): string { return 'Capability Statement Template Content...' }
  private getCapabilityStatementVariables(): TemplateVariable[] { return [] }
  private getCapabilityStatementSections(): TemplateSection[] { return [] }
  private getCapabilityStatementValidation(): ValidationRule[] { return [] }

  private getTechnicalProposalTemplate(): string { return 'Technical Proposal Template Content...' }
  private getTechnicalProposalVariables(): TemplateVariable[] { return [] }
  private getTechnicalProposalSections(): TemplateSection[] { return [] }
  private getTechnicalProposalValidation(): ValidationRule[] { return [] }

  private getTemplateMetadata(name: string, category: TemplateCategory): TemplateMetadata {
    return {
      author: 'GovBiz.ai',
      lastModifiedBy: 'system',
      version: '1.0.0',
      changelog: 'Initial version',
      usage: {
        timesUsed: 0,
        successRate: 1.0,
        userRatings: [],
      },
      tags: [category],
      category,
    }
  }
}

export default DocumentTemplates