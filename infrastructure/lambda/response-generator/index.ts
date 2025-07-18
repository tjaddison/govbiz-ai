import { SQSEvent, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const eventBridgeClient = new EventBridgeClient({});
const bedrockClient = new BedrockRuntimeClient({});

// Environment variables
const {
  USER_TABLE,
  OPPORTUNITY_TABLE,
  DOCUMENT_BUCKET,
  EVENT_BUS,
} = process.env;

// Types
interface ResponseGenerationRequest {
  userId: string;
  opportunityId: string;
  templateId?: string;
  customInstructions?: string;
  includeAttachments?: boolean;
}

interface UserProfile {
  userId: string;
  companyName: string;
  companyDescription: string;
  naicsCodes: string[];
  certifications: string[];
  pastProjects: {
    title: string;
    description: string;
    customer: string;
    value: string;
    duration: string;
    relevantExperience: string[];
  }[];
  capabilities: string[];
  differentiators: string[];
  contactInfo: {
    name: string;
    title: string;
    email: string;
    phone: string;
    address: string;
  };
}

interface SourcesSoughtOpportunity {
  opportunityId: string;
  title: string;
  description: string;
  agency: string;
  office: string;
  naicsCode: string;
  requirements: string[];
  pointOfContact: {
    name: string;
    email: string;
    phone?: string;
  };
  responseDeadline: string;
  attachments?: {
    name: string;
    url: string;
  }[];
  keywords: string[];
}

interface GeneratedResponse {
  responseId: string;
  userId: string;
  opportunityId: string;
  content: {
    coverLetter: string;
    companyProfile: string;
    pastPerformance: string;
    capabilities: string;
    differentiators: string;
    contactInformation: string;
  };
  metadata: {
    generatedAt: string;
    templateUsed?: string;
    wordCount: number;
    confidenceScore: number;
    keywordMatches: string[];
  };
  status: 'draft' | 'review' | 'approved' | 'submitted';
}

// AI Prompt Templates
const RESPONSE_GENERATION_PROMPT = `
You are an expert in government contracting and Sources Sought responses. Generate a professional, compelling response to a Sources Sought notice.

OPPORTUNITY DETAILS:
Title: {opportunityTitle}
Agency: {agency}
Office: {office}
Description: {description}
Requirements: {requirements}
NAICS Code: {naicsCode}
Keywords: {keywords}

COMPANY PROFILE:
Company: {companyName}
Description: {companyDescription}
Certifications: {certifications}
Capabilities: {capabilities}
Differentiators: {differentiators}

PAST PROJECTS:
{pastProjects}

CONTACT INFORMATION:
{contactInfo}

Generate a professional Sources Sought response with the following sections:

1. COVER LETTER (2-3 paragraphs)
- Express interest and understanding of the requirement
- Highlight key qualifications and relevant experience
- Mention specific certifications if applicable

2. COMPANY PROFILE (1-2 paragraphs)
- Brief overview of company and core competencies
- Relevant certifications and capabilities
- Unique value proposition

3. PAST PERFORMANCE (3-5 examples)
- Select most relevant projects from past performance
- Include customer, contract value, duration, and outcomes
- Emphasize results and relevance to current opportunity

4. CAPABILITIES AND APPROACH (2-3 paragraphs)
- Demonstrate understanding of requirements
- Outline proposed approach or methodology
- Highlight technical capabilities and resources

5. DIFFERENTIATORS (1-2 paragraphs)
- What sets this company apart from competitors
- Unique qualifications or experience
- Value-added services or innovations

6. CONTACT INFORMATION
- Primary point of contact details
- Company information and certifications

IMPORTANT GUIDELINES:
- Keep response to 2-4 pages maximum
- Use professional, confident tone
- Include specific examples and quantifiable results
- Match language and keywords from the opportunity
- Avoid generic or boilerplate language
- Focus on how the company can solve the government's specific needs
- Include all required certifications and business size information

Format the response professionally with clear headings and proper business letter structure.
`;

// Utility functions
const generateResponseContent = async (
  opportunity: SourcesSoughtOpportunity,
  userProfile: UserProfile,
  customInstructions?: string
): Promise<string> => {
  try {
    // Prepare prompt with actual data
    const prompt = RESPONSE_GENERATION_PROMPT
      .replace('{opportunityTitle}', opportunity.title)
      .replace('{agency}', opportunity.agency)
      .replace('{office}', opportunity.office)
      .replace('{description}', opportunity.description)
      .replace('{requirements}', opportunity.requirements.join(', '))
      .replace('{naicsCode}', opportunity.naicsCode)
      .replace('{keywords}', opportunity.keywords.join(', '))
      .replace('{companyName}', userProfile.companyName)
      .replace('{companyDescription}', userProfile.companyDescription)
      .replace('{certifications}', userProfile.certifications.join(', '))
      .replace('{capabilities}', userProfile.capabilities.join(', '))
      .replace('{differentiators}', userProfile.differentiators.join(', '))
      .replace('{pastProjects}', formatPastProjects(userProfile.pastProjects))
      .replace('{contactInfo}', formatContactInfo(userProfile.contactInfo));

    // Add custom instructions if provided
    const finalPrompt = customInstructions 
      ? `${prompt}\n\nADDITIONAL INSTRUCTIONS:\n${customInstructions}`
      : prompt;

    // Call Bedrock (Claude) for response generation
    const response = await bedrockClient.send(new InvokeModelCommand({
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: finalPrompt
          }
        ]
      })
    }));

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.content[0].text;
  } catch (error) {
    console.error('Error generating response content:', error);
    throw error;
  }
};

