import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { OnboardingProgress, OnboardingConfiguration, OnboardingStep, APIResponse } from '@/types'

// Default onboarding configuration
const DEFAULT_ONBOARDING_CONFIG: OnboardingConfiguration = {
  steps: [
    {
      id: 'welcome',
      title: 'Welcome to GovBiz.ai',
      description: 'Learn about our government contracting automation platform and its powerful capabilities.',
      type: 'welcome',
      order: 1,
      isOptional: false,
      isCompleted: false,
      estimatedDuration: 2,
      actions: [
        {
          id: 'get-started',
          type: 'button',
          label: 'Get Started',
          required: true
        }
      ]
    },
    {
      id: 'profile-setup',
      title: 'Set Up Your Profile',
      description: 'Tell us about yourself and your organization to personalize your experience.',
      type: 'setup',
      order: 2,
      isOptional: false,
      isCompleted: false,
      estimatedDuration: 5,
      actions: [
        {
          id: 'name',
          type: 'input',
          label: 'Full Name',
          required: true,
          validation: {
            type: 'required',
            message: 'Please enter your full name'
          }
        },
        {
          id: 'role',
          type: 'selection',
          label: 'Your Role',
          required: true,
          options: [
            'Business Development Manager',
            'Proposal Manager',
            'Contract Specialist',
            'Small Business Owner',
            'Consultant',
            'Other'
          ]
        },
        {
          id: 'organization',
          type: 'input',
          label: 'Organization',
          required: false
        },
        {
          id: 'experience',
          type: 'selection',
          label: 'Experience Level',
          required: true,
          options: ['Beginner', 'Intermediate', 'Advanced']
        }
      ]
    },
    {
      id: 'capabilities-overview',
      title: 'Platform Capabilities',
      description: 'Discover what GovBiz.ai can do for your government contracting needs.',
      type: 'capabilities',
      order: 3,
      isOptional: false,
      isCompleted: false,
      estimatedDuration: 8,
      actions: [
        {
          id: 'explore-capabilities',
          type: 'demo',
          label: 'Explore Capabilities',
          required: false
        }
      ]
    },
    {
      id: 'sources-sought-tutorial',
      title: 'Sources Sought Mastery',
      description: 'Learn how to effectively find, analyze, and respond to Sources Sought opportunities.',
      type: 'tutorial',
      order: 4,
      isOptional: false,
      isCompleted: false,
      estimatedDuration: 15,
      actions: [
        {
          id: 'start-tutorial',
          type: 'button',
          label: 'Start Interactive Tutorial',
          required: true
        }
      ]
    },
    {
      id: 'customization',
      title: 'Customize Your Experience',
      description: 'Set up your preferences, notifications, and dashboard to match your workflow.',
      type: 'setup',
      order: 5,
      isOptional: true,
      isCompleted: false,
      estimatedDuration: 10,
      actions: [
        {
          id: 'customize-dashboard',
          type: 'button',
          label: 'Customize Dashboard',
          required: false
        },
        {
          id: 'setup-notifications',
          type: 'button',
          label: 'Setup Notifications',
          required: false
        }
      ]
    },
    {
      id: 'completion',
      title: 'You\'re All Set!',
      description: 'Congratulations! You\'re ready to start using GovBiz.ai to accelerate your government contracting success.',
      type: 'completion',
      order: 6,
      isOptional: false,
      isCompleted: false,
      estimatedDuration: 3,
      actions: [
        {
          id: 'start-using',
          type: 'button',
          label: 'Start Using GovBiz.ai',
          required: true
        }
      ]
    }
  ],
  theme: 'government',
  personalizedContent: true,
  adaptiveFlow: true,
  skipEnabled: true,
  progressSaving: true,
  analyticsEnabled: true,
  interactiveElements: true,
  chatIntegration: true,
  contextualHelp: true
}

// Get onboarding configuration
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    const includeProgress = searchParams.get('includeProgress') === 'true'

    // Get user's onboarding progress if requested
    let progress: OnboardingProgress | null = null
    if (includeProgress) {
      // In a real implementation, this would fetch from DynamoDB
      // For now, we'll return a mock progress
      progress = {
        userId,
        currentStep: 1,
        completedSteps: [],
        skippedSteps: [],
        totalSteps: DEFAULT_ONBOARDING_CONFIG.steps.length,
        completionPercentage: 0,
        startedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        estimatedTimeRemaining: 43, // Total estimated minutes
        userResponses: {},
        isCompleted: false
      }
    }

    const response: APIResponse = {
      success: true,
      data: {
        configuration: DEFAULT_ONBOARDING_CONFIG,
        progress,
        userId
      },
      timestamp: Date.now(),
      requestId: `onboarding-${Date.now()}`
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Onboarding configuration error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load onboarding configuration',
        timestamp: Date.now(),
        requestId: `onboarding-error-${Date.now()}`
      },
      { status: 500 }
    )
  }
}

