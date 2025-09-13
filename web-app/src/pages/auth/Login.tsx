import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Divider,
  Alert,
  CircularProgress,
  Container,
} from '@mui/material';
import { Google as GoogleIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { signIn, signInWithGoogle, isAuthenticated, error, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError(null);
    clearError();

    try {
      await signIn(email, password);
    } catch (err: any) {
      setLocalError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setLocalError(null);
    clearError();

    try {
      await signInWithGoogle();
    } catch (err: any) {
      setLocalError(err.message || 'Google sign in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const displayError = error || localError;

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          py: 4,
        }}
      >
        <Box sx={{ mb: 4, textAlign: 'center' }}>
          <Typography variant="h3" component="h1" fontWeight={700} color="primary">
            GovBiz AI
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mt: 1 }}>
            Government Contract Opportunity Matching
          </Typography>
        </Box>

        <Card sx={{ width: '100%', maxWidth: 400 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h4" component="h2" textAlign="center" mb={3}>
              Sign In
            </Typography>

            {displayError && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {displayError}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                margin="normal"
                autoComplete="email"
                autoFocus
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                margin="normal"
                autoComplete="current-password"
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={isLoading}
                sx={{ mt: 3, mb: 2, py: 1.5 }}
              >
                {isLoading ? <CircularProgress size={24} /> : 'Sign In'}
              </Button>
            </Box>

            <Divider sx={{ my: 3 }}>OR</Divider>

            <Button
              fullWidth
              variant="outlined"
              size="large"
              startIcon={<GoogleIcon />}
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              sx={{ py: 1.5 }}
            >
              Continue with Google
            </Button>

            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                <Link
                  to="/forgot-password"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  Forgot your password?
                </Link>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Don't have an account?{' '}
                <Link
                  to="/register"
                  style={{ textDecoration: 'none', color: '#1976d2' }}
                >
                  Sign up
                </Link>
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>
          © 2025 GovBiz AI. All rights reserved.
        </Typography>
      </Box>
    </Container>
  );
};

export default Login;