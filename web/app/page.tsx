'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Loader2, Bot, Shield, Zap, Brain, Users, Building2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

import { ChatInterface } from '@/components/chat/ChatInterface'

export default function HomePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // If user is authenticated, show the chat interface
  if (status === 'authenticated' && session) {
    return <ChatInterface />
  }

  // If still loading, show loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-lg">Loading...</span>
        </div>
      </div>
    )
  }

  // If not authenticated, show landing page
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-8 w-8 text-blue-500" />
              <span className="text-2xl font-bold text-white">GovBiz.AI</span>
              <Badge variant="secondary" className="ml-2">
                Beta
              </Badge>
            </div>
            <Button
              onClick={() => signIn('google')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Sign In with Google
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-white mb-6">
            Government Contracting
            <span className="text-blue-400 block">Intelligence Platform</span>
          </h1>
          <p className="text-xl text-slate-300 mb-8 max-w-3xl mx-auto">
            Advanced AI-powered platform for government contracting opportunities, 
            sources sought automation, and intelligent proposal generation.
          </p>
          <Button
            onClick={() => signIn('google')}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-4"
          >
            Get Started with Claude-like AI
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Brain className="h-5 w-5 text-blue-400" />
                Claude-like AI Chat
              </CardTitle>
              <CardDescription className="text-slate-300">
                Sophisticated AI interface with 200K+ token context management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• Real-time streaming responses</li>
                <li>• Intelligent context compression</li>
                <li>• Advanced slash commands</li>
                <li>• Multi-model support</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Shield className="h-5 w-5 text-green-400" />
                Sources Sought Automation
              </CardTitle>
              <CardDescription className="text-slate-300">
                Automated discovery and response generation for government RFIs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• SAM.gov monitoring</li>
                <li>• Automated response generation</li>
                <li>• Compliance checking</li>
                <li>• Relationship tracking</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Zap className="h-5 w-5 text-yellow-400" />
                Government-Grade Security
              </CardTitle>
              <CardDescription className="text-slate-300">
                Enterprise security with compliance and audit trails
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>• Multi-factor authentication</li>
                <li>• Role-based access control</li>
                <li>• Audit logging</li>
                <li>• Data classification</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Technical Features */}
        <div className="mb-16">
          <h2 className="text-4xl font-bold text-white text-center mb-8">
            Built on Advanced AI Technology
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Context Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Token Window</span>
                    <Badge variant="secondary">200K+</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Compression Strategies</span>
                    <Badge variant="secondary">4 Types</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Real-time Warnings</span>
                    <Badge variant="secondary">Proactive</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">AI Capabilities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-slate-300">
                  <div className="flex items-center justify-between">
                    <span>Models Supported</span>
                    <Badge variant="secondary">Claude 4</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Streaming Response</span>
                    <Badge variant="secondary">Real-time</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Command System</span>
                    <Badge variant="secondary">Advanced</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center bg-slate-800/50 rounded-lg p-12 border border-slate-700">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Transform Your Government Contracting?
          </h2>
          <p className="text-slate-300 mb-8 max-w-2xl mx-auto">
            Join the future of government contracting with our AI-powered platform. 
            Start automating your sources sought responses today.
          </p>
          <Button
            onClick={() => signIn('google')}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-4"
          >
            Get Started Now
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-6 w-6 text-blue-500" />
              <span className="text-lg font-semibold text-white">GovBiz.AI</span>
            </div>
            <div className="text-slate-400 text-sm">
              © 2024 GovBiz.AI. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}