import { Command, ParsedCommand, CommandResult, CommandSuggestion, ExecutionContext } from '@/types'

export class CommandParser {
  private commands: Map<string, Command>
  private aliases: Map<string, string>
  private commandHistory: string[]
  
  constructor() {
    this.commands = new Map()
    this.aliases = new Map()
    this.commandHistory = []
    
    this.registerBuiltinCommands()
  }
  
  private registerBuiltinCommands(): void {
    // Context management commands
    this.register({
      name: 'clear',
      description: 'Clear conversation context',
      usage: '/clear [--confirm] [--keep-system]',
      aliases: ['c', 'reset'],
      execute: this.clearCommand.bind(this)
    })
    
    this.register({
      name: 'compress',
      description: 'Compress context to save tokens',
      usage: '/compress [--strategy=preservation|summarization|removal|hybrid]',
      aliases: ['comp'],
      execute: this.compressCommand.bind(this)
    })
    
    this.register({
      name: 'export',
      description: 'Export conversation history',
      usage: '/export [--format=json|markdown|txt]',
      aliases: ['exp'],
      execute: this.exportCommand.bind(this)
    })
    
    this.register({
      name: 'tokens',
      description: 'Show token usage statistics',
      usage: '/tokens [--detailed]',
      aliases: ['t'],
      execute: this.tokensCommand.bind(this)
    })
    
    // Model commands
    this.register({
      name: 'model',
      description: 'Switch or list AI models',
      usage: '/model [model-name] [--list]',
      aliases: ['m', 'switch'],
      execute: this.modelCommand.bind(this)
    })
    
    this.register({
      name: 'models',
      description: 'List available models',
      usage: '/models [--detailed]',
      aliases: ['list-models'],
      execute: this.modelsCommand.bind(this)
    })
    
    // System commands
    this.register({
      name: 'help',
      description: 'Show help information',
      usage: '/help [command]',
      aliases: ['h', '?'],
      execute: this.helpCommand.bind(this)
    })
    
    this.register({
      name: 'history',
      description: 'Show command history',
      usage: '/history [--clear]',
      aliases: ['hist'],
      execute: this.historyCommand.bind(this)
    })
    
    this.register({
      name: 'status',
      description: 'Show system status',
      usage: '/status [--detailed]',
      aliases: ['stat'],
      execute: this.statusCommand.bind(this)
    })
    
    // Advanced commands
    this.register({
      name: 'analyze',
      description: 'Analyze conversation context',
      usage: '/analyze [--topics] [--sentiment] [--quality]',
      aliases: ['anal'],
      execute: this.analyzeCommand.bind(this)
    })
    
    this.register({
      name: 'search',
      description: 'Search conversation history',
      usage: '/search <query> [--role=user|assistant|system]',
      aliases: ['find'],
      execute: this.searchCommand.bind(this)
    })
    
    this.register({
      name: 'save',
      description: 'Save conversation with name',
      usage: '/save <name> [--description]',
      aliases: ['s'],
      execute: this.saveCommand.bind(this)
    })
    
    this.register({
      name: 'load',
      description: 'Load saved conversation',
      usage: '/load <name>',
      aliases: ['l'],
      execute: this.loadCommand.bind(this)
    })
    
    this.register({
      name: 'template',
      description: 'Create or use message templates',
      usage: '/template [name] [--create] [--list]',
      aliases: ['tmpl'],
      execute: this.templateCommand.bind(this)
    })
    
    this.register({
      name: 'debug',
      description: 'Toggle debug mode',
      usage: '/debug [on|off]',
      aliases: ['dbg'],
      execute: this.debugCommand.bind(this)
    })
  }
  
  register(command: Command): void {
    this.commands.set(command.name, command)
    
    // Register aliases
    for (const alias of command.aliases) {
      this.aliases.set(alias, command.name)
    }
  }
  
  parse(input: string): ParsedCommand {
    if (!input.startsWith('/')) {
      return {
        isValid: false,
        command: input,
        args: [],
        rawInput: input
      }
    }
    
    const parts = this.parseCommandLine(input.slice(1))
    const command = parts[0]?.toLowerCase() || ''
    const args = parts.slice(1)
    
    // Check aliases
    const actualCommand = this.aliases.get(command) || command
    
    return {
      isValid: this.commands.has(actualCommand),
      command: actualCommand,
      originalCommand: command,
      args,
      rawInput: input
    }
  }
  
  private parseCommandLine(input: string): string[] {
    const parts: string[] = []
    let current = ''
    let inQuotes = false
    let quoteChar = ''
    
    for (let i = 0; i < input.length; i++) {
      const char = input[i]
      
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true
        quoteChar = char
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false
        quoteChar = ''
      } else if (char === ' ' && !inQuotes) {
        if (current.trim()) {
          parts.push(current.trim())
          current = ''
        }
      } else {
        current += char
      }
    }
    
    if (current.trim()) {
      parts.push(current.trim())
    }
    
