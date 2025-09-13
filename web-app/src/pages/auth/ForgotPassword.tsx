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
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';

const ForgotPassword: React.FC = () => {
  const [step, setStep] = useState<'email' | 'confirm'>('email');
  const [email, setEmail] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { forgotPassword, confirmPassword: confirmPasswordReset, error, clearError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError(null);
    clearError();

    try {
      await forgotPassword(email);
      setStep('confirm');
    } catch (err: any) {
      setLocalError(err.message || 'Failed to send password reset code');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError(null);
    clearError();

    if (newPassword !== confirmPassword) {
      setLocalError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setLocalError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }

    try {
      await confirmPasswordReset(email, confirmationCode, newPassword);
      setSuccess(true);

      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setLocalError(err.message || 'Password reset failed');
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
                Password Reset!
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Your password has been successfully reset. You can now sign in with your new password.
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
            Reset your password
          </Typography>
        </Box>

        <Card sx={{ width: '100%', maxWidth: 400 }}>
          <CardContent sx={{ p: 4 }}>
            {step === 'email' ? (
              <>
                <Typography variant="h4" component="h2" textAlign="center" mb={3}>
                  Forgot Password
                </Typography>

                <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
                  Enter your email address and we'll send you a password reset code.
                </Typography>

                {displayError && (
                  <Alert severity="error" sx={{ mb: 3 }}>
                    {displayError}
                  </Alert>
                )}

                <Box component="form" onSubmit={handleEmailSubmit}>
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

                  <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    size="large"
                    disabled={isLoading}
                    sx={{ mt: 3, mb: 2, py: 1.5 }}
                  >
                    {isLoading ? <CircularProgress size={24} /> : 'Send Reset Code'}
                  </Button>
                </Box>
              </>
            ) : (
              <>
                <Typography variant="h4" component="h2" textAlign="center" mb={3}>
                  Reset Password
                </Typography>

                <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
                  Enter the code from your email and your new password.
                </Typography>

                {displayError && (
                  <Alert severity="error" sx={{ mb: 3 }}>
                    {displayError}
                  </Alert>
                )}

                <Box component="form" onSubmit={handlePasswordReset}>
                  <TextField
                    fullWidth
                    label="Confirmation Code"
                    value={confirmationCode}
                    onChange={(e) => setConfirmationCode(e.target.value)}
                    required
                    margin="normal"
                    autoFocus
                    inputProps={{ maxLength: 6 }}
                  />
                  <TextField
                    fullWidth
                    label="New Password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    margin="normal"
                    autoComplete="new-password"
                    helperText="Must be at least 8 characters long"
                  />
                  <TextField
                    fullWidth
                    label="Confirm New Password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                    {isLoading ? <CircularProgress size={24} /> : 'Reset Password'}
                  </Button>
                </Box>
              </>
            )}

            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                <Link
                  to="/login"
                  style={{ textDecoration: 'none', color: '#1976d2' }}
                >
                  Back to Sign In
                </Link>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};

export default ForgotPassword;