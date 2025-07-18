'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  CheckCircle, 
  Clock, 
  Star, 
  ArrowRight, 
  PlayCircle,
  Users,
  Target,
  Zap
} from 'lucide-react'
import { OnboardingStep } from '@/types'

interface WelcomeStepProps {
  step: OnboardingStep
  data: any
  onUpdate: (data: any) => void
  onNext: () => void
}

function WelcomeStep({ step, data, onUpdate, onNext }: WelcomeStepProps) {
  const [hasWatched, setHasWatched] = useState(data.hasWatchedIntro || false)

  const benefits = [
    {
      icon: <Target className="w-6 h-6 text-blue-600" />,
      title: "Find Opportunities Faster",
      description: "Automatically discover relevant Sources Sought notices that match your business capabilities"
    },
    {
      icon: <CheckCircle className="w-6 h-6 text-green-600" />,
      title: "Generate Winning Responses",
      description: "Create compelling, compliant responses using AI-powered templates and guidance"
    },
    {
      icon: <Users className="w-6 h-6 text-purple-600" />,
      title: "Build Government Relationships",
      description: "Track contacts, manage communications, and nurture long-term partnerships"
    }
  ]

  const stats = [
    { label: "Average Time Saved", value: "15+ hours/month", icon: <Clock className="w-5 h-5" /> },
    { label: "Response Quality", value: "40% improvement", icon: <Star className="w-5 h-5" /> },
    { label: "Win Rate Increase", value: "25% higher", icon: <CheckCircle className="w-5 h-5" /> }
  ]

  const handleWatchIntro = () => {
    setHasWatched(true)
    onUpdate({ hasWatchedIntro: true })
  }

  const handleContinue = () => {
    onNext()
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-2xl">GB</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Welcome to GovBiz.ai
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Transform your government contracting process with AI-powered automation and intelligence
        </p>
      </div>

      {/* Introduction Video */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <PlayCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Quick Introduction Video
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Learn how GovBiz.ai can transform your business (3 minutes)
                </p>
              </div>
            </div>
            <Button
              onClick={handleWatchIntro}
              className={hasWatched ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {hasWatched ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Watched
                </>
              ) : (
                <>
                  <PlayCircle className="w-4 h-4 mr-2" />
                  Watch Now
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Benefits Grid */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          What You&apos;ll Accomplish
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {benefits.map((benefit, index) => (
            <Card key={index} className="text-center hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex justify-center mb-4">
                  {benefit.icon}
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  {benefit.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {benefit.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Success Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center">Proven Results</CardTitle>
          <CardDescription className="text-center">
            See what our users have achieved with GovBiz.ai
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="flex justify-center mb-2 text-blue-600">
                  {stat.icon}
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Setup Expectations */}
      <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-green-600" />
            <span>What to Expect</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                1
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Setup Your Profile</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Tell us about your business and what types of contracts you&apos;re interested in
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                2
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Explore Capabilities</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  See what GovBiz.ai can do and choose the features most relevant to your needs
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                3
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Interactive Tutorials</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Learn hands-on with guided tutorials tailored to your selected capabilities
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                4
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Customize Experience</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Personalize your dashboard and workflows to match how you work
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Support Information */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Need Help Along the Way?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Our support team is here to help you succeed. You can reach us anytime during setup.
            </p>
            <div className="flex justify-center space-x-4">
              <Badge variant="outline" className="flex items-center space-x-1">
                <span>📧</span>
                <span>support@govbiz.ai</span>
              </Badge>
              <Badge variant="outline" className="flex items-center space-x-1">
                <span>💬</span>
                <span>Live Chat</span>
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Continue Button */}
      <div className="text-center pt-6">
        <Button
          onClick={handleContinue}
          size="lg"
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
        >
          <span>Let&apos;s Get Started</span>
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
        
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
          Estimated setup time: 10-15 minutes
        </p>
      </div>
    </div>
  )
}

export { WelcomeStep }
export default WelcomeStep