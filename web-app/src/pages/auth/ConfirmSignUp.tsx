import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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

const ConfirmSignUp: React.FC = () => {
  const [confirmationCode, setConfirmationCode] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { confirmSignUp, error, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const emailFromState = (location.state as any)?.email;
    if (emailFromState) {
      setEmail(emailFromState);
    }
  }, [location]);

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
      await confirmSignUp(email, confirmationCode);
      setSuccess(true);

      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setLocalError(err.message || 'Confirmation failed');
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
                Account Confirmed!
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Your account has been successfully confirmed. You can now sign in.
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
            Confirm your account
          </Typography>
        </Box>

        <Card sx={{ width: '100%', maxWidth: 400 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h4" component="h2" textAlign="center" mb={3}>
              Enter Confirmation Code
            </Typography>

            <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
              We sent a confirmation code to your email address. Please enter it below.
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
              />
              <TextField
                fullWidth
                label="Confirmation Code"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                required
                margin="normal"
                autoFocus
                inputProps={{ maxLength: 6 }}
                helperText="Enter the 6-digit code from your email"
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={isLoading}
                sx={{ mt: 3, mb: 2, py: 1.5 }}
              >
                {isLoading ? <CircularProgress size={24} /> : 'Confirm Account'}
              </Button>
            </Box>

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

export default ConfirmSignUp;