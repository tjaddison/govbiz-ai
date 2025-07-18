/**
 * Document Storage
 * 
 * Comprehensive document storage with S3 integration, metadata management,
 * security features, and optimized retrieval capabilities
 */

import { 
  Document, 
  DocumentMetadata, 
  StorageConfig,
  ProcessingJob,
  SecurityEvent
} from './types'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { AWS_RESOURCES } from '@/lib/aws-config'
import { s3Client, docClient } from '@/lib/aws-config'
import { 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand
} from '@aws-sdk/client-s3'
import { 
  PutCommand, 
  GetCommand, 
  UpdateCommand, 
  DeleteCommand,
  QueryCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'

export interface StorageResult {
  documentId: string
  version: string
  s3Key: string
  size: number
  hash: string
  uploadTime: number
}

export interface RetrievalOptions {
  includeContent?: boolean
  includeMetadata?: boolean
  includeVersions?: boolean
  includeAnalytics?: boolean
  version?: string
}

export interface StorageStats {
  totalDocuments: number
  totalSize: number
  documentsToday: number
  storageByCategory: Record<string, number>
  avgDocumentSize: number
}

export class DocumentStorage {
  private readonly bucketName: string
  private isInitialized = false

  constructor(private config?: StorageConfig) {
    this.bucketName = config?.bucket || AWS_RESOURCES.BUCKETS.DOCUMENTS
  }

  /**
   * Initialize the storage system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Verify S3 bucket access
      await this.verifyBucketAccess()
      
      // Initialize DynamoDB tables if needed
      await this.verifyDatabaseAccess()
      
      this.isInitialized = true
      logger.info('Document storage initialized successfully', {
        bucket: this.bucketName,
      })
    } catch (error) {
      logger.error('Failed to initialize document storage', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Store a document
   */
  async store(document: Omit<Document, 'id' | 'createdAt' | 'updatedAt' | 'versions'>): Promise<StorageResult> {
    const startTime = Date.now()
    
    try {
      if (!this.isInitialized) {
        await this.initialize()
      }

      const documentId = this.generateDocumentId()
      const version = '1.0.0'
      const timestamp = Date.now()
      
      // Calculate content hash
      const contentHash = this.calculateHash(document.content)
      
      // Prepare S3 key
      const s3Key = this.generateS3Key(documentId, version, document.fileName)
      
      // Encrypt content if required
      let content = document.content
      if (this.config?.encryption || document.security.encryption.encrypted) {
        content = await this.encryptContent(content)
      }

      // Upload to S3
      const uploadResult = await this.uploadToS3(s3Key, content, {
        documentId,
        version,
        contentType: document.contentType,
        fileName: document.fileName,
        originalHash: contentHash,
      })

      // Prepare full document object
      const fullDocument: Document = {
        ...document,
        id: documentId,
        hash: contentHash,
        createdAt: timestamp,
        updatedAt: timestamp,
        versions: [{
          id: this.generateVersionId(),
          documentId,
          versionNumber: version,
          title: document.title,
          content: document.content,
          hash: contentHash,
          changeLog: 'Initial version',
          changes: [],
          createdAt: timestamp,
          createdBy: document.createdBy,
          status: 'approved',
        }],
      }

      // Store metadata in DynamoDB
      await this.storeMetadata(fullDocument, s3Key)

      // Record analytics
      await this.recordStorageAnalytics(fullDocument, uploadResult.size)

      const processingTime = Date.now() - startTime

      logger.info('Document stored successfully', {
        documentId,
        s3Key,
        size: uploadResult.size,
        processingTime,
      }, 'storage')

      return {
        documentId,
        version,
        s3Key,
        size: uploadResult.size,
        hash: contentHash,
        uploadTime: processingTime,
      }
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Failed to store document', error instanceof Error ? error : undefined, {
        processingTime,
      }, 'storage')

      throw new Error(`Document storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Retrieve a document
   */
  async retrieve(documentId: string, options: RetrievalOptions = {}): Promise<Document | null> {
    const startTime = Date.now()
    
    try {
      if (!this.isInitialized) {
        await this.initialize()
      }

      // Get document metadata from DynamoDB
      const metadata = await this.getMetadata(documentId)
      if (!metadata) {
        return null
      }

      const document = metadata

      // Get content from S3 if requested
      if (options.includeContent !== false) {
        const version = options.version || this.getLatestVersion(metadata)
        const s3Key = this.getS3Key(documentId, version, metadata.fileName)
        const content = await this.getFromS3(s3Key)
        
        // Decrypt content if necessary
        if (metadata.security.encryption.encrypted) {
          document.content = await this.decryptContent(content)
        } else {
          document.content = content
        }
      }

      // Update analytics
      await this.recordAccess(documentId, 'view')

      const processingTime = Date.now() - startTime

      await metricsCollector.recordMetric(
        'document_retrieval_time',
        processingTime,
        'milliseconds',
        { category: document.classification.category }
      )

      return document
    } catch (error) {
      logger.error('Failed to retrieve document', error instanceof Error ? error : undefined, {
        documentId,
      }, 'storage')

      return null
    }
  }

  /**
   * Update document content and create new version
   */
  async update(
    documentId: string, 
    updates: Partial<Document>, 
    changeLog: string
  ): Promise<StorageResult | null> {
    const startTime = Date.now()
    
    try {
      // Get existing document
      const existingDoc = await this.retrieve(documentId, { includeContent: true })
      if (!existingDoc) {
        throw new Error('Document not found')
      }

      // Generate new version
      const newVersion = this.incrementVersion(this.getLatestVersion(existingDoc))
      const timestamp = Date.now()
      
      // Merge updates
      const updatedDocument: Document = {
        ...existingDoc,
        ...updates,
        id: documentId,
        updatedAt: timestamp,
        updatedBy: updates.updatedBy || existingDoc.updatedBy,
      }

      // If content changed, store new version
      if (updates.content && updates.content !== existingDoc.content) {
        const contentHash = this.calculateHash(updates.content)
        const s3Key = this.generateS3Key(documentId, newVersion, updatedDocument.fileName)
        
        // Upload new content
        const uploadResult = await this.uploadToS3(s3Key, updates.content, {
          documentId,
          version: newVersion,
          contentType: updatedDocument.contentType,
          fileName: updatedDocument.fileName,
          originalHash: contentHash,
        })

        // Add new version to document
        const newVersionRecord = {
          id: this.generateVersionId(),
          documentId,
          versionNumber: newVersion,
          title: updatedDocument.title,
          content: updates.content,
          hash: contentHash,
          changeLog,
          changes: this.calculateChanges(existingDoc.content, updates.content),
          createdAt: timestamp,
          createdBy: updates.updatedBy || existingDoc.updatedBy,
          status: 'approved' as const,
          parentVersion: this.getLatestVersion(existingDoc),
        }

        updatedDocument.versions.push(newVersionRecord)
        updatedDocument.hash = contentHash
      }

      // Update metadata in DynamoDB
      await this.updateMetadata(updatedDocument)

      const processingTime = Date.now() - startTime

      logger.info('Document updated successfully', {
        documentId,
        newVersion,
        processingTime,
      }, 'storage')

      return {
        documentId,
        version: newVersion,
        s3Key: this.generateS3Key(documentId, newVersion, updatedDocument.fileName),
        size: Buffer.byteLength(updates.content || existingDoc.content, 'utf8'),
        hash: updatedDocument.hash,
        uploadTime: processingTime,
      }
    } catch (error) {
      logger.error('Failed to update document', error instanceof Error ? error : undefined, {
        documentId,
      }, 'storage')

      return null
    }
  }

  /**
   * Delete a document
   */
  async delete(documentId: string, softDelete = true): Promise<boolean> {
    try {
      if (softDelete) {
        // Soft delete - mark as deleted but keep data
        await this.updateMetadata({
          id: documentId,
          metadata: {
            deleted: true,
            deletedAt: Date.now(),
          },
        } as any)
      } else {
        // Hard delete - remove from S3 and DynamoDB
        const document = await this.getMetadata(documentId)
        if (document) {
          // Delete all versions from S3
          for (const version of document.versions) {
            const s3Key = this.generateS3Key(documentId, version.versionNumber, document.fileName)
            await this.deleteFromS3(s3Key)
          }
          
          // Delete metadata from DynamoDB
          await this.deleteMetadata(documentId)
        }
      }

      await this.recordAccess(documentId, 'delete')

      logger.info('Document deleted successfully', {
        documentId,
        softDelete,
      }, 'storage')

      return true
    } catch (error) {
      logger.error('Failed to delete document', error instanceof Error ? error : undefined, {
        documentId,
        softDelete,
      }, 'storage')

      return false
    }
  }

  /**
   * List documents with filtering and pagination
   */
  async list(filter: {
    category?: string
    userId?: string
    tags?: string[]
    dateRange?: { start: number; end: number }
    limit?: number
    offset?: number
  } = {}): Promise<{
    documents: Document[]
    totalCount: number
    hasMore: boolean
  }> {
    try {
      const params: any = {
        TableName: AWS_RESOURCES.TABLES.DOCUMENTS,
        IndexName: 'CategoryIndex',
        Limit: filter.limit || 50,
      }

      if (filter.category) {
        params.KeyConditionExpression = 'category = :category'
        params.ExpressionAttributeValues = {
          ':category': filter.category,
        }
      }

      // Add additional filters
      const filterExpressions: string[] = []
      if (filter.userId) {
        filterExpressions.push('createdBy = :userId')
        params.ExpressionAttributeValues = {
          ...params.ExpressionAttributeValues,
          ':userId': filter.userId,
        }
      }

      if (filterExpressions.length > 0) {
        params.FilterExpression = filterExpressions.join(' AND ')
      }

      const result = filter.category 
        ? await docClient.send(new QueryCommand(params))
        : await docClient.send(new ScanCommand(params))

      const documents = (result.Items || []).map(this.parseDocumentFromDynamoDB)

      return {
        documents,
        totalCount: result.Count || 0,
        hasMore: !!result.LastEvaluatedKey,
      }
    } catch (error) {
      logger.error('Failed to list documents', error instanceof Error ? error : undefined)
      return {
        documents: [],
        totalCount: 0,
        hasMore: false,
      }
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    try {
      // In production, would use proper aggregation queries
      const result = await docClient.send(new ScanCommand({
        TableName: AWS_RESOURCES.TABLES.DOCUMENTS,
        ProjectionExpression: 'id, category, fileSize, createdAt',
      }))

      const documents = result.Items || []
      const now = Date.now()
      const oneDayAgo = now - 24 * 60 * 60 * 1000

      const stats: StorageStats = {
        totalDocuments: documents.length,
        totalSize: documents.reduce((sum, doc) => sum + (doc.fileSize || 0), 0),
        documentsToday: documents.filter(doc => doc.createdAt > oneDayAgo).length,
        storageByCategory: {},
        avgDocumentSize: 0,
      }

      // Calculate category breakdown
      documents.forEach(doc => {
        const category = doc.category || 'other'
        stats.storageByCategory[category] = (stats.storageByCategory[category] || 0) + (doc.fileSize || 0)
      })

      // Calculate average
      stats.avgDocumentSize = stats.totalDocuments > 0 
        ? stats.totalSize / stats.totalDocuments 
        : 0

      return stats
    } catch (error) {
      logger.error('Failed to get storage stats', error instanceof Error ? error : undefined)
      return {
        totalDocuments: 0,
        totalSize: 0,
        documentsToday: 0,
        storageByCategory: {},
        avgDocumentSize: 0,
      }
    }
  }

  /**
   * Generate presigned URL for direct upload
   */
  async generateUploadUrl(
    documentId: string, 
    fileName: string, 
    expiresIn = 3600
  ): Promise<string> {
    try {
      const s3Key = this.generateS3Key(documentId, '1.0.0', fileName)
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ContentType: this.getContentType(fileName),
      })

      return await getSignedUrl(s3Client, command, { expiresIn })
    } catch (error) {
      logger.error('Failed to generate upload URL', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Generate presigned URL for download
   */
  async generateDownloadUrl(
    documentId: string, 
    version?: string, 
    expiresIn = 3600
  ): Promise<string | null> {
    try {
      const document = await this.getMetadata(documentId)
      if (!document) return null

      const targetVersion = version || this.getLatestVersion(document)
      const s3Key = this.generateS3Key(documentId, targetVersion, document.fileName)
      
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      })

      const url = await getSignedUrl(s3Client, command, { expiresIn })
      
      // Record download analytics
      await this.recordAccess(documentId, 'download')
      
      return url
    } catch (error) {
      logger.error('Failed to generate download URL', error instanceof Error ? error : undefined)
      return null
    }
  }

  /**
   * Shutdown storage system
   */
  async shutdown(): Promise<void> {
    // Cleanup any resources if needed
    logger.info('Document storage shutdown complete')
  }

  // Private methods

  private async verifyBucketAccess(): Promise<void> {
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: '.health-check',
      }))
    } catch (error) {
      // If object doesn't exist, that's okay - bucket is accessible
      if (error instanceof Error && error.name === 'NotFound') {
        return
      }
      throw error
    }
  }

  private async verifyDatabaseAccess(): Promise<void> {
    // Test DynamoDB access
    await docClient.send(new ScanCommand({
      TableName: AWS_RESOURCES.TABLES.DOCUMENTS,
      Limit: 1,
    }))
  }

  private generateDocumentId(): string {
    return `doc_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
  }

  private generateVersionId(): string {
    return `ver_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
  }

  private generateS3Key(documentId: string, version: string, fileName?: string): string {
    const extension = fileName ? `.${fileName.split('.').pop()}` : ''
    return `documents/${documentId}/v${version}/content${extension}`
  }

  private getS3Key(documentId: string, version: string, fileName?: string): string {
    return this.generateS3Key(documentId, version, fileName)
  }

  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
  }

  private async uploadToS3(
    key: string, 
    content: string, 
    metadata: Record<string, any>
  ): Promise<{ size: number }> {
    const buffer = Buffer.from(content, 'utf8')
    
    await s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: 'application/octet-stream',
      Metadata: {
        ...metadata,
        uploadedAt: Date.now().toString(),
      },
      ServerSideEncryption: this.config?.encryption ? 'AES256' : undefined,
    }))

    return { size: buffer.length }
  }

  private async getFromS3(key: string): Promise<string> {
    const result = await s3Client.send(new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    }))

    if (!result.Body) {
      throw new Error('No content found')
    }

    // Convert stream to string
    const chunks: Buffer[] = []
    const stream = result.Body as any
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      stream.on('error', reject)
    })
  }

  private async deleteFromS3(key: string): Promise<void> {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    }))
  }

  private async storeMetadata(document: Document, s3Key: string): Promise<void> {
    await docClient.send(new PutCommand({
      TableName: AWS_RESOURCES.TABLES.DOCUMENTS,
      Item: {
        id: document.id,
        title: document.title,
        contentType: document.contentType,
        fileName: document.fileName,
        fileSize: document.fileSize,
        hash: document.hash,
        metadata: document.metadata,
        classification: document.classification,
        security: document.security,
        analytics: document.analytics,
        versions: document.versions,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        createdBy: document.createdBy,
        updatedBy: document.updatedBy,
        s3Key,
        category: document.classification.category,
        ttl: Math.floor((Date.now() + 365 * 24 * 60 * 60 * 1000) / 1000), // 1 year TTL
      },
    }))
  }

  private async getMetadata(documentId: string): Promise<Document | null> {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: AWS_RESOURCES.TABLES.DOCUMENTS,
        Key: { id: documentId },
      }))

      if (!result.Item) return null
      
      return this.parseDocumentFromDynamoDB(result.Item)
    } catch (error) {
      logger.error('Failed to get document metadata', error instanceof Error ? error : undefined)
      return null
    }
  }

  private async updateMetadata(document: Partial<Document>): Promise<void> {
    const updateExpression: string[] = []
    const expressionAttributeValues: any = {}
    
    Object.entries(document).forEach(([key, value]) => {
      if (key !== 'id' && value !== undefined) {
        updateExpression.push(`${key} = :${key}`)
        expressionAttributeValues[`:${key}`] = value
      }
    })

    if (updateExpression.length === 0) return

    await docClient.send(new UpdateCommand({
      TableName: AWS_RESOURCES.TABLES.DOCUMENTS,
      Key: { id: document.id },
      UpdateExpression: `SET ${updateExpression.join(', ')}`,
      ExpressionAttributeValues: expressionAttributeValues,
    }))
  }

  private async deleteMetadata(documentId: string): Promise<void> {
    await docClient.send(new DeleteCommand({
      TableName: AWS_RESOURCES.TABLES.DOCUMENTS,
      Key: { id: documentId },
    }))
  }

  private parseDocumentFromDynamoDB(item: any): Document {
    return {
      id: item.id,
      title: item.title,
      content: '', // Content loaded separately
      contentType: item.contentType,
      fileName: item.fileName,
      fileSize: item.fileSize,
      filePath: item.s3Key,
      hash: item.hash,
      metadata: item.metadata || {},
      classification: item.classification || {},
      versions: item.versions || [],
      security: item.security || {},
      analytics: item.analytics || {},
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      createdBy: item.createdBy,
      updatedBy: item.updatedBy,
    }
  }

  private getLatestVersion(document: Document): string {
    if (document.versions.length === 0) return '1.0.0'
    
    return document.versions
      .sort((a, b) => b.createdAt - a.createdAt)[0]
      .versionNumber
  }

  private incrementVersion(currentVersion: string): string {
    const [major, minor, patch] = currentVersion.split('.').map(Number)
    return `${major}.${minor}.${patch + 1}`
  }

  private calculateChanges(oldContent: string, newContent: string): any[] {
    // Simple diff calculation - in production would use proper diff algorithm
    return [
      {
        type: 'modify',
        section: 'content',
        oldValue: oldContent.substring(0, 100),
        newValue: newContent.substring(0, 100),
        description: 'Content updated',
      },
    ]
  }

  private async recordStorageAnalytics(document: Document, size: number): Promise<void> {
    await metricsCollector.recordMetric(
      'document_stored',
      1,
      'count',
      { 
        category: document.classification.category,
        contentType: document.contentType,
      }
    )

    await metricsCollector.recordMetric(
      'document_size',
      size,
      'bytes',
      { category: document.classification.category }
    )
  }

  private async recordAccess(documentId: string, type: string): Promise<void> {
    await metricsCollector.recordMetric(
      'document_access',
      1,
      'count',
      { documentId, type }
    )
  }

  private async encryptContent(content: string): Promise<string> {
    // Simple encryption - in production would use AWS KMS
    const cipher = crypto.createCipher('aes-256-cbc', 'encryption-key')
    let encrypted = cipher.update(content, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return encrypted
  }

  private async decryptContent(encryptedContent: string): Promise<string> {
    // Simple decryption - in production would use AWS KMS
    const decipher = crypto.createDecipher('aes-256-cbc', 'encryption-key')
    let decrypted = decipher.update(encryptedContent, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  private getContentType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase()
    
    switch (extension) {
      case 'pdf':
        return 'application/pdf'
      case 'doc':
      case 'docx':
        return 'application/msword'
      case 'txt':
        return 'text/plain'
      case 'html':
        return 'text/html'
      case 'json':
        return 'application/json'
      default:
        return 'application/octet-stream'
    }
  }
}

export default DocumentStorage