/**
 * API Documentation Generator
 * 
 * Generates comprehensive API documentation in multiple formats:
 * OpenAPI/Swagger, Postman collections, Markdown, and interactive docs
 */

import { logger } from '@/lib/monitoring/logger'

export interface ApiEndpoint {
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  summary: string
  description: string
  tags: string[]
  security?: any[]
  parameters?: Parameter[]
  requestBody?: RequestBody
  responses: Record<string, Response>
  examples: Example[]
  deprecated?: boolean
}

export interface Parameter {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  description: string
  required: boolean
  schema: Schema
  example?: any
}

export interface RequestBody {
  description: string
  required: boolean
  content: Record<string, MediaType>
}

export interface MediaType {
  schema: Schema
  examples?: Record<string, Example>
}

export interface Response {
  description: string
  headers?: Record<string, Header>
  content?: Record<string, MediaType>
}

export interface Header {
  description: string
  schema: Schema
}

export interface Schema {
  type?: string
  format?: string
  properties?: Record<string, Schema>
  items?: Schema
  required?: string[]
  enum?: any[]
  example?: any
  description?: string
  $ref?: string
  nullable?: boolean
  allOf?: Schema[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
}

export interface Example {
  summary: string
  description: string
  value: any
}

export interface SecurityRequirement {
  type: 'apiKey' | 'oauth2' | 'openIdConnect'
  name: string
  in?: 'header' | 'query' | 'cookie'
  scheme?: string
  flows?: Record<string, any>
}

export interface OpenApiSpec {
  openapi: string
  info: {
    title: string
    description: string
    version: string
    contact?: {
      name: string
      url: string
      email: string
    }
    license?: {
      name: string
      url: string
    }
  }
  servers: Array<{
    url: string
    description: string
  }>
  paths: Record<string, Record<string, any>>
  components: {
    schemas: Record<string, Schema>
    securitySchemes: Record<string, SecurityRequirement>
    responses: Record<string, Response>
    parameters: Record<string, Parameter>
    examples: Record<string, Example>
  }
  security: SecurityRequirement[]
  tags: Array<{
    name: string
    description: string
  }>
}

export class ApiDocumentation {
  private endpoints: Map<string, ApiEndpoint> = new Map()
  private schemas: Map<string, Schema> = new Map()
  private config: {
    enabled: boolean
    interactive: boolean
    generateExamples: boolean
    includeInternalEndpoints: boolean
  }

  constructor(config: any) {
    this.config = {
      enabled: true,
      interactive: true,
      generateExamples: true,
      includeInternalEndpoints: false,
      ...config
    }

    this.initializeEndpoints()
    this.initializeSchemas()
  }

