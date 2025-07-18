/**
 * API Validation System
 * 
 * Comprehensive request and response validation with schema generation,
 * type checking, and detailed error reporting
 */

import { logger } from '@/lib/monitoring/logger'

export interface ValidationRule {
  field: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'email' | 'url'
  required: boolean
  constraints?: ValidationConstraint[]
  customValidator?: (value: any) => ValidationResult
}

export interface ValidationConstraint {
  type: 'min' | 'max' | 'length' | 'pattern' | 'enum' | 'format' | 'custom'
  value: any
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  field: string
  code: string
  message: string
  value?: any
  constraint?: string
}

export interface ValidationWarning {
  field: string
  message: string
  suggestion?: string
}

export interface EndpointValidation {
  path: string
  method: string
  parameters: ValidationRule[]
  requestBody?: ValidationRule[]
  responses: Record<string, ValidationRule[]>
}

export interface SchemaValidation {
  name: string
  rules: ValidationRule[]
  required: string[]
  additionalProperties: boolean
}

export class ApiValidation {
  private endpointValidations: Map<string, EndpointValidation> = new Map()
  private schemaValidations: Map<string, SchemaValidation> = new Map()
  private config: {
    strict: boolean
    validateResponses: boolean
    generateSchemas: boolean
  }

  constructor(config: any) {
    this.config = {
      strict: true,
      validateResponses: true,
      generateSchemas: true,
      ...config
    }

    this.initializeValidations()
  }

  /**
   * Initialize validation system
   */
  async initialize(): Promise<void> {
    try {
      if (this.config.generateSchemas) {
        await this.generateValidationSchemas()
      }

      logger.info('API validation system initialized successfully', {
        endpointCount: this.endpointValidations.size,
        schemaCount: this.schemaValidations.size,
        strictMode: this.config.strict
      })

    } catch (error) {
      logger.error('Failed to initialize API validation system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Validate API endpoint request
   */
  async validateEndpoint(path: string, method: string, data: any): Promise<ValidationResult> {
    try {
      const validationKey = `${method.toUpperCase()}_${path}`
      const validation = this.endpointValidations.get(validationKey)

      if (!validation) {
        if (this.config.strict) {
          return {
            valid: false,
            errors: [{
              field: 'endpoint',
              code: 'ENDPOINT_NOT_FOUND',
              message: `Validation not found for ${method} ${path}`
            }],
            warnings: []
          }
        }
        
        return { valid: true, errors: [], warnings: [] }
      }

      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: []
      }

      // Validate parameters
      if (validation.parameters && data.params) {
        const paramResult = await this.validateFields(validation.parameters, data.params)
        result.errors.push(...paramResult.errors)
        result.warnings.push(...paramResult.warnings)
      }

      // Validate request body
      if (validation.requestBody && data.body) {
        const bodyResult = await this.validateFields(validation.requestBody, data.body)
        result.errors.push(...bodyResult.errors)
        result.warnings.push(...bodyResult.warnings)
      }

      result.valid = result.errors.length === 0

      // Log validation results
      if (!result.valid) {
        logger.warn('API validation failed', {
          endpoint: validationKey,
          errors: result.errors.length,
          warnings: result.warnings.length
        })
      }

      return result

    } catch (error) {
      logger.error('Endpoint validation failed', error instanceof Error ? error : undefined, { path, method })
      return {
        valid: false,
        errors: [{
          field: 'validation',
          code: 'VALIDATION_ERROR',
          message: 'Internal validation error'
        }],
        warnings: []
      }
    }
  }

  /**
   * Validate response data
   */
  async validateResponse(path: string, method: string, statusCode: string, data: any): Promise<ValidationResult> {
    try {
      if (!this.config.validateResponses) {
        return { valid: true, errors: [], warnings: [] }
      }

      const validationKey = `${method.toUpperCase()}_${path}`
      const validation = this.endpointValidations.get(validationKey)

      if (!validation || !validation.responses[statusCode]) {
        return { valid: true, errors: [], warnings: [] }
      }

      return await this.validateFields(validation.responses[statusCode], data)

    } catch (error) {
      logger.error('Response validation failed', error instanceof Error ? error : undefined, { path, method, statusCode })
      return {
        valid: false,
        errors: [{
          field: 'response',
          code: 'RESPONSE_VALIDATION_ERROR',
          message: 'Response validation error'
        }],
        warnings: []
      }
    }
  }

  /**
   * Validate data against schema
   */
  async validateSchema(schemaName: string, data: any): Promise<ValidationResult> {
    try {
      const schema = this.schemaValidations.get(schemaName)
      
      if (!schema) {
        return {
          valid: false,
          errors: [{
            field: 'schema',
            code: 'SCHEMA_NOT_FOUND',
            message: `Schema '${schemaName}' not found`
          }],
          warnings: []
        }
      }

      return await this.validateFields(schema.rules, data)

    } catch (error) {
      logger.error('Schema validation failed', error instanceof Error ? error : undefined, { schemaName })
      return {
        valid: false,
        errors: [{
          field: 'schema',
          code: 'SCHEMA_VALIDATION_ERROR',
          message: 'Schema validation error'
        }],
        warnings: []
      }
    }
  }

  /**
   * Add endpoint validation
   */
  addEndpointValidation(validation: EndpointValidation): void {
    const key = `${validation.method.toUpperCase()}_${validation.path}`
    this.endpointValidations.set(key, validation)
  }

  /**
   * Add schema validation
   */
  addSchemaValidation(schema: SchemaValidation): void {
    this.schemaValidations.set(schema.name, schema)
  }

  /**
   * Generate validation middleware
   */
  generateMiddleware(path: string, method: string): (req: any, res: any, next: any) => Promise<void> {
    return async (req: any, res: any, next: any) => {
      try {
        const validationResult = await this.validateEndpoint(path, method, {
          params: req.params,
          query: req.query,
          body: req.body,
          headers: req.headers
        })

        if (!validationResult.valid) {
          return res.status(400).json({
            success: false,
            data: null,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: {
                errors: validationResult.errors,
                warnings: validationResult.warnings
              }
            }
          })
        }

        // Attach validation warnings to request
        req.validationWarnings = validationResult.warnings

        next()

      } catch (error) {
        logger.error('Validation middleware error', error instanceof Error ? error : undefined)
        res.status(500).json({
          success: false,
          data: null,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal validation error'
          }
        })
      }
    }
  }

