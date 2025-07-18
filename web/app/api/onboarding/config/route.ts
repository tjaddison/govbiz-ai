import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { 
  OnboardingConfiguration, 
  SystemCapability, 
  RecommendedWorkflow, 
  UserCustomization,
  APIResponse 
} from '@/types'

// This route uses dynamic features and should not be pre-rendered
export const dynamic = 'force-dynamic'

// System capabilities that users can learn about during onboarding
const SYSTEM_CAPABILITIES: SystemCapability[] = [
  {
    id: 'sources-sought-finder',
    name: 'Sources Sought Finder',
    category: 'core',
    description: 'Automatically discover and monitor Sources Sought opportunities on SAM.gov',
    benefits: [
      'Real-time monitoring of 3,700+ active opportunities',
      'Smart filtering by NAICS codes and keywords',
      'Automated alerts for new opportunities',
      'Historical tracking and analysis'
    ],
    requirements: ['Valid SAM.gov account'],
    enabled: true,
    demoAvailable: true,
    tutorialSteps: [
      {
        id: 'setup-search',
        title: 'Set up your search criteria',
        description: 'Configure NAICS codes and keywords to match your business',
        action: 'type',
        target: '#naics-input',
        expectedResult: 'Search criteria configured',
        hint: 'Use your primary NAICS codes for best results'
      },
      {
        id: 'view-results',
        title: 'View discovered opportunities',
        description: 'See how the system finds matching opportunities',
        action: 'click',
        target: '#search-results',
        expectedResult: 'Opportunities displayed',
        hint: 'Results are ranked by relevance to your profile'
      }
    ]
  },
  {
    id: 'response-generator',
    name: 'AI Response Generator',
    category: 'core',
    description: 'Generate compelling Sources Sought responses using AI',
    benefits: [
      'Tailored responses based on your capabilities',
      'Keyword optimization for maximum impact',
      'Compliance checking and formatting',
      'Template library for different scenarios'
    ],
    enabled: true,
    demoAvailable: true,
    tutorialSteps: [
      {
        id: 'input-requirements',
        title: 'Input opportunity requirements',
        description: 'Paste the Sources Sought notice text',
        action: 'type',
        target: '#requirements-input',
        expectedResult: 'Requirements processed',
        hint: 'Copy the entire notice for best analysis'
      },
      {
        id: 'review-response',
        title: 'Review generated response',
        description: 'See the AI-generated response draft',
        action: 'observe',
        expectedResult: 'Response draft displayed',
        hint: 'The response matches your company profile and experience'
      }
    ]
  },
  {
    id: 'relationship-tracker',
    name: 'Government Relationship Tracker',
    category: 'advanced',
    description: 'Track and manage relationships with government contacts',
    benefits: [
      'Contact database with interaction history',
      'Follow-up reminders and scheduling',
      'Relationship strength scoring',
      'Communication templates'
    ],
    enabled: true,
    demoAvailable: true
  },
  {
    id: 'pipeline-management',
    name: 'Opportunity Pipeline Management',
    category: 'advanced',
    description: 'Manage your entire government contracting pipeline',
    benefits: [
      'Track opportunities from Sources Sought to award',
      'Automated status updates and notifications',
      'Win probability calculations',
      'Pipeline analytics and forecasting'
    ],
    enabled: true,
    demoAvailable: true
  },
  {
    id: 'competitive-intelligence',
    name: 'Competitive Intelligence',
    category: 'specialized',
    description: 'Analyze competitors and market trends',
    benefits: [
      'Competitor win/loss analysis',
      'Market share insights',
      'Pricing intelligence',
      'Strategic positioning recommendations'
    ],
    enabled: true,
    demoAvailable: false
  }
]

