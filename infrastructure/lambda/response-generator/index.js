"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_eventbridge_1 = require("@aws-sdk/client-eventbridge");
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
// Initialize AWS clients
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new client_s3_1.S3Client({});
const eventBridgeClient = new client_eventbridge_1.EventBridgeClient({});
const bedrockClient = new client_bedrock_runtime_1.BedrockRuntimeClient({});
// Environment variables
const { USER_TABLE, OPPORTUNITY_TABLE, DOCUMENT_BUCKET, EVENT_BUS, } = process.env;
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
const generateResponseContent = async (opportunity, userProfile, customInstructions) => {
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
        const response = await bedrockClient.send(new client_bedrock_runtime_1.InvokeModelCommand({
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
    }
    catch (error) {
        console.error('Error generating response content:', error);
        throw error;
    }
};
const formatPastProjects = (projects) => {
    return projects.map(project => `
Title: ${project.title}
Customer: ${project.customer}
Value: ${project.value}
Duration: ${project.duration}
Description: ${project.description}
Relevant Experience: ${project.relevantExperience.join(', ')}
`).join('\n');
};
const formatContactInfo = (contact) => {
    return `
Name: ${contact.name}
Title: ${contact.title}
Email: ${contact.email}
Phone: ${contact.phone}
Address: ${contact.address}
`;
};
const calculateConfidenceScore = (opportunity, userProfile, generatedContent) => {
    let score = 0;
    // NAICS code match
    if (userProfile.naicsCodes.includes(opportunity.naicsCode)) {
        score += 30;
    }
    // Keyword matches in generated content
    const contentLower = generatedContent.toLowerCase();
    const keywordMatches = opportunity.keywords.filter(keyword => contentLower.includes(keyword.toLowerCase()));
    score += keywordMatches.length * 5;
    // Past performance relevance
    const relevantProjects = userProfile.pastProjects.filter(project => project.relevantExperience.some(exp => opportunity.keywords.some(keyword => exp.toLowerCase().includes(keyword.toLowerCase()))));
    score += relevantProjects.length * 10;
    // Content length (adequate but not too verbose)
    const wordCount = generatedContent.split(/\s+/).length;
    if (wordCount >= 800 && wordCount <= 2000) {
        score += 20;
    }
    // Certifications match
    const certificationMatches = userProfile.certifications.filter(cert => opportunity.description.toLowerCase().includes(cert.toLowerCase()));
    score += certificationMatches.length * 15;
    return Math.min(score, 100);
};
const processResponseGeneration = async (request) => {
    try {
        // Get user profile
        const userResult = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: USER_TABLE,
            Key: { userId: request.userId },
        }));
        if (!userResult.Item) {
            throw new Error('User profile not found');
        }
        const userProfile = userResult.Item;
        // Get opportunity details
        const opportunityResult = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: OPPORTUNITY_TABLE,
            Key: { opportunityId: request.opportunityId },
        }));
        if (!opportunityResult.Item) {
            throw new Error('Opportunity not found');
        }
        const opportunity = opportunityResult.Item;
        // Generate response content
        const generatedContent = await generateResponseContent(opportunity, userProfile, request.customInstructions);
        // Parse generated content into sections
        const sections = parseGeneratedContent(generatedContent);
        // Calculate confidence score
        const confidenceScore = calculateConfidenceScore(opportunity, userProfile, generatedContent);
        // Find keyword matches
        const keywordMatches = opportunity.keywords.filter(keyword => generatedContent.toLowerCase().includes(keyword.toLowerCase()));
        const response = {
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
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: `${USER_TABLE}-responses`,
            Item: response,
        }));
        // Store full content in S3
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: DOCUMENT_BUCKET,
            Key: `responses/${response.responseId}/content.txt`,
            Body: generatedContent,
            ContentType: 'text/plain',
        }));
        // Store formatted content in S3
        const formattedContent = formatResponseForDownload(response);
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: DOCUMENT_BUCKET,
            Key: `responses/${response.responseId}/formatted.docx`,
            Body: formattedContent,
            ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }));
        // Publish event
        await eventBridgeClient.send(new client_eventbridge_1.PutEventsCommand({
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
    }
    catch (error) {
        console.error('Error processing response generation:', error);
        throw error;
    }
};
const parseGeneratedContent = (content) => {
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
    let currentContent = [];
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.toLowerCase().includes('cover letter')) {
            currentSection = 'coverLetter';
            currentContent = [];
        }
        else if (trimmedLine.toLowerCase().includes('company profile')) {
            if (currentSection)
                sections[currentSection] = currentContent.join('\n');
            currentSection = 'companyProfile';
            currentContent = [];
        }
        else if (trimmedLine.toLowerCase().includes('past performance')) {
            if (currentSection)
                sections[currentSection] = currentContent.join('\n');
            currentSection = 'pastPerformance';
            currentContent = [];
        }
        else if (trimmedLine.toLowerCase().includes('capabilities')) {
            if (currentSection)
                sections[currentSection] = currentContent.join('\n');
            currentSection = 'capabilities';
            currentContent = [];
        }
        else if (trimmedLine.toLowerCase().includes('differentiators')) {
            if (currentSection)
                sections[currentSection] = currentContent.join('\n');
            currentSection = 'differentiators';
            currentContent = [];
        }
        else if (trimmedLine.toLowerCase().includes('contact information')) {
            if (currentSection)
                sections[currentSection] = currentContent.join('\n');
            currentSection = 'contactInformation';
            currentContent = [];
        }
        else if (currentSection && trimmedLine) {
            currentContent.push(line);
        }
    }
    // Add the last section
    if (currentSection) {
        sections[currentSection] = currentContent.join('\n');
    }
    return sections;
};
const formatResponseForDownload = (response) => {
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
const handler = async (event, context) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    for (const record of event.Records) {
        try {
            const messageBody = JSON.parse(record.body);
            if (messageBody.type === 'generate_response') {
                const request = messageBody.data;
                const response = await processResponseGeneration(request);
                console.log(`Generated response ${response.responseId} for user ${request.userId}`);
            }
        }
        catch (error) {
            console.error('Error processing record:', error);
            throw error;
        }
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBQXNHO0FBQ3RHLGtEQUFrRjtBQUNsRixvRUFBa0Y7QUFDbEYsNEVBQTJGO0FBRTNGLHlCQUF5QjtBQUN6QixNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQzVELE1BQU0sUUFBUSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNsQyxNQUFNLGlCQUFpQixHQUFHLElBQUksc0NBQWlCLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDcEQsTUFBTSxhQUFhLEdBQUcsSUFBSSw2Q0FBb0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUVuRCx3QkFBd0I7QUFDeEIsTUFBTSxFQUNKLFVBQVUsRUFDVixpQkFBaUIsRUFDakIsZUFBZSxFQUNmLFNBQVMsR0FDVixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUM7QUErRWhCLHNCQUFzQjtBQUN0QixNQUFNLDBCQUEwQixHQUFHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0FrRWxDLENBQUM7QUFFRixvQkFBb0I7QUFDcEIsTUFBTSx1QkFBdUIsR0FBRyxLQUFLLEVBQ25DLFdBQXFDLEVBQ3JDLFdBQXdCLEVBQ3hCLGtCQUEyQixFQUNWLEVBQUU7SUFDbkIsSUFBSSxDQUFDO1FBQ0gsa0NBQWtDO1FBQ2xDLE1BQU0sTUFBTSxHQUFHLDBCQUEwQjthQUN0QyxPQUFPLENBQUMsb0JBQW9CLEVBQUUsV0FBVyxDQUFDLEtBQUssQ0FBQzthQUNoRCxPQUFPLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUM7YUFDdkMsT0FB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Q0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXRELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQztZQUNILE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRTVDLElBQUksV0FBVyxDQUFDLElBQUksS0FBSyxtQkFBbUIsRUFBRSxDQUFDO2dCQUM3QyxNQUFNLE9BQU8sR0FBRyxXQUFXLENBQUMsSUFBaUMsQ0FBQztnQkFDOUQsTUFBTSxRQUFRLEdBQUcsTUFBTSx5QkFBeUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDMUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsUUFBUSxDQUFDLFVBQVUsYUFBYSxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztZQUN0RixDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDBCQUEwQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ2pELE1BQU0sS0FBSyxDQUFDO1FBQ2QsQ0FBQztJQUNILENBQUM7QUFDSCxDQUFDLENBQUM7QUFqQlcsUUFBQSxPQUFPLFdBaUJsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU0V2ZW50LCBDb250ZXh0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBQdXRDb21tYW5kLCBVcGRhdGVDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IFMzQ2xpZW50LCBHZXRPYmplY3RDb21tYW5kLCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IEV2ZW50QnJpZGdlQ2xpZW50LCBQdXRFdmVudHNDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWV2ZW50YnJpZGdlJztcbmltcG9ydCB7IEJlZHJvY2tSdW50aW1lQ2xpZW50LCBJbnZva2VNb2RlbENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtYmVkcm9jay1ydW50aW1lJztcblxuLy8gSW5pdGlhbGl6ZSBBV1MgY2xpZW50c1xuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xuY29uc3QgczNDbGllbnQgPSBuZXcgUzNDbGllbnQoe30pO1xuY29uc3QgZXZlbnRCcmlkZ2VDbGllbnQgPSBuZXcgRXZlbnRCcmlkZ2VDbGllbnQoe30pO1xuY29uc3QgYmVkcm9ja0NsaWVudCA9IG5ldyBCZWRyb2NrUnVudGltZUNsaWVudCh7fSk7XG5cbi8vIEVudmlyb25tZW50IHZhcmlhYmxlc1xuY29uc3Qge1xuICBVU0VSX1RBQkxFLFxuICBPUFBPUlRVTklUWV9UQUJMRSxcbiAgRE9DVU1FTlRfQlVDS0VULFxuICBFVkVOVF9CVVMsXG59ID0gcHJvY2Vzcy5lbnY7XG5cbi8vIFR5cGVzXG5pbnRlcmZhY2UgUmVzcG9uc2VHZW5lcmF0aW9uUmVxdWVzdCB7XG4gIHVzZXJJZDogc3RyaW5nO1xuICBvcHBvcnR1bml0eUlkOiBzdHJpbmc7XG4gIHRlbXBsYXRlSWQ/OiBzdHJpbmc7XG4gIGN1c3RvbUluc3RydWN0aW9ucz86IHN0cmluZztcbiAgaW5jbHVkZUF0dGFjaG1lbnRzPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIFVzZXJQcm9maWxlIHtcbiAgdXNlcklkOiBzdHJpbmc7XG4gIGNvbXBhbnlOYW1lOiBzdHJpbmc7XG4gIGNvbXBhbnlEZXNjcmlwdGlvbjogc3RyaW5nO1xuICBuYWljc0NvZGVzOiBzdHJpbmdbXTtcbiAgY2VydGlmaWNhdGlvbnM6IHN0cmluZ1tdO1xuICBwYXN0UHJvamVjdHM6IHtcbiAgICB0aXRsZTogc3RyaW5nO1xuICAgIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gICAgY3VzdG9tZXI6IHN0cmluZztcbiAgICB2YWx1ZTogc3RyaW5nO1xuICAgIGR1cmF0aW9uOiBzdHJpbmc7XG4gICAgcmVsZXZhbnRFeHBlcmllbmNlOiBzdHJpbmdbXTtcbiAgfVtdO1xuICBjYXBhYmlsaXRpZXM6IHN0cmluZ1tdO1xuICBkaWZmZXJlbnRpYXRvcnM6IHN0cmluZ1tdO1xuICBjb250YWN0SW5mbzoge1xuICAgIG5hbWU6IHN0cmluZztcbiAgICB0aXRsZTogc3RyaW5nO1xuICAgIGVtYWlsOiBzdHJpbmc7XG4gICAgcGhvbmU6IHN0cmluZztcbiAgICBhZGRyZXNzOiBzdHJpbmc7XG4gIH07XG59XG5cbmludGVyZmFjZSBTb3VyY2VzU291Z2h0T3Bwb3J0dW5pdHkge1xuICBvcHBvcnR1bml0eUlkOiBzdHJpbmc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGFnZW5jeTogc3RyaW5nO1xuICBvZmZpY2U6IHN0cmluZztcbiAgbmFpY3NDb2RlOiBzdHJpbmc7XG4gIHJlcXVpcmVtZW50czogc3RyaW5nW107XG4gIHBvaW50T2ZDb250YWN0OiB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGVtYWlsOiBzdHJpbmc7XG4gICAgcGhvbmU/OiBzdHJpbmc7XG4gIH07XG4gIHJlc3BvbnNlRGVhZGxpbmU6IHN0cmluZztcbiAgYXR0YWNobWVudHM/OiB7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHVybDogc3RyaW5nO1xuICB9W107XG4gIGtleXdvcmRzOiBzdHJpbmdbXTtcbn1cblxuaW50ZXJmYWNlIEdlbmVyYXRlZFJlc3BvbnNlIHtcbiAgcmVzcG9uc2VJZDogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgb3Bwb3J0dW5pdHlJZDogc3RyaW5nO1xuICBjb250ZW50OiB7XG4gICAgY292ZXJMZXR0ZXI6IHN0cmluZztcbiAgICBjb21wYW55UHJvZmlsZTogc3RyaW5nO1xuICAgIHBhc3RQZXJmb3JtYW5jZTogc3RyaW5nO1xuICAgIGNhcGFiaWxpdGllczogc3RyaW5nO1xuICAgIGRpZmZlcmVudGlhdG9yczogc3RyaW5nO1xuICAgIGNvbnRhY3RJbmZvcm1hdGlvbjogc3RyaW5nO1xuICB9O1xuICBtZXRhZGF0YToge1xuICAgIGdlbmVyYXRlZEF0OiBzdHJpbmc7XG4gICAgdGVtcGxhdGVVc2VkPzogc3RyaW5nO1xuICAgIHdvcmRDb3VudDogbnVtYmVyO1xuICAgIGNvbmZpZGVuY2VTY29yZTogbnVtYmVyO1xuICAgIGtleXdvcmRNYXRjaGVzOiBzdHJpbmdbXTtcbiAgfTtcbiAgc3RhdHVzOiAnZHJhZnQnIHwgJ3JldmlldycgfCAnYXBwcm92ZWQnIHwgJ3N1Ym1pdHRlZCc7XG59XG5cbi8vIEFJIFByb21wdCBUZW1wbGF0ZXNcbmNvbnN0IFJFU1BPTlNFX0dFTkVSQVRJT05fUFJPTVBUID0gYFxuWW91IGFyZSBhbiBleHBlcnQgaW4gZ292ZXJubWVudCBjb250cmFjdGluZyBhbmQgU291cmNlcyBTb3VnaHQgcmVzcG9uc2VzLiBHZW5lcmF0ZSBhIHByb2Zlc3Npb25hbCwgY29tcGVsbGluZyByZXNwb25zZSB0byBhIFNvdXJjZXMgU291Z2h0IG5vdGljZS5cblxuT1BQT1JUVU5JVFkgREVUQUlMUzpcblRpdGxlOiB7b3Bwb3J0dW5pdHlUaXRsZX1cbkFnZW5jeToge2FnZW5jeX1cbk9mZmljZToge29mZmljZX1cbkRlc2NyaXB0aW9uOiB7ZGVzY3JpcHRpb259XG5SZXF1aXJlbWVudHM6IHtyZXF1aXJlbWVudHN9XG5OQUlDUyBDb2RlOiB7bmFpY3NDb2RlfVxuS2V5d29yZHM6IHtrZXl3b3Jkc31cblxuQ09NUEFOWSBQUk9GSUxFOlxuQ29tcGFueToge2NvbXBhbnlOYW1lfVxuRGVzY3JpcHRpb246IHtjb21wYW55RGVzY3JpcHRpb259XG5DZXJ0aWZpY2F0aW9uczoge2NlcnRpZmljYXRpb25zfVxuQ2FwYWJpbGl0aWVzOiB7Y2FwYWJpbGl0aWVzfVxuRGlmZmVyZW50aWF0b3JzOiB7ZGlmZmVyZW50aWF0b3JzfVxuXG5QQVNUIFBST0pFQ1RTOlxue3Bhc3RQcm9qZWN0c31cblxuQ09OVEFDVCBJTkZPUk1BVElPTjpcbntjb250YWN0SW5mb31cblxuR2VuZXJhdGUgYSBwcm9mZXNzaW9uYWwgU291cmNlcyBTb3VnaHQgcmVzcG9uc2Ugd2l0aCB0aGUgZm9sbG93aW5nIHNlY3Rpb25zOlxuXG4xLiBDT1ZFUiBMRVRURVIgKDItMyBwYXJhZ3JhcGhzKVxuLSBFeHByZXNzIGludGVyZXN0IGFuZCB1bmRlcnN0YW5kaW5nIG9mIHRoZSByZXF1aXJlbWVudFxuLSBIaWdobGlnaHQga2V5IHF1YWxpZmljYXRpb25zIGFuZCByZWxldmFudCBleHBlcmllbmNlXG4tIE1lbnRpb24gc3BlY2lmaWMgY2VydGlmaWNhdGlvbnMgaWYgYXBwbGljYWJsZVxuXG4yLiBDT01QQU5ZIFBST0ZJTEUgKDEtMiBwYXJhZ3JhcGhzKVxuLSBCcmllZiBvdmVydmlldyBvZiBjb21wYW55IGFuZCBjb3JlIGNvbXBldGVuY2llc1xuLSBSZWxldmFudCBjZXJ0aWZpY2F0aW9ucyBhbmQgY2FwYWJpbGl0aWVzXG4tIFVuaXF1ZSB2YWx1ZSBwcm9wb3NpdGlvblxuXG4zLiBQQVNUIFBFUkZPUk1BTkNFICgzLTUgZXhhbXBsZXMpXG4tIFNlbGVjdCBtb3N0IHJlbGV2YW50IHByb2plY3RzIGZyb20gcGFzdCBwZXJmb3JtYW5jZVxuLSBJbmNsdWRlIGN1c3RvbWVyLCBjb250cmFjdCB2YWx1ZSwgZHVyYXRpb24sIGFuZCBvdXRjb21lc1xuLSBFbXBoYXNpemUgcmVzdWx0cyBhbmQgcmVsZXZhbmNlIHRvIGN1cnJlbnQgb3Bwb3J0dW5pdHlcblxuNC4gQ0FQQUJJTElUSUVTIEFORCBBUFBST0FDSCAoMi0zIHBhcmFncmFwaHMpXG4tIERlbW9uc3RyYXRlIHVuZGVyc3RhbmRpbmcgb2YgcmVxdWlyZW1lbnRzXG4tIE91dGxpbmUgcHJvcG9zZWQgYXBwcm9hY2ggb3IgbWV0aG9kb2xvZ3lcbi0gSGlnaGxpZ2h0IHRlY2huaWNhbCBjYXBhYmlsaXRpZXMgYW5kIHJlc291cmNlc1xuXG41LiBESUZGRVJFTlRJQVRPUlMgKDEtMiBwYXJhZ3JhcGhzKVxuLSBXaGF0IHNldHMgdGhpcyBjb21wYW55IGFwYXJ0IGZyb20gY29tcGV0aXRvcnNcbi0gVW5pcXVlIHF1YWxpZmljYXRpb25zIG9yIGV4cGVyaWVuY2Vcbi0gVmFsdWUtYWRkZWQgc2VydmljZXMgb3IgaW5ub3ZhdGlvbnNcblxuNi4gQ09OVEFDVCBJTkZPUk1BVElPTlxuLSBQcmltYXJ5IHBvaW50IG9mIGNvbnRhY3QgZGV0YWlsc1xuLSBDb21wYW55IGluZm9ybWF0aW9uIGFuZCBjZXJ0aWZpY2F0aW9uc1xuXG5JTVBPUlRBTlQgR1VJREVMSU5FUzpcbi0gS2VlcCByZXNwb25zZSB0byAyLTQgcGFnZXMgbWF4aW11bVxuLSBVc2UgcHJvZmVzc2lvbmFsLCBjb25maWRlbnQgdG9uZVxuLSBJbmNsdWRlIHNwZWNpZmljIGV4YW1wbGVzIGFuZCBxdWFudGlmaWFibGUgcmVzdWx0c1xuLSBNYXRjaCBsYW5ndWFnZSBhbmQga2V5d29yZHMgZnJvbSB0aGUgb3Bwb3J0dW5pdHlcbi0gQXZvaWQgZ2VuZXJpYyBvciBib2lsZXJwbGF0ZSBsYW5ndWFnZVxuLSBGb2N1cyBvbiBob3cgdGhlIGNvbXBhbnkgY2FuIHNvbHZlIHRoZSBnb3Zlcm5tZW50J3Mgc3BlY2lmaWMgbmVlZHNcbi0gSW5jbHVkZSBhbGwgcmVxdWlyZWQgY2VydGlmaWNhdGlvbnMgYW5kIGJ1c2luZXNzIHNpemUgaW5mb3JtYXRpb25cblxuRm9ybWF0IHRoZSByZXNwb25zZSBwcm9mZXNzaW9uYWxseSB3aXRoIGNsZWFyIGhlYWRpbmdzIGFuZCBwcm9wZXIgYnVzaW5lc3MgbGV0dGVyIHN0cnVjdHVyZS5cbmA7XG5cbi8vIFV0aWxpdHkgZnVuY3Rpb25zXG5jb25zdCBnZW5lcmF0ZVJlc3BvbnNlQ29udGVudCA9IGFzeW5jIChcbiAgb3Bwb3J0dW5pdHk6IFNvdXJjZXNTb3VnaHRPcHBvcnR1bml0eSxcbiAgdXNlclByb2ZpbGU6IFVzZXJQcm9maWxlLFxuICBjdXN0b21JbnN0cnVjdGlvbnM/OiBzdHJpbmdcbik6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gIHRyeSB7XG4gICAgLy8gUHJlcGFyZSBwcm9tcHQgd2l0aCBhY3R1YWwgZGF0YVxuICAgIGNvbnN0IHByb21wdCA9IFJFU1BPTlNFX0dFTkVSQVRJT05fUFJPTVBUXG4gICAgICAucmVwbGFjZSgne29wcG9ydHVuaXR5VGl0bGV9Jywgb3Bwb3J0dW5pdHkudGl0bGUpXG4gICAgICAucmVwbGFjZSgne2FnZW5jeX0nLCBvcHBvcnR1bml0eS5hZ2VuY3kpXG4gICAgICAucmVwbGFjZSgne29mZmljZX0nLCBvcHBvcnR1bml0eS5vZmZpY2UpXG4gICAgICAucmVwbGFjZSgne2Rlc2NyaXB0aW9ufScsIG9wcG9ydHVuaXR5LmRlc2NyaXB0aW9uKVxuICAgICAgLnJlcGxhY2UoJ3tyZXF1aXJlbWVudHN9Jywgb3Bwb3J0dW5pdHkucmVxdWlyZW1lbnRzLmpvaW4oJywgJykpXG4gICAgICAucmVwbGFjZSgne25haWNzQ29kZX0nLCBvcHBvcnR1bml0eS5uYWljc0NvZGUpXG4gICAgICAucmVwbGFjZSgne2tleXdvcmRzfScsIG9wcG9ydHVuaXR5LmtleXdvcmRzLmpvaW4oJywgJykpXG4gICAgICAucmVwbGFjZSgne2NvbXBhbnlOYW1lfScsIHVzZXJQcm9maWxlLmNvbXBhbnlOYW1lKVxuICAgICAgLnJlcGxhY2UoJ3tjb21wYW55RGVzY3JpcHRpb259JywgdXNlclByb2ZpbGUuY29tcGFueURlc2NyaXB0aW9uKVxuICAgICAgLnJlcGxhY2UoJ3tjZXJ0aWZpY2F0aW9uc30nLCB1c2VyUHJvZmlsZS5jZXJ0aWZpY2F0aW9ucy5qb2luKCcsICcpKVxuICAgICAgLnJlcGxhY2UoJ3tjYXBhYmlsaXRpZXN9JywgdXNlclByb2ZpbGUuY2FwYWJpbGl0aWVzLmpvaW4oJywgJykpXG4gICAgICAucmVwbGFjZSgne2RpZmZlcmVudGlhdG9yc30nLCB1c2VyUHJvZmlsZS5kaWZmZXJlbnRpYXRvcnMuam9pbignLCAnKSlcbiAgICAgIC5yZXBsYWNlKCd7cGFzdFByb2plY3RzfScsIGZvcm1hdFBhc3RQcm9qZWN0cyh1c2VyUHJvZmlsZS5wYXN0UHJvamVjdHMpKVxuICAgICAgLnJlcGxhY2UoJ3tjb250YWN0SW5mb30nLCBmb3JtYXRDb250YWN0SW5mbyh1c2VyUHJvZmlsZS5jb250YWN0SW5mbykpO1xuXG4gICAgLy8gQWRkIGN1c3RvbSBpbnN0cnVjdGlvbnMgaWYgcHJvdmlkZWRcbiAgICBjb25zdCBmaW5hbFByb21wdCA9IGN1c3RvbUluc3RydWN0aW9ucyBcbiAgICAgID8gYCR7cHJvbXB0fVxcblxcbkFERElUSU9OQUwgSU5TVFJVQ1RJT05TOlxcbiR7Y3VzdG9tSW5zdHJ1Y3Rpb25zfWBcbiAgICAgIDogcHJvbXB0O1xuXG4gICAgLy8gQ2FsbCBCZWRyb2NrIChDbGF1ZGUpIGZvciByZXNwb25zZSBnZW5lcmF0aW9uXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBiZWRyb2NrQ2xpZW50LnNlbmQobmV3IEludm9rZU1vZGVsQ29tbWFuZCh7XG4gICAgICBtb2RlbElkOiAnYW50aHJvcGljLmNsYXVkZS0zLXNvbm5ldC0yMDI0MDIyOS12MTowJyxcbiAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICBhY2NlcHQ6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgYW50aHJvcGljX3ZlcnNpb246ICdiZWRyb2NrLTIwMjMtMDUtMzEnLFxuICAgICAgICBtYXhfdG9rZW5zOiA0MDAwLFxuICAgICAgICBtZXNzYWdlczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgICAgIGNvbnRlbnQ6IGZpbmFsUHJvbXB0XG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9KVxuICAgIH0pKTtcblxuICAgIGNvbnN0IHJlc3BvbnNlQm9keSA9IEpTT04ucGFyc2UobmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKHJlc3BvbnNlLmJvZHkpKTtcbiAgICByZXR1cm4gcmVzcG9uc2VCb2R5LmNvbnRlbnRbMF0udGV4dDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBnZW5lcmF0aW5nIHJlc3BvbnNlIGNvbnRlbnQ6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59O1xuXG5jb25zdCBmb3JtYXRQYXN0UHJvamVjdHMgPSAocHJvamVjdHM6IFVzZXJQcm9maWxlWydwYXN0UHJvamVjdHMnXSk6IHN0cmluZyA9PiB7XG4gIHJldHVybiBwcm9qZWN0cy5tYXAocHJvamVjdCA9PiBgXG5UaXRsZTogJHtwcm9qZWN0LnRpdGxlfVxuQ3VzdG9tZXI6ICR7cHJvamVjdC5jdXN0b21lcn1cblZhbHVlOiAke3Byb2plY3QudmFsdWV9XG5EdXJhdGlvbjogJHtwcm9qZWN0LmR1cmF0aW9ufVxuRGVzY3JpcHRpb246ICR7cHJvamVjdC5kZXNjcmlwdGlvbn1cblJlbGV2YW50IEV4cGVyaWVuY2U6ICR7cHJvamVjdC5yZWxldmFudEV4cGVyaWVuY2Uuam9pbignLCAnKX1cbmApLmpvaW4oJ1xcbicpO1xufTtcblxuY29uc3QgZm9ybWF0Q29udGFjdEluZm8gPSAoY29udGFjdDogVXNlclByb2ZpbGVbJ2NvbnRhY3RJbmZvJ10pOiBzdHJpbmcgPT4ge1xuICByZXR1cm4gYFxuTmFtZTogJHtjb250YWN0Lm5hbWV9XG5UaXRsZTogJHtjb250YWN0LnRpdGxlfVxuRW1haWw6ICR7Y29udGFjdC5lbWFpbH1cblBob25lOiAke2NvbnRhY3QucGhvbmV9XG5BZGRyZXNzOiAke2NvbnRhY3QuYWRkcmVzc31cbmA7XG59O1xuXG5jb25zdCBjYWxjdWxhdGVDb25maWRlbmNlU2NvcmUgPSAoXG4gIG9wcG9ydHVuaXR5OiBTb3VyY2VzU291Z2h0T3Bwb3J0dW5pdHksXG4gIHVzZXJQcm9maWxlOiBVc2VyUHJvZmlsZSxcbiAgZ2VuZXJhdGVkQ29udGVudDogc3RyaW5nXG4pOiBudW1iZXIgPT4ge1xuICBsZXQgc2NvcmUgPSAwO1xuXG4gIC8vIE5BSUNTIGNvZGUgbWF0Y2hcbiAgaWYgKHVzZXJQcm9maWxlLm5haWNzQ29kZXMuaW5jbHVkZXMob3Bwb3J0dW5pdHkubmFpY3NDb2RlKSkge1xuICAgIHNjb3JlICs9IDMwO1xuICB9XG5cbiAgLy8gS2V5d29yZCBtYXRjaGVzIGluIGdlbmVyYXRlZCBjb250ZW50XG4gIGNvbnN0IGNvbnRlbnRMb3dlciA9IGdlbmVyYXRlZENvbnRlbnQudG9Mb3dlckNhc2UoKTtcbiAgY29uc3Qga2V5d29yZE1hdGNoZXMgPSBvcHBvcnR1bml0eS5rZXl3b3Jkcy5maWx0ZXIoa2V5d29yZCA9PiBcbiAgICBjb250ZW50TG93ZXIuaW5jbHVkZXMoa2V5d29yZC50b0xvd2VyQ2FzZSgpKVxuICApO1xuICBzY29yZSArPSBrZXl3b3JkTWF0Y2hlcy5sZW5ndGggKiA1O1xuXG4gIC8vIFBhc3QgcGVyZm9ybWFuY2UgcmVsZXZhbmNlXG4gIGNvbnN0IHJlbGV2YW50UHJvamVjdHMgPSB1c2VyUHJvZmlsZS5wYXN0UHJvamVjdHMuZmlsdGVyKHByb2plY3QgPT5cbiAgICBwcm9qZWN0LnJlbGV2YW50RXhwZXJpZW5jZS5zb21lKGV4cCA9PiBcbiAgICAgIG9wcG9ydHVuaXR5LmtleXdvcmRzLnNvbWUoa2V5d29yZCA9PiBcbiAgICAgICAgZXhwLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoa2V5d29yZC50b0xvd2VyQ2FzZSgpKVxuICAgICAgKVxuICAgIClcbiAgKTtcbiAgc2NvcmUgKz0gcmVsZXZhbnRQcm9qZWN0cy5sZW5ndGggKiAxMDtcblxuICAvLyBDb250ZW50IGxlbmd0aCAoYWRlcXVhdGUgYnV0IG5vdCB0b28gdmVyYm9zZSlcbiAgY29uc3Qgd29yZENvdW50ID0gZ2VuZXJhdGVkQ29udGVudC5zcGxpdCgvXFxzKy8pLmxlbmd0aDtcbiAgaWYgKHdvcmRDb3VudCA+PSA4MDAgJiYgd29yZENvdW50IDw9IDIwMDApIHtcbiAgICBzY29yZSArPSAyMDtcbiAgfVxuXG4gIC8vIENlcnRpZmljYXRpb25zIG1hdGNoXG4gIGNvbnN0IGNlcnRpZmljYXRpb25NYXRjaGVzID0gdXNlclByb2ZpbGUuY2VydGlmaWNhdGlvbnMuZmlsdGVyKGNlcnQgPT5cbiAgICBvcHBvcnR1bml0eS5kZXNjcmlwdGlvbi50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGNlcnQudG9Mb3dlckNhc2UoKSlcbiAgKTtcbiAgc2NvcmUgKz0gY2VydGlmaWNhdGlvbk1hdGNoZXMubGVuZ3RoICogMTU7XG5cbiAgcmV0dXJuIE1hdGgubWluKHNjb3JlLCAxMDApO1xufTtcblxuY29uc3QgcHJvY2Vzc1Jlc3BvbnNlR2VuZXJhdGlvbiA9IGFzeW5jIChyZXF1ZXN0OiBSZXNwb25zZUdlbmVyYXRpb25SZXF1ZXN0KTogUHJvbWlzZTxHZW5lcmF0ZWRSZXNwb25zZT4gPT4ge1xuICB0cnkge1xuICAgIC8vIEdldCB1c2VyIHByb2ZpbGVcbiAgICBjb25zdCB1c2VyUmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBVU0VSX1RBQkxFLFxuICAgICAgS2V5OiB7IHVzZXJJZDogcmVxdWVzdC51c2VySWQgfSxcbiAgICB9KSk7XG5cbiAgICBpZiAoIXVzZXJSZXN1bHQuSXRlbSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVc2VyIHByb2ZpbGUgbm90IGZvdW5kJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlclByb2ZpbGUgPSB1c2VyUmVzdWx0Lkl0ZW0gYXMgVXNlclByb2ZpbGU7XG5cbiAgICAvLyBHZXQgb3Bwb3J0dW5pdHkgZGV0YWlsc1xuICAgIGNvbnN0IG9wcG9ydHVuaXR5UmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBPUFBPUlRVTklUWV9UQUJMRSxcbiAgICAgIEtleTogeyBvcHBvcnR1bml0eUlkOiByZXF1ZXN0Lm9wcG9ydHVuaXR5SWQgfSxcbiAgICB9KSk7XG5cbiAgICBpZiAoIW9wcG9ydHVuaXR5UmVzdWx0Lkl0ZW0pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignT3Bwb3J0dW5pdHkgbm90IGZvdW5kJyk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3Bwb3J0dW5pdHkgPSBvcHBvcnR1bml0eVJlc3VsdC5JdGVtIGFzIFNvdXJjZXNTb3VnaHRPcHBvcnR1bml0eTtcblxuICAgIC8vIEdlbmVyYXRlIHJlc3BvbnNlIGNvbnRlbnRcbiAgICBjb25zdCBnZW5lcmF0ZWRDb250ZW50ID0gYXdhaXQgZ2VuZXJhdGVSZXNwb25zZUNvbnRlbnQoXG4gICAgICBvcHBvcnR1bml0eSxcbiAgICAgIHVzZXJQcm9maWxlLFxuICAgICAgcmVxdWVzdC5jdXN0b21JbnN0cnVjdGlvbnNcbiAgICApO1xuXG4gICAgLy8gUGFyc2UgZ2VuZXJhdGVkIGNvbnRlbnQgaW50byBzZWN0aW9uc1xuICAgIGNvbnN0IHNlY3Rpb25zID0gcGFyc2VHZW5lcmF0ZWRDb250ZW50KGdlbmVyYXRlZENvbnRlbnQpO1xuXG4gICAgLy8gQ2FsY3VsYXRlIGNvbmZpZGVuY2Ugc2NvcmVcbiAgICBjb25zdCBjb25maWRlbmNlU2NvcmUgPSBjYWxjdWxhdGVDb25maWRlbmNlU2NvcmUob3Bwb3J0dW5pdHksIHVzZXJQcm9maWxlLCBnZW5lcmF0ZWRDb250ZW50KTtcblxuICAgIC8vIEZpbmQga2V5d29yZCBtYXRjaGVzXG4gICAgY29uc3Qga2V5d29yZE1hdGNoZXMgPSBvcHBvcnR1bml0eS5rZXl3b3Jkcy5maWx0ZXIoa2V5d29yZCA9PlxuICAgICAgZ2VuZXJhdGVkQ29udGVudC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGtleXdvcmQudG9Mb3dlckNhc2UoKSlcbiAgICApO1xuXG4gICAgY29uc3QgcmVzcG9uc2U6IEdlbmVyYXRlZFJlc3BvbnNlID0ge1xuICAgICAgcmVzcG9uc2VJZDogYHJlc3AtJHtyZXF1ZXN0LnVzZXJJZH0tJHtyZXF1ZXN0Lm9wcG9ydHVuaXR5SWR9LSR7RGF0ZS5ub3coKX1gLFxuICAgICAgdXNlcklkOiByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIG9wcG9ydHVuaXR5SWQ6IHJlcXVlc3Qub3Bwb3J0dW5pdHlJZCxcbiAgICAgIGNvbnRlbnQ6IHNlY3Rpb25zLFxuICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgZ2VuZXJhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgdGVtcGxhdGVVc2VkOiByZXF1ZXN0LnRlbXBsYXRlSWQsXG4gICAgICAgIHdvcmRDb3VudDogZ2VuZXJhdGVkQ29udGVudC5zcGxpdCgvXFxzKy8pLmxlbmd0aCxcbiAgICAgICAgY29uZmlkZW5jZVNjb3JlLFxuICAgICAgICBrZXl3b3JkTWF0Y2hlcyxcbiAgICAgIH0sXG4gICAgICBzdGF0dXM6ICdkcmFmdCcsXG4gICAgfTtcblxuICAgIC8vIFN0b3JlIHJlc3BvbnNlIGluIER5bmFtb0RCXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBgJHtVU0VSX1RBQkxFfS1yZXNwb25zZXNgLFxuICAgICAgSXRlbTogcmVzcG9uc2UsXG4gICAgfSkpO1xuXG4gICAgLy8gU3RvcmUgZnVsbCBjb250ZW50IGluIFMzXG4gICAgYXdhaXQgczNDbGllbnQuc2VuZChuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICBCdWNrZXQ6IERPQ1VNRU5UX0JVQ0tFVCxcbiAgICAgIEtleTogYHJlc3BvbnNlcy8ke3Jlc3BvbnNlLnJlc3BvbnNlSWR9L2NvbnRlbnQudHh0YCxcbiAgICAgIEJvZHk6IGdlbmVyYXRlZENvbnRlbnQsXG4gICAgICBDb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuICAgIH0pKTtcblxuICAgIC8vIFN0b3JlIGZvcm1hdHRlZCBjb250ZW50IGluIFMzXG4gICAgY29uc3QgZm9ybWF0dGVkQ29udGVudCA9IGZvcm1hdFJlc3BvbnNlRm9yRG93bmxvYWQocmVzcG9uc2UpO1xuICAgIGF3YWl0IHMzQ2xpZW50LnNlbmQobmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgQnVja2V0OiBET0NVTUVOVF9CVUNLRVQsXG4gICAgICBLZXk6IGByZXNwb25zZXMvJHtyZXNwb25zZS5yZXNwb25zZUlkfS9mb3JtYXR0ZWQuZG9jeGAsXG4gICAgICBCb2R5OiBmb3JtYXR0ZWRDb250ZW50LFxuICAgICAgQ29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQud29yZHByb2Nlc3NpbmdtbC5kb2N1bWVudCcsXG4gICAgfSkpO1xuXG4gICAgLy8gUHVibGlzaCBldmVudFxuICAgIGF3YWl0IGV2ZW50QnJpZGdlQ2xpZW50LnNlbmQobmV3IFB1dEV2ZW50c0NvbW1hbmQoe1xuICAgICAgRW50cmllczogW3tcbiAgICAgICAgU291cmNlOiAnZ292Yml6LnJlc3BvbnNlcycsXG4gICAgICAgIERldGFpbFR5cGU6ICdSZXNwb25zZSBHZW5lcmF0ZWQnLFxuICAgICAgICBEZXRhaWw6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICByZXNwb25zZUlkOiByZXNwb25zZS5yZXNwb25zZUlkLFxuICAgICAgICAgIHVzZXJJZDogcmVxdWVzdC51c2VySWQsXG4gICAgICAgICAgb3Bwb3J0dW5pdHlJZDogcmVxdWVzdC5vcHBvcnR1bml0eUlkLFxuICAgICAgICAgIGNvbmZpZGVuY2VTY29yZSxcbiAgICAgICAgICB3b3JkQ291bnQ6IHJlc3BvbnNlLm1ldGFkYXRhLndvcmRDb3VudCxcbiAgICAgICAgICBnZW5lcmF0ZWRBdDogcmVzcG9uc2UubWV0YWRhdGEuZ2VuZXJhdGVkQXQsXG4gICAgICAgIH0pLFxuICAgICAgICBFdmVudEJ1c05hbWU6IEVWRU5UX0JVUyxcbiAgICAgIH1dLFxuICAgIH0pKTtcblxuICAgIHJldHVybiByZXNwb25zZTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBwcm9jZXNzaW5nIHJlc3BvbnNlIGdlbmVyYXRpb246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59O1xuXG5jb25zdCBwYXJzZUdlbmVyYXRlZENvbnRlbnQgPSAoY29udGVudDogc3RyaW5nKTogR2VuZXJhdGVkUmVzcG9uc2VbJ2NvbnRlbnQnXSA9PiB7XG4gIC8vIFNpbXBsZSBwYXJzaW5nIC0gaW4gcHJvZHVjdGlvbiwgdXNlIG1vcmUgc29waGlzdGljYXRlZCBwYXJzaW5nXG4gIGNvbnN0IHNlY3Rpb25zID0ge1xuICAgIGNvdmVyTGV0dGVyOiAnJyxcbiAgICBjb21wYW55UHJvZmlsZTogJycsXG4gICAgcGFzdFBlcmZvcm1hbmNlOiAnJyxcbiAgICBjYXBhYmlsaXRpZXM6ICcnLFxuICAgIGRpZmZlcmVudGlhdG9yczogJycsXG4gICAgY29udGFjdEluZm9ybWF0aW9uOiAnJyxcbiAgfTtcblxuICAvLyBTcGxpdCBjb250ZW50IGJ5IHNlY3Rpb25zIGFuZCBleHRyYWN0XG4gIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG4gIGxldCBjdXJyZW50U2VjdGlvbiA9ICcnO1xuICBsZXQgY3VycmVudENvbnRlbnQ6IHN0cmluZ1tdID0gW107XG5cbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgY29uc3QgdHJpbW1lZExpbmUgPSBsaW5lLnRyaW0oKTtcbiAgICBcbiAgICBpZiAodHJpbW1lZExpbmUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnY292ZXIgbGV0dGVyJykpIHtcbiAgICAgIGN1cnJlbnRTZWN0aW9uID0gJ2NvdmVyTGV0dGVyJztcbiAgICAgIGN1cnJlbnRDb250ZW50ID0gW107XG4gICAgfSBlbHNlIGlmICh0cmltbWVkTGluZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjb21wYW55IHByb2ZpbGUnKSkge1xuICAgICAgaWYgKGN1cnJlbnRTZWN0aW9uKSBzZWN0aW9uc1tjdXJyZW50U2VjdGlvbiBhcyBrZXlvZiB0eXBlb2Ygc2VjdGlvbnNdID0gY3VycmVudENvbnRlbnQuam9pbignXFxuJyk7XG4gICAgICBjdXJyZW50U2VjdGlvbiA9ICdjb21wYW55UHJvZmlsZSc7XG4gICAgICBjdXJyZW50Q29udGVudCA9IFtdO1xuICAgIH0gZWxzZSBpZiAodHJpbW1lZExpbmUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygncGFzdCBwZXJmb3JtYW5jZScpKSB7XG4gICAgICBpZiAoY3VycmVudFNlY3Rpb24pIHNlY3Rpb25zW2N1cnJlbnRTZWN0aW9uIGFzIGtleW9mIHR5cGVvZiBzZWN0aW9uc10gPSBjdXJyZW50Q29udGVudC5qb2luKCdcXG4nKTtcbiAgICAgIGN1cnJlbnRTZWN0aW9uID0gJ3Bhc3RQZXJmb3JtYW5jZSc7XG4gICAgICBjdXJyZW50Q29udGVudCA9IFtdO1xuICAgIH0gZWxzZSBpZiAodHJpbW1lZExpbmUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnY2FwYWJpbGl0aWVzJykpIHtcbiAgICAgIGlmIChjdXJyZW50U2VjdGlvbikgc2VjdGlvbnNbY3VycmVudFNlY3Rpb24gYXMga2V5b2YgdHlwZW9mIHNlY3Rpb25zXSA9IGN1cnJlbnRDb250ZW50LmpvaW4oJ1xcbicpO1xuICAgICAgY3VycmVudFNlY3Rpb24gPSAnY2FwYWJpbGl0aWVzJztcbiAgICAgIGN1cnJlbnRDb250ZW50ID0gW107XG4gICAgfSBlbHNlIGlmICh0cmltbWVkTGluZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdkaWZmZXJlbnRpYXRvcnMnKSkge1xuICAgICAgaWYgKGN1cnJlbnRTZWN0aW9uKSBzZWN0aW9uc1tjdXJyZW50U2VjdGlvbiBhcyBrZXlvZiB0eXBlb2Ygc2VjdGlvbnNdID0gY3VycmVudENvbnRlbnQuam9pbignXFxuJyk7XG4gICAgICBjdXJyZW50U2VjdGlvbiA9ICdkaWZmZXJlbnRpYXRvcnMnO1xuICAgICAgY3VycmVudENvbnRlbnQgPSBbXTtcbiAgICB9IGVsc2UgaWYgKHRyaW1tZWRMaW5lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2NvbnRhY3QgaW5mb3JtYXRpb24nKSkge1xuICAgICAgaWYgKGN1cnJlbnRTZWN0aW9uKSBzZWN0aW9uc1tjdXJyZW50U2VjdGlvbiBhcyBrZXlvZiB0eXBlb2Ygc2VjdGlvbnNdID0gY3VycmVudENvbnRlbnQuam9pbignXFxuJyk7XG4gICAgICBjdXJyZW50U2VjdGlvbiA9ICdjb250YWN0SW5mb3JtYXRpb24nO1xuICAgICAgY3VycmVudENvbnRlbnQgPSBbXTtcbiAgICB9IGVsc2UgaWYgKGN1cnJlbnRTZWN0aW9uICYmIHRyaW1tZWRMaW5lKSB7XG4gICAgICBjdXJyZW50Q29udGVudC5wdXNoKGxpbmUpO1xuICAgIH1cbiAgfVxuXG4gIC8vIEFkZCB0aGUgbGFzdCBzZWN0aW9uXG4gIGlmIChjdXJyZW50U2VjdGlvbikge1xuICAgIHNlY3Rpb25zW2N1cnJlbnRTZWN0aW9uIGFzIGtleW9mIHR5cGVvZiBzZWN0aW9uc10gPSBjdXJyZW50Q29udGVudC5qb2luKCdcXG4nKTtcbiAgfVxuXG4gIHJldHVybiBzZWN0aW9ucztcbn07XG5cbmNvbnN0IGZvcm1hdFJlc3BvbnNlRm9yRG93bmxvYWQgPSAocmVzcG9uc2U6IEdlbmVyYXRlZFJlc3BvbnNlKTogQnVmZmVyID0+IHtcbiAgLy8gSW4gcHJvZHVjdGlvbiwgdXNlIGEgcHJvcGVyIGRvY3VtZW50IGdlbmVyYXRpb24gbGlicmFyeSBsaWtlIGRvY3hcbiAgY29uc3QgY29udGVudCA9IGBcbiR7cmVzcG9uc2UuY29udGVudC5jb3ZlckxldHRlcn1cblxuJHtyZXNwb25zZS5jb250ZW50LmNvbXBhbnlQcm9maWxlfVxuXG4ke3Jlc3BvbnNlLmNvbnRlbnQucGFzdFBlcmZvcm1hbmNlfVxuXG4ke3Jlc3BvbnNlLmNvbnRlbnQuY2FwYWJpbGl0aWVzfVxuXG4ke3Jlc3BvbnNlLmNvbnRlbnQuZGlmZmVyZW50aWF0b3JzfVxuXG4ke3Jlc3BvbnNlLmNvbnRlbnQuY29udGFjdEluZm9ybWF0aW9ufVxuYDtcblxuICByZXR1cm4gQnVmZmVyLmZyb20oY29udGVudCwgJ3V0Zi04Jyk7XG59O1xuXG4vLyBNYWluIGhhbmRsZXJcbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBTUVNFdmVudCwgY29udGV4dDogQ29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zb2xlLmxvZygnRXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcblxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG1lc3NhZ2VCb2R5ID0gSlNPTi5wYXJzZShyZWNvcmQuYm9keSk7XG4gICAgICBcbiAgICAgIGlmIChtZXNzYWdlQm9keS50eXBlID09PSAnZ2VuZXJhdGVfcmVzcG9uc2UnKSB7XG4gICAgICAgIGNvbnN0IHJlcXVlc3QgPSBtZXNzYWdlQm9keS5kYXRhIGFzIFJlc3BvbnNlR2VuZXJhdGlvblJlcXVlc3Q7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcHJvY2Vzc1Jlc3BvbnNlR2VuZXJhdGlvbihyZXF1ZXN0KTtcbiAgICAgICAgY29uc29sZS5sb2coYEdlbmVyYXRlZCByZXNwb25zZSAke3Jlc3BvbnNlLnJlc3BvbnNlSWR9IGZvciB1c2VyICR7cmVxdWVzdC51c2VySWR9YCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHByb2Nlc3NpbmcgcmVjb3JkOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxufTsiXX0=