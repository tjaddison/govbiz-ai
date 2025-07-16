"""
Lambda API Server for GovBiz.ai
FastAPI-based API server running on AWS Lambda
"""

import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum
import boto3
from botocore.exceptions import ClientError

from ..core.config import config
from ..utils.logger import get_logger

# Configure logging for Lambda
logging.basicConfig(level=logging.INFO)
logger = get_logger("api_lambda")

# Create FastAPI app
app = FastAPI(
    title="GovBiz.ai API",
    description="Multi-Agent Government Contracting Platform API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DynamoDB resources
dynamodb = boto3.resource('dynamodb', region_name=config.aws.region)
opportunities_table = dynamodb.Table(config.get_table_name("opportunities"))
companies_table = dynamodb.Table(config.get_table_name("companies"))
responses_table = dynamodb.Table(config.get_table_name("responses"))
contacts_table = dynamodb.Table(config.get_table_name("contacts"))

# SQS client for agent communication
sqs = boto3.client('sqs', region_name=config.aws.region)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "govbiz-ai-api",
        "version": "1.0.0"
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "GovBiz.ai Multi-Agent Government Contracting Platform",
        "documentation": "/docs",
        "health": "/health"
    }


@app.get("/opportunities")
async def get_opportunities(
    limit: int = 50,
    offset: int = 0,
    priority: Optional[str] = None,
    agency: Optional[str] = None,
    status: Optional[str] = None
):
    """Get opportunities with filtering and pagination"""
    
    try:
        # Build scan parameters
        scan_params = {
            'Limit': min(limit, 100),  # Cap at 100
        }
        
        # Add filters
        filter_expressions = []
        expression_values = {}
        
        if priority:
            filter_expressions.append("priority = :priority")
            expression_values[":priority"] = priority
        
        if agency:
            filter_expressions.append("contains(agency, :agency)")
            expression_values[":agency"] = agency
        
        if status:
            filter_expressions.append("#status = :status")
            expression_values[":status"] = status
            scan_params['ExpressionAttributeNames'] = {"#status": "status"}
        
        if filter_expressions:
            scan_params['FilterExpression'] = " AND ".join(filter_expressions)
            scan_params['ExpressionAttributeValues'] = expression_values
        
        # Perform scan
        response = opportunities_table.scan(**scan_params)
        
        # Sort by match score if available
        items = response.get('Items', [])
        items.sort(key=lambda x: x.get('match_score', 0), reverse=True)
        
        # Apply offset
        items = items[offset:offset + limit]
        
        return {
            "opportunities": items,
            "count": len(items),
            "total_scanned": response.get('ScannedCount', 0),
            "pagination": {
                "limit": limit,
                "offset": offset,
                "has_more": len(items) == limit
            }
        }
        
    except ClientError as e:
        logger.error(f"DynamoDB error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error"
        )
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@app.get("/opportunities/{opportunity_id}")
async def get_opportunity(opportunity_id: str):
    """Get specific opportunity by ID"""
    
    try:
        response = opportunities_table.get_item(Key={'id': opportunity_id})
        
        if 'Item' not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Opportunity not found"
            )
        
        return response['Item']
        
    except ClientError as e:
        logger.error(f"DynamoDB error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error"
        )


