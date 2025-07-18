import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

const availableModels = [
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
    description: 'Fast and balanced model for most government contracting tasks'
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
    description: 'Highest quality model for complex contract analysis and strategy'
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
    description: 'Fast and efficient model for quick questions and simple tasks'
  }
]

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    return NextResponse.json(availableModels)
  } catch (error) {
    console.error('Models API error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { modelId } = await request.json()

    if (!modelId) {
      return new NextResponse('Model ID is required', { status: 400 })
    }

    const model = availableModels.find(m => m.id === modelId)
    if (!model) {
      return new NextResponse('Model not found', { status: 404 })
    }

    // In production, you would validate user access to this model
    // For now, we'll allow access to all models

    return NextResponse.json({
      success: true,
      model,
      message: `Switched to ${model.name}`
    })
  } catch (error) {
    console.error('Model switch error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}