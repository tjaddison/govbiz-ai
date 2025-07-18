import { Message } from '@/types'

export class MessageManager {
  private messages: Message[] = []
  
  constructor() {}
  
  addMessage(message: Message): void {
    this.messages.push(message)
  }
  
  updateMessage(id: string, updates: Partial<Message>): void {
    const index = this.messages.findIndex(m => m.id === id)
    if (index !== -1) {
      this.messages[index] = { ...this.messages[index], ...updates }
    }
  }
  
  removeMessage(id: string): void {
    this.messages = this.messages.filter(m => m.id !== id)
  }
  
  getMessages(): Message[] {
    return [...this.messages]
  }
  
  getMessageById(id: string): Message | undefined {
    return this.messages.find(m => m.id === id)
  }
  
  getMessagesByRole(role: Message['role']): Message[] {
    return this.messages.filter(m => m.role === role)
  }
  
  getLastMessage(): Message | undefined {
    return this.messages[this.messages.length - 1]
  }
  
  getMessageCount(): number {
    return this.messages.length
  }
  
  clear(): void {
    this.messages = []
  }
  
  searchMessages(query: string): Message[] {
    const lowercaseQuery = query.toLowerCase()
    return this.messages.filter(m => 
      m.content.toLowerCase().includes(lowercaseQuery)
    )
  }
  
  exportConversation(messages: Message[]): string {
    const exportData = {
      messages,
      metadata: {
        totalMessages: messages.length,
        totalTokens: messages.reduce((sum, m) => sum + m.tokens, 0),
        exportedAt: new Date().toISOString(),
        roles: {
          user: messages.filter(m => m.role === 'user').length,
          assistant: messages.filter(m => m.role === 'assistant').length,
          system: messages.filter(m => m.role === 'system').length
        }
      }
    }
    
    return JSON.stringify(exportData, null, 2)
  }
  
  importConversation(data: string): Message[] {
    try {
      const parsed = JSON.parse(data)
      return parsed.messages || []
    } catch (error) {
      throw new Error('Invalid conversation format')
    }
  }
  
  getStatistics(): {
    totalMessages: number
    totalTokens: number
    averageTokensPerMessage: number
    roleDistribution: Record<string, number>
    timeSpan: number
  } {
    const totalTokens = this.messages.reduce((sum, m) => sum + m.tokens, 0)
    const roleDistribution = this.messages.reduce((acc, m) => {
      acc[m.role] = (acc[m.role] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const timestamps = this.messages.map(m => m.timestamp)
    const timeSpan = timestamps.length > 0 ? Math.max(...timestamps) - Math.min(...timestamps) : 0
    
    return {
      totalMessages: this.messages.length,
      totalTokens,
      averageTokensPerMessage: this.messages.length > 0 ? totalTokens / this.messages.length : 0,
      roleDistribution,
      timeSpan
    }
  }
}