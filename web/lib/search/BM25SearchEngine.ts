/**
 * BM25 Search Engine Implementation
 * Provides fast, accurate full-text search for government contracting documents
 * with support for document classification, metadata indexing, and relevance scoring
 */

export interface SearchDocument {
  id: string
  title: string
  content: string
  type: 'message' | 'conversation' | 'document' | 'sources_sought' | 'proposal' | 'contract'
  classification: 'public' | 'sensitive' | 'confidential' | 'secret'
  metadata: {
    userId?: string
    conversationId?: string
    createdAt: Date
    updatedAt: Date
    tags: string[]
    category: string
    source: string
    language: string
    tokenCount: number
    wordCount: number
    [key: string]: any
  }
  permissions: {
    read: string[]
    write: string[]
    admin: string[]
  }
}

export interface SearchQuery {
  query: string
  filters?: {
    types?: string[]
    classifications?: string[]
    dateFrom?: Date
    dateTo?: Date
    userId?: string
    conversationId?: string
    tags?: string[]
    categories?: string[]
    sources?: string[]
    minScore?: number
  }
  options?: {
    limit?: number
    offset?: number
    includeContent?: boolean
    includeMetadata?: boolean
    highlightMatches?: boolean
    fuzzySearch?: boolean
    stemming?: boolean
    synonyms?: boolean
  }
  permissions?: {
    userId: string
    roles: string[]
  }
}

export interface SearchResult {
  document: SearchDocument
  score: number
  highlights: string[]
  explanation?: {
    termMatches: Array<{
      term: string
      frequency: number
      idf: number
      boost: number
    }>
    fieldBoosts: Record<string, number>
    finalScore: number
  }
}

export interface SearchResponse {
  results: SearchResult[]
  totalCount: number
  query: string
  executionTime: number
  suggestions?: string[]
  facets?: {
    types: Record<string, number>
    classifications: Record<string, number>
    categories: Record<string, number>
    tags: Record<string, number>
  }
  metadata: {
    searchedFields: string[]
    appliedFilters: Record<string, any>
    permissions: boolean
  }
}

export interface IndexStats {
  totalDocuments: number
  totalTerms: number
  averageDocumentLength: number
  indexSize: number
  lastUpdated: Date
  documentsPerType: Record<string, number>
  documentsPerClassification: Record<string, number>
}

/**
 * BM25 parameters for fine-tuning relevance scoring
 */
export interface BM25Parameters {
  k1: number // Term frequency saturation parameter (typically 1.2)
  b: number  // Length normalization parameter (typically 0.75)
  fieldBoosts: Record<string, number> // Boost factors for different fields
}

/**
 * Advanced BM25 search engine with government contracting domain optimizations
 */
export class BM25SearchEngine {
  private documents: Map<string, SearchDocument> = new Map()
  private invertedIndex: Map<string, Map<string, TermFrequency>> = new Map()
  private documentLengths: Map<string, number> = new Map()
  private averageDocumentLength: number = 0
  private totalDocuments: number = 0
  private termDocumentFrequency: Map<string, number> = new Map()
  
  // BM25 parameters optimized for government documents
  private parameters: BM25Parameters = {
    k1: 1.2,
    b: 0.75,
    fieldBoosts: {
      title: 3.0,
      content: 1.0,
      tags: 2.0,
      category: 1.5,
      summary: 2.5
    }
  }

  // Government contracting domain-specific enhancements
  private contractingTerms: Set<string> = new Set([
    'sources', 'sought', 'rfp', 'rfq', 'rfi', 'solicitation', 'proposal', 'contract',
    'federal', 'government', 'acquisition', 'procurement', 'vendor', 'contractor',
    'small', 'business', 'set-aside', 'naics', 'sam', 'cage', 'duns', 'uei',
    'far', 'dfars', 'compliance', 'requirements', 'specifications', 'performance',
    'deliverables', 'milestone', 'statement', 'work', 'past', 'capabilities'
  ])

