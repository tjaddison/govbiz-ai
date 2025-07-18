'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { 
  User, 
  Settings, 
  LogOut, 
  Shield, 
  ChevronDown,
  Bell,
  Search,
  Menu,
  Home,
  FileText,
  Users,
  Archive
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface HeaderProps {
  onMenuToggle?: () => void
  isSidebarCollapsed?: boolean
  currentPath?: string
  securityClassification?: 'UNCLASSIFIED' | 'OFFICIAL' | 'SENSITIVE' | 'CONFIDENTIAL'
}

const navigationItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Chat', href: '/chat', icon: FileText },
  { name: 'Projects', href: '/projects', icon: Users },
  { name: 'Archive', href: '/archive', icon: Archive },
]

export const Header: React.FC<HeaderProps> = ({
  onMenuToggle,
  isSidebarCollapsed = false,
  currentPath = '/chat',
  securityClassification = 'UNCLASSIFIED'
}) => {
  const { data: session } = useSession()
  const [notifications] = useState(3) // Mock notification count

  const getClassificationBadge = () => {
    const configs = {
      UNCLASSIFIED: { className: 'badge-unclassified', text: 'UNCLASSIFIED' },
      OFFICIAL: { className: 'badge-official', text: 'OFFICIAL USE ONLY' },
      SENSITIVE: { className: 'badge-sensitive', text: 'SENSITIVE' },
      CONFIDENTIAL: { className: 'badge-confidential', text: 'CONFIDENTIAL' }
    }
    
    const config = configs[securityClassification]
    return (
      <Badge className={`${config.className} text-xs font-medium uppercase tracking-wide`}>
        <Shield className="h-3 w-3 mr-1" />
        {config.text}
      </Badge>
    )
  }

  const getBreadcrumb = () => {
    const pathSegments = currentPath.split('/').filter(Boolean)
    if (pathSegments.length === 0) return [{ name: 'Dashboard', path: '/' }]
    
    return pathSegments.map((segment, index) => ({
      name: segment.charAt(0).toUpperCase() + segment.slice(1),
      path: '/' + pathSegments.slice(0, index + 1).join('/')
    }))
  }

  return (
    <TooltipProvider>
      <header className="gov-header flex items-center justify-between px-3 sm:px-4 md:px-6 lg:px-8">
        {/* Left Section - Brand and Navigation */}
        <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4">
          {/* Menu Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onMenuToggle}
            className="lg:hidden p-1 sm:p-2"
          >
            <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>

          {/* Brand Identity */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-800 rounded-lg flex items-center justify-center">
              <Shield className="h-3 w-3 sm:h-5 sm:w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900">GovBiz.AI</span>
              <span className="text-xs text-gray-500 -mt-1 hidden sm:block lg:inline xl:inline">Government Contracting Intelligence</span>
            </div>
          </div>

          {/* Breadcrumb Navigation */}
          <nav className="hidden lg:flex items-center space-x-2 text-sm xl:text-base">
            {getBreadcrumb().map((item, index) => (
              <div key={item.path} className="flex items-center">
                {index > 0 && <span className="text-gray-400 mx-1 xl:mx-2">/</span>}
                <span className={index === getBreadcrumb().length - 1 ? 'text-blue-800 font-medium' : 'text-gray-600'}>
                  {item.name}
                </span>
              </div>
            ))}
          </nav>
        </div>

        {/* Center Section - Search (hidden on small screens) */}
        <div className="hidden md:flex flex-1 max-w-xs lg:max-w-md xl:max-w-lg mx-4 lg:mx-6 xl:mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations, projects, templates..."
              className="w-full pl-10 pr-4 py-1.5 lg:py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-800 focus:border-blue-800"
            />
          </div>
        </div>

        {/* Right Section - Controls and User */}
        <div className="flex items-center space-x-1 sm:space-x-2 lg:space-x-3">
          {/* Mobile Search Button */}
          <Button variant="ghost" size="sm" className="md:hidden p-1">
            <Search className="h-4 w-4" />
          </Button>

          {/* Security Classification */}
          <div className="hidden sm:block">
            {getClassificationBadge()}
          </div>

          {/* Notifications */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="relative p-1 sm:p-2">
                <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
                {notifications > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 p-0 bg-red-600 text-white text-xs flex items-center justify-center">
                    {notifications}
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{notifications} new notifications</p>
            </TooltipContent>
          </Tooltip>

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="hidden lg:inline-flex p-1 sm:p-2">
                <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center space-x-1 sm:space-x-2 px-1 sm:px-2 lg:px-3 py-2">
                <Avatar className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8">
                  <AvatarImage src={session?.user?.image || ''} />
                  <AvatarFallback className="text-xs sm:text-sm">
                    {session?.user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden lg:flex flex-col items-start">
                  <span className="text-sm font-medium text-gray-900">
                    {session?.user?.name || 'User'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {session?.user?.email || 'user@example.com'}
                  </span>
                </div>
                <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Shield className="mr-2 h-4 w-4" />
                <span>Security</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut()}
                className="text-red-600 focus:text-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </TooltipProvider>
  )
}

export default Header