import {
  initializeAgentSystem,
  createSourcesSoughtWorkflow,
  agentOrchestrator,
} from '@/lib/agents'

// Mock external dependencies
jest.mock('@/lib/aws-config', () => ({
  AWS_RESOURCES: {
    TABLES: {
      USERS: 'test-users',
      OPPORTUNITIES: 'test-opportunities',
    },
  },
}))

global.fetch = jest.fn()

describe('Sources Sought Workflow Integration', () => {
  let agentSystem: any

  beforeAll(async () => {
    // Mock SAM.gov API responses
    ;(fetch as jest.MockedFunction<typeof fetch>).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('api.sam.gov')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            opportunitiesData: [
              {
                noticeId: 'test-001',
                title: 'Software Development Services',
                description: 'Custom software development for government agency',
                naicsCode: '541511',
                department: 'DOD',
                agency: 'Department of Defense',
                postedDate: '2024-01-15',
                responseDeadline: '2024-02-15',
                pointOfContact: {
                  name: 'John Smith',
                  email: 'john.smith@dod.gov',
                  phone: '555-123-4567',
                },
              },
            ],
            totalRecords: 1,
          }),
        } as Response)
      }
      return Promise.reject(new Error('Unknown URL'))
    })

    // Initialize the agent system
    process.env.SAM_GOV_API_KEY = 'test-api-key'
    agentSystem = await initializeAgentSystem()
  }, 30000)

  afterAll(async () => {
    await agentOrchestrator.shutdown()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Complete Sources Sought Workflow', () => {
    it('should execute end-to-end workflow successfully', async () => {
      const userProfile = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@testcompany.com',
        companyName: 'Test Software Company',
        companyDescription: 'A leading software development company specializing in government solutions',
        keywords: ['software', 'development', 'web'],
        naicsCodes: ['541511', '541512'],
        capabilities: ['software development', 'web development', 'cloud computing'],
        pastProjects: [
          {
            title: 'Government Web Portal',
            customer: 'Department of Veterans Affairs',
            value: '$500,000',
            description: 'Built a comprehensive web portal for veterans services',
            startDate: '2023-01-01',
            endDate: '2023-12-31',
          },
          {
            title: 'Data Analytics Platform',
            customer: 'Department of Education',
            value: '$750,000',
            description: 'Developed analytics platform for educational data',
            startDate: '2022-06-01',
            endDate: '2023-05-31',
          },
        ],
        certifications: ['small business', 'sdvosb', 'iso-9001'],
        contactInfo: {
          name: 'John Doe',
          title: 'CEO',
          phone: '555-123-4567',
          address: '123 Main St, City, State 12345',
        },
      }

      const workflowDefinition = createSourcesSoughtWorkflow('test-001', userProfile)

      // Execute the workflow
      const result = await agentOrchestrator.executeWorkflow(workflowDefinition)

      // Verify workflow execution
      expect(result.success).toBe(true)
      expect(result.workflowId).toBeDefined()
      expect(result.errors).toHaveLength(0)

      // Verify each step was completed
      expect(result.results).toHaveProperty('search_opportunities')
      expect(result.results).toHaveProperty('analyze_opportunity')
      expect(result.results).toHaveProperty('generate_response')
      expect(result.results).toHaveProperty('validate_compliance')

      // Verify opportunities were found
      const searchResults = result.results.search_opportunities
      expect(searchResults.opportunities).toHaveLength(1)
      expect(searchResults.opportunities[0].title).toBe('Software Development Services')

      // Verify opportunity analysis
      const analysis = result.results.analyze_opportunity
      expect(analysis.analysis).toBeDefined()
      expect(analysis.analysis.matchScore).toBeGreaterThan(0)
      expect(analysis.analysis.strengths).toBeInstanceOf(Array)

      // Verify response generation
      const response = result.results.generate_response
      expect(response.responseDocument).toBeDefined()
      expect(response.responseDocument.content).toContain('Test Software Company')
      expect(response.responseDocument.content).toContain('SOURCES SOUGHT RESPONSE')

      // Verify compliance validation
      const compliance = result.results.validate_compliance
      expect(compliance.validation).toBeDefined()
      expect(compliance.validation).toHaveProperty('isCompliant')
    }, 60000)

    it('should handle workflow step failures gracefully', async () => {
      const userProfile = {
        id: 'user-123',
        name: 'John Doe',
        email: 'invalid-email', // This will cause email step to fail
        keywords: [],
        naicsCodes: [],
        capabilities: [],
        pastProjects: [],
        certifications: [],
      }

      const workflowDefinition = createSourcesSoughtWorkflow('test-001', userProfile)

      const result = await agentOrchestrator.executeWorkflow(workflowDefinition)

      // The core steps should still succeed, only optional email step might fail
      expect(result.workflowId).toBeDefined()
      expect(result.results).toHaveProperty('search_opportunities')
      expect(result.results).toHaveProperty('analyze_opportunity')
      expect(result.results).toHaveProperty('generate_response')
    }, 30000)

    it('should execute workflow with variable substitution', async () => {
      const userProfile = {
        id: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        companyName: 'Test Company',
        keywords: ['software'],
        naicsCodes: ['541511'],
        capabilities: ['programming'],
        pastProjects: [],
        certifications: ['small business'],
      }

      const workflowDefinition = createSourcesSoughtWorkflow('test-001', userProfile)

      const result = await agentOrchestrator.executeWorkflow(workflowDefinition)

      expect(result.success).toBe(true)

      // Verify that variables were properly substituted between steps
      const searchResults = result.results.search_opportunities
      const analysisResults = result.results.analyze_opportunity
      const responseResults = result.results.generate_response

      expect(searchResults.opportunities).toBeDefined()
      expect(analysisResults.opportunity).toBeDefined()
      expect(responseResults.responseDocument).toBeDefined()
    }, 30000)
  })

  describe('Agent Communication', () => {
    it('should route messages between agents correctly', async () => {
      // Test direct communication between Sources Sought and Document agents
      const searchResponse = await agentOrchestrator.sendMessage({
        type: 'request',
        from: 'test-orchestrator',
        to: 'specialist_sources_sought_specialist',
        payload: {
          capability: 'search_opportunities',
          input: {
            keywords: ['software'],
            limit: 5,
          },
        },
        requiresResponse: true,
      })

      expect(searchResponse).not.toBeNull()
      expect(searchResponse?.type).toBe('response')
      expect(searchResponse?.payload.opportunities).toBeDefined()

      // Test document classification
      const classifyResponse = await agentOrchestrator.sendMessage({
        type: 'request',
        from: 'test-orchestrator',
        to: 'specialist_document_specialist',
        payload: {
          capability: 'classify_document',
          input: {
            content: 'This is a sample Sources Sought response document.',
            filename: 'response.txt',
          },
        },
        requiresResponse: true,
      })

      expect(classifyResponse).not.toBeNull()
      expect(classifyResponse?.type).toBe('response')
      expect(classifyResponse?.payload.classification).toBeDefined()
    }, 30000)

    it('should handle agent broadcast messages', async () => {
      const responses = await agentOrchestrator.broadcast({
        from: 'test-orchestrator',
        payload: {
          capability: 'health_check',
          input: {},
        },
      })

      // Should receive responses from multiple agents
      expect(responses.length).toBeGreaterThan(0)
    }, 30000)
  })

  describe('Error Handling and Recovery', () => {
    it('should handle SAM.gov API failures gracefully', async () => {
      // Mock API failure
      ;(fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Network error')
      )

      const response = await agentOrchestrator.sendMessage({
        type: 'request',
        from: 'test-orchestrator',
        to: 'specialist_sources_sought_specialist',
        payload: {
          capability: 'search_opportunities',
          input: {
            keywords: ['software'],
          },
        },
        requiresResponse: true,
      })

      expect(response?.type).toBe('error')
      expect(response?.payload.message).toContain('Failed to search opportunities')
    }, 30000)

    it('should handle invalid workflow definitions', async () => {
      const invalidWorkflow = {
        id: 'invalid-workflow',
        name: 'Invalid Workflow',
        description: 'Workflow with invalid capability',
        steps: [
          {
            id: 'invalid-step',
            capability: 'nonexistent_capability',
            input: {},
          },
        ],
      }

      const result = await agentOrchestrator.executeWorkflow(invalidWorkflow)

      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('No agent found with capability')
    }, 30000)
  })

  describe('Performance and Concurrency', () => {
    it('should handle multiple concurrent workflows', async () => {
      const userProfiles = Array.from({ length: 3 }, (_, i) => ({
        id: `user-${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        companyName: `Company ${i}`,
        keywords: ['software'],
        naicsCodes: ['541511'],
        capabilities: ['programming'],
        pastProjects: [],
        certifications: ['small business'],
      }))

      const workflows = userProfiles.map((profile, i) =>
        createSourcesSoughtWorkflow(`opp-${i}`, profile)
      )

      const promises = workflows.map(workflow =>
        agentOrchestrator.executeWorkflow(workflow)
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      results.forEach((result, index) => {
        expect(result.success).toBe(true)
        expect(result.workflowId).toContain(`opp-${index}`)
      })
    }, 60000)

    it('should complete workflow within reasonable time', async () => {
      const startTime = Date.now()

      const userProfile = {
        id: 'user-performance-test',
        name: 'Performance Test User',
        email: 'performance@example.com',
        companyName: 'Performance Test Company',
        keywords: ['software'],
        naicsCodes: ['541511'],
        capabilities: ['programming'],
        pastProjects: [],
        certifications: ['small business'],
      }

      const workflowDefinition = createSourcesSoughtWorkflow('perf-test', userProfile)
      const result = await agentOrchestrator.executeWorkflow(workflowDefinition)

      const duration = Date.now() - startTime

      expect(result.success).toBe(true)
      expect(duration).toBeLessThan(30000) // Should complete within 30 seconds
    }, 40000)
  })

  describe('Data Validation and Integrity', () => {
    it('should validate input data schemas', async () => {
      const invalidInput = {
        keywords: 'should be array', // Invalid type
        limit: 'should be number', // Invalid type
      }

      const response = await agentOrchestrator.sendMessage({
        type: 'request',
        from: 'test-orchestrator',
        to: 'specialist_sources_sought_specialist',
        payload: {
          capability: 'search_opportunities',
          input: invalidInput,
        },
        requiresResponse: true,
      })

      expect(response?.type).toBe('error')
      expect(response?.payload.message).toContain('Invalid payload')
    }, 30000)

    it('should maintain data consistency across workflow steps', async () => {
      const userProfile = {
        id: 'user-consistency-test',
        name: 'Consistency Test User',
        email: 'consistency@example.com',
        companyName: 'Consistency Test Company',
        keywords: ['software'],
        naicsCodes: ['541511'],
        capabilities: ['programming'],
        pastProjects: [],
        certifications: ['small business'],
      }

      const workflowDefinition = createSourcesSoughtWorkflow('consistency-test', userProfile)
      const result = await agentOrchestrator.executeWorkflow(workflowDefinition)

      expect(result.success).toBe(true)

      // Verify data flows correctly between steps
      const searchResults = result.results.search_opportunities
      const analysisResults = result.results.analyze_opportunity
      const responseResults = result.results.generate_response

      // Opportunity data should be consistent
      expect(analysisResults.opportunity).toBeDefined()
      expect(responseResults.opportunity).toBeDefined()

      // Generated response should reference correct opportunity
      expect(responseResults.responseDocument.content).toContain('Software Development Services')
    }, 30000)
  })

  describe('System State Management', () => {
    it('should maintain agent health status', async () => {
      const agents = agentOrchestrator.getRegisteredAgents()

      expect(agents.length).toBeGreaterThan(0)
      agents.forEach(agent => {
        expect(agent.status).toMatch(/^(idle|busy|error|offline)$/)
        expect(agent.healthScore).toBeGreaterThanOrEqual(0)
        expect(agent.healthScore).toBeLessThanOrEqual(100)
        expect(agent.lastSeen).toBeGreaterThan(0)
      })
    })

    it('should track workflow execution history', async () => {
      const userProfile = {
        id: 'user-history-test',
        name: 'History Test User',
        email: 'history@example.com',
        companyName: 'History Test Company',
        keywords: ['software'],
        naicsCodes: ['541511'],
        capabilities: ['programming'],
        pastProjects: [],
        certifications: ['small business'],
      }

      const workflowDefinition = createSourcesSoughtWorkflow('history-test', userProfile)
      const result = await agentOrchestrator.executeWorkflow(workflowDefinition)

      expect(result.success).toBe(true)
      expect(result.workflowId).toBeDefined()
      expect(result.duration).toBeGreaterThan(0)
      expect(result.completedAt).toBeGreaterThan(0)
    }, 30000)
  })
})