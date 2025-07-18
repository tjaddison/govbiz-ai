'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { Search, Filter, Clock, FileText, MessageSquare, Star, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useDebounce } from 'use-debounce'

interface SearchResult {
  document: {
    id: string
    title: string
    content: string
    type: 'message' | 'conversation' | 'document' | 'sources_sought' | 'proposal' | 'contract'
    classification: 'public' | 'sensitive' | 'confidential' | 'secret'
    metadata: {
      userId?: string
      conversationId?: string
      createdAt: string
      tags: string[]
      category: string
      source: string
      tokenCount: number
      wordCount: number
    }
  }
  score: number
  highlights: string[]
}

interface SearchFilters {
  types: string[]
  classifications: string[]
  dateFrom?: Date
  dateTo?: Date
  tags: string[]
  categories: string[]
  sources: string[]
  minScore?: number
}

interface SearchOptions {
  limit: number
  includeContent: boolean
  highlightMatches: boolean
  synonyms: boolean
}

export function SearchInterface() {
  const [query, setQuery] = useState('')
  const [debouncedQuery] = useDebounce(query, 300)
  const [results, setResults] = useState<SearchResult[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [executionTime, setExecutionTime] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)

  const [filters, setFilters] = useState<SearchFilters>({
    types: [],
    classifications: [],
    tags: [],
    categories: [],
    sources: []
  })

  const [options, setOptions] = useState<SearchOptions>({
    limit: 20,
    includeContent: true,
    highlightMatches: true,
    synonyms: true
  })

  const [facets, setFacets] = useState<{
    types: Record<string, number>
    classifications: Record<string, number>
    categories: Record<string, number>
    tags: Record<string, number>
  } | null>(null)

  // Perform search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setTotalCount(0)
      setSuggestions([])
      setFacets(null)
      return
    }

    setLoading(true)
    try {
      const searchPayload = {
        query: searchQuery,
        filters: {
          ...filters,
          dateFrom: filters.dateFrom?.toISOString(),
          dateTo: filters.dateTo?.toISOString()
        },
        options
      }

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchPayload)
      })

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      setResults(data.results || [])
      setTotalCount(data.totalCount || 0)
      setExecutionTime(data.executionTime || 0)
      setSuggestions(data.suggestions || [])
      setFacets(data.facets || null)
    } catch (error) {
      console.error('Search error:', error)
      setResults([])
      setTotalCount(0)
      setSuggestions([])
      setFacets(null)
    } finally {
      setLoading(false)
    }
  }, [filters, options])

  // Get search suggestions
  const getSuggestions = useCallback(async (partialQuery: string) => {
    if (partialQuery.length < 2) {
      setSuggestions([])
      return
    }

    try {
      const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(partialQuery)}`)
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.suggestions || [])
      }
    } catch (error) {
      console.error('Suggestions error:', error)
    }
  }, [])

  // Effect for performing search
  React.useEffect(() => {
    performSearch(debouncedQuery)
  }, [debouncedQuery, performSearch])

  // Effect for getting suggestions
  React.useEffect(() => {
    if (query && query !== debouncedQuery) {
      getSuggestions(query)
    }
  }, [query, debouncedQuery, getSuggestions])

  const typeIcons = {
    message: MessageSquare,
    conversation: MessageSquare,
    document: FileText,
    sources_sought: FileText,
    proposal: FileText,
    contract: FileText
  }

  const classificationColors = {
    public: 'bg-green-100 text-green-800',
    sensitive: 'bg-yellow-100 text-yellow-800',
    confidential: 'bg-orange-100 text-orange-800',
    secret: 'bg-red-100 text-red-800'
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const highlightText = (text: string, highlights: string[]) => {
    if (!highlights.length) return { __html: text }

    let highlightedText = text
    highlights.forEach(highlight => {
      const cleanHighlight = highlight.replace(/<\/?mark>/g, '')
      if (cleanHighlight && text.includes(cleanHighlight)) {
        highlightedText = highlightedText.replace(
          new RegExp(cleanHighlight, 'gi'),
          '<mark class="bg-yellow-200">$&</mark>'
        )
      }
    })

    return { __html: highlightedText }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Search Header */}
      <div className="border-b bg-white p-4 space-y-4">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search conversations, documents, and sources sought..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 pr-4"
            />
            
            {/* Search Suggestions */}
            {suggestions.length > 0 && query && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg z-50 mt-1">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    onClick={() => {
                      setQuery(suggestion)
                      setSuggestions([])
                    }}
                  >
                    <div className="flex items-center space-x-2">
                      <Clock className="h-3 w-3 text-gray-400" />
                      <span className="text-sm">{suggestion}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-gray-100' : ''}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Search Stats */}
        {(results.length > 0 || loading) && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div>
              {loading ? (
                <span>Searching...</span>
              ) : (
                <span>
                  {totalCount.toLocaleString()} results in {executionTime}ms
                </span>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <Select value={options.limit.toString()} onValueChange={(value) => 
                setOptions(prev => ({ ...prev, limit: parseInt(value) }))
              }>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex">
        {/* Filters Sidebar */}
        <Collapsible open={showFilters} onOpenChange={setShowFilters}>
          <CollapsibleContent className="w-80 border-r bg-gray-50 p-4 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Filters</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({
                  types: [],
                  classifications: [],
                  tags: [],
                  categories: [],
                  sources: []
                })}
              >
                Clear All
              </Button>
            </div>

            {/* Document Types */}
            {facets?.types && Object.keys(facets.types).length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">Document Types</h4>
                <div className="space-y-2">
                  {Object.entries(facets.types).map(([type, count]) => (
                    <div key={type} className="flex items-center space-x-2">
                      <Checkbox
                        id={`type-${type}`}
                        checked={filters.types.includes(type)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFilters(prev => ({ ...prev, types: [...prev.types, type] }))
                          } else {
                            setFilters(prev => ({ ...prev, types: prev.types.filter(t => t !== type) }))
                          }
                        }}
                      />
                      <label htmlFor={`type-${type}`} className="text-sm flex-1 capitalize">
                        {type.replace('_', ' ')} ({count})
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Classifications */}
            {facets?.classifications && Object.keys(facets.classifications).length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">Classifications</h4>
                <div className="space-y-2">
                  {Object.entries(facets.classifications).map(([classification, count]) => (
                    <div key={classification} className="flex items-center space-x-2">
                      <Checkbox
                        id={`classification-${classification}`}
                        checked={filters.classifications.includes(classification)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFilters(prev => ({ ...prev, classifications: [...prev.classifications, classification] }))
                          } else {
                            setFilters(prev => ({ ...prev, classifications: prev.classifications.filter(c => c !== classification) }))
                          }
                        }}
                      />
                      <label htmlFor={`classification-${classification}`} className="text-sm flex-1 capitalize">
                        {classification} ({count})
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Categories */}
            {facets?.categories && Object.keys(facets.categories).length > 0 && (
              <div>
                <h4 className="font-medium text-sm mb-2">Categories</h4>
                <div className="space-y-2">
                  {Object.entries(facets.categories).slice(0, 10).map(([category, count]) => (
                    <div key={category} className="flex items-center space-x-2">
                      <Checkbox
                        id={`category-${category}`}
                        checked={filters.categories.includes(category)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFilters(prev => ({ ...prev, categories: [...prev.categories, category] }))
                          } else {
                            setFilters(prev => ({ ...prev, categories: prev.categories.filter(c => c !== category) }))
                          }
                        }}
                      />
                      <label htmlFor={`category-${category}`} className="text-sm flex-1">
                        {category} ({count})
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search Options */}
            <div>
              <h4 className="font-medium text-sm mb-2">Options</h4>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-content"
                    checked={options.includeContent}
                    onCheckedChange={(checked) => 
                      setOptions(prev => ({ ...prev, includeContent: !!checked }))
                    }
                  />
                  <label htmlFor="include-content" className="text-sm">Include full content</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="highlight-matches"
                    checked={options.highlightMatches}
                    onCheckedChange={(checked) => 
                      setOptions(prev => ({ ...prev, highlightMatches: !!checked }))
                    }
                  />
                  <label htmlFor="highlight-matches" className="text-sm">Highlight matches</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="synonyms"
                    checked={options.synonyms}
                    onCheckedChange={(checked) => 
                      setOptions(prev => ({ ...prev, synonyms: !!checked }))
                    }
                  />
                  <label htmlFor="synonyms" className="text-sm">Use synonyms</label>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Search Results */}
        <div className="flex-1 overflow-auto">
          {results.length === 0 && !loading && query && (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <div className="text-center">
                <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No results found for &quot;{query}&quot;</p>
                <p className="text-sm mt-2">Try adjusting your search terms or filters</p>
              </div>
            </div>
          )}

          {results.length === 0 && !loading && !query && (
            <div className="flex items-center justify-center h-64 text-gray-500">
              <div className="text-center">
                <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Search conversations, documents, and sources sought</p>
                <p className="text-sm mt-2">Use the search bar above to get started</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          <div className="p-4 space-y-4">
            {results.map((result) => {
              const Icon = typeIcons[result.document.type]
              return (
                <Card 
                  key={result.document.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedResult(result)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <Icon className="h-4 w-4 text-gray-500" />
                        <CardTitle className="text-base">{result.document.title}</CardTitle>
                        <Badge 
                          variant="secondary" 
                          className={classificationColors[result.document.classification]}
                        >
                          {result.document.classification}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1">
                          <Star className="h-3 w-3 text-yellow-500" />
                          <span className="text-xs text-gray-500">
                            {result.score.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>{formatDate(result.document.metadata.createdAt)}</span>
                      <span>{result.document.metadata.wordCount} words</span>
                      <span className="capitalize">{result.document.type.replace('_', ' ')}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {result.highlights.length > 0 && (
                      <div className="mb-3">
                        {result.highlights.slice(0, 2).map((highlight, index) => (
                          <div 
                            key={index}
                            className="text-sm text-gray-700 mb-1"
                            dangerouslySetInnerHTML={highlightText('', [highlight])}
                          />
                        ))}
                      </div>
                    )}
                    
                    {result.document.metadata.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {result.document.metadata.tags.slice(0, 5).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    
                    <div className="text-xs text-gray-500">
                      {result.document.metadata.category} • {result.document.metadata.source}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      {/* Document Detail Modal */}
      {selectedResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{selectedResult.document.title}</h2>
              <Button variant="ghost" size="sm" onClick={() => setSelectedResult(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span>Score: {selectedResult.score.toFixed(2)}</span>
                <span>{formatDate(selectedResult.document.metadata.createdAt)}</span>
                <Badge className={classificationColors[selectedResult.document.classification]}>
                  {selectedResult.document.classification}
                </Badge>
              </div>
              
              {selectedResult.document.metadata.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedResult.document.metadata.tags.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              )}
              
              <Separator />
              
              <div className="prose max-w-none">
                <div 
                  dangerouslySetInnerHTML={
                    highlightText(selectedResult.document.content, selectedResult.highlights)
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}