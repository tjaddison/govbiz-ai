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
  Container,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { ManagedAuthService, SignUpCredentials } from '../../services/auth-managed';

const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<SignUpCredentials & { confirmPassword: string; agreeToTerms: boolean }>({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    companyName: '',
    agreeToTerms: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Clear error when user starts typing
    if (error) {
      setError(null);
    }
  };

  const validateForm = () => {
    if (!formData.email || !formData.password || !formData.name) {
      setError('Please fill in all required fields.');
      return false;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }

    if (!formData.agreeToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!validateForm()) {
      setLoading(false);
      return;
    }

    try {
      console.log('🔐 Attempting managed sign up...');

      const { confirmPassword, agreeToTerms, ...signUpData } = formData;
      const result = await ManagedAuthService.signUp(signUpData);

      console.log('✅ Sign up successful:', result);
      setSuccess('Account created successfully! Please check your email for a confirmation code.');

      // Store email for confirmation page
      localStorage.setItem('signup_email', formData.email);

      // Navigate to confirmation page after a short delay
      setTimeout(() => {
        navigate('/auth/confirm-signup');
      }, 2000);

    } catch (err) {
      console.error('❌ Sign up failed:', err);

      if (err instanceof Error) {
        // Handle specific error cases
        if (err.message.includes('UsernameExistsException')) {
          setError('An account with this email already exists. Please try signing in instead.');
        } else if (err.message.includes('InvalidPasswordException')) {
          setError('Password does not meet requirements. Please use at least 8 characters with numbers and symbols.');
        } else if (err.message.includes('InvalidParameterException')) {
          setError('Please check your input and try again.');
        } else {
          setError(err.message || 'Sign up failed. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = formData.email &&
                     formData.password &&
                     formData.confirmPassword &&
                     formData.name &&
                     formData.agreeToTerms &&
                     formData.password === formData.confirmPassword;

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Card sx={{ mt: 4, width: '100%', maxWidth: 400 }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Typography variant="h4" component="h1" gutterBottom color="primary" fontWeight="bold">
                GovBizAI
              </Typography>
              <Typography variant="h6" component="h2" gutterBottom>
                Create Account
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Join thousands of contractors finding opportunities
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {success && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {success}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="name"
                label="Full Name"
                name="name"
                autoComplete="name"
                autoFocus
                value={formData.name}
                onChange={handleChange}
                disabled={loading}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                type="email"
              />

              <TextField
                margin="normal"
                fullWidth
                id="companyName"
                label="Company Name (Optional)"
                name="companyName"
                autoComplete="organization"
                value={formData.companyName}
                onChange={handleChange}
                disabled={loading}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                id="password"
                autoComplete="new-password"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                helperText="Must be at least 8 characters"
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label="Confirm Password"
                type="password"
                id="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={loading}
                error={!!formData.confirmPassword && formData.password !== formData.confirmPassword}
                helperText={
                  formData.confirmPassword && formData.password !== formData.confirmPassword
                    ? "Passwords don't match"
                    : ""
                }
              />

              <FormControlLabel
                control={
                  <Checkbox
                    name="agreeToTerms"
                    checked={formData.agreeToTerms}
                    onChange={handleChange}
                    disabled={loading}
                    color="primary"
                  />
                }
                label={
                  <Typography variant="body2">
                    I agree to the{' '}
                    <Link href="#" onClick={(e) => e.preventDefault()}>
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link href="#" onClick={(e) => e.preventDefault()}>
                      Privacy Policy
                    </Link>
                  </Typography>
                }
                sx={{ mt: 1 }}
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
                    Creating Account...
                  </Box>
                ) : (
                  'Create Account'
                )}
              </Button>

              <Divider sx={{ my: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Already have an account?
                </Typography>
              </Divider>

              <Button
                fullWidth
                variant="outlined"
                component={RouterLink}
                to="/auth/login"
                disabled={loading}
                sx={{ py: 1.5 }}
              >
                Sign In
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

export default SignUp;