@app.post("/opportunities/{opportunity_id}/analyze")
async def trigger_analysis(opportunity_id: str, request: Request):
    """Trigger analysis for an opportunity"""
    
    try:
        # Check if opportunity exists
        response = opportunities_table.get_item(Key={'id': opportunity_id})
        
        if 'Item' not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Opportunity not found"
            )
        
        # Send message to analyzer queue
        analyzer_queue_url = config.get_queue_url("analyzer-queue")
        
        message = {
            "action": "analyze_opportunity",
            "opportunity_id": opportunity_id,
            "triggered_by": "api",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        sqs.send_message(
            QueueUrl=analyzer_queue_url,
            MessageBody=json.dumps(message)
        )
        
        return {
            "success": True,
            "message": "Analysis triggered successfully",
            "opportunity_id": opportunity_id
        }
        
    except ClientError as e:
        logger.error(f"AWS error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AWS service error"
        )
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@app.post("/opportunities/{opportunity_id}/generate-response")
async def trigger_response_generation(opportunity_id: str, request: Request):
    """Trigger response generation for an opportunity"""
    
    try:
        # Check if opportunity exists
        response = opportunities_table.get_item(Key={'id': opportunity_id})
        
        if 'Item' not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Opportunity not found"
            )
        
        # Send message to response generator queue
        response_queue_url = config.get_queue_url("response-generator-queue")
        
        message = {
            "action": "generate_response",
            "opportunity_id": opportunity_id,
            "triggered_by": "api",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        sqs.send_message(
            QueueUrl=response_queue_url,
            MessageBody=json.dumps(message)
        )
        
        return {
            "success": True,
            "message": "Response generation triggered successfully",
            "opportunity_id": opportunity_id
        }
        
    except ClientError as e:
        logger.error(f"AWS error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AWS service error"
        )
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


@app.get("/responses")
async def get_responses(limit: int = 50, offset: int = 0):
    """Get generated responses with pagination"""
    
    try:
        response = responses_table.scan(Limit=min(limit, 100))
        
        items = response.get('Items', [])
        items = items[offset:offset + limit]
        
        return {
            "responses": items,
            "count": len(items),
            "pagination": {
                "limit": limit,
                "offset": offset,
                "has_more": len(items) == limit
            }
        }
        
    except ClientError as e:
        logger.error(f"DynamoDB error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error"
        )


@app.get("/responses/{response_id}")
async def get_response(response_id: str):
    """Get specific response by ID"""
    
    try:
        response = responses_table.get_item(Key={'id': response_id})
        
        if 'Item' not in response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Response not found"
            )
        
        return response['Item']
        
    except ClientError as e:
        logger.error(f"DynamoDB error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error"
        )


@app.get("/contacts")
async def get_contacts(limit: int = 50, offset: int = 0, agency: Optional[str] = None):
    """Get contacts with filtering and pagination"""
    
    try:
        scan_params = {'Limit': min(limit, 100)}
        
        if agency:
            scan_params['FilterExpression'] = "contains(agency, :agency)"
            scan_params['ExpressionAttributeValues'] = {":agency": agency}
        
        response = contacts_table.scan(**scan_params)
        
        items = response.get('Items', [])
        items = items[offset:offset + limit]
        
        return {
            "contacts": items,
            "count": len(items),
            "pagination": {
                "limit": limit,
                "offset": offset,
                "has_more": len(items) == limit
            }
        }
        
    except ClientError as e:
        logger.error(f"DynamoDB error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error"
        )


@app.get("/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics"""
    
    try:
        # Get recent opportunities count
        recent_opps_response = opportunities_table.scan(
            FilterExpression="created_at > :date",
            ExpressionAttributeValues={
                ":date": (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            },
            Select='COUNT'
        )
        
        # Get high priority opportunities
        high_priority_response = opportunities_table.scan(
            FilterExpression="priority = :priority",
            ExpressionAttributeValues={":priority": "HIGH"},
            Select='COUNT'
        )
        
        # Get total responses
        responses_response = responses_table.scan(Select='COUNT')
        
        return {
            "recent_opportunities": recent_opps_response.get('Count', 0),
            "high_priority_opportunities": high_priority_response.get('Count', 0),
            "total_responses": responses_response.get('Count', 0),
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
        
    except ClientError as e:
        logger.error(f"DynamoDB error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error"
        )


@app.post("/agents/trigger-discovery")
async def trigger_discovery():
    """Manually trigger opportunity discovery"""
    
    try:
        # Send message to opportunity finder queue
        finder_queue_url = config.get_queue_url("opportunity-finder-queue")
        
        message = {
            "action": "discover_opportunities",
            "triggered_by": "api",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        sqs.send_message(
            QueueUrl=finder_queue_url,
            MessageBody=json.dumps(message)
        )
        
        return {
            "success": True,
            "message": "Discovery triggered successfully"
        }
        
    except ClientError as e:
        logger.error(f"AWS error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AWS service error"
        )


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "status_code": 500,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    )


# Lambda handler
handler = Mangum(app, lifespan="off")


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """AWS Lambda handler"""
    logger.info(f"API Lambda invoked - Request ID: {context.aws_request_id}")
    
    try:
        # Use Mangum to handle the Lambda event
        return handler(event, context)
        
    except Exception as e:
        logger.error(f"Error in API Lambda handler: {e}", exc_info=True)
        
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": "Internal server error",
                "request_id": context.aws_request_id,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }),
            "headers": {
                "Content-Type": "application/json"
            }
        }


# For testing locally
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)