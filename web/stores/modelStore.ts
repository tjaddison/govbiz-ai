import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { ModelInfo, ModelConfiguration, ModelCapability } from '@/types'

interface ModelStore {
  // State
  currentModel: ModelInfo
  availableModels: ModelInfo[]
  modelCapabilities: Record<string, ModelCapability[]>
  isLoading: boolean
  error: string | null
  
  // Actions
  switchModel: (modelId: string) => Promise<void>
  setCurrentModel: (model: ModelInfo) => void
  setAvailableModels: (models: ModelInfo[]) => void
  updateModelConfiguration: (modelId: string, config: Partial<ModelConfiguration>) => void
  
  // Getters
  getModel: (id: string) => ModelInfo | undefined
  getModelCapabilities: (id: string) => ModelCapability[]
  isModelSupported: (modelId: string, capability: string) => boolean
  
  // Model management
  loadAvailableModels: () => Promise<void>
  validateModelAccess: (modelId: string) => Promise<boolean>
  getModelCost: (modelId: string, tokens: number) => number
  getOptimalModel: (task: string, requirements: any) => ModelInfo
}

// Default models configuration
const defaultModels: ModelInfo[] = [
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxTokens: 8192,
    capabilities: [
      { type: 'text', description: 'Advanced text generation', supported: true },
      { type: 'code', description: 'Code generation and analysis', supported: true },
      { type: 'analysis', description: 'Complex analysis tasks', supported: true },
      { type: 'research', description: 'Research and fact-checking', supported: true },
      { type: 'math', description: 'Mathematical reasoning', supported: true }
    ],
    speed: 'fast',
    quality: 'high',
    costPerToken: 0.000015,
    description: 'Fast and balanced model for most tasks'
  },
  {
    id: 'claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxTokens: 8192,
    capabilities: [
      { type: 'text', description: 'Superior text generation', supported: true },
      { type: 'code', description: 'Advanced code generation', supported: true },
      { type: 'analysis', description: 'Deep analysis and reasoning', supported: true },
      { type: 'research', description: 'Comprehensive research', supported: true },
      { type: 'math', description: 'Advanced mathematical reasoning', supported: true },
      { type: 'vision', description: 'Image analysis and understanding', supported: true }
    ],
    speed: 'medium',
    quality: 'highest',
    costPerToken: 0.000075,
    description: 'Highest quality model for complex tasks'
  },
  {
    id: 'claude-haiku-4',
    name: 'Claude Haiku 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxTokens: 8192,
    capabilities: [
      { type: 'text', description: 'Fast text generation', supported: true },
      { type: 'code', description: 'Basic code assistance', supported: true },
      { type: 'analysis', description: 'Quick analysis tasks', supported: true }
    ],
    speed: 'fast',
    quality: 'high',
    costPerToken: 0.000005,
    description: 'Fast and efficient model for quick tasks'
  }
]

export const useModelStore = create<ModelStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    currentModel: defaultModels[0],
    availableModels: defaultModels,
    modelCapabilities: {},
    isLoading: false,
    error: null,
    
    // Actions
    switchModel: async (modelId: string) => {
      set({ isLoading: true, error: null })
      
      try {
        const model = get().getModel(modelId)
        if (!model) {
          throw new Error(`Model ${modelId} not found`)
        }
        
        const hasAccess = await get().validateModelAccess(modelId)
        if (!hasAccess) {
          throw new Error(`Access denied for model ${modelId}`)
        }
        
        set({ currentModel: model, isLoading: false })
      } catch (error) {
        set({ 
          error: error instanceof Error ? error.message : 'Unknown error',
          isLoading: false 
        })
        throw error
      }
    },
    
    setCurrentModel: (model: ModelInfo) => {
      set({ currentModel: model })
    },
    
    setAvailableModels: (models: ModelInfo[]) => {
      set({ availableModels: models })
    },
    
    updateModelConfiguration: (modelId: string, config: Partial<ModelConfiguration>) => {
      set((state) => {
        const modelIndex = state.availableModels.findIndex(m => m.id === modelId)
        if (modelIndex === -1) return state
        
        const updatedModels = [...state.availableModels]
        // Model configuration would be handled separately in a real implementation
        
        return {
          availableModels: updatedModels,
          currentModel: state.currentModel.id === modelId 
            ? { ...state.currentModel } 
            : state.currentModel
        }
      })
    },
    
    // Getters
    getModel: (id: string) => {
      const { availableModels } = get()
      return availableModels.find(model => model.id === id)
    },
    
    getModelCapabilities: (id: string) => {
      const model = get().getModel(id)
      return model?.capabilities || []
    },
    
    isModelSupported: (modelId: string, capability: string) => {
      const capabilities = get().getModelCapabilities(modelId)
      return capabilities.some(cap => cap.type === capability && cap.supported)
    },
    
    // Model management
    loadAvailableModels: async () => {
      set({ isLoading: true, error: null })
      
      try {
        // In a real implementation, this would fetch from API
        const response = await fetch('/api/models')
        if (!response.ok) {
          throw new Error('Failed to load models')
        }
        
        const models = await response.json()
        set({ availableModels: models, isLoading: false })
      } catch (error) {
        // Fall back to default models
        set({ 
          availableModels: defaultModels,
          error: error instanceof Error ? error.message : 'Unknown error',
          isLoading: false 
        })
      }
    },
    
    validateModelAccess: async (modelId: string) => {
      try {
        // In a real implementation, this would check user permissions
        const response = await fetch(`/api/models/${modelId}/access`)
        return response.ok
      } catch {
        return true // Default to allowing access
      }
    },
    
    getModelCost: (modelId: string, tokens: number) => {
      const model = get().getModel(modelId)
      if (!model) return 0
      
      return tokens * model.costPerToken
    },
    
    getOptimalModel: (task: string, requirements: any) => {
      const { availableModels } = get()
      
      // Simple heuristic for model selection
      const taskPriority = {
        'quick': { speed: 3, quality: 1, cost: 2 },
        'analysis': { speed: 1, quality: 3, cost: 2 },
        'research': { speed: 1, quality: 3, cost: 1 },
        'code': { speed: 2, quality: 2, cost: 2 },
        'general': { speed: 2, quality: 2, cost: 2 }
      }
      
      const priority = taskPriority[task as keyof typeof taskPriority] || taskPriority.general
      
      let bestModel = availableModels[0]
      let bestScore = 0
      
      for (const model of availableModels) {
        const speedScore = model.speed === 'fast' ? 3 : model.speed === 'medium' ? 2 : 1
        const qualityScore = model.quality === 'highest' ? 3 : model.quality === 'higher' ? 2 : 1
        const costScore = model.costPerToken < 0.00001 ? 3 : model.costPerToken < 0.00005 ? 2 : 1
        
        const score = (
          speedScore * priority.speed +
          qualityScore * priority.quality +
          costScore * priority.cost
        )
        
        if (score > bestScore) {
          bestScore = score
          bestModel = model
        }
      }
      
      return bestModel
    }
  }))
)