  private synonymMap: Map<string, string[]> = new Map([
    ['rfp', ['request for proposal', 'solicitation']],
    ['rfq', ['request for quotation', 'quote request']],
    ['rfi', ['request for information', 'sources sought']],
    ['government', ['federal', 'agency', 'public sector']],
    ['contractor', ['vendor', 'supplier', 'company', 'business']],
    ['compliance', ['conformance', 'adherence', 'requirement']],
    ['specification', ['requirement', 'criteria', 'standard']]
  ])

  constructor(parameters?: Partial<BM25Parameters>) {
    if (parameters) {
      this.parameters = { ...this.parameters, ...parameters }
    }
  }

  /**
   * Add or update a document in the search index
   */
  async indexDocument(document: SearchDocument): Promise<void> {
    try {
      // Preprocess document content
      const processedContent = await this.preprocessDocument(document)
      
      // Remove existing document if it exists
      if (this.documents.has(document.id)) {
        await this.removeDocument(document.id)
      }

      // Store document
      this.documents.set(document.id, document)

      // Extract and index terms
      const terms = this.extractTerms(processedContent)
      const documentLength = terms.length
      this.documentLengths.set(document.id, documentLength)

      // Update inverted index
      const termFrequencies = this.calculateTermFrequencies(terms)
      
      for (const [term, frequency] of termFrequencies.entries()) {
        if (!this.invertedIndex.has(term)) {
          this.invertedIndex.set(term, new Map())
        }
        
        this.invertedIndex.get(term)!.set(document.id, {
          frequency,
          positions: this.findTermPositions(terms, term),
          fieldFrequencies: this.calculateFieldFrequencies(term, document)
        })

        // Update document frequency for this term
        const currentDF = this.termDocumentFrequency.get(term) || 0
        this.termDocumentFrequency.set(term, currentDF + 1)
      }

      // Update statistics
      this.totalDocuments = this.documents.size
      this.averageDocumentLength = this.calculateAverageDocumentLength()

    } catch (error) {
      console.error('Error indexing document:', error)
      throw new Error(`Failed to index document ${document.id}: ${error}`)
    }
  }

  /**
   * Remove a document from the search index
   */
  async removeDocument(documentId: string): Promise<boolean> {
    try {
      const document = this.documents.get(documentId)
      if (!document) {
        return false
      }

      // Remove from documents
      this.documents.delete(documentId)
      this.documentLengths.delete(documentId)

      // Update inverted index
      for (const [term, docMap] of this.invertedIndex.entries()) {
        if (docMap.has(documentId)) {
          docMap.delete(documentId)
          
          // Update document frequency
          const currentDF = this.termDocumentFrequency.get(term) || 0
          if (currentDF > 0) {
            this.termDocumentFrequency.set(term, currentDF - 1)
          }
          
          // Remove term if no documents contain it
          if (docMap.size === 0) {
            this.invertedIndex.delete(term)
            this.termDocumentFrequency.delete(term)
          }
        }
      }

      // Update statistics
      this.totalDocuments = this.documents.size
      this.averageDocumentLength = this.calculateAverageDocumentLength()

      return true
    } catch (error) {
      console.error('Error removing document:', error)
      return false
    }
  }

