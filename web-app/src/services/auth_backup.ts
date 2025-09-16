import { User } from '../types';

// Configuration for Cognito Hosted UI with validation
const COGNITO_DOMAIN = process.env.REACT_APP_COGNITO_USER_POOL_DOMAIN;
const CLIENT_ID = process.env.REACT_APP_COGNITO_APP_CLIENT_ID;
const REDIRECT_URI = `${window.location.origin}/auth/callback`;

// Validate critical environment variables on module load
if (!COGNITO_DOMAIN) {
  console.error('REACT_APP_COGNITO_USER_POOL_DOMAIN is not configured');
}
if (!CLIENT_ID) {
  console.error('REACT_APP_COGNITO_APP_CLIENT_ID is not configured');
}

if (typeof window !== 'undefined') {
  console.log('AuthService configuration:', {
    cognitoDomain: COGNITO_DOMAIN ? COGNITO_DOMAIN.substring(0, 20) + '...' : 'NOT SET',
    clientId: CLIENT_ID ? CLIENT_ID.substring(0, 5) + '...' : 'NOT SET',
    redirectUri: REDIRECT_URI
  });
}

export class AuthService {
  // Redirect to Cognito Hosted UI for sign in
  static signIn(): void {

    const loginUrl = `https://${COGNITO_DOMAIN}/login?` +
      `client_id=${CLIENT_ID}&` +
      `response_type=code&` +
      `scope=email+openid+profile&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

    window.location.href = loginUrl;
  }

  // Redirect to Cognito Hosted UI for sign up
  static signUp(): void {
    const signUpUrl = `https://${COGNITO_DOMAIN}/signup?` +
      `client_id=${CLIENT_ID}&` +
      `response_type=code&` +
      `scope=email+openid+profile&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

    window.location.href = signUpUrl;
  }

  // Sign out and redirect to home page
  static async signOut(): Promise<void> {
    // Clear local storage
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('id_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('oauth_code');
    localStorage.removeItem('oauth_provider');
    localStorage.removeItem('oauth_timestamp');
    localStorage.removeItem('processed_oauth_code');
    localStorage.removeItem('oauth_processing_timestamp');
    localStorage.removeItem('oauth_context_processing');

    // Redirect directly to home page instead of Cognito logout
    // This avoids the Cognito logout redirect issues
    window.location.href = window.location.origin;
  }

  // Check if user has valid tokens with comprehensive validation
  static hasValidSession(): boolean {
    try {
      const idToken = localStorage.getItem('id_token');
      if (!idToken) {
        console.debug('hasValidSession - no id_token found');
        return false;
      }

      // Validate JWT format
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        console.error('hasValidSession - invalid JWT format, expected 3 parts, got:', parts.length);
        this.clearTokens();
        return false;
      }

      // Safely decode and parse JWT payload
      let tokenPayload;
      try {
        const decodedPayload = atob(parts[1]);
        tokenPayload = JSON.parse(decodedPayload);
      } catch (parseError) {
        console.error('hasValidSession - JWT payload parse error:', parseError);
        this.clearTokens();
        return false;
      }

      // Validate required claims
      if (!tokenPayload.exp || typeof tokenPayload.exp !== 'number') {
        console.error('hasValidSession - invalid or missing exp claim:', tokenPayload.exp);
        this.clearTokens();
        return false;
      }

      if (!tokenPayload.sub) {
        console.error('hasValidSession - missing sub claim');
        this.clearTokens();
        return false;
      }

      // Check expiration with buffer time (5 minutes before actual expiration)
      const currentTime = Math.floor(Date.now() / 1000);
      const bufferTime = 5 * 60; // 5 minutes
      const effectiveExpiration = tokenPayload.exp - bufferTime;

      if (currentTime >= effectiveExpiration) {
        console.debug('hasValidSession - token expired or about to expire', {
          currentTime,
          tokenExp: tokenPayload.exp,
          effectiveExp: effectiveExpiration,
          isExpired: currentTime >= tokenPayload.exp
        });
        this.clearTokens();
        return false;
      }

      // Additional validation for issued at time
      if (tokenPayload.iat && tokenPayload.iat > currentTime + 60) {
        console.error('hasValidSession - token issued in the future:', {
          iat: tokenPayload.iat,
          currentTime
        });
        this.clearTokens();
        return false;
      }

      console.debug('hasValidSession - token is valid', {
        sub: tokenPayload.sub,
        exp: tokenPayload.exp,
        timeToExpiry: tokenPayload.exp - currentTime
      });

      return true;
    } catch (error) {
      console.error('hasValidSession - unexpected error:', error);
      this.clearTokens();
      return false;
    }
  }

  // Clear all tokens from localStorage
  private static clearTokens(): void {
    const keysToRemove = [
      'user',
      'access_token',
      'id_token',
      'refresh_token',
      'oauth_code',
      'oauth_provider',
      'oauth_timestamp',
      'processed_oauth_code',
      'oauth_processing_timestamp',
      'oauth_context_processing'
    ];

    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
  }

  // Get current authenticated user with robust error handling
  static async getCurrentUser(): Promise<User | null> {
    try {
      // First check if we have a valid session
      if (!this.hasValidSession()) {
        console.debug('getCurrentUser - no valid session found');
        return null;
      }

      const idToken = localStorage.getItem('id_token');
      if (!idToken) {
        console.debug('getCurrentUser - no id_token after valid session check');
        return null;
      }

      // Parse token payload safely
      let tokenPayload;
      try {
        const parts = idToken.split('.');
        tokenPayload = JSON.parse(atob(parts[1]));
      } catch (parseError) {
        console.error('getCurrentUser - failed to parse token payload:', parseError);
        this.clearTokens();
        return null;
      }

      // Validate required fields
      if (!tokenPayload.sub) {
        console.error('getCurrentUser - missing sub claim in token');
        this.clearTokens();
        return null;
      }

      // Create user object with safe defaults
      const user: User = {
        id: tokenPayload.sub,
        email: tokenPayload.email || tokenPayload.username || 'user@cognito.com',
        name: this.extractUserName(tokenPayload),
        companyId: tokenPayload['custom:company_id'] || 'default-company',
        role: tokenPayload['custom:role'] || 'user',
        subscriptionTier: tokenPayload['custom:subscription_tier'] || 'basic',
        tenantId: tokenPayload['custom:tenant_id'] || 'default-tenant',
      };

      // Validate user object
      if (!user.id || !user.email) {
        console.error('getCurrentUser - invalid user object created:', { id: user.id, email: user.email });
        this.clearTokens();
        return null;
      }

      localStorage.setItem('user', JSON.stringify(user));
      console.debug('getCurrentUser - user created successfully:', { id: user.id, email: user.email });
      return user;
    } catch (error) {
      console.error('getCurrentUser - unexpected error:', error);
      this.clearTokens();
      return null;
    }
  }

  // Extract user name from token payload with fallbacks
  private static extractUserName(tokenPayload: any): string {
    // Try different name fields in order of preference
    if (tokenPayload.name && typeof tokenPayload.name === 'string') {
      return tokenPayload.name.trim();
    }

    if (tokenPayload.given_name || tokenPayload.family_name) {
      const fullName = `${tokenPayload.given_name || ''} ${tokenPayload.family_name || ''}`.trim();
      if (fullName) return fullName;
    }

    if (tokenPayload.nickname && typeof tokenPayload.nickname === 'string') {
      return tokenPayload.nickname.trim();
    }

    if (tokenPayload.email && typeof tokenPayload.email === 'string') {
      // Extract name part from email
      const emailName = tokenPayload.email.split('@')[0];
      return emailName.replace(/[._-]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    }

    return 'User';
  }

  // Get stored access token with validation
  static async getAccessToken(): Promise<string | null> {
    try {
      if (!this.hasValidSession()) {
        console.debug('getAccessToken - no valid session');
        return null;
      }

      const token = localStorage.getItem('access_token');
      if (!token) {
        console.debug('getAccessToken - no access token found');
        return null;
      }

      // Basic token format validation
      if (typeof token !== 'string' || token.length < 10) {
        console.error('getAccessToken - invalid token format');
        this.clearTokens();
        return null;
      }

      return token;
    } catch (error) {
      console.error('getAccessToken - error:', error);
      return null;
    }
  }

  // Redirect to forgot password page
  static forgotPassword(): void {
    const forgotPasswordUrl = `https://${COGNITO_DOMAIN}/forgotPassword?` +
      `client_id=${CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

    window.location.href = forgotPasswordUrl;
  }

  // Refresh tokens using refresh token with comprehensive error handling
  static async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        console.debug('refreshToken - no refresh token available');
        return false;
      }

      if (!COGNITO_DOMAIN || !CLIENT_ID) {
        console.error('refreshToken - missing configuration');
        return false;
      }

      console.log('🔄 Attempting token refresh');

      const tokenResponse = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: CLIENT_ID,
          refresh_token: refreshToken,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token refresh failed:', {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: errorText
        });

        // If refresh token is invalid, clear all tokens
        if (tokenResponse.status === 400) {
          console.log('Refresh token expired or invalid, clearing all tokens');
          this.clearTokens();
        }

        return false;
      }

      const tokens = await tokenResponse.json();

      // Validate token response
      if (!tokens.access_token || !tokens.id_token) {
        console.error('Incomplete refresh token response:', {
          hasAccessToken: !!tokens.access_token,
          hasIdToken: !!tokens.id_token
        });
        return false;
      }

      // Update stored tokens
      localStorage.setItem('access_token', tokens.access_token);
      localStorage.setItem('id_token', tokens.id_token);

      // Update refresh token if provided
      if (tokens.refresh_token) {
        localStorage.setItem('refresh_token', tokens.refresh_token);
      }

      console.log('✅ Token refresh successful');
      return true;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }

  // Check if user is authenticated
  static isAuthenticated(): boolean {
    return this.hasValidSession();
  }

  static getStoredUser(): User | null {
    try {
      const userString = localStorage.getItem('user');
      if (!userString) {
        return null;
      }
      return JSON.parse(userString);
    } catch (error) {
      console.error('Error parsing stored user:', error);
      return null;
    }
  }

  // Sign in with Google through Cognito Hosted UI
  static signInWithGoogle(): void {
    const googleLoginUrl = `https://${COGNITO_DOMAIN}/login?` +
      `identity_provider=Google&` +
      `client_id=${CLIENT_ID}&` +
      `response_type=code&` +
      `scope=email+openid+profile&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

    window.location.href = googleLoginUrl;
  }

  // Handle OAuth callback from Cognito Hosted UI with comprehensive validation
  static async handleOAuthCallback(authCode?: string): Promise<User | null> {
    try {
      console.log('🚀 AuthService.handleOAuthCallback started');

      let code = authCode;
      if (!code) {
        const urlParams = new URLSearchParams(window.location.search);
        code = urlParams.get('code') || undefined;
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');

        if (error) {
          const errorMsg = errorDescription || error;
          console.error('OAuth error from URL:', { error, errorDescription });
          throw new Error(`Authentication error: ${errorMsg}`);
        }
      }

      if (!code || typeof code !== 'string' || code.length < 10) {
        throw new Error('Invalid or missing authorization code');
      }

      console.log('🔑 Authorization code received (length):', code.length);

      // Exchange authorization code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code);

      // Validate token response
      if (!tokenResponse) {
        throw new Error('Empty token response received');
      }

      if (!tokenResponse.access_token || !tokenResponse.id_token) {
        console.error('Missing required tokens in response:', {
          hasAccessToken: !!tokenResponse.access_token,
          hasIdToken: !!tokenResponse.id_token,
          hasRefreshToken: !!tokenResponse.refresh_token
        });
        throw new Error('Incomplete token response - missing required tokens');
      }

      // Parse and validate ID token
      let tokenPayload;
      try {
        const parts = tokenResponse.id_token.split('.');
        if (parts.length !== 3) {
          throw new Error('Invalid JWT format');
        }
        tokenPayload = JSON.parse(atob(parts[1]));
      } catch (parseError) {
        console.error('Failed to parse ID token:', parseError);
        throw new Error('Invalid ID token format');
      }

      // Validate token payload
      if (!tokenPayload.sub) {
        throw new Error('Missing user ID in token');
      }

      if (!tokenPayload.exp || typeof tokenPayload.exp !== 'number') {
        throw new Error('Missing or invalid expiration in token');
      }

      // Check token expiration
      const currentTime = Math.floor(Date.now() / 1000);
      if (tokenPayload.exp <= currentTime) {
        throw new Error('Received expired token');
      }

      // Create user object
      const user: User = {
        id: tokenPayload.sub,
        email: tokenPayload.email || tokenPayload.username || 'user@cognito.com',
        name: this.extractUserName(tokenPayload),
        companyId: tokenPayload['custom:company_id'] || 'default-company',
        role: tokenPayload['custom:role'] || 'user',
        subscriptionTier: tokenPayload['custom:subscription_tier'] || 'basic',
        tenantId: tokenPayload['custom:tenant_id'] || 'default-tenant',
      };

      // Validate user object
      if (!user.id || !user.email) {
        throw new Error('Failed to create valid user object');
      }

      // Store tokens and user info atomically
      try {
        localStorage.setItem('access_token', tokenResponse.access_token);
        localStorage.setItem('id_token', tokenResponse.id_token);
        if (tokenResponse.refresh_token) {
          localStorage.setItem('refresh_token', tokenResponse.refresh_token);
        }
        localStorage.setItem('user', JSON.stringify(user));

        console.log('✅ OAuth callback completed successfully', {
          userId: user.id,
          email: user.email,
          tokenExp: tokenPayload.exp,
          timeToExpiry: tokenPayload.exp - currentTime
        });

        return user;
      } catch (storageError) {
        console.error('Failed to store tokens:', storageError);
        this.clearTokens();
        throw new Error('Failed to store authentication data');
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
      this.clearTokens();
      throw error;
    }
  }

  // Exchange authorization code for tokens with robust error handling
  private static async exchangeCodeForTokens(code: string): Promise<any> {
    // Validate environment variables
    if (!COGNITO_DOMAIN || !CLIENT_ID) {
      console.error('Missing required environment variables:', {
        hasCognitoDomain: !!COGNITO_DOMAIN,
        hasClientId: !!CLIENT_ID
      });
      throw new Error('Missing Cognito configuration. Please check environment variables.');
    }

    const tokenRequestParams = {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code: code,
      redirect_uri: REDIRECT_URI,
    };

    console.log('🔄 Exchanging code for tokens:', {
      cognitoDomain: COGNITO_DOMAIN,
      clientId: CLIENT_ID.substring(0, 5) + '...',
      redirectUri: REDIRECT_URI,
      codeLength: code.length
    });

    const tokenUrl = `https://${COGNITO_DOMAIN}/oauth2/token`;

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams(tokenRequestParams),
      });

      console.log('📡 Token exchange response status:', response.status);

      if (!response.ok) {
        let errorDetails;
        try {
          const errorText = await response.text();
          try {
            errorDetails = JSON.parse(errorText);
          } catch {
            errorDetails = { error: 'unknown', description: errorText };
          }
        } catch {
          errorDetails = { error: 'unknown', description: 'Failed to read error response' };
        }

        console.error('Token exchange failed:', {
          status: response.status,
          statusText: response.statusText,
          errorDetails
        });

        throw new Error(`Token exchange failed (${response.status}): ${errorDetails.error || 'Unknown error'}`);
      }

      const tokenData = await response.json();

      // Validate token response structure
      if (!tokenData || typeof tokenData !== 'object') {
        throw new Error('Invalid token response format');
      }

      if (!tokenData.access_token || !tokenData.id_token) {
        console.error('Incomplete token response:', {
          hasAccessToken: !!tokenData.access_token,
          hasIdToken: !!tokenData.id_token,
          hasRefreshToken: !!tokenData.refresh_token,
          tokenType: tokenData.token_type
        });
        throw new Error('Incomplete token response');
      }

      console.log('✅ Token exchange successful:', {
        hasAccessToken: !!tokenData.access_token,
        hasIdToken: !!tokenData.id_token,
        hasRefreshToken: !!tokenData.refresh_token,
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in
      });

      return tokenData;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Token exchange error:', error.message);
        throw error;
      }
      console.error('Unexpected token exchange error:', error);
      throw new Error('Token exchange failed due to network or server error');
    }
  }
}