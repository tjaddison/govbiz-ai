import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoUserAttribute,
  CognitoAccessToken,
  CognitoIdToken,
  CognitoRefreshToken
} from 'amazon-cognito-identity-js';
import AWS from 'aws-sdk';
import { User } from '../types';

// Cognito configuration from environment variables
const REGION = process.env.REACT_APP_COGNITO_REGION || 'us-east-1';
const USER_POOL_ID = process.env.REACT_APP_COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.REACT_APP_COGNITO_APP_CLIENT_ID;
const IDENTITY_POOL_ID = process.env.REACT_APP_COGNITO_IDENTITY_POOL_ID;
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

// Validate critical environment variables
if (!USER_POOL_ID) {
  console.error('REACT_APP_COGNITO_USER_POOL_ID is not configured');
}
if (!CLIENT_ID) {
  console.error('REACT_APP_COGNITO_APP_CLIENT_ID is not configured');
}

// Configure AWS
AWS.config.region = REGION;

// Create Cognito User Pool
const userPool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID!,
  ClientId: CLIENT_ID!,
});

// Configure Cognito Identity Pool for AWS resource access
if (IDENTITY_POOL_ID) {
  AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IDENTITY_POOL_ID,
  });
}

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface SignUpCredentials {
  email: string;
  password: string;
  name: string;
  companyName?: string;
}

export interface ConfirmSignUpParams {
  email: string;
  confirmationCode: string;
}

export interface ResetPasswordParams {
  email: string;
}

export interface ConfirmResetPasswordParams {
  email: string;
  confirmationCode: string;
  newPassword: string;
}