const formatPastProjects = (projects: UserProfile['pastProjects']): string => {
  return projects.map(project => `
Title: ${project.title}
Customer: ${project.customer}
Value: ${project.value}
Duration: ${project.duration}
Description: ${project.description}
Relevant Experience: ${project.relevantExperience.join(', ')}
`).join('\n');
};

const formatContactInfo = (contact: UserProfile['contactInfo']): string => {
  return `
Name: ${contact.name}
Title: ${contact.title}
Email: ${contact.email}
Phone: ${contact.phone}
Address: ${contact.address}
`;
};

const calculateConfidenceScore = (
  opportunity: SourcesSoughtOpportunity,
  userProfile: UserProfile,
  generatedContent: string
): number => {
  let score = 0;

  // NAICS code match
  if (userProfile.naicsCodes.includes(opportunity.naicsCode)) {
    score += 30;
  }

  // Keyword matches in generated content
  const contentLower = generatedContent.toLowerCase();
  const keywordMatches = opportunity.keywords.filter(keyword => 
    contentLower.includes(keyword.toLowerCase())
  );
  score += keywordMatches.length * 5;

  // Past performance relevance
  const relevantProjects = userProfile.pastProjects.filter(project =>
    project.relevantExperience.some(exp => 
      opportunity.keywords.some(keyword => 
        exp.toLowerCase().includes(keyword.toLowerCase())
      )
    )
  );
  score += relevantProjects.length * 10;

  // Content length (adequate but not too verbose)
  const wordCount = generatedContent.split(/\s+/).length;
  if (wordCount >= 800 && wordCount <= 2000) {
    score += 20;
  }

  // Certifications match
  const certificationMatches = userProfile.certifications.filter(cert =>
    opportunity.description.toLowerCase().includes(cert.toLowerCase())
  );
  score += certificationMatches.length * 15;

  return Math.min(score, 100);
};

