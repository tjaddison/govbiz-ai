import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
  CircularProgress,
  Container
} from '@mui/material';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { ManagedAuthService } from '../../services/auth-managed';

const ConfirmSignUp: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Get email from localStorage (set during signup)
    const signupEmail = localStorage.getItem('signup_email');
    if (signupEmail) {
      setEmail(signupEmail);
    } else {
      // If no email in storage, redirect to signup
      navigate('/auth/signup');
    }
  }, [navigate]);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!confirmationCode.trim()) {
      setError('Please enter the confirmation code.');
      setLoading(false);
      return;
    }

    try {
      console.log('🔐 Attempting email confirmation...');
      await ManagedAuthService.confirmSignUp({
        email,
        confirmationCode: confirmationCode.trim(),
      });

      console.log('✅ Email confirmation successful');
      setSuccess('Email confirmed successfully! You can now sign in.');

      // Clear stored email
      localStorage.removeItem('signup_email');

      // Navigate to login after a short delay
      setTimeout(() => {
        navigate('/auth/login');
      }, 2000);

    } catch (err) {
      console.error('❌ Email confirmation failed:', err);

      if (err instanceof Error) {
        if (err.message.includes('CodeMismatchException')) {
          setError('Invalid confirmation code. Please check your email and try again.');
        } else if (err.message.includes('ExpiredCodeException')) {
          setError('Confirmation code has expired. Please request a new one.');
        } else if (err.message.includes('NotAuthorizedException')) {
          setError('User is already confirmed. You can sign in now.');
          setTimeout(() => {
            navigate('/auth/login');
          }, 2000);
        } else {
          setError(err.message || 'Confirmation failed. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setResendLoading(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('📧 Resending confirmation code...');
      await ManagedAuthService.resendConfirmationCode(email);
      setSuccess('Confirmation code sent! Please check your email.');
    } catch (err) {
      console.error('❌ Failed to resend confirmation code:', err);
      if (err instanceof Error) {
        setError(err.message || 'Failed to resend confirmation code.');
      } else {
        setError('Failed to resend confirmation code. Please try again.');
      }
    } finally {
      setResendLoading(false);
    }
  };

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
                Confirm Your Email
              </Typography>
              <Typography variant="body2" color="text.secondary">
                We sent a confirmation code to:
              </Typography>
              <Typography variant="body2" fontWeight="bold" sx={{ mt: 1 }}>
                {email}
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

            <Box component="form" onSubmit={handleConfirm} sx={{ mt: 2 }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="confirmationCode"
                label="Confirmation Code"
                name="confirmationCode"
                autoComplete="one-time-code"
                autoFocus
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                disabled={loading}
                placeholder="Enter 6-digit code"
                inputProps={{
                  maxLength: 6,
                  pattern: '[0-9]*',
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2, py: 1.5 }}
                disabled={!confirmationCode.trim() || loading}
              >
                {loading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={20} color="inherit" />
                    Confirming...
                  </Box>
                ) : (
                  'Confirm Email'
                )}
              </Button>

              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Didn't receive the code?
                </Typography>
                <Button
                  variant="text"
                  onClick={handleResendCode}
                  disabled={resendLoading || loading}
                  sx={{ textTransform: 'none' }}
                >
                  {resendLoading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={16} />
                      Sending...
                    </Box>
                  ) : (
                    'Resend Code'
                  )}
                </Button>
              </Box>

              <Box sx={{ textAlign: 'center', mt: 3 }}>
                <Link
                  component={RouterLink}
                  to="/auth/login"
                  variant="body2"
                  sx={{ textDecoration: 'none' }}
                >
                  Back to Sign In
                </Link>
              </Box>
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

export default ConfirmSignUp;