// Update onboarding progress
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
    const { action, stepId, data } = body

    // Validate required fields
    if (!action || !stepId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: action, stepId' },
        { status: 400 }
      )
    }

    // Process the onboarding action
    let updatedProgress: OnboardingProgress
    
    switch (action) {
      case 'complete-step':
        updatedProgress = await completeStep(userId, stepId, data)
        break
      case 'skip-step':
        updatedProgress = await skipStep(userId, stepId)
        break
      case 'update-response':
        updatedProgress = await updateResponse(userId, stepId, data)
        break
      case 'restart':
        updatedProgress = await restartOnboarding(userId)
        break
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }

    const response: APIResponse = {
      success: true,
      data: {
        progress: updatedProgress,
        message: `Step ${stepId} ${action} successfully`
      },
      timestamp: Date.now(),
      requestId: `onboarding-update-${Date.now()}`
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Onboarding update error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update onboarding progress',
        timestamp: Date.now(),
        requestId: `onboarding-error-${Date.now()}`
      },
      { status: 500 }
    )
  }
}

// Helper functions for onboarding actions
async function completeStep(userId: string, stepId: string, data: any): Promise<OnboardingProgress> {
  // In a real implementation, this would update DynamoDB
  // For now, we'll return a mock updated progress
  const totalSteps = DEFAULT_ONBOARDING_CONFIG.steps.length
  const completedSteps = ['welcome', 'profile-setup'] // Mock completed steps
  
  if (!completedSteps.includes(stepId)) {
    completedSteps.push(stepId)
  }

  const completionPercentage = Math.round((completedSteps.length / totalSteps) * 100)
  const currentStep = Math.min(completedSteps.length + 1, totalSteps)

  return {
    userId,
    currentStep,
    completedSteps,
    skippedSteps: [],
    totalSteps,
    completionPercentage,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    estimatedTimeRemaining: Math.max(0, 43 - (completedSteps.length * 7)),
    userResponses: data || {},
    isCompleted: completedSteps.length === totalSteps,
    completedAt: completedSteps.length === totalSteps ? new Date().toISOString() : undefined
  }
}

async function skipStep(userId: string, stepId: string): Promise<OnboardingProgress> {
  // Similar to completeStep but adds to skippedSteps
  const totalSteps = DEFAULT_ONBOARDING_CONFIG.steps.length
  const completedSteps = ['welcome'] // Mock completed steps
  const skippedSteps = ['profile-setup'] // Mock skipped steps
  
  if (!skippedSteps.includes(stepId)) {
    skippedSteps.push(stepId)
  }

  const completionPercentage = Math.round(((completedSteps.length + skippedSteps.length) / totalSteps) * 100)
  const currentStep = Math.min(completedSteps.length + skippedSteps.length + 1, totalSteps)

  return {
    userId,
    currentStep,
    completedSteps,
    skippedSteps,
    totalSteps,
    completionPercentage,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    estimatedTimeRemaining: Math.max(0, 43 - ((completedSteps.length + skippedSteps.length) * 7)),
    userResponses: {},
    isCompleted: (completedSteps.length + skippedSteps.length) === totalSteps,
    completedAt: (completedSteps.length + skippedSteps.length) === totalSteps ? new Date().toISOString() : undefined
  }
}

async function updateResponse(userId: string, stepId: string, data: any): Promise<OnboardingProgress> {
  // Update user responses for a specific step
  return {
    userId,
    currentStep: 2,
    completedSteps: ['welcome'],
    skippedSteps: [],
    totalSteps: DEFAULT_ONBOARDING_CONFIG.steps.length,
    completionPercentage: 17,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    estimatedTimeRemaining: 36,
    userResponses: { [stepId]: data },
    isCompleted: false
  }
}

async function restartOnboarding(userId: string): Promise<OnboardingProgress> {
  // Reset onboarding progress
  return {
    userId,
    currentStep: 1,
    completedSteps: [],
    skippedSteps: [],
    totalSteps: DEFAULT_ONBOARDING_CONFIG.steps.length,
    completionPercentage: 0,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    estimatedTimeRemaining: 43,
    userResponses: {},
    isCompleted: false
  }
}