const processResponseGeneration = async (request: ResponseGenerationRequest): Promise<GeneratedResponse> => {
  try {
    // Get user profile
    const userResult = await docClient.send(new GetCommand({
      TableName: USER_TABLE,
      Key: { userId: request.userId },
    }));

    if (!userResult.Item) {
      throw new Error('User profile not found');
    }

    const userProfile = userResult.Item as UserProfile;

    // Get opportunity details
    const opportunityResult = await docClient.send(new GetCommand({
      TableName: OPPORTUNITY_TABLE,
      Key: { opportunityId: request.opportunityId },
    }));

    if (!opportunityResult.Item) {
      throw new Error('Opportunity not found');
    }

    const opportunity = opportunityResult.Item as SourcesSoughtOpportunity;

    // Generate response content
    const generatedContent = await generateResponseContent(
      opportunity,
      userProfile,
      request.customInstructions
    );

    // Parse generated content into sections
    const sections = parseGeneratedContent(generatedContent);

    // Calculate confidence score
    const confidenceScore = calculateConfidenceScore(opportunity, userProfile, generatedContent);

    // Find keyword matches
    const keywordMatches = opportunity.keywords.filter(keyword =>
      generatedContent.toLowerCase().includes(keyword.toLowerCase())
    );

    const response: GeneratedResponse = {
      responseId: `resp-${request.userId}-${request.opportunityId}-${Date.now()}`,
      userId: request.userId,
      opportunityId: request.opportunityId,
      content: sections,
      metadata: {
        generatedAt: new Date().toISOString(),
        templateUsed: request.templateId,
        wordCount: generatedContent.split(/\s+/).length,
        confidenceScore,
        keywordMatches,
      },
      status: 'draft',
    };

    // Store response in DynamoDB
    await docClient.send(new PutCommand({
      TableName: `${USER_TABLE}-responses`,
      Item: response,
    }));

    // Store full content in S3
    await s3Client.send(new PutObjectCommand({
      Bucket: DOCUMENT_BUCKET,
      Key: `responses/${response.responseId}/content.txt`,
      Body: generatedContent,
      ContentType: 'text/plain',
    }));

    // Store formatted content in S3
    const formattedContent = formatResponseForDownload(response);
    await s3Client.send(new PutObjectCommand({
      Bucket: DOCUMENT_BUCKET,
      Key: `responses/${response.responseId}/formatted.docx`,
      Body: formattedContent,
      ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }));

    // Publish event
    await eventBridgeClient.send(new PutEventsCommand({
      Entries: [{
        Source: 'govbiz.responses',
        DetailType: 'Response Generated',
        Detail: JSON.stringify({
          responseId: response.responseId,
          userId: request.userId,
          opportunityId: request.opportunityId,
          confidenceScore,
          wordCount: response.metadata.wordCount,
          generatedAt: response.metadata.generatedAt,
        }),
        EventBusName: EVENT_BUS,
      }],
    }));

    return response;
  } catch (error) {
    console.error('Error processing response generation:', error);
    throw error;
  }
};

const parseGeneratedContent = (content: string): GeneratedResponse['content'] => {
  // Simple parsing - in production, use more sophisticated parsing
  const sections = {
    coverLetter: '',
    companyProfile: '',
    pastPerformance: '',
    capabilities: '',
    differentiators: '',
    contactInformation: '',
  };

  // Split content by sections and extract
  const lines = content.split('\n');
  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.toLowerCase().includes('cover letter')) {
      currentSection = 'coverLetter';
      currentContent = [];
    } else if (trimmedLine.toLowerCase().includes('company profile')) {
      if (currentSection) sections[currentSection as keyof typeof sections] = currentContent.join('\n');
      currentSection = 'companyProfile';
      currentContent = [];
    } else if (trimmedLine.toLowerCase().includes('past performance')) {
      if (currentSection) sections[currentSection as keyof typeof sections] = currentContent.join('\n');
      currentSection = 'pastPerformance';
      currentContent = [];
    } else if (trimmedLine.toLowerCase().includes('capabilities')) {
      if (currentSection) sections[currentSection as keyof typeof sections] = currentContent.join('\n');
      currentSection = 'capabilities';
      currentContent = [];
    } else if (trimmedLine.toLowerCase().includes('differentiators')) {
      if (currentSection) sections[currentSection as keyof typeof sections] = currentContent.join('\n');
      currentSection = 'differentiators';
      currentContent = [];
    } else if (trimmedLine.toLowerCase().includes('contact information')) {
      if (currentSection) sections[currentSection as keyof typeof sections] = currentContent.join('\n');
      currentSection = 'contactInformation';
      currentContent = [];
    } else if (currentSection && trimmedLine) {
      currentContent.push(line);
    }
  }

  // Add the last section
  if (currentSection) {
    sections[currentSection as keyof typeof sections] = currentContent.join('\n');
  }

  return sections;
};

const formatResponseForDownload = (response: GeneratedResponse): Buffer => {
  // In production, use a proper document generation library like docx
  const content = `
${response.content.coverLetter}

${response.content.companyProfile}

${response.content.pastPerformance}

${response.content.capabilities}

${response.content.differentiators}

${response.content.contactInformation}
`;

  return Buffer.from(content, 'utf-8');
};

// Main handler
export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.body);
      
      if (messageBody.type === 'generate_response') {
        const request = messageBody.data as ResponseGenerationRequest;
        const response = await processResponseGeneration(request);
        console.log(`Generated response ${response.responseId} for user ${request.userId}`);
      }
    } catch (error) {
      console.error('Error processing record:', error);
      throw error;
    }
  }
};