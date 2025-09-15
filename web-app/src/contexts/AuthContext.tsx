import React, { createContext, useContext, useReducer, useEffect, useRef, ReactNode } from 'react';
import { AuthService } from '../services/auth';
import { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  signIn: () => void;
  signUp: () => void;
  signOut: () => Promise<void>;
  signInWithGoogle: () => void;
  forgotPassword: () => void;
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
  const oauthProcessedRef = useRef(false);

  useEffect(() => {
    const checkAuthState = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });

        // Check for OAuth callback
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.has('code')) {
          console.log('🔍 OAuth callback detected in AuthContext');

          // Immediate check and prevention of duplicate execution
          if (oauthProcessedRef.current) {
            console.log('🛑 OAuth already processed by this component instance');
            dispatch({ type: 'SET_LOADING', payload: false });
            return;
          }

          // Get the authorization code
          const authCode = urlParams.get('code');

          if (!authCode) {
            console.log('🛑 No authorization code found');
            dispatch({ type: 'SET_LOADING', payload: false });
            return;
          }

          // Check if this specific code has already been processed
          const processedCode = localStorage.getItem('processed_oauth_code');
          if (processedCode === authCode) {
            console.log('🛑 This authorization code has already been processed');
            dispatch({ type: 'SET_LOADING', payload: false });
            return;
          }

          // Mark as processing immediately to prevent race conditions
          oauthProcessedRef.current = true;
          localStorage.setItem('processed_oauth_code', authCode);

          // Clear the URL immediately to prevent reprocessing
          window.history.replaceState({}, document.title, window.location.pathname);

          console.log('✅ OAuth processing started for code:', authCode);

          try {
            const user = await AuthService.handleOAuthCallback(authCode);
            if (user) {
              dispatch({ type: 'SIGN_IN_SUCCESS', payload: user });
              return;
            }
          } catch (error) {
            console.error('OAuth processing error:', error);
            dispatch({ type: 'SIGN_IN_ERROR', payload: 'OAuth authentication failed' });
            // Redirect to home page on OAuth error
            window.location.href = window.location.origin;
            return;
          } finally {
            // Clean up the processed code after some time
            setTimeout(() => {
              localStorage.removeItem('processed_oauth_code');
            }, 30000); // 30 seconds
          }
        }

        // Check for existing session
        const user = await AuthService.getCurrentUser();

        dispatch({ type: 'SET_USER', payload: user });
      } catch (error) {
        dispatch({ type: 'SET_USER', payload: null });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    checkAuthState();
  }, []);

  const signIn = (): void => {
    AuthService.signIn();
  };

  const signUp = (): void => {
    AuthService.signUp();
  };

  const signOut = async (): Promise<void> => {
    try {
      await AuthService.signOut();
      dispatch({ type: 'SIGN_OUT' });
    } catch (error) {
      // Handle error silently
    }
  };

  const signInWithGoogle = (): void => {
    AuthService.signInWithGoogle();
  };

  const forgotPassword = (): void => {
    AuthService.forgotPassword();
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
    forgotPassword,
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