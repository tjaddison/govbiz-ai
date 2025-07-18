/**
 * Document Versioning System
 * 
 * Comprehensive version control for documents with branching,
 * merging, conflict resolution, and audit trails
 */

import { 
  Document, 
  DocumentVersion, 
  DocumentChange,
  DocumentMetadata
} from './types'
import { DocumentStorage } from './storage'
import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'

export interface VersioningResult {
  version: DocumentVersion
  conflicts: VersionConflict[]
  merged: boolean
  changes: DocumentChange[]
}

export interface VersionConflict {
  id: string
  type: 'content' | 'metadata' | 'structural'
  section: string
  baseValue: string
  yourValue: string
  theirValue: string
  resolution?: 'yours' | 'theirs' | 'manual'
  resolvedValue?: string
}

export interface MergeOptions {
  strategy: 'auto' | 'manual' | 'yours' | 'theirs'
  conflictResolution: 'prompt' | 'auto_yours' | 'auto_theirs'
  preserveHistory: boolean
  createBranch: boolean
}

export interface BranchInfo {
  name: string
  parentVersion: string
  createdAt: number
  createdBy: string
  description: string
  isActive: boolean
  lastCommit?: string
}

export class DocumentVersioning {
  private branches: Map<string, Map<string, BranchInfo>> = new Map() // documentId -> branchName -> info
  
  constructor(private storage: DocumentStorage) {}

