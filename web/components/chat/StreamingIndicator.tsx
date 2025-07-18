'use client'

import { useEffect, useState } from 'react'
import { Loader2, Zap, Clock, Activity } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

import { useStreamingStats } from '@/stores/streamingStore'
import { formatNumber } from '@/lib/utils'

interface StreamingIndicatorProps {
  className?: string
  showProgress?: boolean
  showStats?: boolean
}

export const StreamingIndicator: React.FC<StreamingIndicatorProps> = ({
  className = '',
  showProgress = true,
  showStats = true
}) => {
  const [dots, setDots] = useState('')
  const { isStreaming, tokensGenerated, duration, speed, progress } = useStreamingStats()
  
  // Animated dots effect
  useEffect(() => {
    if (!isStreaming) return
    
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev.length >= 3) return ''
        return prev + '.'
      })
    }, 500)
    
    return () => clearInterval(interval)
  }, [isStreaming])
  
  if (!isStreaming) return null
  
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }
  
  const getSpeedColor = (tokensPerSecond: number) => {
    if (tokensPerSecond > 15) return 'text-green-600 dark:text-green-400'
    if (tokensPerSecond > 8) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }
  
  return (
    <Card className={`border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {/* Loading animation */}
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Generating response{dots}
            </span>
          </div>
          
          {/* Status badge */}
          <Badge variant="outline" className="text-xs">
            <Activity className="h-3 w-3 mr-1" />
            Streaming
          </Badge>
        </div>
        
        {/* Progress and stats */}
        {(showProgress || showStats) && (
          <div className="mt-3 space-y-2">
            {/* Progress bar */}
            {showProgress && progress && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>
                    {progress.tokensGenerated} / {progress.estimatedTotal} tokens
                  </span>
                </div>
                <Progress 
                  value={(progress.tokensGenerated / progress.estimatedTotal) * 100} 
                  className="h-1"
                />
              </div>
            )}
            
            {/* Statistics */}
            {showStats && (
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-blue-500" />
                  <span className="text-muted-foreground">Tokens:</span>
                  <span className="font-medium">{formatNumber(tokensGenerated)}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-blue-500" />
                  <span className="text-muted-foreground">Time:</span>
                  <span className="font-medium">{formatDuration(duration)}</span>
                </div>
                
                <div className="flex items-center gap-1">
                  <Activity className="h-3 w-3 text-blue-500" />
                  <span className="text-muted-foreground">Speed:</span>
                  <span className={`font-medium ${getSpeedColor(speed)}`}>
                    {speed.toFixed(1)} t/s
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Simple version for inline use
export const SimpleStreamingIndicator: React.FC<{ className?: string }> = ({ 
  className = '' 
}) => {
  const [dots, setDots] = useState('')
  const { isStreaming } = useStreamingStats()
  
  useEffect(() => {
    if (!isStreaming) return
    
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev.length >= 3) return ''
        return prev + '.'
      })
    }, 500)
    
    return () => clearInterval(interval)
  }, [isStreaming])
  
  if (!isStreaming) return null
  
  return (
    <div className={`inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 ${className}`}>
      <Loader2 className="h-3 w-3 animate-spin" />
      <span className="text-sm">Thinking{dots}</span>
    </div>
  )
}

// Minimal dots indicator
export const DotsIndicator: React.FC<{ className?: string }> = ({ 
  className = '' 
}) => {
  const { isStreaming } = useStreamingStats()
  
  if (!isStreaming) return null
  
  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <div className="flex gap-1">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
      </div>
    </div>
  )
}