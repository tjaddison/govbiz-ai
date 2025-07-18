import { rest } from 'msw'

// Mock data
const mockOpportunities = [
  {
    id: 'opp-001',
    title: 'Software Development Services',
    description: 'Seeking vendors for custom software development',
    agency: 'Department of Defense',
    naicsCode: '541511',
    postedDate: '2024-01-15T10:00:00Z',
    responseDeadline: '2024-02-15T17:00:00Z',
    pointOfContact: {
      name: 'John Smith',
      email: 'john.smith@dod.gov',
      phone: '555-123-4567',
    },
  },
  {
    id: 'opp-002',
    title: 'IT Support Services',
    description: 'Technical support and maintenance services',
    agency: 'Department of Veterans Affairs',
    naicsCode: '541512',
    postedDate: '2024-01-10T14:30:00Z',
    responseDeadline: '2024-02-10T17:00:00Z',
    pointOfContact: {
      name: 'Jane Doe',
      email: 'jane.doe@va.gov',
      phone: '555-987-6543',
    },
  },
]

const mockUsers = [
  {
    id: 'user-001',
    email: 'test@example.com',
    name: 'Test User',
    company: 'Test Company',
    naicsCodes: ['541511', '541512'],
    capabilities: ['software development', 'web development'],
    certifications: ['small business', 'sdvosb'],
  },
]

const mockConversations = [
  {
    id: 'conv-001',
    userId: 'user-001',
    title: 'Onboarding Discussion',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T11:30:00Z',
    status: 'active',
  },
]

const mockMessages = [
  {
    id: 'msg-001',
    conversationId: 'conv-001',
    content: 'Hello! I can help you find Sources Sought opportunities.',
    sender: 'assistant',
    timestamp: '2024-01-15T10:00:00Z',
  },
  {
    id: 'msg-002',
    conversationId: 'conv-001',
    content: 'I need help finding software development opportunities.',
    sender: 'user',
    timestamp: '2024-01-15T10:01:00Z',
  },
]

