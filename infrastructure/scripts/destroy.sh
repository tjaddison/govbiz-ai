#!/bin/bash

# GovBiz.ai Infrastructure Destruction Script
# This script destroys the AWS infrastructure using CDK

set -e

# Configuration
STAGE=${1:-dev}
REGION=${2:-us-east-1}
PROFILE=${3:-default}

echo "🔥 Destroying GovBiz.ai infrastructure..."
echo "Stage: $STAGE"
echo "Region: $REGION"
echo "Profile: $PROFILE"

# Validate inputs
if [ "$STAGE" != "dev" ] && [ "$STAGE" != "staging" ] && [ "$STAGE" != "prod" ]; then
    echo "❌ Invalid stage. Must be dev, staging, or prod"
    exit 1
fi

# Production safety check
if [ "$STAGE" = "prod" ]; then
    echo "⚠️  WARNING: You are about to destroy the PRODUCTION environment!"
    echo "This action is IRREVERSIBLE and will delete all data."
    echo ""
    read -p "Type 'DESTROY PRODUCTION' to confirm: " confirmation
    if [ "$confirmation" != "DESTROY PRODUCTION" ]; then
        echo "❌ Destruction cancelled"
        exit 1
    fi
fi

# Set environment variables
export AWS_PROFILE=$PROFILE
export AWS_DEFAULT_REGION=$REGION
export CDK_DEFAULT_REGION=$REGION
export STAGE=$STAGE

# Check AWS CLI configuration
echo "📋 Checking AWS CLI configuration..."
aws sts get-caller-identity --profile $PROFILE > /dev/null
if [ $? -ne 0 ]; then
    echo "❌ AWS CLI not configured properly"
    exit 1
fi

# Empty S3 buckets first (CDK can't delete non-empty buckets)
echo "🗑️  Emptying S3 buckets..."
BUCKET_NAME="govbiz-documents-$STAGE-$(aws sts get-caller-identity --query Account --output text --profile $PROFILE)"
aws s3 rm s3://$BUCKET_NAME --recursive --profile $PROFILE 2>/dev/null || echo "Bucket $BUCKET_NAME not found or already empty"

# Destroy the stack
echo "🔥 Destroying infrastructure stack..."
npx cdk destroy GovBizAi-$STAGE \
    --force \
    --profile $PROFILE \
    --region $REGION

# Clean up local files
echo "🧹 Cleaning up local files..."
rm -f outputs-$STAGE.json
rm -f ../web/.env.local

echo ""
echo "✅ Infrastructure destruction completed!"
echo ""
echo "🗑️  Cleanup Summary:"
echo "  - CloudFormation stack deleted"
echo "  - S3 buckets emptied and deleted"
echo "  - DynamoDB tables deleted (if not retained)"
echo "  - Lambda functions deleted"
echo "  - API Gateway deleted"
echo "  - EventBridge rules deleted"
echo "  - SQS queues deleted"
echo "  - SNS topics deleted"
echo ""

if [ "$STAGE" = "prod" ]; then
    echo "⚠️  PRODUCTION ENVIRONMENT DESTROYED"
    echo "Please ensure you have backups if you need to restore data."
fi

echo "🎉 GovBiz.ai infrastructure destruction complete!"