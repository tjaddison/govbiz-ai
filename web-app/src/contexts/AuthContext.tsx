import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AuthService } from '../services/auth';
import { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, attributes: { [key: string]: string }) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  confirmSignUp: (email: string, confirmationCode: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  confirmPassword: (email: string, confirmationCode: string, newPassword: string) => Promise<void>;
  clearError: () => void;
}

type AuthContextType = AuthState & AuthActions;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthAction =
  | { type: 'SIGN_IN_START' }
  | { type: 'SIGN_IN_SUCCESS'; payload: User }
  | { type: 'SIGN_IN_ERROR'; payload: string }
  | { type: 'SIGN_OUT' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_USER'; payload: User | null };

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SIGN_IN_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'SIGN_IN_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'SIGN_IN_ERROR':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };
    case 'SIGN_OUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: action.payload !== null,
        isLoading: false,
      };
    default:
      return state;
  }
};

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      // Check for OAuth callback
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('code')) {
        try {
          const user = await AuthService.handleOAuthCallback();
          if (user) {
            dispatch({ type: 'SIGN_IN_SUCCESS', payload: user });
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          }
        } catch (error) {
          console.error('OAuth callback error:', error);
          dispatch({ type: 'SIGN_IN_ERROR', payload: 'OAuth authentication failed' });
          return;
        }
      }

      // Check for existing session
      const user = await AuthService.getCurrentUser();
      dispatch({ type: 'SET_USER', payload: user });
    } catch (error) {
      console.error('Auth state check error:', error);
      dispatch({ type: 'SET_USER', payload: null });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const signIn = async (email: string, password: string): Promise<void> => {
    try {
      dispatch({ type: 'SIGN_IN_START' });
      await AuthService.signIn(email, password);
      const user = await AuthService.getCurrentUser();
      if (!user) {
        throw new Error('Failed to get user information');
      }
      dispatch({ type: 'SIGN_IN_SUCCESS', payload: user });
    } catch (error: any) {
      const errorMessage = error.message || 'Sign in failed';
      dispatch({ type: 'SIGN_IN_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const signUp = async (
    email: string,
    password: string,
    attributes: { [key: string]: string }
  ): Promise<void> => {
    try {
      dispatch({ type: 'SIGN_IN_START' });
      await AuthService.signUp(email, password, attributes);
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error: any) {
      const errorMessage = error.message || 'Sign up failed';
      dispatch({ type: 'SIGN_IN_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await AuthService.signOut();
      dispatch({ type: 'SIGN_OUT' });
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    try {
      await AuthService.signInWithGoogle();
    } catch (error: any) {
      const errorMessage = error.message || 'Google sign in failed';
      dispatch({ type: 'SIGN_IN_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const confirmSignUp = async (email: string, confirmationCode: string): Promise<void> => {
    try {
      dispatch({ type: 'SIGN_IN_START' });
      await AuthService.confirmSignUp(email, confirmationCode);
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error: any) {
      const errorMessage = error.message || 'Confirmation failed';
      dispatch({ type: 'SIGN_IN_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const forgotPassword = async (email: string): Promise<void> => {
    try {
      dispatch({ type: 'SIGN_IN_START' });
      await AuthService.forgotPassword(email);
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error: any) {
      const errorMessage = error.message || 'Forgot password request failed';
      dispatch({ type: 'SIGN_IN_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const confirmPassword = async (
    email: string,
    confirmationCode: string,
    newPassword: string
  ): Promise<void> => {
    try {
      dispatch({ type: 'SIGN_IN_START' });
      await AuthService.confirmPassword(email, confirmationCode, newPassword);
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error: any) {
      const errorMessage = error.message || 'Password reset failed';
      dispatch({ type: 'SIGN_IN_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const clearError = (): void => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const value: AuthContextType = {
    ...state,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    confirmSignUp,
    forgotPassword,
    confirmPassword,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};