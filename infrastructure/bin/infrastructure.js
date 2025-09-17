#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = __importStar(require("aws-cdk-lib"));
const infrastructure_stack_1 = require("../lib/infrastructure-stack");
const api_stack_1 = require("../lib/api-stack");
const processing_stack_1 = require("../lib/processing-stack");
const web_app_stack_1 = require("../lib/web-app-stack");
const app = new cdk.App();
// Get environment from context or use defaults
const account = app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || 'us-east-1';
// Deploy core infrastructure first
const infraStack = new infrastructure_stack_1.InfrastructureStack(app, 'GovBizAIInfrastructureStack', {
    env: {
        account: account,
        region: region,
    },
    description: 'GovBizAI Infrastructure - Core components including VPC, S3, DynamoDB, Lambda functions',
    tags: {
        Project: 'govbizai',
        Environment: 'dev',
        Phase: 'core-infrastructure',
    },
});
// Deploy document processing stack first
const processingStack = new processing_stack_1.ProcessingStack(app, 'GovBizAIProcessingStack', {
    env: {
        account: account,
        region: region,
    },
    description: 'GovBizAI Processing - Document processing, embedding generation, and web scraping',
    tags: {
        Project: 'govbizai',
        Environment: 'dev',
        Phase: 'document-processing',
    },
    documentsBucket: infraStack.rawDocumentsBucket,
    embeddingsBucket: infraStack.embeddingsBucket,
    companiesTable: infraStack.companiesTable,
});
// Deploy API Gateway stack (depends on infrastructure and processing)
new api_stack_1.ApiStack(app, 'GovBizAIApiStack', {
    env: {
        account: account,
        region: region,
    },
    description: 'GovBizAI API - REST and WebSocket APIs with authentication',
    tags: {
        Project: 'govbizai',
        Environment: 'dev',
        Phase: 'api-gateway',
    },
    userPool: infraStack.userPool,
    userPoolClient: infraStack.userPoolClient,
    companiesTable: infraStack.companiesTable,
    opportunitiesTable: infraStack.opportunitiesTable,
    matchesTable: infraStack.matchesTable,
    feedbackTable: infraStack.feedbackTable,
    documentsTable: infraStack.userProfilesTable, // Using userProfiles table for document metadata
    documentsBucket: infraStack.rawDocumentsBucket,
    embeddingsBucket: infraStack.embeddingsBucket,
    profileEmbeddingQueueUrl: processingStack.profileEmbeddingQueue.queueUrl,
    webScrapingQueueUrl: processingStack.webScrapingQueue.queueUrl,
});
// Deploy web application
new web_app_stack_1.WebAppStack(app, 'GovBizAIWebAppStack', {
    env: {
        account: account,
        region: region,
    },
    description: 'GovBizAI Web Application - React frontend with CloudFront distribution and S3 hosting',
    tags: {
        Project: 'govbizai',
        Environment: 'dev',
        Phase: 'web-application',
    },
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmZyYXN0cnVjdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlEQUFtQztBQUNuQyxzRUFBa0U7QUFDbEUsZ0RBQTRDO0FBQzVDLDhEQUEwRDtBQUMxRCx3REFBbUQ7QUFFbkQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsK0NBQStDO0FBQy9DLE1BQU0sT0FBTyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7QUFDckYsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxXQUFXLENBQUM7QUFFakcsbUNBQW1DO0FBQ25DLE1BQU0sVUFBVSxHQUFHLElBQUksMENBQW1CLENBQUMsR0FBRyxFQUFFLDZCQUE2QixFQUFFO0lBQzdFLEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSxPQUFPO1FBQ2hCLE1BQU0sRUFBRSxNQUFNO0tBQ2Y7SUFDRCxXQUFXLEVBQUUseUZBQXlGO0lBQ3RHLElBQUksRUFBRTtRQUNKLE9BQU8sRUFBRSxVQUFVO1FBQ25CLFdBQVcsRUFBRSxLQUFLO1FBQ2xCLEtBQUssRUFBRSxxQkFBcUI7S0FDN0I7Q0FDRixDQUFDLENBQUM7QUFFSCx5Q0FBeUM7QUFDekMsTUFBTSxlQUFlLEdBQUcsSUFBSSxrQ0FBZSxDQUFDLEdBQUcsRUFBRSx5QkFBeUIsRUFBRTtJQUMxRSxHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsT0FBTztRQUNoQixNQUFNLEVBQUUsTUFBTTtLQUNmO0lBQ0QsV0FBVyxFQUFFLG1GQUFtRjtJQUNoRyxJQUFJLEVBQUU7UUFDSixPQUFPLEVBQUUsVUFBVTtRQUNuQixXQUFXLEVBQUUsS0FBSztRQUNsQixLQUFLLEVBQUUscUJBQXFCO0tBQzdCO0lBQ0QsZUFBZSxFQUFFLFVBQVUsQ0FBQyxrQkFBa0I7SUFDOUMsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLGdCQUFnQjtJQUM3QyxjQUFjLEVBQUUsVUFBVSxDQUFDLGNBQWM7Q0FDMUMsQ0FBQyxDQUFDO0FBRUgsc0VBQXNFO0FBQ3RFLElBQUksb0JBQVEsQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLEVBQUU7SUFDcEMsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLE9BQU87UUFDaEIsTUFBTSxFQUFFLE1BQU07S0FDZjtJQUNELFdBQVcsRUFBRSw0REFBNEQ7SUFDekUsSUFBSSxFQUFFO1FBQ0osT0FBTyxFQUFFLFVBQVU7UUFDbkIsV0FBVyxFQUFFLEtBQUs7UUFDbEIsS0FBSyxFQUFFLGFBQWE7S0FDckI7SUFDRCxRQUFRLEVBQUUsVUFBVSxDQUFDLFFBQVE7SUFDN0IsY0FBYyxFQUFFLFVBQVUsQ0FBQyxjQUFjO0lBQ3pDLGNBQWMsRUFBRSxVQUFVLENBQUMsY0FBYztJQUN6QyxrQkFBa0IsRUFBRSxVQUFVLENBQUMsa0JBQWtCO0lBQ2pELFlBQVksRUFBRSxVQUFVLENBQUMsWUFBWTtJQUNyQyxhQUFhLEVBQUUsVUFBVSxDQUFDLGFBQWE7SUFDdkMsY0FBYyxFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsRUFBRSxpREFBaUQ7SUFDL0YsZUFBZSxFQUFFLFVBQVUsQ0FBQyxrQkFBa0I7SUFDOUMsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLGdCQUFnQjtJQUM3Qyx3QkFBd0IsRUFBRSxlQUFlLENBQUMscUJBQXFCLENBQUMsUUFBUTtJQUN4RSxtQkFBbUIsRUFBRSxlQUFlLENBQUMsZ0JBQWdCLENBQUMsUUFBUTtDQUMvRCxDQUFDLENBQUM7QUFFSCx5QkFBeUI7QUFDekIsSUFBSSwyQkFBVyxDQUFDLEdBQUcsRUFBRSxxQkFBcUIsRUFBRTtJQUMxQyxHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsT0FBTztRQUNoQixNQUFNLEVBQUUsTUFBTTtLQUNmO0lBQ0QsV0FBVyxFQUFFLHVGQUF1RjtJQUNwRyxJQUFJLEVBQUU7UUFDSixPQUFPLEVBQUUsVUFBVTtRQUNuQixXQUFXLEVBQUUsS0FBSztRQUNsQixLQUFLLEVBQUUsaUJBQWlCO0tBQ3pCO0NBQ0YsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEluZnJhc3RydWN0dXJlU3RhY2sgfSBmcm9tICcuLi9saWIvaW5mcmFzdHJ1Y3R1cmUtc3RhY2snO1xuaW1wb3J0IHsgQXBpU3RhY2sgfSBmcm9tICcuLi9saWIvYXBpLXN0YWNrJztcbmltcG9ydCB7IFByb2Nlc3NpbmdTdGFjayB9IGZyb20gJy4uL2xpYi9wcm9jZXNzaW5nLXN0YWNrJztcbmltcG9ydCB7IFdlYkFwcFN0YWNrIH0gZnJvbSAnLi4vbGliL3dlYi1hcHAtc3RhY2snO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG4vLyBHZXQgZW52aXJvbm1lbnQgZnJvbSBjb250ZXh0IG9yIHVzZSBkZWZhdWx0c1xuY29uc3QgYWNjb3VudCA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2FjY291bnQnKSB8fCBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UO1xuY29uc3QgcmVnaW9uID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgncmVnaW9uJykgfHwgcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnO1xuXG4vLyBEZXBsb3kgY29yZSBpbmZyYXN0cnVjdHVyZSBmaXJzdFxuY29uc3QgaW5mcmFTdGFjayA9IG5ldyBJbmZyYXN0cnVjdHVyZVN0YWNrKGFwcCwgJ0dvdkJpekFJSW5mcmFzdHJ1Y3R1cmVTdGFjaycsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogYWNjb3VudCxcbiAgICByZWdpb246IHJlZ2lvbixcbiAgfSxcbiAgZGVzY3JpcHRpb246ICdHb3ZCaXpBSSBJbmZyYXN0cnVjdHVyZSAtIENvcmUgY29tcG9uZW50cyBpbmNsdWRpbmcgVlBDLCBTMywgRHluYW1vREIsIExhbWJkYSBmdW5jdGlvbnMnLFxuICB0YWdzOiB7XG4gICAgUHJvamVjdDogJ2dvdmJpemFpJyxcbiAgICBFbnZpcm9ubWVudDogJ2RldicsXG4gICAgUGhhc2U6ICdjb3JlLWluZnJhc3RydWN0dXJlJyxcbiAgfSxcbn0pO1xuXG4vLyBEZXBsb3kgZG9jdW1lbnQgcHJvY2Vzc2luZyBzdGFjayBmaXJzdFxuY29uc3QgcHJvY2Vzc2luZ1N0YWNrID0gbmV3IFByb2Nlc3NpbmdTdGFjayhhcHAsICdHb3ZCaXpBSVByb2Nlc3NpbmdTdGFjaycsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogYWNjb3VudCxcbiAgICByZWdpb246IHJlZ2lvbixcbiAgfSxcbiAgZGVzY3JpcHRpb246ICdHb3ZCaXpBSSBQcm9jZXNzaW5nIC0gRG9jdW1lbnQgcHJvY2Vzc2luZywgZW1iZWRkaW5nIGdlbmVyYXRpb24sIGFuZCB3ZWIgc2NyYXBpbmcnLFxuICB0YWdzOiB7XG4gICAgUHJvamVjdDogJ2dvdmJpemFpJyxcbiAgICBFbnZpcm9ubWVudDogJ2RldicsXG4gICAgUGhhc2U6ICdkb2N1bWVudC1wcm9jZXNzaW5nJyxcbiAgfSxcbiAgZG9jdW1lbnRzQnVja2V0OiBpbmZyYVN0YWNrLnJhd0RvY3VtZW50c0J1Y2tldCxcbiAgZW1iZWRkaW5nc0J1Y2tldDogaW5mcmFTdGFjay5lbWJlZGRpbmdzQnVja2V0LFxuICBjb21wYW5pZXNUYWJsZTogaW5mcmFTdGFjay5jb21wYW5pZXNUYWJsZSxcbn0pO1xuXG4vLyBEZXBsb3kgQVBJIEdhdGV3YXkgc3RhY2sgKGRlcGVuZHMgb24gaW5mcmFzdHJ1Y3R1cmUgYW5kIHByb2Nlc3NpbmcpXG5uZXcgQXBpU3RhY2soYXBwLCAnR292Qml6QUlBcGlTdGFjaycsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogYWNjb3VudCxcbiAgICByZWdpb246IHJlZ2lvbixcbiAgfSxcbiAgZGVzY3JpcHRpb246ICdHb3ZCaXpBSSBBUEkgLSBSRVNUIGFuZCBXZWJTb2NrZXQgQVBJcyB3aXRoIGF1dGhlbnRpY2F0aW9uJyxcbiAgdGFnczoge1xuICAgIFByb2plY3Q6ICdnb3ZiaXphaScsXG4gICAgRW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgIFBoYXNlOiAnYXBpLWdhdGV3YXknLFxuICB9LFxuICB1c2VyUG9vbDogaW5mcmFTdGFjay51c2VyUG9vbCxcbiAgdXNlclBvb2xDbGllbnQ6IGluZnJhU3RhY2sudXNlclBvb2xDbGllbnQsXG4gIGNvbXBhbmllc1RhYmxlOiBpbmZyYVN0YWNrLmNvbXBhbmllc1RhYmxlLFxuICBvcHBvcnR1bml0aWVzVGFibGU6IGluZnJhU3RhY2sub3Bwb3J0dW5pdGllc1RhYmxlLFxuICBtYXRjaGVzVGFibGU6IGluZnJhU3RhY2subWF0Y2hlc1RhYmxlLFxuICBmZWVkYmFja1RhYmxlOiBpbmZyYVN0YWNrLmZlZWRiYWNrVGFibGUsXG4gIGRvY3VtZW50c1RhYmxlOiBpbmZyYVN0YWNrLnVzZXJQcm9maWxlc1RhYmxlLCAvLyBVc2luZyB1c2VyUHJvZmlsZXMgdGFibGUgZm9yIGRvY3VtZW50IG1ldGFkYXRhXG4gIGRvY3VtZW50c0J1Y2tldDogaW5mcmFTdGFjay5yYXdEb2N1bWVudHNCdWNrZXQsXG4gIGVtYmVkZGluZ3NCdWNrZXQ6IGluZnJhU3RhY2suZW1iZWRkaW5nc0J1Y2tldCxcbiAgcHJvZmlsZUVtYmVkZGluZ1F1ZXVlVXJsOiBwcm9jZXNzaW5nU3RhY2sucHJvZmlsZUVtYmVkZGluZ1F1ZXVlLnF1ZXVlVXJsLFxuICB3ZWJTY3JhcGluZ1F1ZXVlVXJsOiBwcm9jZXNzaW5nU3RhY2sud2ViU2NyYXBpbmdRdWV1ZS5xdWV1ZVVybCxcbn0pO1xuXG4vLyBEZXBsb3kgd2ViIGFwcGxpY2F0aW9uXG5uZXcgV2ViQXBwU3RhY2soYXBwLCAnR292Qml6QUlXZWJBcHBTdGFjaycsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogYWNjb3VudCxcbiAgICByZWdpb246IHJlZ2lvbixcbiAgfSxcbiAgZGVzY3JpcHRpb246ICdHb3ZCaXpBSSBXZWIgQXBwbGljYXRpb24gLSBSZWFjdCBmcm9udGVuZCB3aXRoIENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIGFuZCBTMyBob3N0aW5nJyxcbiAgdGFnczoge1xuICAgIFByb2plY3Q6ICdnb3ZiaXphaScsXG4gICAgRW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgIFBoYXNlOiAnd2ViLWFwcGxpY2F0aW9uJyxcbiAgfSxcbn0pOyJdfQ==