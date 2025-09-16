import React, { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, error } = useAuth();
  const location = useLocation();

  useEffect(() => {
    console.log('ProtectedRoute state check:', {
      isAuthenticated,
      isLoading,
      error,
      path: location.pathname,
      timestamp: new Date().toISOString(),
      hasIdToken: !!localStorage.getItem('id_token'),
      hasUser: !!localStorage.getItem('user')
    });
  }, [isAuthenticated, isLoading, error, location.pathname]);

  // Show loading state while authentication is being determined
  if (isLoading) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        bgcolor="background.default"
      >
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          {error ? 'Authentication Error' : 'Verifying Authentication...'}
        </Typography>
        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 1, textAlign: 'center', maxWidth: 400 }}>
            {error}
          </Typography>
        )}
      </Box>
    );
  }

  // If not authenticated, redirect to home page
  if (!isAuthenticated) {
    console.log('ProtectedRoute: User not authenticated, redirecting to home page');
    return <Navigate to="/" state={{ from: location.pathname }} replace />;
  }

  console.log('ProtectedRoute: User authenticated, rendering protected content');
  return <>{children}</>;
};

export default ProtectedRoute;