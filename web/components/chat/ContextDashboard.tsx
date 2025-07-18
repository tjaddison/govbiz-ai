'use client'

import { useState } from 'react'
import { BarChart3, TrendingUp, Clock, MessageSquare, Zap, Brain, FileText, Settings, X } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ContextState, Message } from '@/types'
import { formatNumber, formatRelativeTime } from '@/lib/utils'

interface ContextDashboardProps {
  contextState: ContextState
  messages: Message[]
  onAction: (action: string, data?: any) => void
  onClose?: () => void
}

export const ContextDashboard: React.FC<ContextDashboardProps> = ({
  contextState,
  messages,
  onAction,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState('overview')
  
  const utilization = (contextState.tokenCount || 0) / (contextState.maxTokens || 200000)
  const utilizationPercentage = utilization * 100
  
  // Calculate statistics
  const stats = {
    totalMessages: messages.length,
    userMessages: messages.filter(m => m.role === 'user').length,
    assistantMessages: messages.filter(m => m.role === 'assistant').length,
    systemMessages: messages.filter(m => m.role === 'system').length,
    totalTokens: contextState.tokenCount || 0,
    maxTokens: contextState.maxTokens || 200000,
    averageTokensPerMessage: messages.length > 0 ? (contextState.tokenCount || 0) / messages.length : 0,
    compressionCount: contextState.compressionHistory?.length || 0,
    oldestMessage: messages.length > 0 ? messages[0] : null,
    newestMessage: messages.length > 0 ? messages[messages.length - 1] : null
  }
  
  // Token distribution
  const tokenDistribution = {
    user: messages.filter(m => m.role === 'user').reduce((sum, m) => sum + m.tokens, 0),
    assistant: messages.filter(m => m.role === 'assistant').reduce((sum, m) => sum + m.tokens, 0),
    system: messages.filter(m => m.role === 'system').reduce((sum, m) => sum + m.tokens, 0)
  }
  
  const getUtilizationColor = (percentage: number) => {
    if (percentage >= 95) return 'text-red-600 dark:text-red-400'
    if (percentage >= 85) return 'text-orange-600 dark:text-orange-400'
    if (percentage >= 75) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-green-600 dark:text-green-400'
  }
  
  const getUtilizationBg = (percentage: number) => {
    if (percentage >= 95) return 'bg-red-500'
    if (percentage >= 85) return 'bg-orange-500'
    if (percentage >= 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Context Dashboard</h2>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="px-4 pt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>
          
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              {/* Context Usage */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Context Usage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Utilization</span>
                      <span className={`text-sm font-medium ${getUtilizationColor(utilizationPercentage)}`}>
                        {utilizationPercentage.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={utilizationPercentage} className="h-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatNumber(stats.totalTokens)} used</span>
                      <span>{formatNumber(stats.maxTokens)} limit</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Message Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Messages
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-2xl font-bold">{stats.totalMessages}</div>
                      <div className="text-xs text-muted-foreground">Total Messages</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{Math.round(stats.averageTokensPerMessage)}</div>
                      <div className="text-xs text-muted-foreground">Avg Tokens/Message</div>
                    </div>
                  </div>
                  
                  <Separator className="my-3" />
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        User
                      </span>
                      <span>{stats.userMessages}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        Assistant
                      </span>
                      <span>{stats.assistantMessages}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                        System
                      </span>
                      <span>{stats.systemMessages}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Token Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Token Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">User</span>
                      <span className="text-sm font-medium">
                        {formatNumber(tokenDistribution.user)}
                      </span>
                    </div>
                    <Progress 
                      value={(tokenDistribution.user / stats.totalTokens) * 100} 
                      className="h-2"
                    />
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Assistant</span>
                      <span className="text-sm font-medium">
                        {formatNumber(tokenDistribution.assistant)}
                      </span>
                    </div>
                    <Progress 
                      value={(tokenDistribution.assistant / stats.totalTokens) * 100} 
                      className="h-2"
                    />
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">System</span>
                      <span className="text-sm font-medium">
                        {formatNumber(tokenDistribution.system)}
                      </span>
                    </div>
                    <Progress 
                      value={(tokenDistribution.system / stats.totalTokens) * 100} 
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>
              
              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onAction('compress')}
                      disabled={stats.totalMessages === 0}
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      Compress
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onAction('export')}
                      disabled={stats.totalMessages === 0}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      Export
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onAction('clear')}
                      disabled={stats.totalMessages === 0}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Clear
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onAction('analyze')}
                      disabled={stats.totalMessages === 0}
                    >
                      <BarChart3 className="h-3 w-3 mr-1" />
                      Analyze
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Analytics Tab */}
            <TabsContent value="analytics" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Performance Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-lg font-semibold">{stats.compressionCount}</div>
                      <div className="text-xs text-muted-foreground">Compressions</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold">
                        {((tokenDistribution.assistant / (tokenDistribution.user || 1)) * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-muted-foreground">Response Ratio</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Context Efficiency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Memory Usage</span>
                      <Badge variant="outline">
                        {utilizationPercentage > 80 ? 'High' : utilizationPercentage > 50 ? 'Medium' : 'Low'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Compression Efficiency</span>
                      <Badge variant="outline">
                        {stats.compressionCount > 0 ? 'Active' : 'None'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* History Tab */}
            <TabsContent value="history" className="space-y-4 mt-4">
              {/* Conversation Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Conversation Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.oldestMessage && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Started</span>
                        <span className="text-sm font-medium">
                          {formatRelativeTime(stats.oldestMessage.timestamp)}
                        </span>
                      </div>
                    )}
                    {stats.newestMessage && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Last Message</span>
                        <span className="text-sm font-medium">
                          {formatRelativeTime(stats.newestMessage.timestamp)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Duration</span>
                      <span className="text-sm font-medium">
                        {stats.oldestMessage && stats.newestMessage 
                          ? formatRelativeTime(stats.newestMessage.timestamp - stats.oldestMessage.timestamp)
                          : 'N/A'
                        }
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Compression History */}
              {contextState.compressionHistory && contextState.compressionHistory.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Compression History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {contextState.compressionHistory.slice(-5).map((event, index) => (
                        <div key={event.id} className="flex items-center justify-between text-sm">
                          <div>
                            <div className="font-medium">{event.strategy}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatRelativeTime(event.timestamp)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">
                              -{formatNumber(event.beforeTokens - event.afterTokens)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              tokens saved
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}