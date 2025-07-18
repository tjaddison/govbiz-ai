'use client'

import { useState, useCallback } from 'react'
import { 
  Plus, 
  MessageSquare, 
  ChevronLeft, 
  ChevronRight,
  Search,
  Archive,
  FolderOpen,
  FileText,
  Clock,
  Star,
  Trash2,
  MoreHorizontal,
  Users,
  Shield,
  FileCheck,
  PenTool,
  Calendar
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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

interface SidebarProps {
  isCollapsed?: boolean
  onToggle?: () => void
  onNewChat?: () => void
  currentConversationId?: string
}

interface Conversation {
  id: string
  title: string
  timestamp: Date
  messageCount: number
  classification: 'UNCLASSIFIED' | 'OFFICIAL' | 'SENSITIVE'
  isStarred?: boolean
}

interface Project {
  id: string
  name: string
  description: string
  memberCount: number
  lastActivity: Date
  classification: 'UNCLASSIFIED' | 'OFFICIAL' | 'SENSITIVE'
}

interface Template {
  id: string
  name: string
  description: string
  category: 'contract' | 'policy' | 'proposal' | 'meeting' | 'budget'
  icon: typeof FileText
  usageCount: number
}

const mockConversations: Conversation[] = [
  {
    id: '1',
    title: 'Contract Analysis - DHS RFP',
    timestamp: new Date(Date.now() - 3600000),
    messageCount: 12,
    classification: 'OFFICIAL',
    isStarred: true
  },
  {
    id: '2',
    title: 'Sources Sought Response',
    timestamp: new Date(Date.now() - 7200000),
    messageCount: 8,
    classification: 'UNCLASSIFIED'
  },
  {
    id: '3',
    title: 'Budget Analysis Q3',
    timestamp: new Date(Date.now() - 86400000),
    messageCount: 15,
    classification: 'SENSITIVE'
  }
]

const mockProjects: Project[] = [
  {
    id: '1',
    name: 'Federal IT Modernization',
    description: 'GSA IT modernization initiative',
    memberCount: 5,
    lastActivity: new Date(Date.now() - 1800000),
    classification: 'OFFICIAL'
  },
  {
    id: '2',
    name: 'DOD Cybersecurity',
    description: 'Cybersecurity consulting project',
    memberCount: 3,
    lastActivity: new Date(Date.now() - 3600000),
    classification: 'SENSITIVE'
  }
]

const governmentTemplates: Template[] = [
  {
    id: '1',
    name: 'Contract Analysis',
    description: 'Analyze government contracts and identify key terms',
    category: 'contract',
    icon: FileText,
    usageCount: 24
  },
  {
    id: '2',
    name: 'Policy Review',
    description: 'Review and assess regulatory compliance',
    category: 'policy',
    icon: FileCheck,
    usageCount: 18
  },
  {
    id: '3',
    name: 'Proposal Generation',
    description: 'Generate RFP response templates',
    category: 'proposal',
    icon: PenTool,
    usageCount: 31
  },
  {
    id: '4',
    name: 'Meeting Minutes',
    description: 'Automated meeting transcription and summary',
    category: 'meeting',
    icon: Calendar,
    usageCount: 12
  }
]

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed = false,
  onToggle,
  onNewChat,
  currentConversationId
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [recentOpen, setRecentOpen] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date()
    const diff = now.getTime() - timestamp.getTime()
    
    if (diff < 3600000) { // Less than 1 hour
      return `${Math.floor(diff / 60000)}m ago`
    } else if (diff < 86400000) { // Less than 1 day
      return `${Math.floor(diff / 3600000)}h ago`
    } else {
      return timestamp.toLocaleDateString()
    }
  }

  const getClassificationBadge = (classification: string) => {
    const configs = {
      UNCLASSIFIED: { className: 'bg-green-100 text-green-700', text: 'U' },
      OFFICIAL: { className: 'bg-blue-100 text-blue-700', text: 'O' },
      SENSITIVE: { className: 'bg-orange-100 text-orange-700', text: 'S' }
    }
    
    const config = configs[classification as keyof typeof configs]
    return (
      <Badge className={`${config.className} text-xs w-5 h-5 p-0 flex items-center justify-center font-medium`}>
        {config.text}
      </Badge>
    )
  }

  const ConversationItem = ({ conversation }: { conversation: Conversation }) => (
    <div 
      className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
        ${currentConversationId === conversation.id 
          ? 'bg-blue-100 text-blue-800 border border-blue-200' 
          : 'hover:bg-gray-100'
        }`}
    >
      <MessageSquare className="h-4 w-4 flex-shrink-0 text-gray-400" />
      {!isCollapsed && (
        <>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium truncate">{conversation.title}</p>
              {conversation.isStarred && <Star className="h-3 w-3 text-yellow-500 fill-current" />}
              {getClassificationBadge(conversation.classification)}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{conversation.messageCount} messages</span>
              <span>•</span>
              <span>{formatTimestamp(conversation.timestamp)}</span>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Star className="mr-2 h-4 w-4" />
                {conversation.isStarred ? 'Unstar' : 'Star'}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  )

  const ProjectItem = ({ project }: { project: Project }) => (
    <div className="group flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-100">
      <FolderOpen className="h-4 w-4 flex-shrink-0 text-gray-400" />
      {!isCollapsed && (
        <>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium truncate">{project.name}</p>
              {getClassificationBadge(project.classification)}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Users className="h-3 w-3" />
              <span>{project.memberCount} members</span>
              <span>•</span>
              <span>{formatTimestamp(project.lastActivity)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )

  const TemplateItem = ({ template }: { template: Template }) => (
    <div className="group flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-100">
      <template.icon className="h-4 w-4 flex-shrink-0 text-gray-400" />
      {!isCollapsed && (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{template.name}</p>
            <p className="text-xs text-gray-500 truncate">{template.description}</p>
            <div className="flex items-center gap-1 mt-1">
              <Badge variant="secondary" className="text-xs">
                {template.usageCount} uses
              </Badge>
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <TooltipProvider>
      <div className={`${isCollapsed ? 'gov-sidebar-collapsed' : 'gov-sidebar'} flex flex-col h-full transition-all duration-300`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {!isCollapsed && (
              <Button
                onClick={onNewChat}
                className="flex-1 bg-blue-800 hover:bg-blue-900 text-white font-medium"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Chat
              </Button>
            )}
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggle}
                  className={isCollapsed ? 'w-full' : 'ml-2'}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Search */}
          {!isCollapsed && (
            <div className="mt-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-800 focus:border-blue-800"
                />
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 px-3 py-2">
          <div className="space-y-2">
            {/* Recent Conversations */}
            <Collapsible open={recentOpen} onOpenChange={setRecentOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 text-left">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  {!isCollapsed && (
                    <span className="text-sm font-medium text-gray-700">Recent</span>
                  )}
                </div>
                {!isCollapsed && recentOpen && <Badge variant="secondary">{mockConversations.length}</Badge>}
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 sm:space-y-1">
                {mockConversations.map((conversation) => (
                  <ConversationItem key={conversation.id} conversation={conversation} />
                ))}
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Projects */}
            <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 text-left">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-gray-500" />
                  {!isCollapsed && (
                    <span className="text-sm font-medium text-gray-700">Projects</span>
                  )}
                </div>
                {!isCollapsed && projectsOpen && <Badge variant="secondary">{mockProjects.length}</Badge>}
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 sm:space-y-1">
                {mockProjects.map((project) => (
                  <ProjectItem key={project.id} project={project} />
                ))}
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Templates */}
            <Collapsible open={templatesOpen} onOpenChange={setTemplatesOpen}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 text-left">
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500" />
                  {!isCollapsed && (
                    <span className="text-sm font-medium text-gray-700">Templates</span>
                  )}
                </div>
                {!isCollapsed && templatesOpen && <Badge variant="secondary">{governmentTemplates.length}</Badge>}
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 sm:space-y-1">
                {governmentTemplates.map((template) => (
                  <TemplateItem key={template.id} template={template} />
                ))}
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Archive */}
            <div className="p-2">
              <div className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-gray-100">
                <Archive className="h-4 w-4 text-gray-500" />
                {!isCollapsed && (
                  <span className="text-sm font-medium text-gray-700">Archive</span>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )
}

export default Sidebar