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
// Deploy API Gateway stack (depends on infrastructure)
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
});
// Deploy web application - temporarily commented out for VPC deployment
// new WebAppStack(app, 'GovBizAIWebAppStack', {
//   env: {
//     account: account,
//     region: region,
//   },
//   description: 'GovBizAI Web Application - React frontend with CloudFront distribution and S3 hosting',
//   tags: {
//     Project: 'govbizai',
//     Environment: 'dev',
//     Phase: 'web-application',
//   },
// });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmZyYXN0cnVjdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlEQUFtQztBQUNuQyxzRUFBa0U7QUFDbEUsZ0RBQTRDO0FBRzVDLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLCtDQUErQztBQUMvQyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO0FBQ3JGLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksV0FBVyxDQUFDO0FBRWpHLG1DQUFtQztBQUNuQyxNQUFNLFVBQVUsR0FBRyxJQUFJLDBDQUFtQixDQUFDLEdBQUcsRUFBRSw2QkFBNkIsRUFBRTtJQUM3RSxHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsT0FBTztRQUNoQixNQUFNLEVBQUUsTUFBTTtLQUNmO0lBQ0QsV0FBVyxFQUFFLHlGQUF5RjtJQUN0RyxJQUFJLEVBQUU7UUFDSixPQUFPLEVBQUUsVUFBVTtRQUNuQixXQUFXLEVBQUUsS0FBSztRQUNsQixLQUFLLEVBQUUscUJBQXFCO0tBQzdCO0NBQ0YsQ0FBQyxDQUFDO0FBRUgsdURBQXVEO0FBQ3ZELElBQUksb0JBQVEsQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLEVBQUU7SUFDcEMsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLE9BQU87UUFDaEIsTUFBTSxFQUFFLE1BQU07S0FDZjtJQUNELFdBQVcsRUFBRSw0REFBNEQ7SUFDekUsSUFBSSxFQUFFO1FBQ0osT0FBTyxFQUFFLFVBQVU7UUFDbkIsV0FBVyxFQUFFLEtBQUs7UUFDbEIsS0FBSyxFQUFFLGFBQWE7S0FDckI7SUFDRCxRQUFRLEVBQUUsVUFBVSxDQUFDLFFBQVE7SUFDN0IsY0FBYyxFQUFFLFVBQVUsQ0FBQyxjQUFjO0lBQ3pDLGNBQWMsRUFBRSxVQUFVLENBQUMsY0FBYztJQUN6QyxrQkFBa0IsRUFBRSxVQUFVLENBQUMsa0JBQWtCO0lBQ2pELFlBQVksRUFBRSxVQUFVLENBQUMsWUFBWTtJQUNyQyxhQUFhLEVBQUUsVUFBVSxDQUFDLGFBQWE7SUFDdkMsY0FBYyxFQUFFLFVBQVUsQ0FBQyxpQkFBaUIsRUFBRSxpREFBaUQ7SUFDL0YsZUFBZSxFQUFFLFVBQVUsQ0FBQyxrQkFBa0I7SUFDOUMsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLGdCQUFnQjtDQUM5QyxDQUFDLENBQUM7QUFFSCx3RUFBd0U7QUFDeEUsZ0RBQWdEO0FBQ2hELFdBQVc7QUFDWCx3QkFBd0I7QUFDeEIsc0JBQXNCO0FBQ3RCLE9BQU87QUFDUCwwR0FBMEc7QUFDMUcsWUFBWTtBQUNaLDJCQUEyQjtBQUMzQiwwQkFBMEI7QUFDMUIsZ0NBQWdDO0FBQ2hDLE9BQU87QUFDUCxNQUFNIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IEluZnJhc3RydWN0dXJlU3RhY2sgfSBmcm9tICcuLi9saWIvaW5mcmFzdHJ1Y3R1cmUtc3RhY2snO1xuaW1wb3J0IHsgQXBpU3RhY2sgfSBmcm9tICcuLi9saWIvYXBpLXN0YWNrJztcbmltcG9ydCB7IFdlYkFwcFN0YWNrIH0gZnJvbSAnLi4vbGliL3dlYi1hcHAtc3RhY2snO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG4vLyBHZXQgZW52aXJvbm1lbnQgZnJvbSBjb250ZXh0IG9yIHVzZSBkZWZhdWx0c1xuY29uc3QgYWNjb3VudCA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2FjY291bnQnKSB8fCBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UO1xuY29uc3QgcmVnaW9uID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgncmVnaW9uJykgfHwgcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnO1xuXG4vLyBEZXBsb3kgY29yZSBpbmZyYXN0cnVjdHVyZSBmaXJzdFxuY29uc3QgaW5mcmFTdGFjayA9IG5ldyBJbmZyYXN0cnVjdHVyZVN0YWNrKGFwcCwgJ0dvdkJpekFJSW5mcmFzdHJ1Y3R1cmVTdGFjaycsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogYWNjb3VudCxcbiAgICByZWdpb246IHJlZ2lvbixcbiAgfSxcbiAgZGVzY3JpcHRpb246ICdHb3ZCaXpBSSBJbmZyYXN0cnVjdHVyZSAtIENvcmUgY29tcG9uZW50cyBpbmNsdWRpbmcgVlBDLCBTMywgRHluYW1vREIsIExhbWJkYSBmdW5jdGlvbnMnLFxuICB0YWdzOiB7XG4gICAgUHJvamVjdDogJ2dvdmJpemFpJyxcbiAgICBFbnZpcm9ubWVudDogJ2RldicsXG4gICAgUGhhc2U6ICdjb3JlLWluZnJhc3RydWN0dXJlJyxcbiAgfSxcbn0pO1xuXG4vLyBEZXBsb3kgQVBJIEdhdGV3YXkgc3RhY2sgKGRlcGVuZHMgb24gaW5mcmFzdHJ1Y3R1cmUpXG5uZXcgQXBpU3RhY2soYXBwLCAnR292Qml6QUlBcGlTdGFjaycsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudDogYWNjb3VudCxcbiAgICByZWdpb246IHJlZ2lvbixcbiAgfSxcbiAgZGVzY3JpcHRpb246ICdHb3ZCaXpBSSBBUEkgLSBSRVNUIGFuZCBXZWJTb2NrZXQgQVBJcyB3aXRoIGF1dGhlbnRpY2F0aW9uJyxcbiAgdGFnczoge1xuICAgIFByb2plY3Q6ICdnb3ZiaXphaScsXG4gICAgRW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgIFBoYXNlOiAnYXBpLWdhdGV3YXknLFxuICB9LFxuICB1c2VyUG9vbDogaW5mcmFTdGFjay51c2VyUG9vbCxcbiAgdXNlclBvb2xDbGllbnQ6IGluZnJhU3RhY2sudXNlclBvb2xDbGllbnQsXG4gIGNvbXBhbmllc1RhYmxlOiBpbmZyYVN0YWNrLmNvbXBhbmllc1RhYmxlLFxuICBvcHBvcnR1bml0aWVzVGFibGU6IGluZnJhU3RhY2sub3Bwb3J0dW5pdGllc1RhYmxlLFxuICBtYXRjaGVzVGFibGU6IGluZnJhU3RhY2subWF0Y2hlc1RhYmxlLFxuICBmZWVkYmFja1RhYmxlOiBpbmZyYVN0YWNrLmZlZWRiYWNrVGFibGUsXG4gIGRvY3VtZW50c1RhYmxlOiBpbmZyYVN0YWNrLnVzZXJQcm9maWxlc1RhYmxlLCAvLyBVc2luZyB1c2VyUHJvZmlsZXMgdGFibGUgZm9yIGRvY3VtZW50IG1ldGFkYXRhXG4gIGRvY3VtZW50c0J1Y2tldDogaW5mcmFTdGFjay5yYXdEb2N1bWVudHNCdWNrZXQsXG4gIGVtYmVkZGluZ3NCdWNrZXQ6IGluZnJhU3RhY2suZW1iZWRkaW5nc0J1Y2tldCxcbn0pO1xuXG4vLyBEZXBsb3kgd2ViIGFwcGxpY2F0aW9uIC0gdGVtcG9yYXJpbHkgY29tbWVudGVkIG91dCBmb3IgVlBDIGRlcGxveW1lbnRcbi8vIG5ldyBXZWJBcHBTdGFjayhhcHAsICdHb3ZCaXpBSVdlYkFwcFN0YWNrJywge1xuLy8gICBlbnY6IHtcbi8vICAgICBhY2NvdW50OiBhY2NvdW50LFxuLy8gICAgIHJlZ2lvbjogcmVnaW9uLFxuLy8gICB9LFxuLy8gICBkZXNjcmlwdGlvbjogJ0dvdkJpekFJIFdlYiBBcHBsaWNhdGlvbiAtIFJlYWN0IGZyb250ZW5kIHdpdGggQ2xvdWRGcm9udCBkaXN0cmlidXRpb24gYW5kIFMzIGhvc3RpbmcnLFxuLy8gICB0YWdzOiB7XG4vLyAgICAgUHJvamVjdDogJ2dvdmJpemFpJyxcbi8vICAgICBFbnZpcm9ubWVudDogJ2RldicsXG4vLyAgICAgUGhhc2U6ICd3ZWItYXBwbGljYXRpb24nLFxuLy8gICB9LFxuLy8gfSk7Il19