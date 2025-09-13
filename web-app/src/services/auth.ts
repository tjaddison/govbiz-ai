import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession
} from 'amazon-cognito-identity-js';
import { User } from '../types';

const userPool = new CognitoUserPool({
  UserPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID || '',
  ClientId: process.env.REACT_APP_COGNITO_APP_CLIENT_ID || '',
});

export class AuthService {
  static async signIn(email: string, password: string): Promise<CognitoUserSession> {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session) => {
          resolve(session);
        },
        onFailure: (error) => {
          reject(error);
        },
        newPasswordRequired: (userAttributes, requiredAttributes) => {
          reject(new Error('New password required'));
        },
      });
    });
  }

  static async signUp(
    email: string,
    password: string,
    attributes: { [key: string]: string }
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const cognitoUserAttributes = Object.keys(attributes).map(key =>
        new CognitoUserAttribute({
          Name: key,
          Value: attributes[key],
        })
      );

      userPool.signUp(email, password, cognitoUserAttributes, [], (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  static async confirmSignUp(email: string, confirmationCode: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmRegistration(confirmationCode, true, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  static async signOut(): Promise<void> {
    const currentUser = userPool.getCurrentUser();
    if (currentUser) {
      currentUser.signOut();
    }
    // Clear all stored tokens and user data
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('id_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('oauth_code');
    localStorage.removeItem('oauth_provider');
    localStorage.removeItem('oauth_timestamp');
  }

  static async getCurrentSession(): Promise<CognitoUserSession | null> {
    return new Promise((resolve) => {
      const currentUser = userPool.getCurrentUser();
      if (!currentUser) {
        resolve(null);
        return;
      }

      currentUser.getSession((error: any, session: CognitoUserSession | null) => {
        if (error || !session) {
          resolve(null);
          return;
        }
        resolve(session);
      });
    });
  }

  static async getCurrentUser(): Promise<User | null> {
    try {
      // First check if we have OAuth tokens stored
      const oauthIdToken = localStorage.getItem('id_token');
      if (oauthIdToken) {
        try {
          const tokenPayload = JSON.parse(atob(oauthIdToken.split('.')[1]));

          // Check if token is still valid
          const currentTime = Math.floor(Date.now() / 1000);
          if (tokenPayload.exp && tokenPayload.exp > currentTime) {
            const user: User = {
              id: tokenPayload.sub,
              email: tokenPayload.email || 'user@google-oauth.com',
              name: tokenPayload.name || `${tokenPayload.given_name} ${tokenPayload.family_name}` || 'OAuth User',
              companyId: tokenPayload['custom:company_id'] || 'oauth-company',
              role: tokenPayload['custom:role'] || 'user',
              subscriptionTier: tokenPayload['custom:subscription_tier'] || 'basic',
              tenantId: tokenPayload['custom:tenant_id'] || 'oauth-tenant',
            };

            localStorage.setItem('user', JSON.stringify(user));
            return user;
          }
        } catch (error) {
          console.error('Error parsing OAuth token:', error);
          // Clear invalid tokens
          localStorage.removeItem('id_token');
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }

      // Fall back to regular Cognito session
      const session = await this.getCurrentSession();
      if (!session) {
        // Check if we have a stored user (fallback)
        return this.getStoredUser();
      }

      const token = session.getIdToken().payload;
      const user: User = {
        id: token.sub,
        email: token.email,
        name: token.name || token.given_name + ' ' + token.family_name,
        companyId: token['custom:company_id'] || '',
        tenantId: token['custom:tenant_id'] || '',
        role: token['custom:role'] || 'user',
        subscriptionTier: token['custom:subscription_tier'] || 'basic',
      };

      localStorage.setItem('user', JSON.stringify(user));
      return user;
    } catch (error) {
      console.error('Error getting current user:', error);
      // Return stored user as final fallback
      return this.getStoredUser();
    }
  }

  static async getAccessToken(): Promise<string | null> {
    try {
      const session = await this.getCurrentSession();
      if (!session) {
        return null;
      }
      return session.getAccessToken().getJwtToken();
    } catch (error) {
      console.error('Error getting access token:', error);
      return null;
    }
  }

  static async forgotPassword(email: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.forgotPassword({
        onSuccess: (result) => {
          resolve(result);
        },
        onFailure: (error) => {
          reject(error);
        },
      });
    });
  }

  static async confirmPassword(
    email: string,
    confirmationCode: string,
    newPassword: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmPassword(confirmationCode, newPassword, {
        onSuccess: (result) => {
          resolve(result);
        },
        onFailure: (error) => {
          reject(error);
        },
      });
    });
  }

  static async refreshToken(): Promise<CognitoUserSession | null> {
    try {
      const currentUser = userPool.getCurrentUser();
      if (!currentUser) {
        return null;
      }

      return new Promise((resolve, reject) => {
        currentUser.getSession((error: any, session: CognitoUserSession | null) => {
          if (error || !session) {
            reject(error);
            return;
          }

          if (session.isValid()) {
            resolve(session);
            return;
          }

          const refreshToken = session.getRefreshToken();
          currentUser.refreshSession(refreshToken, (refreshError, newSession) => {
            if (refreshError) {
              reject(refreshError);
              return;
            }
            resolve(newSession);
          });
        });
      });
    } catch (error) {
      console.error('Error refreshing token:', error);
      return null;
    }
  }

  static isAuthenticated(): boolean {
    const currentUser = userPool.getCurrentUser();
    return currentUser !== null;
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

  // Google OAuth integration
  static async signInWithGoogle(): Promise<void> {
    const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      throw new Error('Google Client ID not configured');
    }

    // Use Cognito hosted UI with code flow and PKCE for better security
    const redirectUri = `${window.location.origin}/auth/callback`;
    const cognitoHostedUIUrl = `https://${process.env.REACT_APP_COGNITO_USER_POOL_DOMAIN}/login?identity_provider=Google&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&client_id=${process.env.REACT_APP_COGNITO_APP_CLIENT_ID}&scope=email+openid+profile`;

    window.location.href = cognitoHostedUIUrl;
  }

  // Handle OAuth callback
  static async handleOAuthCallback(): Promise<User | null> {
    try {
      // Check URL search params for authorization code or errors
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const error = urlParams.get('error');

      if (error) {
        throw new Error(`OAuth error: ${error}`);
      }

      if (code) {
        // Exchange authorization code for tokens
        const tokenResponse = await this.exchangeCodeForTokens(code);

        if (tokenResponse.id_token) {
          // Decode the ID token to get user information
          const tokenPayload = JSON.parse(atob(tokenResponse.id_token.split('.')[1]));

          const user: User = {
            id: tokenPayload.sub,
            email: tokenPayload.email || 'user@google-oauth.com',
            name: tokenPayload.name || `${tokenPayload.given_name} ${tokenPayload.family_name}` || 'Google User',
            companyId: tokenPayload['custom:company_id'] || 'google-company',
            role: tokenPayload['custom:role'] || 'user',
            subscriptionTier: tokenPayload['custom:subscription_tier'] || 'basic',
            tenantId: tokenPayload['custom:tenant_id'] || 'google-tenant',
          };

          // Store tokens and user info
          localStorage.setItem('access_token', tokenResponse.access_token);
          localStorage.setItem('id_token', tokenResponse.id_token);
          localStorage.setItem('refresh_token', tokenResponse.refresh_token);
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.setItem('oauth_provider', 'google');
          localStorage.setItem('oauth_timestamp', Date.now().toString());

          // Clean up the URL
          window.history.replaceState({}, document.title, window.location.pathname);

          return user;
        }
      }

      // Check URL fragment for tokens (implicit flow fallback)
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get('access_token');
      const idToken = hashParams.get('id_token');

      if (accessToken && idToken) {
        // Decode the ID token to get user information
        const tokenPayload = JSON.parse(atob(idToken.split('.')[1]));

        const user: User = {
          id: tokenPayload.sub,
          email: tokenPayload.email || 'user@google-oauth.com',
          name: tokenPayload.name || `${tokenPayload.given_name} ${tokenPayload.family_name}` || 'OAuth User',
          companyId: tokenPayload['custom:company_id'] || 'oauth-company',
          role: tokenPayload['custom:role'] || 'user',
          subscriptionTier: tokenPayload['custom:subscription_tier'] || 'basic',
          tenantId: tokenPayload['custom:tenant_id'] || 'oauth-tenant',
        };

        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('id_token', idToken);
        localStorage.setItem('user', JSON.stringify(user));
        return user;
      }

      throw new Error('No authorization code or tokens found in OAuth callback');
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  }

  // Exchange authorization code for tokens
  private static async exchangeCodeForTokens(code: string): Promise<any> {
    const redirectUri = `${window.location.origin}/auth/callback`;

    const tokenRequest = {
      grant_type: 'authorization_code',
      client_id: process.env.REACT_APP_COGNITO_APP_CLIENT_ID,
      code: code,
      redirect_uri: redirectUri,
    };

    const formBody = Object.keys(tokenRequest)
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent((tokenRequest as any)[key]))
      .join('&');

    const response = await fetch(`https://${process.env.REACT_APP_COGNITO_USER_POOL_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }
}