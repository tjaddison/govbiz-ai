import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { ManagedAuthService } from '../services/auth-managed';
import { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (user: User) => void;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}

type AuthContextType = AuthState & AuthActions;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: User }
  | { type: 'AUTH_ERROR'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_USER'; payload: User | null };

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  console.log('🔄 AuthReducer action:', action.type, action.type === 'AUTH_SUCCESS' ? { userId: (action as any).payload?.id } : '');

  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'AUTH_SUCCESS':
      console.log('✅ AuthReducer: Processing AUTH_SUCCESS', { userId: action.payload.id, email: action.payload.email });
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'AUTH_ERROR':
      console.log('❌ AuthReducer: Processing AUTH_ERROR', action.payload);
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };
    case 'AUTH_LOGOUT':
      console.log('🚪 AuthReducer: Processing AUTH_LOGOUT');
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
      console.log('👤 AuthReducer: Processing SET_USER', action.payload ? { userId: action.payload.id } : 'null');
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        isLoading: false,
      };
    default:
      return state;
  }
};

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true, // Start with loading true to check existing session
  error: null,
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing session on mount
  useEffect(() => {
    let isMounted = true;

    const checkExistingSession = async () => {
      console.log('🔍 Checking for existing session...');
      dispatch({ type: 'AUTH_START' });

      try {
        const user = await ManagedAuthService.getCurrentUser();

        if (isMounted) {
          if (user) {
            console.log('✅ Found existing session for user:', user.email);
            dispatch({ type: 'SET_USER', payload: user });
          } else {
            console.log('🛑 No existing session found');
            dispatch({ type: 'SET_USER', payload: null });
          }
        }
      } catch (error) {
        console.error('❌ Error checking existing session:', error);
        if (isMounted) {
          dispatch({ type: 'SET_USER', payload: null });
        }
      }
    };

    checkExistingSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // Login function (called after successful authentication)
  const login = (user: User) => {
    console.log('✅ Login called with user:', user.email);
    dispatch({ type: 'AUTH_SUCCESS', payload: user });
  };

  // Logout function
  const logout = async () => {
    console.log('🚪 Logout initiated');
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      await ManagedAuthService.signOut();
      console.log('✅ Logout successful');
      dispatch({ type: 'AUTH_LOGOUT' });
    } catch (error) {
      console.error('❌ Logout error:', error);
      // Even if logout fails, clear the local state
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  };

  // Refresh user data
  const refreshUser = async () => {
    console.log('🔄 Refreshing user data...');

    try {
      const user = await ManagedAuthService.getCurrentUser();
      if (user) {
        console.log('✅ User data refreshed');
        dispatch({ type: 'SET_USER', payload: user });
      } else {
        console.log('🛑 No user found during refresh');
        dispatch({ type: 'SET_USER', payload: null });
      }
    } catch (error) {
      console.error('❌ Error refreshing user:', error);
      dispatch({ type: 'AUTH_ERROR', payload: 'Failed to refresh user data' });
    }
  };

  // Clear error
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const contextValue: AuthContextType = {
    ...state,
    login,
    logout,
    clearError,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};