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
  CircularProgress,
  Container
} from '@mui/material';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { ManagedAuthService } from '../../services/auth-managed';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      setLoading(false);
      return;
    }

    try {
      console.log('🔐 Requesting password reset...');
      await ManagedAuthService.resetPassword({ email: email.trim() });

      console.log('✅ Password reset request successful');
      setSuccess('Password reset code sent! Please check your email.');
      setStep('confirm');

    } catch (err) {
      console.error('❌ Password reset request failed:', err);

      if (err instanceof Error) {
        if (err.message.includes('UserNotFoundException')) {
          setError('No account found with this email address.');
        } else if (err.message.includes('LimitExceededException')) {
          setError('Too many requests. Please wait a moment before trying again.');
        } else {
          setError(err.message || 'Failed to send reset code. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    // Validation
    if (!confirmationCode.trim()) {
      setError('Please enter the confirmation code.');
      setLoading(false);
      return;
    }

    if (!newPassword) {
      setError('Please enter a new password.');
      setLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      console.log('🔐 Confirming password reset...');
      await ManagedAuthService.confirmResetPassword({
        email,
        confirmationCode: confirmationCode.trim(),
        newPassword,
      });

      console.log('✅ Password reset successful');
      setSuccess('Password reset successfully! You can now sign in with your new password.');

      // Navigate to login after a short delay
      setTimeout(() => {
        navigate('/auth/login');
      }, 2000);

    } catch (err) {
      console.error('❌ Password reset confirmation failed:', err);

      if (err instanceof Error) {
        if (err.message.includes('CodeMismatchException')) {
          setError('Invalid confirmation code. Please check your email and try again.');
        } else if (err.message.includes('ExpiredCodeException')) {
          setError('Confirmation code has expired. Please request a new one.');
        } else if (err.message.includes('InvalidPasswordException')) {
          setError('Password does not meet requirements. Please use at least 8 characters with numbers and symbols.');
        } else {
          setError(err.message || 'Password reset failed. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToRequest = () => {
    setStep('request');
    setConfirmationCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
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
                {step === 'request' ? 'Reset Password' : 'Set New Password'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {step === 'request'
                  ? 'Enter your email to receive a reset code'
                  : 'Enter the code from your email and set a new password'
                }
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

            {step === 'request' ? (
              <Box component="form" onSubmit={handleRequestReset} sx={{ mt: 1 }}>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="email"
                  label="Email Address"
                  name="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  type="email"
                />

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  sx={{ mt: 3, mb: 2, py: 1.5 }}
                  disabled={!email.trim() || loading}
                >
                  {loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={20} color="inherit" />
                      Sending...
                    </Box>
                  ) : (
                    'Send Reset Code'
                  )}
                </Button>

                <Box sx={{ textAlign: 'center', mt: 2 }}>
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
            ) : (
              <Box component="form" onSubmit={handleConfirmReset} sx={{ mt: 1 }}>
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
                />

                <TextField
                  margin="normal"
                  required
                  fullWidth
                  name="newPassword"
                  label="New Password"
                  type="password"
                  id="newPassword"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  helperText="Must be at least 8 characters"
                />

                <TextField
                  margin="normal"
                  required
                  fullWidth
                  name="confirmPassword"
                  label="Confirm New Password"
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  error={!!confirmPassword && newPassword !== confirmPassword}
                  helperText={
                    confirmPassword && newPassword !== confirmPassword
                      ? "Passwords don't match"
                      : ""
                  }
                />

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  sx={{ mt: 3, mb: 2, py: 1.5 }}
                  disabled={!confirmationCode.trim() || !newPassword || !confirmPassword || loading}
                >
                  {loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={20} color="inherit" />
                      Resetting...
                    </Box>
                  ) : (
                    'Reset Password'
                  )}
                </Button>

                <Box sx={{ textAlign: 'center', mt: 2 }}>
                  <Button
                    variant="text"
                    onClick={handleBackToRequest}
                    disabled={loading}
                    sx={{ textTransform: 'none' }}
                  >
                    Didn't receive code? Try again
                  </Button>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>

        <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 4 }}>
          © 2024 GovBizAI. Built for government contractors.
        </Typography>
      </Box>
    </Container>
  );
};

export default ForgotPassword;