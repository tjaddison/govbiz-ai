'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  User, 
  Building, 
  Award, 
  Target,
  CheckCircle,
  AlertCircle,
  Info,
  ArrowRight
} from 'lucide-react'
import { OnboardingStep } from '@/types'

interface ProfileSetupStepProps {
  step: OnboardingStep
  data: any
  onUpdate: (data: any) => void
  onNext: () => void
}

function ProfileSetupStep({ step, data, onUpdate, onNext }: ProfileSetupStepProps) {
  const [formData, setFormData] = useState({
    name: data.name || '',
    role: data.role || '',
    organization: data.organization || '',
    experience: data.experience || '',
    naicsCodes: data.naicsCodes || [],
    certifications: data.certifications || [],
    primaryUseCase: data.primaryUseCase || '',
    goals: data.goals || []
  })
  
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isValid, setIsValid] = useState(false)
  
  const roles = [
    'Business Development Manager',
    'Proposal Manager',
    'Contract Specialist',
    'Small Business Owner',
    'Government Relations',
    'Sales Manager',
    'Consultant',
    'Other'
  ]
  
  const experienceLevels = [
    { value: 'beginner', label: 'Beginner (0-2 years)', description: 'New to government contracting' },
    { value: 'intermediate', label: 'Intermediate (3-7 years)', description: 'Some experience with federal contracts' },
    { value: 'advanced', label: 'Advanced (8+ years)', description: 'Extensive government contracting experience' }
  ]
  
  const certifications = [
    { id: 'sdb', name: 'Small Business', description: 'SBA certified small business' },
    { id: '8a', name: '8(a) Program', description: 'SBA 8(a) Business Development Program' },
    { id: 'wosb', name: 'WOSB', description: 'Women-Owned Small Business' },
    { id: 'sdvosb', name: 'SDVOSB', description: 'Service-Disabled Veteran-Owned Small Business' },
    { id: 'hubzone', name: 'HUBZone', description: 'Historically Underutilized Business Zone' },
    { id: 'none', name: 'None', description: 'No current certifications' }
  ]
  
  const useCases = [
    'Find and respond to Sources Sought opportunities',
    'Build relationships with government buyers',
    'Automate proposal writing processes',
    'Track and manage contract pipeline',
    'Competitive intelligence and market research',
    'Compliance and regulatory guidance'
  ]
  
  const goals = [
    'Increase win rate on federal contracts',
    'Reduce time spent on proposal writing',
    'Build stronger government relationships',
    'Expand into new agencies or markets',
    'Improve competitive positioning',
    'Streamline business development processes'
  ]
  
  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }
    
    if (!formData.role) {
      newErrors.role = 'Role is required'
    }
    
    if (!formData.experience) {
      newErrors.experience = 'Experience level is required'
    }
    
    if (!formData.primaryUseCase) {
      newErrors.primaryUseCase = 'Primary use case is required'
    }
    
    if (formData.goals.length === 0) {
      newErrors.goals = 'Please select at least one goal'
    }
    
    setErrors(newErrors)
    setIsValid(Object.keys(newErrors).length === 0)
  }, [formData])
  
  useEffect(() => {
    validateForm()
  }, [formData, validateForm])
  
  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    onUpdate({ ...formData, [field]: value })
  }
  
  const handleArrayToggle = (field: string, value: string) => {
    const currentArray = formData[field as keyof typeof formData] as string[]
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value]
    
    handleInputChange(field, newArray)
  }
  
  const handleSubmit = () => {
    if (isValid) {
      onNext()
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="w-5 h-5 text-blue-600" />
            <span>Personal Information</span>
          </CardTitle>
          <CardDescription>
            Tell us about yourself to personalize your experience
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Full Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              } dark:bg-gray-800 dark:text-white`}
              placeholder="Enter your full name"
            />
            {errors.name && (
              <p className="text-sm text-red-600 mt-1 flex items-center space-x-1">
                <AlertCircle className="w-4 h-4" />
                <span>{errors.name}</span>
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Your Role *
            </label>
            <select
              value={formData.role}
              onChange={(e) => handleInputChange('role', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.role ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              } dark:bg-gray-800 dark:text-white`}
            >
              <option value="">Select your role</option>
              {roles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            {errors.role && (
              <p className="text-sm text-red-600 mt-1 flex items-center space-x-1">
                <AlertCircle className="w-4 h-4" />
                <span>{errors.role}</span>
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Organization
            </label>
            <input
              type="text"
              value={formData.organization}
              onChange={(e) => handleInputChange('organization', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              placeholder="Your company or organization"
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Experience Level */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="w-5 h-5 text-green-600" />
            <span>Experience Level</span>
          </CardTitle>
          <CardDescription>
            Help us tailor the experience to your expertise level
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {experienceLevels.map((level) => (
              <div
                key={level.value}
                className={`p-3 border rounded-lg cursor-pointer transition-all ${
                  formData.experience === level.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
                onClick={() => handleInputChange('experience', level.value)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{level.label}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{level.description}</p>
                  </div>
                  {formData.experience === level.value && (
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  )}
                </div>
              </div>
            ))}
          </div>
          {errors.experience && (
            <p className="text-sm text-red-600 mt-2 flex items-center space-x-1">
              <AlertCircle className="w-4 h-4" />
              <span>{errors.experience}</span>
            </p>
          )}
        </CardContent>
      </Card>
      
      {/* Continue Button */}
      <div className="text-center pt-6">
        <Button
          onClick={handleSubmit}
          disabled={!isValid}
          size="lg"
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 disabled:opacity-50"
        >
          <span>Continue Setup</span>
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
        
        {!isValid && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Please complete all required fields to continue
          </p>
        )}
      </div>
    </div>
  )
}

export { ProfileSetupStep }
export default ProfileSetupStep