  /**
   * Shutdown validation system
   */
  async shutdown(): Promise<void> {
    try {
      this.endpointValidations.clear()
      this.schemaValidations.clear()

      logger.info('API validation system shutdown complete')

    } catch (error) {
      logger.error('API validation shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private async validateFields(rules: ValidationRule[], data: any): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: []
    }

    for (const rule of rules) {
      const value = this.getFieldValue(data, rule.field)
      const fieldResult = await this.validateField(rule, value)
      
      result.errors.push(...fieldResult.errors)
      result.warnings.push(...fieldResult.warnings)
    }

    result.valid = result.errors.length === 0
    return result
  }

  private async validateField(rule: ValidationRule, value: any): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: []
    }

    // Check required fields
    if (rule.required && (value === undefined || value === null || value === '')) {
      result.errors.push({
        field: rule.field,
        code: 'REQUIRED_FIELD',
        message: `Field '${rule.field}' is required`,
        value
      })
      return result
    }

    // Skip validation if field is not required and empty
    if (!rule.required && (value === undefined || value === null || value === '')) {
      return result
    }

    // Type validation
    const typeValid = this.validateFieldType(rule.type, value)
    if (!typeValid) {
      result.errors.push({
        field: rule.field,
        code: 'INVALID_TYPE',
        message: `Field '${rule.field}' must be of type ${rule.type}`,
        value
      })
      return result
    }

    // Constraint validation
    if (rule.constraints) {
      for (const constraint of rule.constraints) {
        const constraintResult = this.validateConstraint(rule.field, value, constraint)
        if (!constraintResult.valid) {
          result.errors.push(...constraintResult.errors)
          result.warnings.push(...constraintResult.warnings)
        }
      }
    }

    // Custom validation
    if (rule.customValidator) {
      const customResult = rule.customValidator(value)
      result.errors.push(...customResult.errors)
      result.warnings.push(...customResult.warnings)
    }

