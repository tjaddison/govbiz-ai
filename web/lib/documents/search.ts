/**
 * Document Search Engine
 * 
 * BM25-based search with semantic capabilities, faceted search,
 * and advanced filtering for government contracting documents
 */

import { 
  Document, 
  SearchQuery, 
  SearchResult, 
  SearchFilter,
  SearchFacet,
  DocumentSearchResult,
  SearchHighlight,
  DocumentCategory,
  SearchConfig
} from './types'
import { DocumentStorage } from './storage'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'

export interface SearchIndex {
  documentId: string
  title: string
  content: string
  category: string
  tags: string[]
  keywords: string[]
  entities: string[]
  createdAt: number
  updatedAt: number
  createdBy: string
  // BM25 preprocessed fields
  titleTokens: string[]
  contentTokens: string[]
  tokenCounts: Map<string, number>
  totalTokens: number
}

export interface BM25Params {
  k1: number  // term frequency saturation parameter
  b: number   // length normalization parameter
}

export class DocumentSearch {
  private searchIndex: Map<string, SearchIndex> = new Map()
  private invertedIndex: Map<string, Set<string>> = new Map()
  private documentFrequency: Map<string, number> = new Map()
  private averageDocumentLength = 0
  private totalDocuments = 0
  private bm25Params: BM25Params = { k1: 1.5, b: 0.75 }
  private isInitialized = false

  constructor(
    private storage: DocumentStorage,
    private config?: SearchConfig
  ) {}

  /**
   * Initialize the search engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Load existing documents and build search index
      await this.buildSearchIndex()
      
      this.isInitialized = true
      logger.info('Document search engine initialized successfully', {
        totalDocuments: this.totalDocuments,
        indexSize: this.searchIndex.size,
      })
    } catch (error) {
      logger.error('Failed to initialize document search', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Search documents using BM25 algorithm
   */
  async search(query: SearchQuery): Promise<SearchResult> {
    const startTime = Date.now()
    
    try {
      if (!this.isInitialized) {
        await this.initialize()
      }

      // Preprocess query
      const queryTokens = this.tokenize(query.query.toLowerCase())
      
      // Calculate BM25 scores for all documents
      const scores = this.calculateBM25Scores(queryTokens)
      
      // Apply filters
      const filteredScores = this.applyFilters(scores, query.filters)
      
      // Sort by score and apply pagination
      const sortedResults = Array.from(filteredScores.entries())
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
        .slice(query.pagination.offset, query.pagination.offset + query.pagination.limit)

      // Retrieve documents and generate highlights
      const documents: DocumentSearchResult[] = []
      for (const [documentId, score] of sortedResults) {
        const document = await this.storage.retrieve(documentId, {
          includeContent: query.options.includeContent,
          includeMetadata: query.options.includeMetadata,
          includeVersions: query.options.includeVersions,
          includeAnalytics: query.options.includeAnalytics,
        })
        
        if (document) {
          const highlights = this.generateHighlights(document, queryTokens)
          documents.push({
            document,
            score,
            highlights,
            explanation: this.generateScoreExplanation(documentId, queryTokens, score),
          })
        }
      }

      // Generate facets
      const facets = await this.generateFacets(filteredScores, query.filters)
      
      // Generate suggestions
      const suggestions = this.generateSuggestions(query.query, queryTokens)

      const processingTime = Date.now() - startTime

      // Record metrics
      await metricsCollector.recordMetric(
        'document_search_time',
        processingTime,
        'milliseconds',
        { queryLength: query.query.length.toString() }
      )

      await metricsCollector.recordMetric(
        'document_search_results',
        documents.length,
        'count',
        { hasFilters: (query.filters.length > 0).toString() }
      )

      const result: SearchResult = {
        documents,
        totalResults: filteredScores.size,
        facets,
        suggestions,
        queryTime: processingTime,
        filters: query.filters,
        pagination: query.pagination,
      }

      logger.info('Document search completed', {
        query: query.query,
        totalResults: result.totalResults,
        returnedResults: documents.length,
        processingTime,
      }, 'search')

      return result
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Document search failed', error instanceof Error ? error : undefined, {
        query: query.query,
        processingTime,
      }, 'search')

