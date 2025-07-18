'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Search, 
  FileText, 
  Users, 
  BarChart3, 
  Shield, 
  Zap,
  Play,
  CheckCircle,
  ExternalLink,
  Clock,
  Star,
  ArrowRight
} from 'lucide-react'
import { OnboardingStep, SystemCapability } from '@/types'

interface CapabilitiesStepProps {
  step: OnboardingStep
  data: any
  onUpdate: (data: any) => void
  onNext: () => void
}

function CapabilitiesStep({ step, data, onUpdate, onNext }: CapabilitiesStepProps) {
  const [capabilities, setCapabilities] = useState<SystemCapability[]>([])
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(data.interestedCapabilities || [])
  const [currentDemo, setCurrentDemo] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [demoProgress, setDemoProgress] = useState(0)
  
  // Load capabilities from API
  useEffect(() => {
    loadCapabilities()
  }, [])
  
  const loadCapabilities = async () => {
    try {
      const response = await fetch('/api/onboarding/config?section=capabilities')
      const result = await response.json()
      
      if (result.success) {
        setCapabilities(result.data.capabilities || [])
      }
    } catch (error) {
      console.error('Failed to load capabilities:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleCapabilitySelect = (capabilityId: string) => {
    const newSelected = selectedCapabilities.includes(capabilityId)
      ? selectedCapabilities.filter(id => id !== capabilityId)
      : [...selectedCapabilities, capabilityId]
    
    setSelectedCapabilities(newSelected)
    onUpdate({ interestedCapabilities: newSelected })
  }
  
  const startDemo = (capabilityId: string) => {
    setCurrentDemo(capabilityId)
    setDemoProgress(0)
    
    // Simulate demo progress
    const interval = setInterval(() => {
      setDemoProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        return prev + 10
      })
    }, 200)
  }
  
  const stopDemo = () => {
    setCurrentDemo(null)
    setDemoProgress(0)
  }
  
  const getCapabilityIcon = (capabilityId: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      'sources-sought-finder': <Search className="w-6 h-6" />,
      'response-generator': <FileText className="w-6 h-6" />,
      'relationship-tracker': <Users className="w-6 h-6" />,
      'pipeline-management': <BarChart3 className="w-6 h-6" />,
      'competitive-intelligence': <Shield className="w-6 h-6" />
    }
    return iconMap[capabilityId] || <Zap className="w-6 h-6" />
  }
  
  const getCategoryColor = (category: string) => {
    const colorMap: Record<string, string> = {
      'core': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'advanced': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'specialized': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
    }
    return colorMap[category] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
  }
  
  const handleContinue = () => {
    onNext()
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-sm animate-pulse">GB</span>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Loading Capabilities
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Discovering what GovBiz.ai can do for you...
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Explore GovBiz.ai Capabilities
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Discover the powerful features that will transform your government contracting process. 
          Select the capabilities you&apos;re most interested in and see them in action.
        </p>
      </div>
      
      {/* Demo in Progress */}
      {currentDemo && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Play className="w-5 h-5 text-blue-600" />
                <span>Demo in Progress</span>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={stopDemo}>
                Stop Demo
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {capabilities.find(c => c.id === currentDemo)?.name}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {demoProgress}%
                </span>
              </div>
              <Progress value={demoProgress} className="h-2" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Simulating real-world usage scenario...
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Capabilities Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {capabilities.map((capability) => {
          const isSelected = selectedCapabilities.includes(capability.id)
          const isDemo = currentDemo === capability.id
          
          return (
            <Card 
              key={capability.id} 
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected 
                  ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'hover:shadow-lg'
              } ${isDemo ? 'ring-2 ring-purple-500' : ''}`}
              onClick={() => handleCapabilitySelect(capability.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      isSelected 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>
                      {getCapabilityIcon(capability.id)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{capability.name}</CardTitle>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge className={getCategoryColor(capability.category)}>
                          {capability.category}
                        </Badge>
                        {capability.category === 'specialized' && (
                          <Badge variant="outline" className="text-xs">
                            <Star className="w-3 h-3 mr-1" />
                            Advanced
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <CheckCircle className="w-6 h-6 text-blue-600" />
                  )}
                </div>
              </CardHeader>
              
              <CardContent>
                <CardDescription className="mb-4">
                  {capability.description}
                </CardDescription>
                
                {/* Key Features */}
                <div className="space-y-2 mb-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Key Features:</p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    {capability.benefits?.slice(0, 3).map((feature, index) => (
                      <li key={index} className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                {/* Benefits */}
                {capability.benefits && (
                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Benefits:</p>
                    <div className="flex flex-wrap gap-1">
                      {capability.benefits.slice(0, 2).map((benefit, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {benefit}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Time Investment */}
                <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-4">
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span>Setup: 5 min</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span>ROI: High</span>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant={isDemo ? "secondary" : "outline"}
                    onClick={(e) => {
                      e.stopPropagation()
                      startDemo(capability.id)
                    }}
                    disabled={isDemo}
                    className="flex-1"
                  >
                    {isDemo ? (
                      <>
                        <div className="w-4 h-4 mr-2 animate-spin border-2 border-gray-300 border-t-gray-600 rounded-full" />
                        Running Demo
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Try Demo
                      </>
                    )}
                  </Button>
                  
                  {false && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open('#', '_blank')
                      }}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      
      {/* Selection Summary */}
      {selectedCapabilities.length > 0 && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span>Selected Capabilities ({selectedCapabilities.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-green-700 dark:text-green-300">
                You&apos;ve selected {selectedCapabilities.length} capabilities to explore. 
                These will be prioritized in your onboarding experience.
              </p>
              
              <div className="flex flex-wrap gap-2">
                {selectedCapabilities.map((capId) => {
                  const capability = capabilities.find(c => c.id === capId)
                  return capability ? (
                    <Badge key={capId} className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      {capability.name}
                    </Badge>
                  ) : null
                })}
              </div>
              
              {/* Estimated Setup Time */}
              <div className="flex items-center space-x-2 text-sm text-green-700 dark:text-green-300">
                <Clock className="w-4 h-4" />
                <span>
                  Total estimated setup time: {selectedCapabilities.length * 5} minutes
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Continue Button */}
      <div className="text-center pt-6">
        <Button
          onClick={handleContinue}
          size="lg"
          disabled={selectedCapabilities.length === 0}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
        >
          <span>Continue with Selected Capabilities</span>
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
        
        {selectedCapabilities.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Please select at least one capability to continue
          </p>
        )}
        
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          You can enable additional capabilities later in your dashboard
        </p>
      </div>
    </div>
  )
}

export { CapabilitiesStep }
export default CapabilitiesStep