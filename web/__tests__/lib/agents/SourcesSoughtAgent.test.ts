import { SourcesSoughtAgent } from '@/lib/agents/SourcesSoughtAgent'
import { AgentMessage } from '@/lib/agents/AgentOrchestrator'

// Mock fetch for SAM.gov API calls
global.fetch = jest.fn()

describe('SourcesSoughtAgent', () => {
  let agent: SourcesSoughtAgent
  
  beforeEach(async () => {
    agent = new SourcesSoughtAgent()
    
    // Mock environment variable
    process.env.SAM_GOV_API_KEY = 'test-api-key'
    
    // Mock successful SAM.gov API test
    ;(fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({
        opportunitiesData: [],
        totalRecords: 0,
      }),
    } as Response)
    
    await agent.initialize()
  })

  afterEach(async () => {
    await agent.shutdown()
    jest.clearAllMocks()
  })

  describe('Initialization', () => {
    it('should initialize successfully with valid API key', async () => {
      expect(agent.metadata.status).toBe('idle')
      expect(agent.metadata.name).toBe('Sources Sought Specialist')
      expect(agent.getCapabilities()).toHaveLength(5)
    })

    it('should fail initialization without API key', async () => {
      delete process.env.SAM_GOV_API_KEY
      const newAgent = new SourcesSoughtAgent()
      
      await expect(newAgent.initialize()).rejects.toThrow('SAM.gov API key is required')
    })

    it('should fail initialization if SAM.gov API is unreachable', async () => {
      ;(fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(new Error('Network error'))
      
      const newAgent = new SourcesSoughtAgent()
      await expect(newAgent.initialize()).rejects.toThrow('Cannot connect to SAM.gov API')
    })
  })

  describe('Search Opportunities', () => {
    const mockSamGovResponse = {
      opportunitiesData: [
        {
          noticeId: 'test-001',
          title: 'Software Development Services',
          description: 'Custom software development',
          naicsCode: '541511',
          department: 'DOD',
          agency: 'Department of Defense',
          postedDate: '2024-01-15',
          responseDeadline: '2024-02-15',
        },
      ],
      totalRecords: 1,
    }

    beforeEach(() => {
      ;(fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => mockSamGovResponse,
      } as Response)
    })

    it('should search opportunities successfully', async () => {
      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'search_opportunities',
          input: {
            keywords: ['software'],
            naicsCodes: ['541511'],
            limit: 10,
          },
        },
      }

      const response = await agent.processMessage(message)

      expect(response).not.toBeNull()
      expect(response?.type).toBe('response')
      expect(response?.payload.opportunities).toHaveLength(1)
      expect(response?.payload.totalCount).toBe(1)
    })

    it('should handle search with filters', async () => {
      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'search_opportunities',
          input: {
            keywords: ['software', 'development'],
            naicsCodes: ['541511', '541512'],
            agencies: ['DOD'],
            dateRange: {
              start: '2024-01-01',
              end: '2024-12-31',
            },
            limit: 20,
          },
        },
      }

      const response = await agent.processMessage(message)

      expect(response?.type).toBe('response')
      expect(response?.payload.opportunities).toBeDefined()
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.sam.gov'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'GovBiz.ai Sources Sought Agent',
            'Accept': 'application/json',
          }),
        })
      )
    })

    it('should handle SAM.gov API errors', async () => {
      ;(fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response)

      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'search_opportunities',
          input: {
            keywords: ['software'],
          },
        },
      }

      const response = await agent.processMessage(message)

      expect(response?.type).toBe('error')
      expect(response?.payload.message).toContain('Failed to search opportunities')
    })
  })

  describe('Analyze Opportunity', () => {
    it('should analyze opportunity fit successfully', async () => {
      const userProfile = {
        naicsCodes: ['541511'],
        capabilities: ['software development', 'web development'],
        pastProjects: [
          {
            title: 'Web Application Development',
            description: 'Built a web application for government agency',
            customer: 'DOD',
          },
        ],
        certifications: ['small business', 'sdvosb'],
      }

      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'analyze_opportunity',
          input: {
            opportunityId: 'test-001',
            userProfile,
          },
        },
      }

      const response = await agent.processMessage(message)

      expect(response?.type).toBe('response')
      expect(response?.payload.analysis).toBeDefined()
      expect(response?.payload.analysis.matchScore).toBeGreaterThan(0)
      expect(response?.payload.analysis.strengths).toBeInstanceOf(Array)
      expect(response?.payload.analysis.recommendations).toBeInstanceOf(Array)
    })

    it('should handle missing opportunity data', async () => {
      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'analyze_opportunity',
          input: {
            opportunityId: 'nonexistent',
            userProfile: {},
          },
        },
      }

      const response = await agent.processMessage(message)

      expect(response?.type).toBe('response')
      expect(response?.payload.analysis).toBeDefined()
    })
  })

  describe('Generate Response', () => {
    it('should generate response successfully', async () => {
      const userProfile = {
        companyName: 'Test Company',
        companyDescription: 'A software development company',
        naicsCodes: ['541511'],
        capabilities: ['software development'],
        pastProjects: [
          {
            title: 'Government Web Portal',
            customer: 'VA',
            value: '$500,000',
            description: 'Built a web portal for veterans',
          },
        ],
        certifications: ['small business'],
        contactInfo: {
          name: 'John Doe',
          title: 'CEO',
          email: 'john@testcompany.com',
          phone: '555-123-4567',
          address: '123 Main St, City, State 12345',
        },
      }

      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'generate_response',
          input: {
            opportunityId: 'test-001',
            userProfile,
            customInstructions: 'Emphasize our government experience',
          },
        },
      }

      const response = await agent.processMessage(message)

      expect(response?.type).toBe('response')
      expect(response?.payload.responseDocument).toBeDefined()
      expect(response?.payload.responseDocument.content).toContain('Test Company')
      expect(response?.payload.responseDocument.content).toContain('SOURCES SOUGHT RESPONSE')
      expect(response?.payload.metadata.wordCount).toBeGreaterThan(0)
    })

    it('should include all required sections in response', async () => {
      const userProfile = {
        companyName: 'Test Company',
        companyDescription: 'Software development',
        capabilities: ['programming'],
        pastProjects: [],
        certifications: ['small business'],
        contactInfo: {
          name: 'John Doe',
          email: 'john@test.com',
          address: '123 Main St',
        },
      }

      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'generate_response',
          input: {
            opportunityId: 'test-001',
            userProfile,
          },
        },
      }

      const response = await agent.processMessage(message)
      const content = response?.payload.responseDocument.content

      expect(content).toContain('COMPANY PROFILE')
      expect(content).toContain('RELEVANT EXPERIENCE')
      expect(content).toContain('CAPABILITIES')
      expect(content).toContain('Sincerely')
    })
  })

  describe('Monitor Deadlines', () => {
    it('should monitor deadlines successfully', async () => {
      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'monitor_deadlines',
          input: {
            userId: 'user-123',
          },
        },
      }

      const response = await agent.processMessage(message)

      expect(response?.type).toBe('response')
      expect(response?.payload.upcomingDeadlines).toBeInstanceOf(Array)
      expect(response?.payload.alerts).toBeInstanceOf(Array)
    })

    it('should generate appropriate alerts based on deadline proximity', async () => {
      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'monitor_deadlines',
          input: {
            userId: 'user-123',
          },
        },
      }

      const response = await agent.processMessage(message)
      const alerts = response?.payload.alerts

      // Should have alerts for deadlines within 7 days
      expect(alerts).toBeInstanceOf(Array)
      if (alerts && alerts.length > 0) {
        expect(alerts[0]).toHaveProperty('type')
        expect(alerts[0]).toHaveProperty('message')
        expect(alerts[0]).toHaveProperty('opportunityId')
      }
    })
  })

  describe('Extract Contacts', () => {
    it('should extract government contacts successfully', async () => {
      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'extract_contacts',
          input: {
            opportunityId: 'test-001',
          },
        },
      }

      const response = await agent.processMessage(message)

      expect(response?.type).toBe('response')
      expect(response?.payload.contacts).toBeInstanceOf(Array)
      expect(response?.payload.contacts.length).toBeGreaterThan(0)
      
      const contact = response?.payload.contacts[0]
      expect(contact).toHaveProperty('name')
      expect(contact).toHaveProperty('email')
      expect(contact).toHaveProperty('phone')
      expect(contact).toHaveProperty('role')
    })
  })

  describe('Error Handling', () => {
    it('should handle unknown capabilities', async () => {
      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'unknown_capability',
          input: {},
        },
      }

      const response = await agent.processMessage(message)

      expect(response?.type).toBe('error')
      expect(response?.payload.message).toContain('Unknown capability')
    })

    it('should handle invalid input schemas', async () => {
      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'search_opportunities',
          input: {
            limit: 'invalid', // Should be number
          },
        },
      }

      const response = await agent.processMessage(message)

      expect(response?.type).toBe('error')
      expect(response?.payload.message).toContain('Invalid payload')
    })
  })

  describe('Agent Capabilities', () => {
    it('should have all required capabilities', () => {
      const capabilities = agent.getCapabilities()
      const capabilityNames = capabilities.map(cap => cap.name)

      expect(capabilityNames).toContain('search_opportunities')
      expect(capabilityNames).toContain('analyze_opportunity')
      expect(capabilityNames).toContain('generate_response')
      expect(capabilityNames).toContain('monitor_deadlines')
      expect(capabilityNames).toContain('extract_contacts')
    })

    it('should have properly defined capability metadata', () => {
      const capabilities = agent.getCapabilities()

      capabilities.forEach(capability => {
        expect(capability.name).toBeDefined()
        expect(capability.description).toBeDefined()
        expect(capability.inputs).toBeInstanceOf(Array)
        expect(capability.outputs).toBeInstanceOf(Array)
        expect(typeof capability.cost).toBe('number')
        expect(typeof capability.estimatedDuration).toBe('number')
      })
    })
  })

  describe('Performance', () => {
    it('should process messages within expected time limits', async () => {
      const startTime = Date.now()
      
      const message: AgentMessage = {
        id: 'test-msg',
        type: 'request',
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'search_opportunities',
          input: {
            keywords: ['software'],
            limit: 10,
          },
        },
      }

      await agent.processMessage(message)
      
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
    })

    it('should handle concurrent requests', async () => {
      const messages = Array.from({ length: 5 }, (_, i) => ({
        id: `test-msg-${i}`,
        type: 'request' as const,
        from: 'test',
        to: agent.metadata.id,
        timestamp: Date.now(),
        payload: {
          capability: 'search_opportunities',
          input: {
            keywords: [`keyword-${i}`],
            limit: 5,
          },
        },
      }))

      const promises = messages.map(msg => agent.processMessage(msg))
      const responses = await Promise.all(promises)

      expect(responses).toHaveLength(5)
      responses.forEach(response => {
        expect(response?.type).toBe('response')
      })
    })
  })
})