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
  console.log('🔄 AuthReducer action:', action.type, action.type === 'SIGN_IN_SUCCESS' ? { userId: (action as any).payload?.id } : '');

  switch (action.type) {
    case 'SIGN_IN_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'SIGN_IN_SUCCESS':
      console.log('✅ AuthReducer: Processing SIGN_IN_SUCCESS', { userId: action.payload.id, email: action.payload.email });
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'SIGN_IN_ERROR':
      console.log('❌ AuthReducer: Processing SIGN_IN_ERROR', { error: action.payload });
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
      console.log('📊 AuthReducer: SET_USER action', {
        userPayload: action.payload,
        userId: action.payload?.id,
        willBeAuthenticated: action.payload !== null,
        currentlyAuthenticated: state.isAuthenticated
      });
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
    let isMounted = true;

    const checkAuthState = async () => {
      try {
        if (!isMounted) return;
        dispatch({ type: 'SET_LOADING', payload: true });

        // Check for OAuth callback
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.has('code')) {
          console.log('🔍 OAuth callback detected in AuthContext', {
            currentTokens: {
              hasAccessToken: !!localStorage.getItem('access_token'),
              hasIdToken: !!localStorage.getItem('id_token'),
              hasUser: !!localStorage.getItem('user')
            }
          });

          // Immediate check and prevention of duplicate execution
          if (oauthProcessedRef.current) {
            console.log('🛑 OAuth already processed by this component instance');
            if (isMounted) dispatch({ type: 'SET_LOADING', payload: false });
            return;
          }

          // Get the authorization code
          const authCode = urlParams.get('code');

          if (!authCode) {
            console.log('🛑 No authorization code found');
            if (isMounted) dispatch({ type: 'SET_LOADING', payload: false });
            return;
          }

          // Check if this specific code has already been processed
          const processedCode = localStorage.getItem('processed_oauth_code');
          const processingTimestamp = localStorage.getItem('oauth_processing_timestamp');
          const currentTime = Date.now();

          // Clear stale processing markers (older than 2 minutes)
          if (processingTimestamp && (currentTime - parseInt(processingTimestamp)) > 120000) {
            localStorage.removeItem('processed_oauth_code');
            localStorage.removeItem('oauth_processing_timestamp');
          }

          if (processedCode === authCode) {
            console.log('🛑 This authorization code has already been processed');
            // Check if we already have a valid session
            const existingUser = await AuthService.getCurrentUser();
            if (existingUser && isMounted) {
              dispatch({ type: 'SIGN_IN_SUCCESS', payload: existingUser });
              return;
            }
            if (isMounted) dispatch({ type: 'SET_LOADING', payload: false });
            return;
          }

          // Mark as processing immediately to prevent race conditions
          oauthProcessedRef.current = true;
          localStorage.setItem('processed_oauth_code', authCode);
          localStorage.setItem('oauth_processing_timestamp', currentTime.toString());

          // Clear the URL immediately to prevent reprocessing
          window.history.replaceState({}, document.title, window.location.pathname);

          console.log('✅ OAuth processing started for code:', authCode.substring(0, 10) + '...');

          try {
            const user = await AuthService.handleOAuthCallback(authCode);
            console.log('📊 OAuth callback result:', {
              userReceived: !!user,
              userId: user?.id,
              userEmail: user?.email,
              isMounted: isMounted
            });

            if (user) {
              console.log('✅ OAuth processing successful, dispatching SIGN_IN_SUCCESS (isMounted:', isMounted, ')');
              // Dispatch even if component unmounted to ensure state is updated
              dispatch({ type: 'SIGN_IN_SUCCESS', payload: user });
              console.log('✅ SIGN_IN_SUCCESS dispatched successfully');
              return;
            } else {
              console.error('OAuth processing failed - no user returned');
              // Dispatch error even if component unmounted
              dispatch({ type: 'SIGN_IN_ERROR', payload: 'Authentication failed - no user data' });
              return;
            }
          } catch (error) {
            console.error('OAuth processing error:', error);
            const errorMessage = error instanceof Error ? error.message : 'OAuth authentication failed';
            // Dispatch error even if component unmounted
            dispatch({ type: 'SIGN_IN_ERROR', payload: errorMessage });

            // Only redirect on specific errors, not network issues
            if (error instanceof Error && error.message.includes('Invalid')) {
              setTimeout(() => {
                window.location.href = window.location.origin;
              }, 2000);
            }
            return;
          } finally {
            // Clean up the processed code after some time
            setTimeout(() => {
              localStorage.removeItem('processed_oauth_code');
              localStorage.removeItem('oauth_processing_timestamp');
            }, 30000); // 30 seconds
          }
        }

        // Always check for existing session if no OAuth processing occurred
        // This ensures authentication state is restored on component remount
        if (!oauthProcessedRef.current) {
          console.log('🔍 Checking for existing session');
          const user = await AuthService.getCurrentUser();
          if (isMounted) {
            dispatch({ type: 'SET_USER', payload: user });
            if (user) {
              console.log('✅ Existing session found for user:', user.email);
            } else {
              console.log('🛑 No existing session found');
            }
          }
        } else {
          console.log('🔄 OAuth processing completed in previous session');
        }
      } catch (error) {
        console.error('AuthContext checkAuthState error:', error);
        if (isMounted) {
          dispatch({ type: 'SET_USER', payload: null });
        }
      } finally {
        // For OAuth processing, loading state is handled by SIGN_IN_SUCCESS/ERROR actions
        // For regular session checks, set loading to false
        if (!oauthProcessedRef.current) {
          console.log('🔄 Setting loading to false in finally block');
          dispatch({ type: 'SET_LOADING', payload: false });
        } else {
          console.log('🔄 OAuth processing handled loading state, skipping finally block loading update');
        }
      }
    };

    checkAuthState();

    // Cleanup function
    return () => {
      isMounted = false;
    };
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
  
  // Debug logging for authentication state
  console.log('🔍 useAuth called:', {
    isAuthenticated: context.isAuthenticated,
    isLoading: context.isLoading,
    hasUser: !!context.user,
    userId: context.user?.id,
    error: context.error,
    timestamp: new Date().toISOString()
  });

  return context;
};