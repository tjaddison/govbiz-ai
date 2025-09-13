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
    localStorage.removeItem('user');
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
      const session = await this.getCurrentSession();
      if (!session) {
        return null;
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
      return null;
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

    // Redirect to Cognito hosted UI for Google OAuth
    const cognitoHostedUIUrl = `https://${process.env.REACT_APP_COGNITO_DOMAIN}/oauth2/authorize?identity_provider=Google&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=CODE&client_id=${process.env.REACT_APP_COGNITO_APP_CLIENT_ID}&scope=email+openid+profile`;

    window.location.href = cognitoHostedUIUrl;
  }

  // Handle OAuth callback
  static async handleOAuthCallback(): Promise<User | null> {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (!code) {
      throw new Error('No authorization code found');
    }

    try {
      // Exchange code for tokens using Cognito
      const tokenEndpoint = `https://${process.env.REACT_APP_COGNITO_DOMAIN}/oauth2/token`;
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: process.env.REACT_APP_COGNITO_APP_CLIENT_ID || '',
          code: code,
          redirect_uri: window.location.origin,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to exchange code for tokens');
      }

      const tokens = await response.json();

      // Store tokens and get user info
      // This would typically involve setting up the Cognito session
      // For now, we'll return a mock user
      const user = await this.getCurrentUser();
      return user;
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  }
}