      return {
        documents: [],
        totalResults: 0,
        facets: [],
        suggestions: [],
        queryTime: processingTime,
        filters: query.filters,
        pagination: query.pagination,
      }
    }
  }

  /**
   * Add document to search index
   */
  async addToIndex(document: Document): Promise<void> {
    try {
      const searchIndex = this.buildDocumentIndex(document)
      this.searchIndex.set(document.id, searchIndex)
      
      // Update inverted index
      this.updateInvertedIndex(document.id, searchIndex)
      
      // Update statistics
      this.updateIndexStatistics()
      
      logger.debug('Document added to search index', {
        documentId: document.id,
        tokenCount: searchIndex.totalTokens,
      })
    } catch (error) {
      logger.error('Failed to add document to search index', error instanceof Error ? error : undefined, {
        documentId: document.id,
      })
    }
  }

  /**
   * Remove document from search index
   */
  async removeFromIndex(documentId: string): Promise<void> {
    try {
      const searchIndex = this.searchIndex.get(documentId)
      if (!searchIndex) return

      // Remove from inverted index
      this.removeFromInvertedIndex(documentId, searchIndex)
      
      // Remove from main index
      this.searchIndex.delete(documentId)
      
      // Update statistics
      this.updateIndexStatistics()
      
      logger.debug('Document removed from search index', { documentId })
    } catch (error) {
      logger.error('Failed to remove document from search index', error instanceof Error ? error : undefined, {
        documentId,
      })
    }
  }

  /**
   * Update document in search index
   */
  async updateIndex(document: Document): Promise<void> {
    await this.removeFromIndex(document.id)
    await this.addToIndex(document)
  }

  /**
   * Get search suggestions
   */
  async getSuggestions(partialQuery: string, limit = 10): Promise<string[]> {
    try {
      const tokens = this.tokenize(partialQuery.toLowerCase())
      const lastToken = tokens[tokens.length - 1] || ''
      
      // Find tokens that start with the last partial token
      const suggestions = new Set<string>()
      
      for (const token of this.documentFrequency.keys()) {
        if (token.startsWith(lastToken) && token !== lastToken) {
          suggestions.add(token)
        }
      }
      
      // Sort by frequency and return top suggestions
      return Array.from(suggestions)
        .sort((a, b) => (this.documentFrequency.get(b) || 0) - (this.documentFrequency.get(a) || 0))
        .slice(0, limit)
    } catch (error) {
      logger.error('Failed to get search suggestions', error instanceof Error ? error : undefined)
      return []
    }
  }

  /**
   * Get search analytics
   */
  getSearchAnalytics(): {
    totalDocuments: number
    indexSize: number
    vocabularySize: number
    averageDocumentLength: number
  } {
    return {
      totalDocuments: this.totalDocuments,
      indexSize: this.searchIndex.size,
      vocabularySize: this.documentFrequency.size,
      averageDocumentLength: this.averageDocumentLength,
    }
  }

  /**
   * Shutdown search engine
   */
  async shutdown(): Promise<void> {
    this.searchIndex.clear()
    this.invertedIndex.clear()
    this.documentFrequency.clear()
    logger.info('Document search engine shutdown complete')
  }

  // Private methods

  private async buildSearchIndex(): Promise<void> {
    try {
      // Get all documents from storage
      const { documents } = await this.storage.list({ limit: 10000 })
      
      // Build index for each document
      for (const document of documents) {
        const fullDocument = await this.storage.retrieve(document.id, { includeContent: true })
        if (fullDocument) {
          await this.addToIndex(fullDocument)
        }
      }

      logger.info('Search index built successfully', {
        documentsIndexed: this.searchIndex.size,
      })
    } catch (error) {
      logger.error('Failed to build search index', error instanceof Error ? error : undefined)
      throw error
    }
  }

  private buildDocumentIndex(document: Document): SearchIndex {
    const titleTokens = this.tokenize(document.title.toLowerCase())
    const contentTokens = this.tokenize(document.content.toLowerCase())
    const allTokens = [...titleTokens, ...contentTokens]
    
    // Count token frequencies
    const tokenCounts = new Map<string, number>()
    allTokens.forEach(token => {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1)
    })

    return {
      documentId: document.id,
      title: document.title,
      content: document.content,
      category: document.classification.category,
      tags: document.metadata.tags,
      keywords: document.classification.keywords,
      entities: document.classification.entities.map(e => e.text),
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      createdBy: document.createdBy,
      titleTokens,
      contentTokens,
      tokenCounts,
      totalTokens: allTokens.length,
    }
  }

  private tokenize(text: string): string[] {
    // Simple tokenization - in production would use more sophisticated NLP
    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2)
      .filter(token => !this.isStopWord(token))
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ])
    return stopWords.has(word.toLowerCase())
  }

  private updateInvertedIndex(documentId: string, searchIndex: SearchIndex): void {
    // Add tokens to inverted index
    for (const token of searchIndex.tokenCounts.keys()) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set())
      }
      this.invertedIndex.get(token)!.add(documentId)
      
      // Update document frequency
      this.documentFrequency.set(token, this.invertedIndex.get(token)!.size)
    }
  }

  private removeFromInvertedIndex(documentId: string, searchIndex: SearchIndex): void {
    // Remove tokens from inverted index
    for (const token of searchIndex.tokenCounts.keys()) {
      const documentSet = this.invertedIndex.get(token)
      if (documentSet) {
        documentSet.delete(documentId)
        if (documentSet.size === 0) {
          this.invertedIndex.delete(token)
          this.documentFrequency.delete(token)
        } else {
          this.documentFrequency.set(token, documentSet.size)
        }
      }
    }
  }

  private updateIndexStatistics(): void {
    this.totalDocuments = this.searchIndex.size
    
    if (this.totalDocuments > 0) {
      const totalLength = Array.from(this.searchIndex.values())
        .reduce((sum, doc) => sum + doc.totalTokens, 0)
      this.averageDocumentLength = totalLength / this.totalDocuments
    } else {
      this.averageDocumentLength = 0
    }
  }

  private calculateBM25Scores(queryTokens: string[]): Map<string, number> {
    const scores = new Map<string, number>()
    
    // Get all documents that contain at least one query token
    const candidateDocuments = new Set<string>()
    queryTokens.forEach(token => {
      const docs = this.invertedIndex.get(token)
      if (docs) {
        docs.forEach(docId => candidateDocuments.add(docId))
      }
    })

    // Calculate BM25 score for each candidate document
    for (const documentId of candidateDocuments) {
      const searchIndex = this.searchIndex.get(documentId)
      if (!searchIndex) continue

      let score = 0
      
      for (const queryToken of queryTokens) {
        const termFreq = searchIndex.tokenCounts.get(queryToken) || 0
        const docFreq = this.documentFrequency.get(queryToken) || 0
        
        if (termFreq > 0 && docFreq > 0) {
          // BM25 formula
          const idf = Math.log((this.totalDocuments - docFreq + 0.5) / (docFreq + 0.5))
          const tf = (termFreq * (this.bm25Params.k1 + 1)) / 
                    (termFreq + this.bm25Params.k1 * 
                     (1 - this.bm25Params.b + this.bm25Params.b * 
                      (searchIndex.totalTokens / this.averageDocumentLength)))
          
          score += idf * tf
        }
      }

      if (score > 0) {
        scores.set(documentId, score)
      }
    }

    return scores
  }

  private applyFilters(scores: Map<string, number>, filters: SearchFilter[]): Map<string, number> {
    if (filters.length === 0) return scores

    const filteredScores = new Map<string, number>()

    for (const [documentId, score] of scores) {
      const searchIndex = this.searchIndex.get(documentId)
      if (!searchIndex) continue

      let passesAllFilters = true

      for (const filter of filters) {
        if (!this.evaluateFilter(searchIndex, filter)) {
          passesAllFilters = false
          break
        }
      }

      if (passesAllFilters) {
        filteredScores.set(documentId, score)
      }
    }

    return filteredScores
  }

  private evaluateFilter(searchIndex: SearchIndex, filter: SearchFilter): boolean {
    let fieldValue: any

    switch (filter.field) {
      case 'category':
        fieldValue = searchIndex.category
        break
      case 'tags':
        fieldValue = searchIndex.tags
        break
      case 'createdBy':
        fieldValue = searchIndex.createdBy
        break
      case 'createdAt':
        fieldValue = searchIndex.createdAt
        break
      case 'updatedAt':
        fieldValue = searchIndex.updatedAt
        break
      default:
        return true // Unknown field, don't filter
    }

    switch (filter.operator) {
      case 'eq':
        return fieldValue === filter.value
      case 'ne':
        return fieldValue !== filter.value
      case 'gt':
        return fieldValue > filter.value
      case 'gte':
        return fieldValue >= filter.value
      case 'lt':
        return fieldValue < filter.value
      case 'lte':
        return fieldValue <= filter.value
      case 'contains':
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(filter.value)
        }
        return String(fieldValue).toLowerCase().includes(String(filter.value).toLowerCase())
      case 'in':
        if (Array.isArray(filter.value)) {
          return filter.value.includes(fieldValue)
        }
        return false
      case 'range':
        if (filter.value && typeof filter.value === 'object' && 'min' in filter.value && 'max' in filter.value) {
          return fieldValue >= filter.value.min && fieldValue <= filter.value.max
        }
        return false
      default:
        return true
    }
  }

  private generateHighlights(document: Document, queryTokens: string[]): SearchHighlight[] {
    const highlights: SearchHighlight[] = []

    // Highlight in title
    const titleHighlights = this.findHighlightFragments(document.title, queryTokens)
    if (titleHighlights.length > 0) {
      highlights.push({
        field: 'title',
        fragments: titleHighlights,
      })
    }

    // Highlight in content
    const contentHighlights = this.findHighlightFragments(document.content, queryTokens, 150)
    if (contentHighlights.length > 0) {
      highlights.push({
        field: 'content',
        fragments: contentHighlights,
      })
    }

    return highlights
  }

  private findHighlightFragments(text: string, queryTokens: string[], fragmentSize = 50): string[] {
    const fragments: string[] = []
    const lowerText = text.toLowerCase()
    const words = text.split(/\s+/)

    for (const token of queryTokens) {
      const tokenIndex = lowerText.indexOf(token.toLowerCase())
      if (tokenIndex !== -1) {
        // Find the word index
        let wordIndex = 0
        let charCount = 0
        
        while (wordIndex < words.length && charCount < tokenIndex) {
          charCount += words[wordIndex].length + 1 // +1 for space
          wordIndex++
        }

        // Extract fragment around the word
        const startIndex = Math.max(0, wordIndex - fragmentSize / 2)
        const endIndex = Math.min(words.length, wordIndex + fragmentSize / 2)
        
        let fragment = words.slice(startIndex, endIndex).join(' ')
        
        // Add highlighting
        const regex = new RegExp(`\\b${token}\\b`, 'gi')
        fragment = fragment.replace(regex, `<mark>$&</mark>`)
        
        fragments.push(fragment)
        
        if (fragments.length >= 3) break // Limit fragments
      }
    }

    return fragments
  }

  private async generateFacets(scores: Map<string, number>, currentFilters: SearchFilter[]): Promise<SearchFacet[]> {
    const facets: SearchFacet[] = []
    
    // Category facet
    const categoryCount = new Map<string, number>()
    for (const documentId of scores.keys()) {
      const searchIndex = this.searchIndex.get(documentId)
      if (searchIndex) {
        const category = searchIndex.category
        categoryCount.set(category, (categoryCount.get(category) || 0) + 1)
      }
    }

    if (categoryCount.size > 0) {
      facets.push({
        field: 'category',
        values: Array.from(categoryCount.entries())
          .sort(([, a], [, b]) => b - a)
          .map(([value, count]) => ({
            value,
            count,
            selected: currentFilters.some(f => f.field === 'category' && f.value === value),
          })),
      })
    }

    // Tags facet
    const tagCount = new Map<string, number>()
    for (const documentId of scores.keys()) {
      const searchIndex = this.searchIndex.get(documentId)
      if (searchIndex) {
        for (const tag of searchIndex.tags) {
          tagCount.set(tag, (tagCount.get(tag) || 0) + 1)
        }
      }
    }

    if (tagCount.size > 0) {
      facets.push({
        field: 'tags',
        values: Array.from(tagCount.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10) // Top 10 tags
          .map(([value, count]) => ({
            value,
            count,
            selected: currentFilters.some(f => f.field === 'tags' && f.value === value),
          })),
      })
    }

    return facets
  }

  private generateSuggestions(originalQuery: string, queryTokens: string[]): string[] {
    const suggestions: string[] = []
    
    // Find related terms based on co-occurrence
    const relatedTerms = new Map<string, number>()
    
    for (const documentId of this.searchIndex.keys()) {
      const searchIndex = this.searchIndex.get(documentId)!
      
      // Check if document contains any query tokens
      const hasQueryTokens = queryTokens.some(token => 
        searchIndex.tokenCounts.has(token)
      )
      
      if (hasQueryTokens) {
        // Add other tokens from this document as related terms
        for (const [token, count] of searchIndex.tokenCounts) {
          if (!queryTokens.includes(token)) {
            relatedTerms.set(token, (relatedTerms.get(token) || 0) + count)
          }
        }
      }
    }

    // Sort by frequency and take top suggestions
    const topRelatedTerms = Array.from(relatedTerms.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([term]) => term)

    // Generate query suggestions
    if (topRelatedTerms.length > 0) {
      suggestions.push(`${originalQuery} ${topRelatedTerms[0]}`)
      if (topRelatedTerms.length > 1) {
        suggestions.push(`${originalQuery} ${topRelatedTerms[1]}`)
      }
    }

    return suggestions
  }

  private generateScoreExplanation(documentId: string, queryTokens: string[], score: number): string {
    const searchIndex = this.searchIndex.get(documentId)
    if (!searchIndex) return 'No explanation available'

    const explanationParts: string[] = []
    
    for (const token of queryTokens) {
      const termFreq = searchIndex.tokenCounts.get(token) || 0
      if (termFreq > 0) {
        explanationParts.push(`"${token}" appears ${termFreq} times`)
      }
    }

    return `Score: ${score.toFixed(2)}. ${explanationParts.join(', ')}.`
  }
}

export default DocumentSearch