'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Archive, Trash2, Download, Eye, Filter, Zap } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { Warning, ContextState } from '@/types'
import { formatNumber } from '@/lib/utils'

interface ContextWarningProps {
  warnings: Warning[]
  contextState: ContextState
  onAction: (action: string, warning?: Warning) => void
}

export const ContextWarning: React.FC<ContextWarningProps> = ({
  warnings,
  contextState,
  onAction
}) => {
  const [expandedWarning, setExpandedWarning] = useState<string | null>(null)
  
  if (warnings.length === 0) return null
  
  // Get the highest priority warning
  const highestWarning = warnings.reduce((highest, current) => {
    const levelPriority = { info: 1, notice: 2, warning: 3, critical: 4 }
    const currentPriority = levelPriority[current.level] || 0
    const highestPriority = levelPriority[highest.level] || 0
    return currentPriority > highestPriority ? current : highest
  })
  
  const utilization = (contextState.tokenCount || 0) / (contextState.maxTokens || 200000)
  const utilizationPercentage = utilization * 100
  
  const getWarningColor = (level: Warning['level']) => {
    switch (level) {
      case 'info': return 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200'
      case 'notice': return 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200'
      case 'warning': return 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200'
      case 'critical': return 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      default: return 'bg-gray-50 border-gray-200 text-gray-800 dark:bg-gray-900/20 dark:border-gray-800 dark:text-gray-200'
    }
  }
  
  const getWarningIcon = (level: Warning['level']) => {
    switch (level) {
      case 'info': return <Eye className="h-4 w-4" />
      case 'notice': return <AlertTriangle className="h-4 w-4" />
      case 'warning': return <AlertTriangle className="h-4 w-4" />
      case 'critical': return <Zap className="h-4 w-4" />
      default: return <AlertTriangle className="h-4 w-4" />
    }
  }
  
  const getProgressColor = (percentage: number) => {
    if (percentage >= 95) return 'bg-red-500'
    if (percentage >= 85) return 'bg-orange-500'
    if (percentage >= 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }
  
  const getActionIcon = (actionId: string) => {
    switch (actionId) {
      case 'compress': return <Archive className="h-4 w-4" />
      case 'clear': return <Trash2 className="h-4 w-4" />
      case 'export': return <Download className="h-4 w-4" />
      case 'view': return <Eye className="h-4 w-4" />
      case 'filter': return <Filter className="h-4 w-4" />
      default: return null
    }
  }
  
  const getActionVariant = (actionId: string) => {
    switch (actionId) {
      case 'clear':
      case 'emergency_clear': return 'destructive'
      case 'compress':
      case 'force_compress': return 'default'
      case 'export':
      case 'export_urgent': return 'outline'
      default: return 'secondary'
    }
  }
  
  return (
    <Card className={`border-2 ${getWarningColor(highestWarning.level)}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getWarningIcon(highestWarning.level)}
            <CardTitle className="text-sm font-medium">
              {highestWarning.title}
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              {highestWarning.level}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpandedWarning(
              expandedWarning === highestWarning.id ? null : highestWarning.id
            )}
            className="h-6 w-6 p-0"
          >
            {expandedWarning === highestWarning.id ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Context Usage Bar */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Context Usage</span>
            <span className="font-medium">
              {formatNumber(contextState.tokenCount || 0)} / {formatNumber(contextState.maxTokens || 200000)}
            </span>
          </div>
          <div className="relative">
            <Progress
              value={utilizationPercentage}
              className="h-2"
            />
            <div 
              className={`absolute top-0 left-0 h-2 rounded-full transition-all duration-300 ${getProgressColor(utilizationPercentage)}`}
              style={{ width: `${Math.min(utilizationPercentage, 100)}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {utilizationPercentage.toFixed(1)}% used
          </div>
        </div>
        
        {/* Warning Message */}
        <Alert className="mb-4">
          <AlertDescription className="text-sm">
            {highestWarning.message}
          </AlertDescription>
        </Alert>
        
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mb-3">
          {highestWarning.actions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={getActionVariant(action.id)}
              onClick={() => onAction(action.id, highestWarning)}
              className="h-7 text-xs"
            >
              {getActionIcon(action.id)}
              {action.label}
            </Button>
          ))}
        </div>
        
        {/* Expanded Details */}
        {expandedWarning === highestWarning.id && (
          <div className="space-y-3 pt-3 border-t">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Messages</div>
                <div className="font-medium">
                  {highestWarning.data.messagesCount}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Tokens</div>
                <div className="font-medium">
                  {formatNumber(highestWarning.data.currentTokens)}
                </div>
              </div>
            </div>
            
            <Separator />
            
            {/* Compression Estimate */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Compression Estimate</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Messages Removed</div>
                  <div className="font-medium">
                    ~{highestWarning.data.compressionEstimate.removedMessages}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Tokens Saved</div>
                  <div className="font-medium">
                    ~{formatNumber(highestWarning.data.compressionEstimate.tokensSaved)}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Estimated quality loss: {(highestWarning.data.compressionEstimate.qualityLoss * 100).toFixed(1)}%
              </div>
            </div>
            
            <Separator />
            
            {/* Recommendations */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Recommendations</div>
              <div className="text-sm text-muted-foreground">
                {utilizationPercentage > 95 && (
                  <div className="text-red-600 dark:text-red-400">
                    • Immediate action required - context is critically full
                  </div>
                )}
                {utilizationPercentage > 85 && utilizationPercentage <= 95 && (
                  <div className="text-orange-600 dark:text-orange-400">
                    • Consider compressing context soon
                  </div>
                )}
                {utilizationPercentage > 75 && utilizationPercentage <= 85 && (
                  <div className="text-yellow-600 dark:text-yellow-400">
                    • Monitor context usage
                  </div>
                )}
                <div>
                  • Use `/compress` command for intelligent compression
                </div>
                <div>
                  • Use `/export` to save conversation before clearing
                </div>
              </div>
            </div>
            
            {/* Context History */}
            {contextState.compressionHistory && contextState.compressionHistory.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="text-sm font-medium">Recent Compressions</div>
                  <div className="space-y-1">
                    {contextState.compressionHistory.slice(-3).map((event, index) => (
                      <div key={event.id} className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}: 
                        Saved {formatNumber(event.beforeTokens - event.afterTokens)} tokens 
                        ({event.strategy})
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            
            {/* Multiple Warnings */}
            {warnings.length > 1 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="text-sm font-medium">Other Warnings</div>
                  <div className="space-y-1">
                    {warnings
                      .filter(w => w.id !== highestWarning.id)
                      .map((warning) => (
                        <div key={warning.id} className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-xs">
                            {warning.level}
                          </Badge>
                          <span className="text-muted-foreground">
                            {warning.title}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}