import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Container,
  MenuItem,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

const Register: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    companyName: '',
    phone: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { signUp, isAuthenticated, error, clearError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError(null);
    clearError();

    if (formData.password !== formData.confirmPassword) {
      setLocalError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setLocalError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }

    try {
      const attributes = {
        name: formData.name,
        phone_number: formData.phone,
        'custom:company_name': formData.companyName,
      };

      await signUp(formData.email, formData.password, attributes);
      setSuccess(true);

      setTimeout(() => {
        navigate('/confirm-signup', {
          state: { email: formData.email }
        });
      }, 2000);
    } catch (err: any) {
      setLocalError(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const displayError = error || localError;

  if (success) {
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
          <Card sx={{ width: '100%', maxWidth: 400 }}>
            <CardContent sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h4" component="h2" mb={2} color="success.main">
                Registration Successful!
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Please check your email for a confirmation code.
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Container>
    );
  }

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
            Create your account
          </Typography>
        </Box>

        <Card sx={{ width: '100%', maxWidth: 400 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h4" component="h2" textAlign="center" mb={3}>
              Sign Up
            </Typography>

            {displayError && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {displayError}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Full Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                margin="normal"
                autoComplete="name"
                autoFocus
              />
              <TextField
                fullWidth
                label="Email Address"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
                margin="normal"
                autoComplete="email"
              />
              <TextField
                fullWidth
                label="Company Name"
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                required
                margin="normal"
                autoComplete="organization"
              />
              <TextField
                fullWidth
                label="Phone Number"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                margin="normal"
                autoComplete="tel"
                placeholder="+1234567890"
              />
              <TextField
                fullWidth
                label="Password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                required
                margin="normal"
                autoComplete="new-password"
                helperText="Must be at least 8 characters long"
              />
              <TextField
                fullWidth
                label="Confirm Password"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                margin="normal"
                autoComplete="new-password"
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={isLoading}
                sx={{ mt: 3, mb: 2, py: 1.5 }}
              >
                {isLoading ? <CircularProgress size={24} /> : 'Create Account'}
              </Button>
            </Box>

            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Already have an account?{' '}
                <Link
                  to="/login"
                  style={{ textDecoration: 'none', color: '#1976d2' }}
                >
                  Sign in
                </Link>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};

export default Register;