  /**
   * Search documents using BM25 scoring with advanced filtering
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now()
    
    try {
      // Preprocess query
      const processedQuery = await this.preprocessQuery(query.query)
      const queryTerms = this.extractTerms(processedQuery)
      
      // Expand query with synonyms if enabled
      const expandedTerms = query.options?.synonyms 
        ? this.expandQueryWithSynonyms(queryTerms)
        : queryTerms

      // Get candidate documents
      const candidateDocuments = this.getCandidateDocuments(expandedTerms)
      
      // Apply permission filtering
      const permittedDocuments = query.permissions 
        ? this.filterByPermissions(candidateDocuments, query.permissions)
        : candidateDocuments

      // Apply additional filters
      const filteredDocuments = this.applyFilters(permittedDocuments, query.filters)

      // Calculate BM25 scores
      const scoredResults = await this.calculateBM25Scores(
        filteredDocuments,
        expandedTerms,
        query.options?.includeContent,
        query.options?.highlightMatches
      )

      // Sort by relevance score
      scoredResults.sort((a, b) => b.score - a.score)

      // Apply minimum score filter
      const minScore = query.filters?.minScore || 0
      const qualifiedResults = scoredResults.filter(result => result.score >= minScore)

      // Apply pagination
      const offset = query.options?.offset || 0
      const limit = query.options?.limit || 20
      const paginatedResults = qualifiedResults.slice(offset, offset + limit)

      // Generate search suggestions
      const suggestions = await this.generateSuggestions(query.query, queryTerms)

      // Calculate facets
      const facets = this.calculateFacets(filteredDocuments)

      const executionTime = Date.now() - startTime

      return {
        results: paginatedResults,
        totalCount: qualifiedResults.length,
        query: query.query,
        executionTime,
        suggestions,
        facets,
        metadata: {
          searchedFields: Object.keys(this.parameters.fieldBoosts),
          appliedFilters: query.filters || {},
          permissions: !!query.permissions
        }
      }
    } catch (error) {
      console.error('Search error:', error)
      throw new Error(`Search failed: ${error}`)
    }
  }

  /**
   * Get search suggestions based on partial query
   */
  async getSuggestions(partialQuery: string, limit = 10): Promise<string[]> {
    const processedQuery = partialQuery.toLowerCase().trim()
    
    if (processedQuery.length < 2) {
      return []
    }

    const suggestions = new Set<string>()
    
    // Find terms that start with the partial query
    for (const term of this.invertedIndex.keys()) {
      if (term.startsWith(processedQuery)) {
        suggestions.add(term)
      }
    }

    // Add contracting-specific term suggestions
    for (const term of this.contractingTerms) {
      if (term.includes(processedQuery)) {
        suggestions.add(term)
      }
    }

    return Array.from(suggestions).slice(0, limit)
  }

  /**
   * Get index statistics
   */
  getIndexStats(): IndexStats {
    const documentsPerType: Record<string, number> = {}
    const documentsPerClassification: Record<string, number> = {}

    for (const doc of this.documents.values()) {
      documentsPerType[doc.type] = (documentsPerType[doc.type] || 0) + 1
      documentsPerClassification[doc.classification] = 
        (documentsPerClassification[doc.classification] || 0) + 1
    }

    return {
      totalDocuments: this.totalDocuments,
      totalTerms: this.invertedIndex.size,
      averageDocumentLength: this.averageDocumentLength,
      indexSize: this.calculateIndexSize(),
      lastUpdated: new Date(),
      documentsPerType,
      documentsPerClassification
    }
  }

  /**
   * Rebuild the entire search index
   */
  async rebuildIndex(): Promise<void> {
    const documents = Array.from(this.documents.values())
    
    // Clear existing index
    this.clearIndex()
    
    // Reindex all documents
    for (const document of documents) {
      await this.indexDocument(document)
    }
  }

  /**
   * Clear the entire search index
   */
  clearIndex(): void {
    this.documents.clear()
    this.invertedIndex.clear()
    this.documentLengths.clear()
    this.termDocumentFrequency.clear()
    this.totalDocuments = 0
    this.averageDocumentLength = 0
  }

  // Private helper methods
  private async preprocessDocument(document: SearchDocument): Promise<string> {
    // Combine all searchable fields
    const searchableContent = [
      document.title,
      document.content,
      document.metadata.tags.join(' '),
      document.metadata.category,
      document.metadata.source
    ].filter(Boolean).join(' ')

    return this.normalizeText(searchableContent)
  }

  private async preprocessQuery(query: string): Promise<string> {
    return this.normalizeText(query)
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ') // Remove punctuation except hyphens
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim()
  }

