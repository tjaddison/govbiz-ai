#!/usr/bin/env python3
"""
Deploy API Gateway for GovBiz.ai web application
"""

import boto3
import json
import time

def create_api_gateway():
    """Create API Gateway REST API"""
    
    # Initialize AWS clients
    apigateway = boto3.client('apigateway', region_name='us-east-1')
    lambda_client = boto3.client('lambda', region_name='us-east-1')
    
    project_name = "govbiz-ai"
    environment = "dev"
    api_name = f"{project_name}-{environment}-api"
    lambda_function_name = f"{project_name}-{environment}-api"
    
    print(f"Creating API Gateway: {api_name}")
    
    # Create REST API
    try:
        api_response = apigateway.create_rest_api(
            name=api_name,
            description=f"REST API for {project_name} multi-agent system",
            endpointConfiguration={
                'types': ['REGIONAL']
            },
            tags={
                'Project': project_name,
                'Environment': environment,
                'ManagedBy': 'deployment-script'
            }
        )
        
        api_id = api_response['id']
        print(f"✓ Created REST API: {api_id}")
        
    except Exception as e:
        print(f"✗ Error creating API Gateway: {e}")
        return None
    
    # Get Lambda function ARN
    try:
        lambda_response = lambda_client.get_function(FunctionName=lambda_function_name)
        lambda_arn = lambda_response['Configuration']['FunctionArn']
        print(f"✓ Found Lambda function: {lambda_arn}")
    except Exception as e:
        print(f"✗ Error finding Lambda function: {e}")
        return None
    
    # Get root resource
    try:
        resources_response = apigateway.get_resources(restApiId=api_id)
        root_resource_id = None
        
        for resource in resources_response['items']:
            if resource['path'] == '/':
                root_resource_id = resource['id']
                break
        
        if not root_resource_id:
            print("✗ Could not find root resource")
            return None
        
        print(f"✓ Found root resource: {root_resource_id}")
        
    except Exception as e:
        print(f"✗ Error getting resources: {e}")
        return None
    
    # Create proxy resource
    try:
        proxy_resource_response = apigateway.create_resource(
            restApiId=api_id,
            parentId=root_resource_id,
            pathPart='{proxy+}'
        )
        
        proxy_resource_id = proxy_resource_response['id']
        print(f"✓ Created proxy resource: {proxy_resource_id}")
        
    except Exception as e:
        print(f"✗ Error creating proxy resource: {e}")
        return None
    
    # Create methods and integrations
    methods = [
        {'resource_id': root_resource_id, 'method': 'ANY'},
        {'resource_id': proxy_resource_id, 'method': 'ANY'}
    ]
    
    for method_config in methods:
        resource_id = method_config['resource_id']
        method = method_config['method']
        
        try:
            # Create method
            apigateway.put_method(
                restApiId=api_id,
                resourceId=resource_id,
                httpMethod=method,
                authorizationType='NONE',
                requestParameters={}
            )
            
            print(f"✓ Created method: {method} on resource {resource_id}")
            
            # Create integration
            integration_uri = f"arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/{lambda_arn}/invocations"
            
            apigateway.put_integration(
                restApiId=api_id,
                resourceId=resource_id,
                httpMethod=method,
                type='AWS_PROXY',
                integrationHttpMethod='POST',
                uri=integration_uri
            )
            
            print(f"✓ Created integration for method: {method}")
            
        except Exception as e:
            print(f"✗ Error creating method/integration: {e}")
            continue
    
    # Add Lambda permission for API Gateway
    try:
        source_arn = f"arn:aws:execute-api:us-east-1:927576824761:{api_id}/*/*"
        
        lambda_client.add_permission(
            FunctionName=lambda_function_name,
            StatementId=f'api-gateway-invoke-{int(time.time())}',
            Action='lambda:InvokeFunction',
            Principal='apigateway.amazonaws.com',
            SourceArn=source_arn
        )
        
        print("✓ Added Lambda permission for API Gateway")
        
    except Exception as e:
        if "ResourceConflictException" in str(e):
            print("✓ Lambda permission already exists")
        else:
            print(f"✗ Error adding Lambda permission: {e}")
    
    # Deploy API
    try:
        deployment_response = apigateway.create_deployment(
            restApiId=api_id,
            stageName=environment,
            description=f"Deployment for {project_name} {environment} environment"
        )
        
        deployment_id = deployment_response['id']
        print(f"✓ Created deployment: {deployment_id}")
        
    except Exception as e:
        print(f"✗ Error creating deployment: {e}")
        return None
    
    # Configure CORS
    try:
        # Add CORS to root resource
        apigateway.put_method(
            restApiId=api_id,
            resourceId=root_resource_id,
            httpMethod='OPTIONS',
            authorizationType='NONE'
        )
        
        apigateway.put_method_response(
            restApiId=api_id,
            resourceId=root_resource_id,
            httpMethod='OPTIONS',
            statusCode='200',
            responseParameters={
                'method.response.header.Access-Control-Allow-Headers': False,
                'method.response.header.Access-Control-Allow-Methods': False,
                'method.response.header.Access-Control-Allow-Origin': False
            }
        )
        
        apigateway.put_integration(
            restApiId=api_id,
            resourceId=root_resource_id,
            httpMethod='OPTIONS',
            type='MOCK',
            requestTemplates={
                'application/json': '{"statusCode": 200}'
            }
        )
        
        apigateway.put_integration_response(
            restApiId=api_id,
            resourceId=root_resource_id,
            httpMethod='OPTIONS',
            statusCode='200',
            responseParameters={
                'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                'method.response.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
                'method.response.header.Access-Control-Allow-Origin': "'*'"
            }
        )
        
        print("✓ Configured CORS")
        
    except Exception as e:
        print(f"⚠ Warning: CORS configuration failed: {e}")
    
    # Generate API URL
    api_url = f"https://{api_id}.execute-api.us-east-1.amazonaws.com/{environment}"
    
    print(f"\n✅ API Gateway deployed successfully!")
    print(f"API ID: {api_id}")
    print(f"API URL: {api_url}")
    
    return {
        'api_id': api_id,
        'api_url': api_url,
        'lambda_arn': lambda_arn
    }

if __name__ == "__main__":
    result = create_api_gateway()
    
    if result:
        print("\n" + "="*60)
        print("API GATEWAY DEPLOYMENT SUMMARY")
        print("="*60)
        print(f"API ID: {result['api_id']}")
        print(f"API URL: {result['api_url']}")
        print(f"Lambda Function: {result['lambda_arn']}")
        print("\nNext steps:")
        print("1. Test API endpoints")
        print("2. Deploy web application")
        print("3. Configure custom domain (optional)")
        print("4. Set up monitoring and logging")
    else:
        print("\n✗ API Gateway deployment failed!")