// Recommended workflows for different user types
const RECOMMENDED_WORKFLOWS: RecommendedWorkflow[] = [
  {
    id: 'sources-sought-mastery',
    name: 'Sources Sought Mastery',
    description: 'Complete workflow for finding, analyzing, and responding to Sources Sought opportunities',
    category: 'sources-sought',
    difficulty: 'medium',
    estimatedTime: 45,
    popularity: 0.89,
    successRate: 0.73,
    benefits: [
      'Systematic approach to opportunity discovery',
      'Higher response quality and win rates',
      'Automated follow-up processes',
      'Relationship building strategies'
    ],
    steps: [
      {
        id: 'discover',
        title: 'Discover Opportunities',
        description: 'Use automated search to find relevant Sources Sought',
        type: 'action',
        order: 1,
        isOptional: false,
        expectedOutcome: 'List of relevant opportunities',
        hints: ['Use multiple NAICS codes', 'Set up automated alerts']
      },
      {
        id: 'analyze',
        title: 'Analyze Requirements',
        description: 'Deep dive into opportunity requirements and fit',
        type: 'action',
        order: 2,
        isOptional: false,
        expectedOutcome: 'Opportunity analysis report',
        hints: ['Look for Rule of Two triggers', 'Identify capability gaps']
      },
      {
        id: 'respond',
        title: 'Generate Response',
        description: 'Create compelling response using AI assistance',
        type: 'action',
        order: 3,
        isOptional: false,
        expectedOutcome: 'Professional response document',
        hints: ['Customize for specific opportunity', 'Include all required elements']
      }
    ]
  },
  {
    id: 'new-user-quickstart',
    name: 'New User Quickstart',
    description: 'Fast-track setup for immediate productivity',
    category: 'general',
    difficulty: 'easy',
    estimatedTime: 15,
    popularity: 0.95,
    successRate: 0.91,
    benefits: [
      'Immediate access to core features',
      'Personalized configuration',
      'Quick wins and early results'
    ],
    steps: [
      {
        id: 'profile',
        title: 'Complete Profile',
        description: 'Set up your business profile and capabilities',
        type: 'input',
        order: 1,
        isOptional: false,
        expectedOutcome: 'Complete business profile'
      },
      {
        id: 'search',
        title: 'First Search',
        description: 'Run your first opportunity search',
        type: 'action',
        order: 2,
        isOptional: false,
        expectedOutcome: 'Search results with opportunities'
      },
      {
        id: 'response',
        title: 'First Response',
        description: 'Generate your first Sources Sought response',
        type: 'action',
        order: 3,
        isOptional: false,
        expectedOutcome: 'Generated response document'
      }
    ]
  }
]

// Default user customization settings
const DEFAULT_CUSTOMIZATION: UserCustomization = {
  theme: 'auto',
  colorScheme: 'government',
  layout: 'comfortable',
  shortcuts: [
    { id: 'search', key: 'Ctrl+/', action: 'Open search', description: 'Quick search', enabled: true },
    { id: 'new-response', key: 'Ctrl+N', action: 'New response', description: 'Create new response', enabled: true }
  ],
  notifications: [
    { type: 'email', category: 'opportunities', enabled: true, frequency: 'daily' },
    { type: 'in-app', category: 'system', enabled: true, frequency: 'immediate' }
  ],
  widgets: [
    { id: 'opportunities', type: 'list', title: 'Recent Opportunities', position: { x: 0, y: 0 }, size: { width: 6, height: 4 }, config: {}, enabled: true },
    { id: 'pipeline', type: 'chart', title: 'Pipeline Status', position: { x: 6, y: 0 }, size: { width: 6, height: 4 }, config: {}, enabled: true }
  ],
  quickActions: [
    { id: 'search', label: 'Search Opportunities', icon: 'search', command: '/search', category: 'common', enabled: true, order: 1 },
    { id: 'new-response', label: 'New Response', icon: 'plus', command: '/new-response', category: 'common', enabled: true, order: 2 }
  ]
}

// Get onboarding configuration with personalization
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
    const section = searchParams.get('section') || 'all'
    const personalize = searchParams.get('personalize') === 'true'

    let data: any = {}

    switch (section) {
      case 'capabilities':
        data = { capabilities: SYSTEM_CAPABILITIES }
        break
      case 'workflows':
        data = { workflows: RECOMMENDED_WORKFLOWS }
        break
      case 'customization':
        data = { customization: DEFAULT_CUSTOMIZATION }
        break
      case 'all':
      default:
        data = {
          capabilities: SYSTEM_CAPABILITIES,
          workflows: RECOMMENDED_WORKFLOWS,
          customization: DEFAULT_CUSTOMIZATION
        }
    }

    // Apply personalization if requested
    if (personalize) {
      // In a real implementation, this would customize based on user profile
      // For now, we'll just add some mock personalization
      data.personalized = true
      data.userRole = 'Business Development Manager'
      data.experience = 'intermediate'
    }

    const response: APIResponse = {
      success: true,
      data,
      timestamp: Date.now(),
      requestId: `onboarding-config-${Date.now()}`
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Onboarding config error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load onboarding configuration',
        timestamp: Date.now(),
        requestId: `onboarding-config-error-${Date.now()}`
      },
      { status: 500 }
    )
  }
}

// Update onboarding configuration
export async function PUT(request: NextRequest) {
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
    const { section, configuration } = body

    // Validate required fields
    if (!section || !configuration) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: section, configuration' },
        { status: 400 }
      )
    }

    // In a real implementation, this would update the user's configuration in DynamoDB
    // For now, we'll just return success

    const response: APIResponse = {
      success: true,
      data: {
        userId,
        section,
        updated: true,
        message: `${section} configuration updated successfully`
      },
      timestamp: Date.now(),
      requestId: `onboarding-config-update-${Date.now()}`
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Onboarding config update error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to update onboarding configuration',
        timestamp: Date.now(),
        requestId: `onboarding-config-error-${Date.now()}`
      },
      { status: 500 }
    )
  }
}