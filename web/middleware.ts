import { NextRequest, NextResponse } from 'next/server'
import { securityFramework } from './lib/security/SecurityFramework'

// Routes that require enhanced security
const PROTECTED_API_ROUTES = [
  '/api/messages',
  '/api/conversations',
  '/api/chat',
  '/api/models'
]

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/auth',
  '/api/health',
  '/',
  '/auth'
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  try {
    // Skip security checks for public routes
    if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
      return addSecurityHeaders(NextResponse.next())
    }
    
    // Apply security framework validation for protected API routes
    if (PROTECTED_API_ROUTES.some(route => pathname.startsWith(route))) {
      const securityResult = await securityFramework.validateRequest(request)
      
      if (!securityResult.allowed) {
        return new NextResponse(
          JSON.stringify({
            error: 'Security validation failed',
            reason: securityResult.reason,
            timestamp: new Date().toISOString()
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              ...getSecurityHeaders()
            }
          }
        )
      }
    }
    
    // Continue with request and add security headers
    return addSecurityHeaders(NextResponse.next())
    
  } catch (error) {
    console.error('Middleware security error:', error)
    
    // Log security error but allow request to continue
    // In production, you might want to block the request
    return addSecurityHeaders(NextResponse.next())
  }
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  const headers = getSecurityHeaders()
  
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  
  return response
}

function getSecurityHeaders(): Record<string, string> {
  return {
    // Prevent XSS attacks
    'X-XSS-Protection': '1; mode=block',
    
    // Prevent clickjacking
    'X-Frame-Options': 'DENY',
    
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    
    // Enforce HTTPS
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    
    // Referrer policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Permissions policy (formerly Feature Policy)
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'interest-cohort=()'
    ].join(', '),
    
    // Content Security Policy
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://accounts.google.com https://api.anthropic.com https://*.vercel.app",
      "frame-src 'self' https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ].join('; '),
    
    // Remove server information
    'Server': 'GovBiz.ai',
    
    // API version
    'X-API-Version': '1.0.0',
    
    // Rate limiting headers (will be set by security framework)
    'X-RateLimit-Policy': '100;w=900', // 100 requests per 15 minutes
    
    // Security notification
    'X-Security-Framework': 'Government-Grade'
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}