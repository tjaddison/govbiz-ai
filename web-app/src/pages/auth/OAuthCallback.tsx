import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

const OAuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useAuth();

  useEffect(() => {
    // If authentication is successful, redirect to dashboard
    if (isAuthenticated && !isLoading) {
      navigate('/dashboard', { replace: true });
    }

    // If there's an error and loading is complete, redirect to login after a delay
    if (error && !isLoading) {
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 3000);
    }

    // If we're not loading and not authenticated and no error, wait a bit then redirect
    // This handles cases where the OAuth processing might take a moment
    if (!isLoading && !isAuthenticated && !error) {
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 5000);
    }
  }, [isAuthenticated, isLoading, error, navigate]);

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
          Redirecting to login page...
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

export default OAuthCallback;