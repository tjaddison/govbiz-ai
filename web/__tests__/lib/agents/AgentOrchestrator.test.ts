import { AgentOrchestrator, AgentMessage, AgentCapability } from '@/lib/agents/AgentOrchestrator'
import { BaseAgent } from '@/lib/agents/BaseAgent'

// Mock agent for testing
class MockAgent extends BaseAgent {
  constructor(
    id: string,
    name: string,
    capabilities: AgentCapability[] = []
  ) {
    super({
      id,
      name,
      type: 'utility',
      description: 'Mock agent for testing',
      capabilities,
      version: '1.0.0',
    })
  }

  protected async onInitialize(): Promise<void> {
    // Mock initialization
  }

  protected async onShutdown(): Promise<void> {
    // Mock shutdown
  }

  protected async onProcessMessage(message: AgentMessage): Promise<AgentMessage | null> {
    if (message.payload.capability === 'test_capability') {
      return this.createResponse(message, {
        result: 'success',
        processedBy: this.metadata.id,
      })
    }

    if (message.payload.capability === 'error_capability') {
      throw new Error('Test error')
    }

    return null
  }
}

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator
  let mockAgent1: MockAgent
  let mockAgent2: MockAgent

  beforeEach(() => {
    orchestrator = new AgentOrchestrator()
    mockAgent1 = new MockAgent('agent1', 'Test Agent 1', [
      {
        name: 'test_capability',
        description: 'Test capability',
        inputs: ['input1'],
        outputs: ['output1'],
      },
    ])
    mockAgent2 = new MockAgent('agent2', 'Test Agent 2', [
      {
        name: 'another_capability',
        description: 'Another test capability',
        inputs: ['input2'],
        outputs: ['output2'],
      },
    ])
  })

  afterEach(async () => {
    await orchestrator.shutdown()
  })

  describe('Agent Registration', () => {
    it('should register an agent successfully', async () => {
      await orchestrator.registerAgent(mockAgent1)
      
      expect(orchestrator.isAgentRegistered('agent1')).toBe(true)
      expect(orchestrator.getRegisteredAgents()).toHaveLength(1)
      expect(orchestrator.getRegisteredAgents()[0].id).toBe('agent1')
    })

    it('should emit agentRegistered event when agent is registered', async () => {
      const eventSpy = jest.fn()
      orchestrator.on('agentRegistered', eventSpy)
      
      await orchestrator.registerAgent(mockAgent1)
      
      expect(eventSpy).toHaveBeenCalledWith({
        agentId: 'agent1',
        agentName: 'Test Agent 1',
        capabilities: mockAgent1.getCapabilities(),
      })
    })

    it('should unregister an agent successfully', async () => {
      await orchestrator.registerAgent(mockAgent1)
      expect(orchestrator.isAgentRegistered('agent1')).toBe(true)
      
      await orchestrator.unregisterAgent('agent1')
      expect(orchestrator.isAgentRegistered('agent1')).toBe(false)
      expect(orchestrator.getRegisteredAgents()).toHaveLength(0)
    })

    it('should emit agentUnregistered event when agent is unregistered', async () => {
      await orchestrator.registerAgent(mockAgent1)
      
      const eventSpy = jest.fn()
      orchestrator.on('agentUnregistered', eventSpy)
      
      await orchestrator.unregisterAgent('agent1')
      
      expect(eventSpy).toHaveBeenCalledWith({
        agentId: 'agent1',
        agentName: 'Test Agent 1',
      })
    })
  })

  describe('Message Routing', () => {
    beforeEach(async () => {
      await orchestrator.registerAgent(mockAgent1)
      await orchestrator.registerAgent(mockAgent2)
    })

    it('should send a message to a specific agent and receive response', async () => {
      const response = await orchestrator.sendMessage({
        type: 'request',
        from: 'test',
        to: 'agent1',
        payload: {
          capability: 'test_capability',
          input: { test: 'data' },
        },
        requiresResponse: true,
      })

      expect(response).not.toBeNull()
      expect(response?.type).toBe('response')
      expect(response?.payload.result).toBe('success')
      expect(response?.payload.processedBy).toBe('agent1')
    })

    it('should handle message validation errors', async () => {
      await expect(
        orchestrator.sendMessage({
          type: 'request',
          from: '', // Invalid: empty from field
          to: 'agent1',
          payload: {},
        } as any)
      ).rejects.toThrow()
    })

    it('should handle agent errors gracefully', async () => {
      const response = await orchestrator.sendMessage({
        type: 'request',
        from: 'test',
        to: 'agent1',
        payload: {
          capability: 'error_capability',
          input: {},
        },
        requiresResponse: true,
      })

      expect(response?.type).toBe('error')
      expect(response?.payload.error).toBe(true)
      expect(response?.payload.message).toContain('Test error')
    })

    it('should timeout if no response is received', async () => {
      const timeoutPromise = orchestrator.sendMessage({
        type: 'request',
        from: 'test',
        to: 'agent1',
        payload: {
          capability: 'nonexistent_capability',
          input: {},
        },
        requiresResponse: true,
        timeout: 100,
      })

      await expect(timeoutPromise).rejects.toThrow('Timeout waiting for response')
    }, 10000)

    it('should broadcast messages to all agents except sender', async () => {
      const responses = await orchestrator.broadcast({
        from: 'test',
        payload: {
          capability: 'test_capability',
          input: {},
        },
      })

      // Should receive responses from both agents
      expect(responses).toHaveLength(2)
    })
  })

  describe('Capability Discovery', () => {
    beforeEach(async () => {
      await orchestrator.registerAgent(mockAgent1)
      await orchestrator.registerAgent(mockAgent2)
    })

    it('should find agent by capability', () => {
      const agent = orchestrator.findAgentByCapability('test_capability')
      expect(agent).not.toBeNull()
      expect(agent?.metadata.id).toBe('agent1')
    })

    it('should return null if no agent has the capability', () => {
      const agent = orchestrator.findAgentByCapability('nonexistent_capability')
      expect(agent).toBeNull()
    })

    it('should get capabilities for a specific agent', () => {
      const capabilities = orchestrator.getAgentCapabilities('agent1')
      expect(capabilities).toHaveLength(1)
      expect(capabilities[0].name).toBe('test_capability')
    })

    it('should get all capabilities from all agents', () => {
      const allCapabilities = orchestrator.getAllCapabilities()
      expect(Object.keys(allCapabilities)).toHaveLength(2)
      expect(allCapabilities['agent1']).toHaveLength(1)
      expect(allCapabilities['agent2']).toHaveLength(1)
    })
  })

  describe('Workflow Execution', () => {
    beforeEach(async () => {
      await orchestrator.registerAgent(mockAgent1)
    })

    it('should execute a simple workflow successfully', async () => {
      const workflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        steps: [
          {
            id: 'step1',
            capability: 'test_capability',
            input: { test: 'data' },
          },
        ],
      }

      const result = await orchestrator.executeWorkflow(workflowDefinition)

      expect(result.success).toBe(true)
      expect(result.workflowId).toBeDefined()
      expect(result.results).toHaveProperty('step1')
      expect(result.errors).toHaveLength(0)
    })

    it('should handle workflow step failures', async () => {
      const workflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        steps: [
          {
            id: 'step1',
            capability: 'nonexistent_capability',
            input: {},
          },
        ],
      }

      const result = await orchestrator.executeWorkflow(workflowDefinition)

      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('No agent found with capability')
    })

    it('should emit workflow events', async () => {
      const startedSpy = jest.fn()
      const completedSpy = jest.fn()
      
      orchestrator.on('workflowStarted', startedSpy)
      orchestrator.on('workflowCompleted', completedSpy)

      const workflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        steps: [
          {
            id: 'step1',
            capability: 'test_capability',
            input: {},
          },
        ],
      }

      await orchestrator.executeWorkflow(workflowDefinition)

      expect(startedSpy).toHaveBeenCalled()
      expect(completedSpy).toHaveBeenCalled()
    })

    it('should handle workflow with variable substitution', async () => {
      const workflowDefinition = {
        id: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        steps: [
          {
            id: 'step1',
            capability: 'test_capability',
            input: { value: 'initial' },
            outputVariable: 'result1',
          },
          {
            id: 'step2',
            capability: 'test_capability',
            input: { previous: '$result1' },
          },
        ],
      }

      const result = await orchestrator.executeWorkflow(workflowDefinition)

      expect(result.success).toBe(true)
      expect(result.results).toHaveProperty('step1')
      expect(result.results).toHaveProperty('step2')
    })
  })

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      await orchestrator.registerAgent(mockAgent1)
    })

    it('should monitor agent health', (done) => {
      orchestrator.on('agentUnhealthy', (event) => {
        expect(event.agentId).toBe('agent1')
        done()
      })

      // Simulate agent becoming unhealthy
      mockAgent1.metadata.status = 'offline'
      mockAgent1.metadata.lastSeen = Date.now() - 120000 // 2 minutes ago
    }, 10000)
  })

  describe('Message Generation', () => {
    it('should generate unique message IDs', () => {
      const message1 = {
        type: 'request' as const,
        from: 'test',
        to: 'agent1',
        payload: {},
      }

      const message2 = {
        type: 'request' as const,
        from: 'test',
        to: 'agent1',
        payload: {},
      }

      // Use the private method through sendMessage to generate IDs
      const id1 = (orchestrator as any).generateMessageId()
      const id2 = (orchestrator as any).generateMessageId()

      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^msg_\d+_[a-z0-9]+$/)
      expect(id2).toMatch(/^msg_\d+_[a-z0-9]+$/)
    })
  })

  describe('Error Handling', () => {
    it('should handle agent initialization failures', async () => {
      const faultyAgent = new MockAgent('faulty', 'Faulty Agent')
      
      // Mock the initialization to fail
      jest.spyOn(faultyAgent, 'initialize').mockRejectedValue(new Error('Init failed'))

      await expect(orchestrator.registerAgent(faultyAgent)).rejects.toThrow('Init failed')
      expect(orchestrator.isAgentRegistered('faulty')).toBe(false)
    })

    it('should handle message processing errors gracefully', async () => {
      await orchestrator.registerAgent(mockAgent1)

      const response = await orchestrator.sendMessage({
        type: 'request',
        from: 'test',
        to: 'nonexistent-agent',
        payload: {
          capability: 'test_capability',
          input: {},
        },
        requiresResponse: false,
      })

      // Should not throw, but log error and continue
      expect(response).toBeNull()
    })
  })

  describe('Performance', () => {
    it('should handle concurrent message processing', async () => {
      await orchestrator.registerAgent(mockAgent1)
      await orchestrator.registerAgent(mockAgent2)

      const promises = Array.from({ length: 10 }, (_, i) =>
        orchestrator.sendMessage({
          type: 'request',
          from: 'test',
          to: 'agent1',
          payload: {
            capability: 'test_capability',
            input: { index: i },
          },
          requiresResponse: true,
        })
      )

      const responses = await Promise.all(promises)

      expect(responses).toHaveLength(10)
      responses.forEach((response, index) => {
        expect(response?.type).toBe('response')
        expect(response?.payload.result).toBe('success')
      })
    })
  })

  describe('Cleanup', () => {
    it('should properly shutdown and cleanup resources', async () => {
      await orchestrator.registerAgent(mockAgent1)
      await orchestrator.registerAgent(mockAgent2)

      expect(orchestrator.getRegisteredAgents()).toHaveLength(2)

      await orchestrator.shutdown()

      expect(orchestrator.getRegisteredAgents()).toHaveLength(0)
      expect(orchestrator.getQueueSize()).toBe(0)
    })
  })
})