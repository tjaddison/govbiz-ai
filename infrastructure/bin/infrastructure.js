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
const web_app_stack_1 = require("../lib/web-app-stack");
const app = new cdk.App();
// Get environment from context or use defaults
const account = app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || 'us-east-1';
// Deploy core infrastructure first
new infrastructure_stack_1.InfrastructureStack(app, 'GovBizAIInfrastructureStack', {
    env: {
        account: account,
        region: region,
    },
    description: 'GovBizAI Infrastructure - Core components including VPC, S3, DynamoDB, Lambda functions, and API Gateway',
    tags: {
        Project: 'govbizai',
        Environment: 'dev',
        Phase: 'core-infrastructure',
    },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmZyYXN0cnVjdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlEQUFtQztBQUNuQyxzRUFBa0U7QUFDbEUsd0RBQW1EO0FBRW5ELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLCtDQUErQztBQUMvQyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO0FBQ3JGLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksV0FBVyxDQUFDO0FBRWpHLG1DQUFtQztBQUNuQyxJQUFJLDBDQUFtQixDQUFDLEdBQUcsRUFBRSw2QkFBNkIsRUFBRTtJQUMxRCxHQUFHLEVBQUU7UUFDSCxPQUFPLEVBQUUsT0FBTztRQUNoQixNQUFNLEVBQUUsTUFBTTtLQUNmO0lBQ0QsV0FBVyxFQUFFLDBHQUEwRztJQUN2SCxJQUFJLEVBQUU7UUFDSixPQUFPLEVBQUUsVUFBVTtRQUNuQixXQUFXLEVBQUUsS0FBSztRQUNsQixLQUFLLEVBQUUscUJBQXFCO0tBQzdCO0NBQ0YsQ0FBQyxDQUFDO0FBRUgseUJBQXlCO0FBQ3pCLElBQUksMkJBQVcsQ0FBQyxHQUFHLEVBQUUscUJBQXFCLEVBQUU7SUFDMUMsR0FBRyxFQUFFO1FBQ0gsT0FBTyxFQUFFLE9BQU87UUFDaEIsTUFBTSxFQUFFLE1BQU07S0FDZjtJQUNELFdBQVcsRUFBRSx1RkFBdUY7SUFDcEcsSUFBSSxFQUFFO1FBQ0osT0FBTyxFQUFFLFVBQVU7UUFDbkIsV0FBVyxFQUFFLEtBQUs7UUFDbEIsS0FBSyxFQUFFLGlCQUFpQjtLQUN6QjtDQUNGLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBJbmZyYXN0cnVjdHVyZVN0YWNrIH0gZnJvbSAnLi4vbGliL2luZnJhc3RydWN0dXJlLXN0YWNrJztcbmltcG9ydCB7IFdlYkFwcFN0YWNrIH0gZnJvbSAnLi4vbGliL3dlYi1hcHAtc3RhY2snO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG4vLyBHZXQgZW52aXJvbm1lbnQgZnJvbSBjb250ZXh0IG9yIHVzZSBkZWZhdWx0c1xuY29uc3QgYWNjb3VudCA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2FjY291bnQnKSB8fCBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UO1xuY29uc3QgcmVnaW9uID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgncmVnaW9uJykgfHwgcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnO1xuXG4vLyBEZXBsb3kgY29yZSBpbmZyYXN0cnVjdHVyZSBmaXJzdFxubmV3IEluZnJhc3RydWN0dXJlU3RhY2soYXBwLCAnR292Qml6QUlJbmZyYXN0cnVjdHVyZVN0YWNrJywge1xuICBlbnY6IHtcbiAgICBhY2NvdW50OiBhY2NvdW50LFxuICAgIHJlZ2lvbjogcmVnaW9uLFxuICB9LFxuICBkZXNjcmlwdGlvbjogJ0dvdkJpekFJIEluZnJhc3RydWN0dXJlIC0gQ29yZSBjb21wb25lbnRzIGluY2x1ZGluZyBWUEMsIFMzLCBEeW5hbW9EQiwgTGFtYmRhIGZ1bmN0aW9ucywgYW5kIEFQSSBHYXRld2F5JyxcbiAgdGFnczoge1xuICAgIFByb2plY3Q6ICdnb3ZiaXphaScsXG4gICAgRW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgIFBoYXNlOiAnY29yZS1pbmZyYXN0cnVjdHVyZScsXG4gIH0sXG59KTtcblxuLy8gRGVwbG95IHdlYiBhcHBsaWNhdGlvblxubmV3IFdlYkFwcFN0YWNrKGFwcCwgJ0dvdkJpekFJV2ViQXBwU3RhY2snLCB7XG4gIGVudjoge1xuICAgIGFjY291bnQ6IGFjY291bnQsXG4gICAgcmVnaW9uOiByZWdpb24sXG4gIH0sXG4gIGRlc2NyaXB0aW9uOiAnR292Qml6QUkgV2ViIEFwcGxpY2F0aW9uIC0gUmVhY3QgZnJvbnRlbmQgd2l0aCBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBhbmQgUzMgaG9zdGluZycsXG4gIHRhZ3M6IHtcbiAgICBQcm9qZWN0OiAnZ292Yml6YWknLFxuICAgIEVudmlyb25tZW50OiAnZGV2JyxcbiAgICBQaGFzZTogJ3dlYi1hcHBsaWNhdGlvbicsXG4gIH0sXG59KTsiXX0=