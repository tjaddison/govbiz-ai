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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmZyYXN0cnVjdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlEQUFtQztBQUNuQyxzRUFBa0U7QUFDbEUsZ0RBQTRDO0FBQzVDLHdEQUFtRDtBQUVuRCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQiwrQ0FBK0M7QUFDL0MsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztBQUNyRixNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVcsQ0FBQztBQUVqRyxtQ0FBbUM7QUFDbkMsTUFBTSxVQUFVLEdBQUcsSUFBSSwwQ0FBbUIsQ0FBQyxHQUFHLEVBQUUsNkJBQTZCLEVBQUU7SUFDN0UsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLE9BQU87UUFDaEIsTUFBTSxFQUFFLE1BQU07S0FDZjtJQUNELFdBQVcsRUFBRSx5RkFBeUY7SUFDdEcsSUFBSSxFQUFFO1FBQ0osT0FBTyxFQUFFLFVBQVU7UUFDbkIsV0FBVyxFQUFFLEtBQUs7UUFDbEIsS0FBSyxFQUFFLHFCQUFxQjtLQUM3QjtDQUNGLENBQUMsQ0FBQztBQUVILHVEQUF1RDtBQUN2RCxJQUFJLG9CQUFRLENBQUMsR0FBRyxFQUFFLGtCQUFrQixFQUFFO0lBQ3BDLEdBQUcsRUFBRTtRQUNILE9BQU8sRUFBRSxPQUFPO1FBQ2hCLE1BQU0sRUFBRSxNQUFNO0tBQ2Y7SUFDRCxXQUFXLEVBQUUsNERBQTREO0lBQ3pFLElBQUksRUFBRTtRQUNKLE9BQU8sRUFBRSxVQUFVO1FBQ25CLFdBQVcsRUFBRSxLQUFLO1FBQ2xCLEtBQUssRUFBRSxhQUFhO0tBQ3JCO0lBQ0QsUUFBUSxFQUFFLFVBQVUsQ0FBQyxRQUFRO0lBQzdCLGNBQWMsRUFBRSxVQUFVLENBQUMsY0FBYztJQUN6QyxjQUFjLEVBQUUsVUFBVSxDQUFDLGNBQWM7SUFDekMsa0JBQWtCLEVBQUUsVUFBVSxDQUFDLGtCQUFrQjtJQUNqRCxZQUFZLEVBQUUsVUFBVSxDQUFDLFlBQVk7SUFDckMsYUFBYSxFQUFFLFVBQVUsQ0FBQyxhQUFhO0lBQ3ZDLGNBQWMsRUFBRSxVQUFVLENBQUMsaUJBQWlCLEVBQUUsaURBQWlEO0lBQy9GLGVBQWUsRUFBRSxVQUFVLENBQUMsa0JBQWtCO0lBQzlDLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxnQkFBZ0I7Q0FDOUMsQ0FBQyxDQUFDO0FBRUgseUJBQXlCO0FBQ3pCLElBQUksMkJBQVcsQ0FBQyxHQUFHLEVBQUUscUJBQXFCLEVBQUU7SUFDMUMsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLE9BQU87UUFDaEIsTUFBTSxFQUFFLE1BQU07S0FDZjtJQUNELFdBQVcsRUFBRSx1RkFBdUY7SUFDcEcsSUFBSSxFQUFFO1FBQ0osT0FBTyxFQUFFLFVBQVU7UUFDbkIsV0FBVyxFQUFFLEtBQUs7UUFDbEIsS0FBSyxFQUFFLGlCQUFpQjtLQUN6QjtDQUNGLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBJbmZyYXN0cnVjdHVyZVN0YWNrIH0gZnJvbSAnLi4vbGliL2luZnJhc3RydWN0dXJlLXN0YWNrJztcbmltcG9ydCB7IEFwaVN0YWNrIH0gZnJvbSAnLi4vbGliL2FwaS1zdGFjayc7XG5pbXBvcnQgeyBXZWJBcHBTdGFjayB9IGZyb20gJy4uL2xpYi93ZWItYXBwLXN0YWNrJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gR2V0IGVudmlyb25tZW50IGZyb20gY29udGV4dCBvciB1c2UgZGVmYXVsdHNcbmNvbnN0IGFjY291bnQgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdhY2NvdW50JykgfHwgcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVDtcbmNvbnN0IHJlZ2lvbiA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ3JlZ2lvbicpIHx8IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJztcblxuLy8gRGVwbG95IGNvcmUgaW5mcmFzdHJ1Y3R1cmUgZmlyc3RcbmNvbnN0IGluZnJhU3RhY2sgPSBuZXcgSW5mcmFzdHJ1Y3R1cmVTdGFjayhhcHAsICdHb3ZCaXpBSUluZnJhc3RydWN0dXJlU3RhY2snLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQ6IGFjY291bnQsXG4gICAgcmVnaW9uOiByZWdpb24sXG4gIH0sXG4gIGRlc2NyaXB0aW9uOiAnR292Qml6QUkgSW5mcmFzdHJ1Y3R1cmUgLSBDb3JlIGNvbXBvbmVudHMgaW5jbHVkaW5nIFZQQywgUzMsIER5bmFtb0RCLCBMYW1iZGEgZnVuY3Rpb25zJyxcbiAgdGFnczoge1xuICAgIFByb2plY3Q6ICdnb3ZiaXphaScsXG4gICAgRW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgIFBoYXNlOiAnY29yZS1pbmZyYXN0cnVjdHVyZScsXG4gIH0sXG59KTtcblxuLy8gRGVwbG95IEFQSSBHYXRld2F5IHN0YWNrIChkZXBlbmRzIG9uIGluZnJhc3RydWN0dXJlKVxubmV3IEFwaVN0YWNrKGFwcCwgJ0dvdkJpekFJQXBpU3RhY2snLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQ6IGFjY291bnQsXG4gICAgcmVnaW9uOiByZWdpb24sXG4gIH0sXG4gIGRlc2NyaXB0aW9uOiAnR292Qml6QUkgQVBJIC0gUkVTVCBhbmQgV2ViU29ja2V0IEFQSXMgd2l0aCBhdXRoZW50aWNhdGlvbicsXG4gIHRhZ3M6IHtcbiAgICBQcm9qZWN0OiAnZ292Yml6YWknLFxuICAgIEVudmlyb25tZW50OiAnZGV2JyxcbiAgICBQaGFzZTogJ2FwaS1nYXRld2F5JyxcbiAgfSxcbiAgdXNlclBvb2w6IGluZnJhU3RhY2sudXNlclBvb2wsXG4gIHVzZXJQb29sQ2xpZW50OiBpbmZyYVN0YWNrLnVzZXJQb29sQ2xpZW50LFxuICBjb21wYW5pZXNUYWJsZTogaW5mcmFTdGFjay5jb21wYW5pZXNUYWJsZSxcbiAgb3Bwb3J0dW5pdGllc1RhYmxlOiBpbmZyYVN0YWNrLm9wcG9ydHVuaXRpZXNUYWJsZSxcbiAgbWF0Y2hlc1RhYmxlOiBpbmZyYVN0YWNrLm1hdGNoZXNUYWJsZSxcbiAgZmVlZGJhY2tUYWJsZTogaW5mcmFTdGFjay5mZWVkYmFja1RhYmxlLFxuICBkb2N1bWVudHNUYWJsZTogaW5mcmFTdGFjay51c2VyUHJvZmlsZXNUYWJsZSwgLy8gVXNpbmcgdXNlclByb2ZpbGVzIHRhYmxlIGZvciBkb2N1bWVudCBtZXRhZGF0YVxuICBkb2N1bWVudHNCdWNrZXQ6IGluZnJhU3RhY2sucmF3RG9jdW1lbnRzQnVja2V0LFxuICBlbWJlZGRpbmdzQnVja2V0OiBpbmZyYVN0YWNrLmVtYmVkZGluZ3NCdWNrZXQsXG59KTtcblxuLy8gRGVwbG95IHdlYiBhcHBsaWNhdGlvblxubmV3IFdlYkFwcFN0YWNrKGFwcCwgJ0dvdkJpekFJV2ViQXBwU3RhY2snLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQ6IGFjY291bnQsXG4gICAgcmVnaW9uOiByZWdpb24sXG4gIH0sXG4gIGRlc2NyaXB0aW9uOiAnR292Qml6QUkgV2ViIEFwcGxpY2F0aW9uIC0gUmVhY3QgZnJvbnRlbmQgd2l0aCBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBhbmQgUzMgaG9zdGluZycsXG4gIHRhZ3M6IHtcbiAgICBQcm9qZWN0OiAnZ292Yml6YWknLFxuICAgIEVudmlyb25tZW50OiAnZGV2JyxcbiAgICBQaGFzZTogJ3dlYi1hcHBsaWNhdGlvbicsXG4gIH0sXG59KTsiXX0=