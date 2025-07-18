'use client'

import { useState } from 'react'
import { 
  Code, 
  FileText, 
  BarChart3, 
  FormInput,
  Copy,
  Download,
  Edit,
  Eye,
  Share,
  MoreHorizontal,
  ExternalLink,
  Save,
  Printer
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ArtifactProps {
  id: string
  type: 'code' | 'document' | 'chart' | 'form'
  title: string
  content: string
  language?: string
  metadata?: Record<string, any>
  className?: string
}

interface CodeArtifactProps extends ArtifactProps {
  type: 'code'
  language: string
}

interface DocumentArtifactProps extends ArtifactProps {
  type: 'document'
  documentType?: 'contract' | 'proposal' | 'policy' | 'report'
}

interface ChartArtifactProps extends ArtifactProps {
  type: 'chart'
  chartType?: 'bar' | 'line' | 'pie' | 'table'
  data?: any[]
}

interface FormArtifactProps extends ArtifactProps {
  type: 'form'
  fields?: Array<{
    name: string
    type: string
    label: string
    required?: boolean
    options?: string[]
  }>
}

type ArtifactVariant = CodeArtifactProps | DocumentArtifactProps | ChartArtifactProps | FormArtifactProps

const getArtifactIcon = (type: string) => {
  switch (type) {
    case 'code':
      return Code
    case 'document':
      return FileText
    case 'chart':
      return BarChart3
    case 'form':
      return FormInput
    default:
      return FileText
  }
}

const getLanguageColors = (language: string) => {
  const colors: Record<string, string> = {
    javascript: 'bg-yellow-100 text-yellow-800',
    typescript: 'bg-blue-100 text-blue-800',
    python: 'bg-green-100 text-green-800',
    java: 'bg-orange-100 text-orange-800',
    csharp: 'bg-purple-100 text-purple-800',
    html: 'bg-red-100 text-red-800',
    css: 'bg-blue-100 text-blue-800',
    sql: 'bg-gray-100 text-gray-800',
    json: 'bg-gray-100 text-gray-800',
    yaml: 'bg-gray-100 text-gray-800',
    markdown: 'bg-gray-100 text-gray-800'
  }
  return colors[language.toLowerCase()] || 'bg-gray-100 text-gray-800'
}

export const Artifact: React.FC<ArtifactVariant> = (props) => {
  const [activeTab, setActiveTab] = useState('preview')
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleDownload = () => {
    const element = document.createElement('a')
    const file = new Blob([props.content], { type: 'text/plain' })
    element.href = URL.createObjectURL(file)
    element.download = `${props.title.replace(/\s+/g, '_')}.txt`
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const ArtifactIcon = getArtifactIcon(props.type)

  const renderCodeArtifact = (artifact: CodeArtifactProps) => (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 sm:gap-2">
          <Badge className={getLanguageColors(artifact.language)}>
            {artifact.language}
          </Badge>
          <span className="text-xs sm:text-sm text-gray-500">
            {artifact.content.split('\n').length} lines
          </span>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>
        
        <TabsContent value="preview" className="mt-3 sm:mt-4">
          <pre className="bg-gray-900 text-gray-100 p-2 sm:p-4 rounded-lg overflow-x-auto text-xs sm:text-sm">
            <code>{artifact.content}</code>
          </pre>
        </TabsContent>
        
        <TabsContent value="raw" className="mt-3 sm:mt-4">
          <textarea
            value={artifact.content}
            readOnly
            className="w-full h-48 sm:h-64 p-2 sm:p-3 border border-gray-300 rounded-lg font-mono text-xs sm:text-sm resize-none"
          />
        </TabsContent>
      </Tabs>
    </div>
  )

  const renderDocumentArtifact = (artifact: DocumentArtifactProps) => (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 sm:gap-2">
          {artifact.documentType && (
            <Badge variant="outline" className="text-xs">
              {artifact.documentType}
            </Badge>
          )}
          <span className="text-xs sm:text-sm text-gray-500">
            {artifact.content.split(' ').length} words
          </span>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="raw">Raw</TabsTrigger>
        </TabsList>
        
        <TabsContent value="preview" className="mt-3 sm:mt-4">
          <div className="bg-white p-3 sm:p-6 border border-gray-200 rounded-lg min-h-48 sm:min-h-64">
            <div className="prose prose-xs sm:prose-sm max-w-none">
              {artifact.content.split('\n').map((paragraph, index) => (
                <p key={index} className="mb-2 sm:mb-4">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="raw" className="mt-3 sm:mt-4">
          <textarea
            value={artifact.content}
            readOnly
            className="w-full h-48 sm:h-64 p-2 sm:p-3 border border-gray-300 rounded-lg text-xs sm:text-sm resize-none"
          />
        </TabsContent>
      </Tabs>
    </div>
  )

  const renderChartArtifact = (artifact: ChartArtifactProps) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {artifact.chartType && (
            <Badge variant="outline">
              {artifact.chartType} chart
            </Badge>
          )}
          {artifact.data && (
            <span className="text-sm text-gray-500">
              {artifact.data.length} data points
            </span>
          )}
        </div>
      </div>
      
      <div className="bg-white p-3 sm:p-6 border border-gray-200 rounded-lg min-h-48 sm:min-h-64 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <BarChart3 className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4" />
          <p className="text-sm sm:text-base">Chart visualization would be rendered here</p>
          <p className="text-xs sm:text-sm mt-1 sm:mt-2">Using D3.js, Chart.js, or similar library</p>
        </div>
      </div>
      
      {artifact.data && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">View Data</summary>
          <pre className="mt-2 bg-gray-50 p-3 rounded text-xs overflow-x-auto">
            {JSON.stringify(artifact.data, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )

  const renderFormArtifact = (artifact: FormArtifactProps) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Form</Badge>
          {artifact.fields && (
            <span className="text-sm text-gray-500">
              {artifact.fields.length} fields
            </span>
          )}
        </div>
      </div>
      
      <div className="bg-white p-3 sm:p-6 border border-gray-200 rounded-lg">
        {artifact.fields ? (
          <form className="space-y-3 sm:space-y-4">
            {artifact.fields.map((field, index) => (
              <div key={index}>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {field.type === 'select' && field.options ? (
                  <select className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-md text-sm">
                    <option value="">Select an option</option>
                    {field.options.map((option, optIndex) => (
                      <option key={optIndex} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-md text-sm"
                    rows={3}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                  />
                ) : (
                  <input
                    type={field.type}
                    className="w-full p-1.5 sm:p-2 border border-gray-300 rounded-md text-sm"
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                  />
                )}
              </div>
            ))}
          </form>
        ) : (
          <div className="text-center text-gray-500">
            <FormInput className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4" />
            <p className="text-sm sm:text-base">Form structure would be rendered here</p>
          </div>
        )}
      </div>
    </div>
  )

  const renderContent = () => {
    switch (props.type) {
      case 'code':
        return renderCodeArtifact(props as CodeArtifactProps)
      case 'document':
        return renderDocumentArtifact(props as DocumentArtifactProps)
      case 'chart':
        return renderChartArtifact(props as ChartArtifactProps)
      case 'form':
        return renderFormArtifact(props as FormArtifactProps)
      default:
        return <div>Unsupported artifact type</div>
    }
  }

  return (
    <TooltipProvider>
      <Card className={`w-full ${props.className}`}>
        <CardHeader className="pb-3 sm:pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <ArtifactIcon className="h-3 w-3 sm:h-4 sm:w-4 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-sm sm:text-base text-gray-900">{props.title}</h3>
                <p className="text-xs sm:text-sm text-gray-500 capitalize">{props.type} artifact</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1 sm:gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={handleCopy} className="p-1 sm:p-2">
                    <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {copied ? 'Copied!' : 'Copy content'}
                </TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={handleDownload} className="p-1 sm:p-2">
                    <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Download
                </TooltipContent>
              </Tooltip>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-1 sm:p-2">
                    <MoreHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Share className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open in new tab
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Save className="mr-2 h-4 w-4" />
                    Save to project
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {renderContent()}
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}

export default Artifact