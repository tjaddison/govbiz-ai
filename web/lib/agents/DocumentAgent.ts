import { z } from 'zod';
import { SpecialistAgent } from './BaseAgent';
import { AgentMessage, AgentCapability } from './AgentOrchestrator';

// Schemas for document operations
const DocumentClassificationSchema = z.object({
  content: z.string(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
});

const DocumentProcessingSchema = z.object({
  documentId: z.string(),
  operations: z.array(z.enum(['extract_text', 'classify', 'summarize', 'extract_entities'])),
});

const DocumentSearchSchema = z.object({
  query: z.string(),
  filters: z.object({
    type: z.string().optional(),
    classification: z.string().optional(),
    dateRange: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
  }).optional(),
  limit: z.number().min(1).max(100).default(20),
});

const DocumentGenerationSchema = z.object({
  template: z.string(),
  data: z.record(z.any()),
  format: z.enum(['pdf', 'docx', 'html', 'txt']).default('pdf'),
});

export class DocumentAgent extends SpecialistAgent {
  private classificationModel: any;
  private entityExtractor: any;
  private supportedFormats: Set<string>;

  constructor() {
    const capabilities: AgentCapability[] = [
      {
        name: 'classify_document',
        description: 'Classify documents by type and sensitivity level',
        inputs: ['content', 'filename', 'mimeType'],
        outputs: ['classification', 'confidence', 'metadata'],
        cost: 0.1,
        estimatedDuration: 2000,
      },
      {
        name: 'extract_text',
        description: 'Extract text content from various document formats',
        inputs: ['documentId', 'format'],
        outputs: ['text', 'metadata'],
        cost: 0.05,
        estimatedDuration: 3000,
      },
      {
        name: 'summarize_document',
        description: 'Generate intelligent document summaries',
        inputs: ['content', 'maxLength'],
        outputs: ['summary', 'keyPoints', 'confidence'],
        cost: 0.3,
        estimatedDuration: 5000,
      },
      {
        name: 'extract_entities',
        description: 'Extract named entities and key information',
        inputs: ['content', 'entityTypes'],
        outputs: ['entities', 'relationships', 'metadata'],
        cost: 0.2,
        estimatedDuration: 3000,
      },
      {
        name: 'search_documents',
        description: 'Search documents using semantic and keyword search',
        inputs: ['query', 'filters'],
        outputs: ['results', 'totalCount', 'facets'],
        cost: 0.1,
        estimatedDuration: 2000,
      },
      {
        name: 'generate_document',
        description: 'Generate documents from templates and data',
        inputs: ['template', 'data', 'format'],
        outputs: ['document', 'metadata'],
        cost: 0.4,
        estimatedDuration: 8000,
      },
      {
        name: 'validate_compliance',
        description: 'Validate document compliance with government standards',
        inputs: ['content', 'standard'],
        outputs: ['isCompliant', 'violations', 'recommendations'],
        cost: 0.2,
        estimatedDuration: 4000,
      },
    ];

    super(
      'Document Specialist',
      'Specialized agent for document processing, classification, and management',
      capabilities,
      '2.1.0'
    );

    this.supportedFormats = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/html',
      'application/json',
    ]);
  }

  protected async onInitialize(): Promise<void> {
    // Initialize document processing models and services
    await this.initializeClassificationModel();
    await this.initializeEntityExtractor();
    this.logActivity('Document Agent initialized with ML models');
  }

  protected async onShutdown(): Promise<void> {
    this.logActivity('Document Agent shutting down');
  }

  protected async onProcessMessage(message: AgentMessage): Promise<AgentMessage | null> {
    const { capability, input } = message.payload;

    try {
      switch (capability) {
        case 'classify_document':
          return await this.handleClassifyDocument(message, input);
        
        case 'extract_text':
          return await this.handleExtractText(message, input);
        
        case 'summarize_document':
          return await this.handleSummarizeDocument(message, input);
        
        case 'extract_entities':
          return await this.handleExtractEntities(message, input);
        
        case 'search_documents':
          return await this.handleSearchDocuments(message, input);
        
        case 'generate_document':
          return await this.handleGenerateDocument(message, input);
        
        case 'validate_compliance':
          return await this.handleValidateCompliance(message, input);
        
        default:
          return this.createErrorResponse(message, `Unknown capability: ${capability}`);
      }
    } catch (error) {
      return this.createErrorResponse(message, error instanceof Error ? error.message : String(error));
    }
  }

  private async handleClassifyDocument(message: AgentMessage, input: any): Promise<AgentMessage> {
    const params = this.validatePayload(input, DocumentClassificationSchema) as any;
    
    this.logActivity('Classifying document', { filename: params.filename });
    
    try {
      const classification = await this.classifyDocument(params);
      
      return this.createResponse(message, {
        classification,
        processedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to classify document: ${error}`);
    }
  }

  private async handleExtractText(message: AgentMessage, input: any): Promise<AgentMessage> {
    const { documentId, format } = input;
    
    this.logActivity('Extracting text', { documentId, format });
    
    try {
      const result = await this.extractTextFromDocument(documentId, format);
      
      return this.createResponse(message, {
        text: result.text,
        metadata: result.metadata,
        extractedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to extract text: ${error}`);
    }
  }

  private async handleSummarizeDocument(message: AgentMessage, input: any): Promise<AgentMessage> {
    const { content, maxLength = 500 } = input;
    
    this.logActivity('Summarizing document', { contentLength: content.length, maxLength });
    
    try {
      const summary = await this.summarizeContent(content, maxLength);
      
      return this.createResponse(message, {
        summary,
        summarizedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to summarize document: ${error}`);
    }
  }

  private async handleExtractEntities(message: AgentMessage, input: any): Promise<AgentMessage> {
    const { content, entityTypes = ['PERSON', 'ORG', 'DATE', 'MONEY', 'LOCATION'] } = input;
    
    this.logActivity('Extracting entities', { entityTypes });
    
    try {
      const entities = await this.extractNamedEntities(content, entityTypes);
      
      return this.createResponse(message, {
        entities,
        extractedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to extract entities: ${error}`);
    }
  }

  private async handleSearchDocuments(message: AgentMessage, input: any): Promise<AgentMessage> {
    const searchParams = this.validatePayload(input, DocumentSearchSchema) as any;
    
    this.logActivity('Searching documents', { query: searchParams.query });
    
    try {
      const results = await this.searchDocuments(searchParams);
      
      return this.createResponse(message, {
        results,
        searchedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to search documents: ${error}`);
    }
  }

  private async handleGenerateDocument(message: AgentMessage, input: any): Promise<AgentMessage> {
    const params = this.validatePayload(input, DocumentGenerationSchema) as any;
    
    this.logActivity('Generating document', { template: params.template, format: params.format });
    
    try {
      const document = await this.generateDocument(params);
      
      return this.createResponse(message, {
        document,
        generatedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to generate document: ${error}`);
    }
  }

  private async handleValidateCompliance(message: AgentMessage, input: any): Promise<AgentMessage> {
    const { content, standard = 'government' } = input;
    
    this.logActivity('Validating compliance', { standard });
    
    try {
      const validation = await this.validateDocumentCompliance(content, standard);
      
      return this.createResponse(message, {
        validation,
        validatedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to validate compliance: ${error}`);
    }
  }

  // Private implementation methods
  private async initializeClassificationModel(): Promise<void> {
    // Initialize ML model for document classification
    this.classificationModel = {
      classify: async (content: string) => {
        // Mock implementation - in production, use actual ML model
        const types = ['contract', 'proposal', 'report', 'correspondence', 'technical_document'];
        const confidences = [0.85, 0.92, 0.78, 0.65, 0.88];
        
        // Simple keyword-based classification for demo
        const lowerContent = content.toLowerCase();
        
        if (lowerContent.includes('contract') || lowerContent.includes('agreement')) {
          return { type: 'contract', confidence: 0.92 };
        } else if (lowerContent.includes('proposal') || lowerContent.includes('rfp')) {
          return { type: 'proposal', confidence: 0.88 };
        } else if (lowerContent.includes('report') || lowerContent.includes('analysis')) {
          return { type: 'report', confidence: 0.85 };
        } else {
          return { type: 'correspondence', confidence: 0.70 };
        }
      }
    };
  }

  private async initializeEntityExtractor(): Promise<void> {
    // Initialize named entity recognition model
    this.entityExtractor = {
      extract: async (content: string, entityTypes: string[]) => {
        // Mock implementation - in production, use actual NER model
        const entities = [];
        
        // Simple regex-based extraction for demo
        if (entityTypes.includes('EMAIL')) {
          const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
          const emails = content.match(emailRegex) || [];
          entities.push(...emails.map(email => ({ type: 'EMAIL', value: email, confidence: 0.95 })));
        }
        
        if (entityTypes.includes('PHONE')) {
          const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
          const phones = content.match(phoneRegex) || [];
          entities.push(...phones.map(phone => ({ type: 'PHONE', value: phone, confidence: 0.90 })));
        }
        
        if (entityTypes.includes('MONEY')) {
          const moneyRegex = /\$[\d,]+(?:\.\d{2})?/g;
          const amounts = content.match(moneyRegex) || [];
          entities.push(...amounts.map(amount => ({ type: 'MONEY', value: amount, confidence: 0.88 })));
        }
        
        return entities;
      }
    };
  }

  private async classifyDocument(params: z.infer<typeof DocumentClassificationSchema>) {
    const classification = await this.classificationModel.classify(params.content);
    
    // Determine security classification
    const securityLevel = this.determineSecurityLevel(params.content);
    
    // Extract metadata
    const metadata = {
      wordCount: params.content.split(/\s+/).length,
      characterCount: params.content.length,
      hasImages: false, // Would be determined by actual document analysis
      hasLinks: /https?:\/\/[^\s]+/i.test(params.content),
      language: 'en', // Would use language detection
      estimatedReadingTime: Math.ceil(params.content.split(/\s+/).length / 200), // 200 WPM average
    };

    return {
      type: classification.type,
      confidence: classification.confidence,
      securityLevel,
      metadata,
      tags: this.generateDocumentTags(params.content),
    };
  }

  private determineSecurityLevel(content: string): string {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('classified') || lowerContent.includes('secret')) {
      return 'classified';
    } else if (lowerContent.includes('confidential') || lowerContent.includes('proprietary')) {
      return 'confidential';
    } else if (lowerContent.includes('internal') || lowerContent.includes('restricted')) {
      return 'internal';
    } else {
      return 'public';
    }
  }

  private generateDocumentTags(content: string): string[] {
    const tags = [];
    const lowerContent = content.toLowerCase();
    
    // Domain-specific tags
    if (lowerContent.includes('government') || lowerContent.includes('federal')) {
      tags.push('government');
    }
    if (lowerContent.includes('contract') || lowerContent.includes('procurement')) {
      tags.push('contract');
    }
    if (lowerContent.includes('technical') || lowerContent.includes('specification')) {
      tags.push('technical');
    }
    if (lowerContent.includes('proposal') || lowerContent.includes('response')) {
      tags.push('proposal');
    }
    
    return tags;
  }

  private async extractTextFromDocument(documentId: string, format: string) {
    // In a real implementation, this would fetch the document and extract text
    // using appropriate libraries (pdf-parse, mammoth, etc.)
    
    return {
      text: `Extracted text content from document ${documentId}`,
      metadata: {
        documentId,
        format,
        pages: 1,
        extractedAt: new Date().toISOString(),
        extractionMethod: 'text_extraction_api',
      },
    };
  }

  private async summarizeContent(content: string, maxLength: number) {
    // In a real implementation, this would use an AI summarization model
    
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const wordCount = content.split(/\s+/).length;
    
    // Simple extractive summarization for demo
    const keyPoints: string[] = [];
    const summary = sentences.slice(0, Math.min(3, sentences.length)).join('. ') + '.';
    
    // Extract key points
    sentences.forEach(sentence => {
      if (sentence.toLowerCase().includes('important') || 
          sentence.toLowerCase().includes('key') ||
          sentence.toLowerCase().includes('significant')) {
        keyPoints.push(sentence.trim());
      }
    });

    return {
      summary: summary.length > maxLength ? summary.substring(0, maxLength) + '...' : summary,
      keyPoints: keyPoints.slice(0, 5),
      confidence: 0.85,
      originalLength: wordCount,
      summaryLength: summary.split(/\s+/).length,
      compressionRatio: summary.split(/\s+/).length / wordCount,
    };
  }

  private async extractNamedEntities(content: string, entityTypes: string[]) {
    const entities = await this.entityExtractor.extract(content, entityTypes);
    
    // Group entities by type
    const groupedEntities = entities.reduce((groups: any, entity: any) => {
      if (!groups[entity.type]) {
        groups[entity.type] = [];
      }
      groups[entity.type].push(entity);
      return groups;
    }, {});
    
    // Extract relationships (mock implementation)
    const relationships = [
      {
        type: 'CONTACT_INFO',
        entities: entities.filter((e: any) => ['EMAIL', 'PHONE'].includes(e.type)),
        confidence: 0.90,
      },
    ];

    return {
      entities: groupedEntities,
      relationships,
      metadata: {
        totalEntities: entities.length,
        entityTypes: Object.keys(groupedEntities),
        extractionMethod: 'named_entity_recognition',
      },
    };
  }

  private async searchDocuments(params: z.infer<typeof DocumentSearchSchema>) {
    // In a real implementation, this would use Elasticsearch or similar
    
    const mockResults = [
      {
        id: 'doc1',
        title: 'Software Development Contract',
        content: 'Contract for software development services...',
        type: 'contract',
        score: 0.95,
        highlights: ['software development', 'contract'],
        metadata: {
          createdAt: '2024-01-15T10:00:00Z',
          classification: 'confidential',
        },
      },
      {
        id: 'doc2',
        title: 'Technical Proposal Response',
        content: 'Response to RFP for technical services...',
        type: 'proposal',
        score: 0.87,
        highlights: ['technical services', 'proposal'],
        metadata: {
          createdAt: '2024-01-10T14:30:00Z',
          classification: 'internal',
        },
      },
    ];

    return {
      results: mockResults.slice(0, params.limit),
      totalCount: mockResults.length,
      facets: {
        type: { contract: 1, proposal: 1 },
        classification: { confidential: 1, internal: 1 },
      },
      query: params.query,
    };
  }

  private async generateDocument(params: z.infer<typeof DocumentGenerationSchema>) {
    // In a real implementation, this would use template engines and document generators
    
    const templates = {
      'sources_sought_response': this.generateSourcesSoughtTemplate(params.data),
      'contract_summary': this.generateContractSummaryTemplate(params.data),
      'proposal_outline': this.generateProposalOutlineTemplate(params.data),
    };

    const content = templates[params.template as keyof typeof templates] || 
                   `Generated document using template: ${params.template}`;

    return {
      content,
      format: params.format,
      metadata: {
        template: params.template,
        generatedAt: new Date().toISOString(),
        wordCount: content.split(/\s+/).length,
        pageCount: Math.ceil(content.length / 3000), // Estimate pages
      },
    };
  }

  private generateSourcesSoughtTemplate(data: any): string {
    return `
SOURCES SOUGHT RESPONSE

${data.companyName || 'Company Name'}
${data.address || 'Company Address'}

Date: ${new Date().toLocaleDateString()}

${data.contactName || 'Contact Name'}
${data.agency || 'Government Agency'}

RE: Sources Sought Notice - ${data.opportunityTitle || 'Opportunity Title'}

Dear ${data.contactName || 'Contact'}:

${data.companyName || 'Our company'} is pleased to submit this response to the above-referenced sources sought notice.

COMPANY PROFILE:
${data.companyDescription || 'Company description here.'}

RELEVANT EXPERIENCE:
${(data.pastProjects || []).map((project: any, index: number) => `
${index + 1}. ${project.title || 'Project Title'}
   Customer: ${project.customer || 'Customer Name'}
   Value: ${project.value || 'Project Value'}
   Description: ${project.description || 'Project description'}
`).join('')}

CAPABILITIES:
${(data.capabilities || []).map((cap: string) => `• ${cap}`).join('\n')}

We look forward to the opportunity to support this requirement.

Sincerely,

${data.contactName || 'Contact Name'}
${data.contactTitle || 'Title'}
${data.email || 'email@company.com'}
${data.phone || 'Phone Number'}
    `;
  }

  private generateContractSummaryTemplate(data: any): string {
    return `
CONTRACT SUMMARY

Contract Number: ${data.contractNumber || 'TBD'}
Title: ${data.title || 'Contract Title'}
Agency: ${data.agency || 'Government Agency'}
Period of Performance: ${data.startDate || 'Start Date'} - ${data.endDate || 'End Date'}
Total Value: ${data.value || 'Contract Value'}

SCOPE OF WORK:
${data.scope || 'Scope of work description here.'}

KEY DELIVERABLES:
${(data.deliverables || []).map((deliverable: string, index: number) => `
${index + 1}. ${deliverable}
`).join('')}

PERFORMANCE REQUIREMENTS:
${(data.requirements || []).map((req: string) => `• ${req}`).join('\n')}
    `;
  }

  private generateProposalOutlineTemplate(data: any): string {
    return `
PROPOSAL OUTLINE

${data.title || 'Proposal Title'}

1. EXECUTIVE SUMMARY
   ${data.executiveSummary || 'Executive summary placeholder'}

2. TECHNICAL APPROACH
   ${data.technicalApproach || 'Technical approach placeholder'}

3. MANAGEMENT APPROACH
   ${data.managementApproach || 'Management approach placeholder'}

4. PAST PERFORMANCE
   ${(data.pastProjects || []).map((project: any, index: number) => `
   ${index + 1}. ${project.title || 'Project Title'}
      Customer: ${project.customer || 'Customer'}
      Performance Period: ${project.period || 'Period'}
      Value: ${project.value || 'Value'}
   `).join('')}

5. COST PROPOSAL
   ${data.costStructure || 'Cost proposal placeholder'}
    `;
  }

  private async validateDocumentCompliance(content: string, standard: string) {
    // In a real implementation, this would check against compliance rules
    
    const violations = [];
    const recommendations = [];
    
    // Check for required sections
    if (!content.toLowerCase().includes('company')) {
      violations.push('Missing company information section');
      recommendations.push('Add complete company profile section');
    }
    
    if (!content.toLowerCase().includes('contact')) {
      violations.push('Missing contact information');
      recommendations.push('Include primary point of contact details');
    }
    
    // Check for security markings
    if (standard === 'government' && !content.includes('UNCLASSIFIED')) {
      recommendations.push('Consider adding security classification markings');
    }
    
    // Check formatting
    if (content.length < 500) {
      recommendations.push('Document may be too brief for government submission');
    }

    return {
      isCompliant: violations.length === 0,
      violations,
      recommendations,
      standard,
      checkedAt: new Date().toISOString(),
      complianceScore: Math.max(0, 100 - (violations.length * 20)),
    };
  }
}