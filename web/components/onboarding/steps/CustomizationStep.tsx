'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Palette, 
  Layout, 
  Bell, 
  Zap, 
  Monitor,
  Sun,
  Moon,
  Smartphone,
  CheckCircle,
  Settings,
  ArrowRight,
  Mail,
  MessageSquare,
  Gauge,
  BarChart3,
  List,
  Calendar,
  Search,
  Plus,
  Keyboard
} from 'lucide-react'
import { OnboardingStep } from '@/types'

interface CustomizationStepProps {
  step: OnboardingStep
  data: any
  onUpdate: (data: any) => void
  onNext: () => void
}

function CustomizationStep({ step, data, onUpdate, onNext }: CustomizationStepProps) {
  const [customization, setCustomization] = useState({
    theme: data.theme || 'auto',
    colorScheme: data.colorScheme || 'government',
    layout: data.layout || 'comfortable',
    notifications: data.notifications || {
      email: { opportunities: true, updates: true, reminders: true },
      inApp: { opportunities: true, system: true, updates: true },
      push: { opportunities: false, urgent: true }
    },
    widgets: data.widgets || [
      { id: 'opportunities', enabled: true },
      { id: 'pipeline', enabled: true },
      { id: 'calendar', enabled: false },
      { id: 'metrics', enabled: true }
    ],
    quickActions: data.quickActions || [
      { id: 'search', enabled: true },
      { id: 'new-response', enabled: true },
      { id: 'contacts', enabled: false }
    ]
  })
  
  const [activeSection, setActiveSection] = useState<string>('theme')
  
  const updateCustomization = (section: string, value: any) => {
    const updated = { ...customization, [section]: value }
    setCustomization(updated)
    onUpdate(updated)
  }
  
  const themes = [
    { id: 'light', label: 'Light', icon: <Sun className="w-5 h-5" />, description: 'Clean, bright interface' },
    { id: 'dark', label: 'Dark', icon: <Moon className="w-5 h-5" />, description: 'Easy on the eyes' },
    { id: 'auto', label: 'Auto', icon: <Monitor className="w-5 h-5" />, description: 'Matches system preference' }
  ]
  
  const sections = [
    { id: 'theme', label: 'Theme & Appearance', icon: <Palette className="w-5 h-5" /> },
    { id: 'layout', label: 'Layout & Spacing', icon: <Layout className="w-5 h-5" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-5 h-5" /> },
    { id: 'widgets', label: 'Dashboard Widgets', icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'quickActions', label: 'Quick Actions', icon: <Zap className="w-5 h-5" /> }
  ]
  
  const renderThemeSection = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Theme Preference</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {themes.map((theme) => (
            <div
              key={theme.id}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                customization.theme === theme.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              onClick={() => updateCustomization('theme', theme.id)}
            >
              <div className="flex items-center space-x-3">
                <div className="text-blue-600 dark:text-blue-400">
                  {theme.icon}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{theme.label}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{theme.description}</p>
                </div>
                {customization.theme === theme.id && (
                  <CheckCircle className="w-5 h-5 text-blue-600 ml-auto" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
  
  const renderActiveSection = () => {
    switch (activeSection) {
      case 'theme':
        return renderThemeSection()
      default:
        return renderThemeSection()
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Section Navigation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-blue-600" />
            <span>Customize Your Experience</span>
          </CardTitle>
          <CardDescription>
            Configure GovBiz.ai to match your preferences and workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                  activeSection === section.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {section.icon}
                <span>{section.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Active Section Content */}
      <Card>
        <CardContent className="pt-6">
          {renderActiveSection()}
        </CardContent>
      </Card>
      
      {/* Continue Button */}
      <div className="text-center pt-4">
        <Button
          onClick={onNext}
          size="lg"
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
        >
          <span>Save Customization</span>
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
        
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          You can change these settings anytime in preferences
        </p>
      </div>
    </div>
  )
}

export { CustomizationStep }
export default CustomizationStep