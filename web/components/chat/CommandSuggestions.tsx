'use client'

import { useState, useEffect } from 'react'
import { Command, Terminal, Zap, HelpCircle, Search } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'

interface CommandSuggestionsProps {
  suggestions: string[]
  onSelect: (command: string) => void
  className?: string
}

export const CommandSuggestions: React.FC<CommandSuggestionsProps> = ({
  suggestions,
  onSelect,
  className = ''
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  
  const commandDescriptions: Record<string, { description: string; usage: string; icon: JSX.Element }> = {
    'clear': {
      description: 'Clear conversation context',
      usage: '/clear [--confirm] [--keep-system]',
      icon: <Terminal className="h-3 w-3" />
    },
    'compress': {
      description: 'Compress context to save tokens',
      usage: '/compress [--strategy=preservation|summarization|removal|hybrid]',
      icon: <Zap className="h-3 w-3" />
    },
    'export': {
      description: 'Export conversation history',
      usage: '/export [--format=json|markdown|txt]',
      icon: <Command className="h-3 w-3" />
    },
    'tokens': {
      description: 'Show token usage statistics',
      usage: '/tokens [--detailed]',
      icon: <Terminal className="h-3 w-3" />
    },
    'model': {
      description: 'Switch or list AI models',
      usage: '/model [model-name] [--list]',
      icon: <Zap className="h-3 w-3" />
    },
    'help': {
      description: 'Show help information',
      usage: '/help [command]',
      icon: <HelpCircle className="h-3 w-3" />
    },
    'search': {
      description: 'Search conversation history',
      usage: '/search <query> [--role=user|assistant|system]',
      icon: <Search className="h-3 w-3" />
    }
  }
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (suggestions[selectedIndex]) {
          onSelect(`/${suggestions[selectedIndex]}`)
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex, suggestions, onSelect])
  
  if (suggestions.length === 0) return null
  
  return (
    <Card className={`mb-2 ${className}`}>
      <CardContent className="p-2">
        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <Terminal className="h-3 w-3" />
          Command suggestions
        </div>
        
        <div className="space-y-1">
          {suggestions.map((command, index) => {
            const info = commandDescriptions[command]
            const isSelected = index === selectedIndex
            
            return (
              <Button
                key={command}
                variant={isSelected ? "secondary" : "ghost"}
                size="sm"
                className={`w-full justify-start h-auto p-2 ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
                onClick={() => onSelect(`/${command}`)}
              >
                <div className="flex items-start gap-2 w-full">
                  {info?.icon || <Terminal className="h-3 w-3" />}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">/{command}</span>
                      {isSelected && (
                        <Badge variant="outline" className="text-xs">
                          Enter
                        </Badge>
                      )}
                    </div>
                    {info && (
                      <>
                        <div className="text-xs text-muted-foreground mt-1">
                          {info.description}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-1">
                          {info.usage}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Button>
            )
          })}
        </div>
        
        <Separator className="my-2" />
        
        <div className="text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Use ↑↓ to navigate, Enter to select</span>
            <Badge variant="outline" className="text-xs">
              {suggestions.length} commands
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}