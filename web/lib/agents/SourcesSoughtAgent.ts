import { z } from 'zod';
import { SpecialistAgent } from './BaseAgent';
import { AgentMessage, AgentCapability } from './AgentOrchestrator';

// Schemas for Sources Sought operations
const OpportunitySearchSchema = z.object({
  keywords: z.array(z.string()).optional(),
  naicsCodes: z.array(z.string()).optional(),
  agencies: z.array(z.string()).optional(),
  setAsides: z.array(z.string()).optional(),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
  limit: z.number().min(1).max(100).default(20),
});

const OpportunityAnalysisSchema = z.object({
  opportunityId: z.string(),
  userProfile: z.object({
    naicsCodes: z.array(z.string()),
    capabilities: z.array(z.string()),
    pastProjects: z.array(z.any()),
    certifications: z.array(z.string()),
  }),
});

const ResponseGenerationSchema = z.object({
  opportunityId: z.string(),
  userProfile: z.object({
    companyName: z.string(),
    companyDescription: z.string(),
    naicsCodes: z.array(z.string()),
    capabilities: z.array(z.string()),
    pastProjects: z.array(z.any()),
    certifications: z.array(z.string()),
    contactInfo: z.any(),
  }),
  customInstructions: z.string().optional(),
  template: z.string().optional(),
});

export class SourcesSoughtAgent extends SpecialistAgent {
  private samGovApiKey: string;
  private apiBaseUrl: string = 'https://api.sam.gov/prod/opportunities/v2/search';

  constructor() {
    const capabilities: AgentCapability[] = [
      {
        name: 'search_opportunities',
        description: 'Search for Sources Sought opportunities on SAM.gov',
        inputs: ['keywords', 'naicsCodes', 'agencies', 'dateRange'],
        outputs: ['opportunities', 'totalCount'],
        cost: 0.1,
        estimatedDuration: 5000,
      },
      {
        name: 'analyze_opportunity',
        description: 'Analyze an opportunity for user fit and match score',
        inputs: ['opportunityId', 'userProfile'],
        outputs: ['matchScore', 'analysis', 'recommendations'],
        cost: 0.2,
        estimatedDuration: 3000,
      },
      {
        name: 'generate_response',
        description: 'Generate a Sources Sought response using AI',
        inputs: ['opportunityId', 'userProfile', 'customInstructions'],
        outputs: ['responseDocument', 'metadata'],
        cost: 1.0,
        estimatedDuration: 15000,
      },
      {
        name: 'monitor_deadlines',
        description: 'Monitor upcoming response deadlines',
        inputs: ['userId'],
        outputs: ['upcomingDeadlines', 'alerts'],
        cost: 0.05,
        estimatedDuration: 2000,
      },
      {
        name: 'extract_contacts',
        description: 'Extract government contacts from opportunities',
        inputs: ['opportunityId'],
        outputs: ['contacts', 'contactInfo'],
        cost: 0.1,
        estimatedDuration: 1000,
      },
    ];

    super(
      'Sources Sought Specialist',
      'Specialized agent for discovering, analyzing, and responding to Sources Sought opportunities',
      capabilities,
      '2.0.0'
    );

    this.samGovApiKey = process.env.SAM_GOV_API_KEY || '';
  }

  protected async onInitialize(): Promise<void> {
    if (!this.samGovApiKey) {
      throw new Error('SAM.gov API key is required for Sources Sought Agent');
    }
    
    // Test API connectivity
    await this.testSamGovConnection();
    this.logActivity('Sources Sought Agent initialized with SAM.gov connectivity');
  }

  protected async onShutdown(): Promise<void> {
    this.logActivity('Sources Sought Agent shutting down');
  }

  protected async onProcessMessage(message: AgentMessage): Promise<AgentMessage | null> {
    const { capability, input } = message.payload;

    try {
      switch (capability) {
        case 'search_opportunities':
          return await this.handleSearchOpportunities(message, input);
        
        case 'analyze_opportunity':
          return await this.handleAnalyzeOpportunity(message, input);
        
        case 'generate_response':
          return await this.handleGenerateResponse(message, input);
        
        case 'monitor_deadlines':
          return await this.handleMonitorDeadlines(message, input);
        
        case 'extract_contacts':
          return await this.handleExtractContacts(message, input);
        
        default:
          return this.createErrorResponse(message, `Unknown capability: ${capability}`);
      }
    } catch (error) {
      return this.createErrorResponse(message, error instanceof Error ? error.message : String(error));
    }
  }