  private extractTerms(text: string): string[] {
    const terms = text.split(/\s+/).filter(term => 
      term.length > 1 && !this.isStopWord(term)
    )
    
    // Apply stemming if enabled
    return terms.map(term => this.stemTerm(term))
  }

  private isStopWord(term: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ])
    
    return stopWords.has(term)
  }

  private stemTerm(term: string): string {
    // Simple stemming rules - in production, use a proper stemming library
    if (term.endsWith('ing')) {
      return term.slice(0, -3)
    }
    if (term.endsWith('ed')) {
      return term.slice(0, -2)
    }
    if (term.endsWith('s') && term.length > 3) {
      return term.slice(0, -1)
    }
    return term
  }

  private calculateTermFrequencies(terms: string[]): Map<string, number> {
    const frequencies = new Map<string, number>()
    
    for (const term of terms) {
      frequencies.set(term, (frequencies.get(term) || 0) + 1)
    }
    
    return frequencies
  }

  private findTermPositions(terms: string[], targetTerm: string): number[] {
    const positions: number[] = []
    
    for (let i = 0; i < terms.length; i++) {
      if (terms[i] === targetTerm) {
        positions.push(i)
      }
    }
    
    return positions
  }

  private calculateFieldFrequencies(term: string, document: SearchDocument): Record<string, number> {
    const fieldFreqs: Record<string, number> = {}
    
    // Count occurrences in each field
    const fields = {
      title: document.title,
      content: document.content,
      tags: document.metadata.tags.join(' '),
      category: document.metadata.category
    }
    
    for (const [fieldName, fieldContent] of Object.entries(fields)) {
      const normalizedContent = this.normalizeText(fieldContent || '')
      const fieldTerms = this.extractTerms(normalizedContent)
      fieldFreqs[fieldName] = fieldTerms.filter(t => t === term).length
    }
    
    return fieldFreqs
  }

  private calculateAverageDocumentLength(): number {
    if (this.documentLengths.size === 0) return 0
    
    const totalLength = Array.from(this.documentLengths.values())
      .reduce((sum, length) => sum + length, 0)
    
    return totalLength / this.documentLengths.size
  }

  private expandQueryWithSynonyms(terms: string[]): string[] {
    const expandedTerms = [...terms]
    
    for (const term of terms) {
      const synonyms = this.synonymMap.get(term)
      if (synonyms) {
        expandedTerms.push(...synonyms)
      }
    }
    
    return Array.from(new Set(expandedTerms))
  }

  private getCandidateDocuments(terms: string[]): Set<string> {
    const candidates = new Set<string>()
    
    for (const term of terms) {
      const docMap = this.invertedIndex.get(term)
      if (docMap) {
        for (const docId of docMap.keys()) {
          candidates.add(docId)
        }
      }
    }
    
    return candidates
  }

  private filterByPermissions(
    documentIds: Set<string>, 
    permissions: { userId: string; roles: string[] }
  ): Set<string> {
    const filtered = new Set<string>()
    
    for (const docId of documentIds) {
      const document = this.documents.get(docId)
      if (document && this.hasReadPermission(document, permissions)) {
        filtered.add(docId)
      }
    }
    
    return filtered
  }

  private hasReadPermission(
    document: SearchDocument, 
    permissions: { userId: string; roles: string[] }
  ): boolean {
    // Check if user has explicit read permission
    if (document.permissions.read.includes(permissions.userId)) {
      return true
    }
    
    // Check if any user role has permission
    return permissions.roles.some(role => 
      document.permissions.read.includes(role)
    )
  }

  private applyFilters(
    documentIds: Set<string>, 
    filters?: SearchQuery['filters']
  ): Set<string> {
    if (!filters) return documentIds
    
    const filtered = new Set<string>()
    
    for (const docId of documentIds) {
      const document = this.documents.get(docId)
      if (!document) continue
      
      // Type filter
      if (filters.types && !filters.types.includes(document.type)) {
        continue
      }
      
      // Classification filter
      if (filters.classifications && !filters.classifications.includes(document.classification)) {
        continue
      }
      
      // Date range filter
      if (filters.dateFrom && document.metadata.createdAt < filters.dateFrom) {
        continue
      }
      
      if (filters.dateTo && document.metadata.createdAt > filters.dateTo) {
        continue
      }
      
      // User filter
      if (filters.userId && document.metadata.userId !== filters.userId) {
        continue
      }
      
      // Conversation filter
      if (filters.conversationId && document.metadata.conversationId !== filters.conversationId) {
        continue
      }
      
      // Tags filter
      if (filters.tags && !filters.tags.some(tag => document.metadata.tags.includes(tag))) {
        continue
      }
      
      // Categories filter
      if (filters.categories && !filters.categories.includes(document.metadata.category)) {
        continue
      }
      
      // Sources filter
      if (filters.sources && !filters.sources.includes(document.metadata.source)) {
        continue
      }
      
      filtered.add(docId)
    }
    
    return filtered
  }

  private async calculateBM25Scores(
    documentIds: Set<string>,
    queryTerms: string[],
    includeContent?: boolean,
    highlightMatches?: boolean
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = []
    
    for (const docId of documentIds) {
      const document = this.documents.get(docId)
      if (!document) continue
      
      let totalScore = 0
      const termMatches: any[] = []
      const highlights: string[] = []
      
      for (const term of queryTerms) {
        const termInfo = this.invertedIndex.get(term)?.get(docId)
        if (!termInfo) continue
        
        // Calculate BM25 score for this term
        const tf = termInfo.frequency
        const df = this.termDocumentFrequency.get(term) || 0
        const idf = Math.log((this.totalDocuments - df + 0.5) / (df + 0.5))
        const docLength = this.documentLengths.get(docId) || 0
        
        // BM25 formula
        const score = idf * (tf * (this.parameters.k1 + 1)) / 
          (tf + this.parameters.k1 * (1 - this.parameters.b + 
            this.parameters.b * (docLength / this.averageDocumentLength)))
        
        // Apply field boosts
        let fieldBoostedScore = score
        for (const [field, frequency] of Object.entries(termInfo.fieldFrequencies)) {
          const boost = this.parameters.fieldBoosts[field] || 1.0
          fieldBoostedScore += score * boost * frequency
        }
        
        // Special boost for government contracting terms
        if (this.contractingTerms.has(term)) {
          fieldBoostedScore *= 1.5
        }
        
        totalScore += fieldBoostedScore
        
        termMatches.push({
          term,
          frequency: tf,
          idf,
          boost: fieldBoostedScore / score
        })
        
        // Generate highlights
        if (highlightMatches) {
          highlights.push(...this.generateHighlights(document, term))
        }
      }
      
      // Create result document (optionally without content)
      const resultDocument = includeContent ? document : {
        ...document,
        content: '' // Remove content to reduce response size
      }
      
      results.push({
        document: resultDocument,
        score: totalScore,
        highlights: Array.from(new Set(highlights)),
        explanation: {
          termMatches,
          fieldBoosts: this.parameters.fieldBoosts,
          finalScore: totalScore
        }
      })
    }
    
    return results
  }

  private generateHighlights(document: SearchDocument, term: string): string[] {
    const highlights: string[] = []
    const contextLength = 50 // Characters around the match
    
    const searchText = document.content.toLowerCase()
    const termLower = term.toLowerCase()
    
    let index = searchText.indexOf(termLower)
    while (index !== -1) {
      const start = Math.max(0, index - contextLength)
      const end = Math.min(document.content.length, index + term.length + contextLength)
      
      let highlight = document.content.substring(start, end)
      if (start > 0) highlight = '...' + highlight
      if (end < document.content.length) highlight = highlight + '...'
      
      // Add highlighting markers
      const termStart = highlight.toLowerCase().indexOf(termLower)
      if (termStart !== -1) {
        highlight = highlight.substring(0, termStart) + 
                   '<mark>' + highlight.substring(termStart, termStart + term.length) + '</mark>' +
                   highlight.substring(termStart + term.length)
      }
      
      highlights.push(highlight)
      index = searchText.indexOf(termLower, index + 1)
    }
    
    return highlights.slice(0, 3) // Limit to 3 highlights per term
  }

  private async generateSuggestions(originalQuery: string, queryTerms: string[]): Promise<string[]> {
    const suggestions: string[] = []
    
    // Suggest common government contracting queries
    const commonQueries = [
      'sources sought opportunities',
      'small business set aside',
      'past performance requirements',
      'proposal submission guidelines',
      'federal acquisition regulations',
      'contractor capabilities',
      'compliance requirements'
    ]
    
    for (const commonQuery of commonQueries) {
      if (commonQuery.toLowerCase().includes(originalQuery.toLowerCase()) && 
          commonQuery.toLowerCase() !== originalQuery.toLowerCase()) {
        suggestions.push(commonQuery)
      }
    }
    
    return suggestions.slice(0, 5)
  }

  private calculateFacets(documentIds: Set<string>): SearchResponse['facets'] {
    const facets = {
      types: {} as Record<string, number>,
      classifications: {} as Record<string, number>,
      categories: {} as Record<string, number>,
      tags: {} as Record<string, number>
    }
    
    for (const docId of documentIds) {
      const document = this.documents.get(docId)
      if (!document) continue
      
      // Count by type
      facets.types[document.type] = (facets.types[document.type] || 0) + 1
      
      // Count by classification
      facets.classifications[document.classification] = 
        (facets.classifications[document.classification] || 0) + 1
      
      // Count by category
      facets.categories[document.metadata.category] = 
        (facets.categories[document.metadata.category] || 0) + 1
      
      // Count by tags
      for (const tag of document.metadata.tags) {
        facets.tags[tag] = (facets.tags[tag] || 0) + 1
      }
    }
    
    return facets
  }

  private calculateIndexSize(): number {
    // Estimate index size in bytes
    let size = 0
    
    // Documents storage
    for (const doc of this.documents.values()) {
      size += JSON.stringify(doc).length
    }
    
    // Inverted index storage
    for (const [term, docMap] of this.invertedIndex.entries()) {
      size += term.length
      for (const [docId, termInfo] of docMap.entries()) {
        size += docId.length + JSON.stringify(termInfo).length
      }
    }
    
    return size
  }
}