  /**
   * Initialize documentation system
   */
  async initialize(): Promise<void> {
    try {
      if (!this.config.enabled) {
        logger.info('API documentation disabled')
        return
      }

      logger.info('API documentation system initialized successfully', {
        endpointsCount: this.endpoints.size,
        schemasCount: this.schemas.size,
        interactive: this.config.interactive
      })

    } catch (error) {
      logger.error('Failed to initialize API documentation system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate OpenAPI specification
   */
  async generateOpenApiSpec(): Promise<OpenApiSpec> {
    try {
      const spec: OpenApiSpec = {
        openapi: '3.0.3',
        info: {
          title: 'GovBiz.ai API',
          description: 'Government Contracting Automation Platform API',
          version: '1.0.0',
          contact: {
            name: 'GovBiz.ai Support',
            url: 'https://govbiz.ai/support',
            email: 'support@govbiz.ai'
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
          }
        },
        servers: [
          {
            url: 'https://api.govbiz.ai/v1',
            description: 'Production server'
          },
          {
            url: 'https://staging-api.govbiz.ai/v1',
            description: 'Staging server'
          },
          {
            url: 'http://localhost:3000/api',
            description: 'Development server'
          }
        ],
        paths: this.generatePaths(),
        components: {
          schemas: this.generateComponentSchemas(),
          securitySchemes: this.generateSecuritySchemes(),
          responses: this.generateComponentResponses(),
          parameters: this.generateComponentParameters(),
          examples: this.generateComponentExamples()
        },
        security: [
          { ApiKeyAuth: [] },
          { BearerAuth: [] }
        ] as any,
        tags: this.generateTags()
      }

      return spec

    } catch (error) {
      logger.error('Failed to generate OpenAPI specification', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate Postman collection
   */
  async generatePostmanCollection(): Promise<object> {
    try {
      const collection = {
        info: {
          _postman_id: 'govbiz-api-collection',
          name: 'GovBiz.ai API Collection',
          description: 'Complete API collection for GovBiz.ai platform',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
        },
        auth: {
          type: 'apikey',
          apikey: [
            {
              key: 'key',
              value: 'X-API-Key',
              type: 'string'
            },
            {
              key: 'value',
              value: '{{api_key}}',
              type: 'string'
            }
          ]
        },
        event: [
          {
            listen: 'prerequest',
            script: {
              type: 'text/javascript',
              exec: [
                '// Set base URL',
                'pm.globals.set("base_url", "https://api.govbiz.ai/v1");',
                '',
                '// Set API key if not already set',
                'if (!pm.globals.get("api_key")) {',
                '    pm.globals.set("api_key", "your-api-key-here");',
                '}'
              ]
            }
          }
        ],
        item: this.generatePostmanItems(),
        variable: [
          {
            key: 'base_url',
            value: 'https://api.govbiz.ai/v1',
            type: 'string'
          },
          {
            key: 'api_key',
            value: 'your-api-key-here',
            type: 'string'
          }
        ]
      }

      return collection

    } catch (error) {
      logger.error('Failed to generate Postman collection', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate Markdown documentation
   */
  async generateMarkdownDocs(): Promise<string> {
    try {
      let markdown = `# GovBiz.ai API Documentation

## Overview

The GovBiz.ai API provides programmatic access to government contracting automation features including Sources Sought opportunities, workflow automation, and document generation.

## Authentication

All API requests require authentication using an API key. Include your API key in the request header:

\`\`\`
X-API-Key: your-api-key-here
\`\`\`

## Base URL

\`\`\`
Production: https://api.govbiz.ai/v1
Staging: https://staging-api.govbiz.ai/v1
\`\`\`

## Rate Limiting

API requests are limited to 1000 requests per minute per API key. Rate limit information is included in response headers:

- \`X-RateLimit-Limit\`: Request limit per window
- \`X-RateLimit-Remaining\`: Remaining requests in current window
- \`X-RateLimit-Reset\`: Time when the rate limit resets

## Response Format

All API responses follow a consistent format:

\`\`\`json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "timestamp": "2023-12-07T10:30:00Z",
    "version": "1.0.0"
  }
}
\`\`\`

## Error Handling

Errors are returned with appropriate HTTP status codes and a consistent error format:

\`\`\`json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {}
  }
}
\`\`\`

## Endpoints

`

      // Group endpoints by tags
      const endpointsByTag = this.groupEndpointsByTag()

      for (const [tag, endpoints] of endpointsByTag) {
        markdown += `\n### ${tag}\n\n`

        for (const endpoint of endpoints) {
          markdown += this.generateEndpointMarkdown(endpoint)
        }
      }

      markdown += `
## SDKs and Libraries

Official SDKs are available for:

- [JavaScript/TypeScript](https://www.npmjs.com/package/@govbiz/api-client)
- [Python](https://pypi.org/project/govbiz-api/)
- [Java](https://mvnrepository.com/artifact/ai.govbiz/api-client)

## Webhooks

GovBiz.ai supports webhooks for real-time notifications. Configure webhook endpoints in your dashboard to receive events for:

- New Sources Sought opportunities
- Workflow completions
- Document generation
- System notifications

## Support

For API support and questions:

- Documentation: https://docs.govbiz.ai
- Support: support@govbiz.ai
- Status Page: https://status.govbiz.ai
`

      return markdown

    } catch (error) {
      logger.error('Failed to generate Markdown documentation', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate interactive documentation HTML
   */
  async generateInteractiveDocs(): Promise<string> {
    try {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GovBiz.ai API Documentation</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
    <style>
        html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }
        *, *:before, *:after {
            box-sizing: inherit;
        }
        body {
            margin:0;
            background: #fafafa;
        }
        .swagger-ui .topbar {
            background-color: #1f2937;
        }
        .swagger-ui .topbar .download-url-wrapper {
            display: none;
        }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            const ui = SwaggerUIBundle({
                url: '/api/docs/openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                tryItOutEnabled: true,
                requestInterceptor: function(request) {
                    // Add API key to requests
                    if (!request.headers['X-API-Key']) {
                        request.headers['X-API-Key'] = 'your-api-key-here';
                    }
                    return request;
                },
                responseInterceptor: function(response) {
                    // Log responses for debugging
                    console.log('API Response:', response);
                    return response;
                },
                onComplete: function() {
                    console.log('Swagger UI loaded successfully');
                },
                onFailure: function(error) {
                    console.error('Failed to load Swagger UI:', error);
                }
            });
            
            window.ui = ui;
        };
    </script>
</body>
</html>`

      return html

    } catch (error) {
      logger.error('Failed to generate interactive documentation', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Add endpoint to documentation
   */
  addEndpoint(endpoint: ApiEndpoint): void {
    const key = `${endpoint.method}_${endpoint.path}`
    this.endpoints.set(key, endpoint)
  }

  /**
   * Add schema to documentation
   */
  addSchema(name: string, schema: Schema): void {
    this.schemas.set(name, schema)
  }

  /**
   * Shutdown documentation system
   */
  async shutdown(): Promise<void> {
    try {
      this.endpoints.clear()
      this.schemas.clear()

      logger.info('API documentation system shutdown complete')

    } catch (error) {
      logger.error('API documentation shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private initializeEndpoints(): void {
    // Sources Sought endpoints
    this.addEndpoint({
      path: '/sources-sought',
      method: 'GET',
      summary: 'List Sources Sought opportunities',
      description: 'Retrieve a paginated list of Sources Sought opportunities based on filters',
      tags: ['Sources Sought'],
      security: [{ ApiKeyAuth: [] }],
      parameters: [
        {
          name: 'page',
          in: 'query',
          description: 'Page number for pagination',
          required: false,
          schema: { type: 'integer', example: 1 }
        },
        {
          name: 'limit',
          in: 'query',
          description: 'Number of items per page',
          required: false,
          schema: { type: 'integer', example: 20 }
        },
        {
          name: 'naics',
          in: 'query',
          description: 'Filter by NAICS code',
          required: false,
          schema: { type: 'string', example: '541511' }
        },
        {
          name: 'agency',
          in: 'query',
          description: 'Filter by agency',
          required: false,
          schema: { type: 'string', example: 'DOD' }
        }
      ],
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SourcesSoughtListResponse' }
            }
          }
        },
        '400': {
          description: 'Bad request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      },
      examples: [
        {
          summary: 'Basic request',
          description: 'Get first page of opportunities',
          value: { page: 1, limit: 20 }
        }
      ]
    })

    this.addEndpoint({
      path: '/sources-sought/{id}',
      method: 'GET',
      summary: 'Get Sources Sought opportunity',
      description: 'Retrieve details for a specific Sources Sought opportunity',
      tags: ['Sources Sought'],
      security: [{ ApiKeyAuth: [] }],
      parameters: [
        {
          name: 'id',
          in: 'path',
          description: 'Opportunity ID',
          required: true,
          schema: { type: 'string', example: 'ss_12345' }
        }
      ],
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SourcesSoughtResponse' }
            }
          }
        },
        '404': {
          description: 'Opportunity not found'
        }
      },
      examples: [
        {
          summary: 'Get opportunity details',
          description: 'Retrieve full details for opportunity',
          value: { id: 'ss_12345' }
        }
      ]
    })

    // Workflow endpoints
    this.addEndpoint({
      path: '/workflows',
      method: 'POST',
      summary: 'Create workflow',
      description: 'Create a new automated workflow for Sources Sought responses',
      tags: ['Workflows'],
      security: [{ ApiKeyAuth: [] }],
      requestBody: {
        description: 'Workflow configuration',
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateWorkflowRequest' }
          }
        }
      },
      responses: {
        '201': {
          description: 'Workflow created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WorkflowResponse' }
            }
          }
        },
        '400': {
          description: 'Invalid workflow configuration'
        }
      },
      examples: [
        {
          summary: 'Create response workflow',
          description: 'Create workflow for automated responses',
          value: {
            name: 'DOD Response Workflow',
            type: 'sources_sought_response',
            triggers: ['new_opportunity'],
            steps: [
              { type: 'analyze_requirements' },
              { type: 'generate_response' },
              { type: 'review_required' }
            ]
          }
        }
      ]
    })

    // User endpoints
    this.addEndpoint({
      path: '/users/profile',
      method: 'GET',
      summary: 'Get user profile',
      description: 'Retrieve the authenticated user\'s profile information',
      tags: ['Users'],
      security: [{ ApiKeyAuth: [] }],
      responses: {
        '200': {
          description: 'User profile retrieved successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserProfileResponse' }
            }
          }
        },
        '401': {
          description: 'Unauthorized'
        }
      },
      examples: [
        {
          summary: 'Get profile',
          description: 'Retrieve current user profile',
          value: {}
        }
      ]
    })

    // Analytics endpoints
    this.addEndpoint({
      path: '/analytics/dashboard',
      method: 'GET',
      summary: 'Get dashboard analytics',
      description: 'Retrieve analytics data for the user dashboard',
      tags: ['Analytics'],
      security: [{ ApiKeyAuth: [] }],
      parameters: [
        {
          name: 'timeframe',
          in: 'query',
          description: 'Analytics timeframe',
          required: false,
          schema: { type: 'string', enum: ['7d', '30d', '90d'], example: '30d' }
        }
      ],
      responses: {
        '200': {
          description: 'Analytics data retrieved successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AnalyticsResponse' }
            }
          }
        }
      },
      examples: [
        {
          summary: 'Get monthly analytics',
          description: 'Retrieve 30-day analytics data',
          value: { timeframe: '30d' }
        }
      ]
    })
  }

  private initializeSchemas(): void {
    // Response schemas
    this.addSchema('ApiResponse', {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Indicates if the request was successful' },
        data: { type: 'object', description: 'Response data' },
        error: { 
          type: 'object',
          nullable: true,
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object' }
          }
        },
        meta: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string' }
          }
        }
      },
      required: ['success', 'data', 'error', 'meta']
    })

    this.addSchema('ErrorResponse', {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        data: { type: 'object', nullable: true },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string', example: 'Invalid input data' },
            details: { type: 'object' }
          }
        }
      }
    })

    // Sources Sought schemas
    this.addSchema('SourcesSought', {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'ss_12345' },
        title: { type: 'string', example: 'IT Services for Government Agency' },
        agency: { type: 'string', example: 'Department of Defense' },
        naicsCode: { type: 'string', example: '541511' },
        postedDate: { type: 'string', format: 'date-time' },
        responseDeadline: { type: 'string', format: 'date-time' },
        description: { type: 'string' },
        contactEmail: { type: 'string', format: 'email' },
        estimatedValue: { type: 'number', example: 500000 },
        location: { type: 'string', example: 'Washington, DC' },
        requirements: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['id', 'title', 'agency', 'naicsCode', 'postedDate', 'responseDeadline']
    })

    this.addSchema('SourcesSoughtListResponse', {
      type: 'object',
      allOf: [
        { $ref: '#/components/schemas/ApiResponse' },
        {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                opportunities: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/SourcesSought' }
                },
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    total: { type: 'integer' },
                    pages: { type: 'integer' }
                  }
                }
              }
            }
          }
        }
      ]
    })

    // Workflow schemas
    this.addSchema('Workflow', {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'wf_12345' },
        name: { type: 'string', example: 'DOD Response Workflow' },
        type: { type: 'string', enum: ['sources_sought_response', 'document_generation'] },
        status: { type: 'string', enum: ['active', 'paused', 'completed'] },
        triggers: { type: 'array', items: { type: 'string' } },
        steps: { type: 'array', items: { type: 'object' } },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      },
      required: ['id', 'name', 'type', 'status']
    })

    // User schemas
    this.addSchema('UserProfile', {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string', format: 'email' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        company: { type: 'string' },
        title: { type: 'string' },
        phone: { type: 'string' },
        cageCode: { type: 'string' },
        dunsNumber: { type: 'string' },
        ueiNumber: { type: 'string' },
        certifications: { type: 'array', items: { type: 'string' } }
      }
    })
  }

  private generatePaths(): Record<string, Record<string, any>> {
    const paths: Record<string, Record<string, any>> = {}

    for (const endpoint of this.endpoints.values()) {
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {}
      }

      paths[endpoint.path][endpoint.method.toLowerCase()] = {
        summary: endpoint.summary,
        description: endpoint.description,
        tags: endpoint.tags,
        security: endpoint.security,
        parameters: endpoint.parameters,
        requestBody: endpoint.requestBody,
        responses: endpoint.responses,
        deprecated: endpoint.deprecated || false
      }
    }

    return paths
  }

  private generateComponentSchemas(): Record<string, Schema> {
    const schemas: Record<string, Schema> = {}
    
    for (const [name, schema] of this.schemas) {
      schemas[name] = schema
    }

    return schemas
  }

  private generateSecuritySchemes(): Record<string, any> {
    return {
      ApiKeyAuth: {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header'
      },
      BearerAuth: {
        type: 'oauth2',
        name: 'Authorization',
        scheme: 'bearer',
        flows: {
          clientCredentials: {
            tokenUrl: '/oauth/token',
            scopes: {
              'read': 'Read access',
              'write': 'Write access',
              'admin': 'Admin access'
            }
          }
        }
      }
    }
  }

  private generateComponentResponses(): Record<string, Response> {
    return {
      BadRequest: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' }
          }
        }
      },
      Unauthorized: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' }
          }
        }
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' }
          }
        }
      },
      InternalServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' }
          }
        }
      }
    }
  }

  private generateComponentParameters(): Record<string, Parameter> {
    return {
      PageParam: {
        name: 'page',
        in: 'query',
        description: 'Page number for pagination',
        required: false,
        schema: { type: 'integer', minimum: 1, example: 1 }
      },
      LimitParam: {
        name: 'limit',
        in: 'query',
        description: 'Number of items per page',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100, example: 20 }
      }
    }
  }

  private generateComponentExamples(): Record<string, Example> {
    return {
      SourcesSoughtExample: {
        summary: 'Example Sources Sought opportunity',
        description: 'A typical Sources Sought opportunity',
        value: {
          id: 'ss_12345',
          title: 'IT Services for Government Agency',
          agency: 'Department of Defense',
          naicsCode: '541511',
          postedDate: '2023-12-01T09:00:00Z',
          responseDeadline: '2023-12-15T17:00:00Z',
          description: 'Seeking qualified vendors for IT services...',
          contactEmail: 'contracting@agency.gov',
          estimatedValue: 500000,
          location: 'Washington, DC'
        }
      }
    }
  }

  private generateTags(): Array<{ name: string; description: string }> {
    return [
      {
        name: 'Sources Sought',
        description: 'Operations related to Sources Sought opportunities'
      },
      {
        name: 'Workflows',
        description: 'Workflow automation and management'
      },
      {
        name: 'Users',
        description: 'User profile and account management'
      },
      {
        name: 'Analytics',
        description: 'Analytics and reporting data'
      },
      {
        name: 'Documents',
        description: 'Document generation and management'
      }
    ]
  }

  private generatePostmanItems(): any[] {
    const items: any[] = []
    const groupedEndpoints = this.groupEndpointsByTag()

    for (const [tag, endpoints] of groupedEndpoints) {
      const folder = {
        name: tag,
        item: endpoints.map(endpoint => this.convertEndpointToPostmanItem(endpoint))
      }
      items.push(folder)
    }

    return items
  }

  private convertEndpointToPostmanItem(endpoint: ApiEndpoint): any {
    return {
      name: endpoint.summary,
      request: {
        method: endpoint.method,
        header: [
          {
            key: 'X-API-Key',
            value: '{{api_key}}',
            type: 'text'
          },
          {
            key: 'Content-Type',
            value: 'application/json',
            type: 'text'
          }
        ],
        url: {
          raw: '{{base_url}}' + endpoint.path,
          host: ['{{base_url}}'],
          path: endpoint.path.split('/').filter(p => p)
        },
        body: endpoint.requestBody ? {
          mode: 'raw',
          raw: JSON.stringify(endpoint.examples[0]?.value || {}, null, 2)
        } : undefined
      },
      response: []
    }
  }

  private groupEndpointsByTag(): Map<string, ApiEndpoint[]> {
    const grouped = new Map<string, ApiEndpoint[]>()

    for (const endpoint of this.endpoints.values()) {
      for (const tag of endpoint.tags) {
        if (!grouped.has(tag)) {
          grouped.set(tag, [])
        }
        grouped.get(tag)!.push(endpoint)
      }
    }

    return grouped
  }

  private generateEndpointMarkdown(endpoint: ApiEndpoint): string {
    let markdown = `#### ${endpoint.method} ${endpoint.path}

${endpoint.description}

**Parameters:**

`

    if (endpoint.parameters && endpoint.parameters.length > 0) {
      markdown += '| Name | Type | Required | Description |\n'
      markdown += '|------|------|----------|-------------|\n'
      
      for (const param of endpoint.parameters) {
        markdown += `| ${param.name} | ${param.schema.type} | ${param.required ? 'Yes' : 'No'} | ${param.description} |\n`
      }
    } else {
      markdown += 'None\n'
    }

    if (endpoint.requestBody) {
      markdown += '\n**Request Body:**\n\n'
      markdown += '```json\n'
      markdown += JSON.stringify(endpoint.examples[0]?.value || {}, null, 2)
      markdown += '\n```\n'
    }

    markdown += '\n**Example Response:**\n\n'
    markdown += '```json\n'
    markdown += JSON.stringify({
      success: true,
      data: {},
      error: null,
      meta: {
        timestamp: '2023-12-07T10:30:00Z',
        version: '1.0.0'
      }
    }, null, 2)
    markdown += '\n```\n\n'

    return markdown
  }
}

export default ApiDocumentation