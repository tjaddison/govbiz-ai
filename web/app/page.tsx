'use client'

import { useSession, signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Loader2, Bot, Shield, Zap, Brain } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ChatInterface } from '@/components/chat/ChatInterface'

export default function HomePage() {
  const { data: session, status } = useSession()
  const [loadingTimeout, setLoadingTimeout] = useState(false)

  // Add timeout for loading state
  useEffect(() => {
    const timer = setTimeout(() => {
      if (status === 'loading') {
        setLoadingTimeout(true)
      }
    }, 5000) // 5 seconds timeout

    return () => clearTimeout(timer)
  }, [status])

  // If user is authenticated, redirect to chat page
  if (status === 'authenticated' && session) {
    window.location.href = '/chat'
    return null
  }

  // If still loading and not timed out, show loading state
  if (status === 'loading' && !loadingTimeout) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
          <span className="text-lg text-gray-600">Loading...</span>
        </div>
      </div>
    )
  }

  // If loading timed out, show landing page with debug info
  if (loadingTimeout) {
    console.log('NextAuth loading timeout - showing landing page')
  }

  // If not authenticated, show landing page
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-gray-900">GovBiz.AI</span>
            </div>
            <Button
              onClick={() => signIn('google')}
              className="bg-gray-900 hover:bg-gray-800 text-white border-0 rounded-lg px-4 py-2 text-sm font-medium"
            >
              Sign in
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center pt-20 pb-16">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            AI for Government 
            <br />
            Contracting
          </h1>
          
          <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed">
            Automate Sources Sought responses, generate proposals, and build 
            winning relationships with AI-powered government contracting intelligence.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20">
            <Button
              onClick={() => signIn('google')}
              className="bg-orange-500 hover:bg-orange-600 text-white border-0 rounded-lg px-6 py-3 text-base font-medium"
            >
              Try GovBiz.AI
            </Button>
            <Button
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg px-6 py-3 text-base font-medium"
            >
              Learn more
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <div className="text-center">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Brain className="h-6 w-6 text-orange-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Claude-like AI Chat</h3>
            <p className="text-gray-600">
              Sophisticated AI interface with 200K+ token context management and real-time streaming.
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Shield className="h-6 w-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Sources Sought Automation</h3>
            <p className="text-gray-600">
              Automated discovery and response generation for government RFIs with compliance checking.
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Zap className="h-6 w-6 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Enterprise Security</h3>
            <p className="text-gray-600">
              Government-grade security with multi-factor authentication and audit trails.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="text-center mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-12">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 mt-1">
                  1
                </div>
                <div className="text-left">
                  <h4 className="font-semibold text-gray-900 mb-1">Monitor Sources Sought</h4>
                  <p className="text-gray-600">AI continuously monitors SAM.gov for new Sources Sought opportunities matching your capabilities.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 mt-1">
                  2
                </div>
                <div className="text-left">
                  <h4 className="font-semibold text-gray-900 mb-1">Generate Responses</h4>
                  <p className="text-gray-600">Smart AI generates tailored responses highlighting your strengths and past performance.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 mt-1">
                  3
                </div>
                <div className="text-left">
                  <h4 className="font-semibold text-gray-900 mb-1">Build Relationships</h4>
                  <p className="text-gray-600">Track government contacts and nurture relationships that lead to contract awards.</p>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-8 h-64 flex items-center justify-center">
              <div className="text-gray-400 text-center">
                <Bot className="h-16 w-16 mx-auto mb-4" />
                <p>Interactive demo coming soon</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center bg-gray-50 rounded-2xl p-12 mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to win more government contracts?
          </h2>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Join contractors using AI to automate Sources Sought responses and build winning relationships.
          </p>
          <Button
            onClick={() => signIn('google')}
            className="bg-orange-500 hover:bg-orange-600 text-white border-0 rounded-lg px-8 py-4 text-lg font-medium"
          >
            Get started for free
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-gray-900">GovBiz.AI</span>
            </div>
            <div className="text-gray-600 text-sm text-center md:text-right">
              <p>© 2024 GovBiz.AI. Transforming government contracting with AI.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}