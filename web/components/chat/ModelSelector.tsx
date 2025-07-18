'use client'

import { useState } from 'react'
import { ChevronDown, Zap, Clock, DollarSign, Brain, Shield, CheckCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import { ModelInfo } from '@/types'
import { formatNumber } from '@/lib/utils'

interface ModelSelectorProps {
  currentModel: ModelInfo
  availableModels: ModelInfo[]
  onModelChange: (modelId: string) => void
  disabled?: boolean
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModel,
  availableModels,
  onModelChange,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false)
  
  const getSpeedIcon = (speed: string) => {
    switch (speed) {
      case 'fast': return <Zap className="h-3 w-3 text-green-500" />
      case 'medium': return <Clock className="h-3 w-3 text-yellow-500" />
      case 'slow': return <Clock className="h-3 w-3 text-red-500" />
      default: return <Clock className="h-3 w-3 text-gray-500" />
    }
  }
  
  const getQualityIcon = (quality: string) => {
    switch (quality) {
      case 'highest': return <Brain className="h-3 w-3 text-purple-500" />
      case 'higher': return <Brain className="h-3 w-3 text-blue-500" />
      case 'high': return <Brain className="h-3 w-3 text-green-500" />
      default: return <Brain className="h-3 w-3 text-gray-500" />
    }
  }
  
  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'anthropic': return <Shield className="h-3 w-3 text-orange-500" />
      case 'openai': return <Shield className="h-3 w-3 text-green-500" />
      case 'google': return <Shield className="h-3 w-3 text-blue-500" />
      case 'aws': return <Shield className="h-3 w-3 text-yellow-500" />
      default: return <Shield className="h-3 w-3 text-gray-500" />
    }
  }
  
  const formatCost = (costPerToken: number) => {
    const costPer1K = costPerToken * 1000
    if (costPer1K < 0.01) {
      return `$${(costPer1K * 1000).toFixed(2)}/1M`
    }
    return `$${costPer1K.toFixed(3)}/1K`
  }
  
  const getCapabilityBadges = (capabilities: ModelInfo['capabilities']) => {
    const priorityOrder = ['text', 'code', 'analysis', 'research', 'math', 'vision', 'function_calling']
    const supportedCapabilities = capabilities
      .filter(cap => cap.supported)
      .sort((a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type))
    
    return supportedCapabilities.slice(0, 3).map(cap => (
      <Badge key={cap.type} variant="secondary" className="text-xs">
        {cap.type}
      </Badge>
    ))
  }
  
  return (
    <div className="w-full">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between h-auto p-3"
            disabled={disabled}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {getProviderIcon(currentModel.provider)}
                <span className="font-medium">{currentModel.name}</span>
              </div>
              <div className="flex items-center gap-1">
                {getSpeedIcon(currentModel.speed)}
                {getQualityIcon(currentModel.quality)}
              </div>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent className="w-80" align="start">
          <DropdownMenuLabel>Select Model</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {availableModels.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onClick={() => {
                onModelChange(model.id)
                setIsOpen(false)
              }}
              className="p-0"
            >
              <Card className="w-full border-none shadow-none">
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getProviderIcon(model.provider)}
                      <CardTitle className="text-sm font-medium">
                        {model.name}
                      </CardTitle>
                      {model.id === currentModel.id && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            {getSpeedIcon(model.speed)}
                            <span className="text-xs text-muted-foreground">
                              {model.speed}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Speed: {model.speed}</TooltipContent>
                      </Tooltip>
                      
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            {getQualityIcon(model.quality)}
                            <span className="text-xs text-muted-foreground">
                              {model.quality}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>Quality: {model.quality}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <CardDescription className="text-xs">
                    {model.description}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="p-3 pt-0">
                  {/* Capabilities */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {getCapabilityBadges(model.capabilities)}
                    {model.capabilities.filter(cap => cap.supported).length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{model.capabilities.filter(cap => cap.supported).length - 3}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      <span>{formatCost(model.costPerToken)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Brain className="h-3 w-3" />
                      <span>{formatNumber(model.contextWindow)} ctx</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </DropdownMenuItem>
          ))}
          
          <DropdownMenuSeparator />
          
          {/* Model Comparison */}
          <div className="p-3">
            <div className="text-xs text-muted-foreground mb-2">
              Current Model: {currentModel.name}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Context Window</div>
                <div className="font-medium">
                  {formatNumber(currentModel.contextWindow)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Max Output</div>
                <div className="font-medium">
                  {formatNumber(currentModel.maxTokens)}
                </div>
              </div>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Quick Model Stats */}
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <DollarSign className="h-3 w-3" />
          <span>{formatCost(currentModel.costPerToken)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Brain className="h-3 w-3" />
          <span>{formatNumber(currentModel.contextWindow)} ctx</span>
        </div>
        <div className="flex items-center gap-1">
          {getSpeedIcon(currentModel.speed)}
          <span>{currentModel.speed}</span>
        </div>
      </div>
    </div>
  )
}