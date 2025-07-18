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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const govbiz_ai_infrastructure_stack_1 = require("../lib/govbiz-ai-infrastructure-stack");
const app = new cdk.App();
// Get environment configuration
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';
const stage = process.env.STAGE || 'dev';
new govbiz_ai_infrastructure_stack_1.GovBizAiInfrastructureStack(app, `GovBizAi-${stage}`, {
    env: {
        account,
        region,
    },
    stage,
    description: `GovBiz.ai Infrastructure Stack for ${stage} environment`,
    tags: {
        Project: 'GovBiz.ai',
        Environment: stage,
        ManagedBy: 'CDK',
        Purpose: 'Government Contracting Automation'
    }
});
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ292Yml6LWFpLWluZnJhc3RydWN0dXJlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ292Yml6LWFpLWluZnJhc3RydWN0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLHVDQUFxQztBQUNyQyxpREFBbUM7QUFDbkMsMEZBQW9GO0FBRXBGLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLGdDQUFnQztBQUNoQyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO0FBQ2hELE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksV0FBVyxDQUFDO0FBQzdELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQztBQUV6QyxJQUFJLDREQUEyQixDQUFDLEdBQUcsRUFBRSxZQUFZLEtBQUssRUFBRSxFQUFFO0lBQ3hELEdBQUcsRUFBRTtRQUNILE9BQU87UUFDUCxNQUFNO0tBQ1A7SUFDRCxLQUFLO0lBQ0wsV0FBVyxFQUFFLHNDQUFzQyxLQUFLLGNBQWM7SUFDdEUsSUFBSSxFQUFFO1FBQ0osT0FBTyxFQUFFLFdBQVc7UUFDcEIsV0FBVyxFQUFFLEtBQUs7UUFDbEIsU0FBUyxFQUFFLEtBQUs7UUFDaEIsT0FBTyxFQUFFLG1DQUFtQztLQUM3QztDQUNGLENBQUMsQ0FBQztBQUVILEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBHb3ZCaXpBaUluZnJhc3RydWN0dXJlU3RhY2sgfSBmcm9tICcuLi9saWIvZ292Yml6LWFpLWluZnJhc3RydWN0dXJlLXN0YWNrJztcblxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcblxuLy8gR2V0IGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbmNvbnN0IGFjY291bnQgPSBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UO1xuY29uc3QgcmVnaW9uID0gcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnO1xuY29uc3Qgc3RhZ2UgPSBwcm9jZXNzLmVudi5TVEFHRSB8fCAnZGV2JztcblxubmV3IEdvdkJpekFpSW5mcmFzdHJ1Y3R1cmVTdGFjayhhcHAsIGBHb3ZCaXpBaS0ke3N0YWdlfWAsIHtcbiAgZW52OiB7XG4gICAgYWNjb3VudCxcbiAgICByZWdpb24sXG4gIH0sXG4gIHN0YWdlLFxuICBkZXNjcmlwdGlvbjogYEdvdkJpei5haSBJbmZyYXN0cnVjdHVyZSBTdGFjayBmb3IgJHtzdGFnZX0gZW52aXJvbm1lbnRgLFxuICB0YWdzOiB7XG4gICAgUHJvamVjdDogJ0dvdkJpei5haScsXG4gICAgRW52aXJvbm1lbnQ6IHN0YWdlLFxuICAgIE1hbmFnZWRCeTogJ0NESycsXG4gICAgUHVycG9zZTogJ0dvdmVybm1lbnQgQ29udHJhY3RpbmcgQXV0b21hdGlvbidcbiAgfVxufSk7XG5cbmFwcC5zeW50aCgpOyJdfQ==