    result.valid = result.errors.length === 0
    return result
  }

  private validateFieldType(type: string, value: any): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string'
      case 'number':
        return typeof value === 'number' && !isNaN(value)
      case 'boolean':
        return typeof value === 'boolean'
      case 'array':
        return Array.isArray(value)
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value)
      case 'date':
        return value instanceof Date || (!isNaN(Date.parse(value)))
      case 'email':
        return typeof value === 'string' && this.isValidEmail(value)
      case 'url':
        return typeof value === 'string' && this.isValidUrl(value)
      default:
        return true
    }
  }

  private validateConstraint(field: string, value: any, constraint: ValidationConstraint): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [], warnings: [] }

    switch (constraint.type) {
      case 'min':
        if (typeof value === 'number' && value < constraint.value) {
          result.errors.push({
            field,
            code: 'MIN_VALUE',
            message: constraint.message || `Value must be at least ${constraint.value}`,
            value,
            constraint: `min:${constraint.value}`
          })
        } else if (typeof value === 'string' && value.length < constraint.value) {
          result.errors.push({
            field,
            code: 'MIN_LENGTH',
            message: constraint.message || `Length must be at least ${constraint.value}`,
            value,
            constraint: `minLength:${constraint.value}`
          })
        }
        break

      case 'max':
        if (typeof value === 'number' && value > constraint.value) {
          result.errors.push({
            field,
            code: 'MAX_VALUE',
            message: constraint.message || `Value must be at most ${constraint.value}`,
            value,
            constraint: `max:${constraint.value}`
          })
        } else if (typeof value === 'string' && value.length > constraint.value) {
          result.errors.push({
            field,
            code: 'MAX_LENGTH',
            message: constraint.message || `Length must be at most ${constraint.value}`,
            value,
            constraint: `maxLength:${constraint.value}`
          })
        }
        break

      case 'pattern':
        if (typeof value === 'string' && !new RegExp(constraint.value).test(value)) {
          result.errors.push({
            field,
            code: 'PATTERN_MISMATCH',
            message: constraint.message || `Value does not match required pattern`,
            value,
            constraint: `pattern:${constraint.value}`
          })
        }
        break

      case 'enum':
        if (!constraint.value.includes(value)) {
          result.errors.push({
            field,
            code: 'INVALID_ENUM',
            message: constraint.message || `Value must be one of: ${constraint.value.join(', ')}`,
            value,
            constraint: `enum:${constraint.value.join(',')}`
          })
        }
        break

      case 'format':
        const formatValid = this.validateFormat(value, constraint.value)
        if (!formatValid) {
          result.errors.push({
            field,
            code: 'INVALID_FORMAT',
            message: constraint.message || `Invalid ${constraint.value} format`,
            value,
            constraint: `format:${constraint.value}`
          })
        }
        break
    }

    result.valid = result.errors.length === 0
    return result
  }

  private validateFormat(value: any, format: string): boolean {
    switch (format) {
      case 'email':
        return this.isValidEmail(value)
      case 'url':
        return this.isValidUrl(value)
      case 'uuid':
        return this.isValidUuid(value)
      case 'phone':
        return this.isValidPhone(value)
      case 'naics':
        return this.isValidNaics(value)
      case 'cage':
        return this.isValidCage(value)
      case 'duns':
        return this.isValidDuns(value)
      case 'uei':
        return this.isValidUei(value)
      default:
        return true
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  private isValidUuid(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(uuid)
  }

  private isValidPhone(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/
    return phoneRegex.test(phone.replace(/[\s\-\(\)\.]/g, ''))
  }

  private isValidNaics(naics: string): boolean {
    const naicsRegex = /^[1-9]\d{5}$/
    return naicsRegex.test(naics)
  }

  private isValidCage(cage: string): boolean {
    const cageRegex = /^[A-Z0-9]{5}$/
    return cageRegex.test(cage.toUpperCase())
  }

  private isValidDuns(duns: string): boolean {
    const dunsRegex = /^\d{9}$/
    return dunsRegex.test(duns.replace(/[\s\-]/g, ''))
  }

  private isValidUei(uei: string): boolean {
    const ueiRegex = /^[A-Z0-9]{12}$/
    return ueiRegex.test(uei.toUpperCase())
  }

  private getFieldValue(data: any, field: string): any {
    const parts = field.split('.')
    let value = data

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined
      }
      value = value[part]
    }

    return value
  }

  private initializeValidations(): void {
    // Sources Sought endpoint validations
    this.addEndpointValidation({
      path: '/sources-sought',
      method: 'GET',
      parameters: [
        {
          field: 'page',
          type: 'number',
          required: false,
          constraints: [
            { type: 'min', value: 1, message: 'Page must be at least 1' }
          ]
        },
        {
          field: 'limit',
          type: 'number',
          required: false,
          constraints: [
            { type: 'min', value: 1, message: 'Limit must be at least 1' },
            { type: 'max', value: 100, message: 'Limit cannot exceed 100' }
          ]
        },
        {
          field: 'naics',
          type: 'string',
          required: false,
          constraints: [
            { type: 'format', value: 'naics', message: 'Invalid NAICS code format' }
          ]
        },
        {
          field: 'agency',
          type: 'string',
          required: false,
          constraints: [
            { type: 'min', value: 2, message: 'Agency must be at least 2 characters' }
          ]
        }
      ],
      responses: {
        '200': [
          {
            field: 'success',
            type: 'boolean',
            required: true
          },
          {
            field: 'data.opportunities',
            type: 'array',
            required: true
          },
          {
            field: 'data.pagination',
            type: 'object',
            required: true
          }
        ]
      }
    })

    // Workflow creation validation
    this.addEndpointValidation({
      path: '/workflows',
      method: 'POST',
      parameters: [],
      requestBody: [
        {
          field: 'name',
          type: 'string',
          required: true,
          constraints: [
            { type: 'min', value: 3, message: 'Name must be at least 3 characters' },
            { type: 'max', value: 100, message: 'Name cannot exceed 100 characters' }
          ]
        },
        {
          field: 'type',
          type: 'string',
          required: true,
          constraints: [
            { 
              type: 'enum', 
              value: ['sources_sought_response', 'document_generation', 'notification'], 
              message: 'Invalid workflow type' 
            }
          ]
        },
        {
          field: 'triggers',
          type: 'array',
          required: true,
          constraints: [
            { type: 'min', value: 1, message: 'At least one trigger is required' }
          ]
        },
        {
          field: 'steps',
          type: 'array',
          required: true,
          constraints: [
            { type: 'min', value: 1, message: 'At least one step is required' }
          ]
        }
      ],
      responses: {
        '201': [
          {
            field: 'success',
            type: 'boolean',
            required: true
          },
          {
            field: 'data.id',
            type: 'string',
            required: true
          }
        ]
      }
    })

    // User profile validation
    this.addEndpointValidation({
      path: '/users/profile',
      method: 'PUT',
      parameters: [],
      requestBody: [
        {
          field: 'email',
          type: 'email',
          required: false,
          constraints: [
            { type: 'format', value: 'email', message: 'Invalid email format' }
          ]
        },
        {
          field: 'firstName',
          type: 'string',
          required: false,
          constraints: [
            { type: 'min', value: 1, message: 'First name cannot be empty' },
            { type: 'max', value: 50, message: 'First name cannot exceed 50 characters' }
          ]
        },
        {
          field: 'lastName',
          type: 'string',
          required: false,
          constraints: [
            { type: 'min', value: 1, message: 'Last name cannot be empty' },
            { type: 'max', value: 50, message: 'Last name cannot exceed 50 characters' }
          ]
        },
        {
          field: 'cageCode',
          type: 'string',
          required: false,
          constraints: [
            { type: 'format', value: 'cage', message: 'Invalid CAGE code format' }
          ]
        },
        {
          field: 'dunsNumber',
          type: 'string',
          required: false,
          constraints: [
            { type: 'format', value: 'duns', message: 'Invalid DUNS number format' }
          ]
        },
        {
          field: 'ueiNumber',
          type: 'string',
          required: false,
          constraints: [
            { type: 'format', value: 'uei', message: 'Invalid UEI number format' }
          ]
        }
      ],
      responses: {
        '200': [
          {
            field: 'success',
            type: 'boolean',
            required: true
          },
          {
            field: 'data',
            type: 'object',
            required: true
          }
        ]
      }
    })
  }

  private async generateValidationSchemas(): Promise<void> {
    // Generate schemas for common data structures
    this.addSchemaValidation({
      name: 'SourcesSought',
      rules: [
        {
          field: 'id',
          type: 'string',
          required: true
        },
        {
          field: 'title',
          type: 'string',
          required: true,
          constraints: [
            { type: 'min', value: 5, message: 'Title must be at least 5 characters' }
          ]
        },
        {
          field: 'agency',
          type: 'string',
          required: true
        },
        {
          field: 'naicsCode',
          type: 'string',
          required: true,
          constraints: [
            { type: 'format', value: 'naics', message: 'Invalid NAICS code' }
          ]
        },
        {
          field: 'responseDeadline',
          type: 'date',
          required: true
        }
      ],
      required: ['id', 'title', 'agency', 'naicsCode', 'responseDeadline'],
      additionalProperties: true
    })

    this.addSchemaValidation({
      name: 'UserProfile',
      rules: [
        {
          field: 'id',
          type: 'string',
          required: true
        },
        {
          field: 'email',
          type: 'email',
          required: true
        },
        {
          field: 'firstName',
          type: 'string',
          required: true
        },
        {
          field: 'lastName',
          type: 'string',
          required: true
        },
        {
          field: 'cageCode',
          type: 'string',
          required: false,
          constraints: [
            { type: 'format', value: 'cage', message: 'Invalid CAGE code' }
          ]
        }
      ],
      required: ['id', 'email', 'firstName', 'lastName'],
      additionalProperties: true
    })
  }
}

export default ApiValidation