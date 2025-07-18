import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Mock streaming implementation for development
// In production, this would connect to actual AI models
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { messages, model, stream = true } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return new NextResponse('Invalid messages format', { status: 400 })
    }

    // Create a readable stream for Server-Sent Events
    const encoder = new TextEncoder()
    
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          // Simulate streaming response
          const response = await generateStreamingResponse(messages, model)
          
          // Send tokens one by one with delays to simulate real streaming
          for (let i = 0; i < response.length; i++) {
            const token = response[i]
            
            // Send token
            const data = JSON.stringify({
              type: 'token',
              content: token,
              timestamp: Date.now()
            })
            
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            
            // Add realistic delay between tokens
            await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50))
          }
          
          // Send completion signal
          const completeData = JSON.stringify({
            type: 'done',
            timestamp: Date.now()
          })
          
          controller.enqueue(encoder.encode(`data: ${completeData}\n\n`))
          controller.close()
          
        } catch (error) {
          console.error('Streaming error:', error)
          
          const errorData = JSON.stringify({
            type: 'error',
            message: 'Failed to generate response',
            timestamp: Date.now()
          })
          
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`))
          controller.close()
        }
      }
    })

    return new NextResponse(responseStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
    
  } catch (error) {
    console.error('Stream API error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Mock function to generate streaming response
async function generateStreamingResponse(messages: any[], model: string): Promise<string[]> {
  // Get the last user message
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()
  const userContent = lastUserMessage?.content || ''
  
  // Generate a contextual response based on the user input
  const responseText = generateContextualResponse(userContent, messages)
  
  // Split response into tokens (words and punctuation)
  const tokens = responseText.split(/(\s+|[.!?,:;])/).filter(token => token.trim())
  
  return tokens
}

function generateContextualResponse(userInput: string, messages: any[]): string {
  const input = userInput.toLowerCase()
  
  // Check for specific patterns and respond accordingly
  if (input.includes('hello') || input.includes('hi') || input.includes('hey')) {
    return "Hello! I'm GovBiz.AI, your intelligent assistant for government contracting. I can help you with sources sought opportunities, proposal generation, and compliance guidance. What can I assist you with today?"
  }
  
  if (input.includes('sources sought') || input.includes('sam.gov')) {
    return "I can help you with sources sought opportunities! These are requests for information (RFI) posted by government agencies to identify potential vendors. Here's what I can do:\n\n• Monitor SAM.gov for relevant opportunities\n• Generate compliant responses\n• Track submission deadlines\n• Analyze requirements and match them to your capabilities\n• Help you build relationships with contracting officers\n\nWould you like me to help you search for current sources sought opportunities or assist with responding to a specific one?"
  }
  
  if (input.includes('proposal') || input.includes('rfp') || input.includes('bid')) {
    return "I can assist with proposal development and RFP responses! Here's how I can help:\n\n• Analyze solicitation requirements\n• Generate compliant proposal sections\n• Create technical approaches\n• Draft past performance narratives\n• Ensure compliance with FAR requirements\n• Review and optimize your submissions\n\nWhat specific aspect of proposal development would you like help with?"
  }
  
  if (input.includes('compliance') || input.includes('far') || input.includes('regulations')) {
    return "I can help with government contracting compliance! I'm well-versed in:\n\n• Federal Acquisition Regulation (FAR)\n• Defense Federal Acquisition Regulation Supplement (DFARS)\n• Small business set-aside requirements\n• Socioeconomic certifications (8(a), WOSB, SDVOSB, HUBZone)\n• Contract terms and conditions\n• Reporting and documentation requirements\n\nWhat compliance topic would you like to explore?"
  }
  
  if (input.includes('help') || input.includes('what can you do')) {
    return "I'm GovBiz.AI, your comprehensive government contracting assistant. Here's what I can help with:\n\n**Sources Sought & Opportunities:**\n• Find and monitor SAM.gov opportunities\n• Generate compliant responses\n• Track deadlines and requirements\n\n**Proposal Development:**\n• Analyze solicitations\n• Draft technical approaches\n• Create past performance narratives\n• Ensure FAR compliance\n\n**Intelligence & Research:**\n• Market research and analysis\n• Competitor intelligence\n• Agency spending patterns\n• Historical award data\n\n**Advanced Features:**\n• Context-aware conversations (200K+ tokens)\n• Real-time streaming responses\n• Slash commands for quick actions\n• Document analysis and generation\n\nTry asking me about a specific topic or use commands like `/help` for more options!"
  }
  
  if (input.includes('token') || input.includes('context') || input.includes('memory')) {
    return "I have advanced context management capabilities! Here's what makes me special:\n\n**Context Window:** 200,000+ tokens (equivalent to ~800 pages)\n**Intelligent Compression:** When approaching limits, I use smart compression strategies\n**Real-time Warnings:** I'll alert you when context is getting full\n**Preservation:** Important information like code blocks and key decisions are preserved\n\nYou can use these commands:\n• `/tokens` - Check current usage\n• `/compress` - Manually compress context\n• `/clear` - Clear conversation history\n• `/export` - Export our conversation\n\nThis allows us to have very long, detailed conversations about complex government contracting topics without losing important context!"
  }
  
  if (input.includes('command') || input.startsWith('/')) {
    return "I support powerful slash commands for advanced functionality:\n\n**Context Management:**\n• `/clear` - Clear conversation history\n• `/compress` - Compress context to save tokens\n• `/tokens` - Show token usage statistics\n• `/export` - Export conversation\n\n**Model Operations:**\n• `/model` - Switch AI models or show current model\n• `/models` - List available models\n\n**Utilities:**\n• `/help` - Show all commands\n• `/search <query>` - Search conversation history\n• `/analyze` - Analyze conversation patterns\n• `/status` - Show system status\n\nTry typing `/help` for a complete list of available commands!"
  }
  
  // Default response for general questions
  return `I understand you're asking about: "${userInput}"\n\nAs your GovBiz.AI assistant, I can help you with various government contracting topics. Could you be more specific about what you'd like to know? For example:\n\n• Are you looking for sources sought opportunities?\n• Do you need help with proposal development?\n• Would you like guidance on compliance requirements?\n• Are you interested in market research or competitor analysis?\n\nFeel free to ask detailed questions or use slash commands like \`/help\` for more options!`
}

// Handle preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}