/**
 * User Role Management
 * 
 * Role-based access control (RBAC) system with permissions,
 * hierarchical roles, and dynamic access management
 */

import { logger } from '@/lib/monitoring/logger'
import { metricsCollector } from '@/lib/monitoring/metrics'
import { cache } from '@/lib/cache'

export interface Role {
  id: string
  name: string
  description: string
  permissions: Permission[]
  inherits: string[] // Role IDs this role inherits from
  hierarchy: number // Higher number = more privileged
  constraints: RoleConstraint[]
  metadata: {
    createdAt: number
    updatedAt: number
    createdBy: string
    isSystemRole: boolean
    isCustomRole: boolean
  }
}

export interface Permission {
  id: string
  resource: string // e.g., 'sources_sought', 'workflows', 'users'
  action: string // e.g., 'read', 'write', 'delete', 'approve'
  scope: 'own' | 'team' | 'organization' | 'global'
  conditions?: PermissionCondition[]
}

export interface PermissionCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than'
  value: any
}

export interface RoleConstraint {
  type: 'time' | 'ip' | 'device' | 'location' | 'mfa_required'
  rules: Record<string, any>
}

export interface UserRole {
  userId: string
  roleId: string
  assignedAt: number
  assignedBy: string
  expiresAt?: number
  context?: {
    organizationId?: string
    teamId?: string
    projectId?: string
  }
}

export interface AccessRequest {
  userId: string
  resource: string
  action: string
  context?: Record<string, any>
}

export interface AccessResult {
  granted: boolean
  reason: string
  requiredPermissions: string[]
  appliedConstraints: string[]
  expiresAt?: number
}

export interface RoleHierarchy {
  roleId: string
  parentRoles: string[]
  childRoles: string[]
  level: number
}

export class UserRoleManager {
  private roles: Map<string, Role> = new Map()
  private userRoles: Map<string, UserRole[]> = new Map()
  private permissionCache: Map<string, Permission[]> = new Map()
  private hierarchyCache: Map<string, RoleHierarchy> = new Map()

  constructor() {
    this.initializeSystemRoles()
  }

  /**
   * Initialize role management system
   */
  async initialize(): Promise<void> {
    try {
      await this.loadRolesFromStorage()
      await this.buildRoleHierarchy()
      
      logger.info('User role management system initialized successfully', {
        rolesCount: this.roles.size,
        systemRoles: Array.from(this.roles.values()).filter(r => r.metadata.isSystemRole).length
      })

    } catch (error) {
      logger.error('Failed to initialize user role management system', error instanceof Error ? error : undefined)
      throw error
    }
  }

