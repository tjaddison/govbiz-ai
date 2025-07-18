'use client'

import { useState, useEffect } from 'react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  CheckCircle, 
  Circle,
  SkipForward,
  HelpCircle,
  X
} from 'lucide-react'
import { OnboardingStep, OnboardingProgress } from '@/types'

interface OnboardingLayoutProps {
  steps: OnboardingStep[]
  currentStep: number
  progress: OnboardingProgress
  onNext: () => void
  onPrevious: () => void
  onSkip: () => void
  onComplete: () => void
  onExit: () => void
  children: React.ReactNode
}

function OnboardingLayout({
  steps,
  currentStep,
  progress,
  onNext,
  onPrevious,
  onSkip,
  onComplete,
  onExit,
  children
}: OnboardingLayoutProps) {
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(progress.estimatedTimeRemaining)
  const [showHelp, setShowHelp] = useState(false)

  const currentStepData = steps[currentStep - 1]
  const isFirstStep = currentStep === 1
  const isLastStep = currentStep === steps.length
  const canSkip = currentStepData?.isOptional || false

  useEffect(() => {
    setEstimatedTimeRemaining(progress.estimatedTimeRemaining)
  }, [progress.estimatedTimeRemaining])

  const formatTime = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes}m`
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">GB</span>
                </div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  GovBiz.ai Setup
                </h1>
              </div>
              
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                <Clock className="w-4 h-4" />
                <span>{formatTime(estimatedTimeRemaining)} remaining</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHelp(!showHelp)}
                className="text-gray-600 dark:text-gray-400"
              >
                <HelpCircle className="w-4 h-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={onExit}
                className="text-gray-600 dark:text-gray-400"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Step {currentStep} of {steps.length}
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {progress.completionPercentage}% Complete
              </span>
            </div>
            <Progress value={progress.completionPercentage} className="h-2" />
          </div>
        </div>
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex items-start space-x-3">
              <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-900 dark:text-blue-100">
                  {currentStepData?.title} Help
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  {currentStepData?.description}
                </p>
                {currentStepData?.requirements && (
                  <div className="mt-2">
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Requirements:</p>
                    <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                      {currentStepData.requirements.map((req, index) => (
                        <li key={index} className="flex items-center space-x-1">
                          <Circle className="w-2 h-2 fill-current" />
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step Navigation */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              {steps.map((step, index) => {
                const stepNumber = index + 1
                const isActive = stepNumber === currentStep
                const isCompleted = progress.completedSteps.includes(step.id)
                const isSkipped = progress.skippedSteps.includes(step.id)
                
                return (
                  <div key={step.id} className="flex items-center space-x-2">
                    <div className="flex items-center space-x-2">
                      {isCompleted ? (
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                      ) : isSkipped ? (
                        <SkipForward className="w-5 h-5 text-gray-400" />
                      ) : (
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                          isActive 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                        }`}>
                          {stepNumber}
                        </div>
                      )}
                      <span className={`text-sm font-medium ${
                        isActive 
                          ? 'text-blue-600 dark:text-blue-400' 
                          : isCompleted 
                          ? 'text-green-600 dark:text-green-400'
                          : isSkipped
                          ? 'text-gray-400'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {step.title}
                      </span>
                      {step.isOptional && (
                        <Badge variant="secondary" className="text-xs">
                          Optional
                        </Badge>
                      )}
                    </div>
                    {index < steps.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                    )}
                  </div>
                )
              })}
            </div>
            
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <Clock className="w-4 h-4" />
              <span>{currentStepData?.estimatedDuration || 0}m</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                  {currentStepData?.title}
                </CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400 mt-2">
                  {currentStepData?.description}
                </CardDescription>
              </div>
              <Badge variant={currentStepData?.type === 'completion' ? 'default' : 'secondary'}>
                {currentStepData?.type?.replace('-', ' ')}
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent>
            {children}
          </CardContent>
        </Card>
      </div>

      {/* Footer Navigation */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 sticky bottom-0">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                onClick={onPrevious}
                disabled={isFirstStep}
                className="flex items-center space-x-2"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </Button>
              
              {canSkip && (
                <Button
                  variant="ghost"
                  onClick={onSkip}
                  className="flex items-center space-x-2 text-gray-600 dark:text-gray-400"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>Skip</span>
                </Button>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              {isLastStep ? (
                <Button
                  onClick={onComplete}
                  className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Complete Setup</span>
                </Button>
              ) : (
                <Button
                  onClick={onNext}
                  className="flex items-center space-x-2"
                >
                  <span>Continue</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { OnboardingLayout }
export default OnboardingLayout