  /**
   * Create a new version of a document
   */
  async createVersion(
    documentId: string,
    content: string,
    changeLog: string,
    metadata?: Partial<DocumentMetadata>,
    branchName = 'main'
  ): Promise<VersioningResult> {
    const startTime = Date.now()
    
    try {
      // Get current document
      const document = await this.storage.retrieve(documentId, { includeContent: true })
      if (!document) {
        throw new Error('Document not found')
      }

      // Get latest version for the branch
      const latestVersion = this.getLatestVersionForBranch(document, branchName)
      if (!latestVersion) {
        throw new Error(`Branch '${branchName}' not found`)
      }

      // Calculate changes
      const changes = this.calculateChanges(latestVersion.content, content)
      
      // Generate new version number
      const newVersionNumber = this.generateVersionNumber(latestVersion.versionNumber)
      
      // Create new version
      const newVersion: DocumentVersion = {
        id: this.generateVersionId(),
        documentId,
        versionNumber: newVersionNumber,
        title: document.title,
        content,
        hash: this.calculateHash(content),
        changeLog,
        changes,
        createdAt: Date.now(),
        createdBy: metadata?.author || document.createdBy,
        status: 'draft',
        parentVersion: latestVersion.id,
        branchName,
      }

      // Update document with new version
      const updatedDocument = {
        ...document,
        content,
        metadata: { ...document.metadata, ...metadata },
        versions: [...document.versions, newVersion],
        updatedAt: Date.now(),
        updatedBy: newVersion.createdBy,
      }

      // Store updated document
      await this.storage.update(documentId, updatedDocument, changeLog)

      const processingTime = Date.now() - startTime

      // Record metrics
      await metricsCollector.recordMetric(
        'document_version_created',
        1,
        'count',
        { 
          documentId,
          branchName,
          changeCount: changes.length.toString()
        }
      )

      await metricsCollector.recordMetric(
        'document_versioning_time',
        processingTime,
        'milliseconds'
      )

      logger.info('Document version created successfully', {
        documentId,
        versionNumber: newVersionNumber,
        branchName,
        changeCount: changes.length,
        processingTime,
      }, 'versioning')

      return {
        version: newVersion,
        conflicts: [],
        merged: false,
        changes,
      }
    } catch (error) {
      logger.error('Failed to create document version', error instanceof Error ? error : undefined, {
        documentId,
        branchName,
      }, 'versioning')
      
      throw new Error(`Version creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Merge versions with conflict detection and resolution
   */
  async mergeVersions(
    documentId: string,
    sourceVersionId: string,
    targetVersionId: string,
    options: MergeOptions
  ): Promise<VersioningResult> {
    const startTime = Date.now()
    
    try {
      const document = await this.storage.retrieve(documentId, { includeContent: true, includeVersions: true })
      if (!document) {
        throw new Error('Document not found')
      }

      // Get source and target versions
      const sourceVersion = document.versions.find(v => v.id === sourceVersionId)
      const targetVersion = document.versions.find(v => v.id === targetVersionId)
      
      if (!sourceVersion || !targetVersion) {
        throw new Error('Source or target version not found')
      }

      // Find common ancestor
      const commonAncestor = this.findCommonAncestor(document.versions, sourceVersion, targetVersion)
      
      // Detect conflicts
      const conflicts = this.detectConflicts(
        commonAncestor?.content || '',
        sourceVersion.content,
        targetVersion.content
      )

      let mergedContent = targetVersion.content
      let resolvedConflicts: VersionConflict[] = []

      if (conflicts.length > 0) {
        const resolution = await this.resolveConflicts(conflicts, options)
        mergedContent = resolution.content
        resolvedConflicts = resolution.conflicts
      } else if (options.strategy === 'auto') {
        // Auto-merge without conflicts
        mergedContent = this.performAutoMerge(
          commonAncestor?.content || '',
          sourceVersion.content,
          targetVersion.content
        )
      }

      // Calculate changes for the merge
      const changes = this.calculateChanges(targetVersion.content, mergedContent)

      // Create merge version
      const mergeVersion: DocumentVersion = {
        id: this.generateVersionId(),
        documentId,
        versionNumber: this.generateMergeVersionNumber(targetVersion.versionNumber, sourceVersion.versionNumber),
        title: document.title,
        content: mergedContent,
        hash: this.calculateHash(mergedContent),
        changeLog: `Merged version ${sourceVersion.versionNumber} into ${targetVersion.versionNumber}`,
        changes,
        createdAt: Date.now(),
        createdBy: targetVersion.createdBy,
        status: conflicts.length > 0 ? 'review' : 'approved',
        parentVersion: targetVersion.id,
        branchName: targetVersion.branchName,
      }

      // Update document
      const updatedDocument = {
        ...document,
        content: mergedContent,
        versions: [...document.versions, mergeVersion],
        updatedAt: Date.now(),
        updatedBy: mergeVersion.createdBy,
      }

      await this.storage.update(documentId, updatedDocument, mergeVersion.changeLog)

      const processingTime = Date.now() - startTime

      // Record metrics
      await metricsCollector.recordMetric(
        'document_version_merged',
        1,
        'count',
        { 
          documentId,
          conflictCount: conflicts.length.toString(),
          autoResolved: resolvedConflicts.filter(c => c.resolution !== 'manual').length.toString()
        }
      )

      logger.info('Document versions merged successfully', {
        documentId,
        sourceVersion: sourceVersion.versionNumber,
        targetVersion: targetVersion.versionNumber,
        mergeVersion: mergeVersion.versionNumber,
        conflictCount: conflicts.length,
        processingTime,
      }, 'versioning')

      return {
        version: mergeVersion,
        conflicts: resolvedConflicts,
        merged: true,
        changes,
      }
    } catch (error) {
      logger.error('Failed to merge document versions', error instanceof Error ? error : undefined, {
        documentId,
        sourceVersionId,
        targetVersionId,
      }, 'versioning')
      
      throw new Error(`Version merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(
    documentId: string,
    branchName: string,
    parentVersionId: string,
    description: string,
    createdBy: string
  ): Promise<BranchInfo> {
    try {
      const document = await this.storage.retrieve(documentId, { includeVersions: true })
      if (!document) {
        throw new Error('Document not found')
      }

      const parentVersion = document.versions.find(v => v.id === parentVersionId)
      if (!parentVersion) {
        throw new Error('Parent version not found')
      }

      // Check if branch already exists
      const documentBranches = this.branches.get(documentId) || new Map()
      if (documentBranches.has(branchName)) {
        throw new Error(`Branch '${branchName}' already exists`)
      }

      const branchInfo: BranchInfo = {
        name: branchName,
        parentVersion: parentVersionId,
        createdAt: Date.now(),
        createdBy,
        description,
        isActive: true,
      }

      documentBranches.set(branchName, branchInfo)
      this.branches.set(documentId, documentBranches)

      logger.info('Document branch created successfully', {
        documentId,
        branchName,
        parentVersion: parentVersion.versionNumber,
      }, 'versioning')

      return branchInfo
    } catch (error) {
      logger.error('Failed to create document branch', error instanceof Error ? error : undefined, {
        documentId,
        branchName,
      }, 'versioning')
      
      throw error
    }
  }

  /**
   * Get version history for a document
   */
  async getVersionHistory(
    documentId: string,
    branchName?: string,
    limit = 50
  ): Promise<{
    versions: DocumentVersion[]
    branches: BranchInfo[]
    totalVersions: number
  }> {
    try {
      const document = await this.storage.retrieve(documentId, { includeVersions: true })
      if (!document) {
        throw new Error('Document not found')
      }

      let versions = document.versions
      
      // Filter by branch if specified
      if (branchName) {
        versions = versions.filter(v => v.branchName === branchName)
      }

      // Sort by creation time (newest first)
      versions.sort((a, b) => b.createdAt - a.createdAt)
      
      // Apply limit
      const limitedVersions = versions.slice(0, limit)

      // Get branch information
      const documentBranches = this.branches.get(documentId) || new Map()
      const branches = Array.from(documentBranches.values())

      return {
        versions: limitedVersions,
        branches,
        totalVersions: versions.length,
      }
    } catch (error) {
      logger.error('Failed to get version history', error instanceof Error ? error : undefined, {
        documentId,
        branchName,
      }, 'versioning')
      
      return {
        versions: [],
        branches: [],
        totalVersions: 0,
      }
    }
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    documentId: string,
    version1Id: string,
    version2Id: string
  ): Promise<{
    changes: DocumentChange[]
    additions: number
    deletions: number
    modifications: number
  }> {
    try {
      const document = await this.storage.retrieve(documentId, { includeVersions: true })
      if (!document) {
        throw new Error('Document not found')
      }

      const version1 = document.versions.find(v => v.id === version1Id)
      const version2 = document.versions.find(v => v.id === version2Id)
      
      if (!version1 || !version2) {
        throw new Error('One or both versions not found')
      }

      const changes = this.calculateChanges(version1.content, version2.content)
      
      const stats = changes.reduce(
        (acc, change) => {
          switch (change.type) {
            case 'add':
              acc.additions++
              break
            case 'delete':
              acc.deletions++
              break
            case 'modify':
              acc.modifications++
              break
          }
          return acc
        },
        { additions: 0, deletions: 0, modifications: 0 }
      )

      return {
        changes,
        ...stats,
      }
    } catch (error) {
      logger.error('Failed to compare versions', error instanceof Error ? error : undefined, {
        documentId,
        version1Id,
        version2Id,
      }, 'versioning')
      
      return {
        changes: [],
        additions: 0,
        deletions: 0,
        modifications: 0,
      }
    }
  }

  /**
   * Restore document to a specific version
   */
  async restoreToVersion(
    documentId: string,
    versionId: string,
    createBackup = true
  ): Promise<VersioningResult> {
    try {
      const document = await this.storage.retrieve(documentId, { includeContent: true, includeVersions: true })
      if (!document) {
        throw new Error('Document not found')
      }

      const targetVersion = document.versions.find(v => v.id === versionId)
      if (!targetVersion) {
        throw new Error('Target version not found')
      }

      // Create backup version if requested
      if (createBackup) {
        await this.createVersion(
          documentId,
          document.content,
          'Backup before restore',
          undefined,
          'backup'
        )
      }

      // Create restore version
      const restoreResult = await this.createVersion(
        documentId,
        targetVersion.content,
        `Restored to version ${targetVersion.versionNumber}`,
        undefined,
        targetVersion.branchName
      )

      logger.info('Document restored to version successfully', {
        documentId,
        restoredToVersion: targetVersion.versionNumber,
        newVersion: restoreResult.version.versionNumber,
      }, 'versioning')

      return restoreResult
    } catch (error) {
      logger.error('Failed to restore document version', error instanceof Error ? error : undefined, {
        documentId,
        versionId,
      }, 'versioning')
      
      throw error
    }
  }

  // Private methods

  private getLatestVersionForBranch(document: Document, branchName: string): DocumentVersion | null {
    const branchVersions = document.versions.filter(v => v.branchName === branchName)
    if (branchVersions.length === 0) return null
    
    return branchVersions.sort((a, b) => b.createdAt - a.createdAt)[0]
  }

  private generateVersionNumber(currentVersion: string): string {
    const [major, minor, patch] = currentVersion.split('.').map(Number)
    return `${major}.${minor}.${patch + 1}`
  }

  private generateMergeVersionNumber(targetVersion: string, sourceVersion: string): string {
    const [targetMajor, targetMinor] = targetVersion.split('.').map(Number)
    return `${targetMajor}.${targetMinor + 1}.0`
  }

  private generateVersionId(): string {
    return `ver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private calculateHash(content: string): string {
    // Simple hash - in production would use crypto
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(36)
  }

  private calculateChanges(oldContent: string, newContent: string): DocumentChange[] {
    const changes: DocumentChange[] = []
    
    // Simple line-by-line diff
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')
    
    const maxLines = Math.max(oldLines.length, newLines.length)
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i]
      const newLine = newLines[i]
      
      if (oldLine === undefined && newLine !== undefined) {
        // Line added
        changes.push({
          type: 'add',
          section: 'content',
          newValue: newLine,
          line: i + 1,
          description: `Added line ${i + 1}`,
        })
      } else if (oldLine !== undefined && newLine === undefined) {
        // Line deleted
        changes.push({
          type: 'delete',
          section: 'content',
          oldValue: oldLine,
          line: i + 1,
          description: `Deleted line ${i + 1}`,
        })
      } else if (oldLine !== newLine) {
        // Line modified
        changes.push({
          type: 'modify',
          section: 'content',
          oldValue: oldLine,
          newValue: newLine,
          line: i + 1,
          description: `Modified line ${i + 1}`,
        })
      }
    }
    
    return changes
  }

  private findCommonAncestor(
    versions: DocumentVersion[],
    version1: DocumentVersion,
    version2: DocumentVersion
  ): DocumentVersion | null {
    // Build version tree
    const versionMap = new Map(versions.map(v => [v.id, v]))
    
    // Get ancestors of version1
    const ancestors1 = new Set<string>()
    let current: DocumentVersion | undefined = version1
    
    while (current) {
      ancestors1.add(current.id)
      current = current.parentVersion ? versionMap.get(current.parentVersion) : undefined
    }
    
    // Find first common ancestor in version2's lineage
    current = version2
    while (current) {
      if (ancestors1.has(current.id)) {
        return current
      }
      current = current.parentVersion ? versionMap.get(current.parentVersion) : undefined
    }
    
    return null
  }

  private detectConflicts(
    baseContent: string,
    sourceContent: string,
    targetContent: string
  ): VersionConflict[] {
    const conflicts: VersionConflict[] = []
    
    const baseLines = baseContent.split('\n')
    const sourceLines = sourceContent.split('\n')
    const targetLines = targetContent.split('\n')
    
    const maxLines = Math.max(baseLines.length, sourceLines.length, targetLines.length)
    
    for (let i = 0; i < maxLines; i++) {
      const baseLine = baseLines[i] || ''
      const sourceLine = sourceLines[i] || ''
      const targetLine = targetLines[i] || ''
      
      // Check if both source and target modified the same line differently
      if (baseLine !== sourceLine && baseLine !== targetLine && sourceLine !== targetLine) {
        conflicts.push({
          id: `conflict_${i}`,
          type: 'content',
          section: `line_${i + 1}`,
          baseValue: baseLine,
          yourValue: targetLine,
          theirValue: sourceLine,
        })
      }
    }
    
    return conflicts
  }

  private async resolveConflicts(
    conflicts: VersionConflict[],
    options: MergeOptions
  ): Promise<{ content: string; conflicts: VersionConflict[] }> {
    const resolvedConflicts: VersionConflict[] = []
    
    for (const conflict of conflicts) {
      let resolution: 'yours' | 'theirs' | 'manual' = 'manual'
      let resolvedValue = conflict.yourValue
      
      switch (options.conflictResolution) {
        case 'auto_yours':
          resolution = 'yours'
          resolvedValue = conflict.yourValue
          break
        case 'auto_theirs':
          resolution = 'theirs'
          resolvedValue = conflict.theirValue
          break
        case 'prompt':
          // In a real implementation, this would prompt the user
          resolution = 'yours'
          resolvedValue = conflict.yourValue
          break
      }
      
      resolvedConflicts.push({
        ...conflict,
        resolution,
        resolvedValue,
      })
    }
    
    // Rebuild content with resolved conflicts
    const content = this.buildResolvedContent(resolvedConflicts)
    
    return { content, conflicts: resolvedConflicts }
  }

  private performAutoMerge(
    baseContent: string,
    sourceContent: string,
    targetContent: string
  ): string {
    // Simple auto-merge - take all non-conflicting changes
    const baseLines = baseContent.split('\n')
    const sourceLines = sourceContent.split('\n')
    const targetLines = targetContent.split('\n')
    
    const mergedLines: string[] = []
    const maxLines = Math.max(baseLines.length, sourceLines.length, targetLines.length)
    
    for (let i = 0; i < maxLines; i++) {
      const baseLine = baseLines[i] || ''
      const sourceLine = sourceLines[i] || ''
      const targetLine = targetLines[i] || ''
      
      if (baseLine === sourceLine) {
        // No change in source, use target
        mergedLines.push(targetLine)
      } else if (baseLine === targetLine) {
        // No change in target, use source
        mergedLines.push(sourceLine)
      } else if (sourceLine === targetLine) {
        // Same change in both, use either
        mergedLines.push(sourceLine)
      } else {
        // Conflict - default to target
        mergedLines.push(targetLine)
      }
    }
    
    return mergedLines.join('\n')
  }

  private buildResolvedContent(resolvedConflicts: VersionConflict[]): string {
    // Build content from resolved conflicts
    const lines: string[] = []
    
    for (const conflict of resolvedConflicts) {
      if (conflict.resolvedValue !== undefined) {
        lines.push(conflict.resolvedValue)
      }
    }
    
    return lines.join('\n')
  }
}

export default DocumentVersioning