  /**
   * Create a new role
   */
  async createRole(roleData: {
    name: string
    description: string
    permissions: Permission[]
    inherits?: string[]
    constraints?: RoleConstraint[]
    createdBy: string
  }): Promise<Role> {
    try {
      const roleId = this.generateRoleId(roleData.name)

      // Validate permissions
      for (const permission of roleData.permissions) {
        await this.validatePermission(permission)
      }

      // Calculate hierarchy level
      const hierarchy = await this.calculateHierarchyLevel(roleData.inherits || [])

      const role: Role = {
        id: roleId,
        name: roleData.name,
        description: roleData.description,
        permissions: roleData.permissions,
        inherits: roleData.inherits || [],
        hierarchy,
        constraints: roleData.constraints || [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: roleData.createdBy,
          isSystemRole: false,
          isCustomRole: true
        }
      }

      // Store role
      this.roles.set(roleId, role)

      // Update hierarchy cache
      await this.buildRoleHierarchy()

      // Record metrics
      await metricsCollector.recordMetric(
        'role_created',
        1,
        'count',
        {
          roleId,
          permissionCount: role.permissions.length.toString(),
          inheritsCount: role.inherits.length.toString()
        }
      )

      logger.info('Role created successfully', {
        roleId,
        name: role.name,
        permissions: role.permissions.length
      })

      return role

    } catch (error) {
      logger.error('Failed to create role', error instanceof Error ? error : undefined, {
        name: roleData.name
      })
      throw error
    }
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: string, roleId: string, assignedBy: string, options: {
    expiresAt?: number
    context?: Record<string, any>
  } = {}): Promise<boolean> {
    try {
      const role = this.roles.get(roleId)
      if (!role) {
        throw new Error('Role not found')
      }

      // Check if user already has this role
      const userRoles = this.userRoles.get(userId) || []
      const existingRole = userRoles.find(ur => ur.roleId === roleId)
      
      if (existingRole) {
        // Update existing assignment
        existingRole.assignedAt = Date.now()
        existingRole.assignedBy = assignedBy
        existingRole.expiresAt = options.expiresAt
        existingRole.context = options.context
      } else {
        // Create new role assignment
        const userRole: UserRole = {
          userId,
          roleId,
          assignedAt: Date.now(),
          assignedBy,
          expiresAt: options.expiresAt,
          context: options.context
        }
        
        userRoles.push(userRole)
        this.userRoles.set(userId, userRoles)
      }

      // Clear permission cache for user
      this.permissionCache.delete(userId)
      await cache.delete(`permissions:${userId}`)

      // Record metrics
      await metricsCollector.recordMetric(
        'role_assigned',
        1,
        'count',
        {
          userId,
          roleId,
          hasExpiration: (!!options.expiresAt).toString()
        }
      )

      logger.info('Role assigned to user', {
        userId,
        roleId,
        roleName: role.name,
        assignedBy
      })

      return true

    } catch (error) {
      logger.error('Failed to assign role', error instanceof Error ? error : undefined, {
        userId,
        roleId
      })
      throw error
    }
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, roleId: string): Promise<boolean> {
    try {
      const userRoles = this.userRoles.get(userId) || []
      const initialLength = userRoles.length
      
      const filteredRoles = userRoles.filter(ur => ur.roleId !== roleId)
      
      if (filteredRoles.length === initialLength) {
        return false // Role not found
      }

      this.userRoles.set(userId, filteredRoles)

      // Clear permission cache for user
      this.permissionCache.delete(userId)
      await cache.delete(`permissions:${userId}`)

      logger.info('Role removed from user', { userId, roleId })

      return true

    } catch (error) {
      logger.error('Failed to remove role', error instanceof Error ? error : undefined, {
        userId,
        roleId
      })
      return false
    }
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string): Promise<string[]> {
    try {
      const userRoles = this.userRoles.get(userId) || []
      const currentTime = Date.now()

      // Filter out expired roles
      const activeRoles = userRoles.filter(ur => 
        !ur.expiresAt || ur.expiresAt > currentTime
      )

      return activeRoles.map(ur => ur.roleId)

    } catch (error) {
      logger.error('Failed to get user roles', error instanceof Error ? error : undefined, { userId })
      return []
    }
  }

  /**
   * Get user permissions (including inherited)
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    try {
      // Try cache first
      const cached = this.permissionCache.get(userId)
      if (cached) {
        return cached
      }

      const userRoles = await this.getUserRoles(userId)
      const allPermissions: Permission[] = []
      const seenPermissions = new Set<string>()

      // Collect permissions from all roles (including inherited)
      for (const roleId of userRoles) {
        const rolePermissions = await this.getRolePermissions(roleId)
        
        for (const permission of rolePermissions) {
          const permissionKey = `${permission.resource}:${permission.action}:${permission.scope}`
          if (!seenPermissions.has(permissionKey)) {
            allPermissions.push(permission)
            seenPermissions.add(permissionKey)
          }
        }
      }

      // Cache permissions
      this.permissionCache.set(userId, allPermissions)
      await cache.set(`permissions:${userId}`, allPermissions, 30 * 60 * 1000) // 30 minutes

      return allPermissions

    } catch (error) {
      logger.error('Failed to get user permissions', error instanceof Error ? error : undefined, { userId })
      return []
    }
  }

  /**
   * Check if user has permission
   */
  async hasPermission(userId: string, resource: string, action: string, context?: Record<string, any>): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(userId)
      
