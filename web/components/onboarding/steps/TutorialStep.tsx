'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Play, 
  CheckCircle, 
  ArrowRight,
  BookOpen,
  Target,
  Clock
} from 'lucide-react'
import { OnboardingStep } from '@/types'

interface TutorialStepProps {
  step: OnboardingStep
  data: any
  onUpdate: (data: any) => void
  onNext: () => void
}

interface Tutorial {
  id: string
  title: string
  description: string
  estimatedTime: number
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
  completed: boolean
}

function TutorialStep({ step, data, onUpdate, onNext }: TutorialStepProps) {
  const [completedTutorials, setCompletedTutorials] = useState<string[]>(data.completedTutorials || [])
  
  const tutorials: Tutorial[] = [
    {
      id: 'sources-sought-basics',
      title: 'Sources Sought Basics',
      description: 'Learn the fundamentals of finding and analyzing Sources Sought opportunities',
      estimatedTime: 15,
      difficulty: 'easy',
      category: 'Core',
      completed: completedTutorials.includes('sources-sought-basics')
    },
    {
      id: 'ai-response-generation',
      title: 'AI Response Generation',
      description: 'Master the art of creating compelling responses using our AI assistant',
      estimatedTime: 20,
      difficulty: 'medium',
      category: 'Core',
      completed: completedTutorials.includes('ai-response-generation')
    },
    {
      id: 'relationship-management',
      title: 'Relationship Management',
      description: 'Build and maintain valuable government contacts through the platform',
      estimatedTime: 12,
      difficulty: 'easy',
      category: 'Networking',
      completed: completedTutorials.includes('relationship-management')
    }
  ]
  
  const startTutorial = (tutorialId: string) => {
    console.log('Starting tutorial:', tutorialId)
    // In a real app, this would navigate to the tutorial
  }
  
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
      case 'hard': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center mx-auto">
          <BookOpen className="w-8 h-8 text-white" />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Interactive Tutorials
        </h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Get hands-on experience with our guided tutorials. Learn at your own pace and practice with real scenarios.
        </p>
      </div>
      
      {/* Progress Summary */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-blue-900 dark:text-blue-100">
                Your Progress
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {completedTutorials.length} of {tutorials.length} tutorials completed
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {Math.round((completedTutorials.length / tutorials.length) * 100)}%
              </div>
              <div className="text-sm text-blue-600">Complete</div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Tutorials Grid */}
      <div className="grid gap-6">
        {tutorials.map((tutorial) => {
          const isCompleted = tutorial.completed
          
          return (
            <Card key={tutorial.id} className={`transition-all hover:shadow-md ${
              isCompleted ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : ''
            }`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <Target className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {tutorial.title}
                      </h3>
                      <Badge className={getDifficultyColor(tutorial.difficulty)}>
                        {tutorial.difficulty}
                      </Badge>
                    </div>
                    
                    <p className="text-gray-600 dark:text-gray-400 mb-3">
                      {tutorial.description}
                    </p>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-4 h-4" />
                        <span>{tutorial.estimatedTime} min</span>
                      </div>
                      <Badge variant="outline">{tutorial.category}</Badge>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center space-y-2">
                    {isCompleted ? (
                      <div className="flex items-center space-x-1 text-green-600">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">Completed</span>
                      </div>
                    ) : (
                      <Button
                        onClick={() => startTutorial(tutorial.id)}
                        size="sm"
                        variant="outline"
                        className="flex items-center space-x-1"
                      >
                        <Play className="w-4 h-4" />
                        <span>Start</span>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      
      {/* Continue Button */}
      <div className="text-center pt-6">
        <Button
          onClick={onNext}
          size="lg"
          className="bg-green-600 hover:bg-green-700 text-white px-8 py-3"
        >
          <span>
            {completedTutorials.length > 0 ? 'Continue with Setup' : 'Skip Tutorials for Now'}
          </span>
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
        
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          {completedTutorials.length > 0 
            ? `Great progress! You've completed ${completedTutorials.length} tutorials.`
            : 'You can always access tutorials later from the help menu.'
          }
        </p>
      </div>
    </div>
  )
}

export { TutorialStep }
export default TutorialStep