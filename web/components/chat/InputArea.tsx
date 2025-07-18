'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import NextImage from 'next/image'
import { 
  Send, 
  Paperclip, 
  Image, 
  FileText, 
  Upload,
  X,
  Shield,
  Mic,
  Square,
  AlertTriangle,
  Info
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface InputAreaProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAttachment?: (files: File[]) => void
  onClassificationChange?: (classification: string) => void
  disabled?: boolean
  isStreaming?: boolean
  onStopStreaming?: () => void
  tokenCount?: number
  maxTokens?: number
  placeholder?: string
}

interface AttachedFile {
  id: string
  file: File
  type: 'document' | 'image' | 'other'
  preview?: string
}

const SUPPORTED_FILE_TYPES = {
  document: ['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.md'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'],
  other: ['.json', '.xml', '.yaml', '.yml']
}

const CLASSIFICATION_LEVELS = [
  { value: 'UNCLASSIFIED', label: 'Unclassified', color: 'bg-green-100 text-green-800' },
  { value: 'OFFICIAL', label: 'Official Use Only', color: 'bg-blue-100 text-blue-800' },
  { value: 'SENSITIVE', label: 'Sensitive', color: 'bg-orange-100 text-orange-800' },
  { value: 'CONFIDENTIAL', label: 'Confidential', color: 'bg-red-100 text-red-800' }
]

export const InputArea: React.FC<InputAreaProps> = ({
  value,
  onChange,
  onSend,
  onAttachment,
  onClassificationChange,
  disabled = false,
  isStreaming = false,
  onStopStreaming,
  tokenCount = 0,
  maxTokens = 4000,
  placeholder = "Ask about government contracting, sources sought, or anything else..."
}) => {
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [classification, setClassification] = useState('UNCLASSIFIED')
  const [isRecording, setIsRecording] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-resize textarea
  const handleTextareaResize = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [])

  useEffect(() => {
    handleTextareaResize()
  }, [value, handleTextareaResize])

  // Handle file attachment
  const handleFileSelect = useCallback((files: FileList) => {
    const validFiles: AttachedFile[] = []
    
    Array.from(files).forEach((file) => {
      const extension = '.' + file.name.split('.').pop()?.toLowerCase()
      let fileType: 'document' | 'image' | 'other' = 'other'
      
      if (SUPPORTED_FILE_TYPES.document.includes(extension)) {
        fileType = 'document'
      } else if (SUPPORTED_FILE_TYPES.image.includes(extension)) {
        fileType = 'image'
      }
      
      const attachedFile: AttachedFile = {
        id: Date.now().toString() + Math.random().toString(36),
        file,
        type: fileType
      }
      
      // Create preview for images
      if (fileType === 'image') {
        const reader = new FileReader()
        reader.onload = (e) => {
          attachedFile.preview = e.target?.result as string
        }
        reader.readAsDataURL(file)
      }
      
      validFiles.push(attachedFile)
    })
    
    setAttachedFiles(prev => [...prev, ...validFiles])
    
    if (onAttachment) {
      onAttachment(validFiles.map(af => af.file))
    }
    
    toast.success(`${validFiles.length} file(s) attached`)
  }, [onAttachment])

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files)
    }
  }, [handleFileSelect])

  // Remove attached file
  const removeAttachedFile = useCallback((fileId: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])

  // Handle send
  const handleSend = useCallback(() => {
    if (!value.trim() && attachedFiles.length === 0) return
    if (disabled || isStreaming) return
    
    onSend()
  }, [value, attachedFiles, disabled, isStreaming, onSend])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // Handle classification change
  const handleClassificationChange = useCallback((newClassification: string) => {
    setClassification(newClassification)
    if (onClassificationChange) {
      onClassificationChange(newClassification)
    }
  }, [onClassificationChange])

  // Get token status
  const getTokenStatus = () => {
    const percentage = tokenCount / maxTokens
    if (percentage > 0.9) return { color: 'bg-red-100 text-red-800', status: 'critical' }
    if (percentage > 0.7) return { color: 'bg-orange-100 text-orange-800', status: 'warning' }
    return { color: 'bg-gray-100 text-gray-800', status: 'normal' }
  }

  const tokenStatus = getTokenStatus()
  const currentClassification = CLASSIFICATION_LEVELS.find(c => c.value === classification)

  return (
    <TooltipProvider>
      <div className="chat-input-area">
        <div className="max-w-4xl mx-auto">
          {/* Attached Files */}
          {attachedFiles.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {attachedFiles.map((attachedFile) => (
                <div
                  key={attachedFile.id}
                  className="flex items-center gap-2 bg-gray-100 rounded-lg p-2 text-sm"
                >
                  {attachedFile.type === 'image' && attachedFile.preview ? (
                    <NextImage
                      src={attachedFile.preview}
                      alt={`Preview of ${attachedFile.file.name}`}
                      width={32}
                      height={32}
                      className="object-cover rounded"
                    />
                  ) : attachedFile.type === 'document' ? (
                    <FileText className="h-4 w-4 text-blue-600" />
                  ) : (
                    <Paperclip className="h-4 w-4 text-gray-600" />
                  )}
                  <span className="max-w-32 truncate">{attachedFile.file.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAttachedFile(attachedFile.id)}
                    className="h-4 w-4 p-0 hover:bg-red-100"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Input Container */}
          <div
            className={`relative border rounded-lg bg-white transition-colors ${
              isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
            } ${disabled ? 'opacity-50' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Classification and Controls Bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-gray-500" />
                <Select value={classification} onValueChange={handleClassificationChange}>
                  <SelectTrigger className="w-48 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASSIFICATION_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        <div className="flex items-center gap-2">
                          <Badge className={`${level.color} text-xs`}>
                            <span className="hidden sm:inline">{level.label}</span>
                            <span className="sm:hidden">{level.value}</span>
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                {tokenCount > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className={`${tokenStatus.color} text-xs`}>
                        {tokenCount.toLocaleString()} / {maxTokens.toLocaleString()}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <p>Token usage: {((tokenCount / maxTokens) * 100).toFixed(1)}%</p>
                        {tokenStatus.status === 'critical' && (
                          <p className="text-red-600">Consider clearing context</p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}

                {tokenStatus.status !== 'normal' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-orange-500">
                        {tokenStatus.status === 'critical' ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">
                        {tokenStatus.status === 'critical' 
                          ? 'Token limit nearly reached' 
                          : 'High token usage'
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Text Input */}
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className="min-h-16 max-h-48 resize-none border-0 focus:ring-0 focus:border-0 rounded-none"
                style={{ paddingRight: '120px' }}
              />

              {/* Drag overlay */}
              {isDragOver && (
                <div className="absolute inset-0 bg-blue-50 bg-opacity-90 flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <Upload className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-sm text-blue-600 font-medium">Drop files to attach</p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {/* Attachment Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={disabled}>
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <FileText className="mr-2 h-4 w-4" />
                    Upload Document
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <Image className="mr-2 h-4 w-4" aria-label="Upload image icon" />
                    Upload Image
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Voice Recording */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    className={isRecording ? 'text-red-600' : ''}
                    onClick={() => setIsRecording(!isRecording)}
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isRecording ? 'Stop recording' : 'Voice input'}
                </TooltipContent>
              </Tooltip>

              {/* Send/Stop Button */}
              {isStreaming ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={onStopStreaming}
                  className="min-w-16"
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={(!value.trim() && attachedFiles.length === 0) || disabled}
                  className="bg-blue-800 hover:bg-blue-900 min-w-16"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Helper Text */}
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <span>
              Press Ctrl+Enter to send • Drag & drop files to attach
            </span>
            <div className="flex items-center gap-2">
              {currentClassification && (
                <Badge className={`${currentClassification.color} text-xs`}>
                  {currentClassification.label}
                </Badge>
              )}
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept={Object.values(SUPPORTED_FILE_TYPES).flat().join(',')}
            onChange={(e) => {
              if (e.target.files) {
                handleFileSelect(e.target.files)
                e.target.value = '' // Reset input
              }
            }}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

export default InputArea