      // Check for matching permission
      for (const permission of permissions) {
        if (this.matchesPermission(permission, resource, action, context)) {
          // Check role constraints
          const userRoles = await this.getUserRoles(userId)
          const hasValidConstraints = await this.checkRoleConstraints(userRoles, context)
          
          if (hasValidConstraints) {
            return true
          }
        }
      }

      return false

    } catch (error) {
      logger.error('Permission check failed', error instanceof Error ? error : undefined, {
        userId,
        resource,
        action
      })
      return false
    }
  }

  /**
   * Check access request with detailed response
   */
  async checkAccess(request: AccessRequest): Promise<AccessResult> {
    try {
      const { userId, resource, action, context } = request
      const permissions = await this.getUserPermissions(userId)
      const userRoles = await this.getUserRoles(userId)

      // Find matching permissions
      const matchingPermissions = permissions.filter(p => 
        this.matchesPermission(p, resource, action, context)
      )

      if (matchingPermissions.length === 0) {
        return {
          granted: false,
          reason: 'No matching permissions found',
          requiredPermissions: [`${resource}:${action}`],
          appliedConstraints: []
        }
      }

      // Check role constraints
      const constraintResult = await this.checkRoleConstraints(userRoles, context)
      if (!constraintResult) {
        return {
          granted: false,
          reason: 'Role constraints not satisfied',
          requiredPermissions: [`${resource}:${action}`],
          appliedConstraints: await this.getAppliedConstraints(userRoles)
        }
      }

      // Check permission conditions
      for (const permission of matchingPermissions) {
        if (permission.conditions) {
          const conditionsmet = this.checkPermissionConditions(permission.conditions, context)
          if (!conditionsmet) {
            return {
              granted: false,
              reason: 'Permission conditions not met',
              requiredPermissions: [`${resource}:${action}`],
              appliedConstraints: []
            }
          }
        }
      }

      return {
        granted: true,
        reason: 'Access granted',
        requiredPermissions: [],
        appliedConstraints: await this.getAppliedConstraints(userRoles)
      }

    } catch (error) {
      logger.error('Access check failed', error instanceof Error ? error : undefined, request)
      return {
        granted: false,
        reason: 'Access check failed',
        requiredPermissions: [`${request.resource}:${request.action}`],
        appliedConstraints: []
      }
    }
  }

  /**
   * Remove all roles from user
   */
  async removeAllRoles(userId: string): Promise<boolean> {
    try {
      this.userRoles.delete(userId)
      this.permissionCache.delete(userId)
      await cache.delete(`permissions:${userId}`)

      logger.info('All roles removed from user', { userId })

      return true

    } catch (error) {
      logger.error('Failed to remove all roles', error instanceof Error ? error : undefined, { userId })
      return false
    }
  }

  /**
   * Get role by ID
   */
  getRole(roleId: string): Role | null {
    return this.roles.get(roleId) || null
  }

  /**
   * Get all roles
   */
  getAllRoles(): Role[] {
    return Array.from(this.roles.values())
  }

  /**
   * Shutdown role management system
   */
  async shutdown(): Promise<void> {
    try {
      await this.saveRolesToStorage()
      
      this.roles.clear()
      this.userRoles.clear()
      this.permissionCache.clear()
      this.hierarchyCache.clear()

      logger.info('User role management system shutdown complete')

    } catch (error) {
      logger.error('Role management shutdown failed', error instanceof Error ? error : undefined)
    }
  }

  // Private helper methods

  private initializeSystemRoles(): void {
    const systemRoles: Role[] = [
      {
        id: 'super_admin',
        name: 'Super Administrator',
        description: 'Full system access with all permissions',
        permissions: [
          { id: 'all', resource: '*', action: '*', scope: 'global' }
        ],
        inherits: [],
        hierarchy: 1000,
        constraints: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: 'system',
          isSystemRole: true,
          isCustomRole: false
        }
      },
      {
        id: 'admin',
        name: 'Administrator',
        description: 'Administrative access to most system functions',
        permissions: [
          { id: 'admin_read', resource: '*', action: 'read', scope: 'organization' },
          { id: 'admin_write', resource: 'users', action: 'write', scope: 'organization' },
          { id: 'admin_delete', resource: 'users', action: 'delete', scope: 'organization' },
          { id: 'admin_workflow', resource: 'workflows', action: '*', scope: 'organization' }
        ],
        inherits: [],
        hierarchy: 800,
        constraints: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: 'system',
          isSystemRole: true,
          isCustomRole: false
        }
      },
      {
        id: 'manager',
        name: 'Manager',
        description: 'Team management and workflow oversight',
        permissions: [
          { id: 'mgr_read', resource: '*', action: 'read', scope: 'team' },
          { id: 'mgr_workflow', resource: 'workflows', action: '*', scope: 'team' },
          { id: 'mgr_sources', resource: 'sources_sought', action: '*', scope: 'team' },
          { id: 'mgr_approve', resource: 'documents', action: 'approve', scope: 'team' }
        ],
        inherits: [],
        hierarchy: 600,
        constraints: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: 'system',
          isSystemRole: true,
          isCustomRole: false
        }
      },
      {
        id: 'contractor',
        name: 'Contractor',
        description: 'Standard contractor access for opportunity management',
        permissions: [
          { id: 'contractor_sources', resource: 'sources_sought', action: '*', scope: 'own' },
          { id: 'contractor_workflow', resource: 'workflows', action: '*', scope: 'own' },
          { id: 'contractor_docs', resource: 'documents', action: '*', scope: 'own' },
          { id: 'contractor_profile', resource: 'profile', action: '*', scope: 'own' }
        ],
        inherits: [],
        hierarchy: 400,
        constraints: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: 'system',
          isSystemRole: true,
          isCustomRole: false
        }
      },
      {
        id: 'viewer',
        name: 'Viewer',
        description: 'Read-only access to assigned resources',
        permissions: [
          { id: 'viewer_read', resource: '*', action: 'read', scope: 'own' }
        ],
        inherits: [],
        hierarchy: 200,
        constraints: [],
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: 'system',
          isSystemRole: true,
          isCustomRole: false
        }
      }
    ]

    for (const role of systemRoles) {
      this.roles.set(role.id, role)
    }
  }

  private generateRoleId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_')
  }

  private async validatePermission(permission: Permission): Promise<void> {
    const validResources = ['*', 'sources_sought', 'workflows', 'documents', 'users', 'profile', 'analytics']
    const validActions = ['*', 'read', 'write', 'delete', 'approve', 'execute']
    const validScopes = ['own', 'team', 'organization', 'global']

    if (!validResources.includes(permission.resource) && permission.resource !== '*') {
      throw new Error(`Invalid permission resource: ${permission.resource}`)
    }

    if (!validActions.includes(permission.action)) {
      throw new Error(`Invalid permission action: ${permission.action}`)
    }

    if (!validScopes.includes(permission.scope)) {
      throw new Error(`Invalid permission scope: ${permission.scope}`)
    }
  }

  private async calculateHierarchyLevel(inherits: string[]): Promise<number> {
    if (inherits.length === 0) {
      return 100 // Base level for roles with no inheritance
    }

    let maxLevel = 0
    for (const parentRoleId of inherits) {
      const parentRole = this.roles.get(parentRoleId)
      if (parentRole) {
        maxLevel = Math.max(maxLevel, parentRole.hierarchy)
      }
    }

    return maxLevel + 100 // Add 100 to be higher than parent
  }

  private async getRolePermissions(roleId: string): Promise<Permission[]> {
    const role = this.roles.get(roleId)
    if (!role) {
      return []
    }

    const permissions: Permission[] = [...role.permissions]

    // Add inherited permissions
    for (const parentRoleId of role.inherits) {
      const parentPermissions = await this.getRolePermissions(parentRoleId)
      permissions.push(...parentPermissions)
    }

    return permissions
  }

  private matchesPermission(permission: Permission, resource: string, action: string, context?: Record<string, any>): boolean {
    // Check resource match
    if (permission.resource !== '*' && permission.resource !== resource) {
      return false
    }

    // Check action match
    if (permission.action !== '*' && permission.action !== action) {
      return false
    }

    // Check scope (would need context to fully validate)
    return true
  }

  private async checkRoleConstraints(roleIds: string[], context?: Record<string, any>): Promise<boolean> {
    for (const roleId of roleIds) {
      const role = this.roles.get(roleId)
      if (role) {
        for (const constraint of role.constraints) {
          if (!this.checkConstraint(constraint, context)) {
            return false
          }
        }
      }
    }
    return true
  }

  private checkConstraint(constraint: RoleConstraint, context?: Record<string, any>): boolean {
    // Simplified constraint checking - in production, implement full constraint logic
    switch (constraint.type) {
      case 'time':
        return this.checkTimeConstraint(constraint.rules, context)
      case 'ip':
        return this.checkIpConstraint(constraint.rules, context)
      case 'mfa_required':
        return this.checkMfaConstraint(constraint.rules, context)
      default:
        return true
    }
  }

  private checkTimeConstraint(rules: Record<string, any>, context?: Record<string, any>): boolean {
    // Check if current time is within allowed hours
    const now = new Date()
    const currentHour = now.getHours()
    
    if (rules.allowedHours) {
      const { start, end } = rules.allowedHours
      return currentHour >= start && currentHour <= end
    }
    
    return true
  }

  private checkIpConstraint(rules: Record<string, any>, context?: Record<string, any>): boolean {
    // Check if IP is in allowed range
    if (rules.allowedIps && context?.ipAddress) {
      return rules.allowedIps.includes(context.ipAddress)
    }
    
    return true
  }

  private checkMfaConstraint(rules: Record<string, any>, context?: Record<string, any>): boolean {
    // Check if MFA was used in current session
    return context?.mfaVerified === true
  }

  private checkPermissionConditions(conditions: PermissionCondition[], context?: Record<string, any>): boolean {
    if (!context) {
      return false
    }

    for (const condition of conditions) {
      const value = context[condition.field]
      
      switch (condition.operator) {
        case 'equals':
          if (value !== condition.value) return false
          break
        case 'not_equals':
          if (value === condition.value) return false
          break
        case 'in':
          if (!Array.isArray(condition.value) || !condition.value.includes(value)) return false
          break
        case 'not_in':
          if (Array.isArray(condition.value) && condition.value.includes(value)) return false
          break
        case 'greater_than':
          if (value <= condition.value) return false
          break
        case 'less_than':
          if (value >= condition.value) return false
          break
      }
    }

    return true
  }

  private async getAppliedConstraints(roleIds: string[]): Promise<string[]> {
    const constraints: string[] = []
    
    for (const roleId of roleIds) {
      const role = this.roles.get(roleId)
      if (role) {
        for (const constraint of role.constraints) {
          constraints.push(`${roleId}:${constraint.type}`)
        }
      }
    }
    
    return constraints
  }

  private async buildRoleHierarchy(): Promise<void> {
    // Build hierarchy cache for efficient role lookups
    for (const role of this.roles.values()) {
      const hierarchy: RoleHierarchy = {
        roleId: role.id,
        parentRoles: [...role.inherits],
        childRoles: [],
        level: role.hierarchy
      }

      this.hierarchyCache.set(role.id, hierarchy)
    }

    // Update child roles
    for (const role of this.roles.values()) {
      for (const parentId of role.inherits) {
        const parentHierarchy = this.hierarchyCache.get(parentId)
        if (parentHierarchy) {
          parentHierarchy.childRoles.push(role.id)
        }
      }
    }
  }

  private async loadRolesFromStorage(): Promise<void> {
    // In production, would load from database
    // For now, roles are already initialized
  }

  private async saveRolesToStorage(): Promise<void> {
    // In production, would save to database
    // For now, using in-memory storage
  }
}

export default UserRoleManager