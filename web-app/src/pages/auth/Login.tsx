import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
  Divider,
  CircularProgress,
  Container
} from '@mui/material';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { ManagedAuthService, SignInCredentials } from '../../services/auth-managed';
import { useAuth } from '../../contexts/AuthContextManaged';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState<SignInCredentials>({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    // Clear error when user starts typing
    if (error) {
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      console.log('🔐 Attempting managed login...');
      const user = await ManagedAuthService.signIn(formData);
      console.log('✅ Login successful, updating auth context');

      // Update auth context
      login(user);

      // Navigate to dashboard
      navigate('/app/dashboard');
    } catch (err) {
      console.error('❌ Login failed:', err);

      if (err instanceof Error) {
        // Handle specific error cases
        if (err.message === 'NEW_PASSWORD_REQUIRED') {
          setError('Please contact support to reset your password.');
        } else if (err.message === 'MFA_REQUIRED') {
          setError('Multi-factor authentication is required but not yet supported.');
        } else if (err.message.includes('UserNotConfirmedException')) {
          setError('Please check your email and confirm your account before signing in.');
        } else if (err.message.includes('NotAuthorizedException')) {
          setError('Invalid email or password. Please try again.');
        } else if (err.message.includes('UserNotFoundException')) {
          setError('No account found with this email address.');
        } else {
          setError(err.message || 'Login failed. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = formData.email && formData.password;

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Card sx={{ mt: 8, width: '100%', maxWidth: 400 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Typography variant="h4" component="h1" gutterBottom color="primary" fontWeight="bold">
                GovBizAI
              </Typography>
              <Typography variant="h6" component="h2" gutterBottom>
                Sign In
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Access your contract opportunity matching dashboard
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                autoFocus
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                type="email"
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                id="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2, py: 1.5 }}
                disabled={!isFormValid || loading}
              >
                {loading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={20} color="inherit" />
                    Signing In...
                  </Box>
                ) : (
                  'Sign In'
                )}
              </Button>

              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Link
                  component={RouterLink}
                  to="/auth/forgot-password"
                  variant="body2"
                  sx={{ textDecoration: 'none' }}
                >
                  Forgot your password?
                </Link>
              </Box>

              <Divider sx={{ my: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  New to GovBizAI?
                </Typography>
              </Divider>

              <Button
                fullWidth
                variant="outlined"
                component={RouterLink}
                to="/auth/signup"
                disabled={loading}
                sx={{ py: 1.5 }}
              >
                Create Account
              </Button>
            </Box>
          </CardContent>
        </Card>

        <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 4 }}>
          © 2024 GovBizAI. Built for government contractors.
        </Typography>
      </Box>
    </Container>
  );
};

export default Login;