/**
 * SDK Generator System
 * 
 * Generates client SDKs in multiple programming languages
 * for easy integration with the GovBiz.ai API
 */

import { logger } from '@/lib/monitoring/logger'

export interface SdkConfig {
  enabled: boolean
  supportedLanguages: string[]
  includeExamples: boolean
  generateDocs: boolean
  packageInfo: {
    name: string
    version: string
    description: string
    author: string
    license: string
  }
}

export interface SdkTemplate {
  language: string
  extension: string
  templates: {
    client: string
    models: string
    auth: string
    examples: string
    readme: string
    package: string
  }
  dependencies: string[]
}

export interface GeneratedSdk {
  language: string
  files: Array<{
    path: string
    content: string
    type: 'source' | 'config' | 'docs' | 'example'
  }>
  documentation: string
  examples: string[]
  installInstructions: string
}

export class SdkGenerator {
  private config: SdkConfig
  private templates: Map<string, SdkTemplate> = new Map()

  constructor(config: any) {
    this.config = {
      enabled: true,
      supportedLanguages: ['javascript', 'typescript', 'python', 'java', 'curl'],
      includeExamples: true,
      generateDocs: true,
      packageInfo: {
        name: '@govbiz/api-client',
        version: '1.0.0',
        description: 'Official GovBiz.ai API client library',
        author: 'GovBiz.ai Team',
        license: 'MIT'
      },
      ...config
    }

    this.initializeTemplates()
  }

