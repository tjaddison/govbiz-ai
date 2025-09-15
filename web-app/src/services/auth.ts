import { User } from '../types';

// Configuration for Cognito Hosted UI
const COGNITO_DOMAIN = process.env.REACT_APP_COGNITO_USER_POOL_DOMAIN;
const CLIENT_ID = process.env.REACT_APP_COGNITO_APP_CLIENT_ID;
const REDIRECT_URI = `${window.location.origin}/auth/callback`;

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

  // Check if user has valid tokens
  static hasValidSession(): boolean {
    const idToken = localStorage.getItem('id_token');
    if (!idToken) return false;

    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        console.error('hasValidSession - invalid JWT format');
        return false;
      }

      const tokenPayload = JSON.parse(atob(parts[1]));
      const currentTime = Math.floor(Date.now() / 1000);

      if (!tokenPayload.exp) {
        console.error('hasValidSession - no expiration in token');
        return false;
      }

      const isValid = tokenPayload.exp > currentTime;
      return isValid;
    } catch (error) {
      console.error('hasValidSession - error parsing token:', error);
      return false;
    }
  }

  // Get current authenticated user
  static async getCurrentUser(): Promise<User | null> {
    try {
      const idToken = localStorage.getItem('id_token');

      if (!idToken) {
        return null;
      }

      if (!this.hasValidSession()) {
        localStorage.removeItem('user');
        localStorage.removeItem('access_token');
        localStorage.removeItem('id_token');
        localStorage.removeItem('refresh_token');
        return null;
      }

      const tokenPayload = JSON.parse(atob(idToken.split('.')[1]));

      const user: User = {
        id: tokenPayload.sub,
        email: tokenPayload.email || 'user@cognito.com',
        name: tokenPayload.name || `${tokenPayload.given_name || ''} ${tokenPayload.family_name || ''}`.trim() || 'User',
        companyId: tokenPayload['custom:company_id'] || 'default-company',
        role: tokenPayload['custom:role'] || 'user',
        subscriptionTier: tokenPayload['custom:subscription_tier'] || 'basic',
        tenantId: tokenPayload['custom:tenant_id'] || 'default-tenant',
      };

      localStorage.setItem('user', JSON.stringify(user));
      return user;
    } catch (error) {
      localStorage.removeItem('user');
      localStorage.removeItem('access_token');
      localStorage.removeItem('id_token');
      localStorage.removeItem('refresh_token');
      return null;
    }
  }

  // Get stored access token
  static async getAccessToken(): Promise<string | null> {
    try {
      if (!this.hasValidSession()) {
        return null;
      }

      const token = localStorage.getItem('access_token');
      return token;
    } catch (error) {
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

  // Refresh tokens using refresh token
  static async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) return false;

      const tokenResponse = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: CLIENT_ID!,
          refresh_token: refreshToken,
        }),
      });

      if (!tokenResponse.ok) return false;

      const tokens = await tokenResponse.json();

      // Update stored tokens
      localStorage.setItem('access_token', tokens.access_token);
      localStorage.setItem('id_token', tokens.id_token);

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

  // Handle OAuth callback from Cognito Hosted UI
  static async handleOAuthCallback(authCode?: string): Promise<User | null> {
    try {
      console.log('🚀 AuthService.handleOAuthCallback started');

      let code = authCode;
      if (!code) {
        const urlParams = new URLSearchParams(window.location.search);
        code = urlParams.get('code') || undefined;
        const error = urlParams.get('error');

        if (error) {
          console.error('OAuth error:', error);
          throw new Error(`Authentication error: ${error}`);
        }
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      console.log('🔑 Authorization code received:', code);

      // Exchange authorization code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code);

      if (tokenResponse.id_token) {
        const tokenPayload = JSON.parse(atob(tokenResponse.id_token.split('.')[1]));

        const user: User = {
          id: tokenPayload.sub,
          email: tokenPayload.email || 'user@cognito.com',
          name: tokenPayload.name || `${tokenPayload.given_name || ''} ${tokenPayload.family_name || ''}`.trim() || 'User',
          companyId: tokenPayload['custom:company_id'] || 'default-company',
          role: tokenPayload['custom:role'] || 'user',
          subscriptionTier: tokenPayload['custom:subscription_tier'] || 'basic',
          tenantId: tokenPayload['custom:tenant_id'] || 'default-tenant',
        };

        // Store tokens and user info
        localStorage.setItem('access_token', tokenResponse.access_token);
        localStorage.setItem('id_token', tokenResponse.id_token);
        if (tokenResponse.refresh_token) {
          localStorage.setItem('refresh_token', tokenResponse.refresh_token);
        }
        localStorage.setItem('user', JSON.stringify(user));

        return user;
      }

      throw new Error('Invalid token response');
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  }

  // Exchange authorization code for tokens
  private static async exchangeCodeForTokens(code: string): Promise<any> {
    const tokenRequestParams = {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID!,
      code: code,
      redirect_uri: REDIRECT_URI,
    };

    const response = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(tokenRequestParams),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange error details:', errorText);
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }
}