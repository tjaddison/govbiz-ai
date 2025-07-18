'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'

import { OnboardingLayout } from './OnboardingLayout'
import { WelcomeStep } from './steps/WelcomeStep'
import { ProfileSetupStep } from './steps/ProfileSetupStep'
import { CustomizationStep } from './steps/CustomizationStep'
import { CapabilitiesStep } from './steps/CapabilitiesStep'
import { TutorialStep } from './steps/TutorialStep'
import { CompletionStep } from './steps/CompletionStep'

import type { OnboardingConfiguration, OnboardingProgress } from '@/types'

type APIResponse = {
  success: boolean
  data: any
  error?: string
}

export default function OnboardingFlow() {
  const router = useRouter()
  const { data: session } = useSession()
  
  const [isLoading, setIsLoading] = useState(true)
  const [configuration, setConfiguration] = useState<OnboardingConfiguration | null>(null)
  const [progress, setProgress] = useState<OnboardingProgress | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [stepData, setStepData] = useState<Record<string, any>>({})
  const [error, setError] = useState<string | null>(null)

  // Load onboarding configuration and progress
  useEffect(() => {
    if (session?.user?.id) {
      loadOnboardingData()
    }
  }, [session])

  const loadOnboardingData = async () => {
    try {
      setIsLoading(true)
      
      const response = await fetch('/api/onboarding?includeProgress=true')
      if (!response.ok) {
        throw new Error('Failed to load onboarding data')
      }
      
      const data: APIResponse = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to load onboarding data')
      }
      
      setConfiguration(data.data.configuration)
      setProgress(data.data.progress)
      setCurrentStep(data.data.progress.currentStep)
      
      // Load any existing step data
      if (data.data.progress.userResponses) {
        setStepData(data.data.progress.userResponses)
      }
    } catch (err) {
      console.error('Error loading onboarding data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load onboarding data')
      toast.error('Failed to load onboarding data')
    } finally {
      setIsLoading(false)
    }
  }

  const updateProgress = async (action: string, stepId: string, data?: any) => {
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, stepId, data })
      })
      
      if (!response.ok) {
        throw new Error('Failed to update progress')
      }
      
      const result: APIResponse = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to update progress')
      }
      
      setProgress(result.data.progress)
      return result.data.progress
    } catch (err) {
      console.error('Error updating progress:', err)
      toast.error('Failed to update progress')
      throw err
    }
  }

  const handleNext = async () => {
    if (!configuration || !progress) return
    
    const currentStepData = configuration.steps[currentStep - 1]
    
    try {
      // Save current step data
      if (Object.keys(stepData).length > 0) {
        await updateProgress('update-response', currentStepData.id, stepData[currentStepData.id])
      }
      
      // Complete current step
      await updateProgress('complete-step', currentStepData.id, stepData[currentStepData.id])
      
      // Move to next step
      if (currentStep < configuration.steps.length) {
        setCurrentStep(currentStep + 1)
      }
      
      toast.success(`${currentStepData.title} completed!`)
    } catch (err) {
      console.error('Error moving to next step:', err)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = async () => {
    if (!configuration || !progress) return
    
    const currentStepData = configuration.steps[currentStep - 1]
    
    try {
      await updateProgress('skip-step', currentStepData.id)
      
      // Move to next step
      if (currentStep < configuration.steps.length) {
        setCurrentStep(currentStep + 1)
      }
      
      toast.info(`${currentStepData.title} skipped`)
    } catch (err) {
      console.error('Error skipping step:', err)
    }
  }

  const handleComplete = async () => {
    if (!configuration || !progress) return
    
    const currentStepData = configuration.steps[currentStep - 1]
    
    try {
      // Complete final step
      await updateProgress('complete-step', currentStepData.id, stepData[currentStepData.id])
      
      toast.success('Onboarding completed successfully!')
      
      // Redirect to dashboard
      router.push('/dashboard')
    } catch (err) {
      console.error('Error completing onboarding:', err)
    }
  }

  const handleExit = () => {
    if (confirm('Are you sure you want to exit the onboarding? You can resume later.')) {
      router.push('/dashboard')
    }
  }

  const updateStepData = (stepId: string, data: any) => {
    setStepData(prev => ({
      ...prev,
      [stepId]: data
    }))
  }

  const renderCurrentStep = () => {
    if (!configuration || !progress) return null
    
    const currentStepData = configuration.steps[currentStep - 1]
    const props = {
      step: currentStepData,
      data: stepData[currentStepData.id] || {},
      onUpdate: (data: any) => updateStepData(currentStepData.id, data),
      onNext: handleNext
    }
    
    switch (currentStepData.type) {
      case 'welcome':
        return <WelcomeStep {...props} />
      case 'setup':
        if (currentStepData.id === 'profile-setup') {
          return <ProfileSetupStep {...props} />
        }
        if (currentStepData.id === 'customization') {
          return <CustomizationStep {...props} />
        }
        break
      case 'capabilities':
        return <CapabilitiesStep {...props} />
      case 'tutorial':
        return <TutorialStep {...props} />
      case 'completion':
        return <CompletionStep {...props} />
      default:
        return (
          <div className="text-center py-8">
            <p className="text-gray-600">Step type &apos;{currentStepData.type}&apos; not implemented</p>
          </div>
        )
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-sm">GB</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Loading your onboarding...
          </h2>
          <div className="w-48 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    )
  }

  if (error || !configuration || !progress) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 dark:text-red-400 text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Onboarding Error
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {error || 'Failed to load onboarding configuration'}
          </p>
          <button
            onClick={loadOnboardingData}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <OnboardingLayout
      steps={configuration.steps}
      currentStep={currentStep}
      progress={progress}
      onNext={handleNext}
      onPrevious={handlePrevious}
      onSkip={handleSkip}
      onComplete={handleComplete}
      onExit={handleExit}
    >
      {renderCurrentStep()}
    </OnboardingLayout>
  )
}