  /**
   * Initialize SDK generator
   */
  async initialize(): Promise<void> {
    try {
      if (!this.config.enabled) {
        logger.info('SDK generator disabled')
        return
      }

      logger.info('SDK generator initialized successfully', {
        supportedLanguages: this.config.supportedLanguages.length,
        templatesLoaded: this.templates.size
      })

    } catch (error) {
      logger.error('Failed to initialize SDK generator', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate SDK for specified language
   */
  async generateSdk(language: string, options: Record<string, any> = {}): Promise<GeneratedSdk> {
    try {
      if (!this.config.enabled) {
        throw new Error('SDK generation is disabled')
      }

      if (!this.config.supportedLanguages.includes(language)) {
        throw new Error(`Language '${language}' is not supported`)
      }

      const template = this.templates.get(language)
      if (!template) {
        throw new Error(`Template for '${language}' not found`)
      }

      const sdk = await this.generateFromTemplate(template, options)

      logger.info('SDK generated successfully', {
        language,
        filesGenerated: sdk.files.length
      })

      return sdk

    } catch (error) {
      logger.error('Failed to generate SDK', error instanceof Error ? error : undefined, { language })
      throw error
    }
  }

  /**
   * Get list of supported languages
   */
  getSupportedLanguages(): Array<{
    language: string
    displayName: string
    description: string
    features: string[]
  }> {
    return [
      {
        language: 'javascript',
        displayName: 'JavaScript',
        description: 'Modern JavaScript SDK with ES6+ features',
        features: ['Promise-based', 'TypeScript definitions', 'Node.js & Browser', 'Auto-retry']
      },
      {
        language: 'typescript',
        displayName: 'TypeScript',
        description: 'Fully typed TypeScript SDK',
        features: ['Full type safety', 'IntelliSense support', 'Generic interfaces', 'Compile-time validation']
      },
      {
        language: 'python',
        displayName: 'Python',
        description: 'Python SDK with async/await support',
        features: ['Async/await', 'Type hints', 'Pydantic models', 'pytest examples']
      },
      {
        language: 'java',
        displayName: 'Java',
        description: 'Enterprise-ready Java SDK',
        features: ['Maven/Gradle', 'Spring Boot integration', 'Retrofit HTTP client', 'JUnit tests']
      },
      {
        language: 'curl',
        displayName: 'cURL',
        description: 'Command-line examples using cURL',
        features: ['Copy-paste ready', 'Authentication examples', 'Error handling', 'Shell scripts']
      }
    ]
  }

  /**
   * Generate documentation for SDK usage
   */
  async generateSdkDocumentation(language: string): Promise<string> {
    try {
      const languageInfo = this.getSupportedLanguages().find(l => l.language === language)
      if (!languageInfo) {
        throw new Error(`Language '${language}' not supported`)
      }

      return this.generateLanguageSpecificDocs(language, languageInfo)

    } catch (error) {
      logger.error('Failed to generate SDK documentation', error instanceof Error ? error : undefined, { language })
      throw error
    }
  }

  /**
   * Shutdown SDK generator
   */
  async shutdown(): Promise<void> {
    try {
      this.templates.clear()
      logger.info('SDK generator shutdown complete')

    } catch (error) {
      logger.error('SDK generator shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private initializeTemplates(): void {
    // JavaScript/TypeScript template
    this.templates.set('javascript', {
      language: 'javascript',
      extension: 'js',
      templates: {
        client: this.getJavaScriptClientTemplate(),
        models: this.getJavaScriptModelsTemplate(),
        auth: this.getJavaScriptAuthTemplate(),
        examples: this.getJavaScriptExamplesTemplate(),
        readme: this.getJavaScriptReadmeTemplate(),
        package: this.getJavaScriptPackageTemplate()
      },
      dependencies: ['axios', 'dotenv']
    })

    this.templates.set('typescript', {
      language: 'typescript',
      extension: 'ts',
      templates: {
        client: this.getTypeScriptClientTemplate(),
        models: this.getTypeScriptModelsTemplate(),
        auth: this.getTypeScriptAuthTemplate(),
        examples: this.getTypeScriptExamplesTemplate(),
        readme: this.getTypeScriptReadmeTemplate(),
        package: this.getTypeScriptPackageTemplate()
      },
      dependencies: ['axios', 'dotenv', '@types/node']
    })

    // Python template
    this.templates.set('python', {
      language: 'python',
      extension: 'py',
      templates: {
        client: this.getPythonClientTemplate(),
        models: this.getPythonModelsTemplate(),
        auth: this.getPythonAuthTemplate(),
        examples: this.getPythonExamplesTemplate(),
        readme: this.getPythonReadmeTemplate(),
        package: this.getPythonSetupTemplate()
      },
      dependencies: ['requests', 'pydantic', 'python-dotenv']
    })

    // Java template
    this.templates.set('java', {
      language: 'java',
      extension: 'java',
      templates: {
        client: this.getJavaClientTemplate(),
        models: this.getJavaModelsTemplate(),
        auth: this.getJavaAuthTemplate(),
        examples: this.getJavaExamplesTemplate(),
        readme: this.getJavaReadmeTemplate(),
        package: this.getJavaPomTemplate()
      },
      dependencies: ['retrofit2', 'gson', 'okhttp3']
    })

    // cURL template
    this.templates.set('curl', {
      language: 'curl',
      extension: 'sh',
      templates: {
        client: this.getCurlExamplesTemplate(),
        models: '',
        auth: this.getCurlAuthTemplate(),
        examples: this.getCurlExamplesTemplate(),
        readme: this.getCurlReadmeTemplate(),
        package: ''
      },
      dependencies: ['curl', 'jq']
    })
  }

  private async generateFromTemplate(template: SdkTemplate, options: Record<string, any>): Promise<GeneratedSdk> {
    const files: Array<{ path: string; content: string; type: 'source' | 'config' | 'docs' | 'example' }> = []
    const examples: string[] = []

    // Generate main client file
    if (template.templates.client) {
      files.push({
        path: `src/client.${template.extension}`,
        content: this.processTemplate(template.templates.client, options),
        type: 'source'
      })
    }

    // Generate models/types
    if (template.templates.models) {
      files.push({
        path: `src/models.${template.extension}`,
        content: this.processTemplate(template.templates.models, options),
        type: 'source'
      })
    }

    // Generate authentication
    if (template.templates.auth) {
      files.push({
        path: `src/auth.${template.extension}`,
        content: this.processTemplate(template.templates.auth, options),
        type: 'source'
      })
    }

    // Generate examples
    if (template.templates.examples && this.config.includeExamples) {
      const exampleContent = this.processTemplate(template.templates.examples, options)
      files.push({
        path: `examples/basic.${template.extension}`,
        content: exampleContent,
        type: 'example'
      })
      examples.push(exampleContent)
    }

    // Generate README
    if (template.templates.readme && this.config.generateDocs) {
      files.push({
        path: 'README.md',
        content: this.processTemplate(template.templates.readme, options),
        type: 'docs'
      })
    }

    // Generate package configuration
    if (template.templates.package) {
      const packageFile = template.language === 'java' ? 'pom.xml' : 
                         template.language === 'python' ? 'setup.py' : 'package.json'
      files.push({
        path: packageFile,
        content: this.processTemplate(template.templates.package, options),
        type: 'config'
      })
    }

    return {
      language: template.language,
      files,
      documentation: await this.generateSdkDocumentation(template.language),
      examples,
      installInstructions: this.generateInstallInstructions(template)
    }
  }

  private processTemplate(template: string, options: Record<string, any>): string {
    let processed = template

    // Replace placeholders with actual values
    const placeholders = {
      '{{PACKAGE_NAME}}': this.config.packageInfo.name,
      '{{PACKAGE_VERSION}}': this.config.packageInfo.version,
      '{{PACKAGE_DESCRIPTION}}': this.config.packageInfo.description,
      '{{PACKAGE_AUTHOR}}': this.config.packageInfo.author,
      '{{PACKAGE_LICENSE}}': this.config.packageInfo.license,
      '{{BASE_URL}}': 'https://api.govbiz.ai/v1',
      '{{API_VERSION}}': 'v1',
      ...options
    }

    for (const [placeholder, value] of Object.entries(placeholders)) {
      processed = processed.replace(new RegExp(placeholder, 'g'), String(value))
    }

    return processed
  }

  private generateInstallInstructions(template: SdkTemplate): string {
    switch (template.language) {
      case 'javascript':
      case 'typescript':
        return `npm install ${this.config.packageInfo.name}`
      case 'python':
        return `pip install ${this.config.packageInfo.name.replace('@govbiz/', 'govbiz-')}`
      case 'java':
        return `Add to your pom.xml or build.gradle`
      case 'curl':
        return `No installation required - cURL is included with most systems`
      default:
        return 'See documentation for installation instructions'
    }
  }

  private generateLanguageSpecificDocs(language: string, languageInfo: any): string {
    return `# ${languageInfo.displayName} SDK for GovBiz.ai

${languageInfo.description}

## Features

${languageInfo.features.map((f: string) => `- ${f}`).join('\n')}

## Installation

\`\`\`bash
${this.generateInstallInstructions(this.templates.get(language)!)}
\`\`\`

## Quick Start

See examples directory for complete usage examples.

## API Reference

Full API documentation available at: https://docs.govbiz.ai

## Support

- Documentation: https://docs.govbiz.ai
- Issues: https://github.com/govbiz-ai/sdk-${language}/issues
- Email: support@govbiz.ai
`
  }

  // Template methods (simplified versions for brevity)

  private getJavaScriptClientTemplate(): string {
    return `/**
 * {{PACKAGE_NAME}} - {{PACKAGE_DESCRIPTION}}
 * Version: {{PACKAGE_VERSION}}
 */

const axios = require('axios');

class GovBizClient {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.baseURL = options.baseURL || '{{BASE_URL}}';
    this.timeout = options.timeout || 30000;
    
    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': '{{PACKAGE_NAME}}/{{PACKAGE_VERSION}}'
      }
    });
    
    this.setupInterceptors();
  }
  
  setupInterceptors() {
    this.http.interceptors.response.use(
      response => response.data,
      error => {
        if (error.response) {
          throw new Error(\`API Error: \${error.response.status} - \${error.response.data.error?.message || 'Unknown error'}\`);
        }
        throw error;
      }
    );
  }
  
  // Sources Sought API
  async getSourcesSought(params = {}) {
    return await this.http.get('/sources-sought', { params });
  }
  
  async getSourcesSoughtById(id) {
    return await this.http.get(\`/sources-sought/\${id}\`);
  }
  
  // Workflows API
  async createWorkflow(workflow) {
    return await this.http.post('/workflows', workflow);
  }
  
  async getWorkflows() {
    return await this.http.get('/workflows');
  }
  
  // User API
  async getUserProfile() {
    return await this.http.get('/users/profile');
  }
  
  async updateUserProfile(profile) {
    return await this.http.put('/users/profile', profile);
  }
}

module.exports = GovBizClient;
`
  }

  private getJavaScriptModelsTemplate(): string {
    return `/**
 * Type definitions and models for {{PACKAGE_NAME}}
 */

// API Response wrapper
class ApiResponse {
  constructor(success, data, error = null, meta = {}) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.meta = meta;
  }
}

// Sources Sought model
class SourcesSought {
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    this.agency = data.agency;
    this.naicsCode = data.naicsCode;
    this.postedDate = new Date(data.postedDate);
    this.responseDeadline = new Date(data.responseDeadline);
    this.description = data.description;
    this.contactEmail = data.contactEmail;
    this.estimatedValue = data.estimatedValue;
    this.location = data.location;
    this.requirements = data.requirements || [];
    this.tags = data.tags || [];
  }
}

// Workflow model
class Workflow {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.status = data.status;
    this.triggers = data.triggers || [];
    this.steps = data.steps || [];
    this.createdAt = new Date(data.createdAt);
    this.updatedAt = new Date(data.updatedAt);
  }
}

// User Profile model
class UserProfile {
  constructor(data) {
    this.id = data.id;
    this.email = data.email;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.company = data.company;
    this.title = data.title;
    this.phone = data.phone;
    this.cageCode = data.cageCode;
    this.dunsNumber = data.dunsNumber;
    this.ueiNumber = data.ueiNumber;
    this.certifications = data.certifications || [];
  }
}

module.exports = {
  ApiResponse,
  SourcesSought,
  Workflow,
  UserProfile
};
`
  }

  private getJavaScriptAuthTemplate(): string {
    return `/**
 * Authentication utilities for {{PACKAGE_NAME}}
 */

class Auth {
  static validateApiKey(apiKey) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
    
    if (typeof apiKey !== 'string') {
      throw new Error('API key must be a string');
    }
    
    if (!apiKey.startsWith('gba_')) {
      throw new Error('Invalid API key format');
    }
    
    return true;
  }
  
  static createAuthHeaders(apiKey) {
    this.validateApiKey(apiKey);
    
    return {
      'X-API-Key': apiKey,
      'Authorization': \`Bearer \${apiKey}\`
    };
  }
}

module.exports = Auth;
`
  }

  private getJavaScriptExamplesTemplate(): string {
    return `/**
 * Examples for {{PACKAGE_NAME}}
 */

const GovBizClient = require('../src/client');
require('dotenv').config();

async function examples() {
  // Initialize client
  const client = new GovBizClient(process.env.GOVBIZ_API_KEY);
  
  try {
    // Get Sources Sought opportunities
    console.log('Fetching Sources Sought opportunities...');
    const opportunities = await client.getSourcesSought({
      page: 1,
      limit: 10,
      naics: '541511'
    });
    console.log(\`Found \${opportunities.data.opportunities.length} opportunities\`);
    
    // Get specific opportunity
    if (opportunities.data.opportunities.length > 0) {
      const firstId = opportunities.data.opportunities[0].id;
      const opportunity = await client.getSourcesSoughtById(firstId);
      console.log(\`Opportunity: \${opportunity.data.title}\`);
    }
    
    // Create a workflow
    console.log('Creating workflow...');
    const workflow = await client.createWorkflow({
      name: 'Auto Response Workflow',
      type: 'sources_sought_response',
      triggers: ['new_opportunity'],
      steps: [
        { type: 'analyze_requirements' },
        { type: 'generate_response' },
        { type: 'review_required' }
      ]
    });
    console.log(\`Created workflow: \${workflow.data.id}\`);
    
    // Get user profile
    console.log('Fetching user profile...');
    const profile = await client.getUserProfile();
    console.log(\`User: \${profile.data.firstName} \${profile.data.lastName}\`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run examples
if (require.main === module) {
  examples();
}

module.exports = examples;
`
  }

  private getJavaScriptReadmeTemplate(): string {
    return `# {{PACKAGE_NAME}}

{{PACKAGE_DESCRIPTION}}

## Installation

\`\`\`bash
npm install {{PACKAGE_NAME}}
\`\`\`

## Quick Start

\`\`\`javascript
const GovBizClient = require('{{PACKAGE_NAME}}');

const client = new GovBizClient('your-api-key-here');

// Get Sources Sought opportunities
const opportunities = await client.getSourcesSought({
  page: 1,
  limit: 10,
  naics: '541511'
});
\`\`\`

## Environment Variables

Create a \`.env\` file:

\`\`\`
GOVBIZ_API_KEY=your-api-key-here
\`\`\`

## Examples

See the \`examples/\` directory for complete usage examples.

## API Reference

- Sources Sought: \`getSourcesSought()\`, \`getSourcesSoughtById()\`
- Workflows: \`createWorkflow()\`, \`getWorkflows()\`
- Users: \`getUserProfile()\`, \`updateUserProfile()\`

## Support

- Documentation: https://docs.govbiz.ai
- Support: support@govbiz.ai
`
  }

  private getJavaScriptPackageTemplate(): string {
    return `{
  "name": "{{PACKAGE_NAME}}",
  "version": "{{PACKAGE_VERSION}}",
  "description": "{{PACKAGE_DESCRIPTION}}",
  "main": "src/client.js",
  "author": "{{PACKAGE_AUTHOR}}",
  "license": "{{PACKAGE_LICENSE}}",
  "keywords": ["govbiz", "government", "contracting", "api", "sources-sought"],
  "repository": {
    "type": "git",
    "url": "https://github.com/govbiz-ai/api-client-js"
  },
  "dependencies": {
    "axios": "^1.5.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  },
  "scripts": {
    "test": "jest",
    "example": "node examples/basic.js"
  },
  "engines": {
    "node": ">=14.0.0"
  }
}
`
  }

  // TypeScript templates (similar structure but with types)
  private getTypeScriptClientTemplate(): string {
    return this.getJavaScriptClientTemplate().replace(/const axios = require\('axios'\);/, "import axios, { AxiosInstance } from 'axios';")
      .replace(/class GovBizClient {/, `export interface GovBizClientOptions {
  baseURL?: string;
  timeout?: number;
}

export class GovBizClient {
  private http: AxiosInstance;
  private apiKey: string;`)
  }

  private getTypeScriptModelsTemplate(): string {
    return `/**
 * TypeScript interfaces and types for {{PACKAGE_NAME}}
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  error: ApiError | null;
  meta: {
    timestamp: string;
    version: string;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface SourcesSought {
  id: string;
  title: string;
  agency: string;
  naicsCode: string;
  postedDate: string;
  responseDeadline: string;
  description: string;
  contactEmail: string;
  estimatedValue?: number;
  location: string;
  requirements: string[];
  tags: string[];
}

export interface Workflow {
  id: string;
  name: string;
  type: 'sources_sought_response' | 'document_generation' | 'notification';
  status: 'active' | 'paused' | 'completed';
  triggers: string[];
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStep {
  type: string;
  config?: any;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company?: string;
  title?: string;
  phone?: string;
  cageCode?: string;
  dunsNumber?: string;
  ueiNumber?: string;
  certifications: string[];
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface SourcesSoughtFilters extends PaginationParams {
  naics?: string;
  agency?: string;
  keywords?: string;
}
`
  }

  private getTypeScriptAuthTemplate(): string {
    return this.getJavaScriptAuthTemplate().replace(/class Auth {/, 'export class Auth {').replace(/module\.exports = Auth;/, '')
  }

  private getTypeScriptExamplesTemplate(): string {
    return this.getJavaScriptExamplesTemplate()
      .replace(/const GovBizClient = require\('\.\.\/src\/client'\);/, "import { GovBizClient } from '../src/client';")
      .replace(/require\('dotenv'\)\.config\(\);/, "import dotenv from 'dotenv';\ndotenv.config();")
      .replace(/module\.exports = examples;/, 'export default examples;')
  }

  private getTypeScriptReadmeTemplate(): string {
    return this.getJavaScriptReadmeTemplate().replace(/const GovBizClient = require\('{{PACKAGE_NAME}}'\);/, "import { GovBizClient } from '{{PACKAGE_NAME}}';")
  }

  private getTypeScriptPackageTemplate(): string {
    return JSON.stringify({
      name: '{{PACKAGE_NAME}}',
      version: '{{PACKAGE_VERSION}}',
      description: '{{PACKAGE_DESCRIPTION}}',
      main: 'dist/client.js',
      types: 'dist/client.d.ts',
      author: '{{PACKAGE_AUTHOR}}',
      license: '{{PACKAGE_LICENSE}}',
      keywords: ['govbiz', 'government', 'contracting', 'api', 'sources-sought', 'typescript'],
      dependencies: {
        axios: '^1.5.0'
      },
      devDependencies: {
        typescript: '^5.0.0',
        '@types/node': '^20.0.0',
        jest: '^29.7.0',
        '@types/jest': '^29.5.0'
      },
      scripts: {
        build: 'tsc',
        test: 'jest',
        example: 'ts-node examples/basic.ts'
      }
    }, null, 2)
  }

  // Python templates
  private getPythonClientTemplate(): string {
    return `"""
{{PACKAGE_NAME}} - {{PACKAGE_DESCRIPTION}}
Version: {{PACKAGE_VERSION}}
"""

import requests
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import os


@dataclass
class GovBizClientConfig:
    base_url: str = "{{BASE_URL}}"
    timeout: int = 30


class GovBizClient:
    def __init__(self, api_key: str, config: Optional[GovBizClientConfig] = None):
        self.api_key = api_key
        self.config = config or GovBizClientConfig()
        
        self.session = requests.Session()
        self.session.headers.update({
            'X-API-Key': self.api_key,
            'Content-Type': 'application/json',
            'User-Agent': f'{{PACKAGE_NAME}}/{{PACKAGE_VERSION}}'
        })
    
    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make HTTP request to API"""
        url = f"{self.config.base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                timeout=self.config.timeout,
                **kwargs
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise Exception(f"API request failed: {e}")
    
    # Sources Sought API
    def get_sources_sought(self, **params) -> Dict[str, Any]:
        """Get Sources Sought opportunities"""
        return self._request('GET', '/sources-sought', params=params)
    
    def get_sources_sought_by_id(self, opportunity_id: str) -> Dict[str, Any]:
        """Get specific Sources Sought opportunity"""
        return self._request('GET', f'/sources-sought/{opportunity_id}')
    
    # Workflows API
    def create_workflow(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new workflow"""
        return self._request('POST', '/workflows', json=workflow)
    
    def get_workflows(self) -> Dict[str, Any]:
        """Get user workflows"""
        return self._request('GET', '/workflows')
    
    # User API
    def get_user_profile(self) -> Dict[str, Any]:
        """Get user profile"""
        return self._request('GET', '/users/profile')
    
    def update_user_profile(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        """Update user profile"""
        return self._request('PUT', '/users/profile', json=profile)
`
  }

  private getPythonModelsTemplate(): string {
    return `"""
Data models for {{PACKAGE_NAME}}
"""

from dataclasses import dataclass
from typing import List, Optional, Any, Dict
from datetime import datetime


@dataclass
class ApiResponse:
    success: bool
    data: Any
    error: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None


@dataclass
class SourcesSought:
    id: str
    title: str
    agency: str
    naics_code: str
    posted_date: datetime
    response_deadline: datetime
    description: str
    contact_email: str
    estimated_value: Optional[float] = None
    location: Optional[str] = None
    requirements: List[str] = None
    tags: List[str] = None
    
    def __post_init__(self):
        if self.requirements is None:
            self.requirements = []
        if self.tags is None:
            self.tags = []


@dataclass
class Workflow:
    id: str
    name: str
    type: str
    status: str
    triggers: List[str]
    steps: List[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime


@dataclass
class UserProfile:
    id: str
    email: str
    first_name: str
    last_name: str
    company: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    cage_code: Optional[str] = None
    duns_number: Optional[str] = None
    uei_number: Optional[str] = None
    certifications: List[str] = None
    
    def __post_init__(self):
        if self.certifications is None:
            self.certifications = []
`
  }

  private getPythonAuthTemplate(): string {
    return `"""
Authentication utilities for {{PACKAGE_NAME}}
"""

import re
from typing import Dict


class Auth:
    @staticmethod
    def validate_api_key(api_key: str) -> bool:
        """Validate API key format"""
        if not api_key:
            raise ValueError("API key is required")
        
        if not isinstance(api_key, str):
            raise ValueError("API key must be a string")
        
        if not api_key.startswith('gba_'):
            raise ValueError("Invalid API key format")
        
        return True
    
    @staticmethod
    def create_auth_headers(api_key: str) -> Dict[str, str]:
        """Create authentication headers"""
        Auth.validate_api_key(api_key)
        
        return {
            'X-API-Key': api_key,
            'Authorization': f'Bearer {api_key}'
        }
`
  }

  private getPythonExamplesTemplate(): string {
    return `"""
Examples for {{PACKAGE_NAME}}
"""

import asyncio
import os
from dotenv import load_dotenv
from govbiz_client import GovBizClient

# Load environment variables
load_dotenv()


async def main():
    """Run examples"""
    # Initialize client
    client = GovBizClient(os.getenv('GOVBIZ_API_KEY'))
    
    try:
        # Get Sources Sought opportunities
        print("Fetching Sources Sought opportunities...")
        opportunities = client.get_sources_sought(
            page=1,
            limit=10,
            naics='541511'
        )
        print(f"Found {len(opportunities['data']['opportunities'])} opportunities")
        
        # Get specific opportunity
        if opportunities['data']['opportunities']:
            first_id = opportunities['data']['opportunities'][0]['id']
            opportunity = client.get_sources_sought_by_id(first_id)
            print(f"Opportunity: {opportunity['data']['title']}")
        
        # Create a workflow
        print("Creating workflow...")
        workflow = client.create_workflow({
            'name': 'Auto Response Workflow',
            'type': 'sources_sought_response',
            'triggers': ['new_opportunity'],
            'steps': [
                {'type': 'analyze_requirements'},
                {'type': 'generate_response'},
                {'type': 'review_required'}
            ]
        })
        print(f"Created workflow: {workflow['data']['id']}")
        
        # Get user profile
        print("Fetching user profile...")
        profile = client.get_user_profile()
        print(f"User: {profile['data']['firstName']} {profile['data']['lastName']}")
        
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
`
  }

  private getPythonReadmeTemplate(): string {
    return `# {{PACKAGE_NAME}}

{{PACKAGE_DESCRIPTION}}

## Installation

\`\`\`bash
pip install {{PACKAGE_NAME}}
\`\`\`

## Quick Start

\`\`\`python
from govbiz_client import GovBizClient

client = GovBizClient('your-api-key-here')

# Get Sources Sought opportunities
opportunities = client.get_sources_sought(
    page=1,
    limit=10,
    naics='541511'
)
\`\`\`

## Environment Variables

Create a \`.env\` file:

\`\`\`
GOVBIZ_API_KEY=your-api-key-here
\`\`\`

## Examples

See the \`examples/\` directory for complete usage examples.

## API Reference

- Sources Sought: \`get_sources_sought()\`, \`get_sources_sought_by_id()\`
- Workflows: \`create_workflow()\`, \`get_workflows()\`
- Users: \`get_user_profile()\`, \`update_user_profile()\`

## Support

- Documentation: https://docs.govbiz.ai
- Support: support@govbiz.ai
`
  }

  private getPythonSetupTemplate(): string {
    return `from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="{{PACKAGE_NAME}}".replace("@govbiz/", "govbiz-"),
    version="{{PACKAGE_VERSION}}",
    author="{{PACKAGE_AUTHOR}}",
    description="{{PACKAGE_DESCRIPTION}}",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/govbiz-ai/api-client-python",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
    install_requires=[
        "requests>=2.28.0",
        "pydantic>=1.10.0",
        "python-dotenv>=1.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "black>=22.0.0",
            "flake8>=5.0.0",
            "mypy>=1.0.0",
        ],
    },
)
`
  }

  // Java templates (simplified)
  private getJavaClientTemplate(): string {
    return `// Java client template would go here
// This is a simplified version for demonstration
package ai.govbiz.client;

public class GovBizClient {
    // Implementation would include Retrofit setup
    // and all API methods
}`
  }

  private getJavaModelsTemplate(): string {
    return `// Java models would go here`
  }

  private getJavaAuthTemplate(): string {
    return `// Java auth utilities would go here`
  }

  private getJavaExamplesTemplate(): string {
    return `// Java examples would go here`
  }

  private getJavaReadmeTemplate(): string {
    return `# {{PACKAGE_NAME}} Java SDK

Java SDK for the GovBiz.ai API.

## Installation

### Maven

\`\`\`xml
<dependency>
    <groupId>ai.govbiz</groupId>
    <artifactId>api-client</artifactId>
    <version>{{PACKAGE_VERSION}}</version>
</dependency>
\`\`\`

### Gradle

\`\`\`gradle
implementation 'ai.govbiz:api-client:{{PACKAGE_VERSION}}'
\`\`\`
`
  }

  private getJavaPomTemplate(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    
    <groupId>ai.govbiz</groupId>
    <artifactId>api-client</artifactId>
    <version>{{PACKAGE_VERSION}}</version>
    <packaging>jar</packaging>
    
    <name>{{PACKAGE_NAME}}</name>
    <description>{{PACKAGE_DESCRIPTION}}</description>
    
    <properties>
        <maven.compiler.source>11</maven.compiler.source>
        <maven.compiler.target>11</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
    
    <dependencies>
        <dependency>
            <groupId>com.squareup.retrofit2</groupId>
            <artifactId>retrofit</artifactId>
            <version>2.9.0</version>
        </dependency>
        <dependency>
            <groupId>com.squareup.retrofit2</groupId>
            <artifactId>converter-gson</artifactId>
            <version>2.9.0</version>
        </dependency>
    </dependencies>
</project>
`
  }

  // cURL templates
  private getCurlExamplesTemplate(): string {
    return `#!/bin/bash

# GovBiz.ai API Examples using cURL
# Set your API key
API_KEY="your-api-key-here"
BASE_URL="{{BASE_URL}}"

# Get Sources Sought opportunities
echo "Getting Sources Sought opportunities..."
curl -X GET "$BASE_URL/sources-sought?page=1&limit=10" \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" | jq '.'

# Get specific opportunity
echo "Getting specific opportunity..."
curl -X GET "$BASE_URL/sources-sought/ss_12345" \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" | jq '.'

# Create workflow
echo "Creating workflow..."
curl -X POST "$BASE_URL/workflows" \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Auto Response Workflow",
    "type": "sources_sought_response",
    "triggers": ["new_opportunity"],
    "steps": [
      {"type": "analyze_requirements"},
      {"type": "generate_response"},
      {"type": "review_required"}
    ]
  }' | jq '.'

# Get user profile
echo "Getting user profile..."
curl -X GET "$BASE_URL/users/profile" \\
  -H "X-API-Key: $API_KEY" \\
  -H "Content-Type: application/json" | jq '.'
`
  }

  private getCurlAuthTemplate(): string {
    return `#!/bin/bash

# Authentication examples for GovBiz.ai API

# Using API Key in header (recommended)
curl -X GET "{{BASE_URL}}/sources-sought" \\
  -H "X-API-Key: your-api-key-here" \\
  -H "Content-Type: application/json"

# Using API Key in query parameter (not recommended for production)
curl -X GET "{{BASE_URL}}/sources-sought?api_key=your-api-key-here" \\
  -H "Content-Type: application/json"

# Using Bearer token
curl -X GET "{{BASE_URL}}/sources-sought" \\
  -H "Authorization: Bearer your-bearer-token-here" \\
  -H "Content-Type: application/json"
`
  }

  private getCurlReadmeTemplate(): string {
    return `# GovBiz.ai API cURL Examples

Complete cURL examples for the GovBiz.ai API.

## Prerequisites

- cURL (included with most systems)
- jq (for JSON formatting)

## Setup

1. Set your API key:
\`\`\`bash
export GOVBIZ_API_KEY="your-api-key-here"
\`\`\`

2. Run examples:
\`\`\`bash
chmod +x examples.sh
./examples.sh
\`\`\`

## Examples

See the included shell scripts for complete API usage examples.

## Authentication

All requests require an API key in the \`X-API-Key\` header.
`
  }
}

export default SdkGenerator