// Term frequency information stored in inverted index
interface TermFrequency {
  frequency: number
  positions: number[]
  fieldFrequencies: Record<string, number>
}

// Singleton instance for application use
export const searchEngine = new BM25SearchEngine()

// Helper functions for common search operations
export const searchUtils = {
  /**
   * Create a search document from a message
   */
  createMessageDocument(
    messageId: string,
    content: string,
    userId: string,
    conversationId: string,
    metadata: any = {}
  ): SearchDocument {
    return {
      id: messageId,
      title: `Message in conversation ${conversationId}`,
      content,
      type: 'message',
      classification: 'confidential',
      metadata: {
        userId,
        conversationId,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: metadata.tags || [],
        category: 'conversation',
        source: 'chat_interface',
        language: 'en',
        tokenCount: metadata.tokenCount || 0,
        wordCount: content.split(' ').length,
        ...metadata
      },
      permissions: {
        read: [userId, 'admin'],
        write: [userId, 'admin'],
        admin: ['admin']
      }
    }
  },

  /**
   * Create search query with common defaults
   */
  createQuery(
    query: string,
    userId: string,
    roles: string[] = ['user'],
    options: Partial<SearchQuery['options']> = {}
  ): SearchQuery {
    return {
      query,
      options: {
        limit: 20,
        includeContent: true,
        highlightMatches: true,
        synonyms: true,
        ...options
      },
      permissions: {
        userId,
        roles
      }
    }
  }
}