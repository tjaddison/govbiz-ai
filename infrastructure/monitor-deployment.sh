#!/bin/bash

echo "🔍 Monitoring Phase 7 Matching Engine Deployment"
echo "================================================"

while true; do
    STATUS=$(aws cloudformation describe-stacks --stack-name GovBizAIInfrastructureStack --query "Stacks[0].StackStatus" --output text)
    echo "$(date): Stack Status - $STATUS"

    if [ "$STATUS" = "UPDATE_COMPLETE" ]; then
        echo "✅ Deployment completed successfully!"
        echo
        echo "🧪 Running validation tests..."
        ./validate-matching-engine.sh
        break
    elif [ "$STATUS" = "UPDATE_FAILED" ] || [ "$STATUS" = "UPDATE_ROLLBACK_COMPLETE" ]; then
        echo "❌ Deployment failed with status: $STATUS"
        echo "📋 Recent failed events:"
        aws cloudformation describe-stack-events --stack-name GovBizAIInfrastructureStack \
            --query "StackEvents[?ResourceStatus=='CREATE_FAILED' || ResourceStatus=='UPDATE_FAILED'].{Time:Timestamp,Status:ResourceStatus,Resource:LogicalResourceId,Reason:ResourceStatusReason}" \
            --output table | head -20
        exit 1
    else
        echo "⏳ Deployment in progress... waiting 30 seconds"
        sleep 30
    fi
done