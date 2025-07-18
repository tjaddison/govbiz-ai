import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const modelId = params.id

    // Available models with access control
    const modelAccess = {
      'claude-sonnet-4': {
        available: true,
        requiredPlan: 'basic',
        restrictions: []
      },
      'claude-opus-4': {
        available: true,
        requiredPlan: 'pro',
        restrictions: ['rate_limited']
      },
      'claude-haiku-4': {
        available: true,
        requiredPlan: 'basic',
        restrictions: []
      }
    }

    const access = modelAccess[modelId as keyof typeof modelAccess]
    
    if (!access) {
      return new NextResponse('Model not found', { status: 404 })
    }

    // In production, you would check user subscription level, rate limits, etc.
    // For now, we'll allow access to all models for demonstration

    return NextResponse.json({
      hasAccess: access.available,
      requiredPlan: access.requiredPlan,
      restrictions: access.restrictions,
      userPlan: 'pro', // Mock user plan
      message: access.available ? 'Access granted' : 'Access denied'
    })
  } catch (error) {
    console.error('Model access check error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}