export const handlers = [
  // SAM.gov API mocks
  rest.get('https://api.sam.gov/prod/opportunities/v2/search', (req, res, ctx) => {
    const noticeType = req.url.searchParams.get('noticeType')
    const q = req.url.searchParams.get('q')
    const limit = req.url.searchParams.get('limit') || '20'
    
    // Filter opportunities based on query parameters
    let filteredOpportunities = mockOpportunities
    
    if (q) {
      const query = q.toLowerCase()
      filteredOpportunities = mockOpportunities.filter(opp =>
        opp.title.toLowerCase().includes(query) ||
        opp.description.toLowerCase().includes(query)
      )
    }
    
    return res(
      ctx.status(200),
      ctx.json({
        opportunitiesData: filteredOpportunities.slice(0, parseInt(limit)),
        totalRecords: filteredOpportunities.length,
      })
    )
  }),

  // Internal API mocks
  rest.get('/api/opportunities', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        opportunities: mockOpportunities,
        total: mockOpportunities.length,
      })
    )
  }),

  rest.get('/api/opportunities/:id', (req, res, ctx) => {
    const { id } = req.params
    const opportunity = mockOpportunities.find(opp => opp.id === id)
    
    if (!opportunity) {
      return res(
        ctx.status(404),
        ctx.json({ error: 'Opportunity not found' })
      )
    }
    
    return res(
      ctx.status(200),
      ctx.json(opportunity)
    )
  }),

  rest.post('/api/opportunities/:id/analyze', (req, res, ctx) => {
    const { id } = req.params
    const opportunity = mockOpportunities.find(opp => opp.id === id)
    
    if (!opportunity) {
      return res(
        ctx.status(404),
        ctx.json({ error: 'Opportunity not found' })
      )
    }
    
    return res(
      ctx.status(200),
      ctx.json({
        matchScore: 85,
        analysis: {
          strengths: ['NAICS code match', 'Relevant experience'],
          weaknesses: ['Limited government experience'],
          recommendations: ['Partner with experienced contractor'],
        },
      })
    )
  }),

  rest.post('/api/opportunities/:id/response', (req, res, ctx) => {
    const { id } = req.params
    
    return res(
      ctx.status(200),
      ctx.json({
        responseId: 'resp-001',
        content: 'Generated Sources Sought response content...',
        wordCount: 250,
        generatedAt: new Date().toISOString(),
      })
    )
  }),

  // User management
  rest.get('/api/users/:id', (req, res, ctx) => {
    const { id } = req.params
    const user = mockUsers.find(u => u.id === id)
    
    if (!user) {
      return res(
        ctx.status(404),
        ctx.json({ error: 'User not found' })
      )
    }
    
    return res(
      ctx.status(200),
      ctx.json(user)
    )
  }),

  rest.put('/api/users/:id', (req, res, ctx) => {
    const { id } = req.params
    const updateData = req.body
    
    return res(
      ctx.status(200),
      ctx.json({
        ...mockUsers[0],
        ...updateData,
        updatedAt: new Date().toISOString(),
      })
    )
  }),

  // Conversations
  rest.get('/api/conversations', (req, res, ctx) => {
    const userId = req.url.searchParams.get('userId')
    
    let conversations = mockConversations
    if (userId) {
      conversations = mockConversations.filter(conv => conv.userId === userId)
    }
    
    return res(
      ctx.status(200),
      ctx.json(conversations)
    )
  }),

  rest.post('/api/conversations', (req, res, ctx) => {
    const newConversation = {
      id: `conv-${Date.now()}`,
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
    }
    
    return res(
      ctx.status(201),
      ctx.json(newConversation)
    )
  }),

  // Messages
  rest.get('/api/conversations/:id/messages', (req, res, ctx) => {
    const { id } = req.params
    const conversationMessages = mockMessages.filter(msg => msg.conversationId === id)
    
    return res(
      ctx.status(200),
      ctx.json(conversationMessages)
    )
  }),

  rest.post('/api/conversations/:id/messages', (req, res, ctx) => {
    const { id } = req.params
    const newMessage = {
      id: `msg-${Date.now()}`,
      conversationId: id,
      ...req.body,
      timestamp: new Date().toISOString(),
    }
    
    return res(
      ctx.status(201),
      ctx.json(newMessage)
    )
  }),

  // Document operations
  rest.post('/api/documents/classify', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        classification: {
          type: 'proposal',
          confidence: 0.92,
          securityLevel: 'internal',
          metadata: {
            wordCount: 1500,
            pages: 3,
            hasImages: false,
          },
        },
      })
    )
  }),

  rest.post('/api/documents/generate', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        document: {
          content: 'Generated document content...',
          format: 'pdf',
          metadata: {
            wordCount: 500,
            pageCount: 2,
            generatedAt: new Date().toISOString(),
          },
        },
      })
    )
  }),

  // Workflow operations
  rest.post('/api/workflows/execute', (req, res, ctx) => {
    const { workflowType } = req.body
    
    return res(
      ctx.status(200),
      ctx.json({
        workflowId: `wf-${Date.now()}`,
        status: 'running',
        estimatedCompletion: Date.now() + 30000,
      })
    )
  }),

  rest.get('/api/workflows/:id/status', (req, res, ctx) => {
    const { id } = req.params
    
    return res(
      ctx.status(200),
      ctx.json({
        workflowId: id,
        status: 'completed',
        progress: 100,
        results: {
          success: true,
          outputs: ['Analysis completed', 'Response generated'],
        },
      })
    )
  }),

  // Monitoring and health
  rest.get('/api/health', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'healthy',
          storage: 'healthy',
          messaging: 'healthy',
          ai: 'healthy',
        },
      })
    )
  }),

  rest.get('/api/metrics', (req, res, ctx) => {
    const metricType = req.url.searchParams.get('type')
    
    return res(
      ctx.status(200),
      ctx.json({
        metrics: [
          {
            name: 'response_time',
            value: 150,
            timestamp: Date.now(),
            unit: 'ms',
          },
          {
            name: 'active_users',
            value: 25,
            timestamp: Date.now(),
            unit: 'count',
          },
        ],
      })
    )
  }),

  // Notifications
  rest.post('/api/notifications/send', (req, res, ctx) => {
    const { type, recipient } = req.body
    
    return res(
      ctx.status(200),
      ctx.json({
        messageId: `msg-${Date.now()}`,
        status: 'sent',
        deliveryTime: Date.now(),
        recipient,
      })
    )
  }),

  // Authentication
  rest.post('/api/auth/login', (req, res, ctx) => {
    const { email, password } = req.body
    
    if (email === 'test@example.com' && password === 'password') {
      return res(
        ctx.status(200),
        ctx.json({
          user: mockUsers[0],
          token: 'mock-jwt-token',
          expiresAt: Date.now() + 3600000, // 1 hour
        })
      )
    }
    
    return res(
      ctx.status(401),
      ctx.json({ error: 'Invalid credentials' })
    )
  }),

  rest.post('/api/auth/logout', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({ success: true })
    )
  }),

  // Error simulation endpoints
  rest.get('/api/test/error', (req, res, ctx) => {
    return res(
      ctx.status(500),
      ctx.json({ error: 'Internal server error' })
    )
  }),

  rest.get('/api/test/timeout', (req, res, ctx) => {
    return res(
      ctx.delay(30000), // 30 second delay to simulate timeout
      ctx.status(200),
      ctx.json({ message: 'This should timeout' })
    )
  }),

  // Rate limiting test
  rest.get('/api/test/rate-limit', (req, res, ctx) => {
    return res(
      ctx.status(429),
      ctx.json({ error: 'Rate limit exceeded' })
    )
  }),
]