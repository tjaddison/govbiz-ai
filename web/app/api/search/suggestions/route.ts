import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchEngine } from '@/lib/search/BM25SearchEngine'

// This route uses dynamic features and should not be pre-rendered
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    
    if (!query) {
      return new NextResponse('Query parameter "q" is required', { status: 400 })
    }

    if (query.length < 2) {
      return NextResponse.json({
        suggestions: [],
        message: 'Query too short - minimum 2 characters required'
      })
    }

    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10

    // Get search suggestions
    const suggestions = await searchEngine.getSuggestions(query, limit)

    // Add government contracting specific suggestions
    const contractingSuggestions = getContractingSuggestions(query)
    
    // Combine and deduplicate suggestions
    const allSuggestions = [...suggestions, ...contractingSuggestions]
    const uniqueSuggestions = Array.from(new Set(allSuggestions)).slice(0, limit)

    return NextResponse.json({
      suggestions: uniqueSuggestions,
      query,
      count: uniqueSuggestions.length,
      metadata: {
        searchEngineTerms: suggestions.length,
        contractingTerms: contractingSuggestions.length,
        generatedAt: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Search suggestions error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

function getContractingSuggestions(query: string): string[] {
  const queryLower = query.toLowerCase()
  
  const contractingQueries = [
    // Sources Sought related
    'sources sought opportunities',
    'sources sought notices',
    'sam.gov sources sought',
    'market research notices',
    'request for information',
    'rfi responses',
    'industry engagement',
    
    // Business Types
    'small business set aside',
    'woman owned small business',
    'service disabled veteran owned',
    'hubzone certification',
    '8(a) business development',
    'disadvantaged business enterprise',
    
    // Procurement Types
    'request for proposal',
    'request for quotation',
    'indefinite delivery indefinite quantity',
    'blanket purchase agreement',
    'multiple award contract',
    'government wide acquisition contract',
    
    // Compliance and Requirements
    'federal acquisition regulation',
    'defense federal acquisition regulation',
    'far compliance requirements',
    'past performance evaluation',
    'technical capability assessment',
    'cost proposal guidelines',
    
    // Contract Management
    'contract performance monitoring',
    'deliverable submission',
    'milestone reporting',
    'invoice processing',
    'contract modification',
    'option period exercise',
    
    // Capabilities and Qualifications
    'contractor capabilities',
    'technical qualifications',
    'past performance references',
    'facility security clearance',
    'quality assurance program',
    'cybersecurity requirements',
    
    // Specific Industries
    'information technology services',
    'professional services',
    'construction services',
    'research and development',
    'maintenance and support',
    'training services'
  ]
  
  return contractingQueries
    .filter(suggestion => 
      suggestion.toLowerCase().includes(queryLower) && 
      suggestion.toLowerCase() !== queryLower
    )
    .slice(0, 5)
}