    return parts
  }
  
  async execute(input: string, context: ExecutionContext): Promise<CommandResult> {
    const parsed = this.parse(input)
    
    if (!parsed.isValid) {
      return {
        success: false,
        error: `Unknown command: ${parsed.command}`,
        suggestions: this.getSuggestions(parsed.command)
      }
    }
    
    // Add to history
    this.commandHistory.push(input)
    if (this.commandHistory.length > 100) {
      this.commandHistory.shift()
    }
    
    try {
      const command = this.commands.get(parsed.command)!
      const result = await command.execute(parsed.args, context)
      
      return {
        ...result,
        data: {
          ...result.data,
          command: parsed.command,
          args: parsed.args
        }
      }
    } catch (error) {
      return {
        success: false,
        error: `Command failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }
  
  getSuggestions(partial: string): string[] {
    const suggestions: string[] = []
    
    // Check command names
    for (const [name] of this.commands) {
      if (name.startsWith(partial.toLowerCase())) {
        suggestions.push(name)
      }
    }
    
    // Check aliases
    for (const [alias, commandName] of this.aliases) {
      if (alias.startsWith(partial.toLowerCase()) && !suggestions.includes(commandName)) {
        suggestions.push(alias)
      }
    }
    
    return suggestions.sort()
  }
  
  getCommandSuggestions(partial: string): CommandSuggestion[] {
    const suggestions: CommandSuggestion[] = []
    
    for (const [name, command] of this.commands) {
      if (name.startsWith(partial.toLowerCase())) {
        suggestions.push({
          command: name,
          description: command.description,
          usage: command.usage,
          similarity: this.calculateSimilarity(partial, name)
        })
      }
    }
    
    return suggestions
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
  }
  
  private calculateSimilarity(input: string, command: string): number {
    const inputLower = input.toLowerCase()
    const commandLower = command.toLowerCase()
    
    if (commandLower.startsWith(inputLower)) {
      return 1.0 - (commandLower.length - inputLower.length) / commandLower.length
    }
    
    // Simple Levenshtein distance approximation
    let matches = 0
    for (let i = 0; i < Math.min(inputLower.length, commandLower.length); i++) {
      if (inputLower[i] === commandLower[i]) {
        matches++
      }
    }
    
    return matches / Math.max(inputLower.length, commandLower.length)
  }
  
  // Command implementations
  private async clearCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    const hasConfirm = args.includes('--confirm')
    const keepSystem = args.includes('--keep-system')
    
    if (!hasConfirm) {
      return {
        success: false,
        requiresConfirmation: true,
        message: 'This will clear all conversation history. Use --confirm to proceed.',
        confirmationCommand: '/clear --confirm'
      }
    }
    
    const beforeCount = context.contextManager.getState().messages.length
    const beforeTokens = context.contextManager.getTokenCount()
    
    if (keepSystem) {
      // Keep only system messages
      const systemMessages = context.contextManager.getState().messages.filter((m: any) => m.role === 'system')
      context.contextManager.setState({ messages: systemMessages })
    } else {
      context.contextManager.clearContext()
    }
    
    const afterCount = context.contextManager.getState().messages.length
    const afterTokens = context.contextManager.getTokenCount()
    
    return {
      success: true,
      message: `Context cleared. Removed ${beforeCount - afterCount} messages (${beforeTokens - afterTokens} tokens).`,
      data: {
        action: 'clear',
        beforeCount,
        afterCount,
        beforeTokens,
        afterTokens
      }
    }
  }
  
  private async compressCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    const strategy = args.find(arg => arg.startsWith('--strategy='))?.split('=')[1] || 'preservation'
    
    const beforeTokens = context.contextManager.getTokenCount()
    const beforeCount = context.contextManager.getState().messages.length
    
    const result = await context.contextManager.compressContext({
      strategy: strategy as any
    })
    
    const afterTokens = context.contextManager.getTokenCount()
    const afterCount = context.contextManager.getState().messages.length
    
    return {
      success: true,
      message: `Context compressed using ${strategy} strategy. Removed ${result.removedCount} messages, saved ${result.tokensSaved} tokens.`,
      data: {
        action: 'compress',
        strategy,
        beforeCount,
        afterCount,
        beforeTokens,
        afterTokens,
        tokensSaved: result.tokensSaved,
        qualityScore: result.qualityScore
      }
    }
  }
  
  private async exportCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    const format = args.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'json'
    
    const data = context.contextManager.exportContext()
    
    // In a real app, this would trigger a download
    return {
      success: true,
      message: `Conversation exported in ${format} format.`,
      data: {
        action: 'export',
        format,
        exportData: data
      }
    }
  }
  
  private async tokensCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    const detailed = args.includes('--detailed')
    const analysis = context.contextManager.analyzeContext()
    
    let message = `Token usage: ${analysis.tokenDistribution.user + analysis.tokenDistribution.assistant + analysis.tokenDistribution.system} / ${context.contextManager.getState().maxTokens}`
    
    if (detailed) {
      message += `\\nUser: ${analysis.tokenDistribution.user}\\nAssistant: ${analysis.tokenDistribution.assistant}\\nSystem: ${analysis.tokenDistribution.system}`
      message += `\\nMessages: ${analysis.totalMessages}`
      message += `\\nAverage per message: ${Math.round(analysis.averageMessageLength)}`
    }
    
    return {
      success: true,
      message,
      data: {
        action: 'tokens',
        analysis
      }
    }
  }
  
  private async modelCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    if (args.includes('--list') || args.length === 0) {
      return this.modelsCommand(args, context)
    }
    
    const modelName = args[0]
    
    return {
      success: true,
      message: `Switched to model: ${modelName}`,
      data: {
        action: 'model_switch',
        modelId: modelName
      }
    }
  }
  
  private async modelsCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    const detailed = args.includes('--detailed')
    
    // This would typically fetch from the model store
    const models = ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4']
    
    return {
      success: true,
      message: `Available models: ${models.join(', ')}`,
      data: {
        action: 'list_models',
        models
      }
    }
  }
  
  private async helpCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    if (args.length > 0) {
      // Help for specific command
      const commandName = args[0]
      const command = this.commands.get(commandName)
      
      if (!command) {
        return {
          success: false,
          error: `Unknown command: ${commandName}`,
          suggestions: this.getSuggestions(commandName)
        }
      }
      
      return {
        success: true,
        message: `${command.name}: ${command.description}\\nUsage: ${command.usage}`,
        data: {
          action: 'help',
          command: commandName
        }
      }
    }
    
    // General help
    const commandList = Array.from(this.commands.entries())
      .map(([name, cmd]) => `/${name} - ${cmd.description}`)
      .join('\\n')
    
    return {
      success: true,
      message: `Available commands:\\n${commandList}`,
      data: {
        action: 'help',
        commands: Array.from(this.commands.keys())
      }
    }
  }
  
  private async historyCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    if (args.includes('--clear')) {
      this.commandHistory = []
      return {
        success: true,
        message: 'Command history cleared.',
        data: { action: 'history_clear' }
      }
    }
    
    const history = this.commandHistory.slice(-10).join('\\n')
    
    return {
      success: true,
      message: `Recent commands:\\n${history}`,
      data: {
        action: 'history',
        history: this.commandHistory
      }
    }
  }
  
  private async statusCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    const detailed = args.includes('--detailed')
    const utilization = context.contextManager.getUtilization()
    
    let message = `System Status: ${utilization < 0.8 ? 'Good' : utilization < 0.9 ? 'Warning' : 'Critical'}`
    message += `\\nContext: ${Math.round(utilization * 100)}%`
    
    if (detailed) {
      const analysis = context.contextManager.analyzeContext()
      message += `\\nMessages: ${analysis.totalMessages}`
      message += `\\nRecommendation: ${analysis.compressionRecommendation}`
    }
    
    return {
      success: true,
      message,
      data: {
        action: 'status',
        utilization,
        detailed
      }
    }
  }
  
  private async analyzeCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    const analysis = context.contextManager.analyzeContext()
    
    return {
      success: true,
      message: `Context Analysis:\\n${JSON.stringify(analysis, null, 2)}`,
      data: {
        action: 'analyze',
        analysis
      }
    }
  }
  
  private async searchCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        error: 'Search query required'
      }
    }
    
    const query = args[0]
    const role = args.find(arg => arg.startsWith('--role='))?.split('=')[1]
    
    // Simple search implementation
    const messages = context.contextManager.getState().messages
    const results = messages.filter((msg: any) => {
      const matchesQuery = msg.content.toLowerCase().includes(query.toLowerCase())
      const matchesRole = !role || msg.role === role
      return matchesQuery && matchesRole
    })
    
    return {
      success: true,
      message: `Found ${results.length} messages matching "${query}"`,
      data: {
        action: 'search',
        query,
        results
      }
    }
  }
  
  private async saveCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        error: 'Save name required'
      }
    }
    
    const name = args[0]
    const description = args.find(arg => arg.startsWith('--description='))?.split('=')[1]
    
    return {
      success: true,
      message: `Conversation saved as "${name}"`,
      data: {
        action: 'save',
        name,
        description
      }
    }
  }
  
  private async loadCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    if (args.length === 0) {
      return {
        success: false,
        error: 'Load name required'
      }
    }
    
    const name = args[0]
    
    return {
      success: true,
      message: `Conversation "${name}" loaded`,
      data: {
        action: 'load',
        name
      }
    }
  }
  
  private async templateCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    if (args.includes('--list')) {
      return {
        success: true,
        message: 'Available templates: (none)',
        data: {
          action: 'template_list',
          templates: []
        }
      }
    }
    
    return {
      success: true,
      message: 'Template feature not implemented yet',
      data: {
        action: 'template'
      }
    }
  }
  
  private async debugCommand(args: string[], context: ExecutionContext): Promise<CommandResult> {
    const mode = args[0] || 'toggle'
    
    return {
      success: true,
      message: `Debug mode ${mode}`,
      data: {
        action: 'debug',
        mode
      }
    }
  }
}