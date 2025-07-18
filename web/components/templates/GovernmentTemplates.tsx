'use client'

import { useState } from 'react'
import { 
  FileText, 
  FileCheck, 
  PenTool, 
  Calendar, 
  DollarSign,
  Scale,
  Building,
  Users,
  ClipboardList,
  Search,
  Filter,
  Star,
  Clock,
  User,
  ArrowRight,
  ExternalLink
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface Template {
  id: string
  name: string
  description: string
  category: 'contract' | 'policy' | 'proposal' | 'meeting' | 'budget' | 'compliance'
  icon: React.ComponentType<any>
  usageCount: number
  lastUsed?: Date
  estimatedTime: string
  complexity: 'beginner' | 'intermediate' | 'advanced'
  tags: string[]
  featured?: boolean
  author: string
  rating: number
  prompt: string
}

const governmentTemplates: Template[] = [
  {
    id: 'contract-analysis',
    name: 'Contract Analysis',
    description: 'Comprehensive analysis of government contracts including terms, conditions, and compliance requirements',
    category: 'contract',
    icon: FileText,
    usageCount: 247,
    lastUsed: new Date(Date.now() - 3600000),
    estimatedTime: '5-10 minutes',
    complexity: 'intermediate',
    tags: ['analysis', 'compliance', 'terms', 'conditions'],
    featured: true,
    author: 'GovBiz.AI Team',
    rating: 4.8,
    prompt: `Analyze this government contract and provide:

1. **Executive Summary**
   - Contract type and purpose
   - Key parties involved
   - Contract value and duration

2. **Critical Terms Analysis**
   - Payment terms and schedule
   - Performance requirements
   - Deliverables and milestones
   - Compliance obligations

3. **Risk Assessment**
   - Potential risks and mitigation strategies
   - Penalty clauses and consequences
   - Insurance and bonding requirements

4. **Recommendations**
   - Areas needing clarification
   - Negotiation opportunities
   - Implementation considerations

Please upload the contract document to begin analysis.`
  },
  {
    id: 'policy-review',
    name: 'Policy & Regulation Review',
    description: 'Review federal policies and regulations for compliance and impact assessment',
    category: 'policy',
    icon: FileCheck,
    usageCount: 189,
    lastUsed: new Date(Date.now() - 7200000),
    estimatedTime: '10-15 minutes',
    complexity: 'advanced',
    tags: ['policy', 'regulation', 'compliance', 'impact'],
    featured: true,
    author: 'Compliance Team',
    rating: 4.6,
    prompt: `Review this policy/regulation document and provide:

1. **Policy Overview**
   - Purpose and scope
   - Effective date and applicability
   - Key regulatory authority

2. **Compliance Requirements**
   - Mandatory actions and timelines
   - Reporting obligations
   - Certification requirements

3. **Impact Analysis**
   - Operational impact on organization
   - Cost implications
   - Resource requirements

4. **Implementation Roadmap**
   - Priority actions
   - Timeline recommendations
   - Responsible parties

Please provide the policy document or regulation number for analysis.`
  },
  {
    id: 'proposal-generation',
    name: 'RFP Response Generation',
    description: 'Generate comprehensive responses to government RFPs and Sources Sought notices',
    category: 'proposal',
    icon: PenTool,
    usageCount: 412,
    lastUsed: new Date(Date.now() - 1800000),
    estimatedTime: '15-30 minutes',
    complexity: 'advanced',
    tags: ['rfp', 'proposal', 'response', 'sources sought'],
    featured: true,
    author: 'Proposal Team',
    rating: 4.9,
    prompt: `Generate a professional RFP response with:

1. **Executive Summary**
   - Understanding of requirements
   - Value proposition
   - Key differentiators

2. **Technical Approach**
   - Methodology and solution
   - Project timeline
   - Risk mitigation strategies

3. **Company Qualifications**
   - Relevant experience
   - Past performance
   - Team qualifications
   - Certifications and clearances

4. **Management Plan**
   - Project organization
   - Communication protocols
   - Quality assurance

Please provide the RFP document or requirements to begin response generation.`
  },
  {
    id: 'meeting-minutes',
    name: 'Government Meeting Minutes',
    description: 'Automated transcription and comprehensive meeting minutes for government sessions',
    category: 'meeting',
    icon: Calendar,
    usageCount: 156,
    lastUsed: new Date(Date.now() - 86400000),
    estimatedTime: '3-5 minutes',
    complexity: 'beginner',
    tags: ['meetings', 'minutes', 'transcription', 'action items'],
    author: 'Administrative Team',
    rating: 4.4,
    prompt: `Create professional meeting minutes including:

1. **Meeting Header**
   - Date, time, and location
   - Attendees and roles
   - Meeting purpose

2. **Discussion Summary**
   - Key topics covered
   - Decisions made
   - Action items assigned

3. **Follow-up Actions**
   - Responsible parties
   - Deadlines
   - Next meeting date

Please provide meeting transcript or notes to generate formal minutes.`
  },
  {
    id: 'budget-analysis',
    name: 'Federal Budget Analysis',
    description: 'Analyze federal budgets, appropriations, and financial allocations',
    category: 'budget',
    icon: DollarSign,
    usageCount: 93,
    lastUsed: new Date(Date.now() - 172800000),
    estimatedTime: '10-20 minutes',
    complexity: 'advanced',
    tags: ['budget', 'financial', 'appropriations', 'analysis'],
    author: 'Financial Team',
    rating: 4.3,
    prompt: `Analyze the budget document and provide:

1. **Budget Overview**
   - Total allocations by category
   - Year-over-year changes
   - Key funding priorities

2. **Line Item Analysis**
   - Detailed breakdowns
   - Variance analysis
   - Trend identification

3. **Opportunity Assessment**
   - Potential contract opportunities
   - Funding availability
   - Timeline considerations

4. **Strategic Recommendations**
   - Areas of focus
   - Partnership opportunities
   - Risk considerations

Please upload the budget document or provide budget details.`
  },
  {
    id: 'compliance-audit',
    name: 'Compliance Audit Checklist',
    description: 'Generate comprehensive compliance audit checklists for various government standards',
    category: 'compliance',
    icon: ClipboardList,
    usageCount: 134,
    lastUsed: new Date(Date.now() - 259200000),
    estimatedTime: '8-12 minutes',
    complexity: 'intermediate',
    tags: ['compliance', 'audit', 'checklist', 'standards'],
    author: 'Audit Team',
    rating: 4.5,
    prompt: `Create a compliance audit checklist covering:

1. **Regulatory Framework**
   - Applicable regulations
   - Compliance standards
   - Reporting requirements

2. **Audit Areas**
   - Documentation review
   - Process verification
   - Personnel qualifications

3. **Checklist Items**
   - Required documents
   - Verification steps
   - Compliance criteria

4. **Reporting Structure**
   - Finding categories
   - Corrective actions
   - Timeline requirements

Please specify the compliance standard or regulation for customized checklist.`
  }
]

const categories = [
  { value: 'all', label: 'All Templates', count: governmentTemplates.length },
  { value: 'contract', label: 'Contract Analysis', count: governmentTemplates.filter(t => t.category === 'contract').length },
  { value: 'policy', label: 'Policy Review', count: governmentTemplates.filter(t => t.category === 'policy').length },
  { value: 'proposal', label: 'Proposal Generation', count: governmentTemplates.filter(t => t.category === 'proposal').length },
  { value: 'meeting', label: 'Meeting Support', count: governmentTemplates.filter(t => t.category === 'meeting').length },
  { value: 'budget', label: 'Budget Analysis', count: governmentTemplates.filter(t => t.category === 'budget').length },
  { value: 'compliance', label: 'Compliance', count: governmentTemplates.filter(t => t.category === 'compliance').length }
]

interface GovernmentTemplatesProps {
  onTemplateSelect?: (template: Template) => void
  showFeaturedOnly?: boolean
  maxDisplayed?: number
}

export const GovernmentTemplates: React.FC<GovernmentTemplatesProps> = ({
  onTemplateSelect,
  showFeaturedOnly = false,
  maxDisplayed
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [sortBy, setSortBy] = useState('popular')
  const [activeTab, setActiveTab] = useState('browse')

  const filteredTemplates = governmentTemplates
    .filter(template => {
      if (showFeaturedOnly && !template.featured) return false
      if (selectedCategory !== 'all' && template.category !== selectedCategory) return false
      if (searchQuery) {
        return template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
               template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
               template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      }
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return b.usageCount - a.usageCount
        case 'recent':
          return (b.lastUsed?.getTime() || 0) - (a.lastUsed?.getTime() || 0)
        case 'rating':
          return b.rating - a.rating
        case 'name':
          return a.name.localeCompare(b.name)
        default:
          return 0
      }
    })
    .slice(0, maxDisplayed)

  const featuredTemplates = governmentTemplates.filter(t => t.featured)

  const TemplateCard = ({ template }: { template: Template }) => {
    const IconComponent = template.icon

    return (
      <Card className="group cursor-pointer transition-all hover:shadow-lg hover:border-blue-300">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <IconComponent className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg font-medium">{template.name}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      template.complexity === 'beginner' ? 'border-green-300 text-green-700' :
                      template.complexity === 'intermediate' ? 'border-orange-300 text-orange-700' :
                      'border-red-300 text-red-700'
                    }`}
                  >
                    {template.complexity}
                  </Badge>
                  <span className="text-xs text-gray-500">{template.estimatedTime}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {template.featured && (
                <Tooltip>
                  <TooltipTrigger>
                    <Star className="h-4 w-4 text-yellow-500 fill-current" />
                  </TooltipTrigger>
                  <TooltipContent>Featured template</TooltipContent>
                </Tooltip>
              )}
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 text-yellow-500 fill-current" />
                <span className="text-xs text-gray-600">{template.rating}</span>
              </div>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <p className="text-sm text-gray-600 mb-4 line-clamp-2">{template.description}</p>
          
          <div className="flex flex-wrap gap-1 mb-4">
            {template.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {template.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{template.tags.length - 3} more
              </Badge>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>{template.usageCount}</span>
              </div>
              {template.lastUsed && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{new Date(template.lastUsed).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            
            <Button
              size="sm"
              onClick={() => onTemplateSelect?.(template)}
              className="bg-blue-800 hover:bg-blue-900"
            >
              Use Template
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (showFeaturedOnly) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Featured Templates</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {featuredTemplates.slice(0, maxDisplayed || 4).map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-gray-900">Government Templates</h2>
          <Badge variant="outline" className="text-sm">
            {filteredTemplates.length} templates
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="browse">Browse</TabsTrigger>
            <TabsTrigger value="featured">Featured</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-6">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      <div className="flex items-center justify-between w-full">
                        <span>{category.label}</span>
                        <Badge variant="secondary" className="ml-2">
                          {category.count}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">Most Popular</SelectItem>
                  <SelectItem value="recent">Recently Used</SelectItem>
                  <SelectItem value="rating">Highest Rated</SelectItem>
                  <SelectItem value="name">Alphabetical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Templates Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>

            {filteredTemplates.length === 0 && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
                <p className="text-gray-600">
                  Try adjusting your search criteria or browse all templates.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="featured" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {featuredTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  )
}

export default GovernmentTemplates