  private async handleSearchOpportunities(message: AgentMessage, input: any): Promise<AgentMessage> {
    const searchParams = this.validatePayload(input, OpportunitySearchSchema) as any;
    
    this.logActivity('Searching opportunities', searchParams);
    
    try {
      const opportunities = await this.searchSamGovOpportunities(searchParams);
      
      return this.createResponse(message, {
        opportunities: opportunities.results,
        totalCount: opportunities.totalCount,
        searchParams,
        timestamp: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to search opportunities: ${error}`);
    }
  }

  private async handleAnalyzeOpportunity(message: AgentMessage, input: any): Promise<AgentMessage> {
    const analysisParams = this.validatePayload(input, OpportunityAnalysisSchema) as any;
    
    this.logActivity('Analyzing opportunity', { opportunityId: analysisParams.opportunityId });
    
    try {
      // Get opportunity details
      const opportunity = await this.getOpportunityDetails(analysisParams.opportunityId);
      
      // Calculate match score
      const analysis = await this.analyzeOpportunityFit(opportunity, analysisParams.userProfile);
      
      return this.createResponse(message, {
        analysis,
        opportunity,
        timestamp: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to analyze opportunity: ${error}`);
    }
  }

  private async handleGenerateResponse(message: AgentMessage, input: any): Promise<AgentMessage> {
    const responseParams = this.validatePayload(input, ResponseGenerationSchema) as any;
    
    this.logActivity('Generating response', { opportunityId: responseParams.opportunityId });
    
    try {
      // Get opportunity details
      const opportunity = await this.getOpportunityDetails(responseParams.opportunityId);
      
      // Generate response using AI
      const responseDocument = await this.generateAIResponse(opportunity, responseParams);
      
      return this.createResponse(message, {
        responseDocument,
        opportunity,
        metadata: {
          generatedAt: Date.now(),
          wordCount: responseDocument.content.split(/\s+/).length,
          template: responseParams.template,
        },
      });
    } catch (error) {
      throw new Error(`Failed to generate response: ${error}`);
    }
  }

  private async handleMonitorDeadlines(message: AgentMessage, input: any): Promise<AgentMessage> {
    const { userId } = input;
    
    this.logActivity('Monitoring deadlines', { userId });
    
    try {
      const upcomingDeadlines = await this.getUpcomingDeadlines(userId);
      const alerts = this.generateDeadlineAlerts(upcomingDeadlines);
      
      return this.createResponse(message, {
        upcomingDeadlines,
        alerts,
        monitoredAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to monitor deadlines: ${error}`);
    }
  }

  private async handleExtractContacts(message: AgentMessage, input: any): Promise<AgentMessage> {
    const { opportunityId } = input;
    
    this.logActivity('Extracting contacts', { opportunityId });
    
    try {
      const opportunity = await this.getOpportunityDetails(opportunityId);
      const contacts = this.extractGovernmentContacts(opportunity);
      
      return this.createResponse(message, {
        contacts,
        opportunity: {
          id: opportunity.id,
          title: opportunity.title,
          agency: opportunity.agency,
        },
        extractedAt: Date.now(),
      });
    } catch (error) {
      throw new Error(`Failed to extract contacts: ${error}`);
    }
  }

  // Private implementation methods
  private async testSamGovConnection(): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}?api_key=${this.samGovApiKey}&limit=1`, {
        method: 'GET',
        headers: {
          'User-Agent': 'GovBiz.ai Sources Sought Agent',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`SAM.gov API test failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      throw new Error(`Cannot connect to SAM.gov API: ${error}`);
    }
  }

  private async searchSamGovOpportunities(params: z.infer<typeof OpportunitySearchSchema>) {
    const searchParams = new URLSearchParams({
      api_key: this.samGovApiKey,
      limit: params.limit.toString(),
      noticeType: 'presol', // Sources Sought
      active: 'true',
    });

    // Add optional filters
    if (params.keywords?.length) {
      searchParams.append('q', params.keywords.join(' '));
    }

    if (params.naicsCodes?.length) {
      params.naicsCodes.forEach(code => searchParams.append('naics', code));
    }

    if (params.agencies?.length) {
      params.agencies.forEach(agency => searchParams.append('department', agency));
    }

    if (params.dateRange) {
      searchParams.append('postedFrom', params.dateRange.start);
      searchParams.append('postedTo', params.dateRange.end);
    }

    const response = await fetch(`${this.apiBaseUrl}?${searchParams.toString()}`, {
      headers: {
        'User-Agent': 'GovBiz.ai Sources Sought Agent',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`SAM.gov search failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      results: data.opportunitiesData || [],
      totalCount: data.totalRecords || 0,
    };
  }

  private async getOpportunityDetails(opportunityId: string) {
    // In a real implementation, this would fetch from DynamoDB or SAM.gov
    // For now, return mock data structure
    return {
      id: opportunityId,
      title: 'Mock Opportunity Title',
      description: 'Mock opportunity description',
      agency: 'Department of Defense',
      office: 'Office of the Secretary',
      naicsCode: '541511',
      naicsDescription: 'Custom Computer Programming Services',
      postedDate: new Date().toISOString(),
      responseDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      pointOfContact: {
        name: 'John Smith',
        email: 'john.smith@agency.gov',
        phone: '555-123-4567',
      },
      requirements: [
        'Software development experience',
        'Government security clearance',
        'Agile methodology experience',
      ],
      keywords: ['software', 'development', 'programming', 'agile'],
    };
  }

  private async analyzeOpportunityFit(opportunity: any, userProfile: any) {
    let matchScore = 0;
    const analysis = {
      matchScore: 0,
      strengths: [] as string[],
      weaknesses: [] as string[],
      recommendations: [] as string[],
      ruleOfTwoEligible: false,
    };

    // NAICS code match (highest weight)
    if (userProfile.naicsCodes.includes(opportunity.naicsCode)) {
      matchScore += 40;
      analysis.strengths.push('NAICS code match');
    } else {
      analysis.weaknesses.push('NAICS code mismatch');
      analysis.recommendations.push('Consider expanding NAICS code qualifications');
    }

    // Capability matches
    const capabilityMatches = opportunity.keywords.filter((keyword: string) =>
      userProfile.capabilities.some((cap: string) => 
        cap.toLowerCase().includes(keyword.toLowerCase()) ||
        keyword.toLowerCase().includes(cap.toLowerCase())
      )
    );

    matchScore += capabilityMatches.length * 10;
    if (capabilityMatches.length > 0) {
      analysis.strengths.push(`${capabilityMatches.length} capability matches`);
    }

    // Past project relevance
    const relevantProjects = userProfile.pastProjects.filter((project: any) =>
      opportunity.keywords.some((keyword: string) =>
        project.description.toLowerCase().includes(keyword.toLowerCase())
      )
    );

    matchScore += relevantProjects.length * 5;
    if (relevantProjects.length > 0) {
      analysis.strengths.push(`${relevantProjects.length} relevant past projects`);
    }

    // Certification matches
    const hasRelevantCerts = userProfile.certifications.some((cert: string) =>
      opportunity.description.toLowerCase().includes(cert.toLowerCase())
    );

    if (hasRelevantCerts) {
      matchScore += 20;
      analysis.strengths.push('Relevant certifications');
      analysis.ruleOfTwoEligible = true;
    }

    analysis.matchScore = Math.min(matchScore, 100);

    // Generate recommendations
    if (analysis.matchScore < 50) {
      analysis.recommendations.push('Consider partnering with other companies to strengthen bid');
    }

    if (analysis.matchScore > 70) {
      analysis.recommendations.push('High match score - prioritize this opportunity');
    }

    return analysis;
  }

  private async generateAIResponse(opportunity: any, params: any) {
    // In a real implementation, this would call the AI response generator agent
    // For now, return a structured mock response
    return {
      content: `
SOURCES SOUGHT RESPONSE

${params.userProfile.companyName}
${params.userProfile.contactInfo.address}

Date: ${new Date().toLocaleDateString()}

${opportunity.pointOfContact.name}
${opportunity.agency}
${opportunity.office}

RE: Sources Sought Notice - ${opportunity.title}

Dear ${opportunity.pointOfContact.name},

${params.userProfile.companyName} is pleased to submit this response to the above-referenced sources sought notice. We are a ${params.userProfile.certifications.join(', ')} certified small business with extensive experience in ${params.userProfile.capabilities.join(', ')}.

COMPANY PROFILE:
${params.userProfile.companyDescription}

RELEVANT EXPERIENCE:
${params.userProfile.pastProjects.map((project: any, index: number) => `
${index + 1}. ${project.title}
   Customer: ${project.customer}
   Value: ${project.value}
   Description: ${project.description}
`).join('')}

CAPABILITIES:
We possess the following capabilities relevant to this requirement:
${params.userProfile.capabilities.map((cap: string) => `• ${cap}`).join('\n')}

We look forward to the opportunity to support this requirement and are prepared to submit a proposal when the solicitation is released.

Sincerely,

${params.userProfile.contactInfo.name}
${params.userProfile.contactInfo.title}
${params.userProfile.contactInfo.email}
${params.userProfile.contactInfo.phone}
      `,
      format: 'text',
      sections: {
        header: 'Company letterhead and contact information',
        body: 'Main response content with experience and capabilities',
        footer: 'Contact information and next steps',
      },
    };
  }

  private async getUpcomingDeadlines(userId: string) {
    // In a real implementation, this would query the database for user's tracked opportunities
    return [
      {
        opportunityId: 'opp1',
        title: 'Software Development Services',
        responseDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        daysRemaining: 7,
        agency: 'Department of Defense',
      },
      {
        opportunityId: 'opp2',
        title: 'IT Support Services',
        responseDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        daysRemaining: 14,
        agency: 'Department of Veterans Affairs',
      },
    ];
  }

  private generateDeadlineAlerts(deadlines: any[]) {
    const alerts = [];
    
    for (const deadline of deadlines) {
      if (deadline.daysRemaining <= 3) {
        alerts.push({
          type: 'urgent',
          message: `Response due in ${deadline.daysRemaining} days for ${deadline.title}`,
          opportunityId: deadline.opportunityId,
        });
      } else if (deadline.daysRemaining <= 7) {
        alerts.push({
          type: 'warning',
          message: `Response due in ${deadline.daysRemaining} days for ${deadline.title}`,
          opportunityId: deadline.opportunityId,
        });
      }
    }
    
    return alerts;
  }

  private extractGovernmentContacts(opportunity: any) {
    return [
      {
        name: opportunity.pointOfContact.name,
        email: opportunity.pointOfContact.email,
        phone: opportunity.pointOfContact.phone,
        role: 'Primary Point of Contact',
        agency: opportunity.agency,
        office: opportunity.office,
      },
    ];
  }
}