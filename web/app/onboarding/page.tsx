import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import OnboardingFlow from '@/components/onboarding/OnboardingFlow'

export const metadata = {
  title: 'Onboarding - GovBiz.ai',
  description: 'Get started with GovBiz.ai government contracting automation platform'
}

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/api/auth/signin')
  }
  
  return (
    <div className="min-h-screen">
      <Suspense fallback={<OnboardingLoader />}>
        <OnboardingFlow />
      </Suspense>
    </div>
  )
}

function OnboardingLoader() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-xl animate-pulse">GB</span>
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          Loading Onboarding
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Preparing your personalized setup experience...
        </p>
        <div className="w-64 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse" 
            style={{ width: '65%' }} 
          />
        </div>
      </div>
    </div>
  )
}