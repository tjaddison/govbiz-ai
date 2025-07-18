/**
 * Performance and Load Testing Suite
 * 
 * Tests performance characteristics and load handling capabilities
 * of the GovBiz.ai platform components
 */

import {
  measureExecutionTime,
  expectExecutionTime,
  createMockFetch,
  generateMockOpportunity,
  wait,
} from '../utils/test-helpers'
import { AgentOrchestrator } from '@/lib/agents/AgentOrchestrator'
import { SourcesSoughtAgent } from '@/lib/agents/SourcesSoughtAgent'
import { DocumentAgent } from '@/lib/agents/DocumentAgent'

// Mock external dependencies
global.fetch = jest.fn()

describe('Performance and Load Testing', () => {
  let orchestrator: AgentOrchestrator
  let sourcesSoughtAgent: SourcesSoughtAgent
  let documentAgent: DocumentAgent

  beforeAll(async () => {
    // Setup mock API responses
    ;(fetch as jest.MockedFunction<typeof fetch>).mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('api.sam.gov')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            opportunitiesData: [generateMockOpportunity()],
            totalRecords: 1,
          }),
        } as Response)
      }
      return Promise.reject(new Error('Unknown URL'))
    })

    // Initialize agents
    process.env.SAM_GOV_API_KEY = 'test-api-key'
    orchestrator = new AgentOrchestrator()
    sourcesSoughtAgent = new SourcesSoughtAgent()
    documentAgent = new DocumentAgent()

    await orchestrator.registerAgent(sourcesSoughtAgent)
    await orchestrator.registerAgent(documentAgent)
  }, 30000)

  afterAll(async () => {
    await orchestrator.shutdown()
  })

  describe('Response Time Performance', () => {
    it('should process opportunity search within acceptable time', async () => {
      const searchMessage = {
        type: 'request' as const,
        from: 'test',
        to: sourcesSoughtAgent.metadata.id,
        payload: {
          capability: 'search_opportunities',
          input: {
            keywords: ['software'],
            limit: 10,
          },
        },
        requiresResponse: true,
      }

      await expectExecutionTime(
        () => orchestrator.sendMessage(searchMessage),
        5000 // Should complete within 5 seconds
      )
    })

    it('should generate responses within performance targets', async () => {
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

      const responseMessage = {
        type: 'request' as const,
        from: 'test',
        to: sourcesSoughtAgent.metadata.id,
        payload: {
          capability: 'generate_response',
          input: {
            opportunityId: 'test-001',
            userProfile,
          },
        },
        requiresResponse: true,
      }

      await expectExecutionTime(
        () => orchestrator.sendMessage(responseMessage),
        15000 // Should complete within 15 seconds
      )
    })

    it('should classify documents efficiently', async () => {
      const classificationMessage = {
        type: 'request' as const,
        from: 'test',
        to: documentAgent.metadata.id,
        payload: {
          capability: 'classify_document',
          input: {
            content: 'This is a sample document for classification testing.',
            filename: 'test.txt',
          },
        },
        requiresResponse: true,
      }

      await expectExecutionTime(
        () => orchestrator.sendMessage(classificationMessage),
        3000 // Should complete within 3 seconds
      )
    })
  })

  describe('Concurrent Processing', () => {
    it('should handle multiple concurrent searches', async () => {
      const searchRequests = Array.from({ length: 10 }, (_, i) => ({
        type: 'request' as const,
        from: 'test',
        to: sourcesSoughtAgent.metadata.id,
        payload: {
          capability: 'search_opportunities',
          input: {
            keywords: [`keyword-${i}`],
            limit: 5,
          },
        },
        requiresResponse: true,
      }))

      const { result: responses, duration } = await measureExecutionTime(() =>
        Promise.all(searchRequests.map(req => orchestrator.sendMessage(req)))
      )

      expect(responses).toHaveLength(10)
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
      
      responses.forEach(response => {
        expect(response?.type).toBe('response')
      })
    })

    it('should handle mixed agent operations concurrently', async () => {
      const operations = [
        // Search operations
        ...Array.from({ length: 5 }, (_, i) => ({
          type: 'request' as const,
          from: 'test',
          to: sourcesSoughtAgent.metadata.id,
          payload: {
            capability: 'search_opportunities',
            input: { keywords: [`term-${i}`], limit: 3 },
          },
          requiresResponse: true,
        })),
        // Document operations
        ...Array.from({ length: 5 }, (_, i) => ({
          type: 'request' as const,
          from: 'test',
          to: documentAgent.metadata.id,
          payload: {
            capability: 'classify_document',
            input: {
              content: `Document content ${i}`,
              filename: `doc-${i}.txt`,
            },
          },
          requiresResponse: true,
        })),
      ]

      const { result: responses, duration } = await measureExecutionTime(() =>
        Promise.all(operations.map(op => orchestrator.sendMessage(op)))
      )

      expect(responses).toHaveLength(10)
      expect(duration).toBeLessThan(15000) // Should complete within 15 seconds
      
      const successfulResponses = responses.filter(r => r?.type === 'response')
      expect(successfulResponses.length).toBeGreaterThan(7) // At least 70% success rate
    })
  })

  describe('Memory and Resource Usage', () => {
    it('should handle large document processing without memory issues', async () => {
      // Generate a large document (approximately 1MB of text)
      const largeContent = Array.from({ length: 10000 }, (_, i) => 
        `This is line ${i} of a large document for testing memory usage and performance characteristics.`
      ).join('\n')

      const classificationMessage = {
        type: 'request' as const,
        from: 'test',
        to: documentAgent.metadata.id,
        payload: {
          capability: 'classify_document',
          input: {
            content: largeContent,
            filename: 'large-document.txt',
          },
        },
        requiresResponse: true,
      }

      const response = await orchestrator.sendMessage(classificationMessage)

      expect(response?.type).toBe('response')
      expect(response?.payload.classification).toBeDefined()
    }, 30000)

    it('should handle rapid sequential requests without degradation', async () => {
      const iterations = 20
      const durations: number[] = []

      for (let i = 0; i < iterations; i++) {
        const searchMessage = {
          type: 'request' as const,
          from: 'test',
          to: sourcesSoughtAgent.metadata.id,
          payload: {
            capability: 'search_opportunities',
            input: {
              keywords: [`rapid-test-${i}`],
              limit: 1,
            },
          },
          requiresResponse: true,
        }

        const { duration } = await measureExecutionTime(() =>
          orchestrator.sendMessage(searchMessage)
        )

        durations.push(duration)
      }

      // Check that performance doesn't degrade significantly
      const firstHalf = durations.slice(0, 10)
      const secondHalf = durations.slice(10)
      
      const avgFirst = firstHalf.reduce((sum, d) => sum + d, 0) / firstHalf.length
      const avgSecond = secondHalf.reduce((sum, d) => sum + d, 0) / secondHalf.length

      // Second half shouldn't be more than 50% slower than first half
      expect(avgSecond).toBeLessThan(avgFirst * 1.5)
    }, 60000)
  })

  describe('Scalability Testing', () => {
    it('should maintain performance under simulated load', async () => {
      const loadTestDuration = 10000 // 10 seconds
      const requestInterval = 100 // Request every 100ms
      const startTime = Date.now()
      const responses: any[] = []
      const errors: Error[] = []

      // Simulate sustained load
      const loadPromise = (async () => {
        let requestId = 0
        
        while (Date.now() - startTime < loadTestDuration) {
          try {
            const searchMessage = {
              type: 'request' as const,
              from: 'load-test',
              to: sourcesSoughtAgent.metadata.id,
              payload: {
                capability: 'search_opportunities',
                input: {
                  keywords: [`load-${requestId++}`],
                  limit: 1,
                },
              },
              requiresResponse: true,
            }

            const response = await orchestrator.sendMessage(searchMessage)
            responses.push(response)
          } catch (error) {
            errors.push(error as Error)
          }

          await wait(requestInterval)
        }
      })()

      await loadPromise

      // Analyze results
      const successRate = responses.length / (responses.length + errors.length)
      const successfulResponses = responses.filter(r => r?.type === 'response')

      expect(successRate).toBeGreaterThan(0.8) // At least 80% success rate
      expect(successfulResponses.length).toBeGreaterThan(0)
      expect(errors.length).toBeLessThan(responses.length * 0.2) // Less than 20% errors
    }, 15000)

    it('should handle agent capacity limits gracefully', async () => {
      // Test what happens when we exceed reasonable concurrent requests
      const heavyRequests = Array.from({ length: 50 }, (_, i) => ({
        type: 'request' as const,
        from: 'capacity-test',
        to: sourcesSoughtAgent.metadata.id,
        payload: {
          capability: 'generate_response',
          input: {
            opportunityId: `heavy-${i}`,
            userProfile: {
              companyName: `Company ${i}`,
              capabilities: ['programming'],
              pastProjects: [],
              certifications: ['small business'],
              contactInfo: { name: 'Test', email: 'test@test.com' },
            },
          },
        },
        requiresResponse: true,
        timeout: 30000,
      }))

      const startTime = Date.now()
      const responses = await Promise.allSettled(
        heavyRequests.map(req => orchestrator.sendMessage(req))
      )
      const duration = Date.now() - startTime

      const successful = responses.filter(r => r.status === 'fulfilled')
      const failed = responses.filter(r => r.status === 'rejected')

      // System should handle graceful degradation
      expect(successful.length).toBeGreaterThan(0)
      expect(duration).toBeLessThan(60000) // Should not hang indefinitely
      
      // Some failures are acceptable under extreme load
      if (failed.length > 0) {
        expect(failed.length / responses.length).toBeLessThan(0.5) // Less than 50% failures
      }
    }, 70000)
  })

  describe('Error Recovery Performance', () => {
    it('should recover quickly from temporary failures', async () => {
      // Simulate network failure
      const originalFetch = global.fetch
      
      // First request should fail
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValueOnce(
        new Error('Network error')
      )

      const failingMessage = {
        type: 'request' as const,
        from: 'test',
        to: sourcesSoughtAgent.metadata.id,
        payload: {
          capability: 'search_opportunities',
          input: { keywords: ['test'], limit: 1 },
        },
        requiresResponse: true,
      }

      const failedResponse = await orchestrator.sendMessage(failingMessage)
      expect(failedResponse?.type).toBe('error')

      // Restore normal behavior
      global.fetch = originalFetch

      // Subsequent request should succeed quickly
      const { duration } = await measureExecutionTime(() =>
        orchestrator.sendMessage(failingMessage)
      )

      expect(duration).toBeLessThan(5000) // Should recover within 5 seconds
    })

    it('should maintain system stability under error conditions', async () => {
      const mixedRequests = Array.from({ length: 20 }, (_, i) => {
        // Every 5th request will cause an error
        const shouldFail = i % 5 === 0
        
        return {
          type: 'request' as const,
          from: 'stability-test',
          to: sourcesSoughtAgent.metadata.id,
          payload: {
            capability: shouldFail ? 'invalid_capability' : 'search_opportunities',
            input: { keywords: [`stable-${i}`], limit: 1 },
          },
          requiresResponse: true,
        }
      })

      const responses = await Promise.all(
        mixedRequests.map(req => orchestrator.sendMessage(req))
      )

      const successCount = responses.filter(r => r?.type === 'response').length
      const errorCount = responses.filter(r => r?.type === 'error').length

      // System should handle mixed success/error gracefully
      expect(successCount).toBeGreaterThan(10) // Most requests should succeed
      expect(errorCount).toBe(4) // Expected failures for invalid capabilities
      expect(successCount + errorCount).toBe(20) // All requests should return something
    })
  })

  describe('Resource Cleanup', () => {
    it('should clean up resources properly after operations', async () => {
      const initialAgents = orchestrator.getRegisteredAgents().length
      const initialQueueSize = orchestrator.getQueueSize()

      // Perform several operations
      const operations = Array.from({ length: 10 }, (_, i) => ({
        type: 'request' as const,
        from: 'cleanup-test',
        to: sourcesSoughtAgent.metadata.id,
        payload: {
          capability: 'search_opportunities',
          input: { keywords: [`cleanup-${i}`], limit: 1 },
        },
        requiresResponse: true,
      }))

      await Promise.all(operations.map(op => orchestrator.sendMessage(op)))

      // Allow some time for cleanup
      await wait(1000)

      const finalAgents = orchestrator.getRegisteredAgents().length
      const finalQueueSize = orchestrator.getQueueSize()

      expect(finalAgents).toBe(initialAgents) // No agent leaks
      expect(finalQueueSize).toBeLessThanOrEqual(initialQueueSize + 1) // Queue should be mostly clear
    })
  })

  describe('Performance Benchmarks', () => {
    it('should meet performance SLA requirements', async () => {
      const performanceTests = [
        {
          name: 'Opportunity Search',
          operation: () => orchestrator.sendMessage({
            type: 'request' as const,
            from: 'benchmark',
            to: sourcesSoughtAgent.metadata.id,
            payload: {
              capability: 'search_opportunities',
              input: { keywords: ['benchmark'], limit: 10 },
            },
            requiresResponse: true,
          }),
          slaMs: 3000,
        },
        {
          name: 'Document Classification',
          operation: () => orchestrator.sendMessage({
            type: 'request' as const,
            from: 'benchmark',
            to: documentAgent.metadata.id,
            payload: {
              capability: 'classify_document',
              input: {
                content: 'Benchmark document content',
                filename: 'benchmark.txt',
              },
            },
            requiresResponse: true,
          }),
          slaMs: 2000,
        },
        {
          name: 'Opportunity Analysis',
          operation: () => orchestrator.sendMessage({
            type: 'request' as const,
            from: 'benchmark',
            to: sourcesSoughtAgent.metadata.id,
            payload: {
              capability: 'analyze_opportunity',
              input: {
                opportunityId: 'benchmark-opp',
                userProfile: {
                  naicsCodes: ['541511'],
                  capabilities: ['programming'],
                  pastProjects: [],
                  certifications: ['small business'],
                },
              },
            },
            requiresResponse: true,
          }),
          slaMs: 4000,
        },
      ]

      for (const test of performanceTests) {
        const { duration } = await measureExecutionTime(test.operation)
        
        expect(duration).toBeLessThan(test.slaMs)
        console.log(`${test.name}: ${duration}ms (SLA: ${test.slaMs}ms)`)
      }
    })
  })
})