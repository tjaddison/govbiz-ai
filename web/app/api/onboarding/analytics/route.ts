import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { OnboardingAnalytics, OnboardingFeedback, APIResponse } from '@/types'

// Mock analytics data for demonstration
const MOCK_ANALYTICS: OnboardingAnalytics = {
  stepCompletionRates: {
    'welcome': 0.98,
    'profile-setup': 0.87,
    'capabilities-overview': 0.78,
    'sources-sought-tutorial': 0.65,
    'customization': 0.43,
    'completion': 0.61
  },
  averageCompletionTime: 32.5,
  dropOffPoints: [
    { step: 'sources-sought-tutorial', rate: 0.35 },
    { step: 'customization', rate: 0.57 },
    { step: 'profile-setup', rate: 0.13 }
  ],
  userFeedback: [
    { step: 'welcome', rating: 4.2, comments: 'Clear and welcoming introduction' },
    { step: 'profile-setup', rating: 4.0, comments: 'Good personalization questions' },
    { step: 'capabilities-overview', rating: 4.1, comments: 'Comprehensive overview' },
    { step: 'sources-sought-tutorial', rating: 4.5, comments: 'Very helpful interactive tutorial' },
    { step: 'customization', rating: 3.8, comments: 'Could be more intuitive' },
    { step: 'completion', rating: 4.3, comments: 'Good conclusion and next steps' }
  ],
  commonIssues: [
    { step: 'profile-setup', issue: 'Role selection unclear', frequency: 12 },
    { step: 'sources-sought-tutorial', issue: 'Tutorial too long', frequency: 8 },
    { step: 'customization', issue: 'Too many options', frequency: 15 }
  ],
  successMetrics: {
    totalStarted: 245,
    totalCompleted: 149,
    completionRate: 0.608,
    averageSteps: 4.2,
    returnUsers: 132
  }
}

// Get onboarding analytics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const timeRange = searchParams.get('timeRange') || '30d'
    const includeDetails = searchParams.get('includeDetails') === 'true'

    // In a real implementation, this would query DynamoDB with time range filters
    let analytics = MOCK_ANALYTICS

    if (!includeDetails) {
      // Return summarized analytics
      analytics = {
        ...analytics,
        userFeedback: [],
        commonIssues: []
      }
    }

    const response: APIResponse = {
      success: true,
      data: {
        analytics,
        timeRange,
        generatedAt: new Date().toISOString()
      },
      timestamp: Date.now(),
      requestId: `onboarding-analytics-${Date.now()}`
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Onboarding analytics error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load onboarding analytics',
        timestamp: Date.now(),
        requestId: `onboarding-analytics-error-${Date.now()}`
      },
      { status: 500 }
    )
  }
}

// Submit onboarding feedback
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const body = await request.json()
    const { stepId, rating, comments, suggestions, difficulty, clarity, usefulness } = body

    // Validate required fields
    if (!stepId || rating === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: stepId, rating' },
        { status: 400 }
      )
    }

    // Create feedback record
    const feedback: OnboardingFeedback = {
      userId,
      stepId,
      rating: Math.max(1, Math.min(5, rating)), // Ensure rating is between 1-5
      comments: comments || '',
      suggestions: suggestions || '',
      difficulty: difficulty || 'just-right',
      clarity: clarity || 'clear',
      usefulness: usefulness || 'useful',
      timestamp: new Date().toISOString()
    }

    // In a real implementation, this would save to DynamoDB
    // For now, we'll just return success

    const response: APIResponse = {
      success: true,
      data: {
        feedback,
        message: 'Feedback submitted successfully'
      },
      timestamp: Date.now(),
      requestId: `onboarding-feedback-${Date.now()}`
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Onboarding feedback error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to submit onboarding feedback',
        timestamp: Date.now(),
        requestId: `onboarding-feedback-error-${Date.now()}`
      },
      { status: 500 }
    )
  }
}