export class ManagedAuthService {
  // Sign in with email and password
  static async signIn(credentials: SignInCredentials): Promise<User> {
    console.log('🔐 [AUTH] signIn() called for:', credentials.email);

    return new Promise((resolve, reject) => {
      const { email, password } = credentials;

      const authenticationDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      console.log('🔐 [AUTH] Attempting authentication with Cognito...');
      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session: CognitoUserSession) => {
          console.log('✅ [AUTH] Cognito authentication successful');

          // Store tokens
          console.log('🔐 [AUTH] Storing tokens in localStorage...');
          this.storeTokens(session);

          // Get user attributes
          console.log('🔐 [AUTH] Getting user attributes...');
          cognitoUser.getUserAttributes((err, attributes) => {
            if (err) {
              console.error('❌ [AUTH] Failed to get user attributes:', err);
              console.error('❌ [AUTH] This will cause authentication to fail');
              reject(new Error('Failed to retrieve user information'));
              return;
            }

            console.log('✅ [AUTH] Got user attributes, creating user object...');
            const user = this.createUserFromAttributes(attributes || [], session);
            console.log('✅ [AUTH] Created user:', { id: user.id, email: user.email });

            console.log('🔐 [AUTH] Storing user in localStorage...');
            this.storeUser(user);

            // Configure AWS credentials with the new session
            console.log('🔐 [AUTH] Configuring AWS credentials...');
            this.configureAWSCredentials(session);

            console.log('✅ [AUTH] signIn() complete - will set isAuthenticated=true');
            resolve(user);
          });
        },
        onFailure: (err) => {
          console.error('❌ [AUTH] Cognito authentication failed:', err);
          console.error('❌ [AUTH] This will prevent isAuthenticated from being set to true');
          reject(new Error(err.message || 'Authentication failed'));
        },
        newPasswordRequired: (userAttributes, requiredAttributes) => {
          console.log('⚠️ [AUTH] New password required');
          reject(new Error('NEW_PASSWORD_REQUIRED'));
        },
        mfaRequired: (challengeName, challengeParameters) => {
          console.log('⚠️ [AUTH] MFA required');
          reject(new Error('MFA_REQUIRED'));
        },
      });
    });
  }

  // Sign up a new user
  static async signUp(credentials: SignUpCredentials): Promise<{ userSub: string }> {
    return new Promise((resolve, reject) => {
      const { email, password, name, companyName } = credentials;

      const attributeList: CognitoUserAttribute[] = [
        new CognitoUserAttribute({
          Name: 'email',
          Value: email,
        }),
        new CognitoUserAttribute({
          Name: 'name',
          Value: name,
        }),
      ];

      if (companyName) {
        attributeList.push(new CognitoUserAttribute({
          Name: 'custom:company_name',
          Value: companyName,
        }));
      }

      userPool.signUp(email, password, attributeList, [], (err, result) => {
        if (err) {
          console.error('Sign up failed:', err);
          reject(new Error(err.message || 'Sign up failed'));
          return;
        }

        if (!result) {
          reject(new Error('Sign up failed - no result'));
          return;
        }

        console.log('✅ Sign up successful, confirmation required');
        resolve({ userSub: result.userSub });
      });
    });
  }

  // Confirm sign up with verification code
  static async confirmSignUp(params: ConfirmSignUpParams): Promise<void> {
    return new Promise((resolve, reject) => {
      const { email, confirmationCode } = params;

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmRegistration(confirmationCode, true, (err, result) => {
        if (err) {
          console.error('Confirmation failed:', err);
          reject(new Error(err.message || 'Confirmation failed'));
          return;
        }

        console.log('✅ Email confirmation successful');
        resolve();
      });
    });
  }

  // Initiate password reset
  static async resetPassword(params: ResetPasswordParams): Promise<void> {
    return new Promise((resolve, reject) => {
      const { email } = params;

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.forgotPassword({
        onSuccess: () => {
          console.log('✅ Password reset code sent');
          resolve();
        },
        onFailure: (err) => {
          console.error('Password reset failed:', err);
          reject(new Error(err.message || 'Password reset failed'));
        },
      });
    });
  }

  // Confirm password reset with new password
  static async confirmResetPassword(params: ConfirmResetPasswordParams): Promise<void> {
    return new Promise((resolve, reject) => {
      const { email, confirmationCode, newPassword } = params;

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmPassword(confirmationCode, newPassword, {
        onSuccess: () => {
          console.log('✅ Password reset confirmed');
          resolve();
        },
        onFailure: (err) => {
          console.error('Password reset confirmation failed:', err);
          reject(new Error(err.message || 'Password reset confirmation failed'));
        },
      });
    });
  }

  // Sign out current user
  static async signOut(): Promise<void> {
    console.log('🚪 [AUTH] signOut() called - clearing authentication state');

    const currentUser = userPool.getCurrentUser();
    console.log('🚪 [AUTH] Current user before signout:', currentUser ? 'USER_EXISTS' : 'NO_USER');

    if (currentUser) {
      console.log('🚪 [AUTH] Signing out current user from Cognito...');
      currentUser.signOut();
    }

    // Clear all stored data
    console.log('🚪 [AUTH] Clearing all tokens and stored user data...');
    this.clearAllTokens();

    // Clear AWS credentials
    console.log('🚪 [AUTH] Clearing AWS credentials...');
    AWS.config.credentials = null;

    console.log('✅ [AUTH] User signed out - will set isAuthenticated=false');
  }

  // Get current authenticated user
  static async getCurrentUser(): Promise<User | null> {
    console.log('🔍 [AUTH] getCurrentUser() called - checking authentication state');

    // Check localStorage first for debugging
    const localStorageState = {
      hasIdToken: !!localStorage.getItem('id_token'),
      hasAccessToken: !!localStorage.getItem('access_token'),
      hasRefreshToken: !!localStorage.getItem('refresh_token'),
      hasUser: !!localStorage.getItem('user')
    };
    console.log('🔍 [AUTH] localStorage state:', localStorageState);

    return new Promise((resolve) => {
      const currentUser = userPool.getCurrentUser();
      console.log('🔍 [AUTH] userPool.getCurrentUser() result:', currentUser ? 'USER_FOUND' : 'NO_USER');

      if (!currentUser) {
        console.log('❌ [AUTH] No current user found - will set isAuthenticated=false');
        resolve(null);
        return;
      }

      console.log('🔍 [AUTH] Getting session for current user...');
      currentUser.getSession((err: any, session: CognitoUserSession | null) => {
        console.log('🔍 [AUTH] getSession() callback - error:', !!err, 'session:', !!session);

        if (err) {
          console.log('❌ [AUTH] Session error:', err.message || err);
          console.log('❌ [AUTH] Session error will cause isAuthenticated=false');
          resolve(null);
          return;
        }

        if (!session) {
          console.log('❌ [AUTH] No session found - will set isAuthenticated=false');
          resolve(null);
          return;
        }

        const isValid = session.isValid();
        console.log('🔍 [AUTH] Session validity check:', isValid);

        if (!isValid) {
          console.log('❌ [AUTH] Session is INVALID - will set isAuthenticated=false');
          // Log token expiry info
          const accessToken = session.getAccessToken();
          const idToken = session.getIdToken();
          console.log('🔍 [AUTH] Token expiry info:', {
            accessTokenExpiry: new Date(accessToken.getExpiration() * 1000),
            idTokenExpiry: new Date(idToken.getExpiration() * 1000),
            currentTime: new Date()
          });
          resolve(null);
          return;
        }

        console.log('✅ [AUTH] Session is VALID - getting user attributes...');
        currentUser.getUserAttributes((err, attributes) => {
          if (err) {
            console.log('❌ [AUTH] Failed to get user attributes:', err);
            console.log('❌ [AUTH] Attributes error will cause isAuthenticated=false');
            resolve(null);
            return;
          }

          if (!attributes) {
            console.log('❌ [AUTH] No attributes returned - will set isAuthenticated=false');
            resolve(null);
            return;
          }

          console.log('✅ [AUTH] Got user attributes - creating user object...');
          const user = this.createUserFromAttributes(attributes, session);
          console.log('✅ [AUTH] Created user object:', { id: user.id, email: user.email });

          this.configureAWSCredentials(session);
          console.log('✅ [AUTH] getCurrentUser() returning user - will set isAuthenticated=true');
          resolve(user);
        });
      });
    });
  }

  // Refresh session tokens
  static async refreshSession(): Promise<CognitoUserSession | null> {
    return new Promise((resolve) => {
      const currentUser = userPool.getCurrentUser();

      if (!currentUser) {
        resolve(null);
        return;
      }

      currentUser.getSession((err: any, session: CognitoUserSession | null) => {
        if (err || !session) {
          console.error('Failed to refresh session:', err);
          resolve(null);
          return;
        }

        if (session.isValid()) {
          this.storeTokens(session);
          this.configureAWSCredentials(session);
          console.log('✅ Session refreshed');
          resolve(session);
        } else {
          console.log('Session is invalid, cannot refresh');
          resolve(null);
        }
      });
    });
  }

  // Check if user has valid session
  static async hasValidSession(): Promise<boolean> {
    console.log('🔍 [AUTH] hasValidSession() called');

    try {
      const user = await this.getCurrentUser();
      const isValid = user !== null;
      console.log('🔍 [AUTH] hasValidSession() result:', isValid);
      return isValid;
    } catch (error) {
      console.error('❌ [AUTH] Error checking session validity:', error);
      console.log('❌ [AUTH] hasValidSession() returning false due to error');
      return false;
    }
  }

  // Resend confirmation code
  static async resendConfirmationCode(email: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.resendConfirmationCode((err, result) => {
        if (err) {
          console.error('Failed to resend confirmation code:', err);
          reject(new Error(err.message || 'Failed to resend confirmation code'));
          return;
        }

        console.log('✅ Confirmation code resent');
        resolve();
      });
    });
  }

  // Private helper methods
  private static createUserFromAttributes(
    attributes: CognitoUserAttribute[],
    session: CognitoUserSession
  ): User {
    const getValue = (name: string) =>
      attributes.find(attr => attr.getName() === name)?.getValue() || '';

    const accessToken = session.getAccessToken();
    const idToken = session.getIdToken();

    return {
      id: getValue('sub'),
      email: getValue('email'),
      name: this.extractUserNameFromAttributes(attributes),
      companyId: getValue('custom:company_id') || 'default-company',
      tenantId: getValue('custom:tenant_id') || getValue('custom:company_id') || 'default-tenant',
      role: (getValue('custom:role') as 'admin' | 'user' | 'viewer') || 'user',
      subscriptionTier: (getValue('custom:subscription_tier') as 'basic' | 'professional' | 'enterprise') || 'basic'
    };
  }

  // Extract user name from Cognito attributes with fallbacks
  private static extractUserNameFromAttributes(attributes: CognitoUserAttribute[]): string {
    const getValue = (name: string) =>
      attributes.find(attr => attr.getName() === name)?.getValue() || '';

    // Try different name fields in order of preference
    if (getValue('name') && typeof getValue('name') === 'string') {
      return getValue('name').trim();
    }

    if (getValue('given_name') || getValue('family_name')) {
      const fullName = `${getValue('given_name') || ''} ${getValue('family_name') || ''}`.trim();
      if (fullName) return fullName;
    }

    if (getValue('nickname') && typeof getValue('nickname') === 'string') {
      return getValue('nickname').trim();
    }

    if (getValue('email') && typeof getValue('email') === 'string') {
      // Extract name part from email
      const emailName = getValue('email').split('@')[0];
      return emailName.replace(/[._-]/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase());
    }

    return 'User';
  }

  private static storeTokens(session: CognitoUserSession): void {
    console.log('💾 [AUTH] storeTokens() - saving tokens to localStorage');
    localStorage.setItem('access_token', session.getAccessToken().getJwtToken());
    localStorage.setItem('id_token', session.getIdToken().getJwtToken());
    localStorage.setItem('refresh_token', session.getRefreshToken().getToken());
    console.log('💾 [AUTH] Tokens stored successfully');
  }

  private static storeUser(user: User): void {
    console.log('💾 [AUTH] storeUser() - saving user to localStorage:', { id: user.id, email: user.email });
    localStorage.setItem('user', JSON.stringify(user));
  }

  private static clearAllTokens(): void {
    console.log('🗑️ [AUTH] clearAllTokens() - removing all auth data from localStorage');

    const keysToRemove = [
      'user',
      'access_token',
      'id_token',
      'refresh_token',
    ];

    keysToRemove.forEach(key => {
      console.log('🗑️ [AUTH] Removing:', key);
      localStorage.removeItem(key);
    });

    console.log('🗑️ [AUTH] All tokens cleared from localStorage');
  }

  private static configureAWSCredentials(session: CognitoUserSession): void {
    if (!IDENTITY_POOL_ID) {
      console.warn('Identity Pool ID not configured, AWS resource access will be limited');
      return;
    }

    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: IDENTITY_POOL_ID,
      Logins: {
        [`cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`]: session.getIdToken().getJwtToken()
      }
    });

    // Refresh credentials
    (AWS.config.credentials as AWS.CognitoIdentityCredentials).refresh((error) => {
      if (error) {
        console.error('Failed to refresh AWS credentials:', error);
      } else {
        console.log('✅ AWS credentials configured');
      }
    });
  }

  // For Google Sign-In (optional, for future use)
  static async signInWithGoogle(): Promise<User> {
    // This would require additional setup with Google Identity Services
    // For now, throw an error to indicate it's not implemented
    throw new Error('Google Sign-In not implemented in managed login. Use email/password authentication.');
  }
}