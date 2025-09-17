import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../../contexts/AuthContextManaged';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useAuth();
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    // Clear any existing timeout
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }

    // Prevent multiple redirects
    if (hasRedirectedRef.current) {
      return;
    }

    console.log('AuthCallback state:', {
      isAuthenticated,
      isLoading,
      error,
      timestamp: new Date().toISOString()
    });

    // If authentication is successful, redirect to dashboard immediately
    if (isAuthenticated && !isLoading) {
      console.log('✅ Authentication successful, redirecting to dashboard');
      hasRedirectedRef.current = true;
      navigate('/app/dashboard', { replace: true });
      return;
    }

    // If there's an error and loading is complete, redirect to home page after a delay
    if (error && !isLoading) {
      console.log('❌ Authentication error, redirecting to home page:', error);
      redirectTimeoutRef.current = setTimeout(() => {
        if (!hasRedirectedRef.current) {
          hasRedirectedRef.current = true;
          navigate('/', { replace: true });
        }
      }, 3000);
      return;
    }

    // If we're not loading and not authenticated and no error, wait longer then redirect
    // This handles cases where the OAuth processing might take a moment
    if (!isLoading && !isAuthenticated && !error) {
      console.log('⚠️ No authentication state after loading, will wait before redirecting to home');
      redirectTimeoutRef.current = setTimeout(() => {
        if (!hasRedirectedRef.current) {
          console.log('❌ Final redirect to home - authentication failed');
          hasRedirectedRef.current = true;
          navigate('/', { replace: true });
        }
      }, 12000); // Extended timeout for OAuth processing (12 seconds)
    }
  }, [isAuthenticated, isLoading, error, navigate]);

  useEffect(() => {
    // Cleanup timeout on unmount
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  if (error) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        p={3}
      >
        <Typography variant="h6" color="error" gutterBottom>
          Authentication Failed
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {error}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Redirecting to home page...
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      p={3}
    >
      <CircularProgress size={60} sx={{ mb: 3 }} />
      <Typography variant="h6" gutterBottom>
        Completing Sign In...
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Please wait while we finish setting up your account
      </Typography>
    </Box>
  );
};

export default AuthCallback;