'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  CheckCircle, 
  Star, 
  Rocket, 
  Target, 
  BookOpen,
  Users,
  Zap,
  ArrowRight,
  ExternalLink,
  Gift,
  Calendar,
  MessageCircle,
  HelpCircle
} from 'lucide-react'
import { OnboardingStep } from '@/types'

interface CompletionStepProps {
  step: OnboardingStep
  data: any
  onUpdate: (data: any) => void
  onNext: () => void
}

function CompletionStep({ step, data, onUpdate, onNext }: CompletionStepProps) {
  const [feedback, setFeedback] = useState({
    rating: data.rating || 0,
    comments: data.comments || '',
    improvements: data.improvements || [],
    wouldRecommend: data.wouldRecommend || null
  })
  
  const achievements = [
    { id: 'profile', title: 'Profile Complete', description: 'Set up your business profile', completed: true },
    { id: 'capabilities', title: 'Explored Capabilities', description: 'Learned about platform features', completed: true },
    { id: 'tutorial', title: 'Tutorial Completed', description: 'Completed interactive tutorials', completed: true },
    { id: 'customization', title: 'Personalized Setup', description: 'Customized your experience', completed: true }
  ]
  
  const nextSteps = [
    {
      id: 'first-search',
      title: 'Run Your First Search',
      description: 'Find Sources Sought opportunities matching your business',
      icon: <Target className="w-5 h-5" />,
      action: 'Search Opportunities',
      priority: 'high',
      estimatedTime: '5 min'
    },
    {
      id: 'response-template',
      title: 'Create Response Templates',
      description: 'Set up reusable templates for faster responses',
      icon: <BookOpen className="w-5 h-5" />,
      action: 'Create Templates',
      priority: 'medium',
      estimatedTime: '15 min'
    },
    {
      id: 'contact-import',
      title: 'Import Government Contacts',
      description: 'Add your existing government contacts to the system',
      icon: <Users className="w-5 h-5" />,
      action: 'Import Contacts',
      priority: 'medium',
      estimatedTime: '10 min'
    },
    {
      id: 'setup-alerts',
      title: 'Configure Opportunity Alerts',
      description: 'Set up automated alerts for new opportunities',
      icon: <Zap className="w-5 h-5" />,
      action: 'Setup Alerts',
      priority: 'high',
      estimatedTime: '8 min'
    }
  ]
  
  const resources = [
    {
      id: 'documentation',
      title: 'User Documentation',
      description: 'Complete guides and tutorials',
      icon: <BookOpen className="w-5 h-5" />,
      link: '/docs',
      type: 'internal'
    },
    {
      id: 'webinar',
      title: 'Weekly Training Webinar',
      description: 'Join our next live training session',
      icon: <Calendar className="w-5 h-5" />,
      link: '/webinars',
      type: 'internal',
      badge: 'This Thursday 2PM ET'
    },
    {
      id: 'community',
      title: 'User Community',
      description: 'Connect with other government contractors',
      icon: <MessageCircle className="w-5 h-5" />,
      link: '/community',
      type: 'internal'
    },
    {
      id: 'support',
      title: 'Support Center',
      description: 'Get help when you need it',
      icon: <HelpCircle className="w-5 h-5" />,
      link: '/support',
      type: 'internal'
    }
  ]
  
  const improvementOptions = [
    'More detailed tutorials',
    'Better navigation',
    'More customization options',
    'Clearer instructions',
    'Additional examples',
    'Faster loading times'
  ]
  
  const handleRating = (rating: number) => {
    const updated = { ...feedback, rating }
    setFeedback(updated)
    onUpdate(updated)
  }
  
  const handleImprovementToggle = (improvement: string) => {
    const updated = {
      ...feedback,
      improvements: feedback.improvements.includes(improvement)
        ? feedback.improvements.filter((i: string) => i !== improvement)
        : [...feedback.improvements, improvement]
    }
    setFeedback(updated)
    onUpdate(updated)
  }
  
  const handleCommentsChange = (comments: string) => {
    const updated = { ...feedback, comments }
    setFeedback(updated)
    onUpdate(updated)
  }
  
  const handleRecommendation = (wouldRecommend: boolean) => {
    const updated = { ...feedback, wouldRecommend }
    setFeedback(updated)
    onUpdate(updated)
  }
  
  const submitFeedback = async () => {
    try {
      await fetch('/api/onboarding/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepId: 'completion',
          rating: feedback.rating,
          comments: feedback.comments,
          suggestions: feedback.improvements.join(', '),
          difficulty: 'just-right',
          clarity: 'clear',
          usefulness: 'very-useful'
        })
      })
    } catch (error) {
      console.error('Failed to submit feedback:', error)
    }
  }
  
  const handleComplete = async () => {
    await submitFeedback()
    onNext()
  }
  
  return (
    <div className="space-y-6">
      {/* Celebration Header */}
      <div className="text-center space-y-4">
        <div className="w-20 h-20 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center mx-auto">
          <Rocket className="w-10 h-10 text-white" />
        </div>
        
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            🎉 Congratulations!
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            You&apos;ve successfully completed the GovBiz.ai onboarding
          </p>
        </div>
        
        <div className="flex items-center justify-center space-x-4">
          <Badge variant="secondary" className="flex items-center space-x-1">
            <CheckCircle className="w-3 h-3" />
            <span>Setup Complete</span>
          </Badge>
          <Badge variant="outline" className="flex items-center space-x-1">
            <Gift className="w-3 h-3" />
            <span>Ready to Use</span>
          </Badge>
        </div>
      </div>
      
      {/* Achievements */}
      <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Star className="w-5 h-5 text-green-600" />
            <span>Your Achievements</span>
          </CardTitle>
          <CardDescription>
            You&apos;ve completed all the essential setup steps
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {achievements.map((achievement) => (
              <div key={achievement.id} className="flex items-center space-x-3 p-3 bg-white dark:bg-gray-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{achievement.title}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{achievement.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Continue Button */}
      <div className="text-center pt-6">
        <Button
          onClick={handleComplete}
          size="lg"
          className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white px-12 py-4 text-lg"
        >
          <span>Start Using GovBiz.ai</span>
          <ArrowRight className="w-6 h-6 ml-2" />
        </Button>
        
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
          Ready to transform your government contracting process?
        </p>
      </div>
    </div>
  )
}

export { CompletionStep }
export default CompletionStep