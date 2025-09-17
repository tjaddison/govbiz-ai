import React from 'react';
import {
  Box,
  Button,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Stack,
  useTheme,
  alpha,
} from '@mui/material';
import {
  TrendingUp,
  Speed,
  Security,
  CheckCircle,
  ArrowForward,
  Business,
  Analytics,
  AutoAwesome,
} from '@mui/icons-material';
// Note: No longer using useAuth since we navigate to auth pages instead
import { useNavigate } from 'react-router-dom';

const LandingPage: React.FC = () => {
  const theme = useTheme();
  // No longer destructuring auth methods since we navigate to auth pages
  const navigate = useNavigate();

  const features = [
    {
      icon: <TrendingUp fontSize="large" />,
      title: 'Smart Contract Matching',
      description: 'AI-powered matching engine connects you with the most relevant government contract opportunities.',
    },
    {
      icon: <Speed fontSize="large" />,
      title: 'Real-time Notifications',
      description: 'Get instant alerts when new opportunities match your company profile and capabilities.',
    },
    {
      icon: <Analytics fontSize="large" />,
      title: 'Performance Analytics',
      description: 'Track your proposal success rates and optimize your bidding strategy with detailed insights.',
    },
    {
      icon: <Security fontSize="large" />,
      title: 'Secure & Compliant',
      description: 'Enterprise-grade security ensuring your sensitive business information stays protected.',
    },
  ];

  const benefits = [
    'Reduce proposal preparation time by 70%',
    'Increase win rates with AI-driven insights',
    'Never miss relevant opportunities again',
    'Streamline your government contracting workflow',
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box
        component="header"
        sx={{
          py: 2,
          px: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Business color="primary" fontSize="large" />
          <Typography variant="h5" fontWeight="bold" color="primary">
            GovBiz AI
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={() => navigate('/auth/login')}
            sx={{ minWidth: 100 }}
          >
            Sign In
          </Button>
          <Button
            variant="contained"
            onClick={() => navigate('/auth/signup')}
            sx={{ minWidth: 100 }}
          >
            Get Started
          </Button>
        </Stack>
      </Box>

      {/* Hero Section */}
      <Box
        sx={{
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`,
          py: { xs: 8, md: 12 },
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={6}>
              <Stack spacing={3}>
                <Chip
                  label="🚀 Now in Beta"
                  color="primary"
                  variant="outlined"
                  sx={{ alignSelf: 'flex-start' }}
                />
                <Typography
                  variant="h2"
                  component="h1"
                  fontWeight="bold"
                  sx={{
                    fontSize: { xs: '2.5rem', md: '3.5rem' },
                    lineHeight: 1.2,
                    background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  Win More Government Contracts with AI
                </Typography>
                <Typography
                  variant="h6"
                  color="text.secondary"
                  sx={{ maxWidth: 500, lineHeight: 1.6 }}
                >
                  Transform your government contracting strategy with intelligent opportunity matching,
                  automated proposal insights, and performance analytics.
                </Typography>
                <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => navigate('/auth/signup')}
                    endIcon={<ArrowForward />}
                    sx={{
                      py: 1.5,
                      px: 4,
                      fontSize: '1.1rem',
                      borderRadius: 2,
                    }}
                  >
                    Start Free Trial
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    onClick={() => navigate('/auth/login')}
                    sx={{
                      py: 1.5,
                      px: 4,
                      fontSize: '1.1rem',
                      borderRadius: 2,
                    }}
                  >
                    Sign In
                  </Button>
                </Stack>
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box
                sx={{
                  position: 'relative',
                  borderRadius: 3,
                  overflow: 'hidden',
                  boxShadow: theme.shadows[20],
                  background: alpha(theme.palette.background.paper, 0.9),
                  p: 4,
                  border: 1,
                  borderColor: alpha(theme.palette.primary.main, 0.2),
                }}
              >
                <Stack spacing={2}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <AutoAwesome color="primary" />
                    <Typography variant="h6" fontWeight="medium">
                      AI-Powered Matching
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Our advanced matching algorithm analyzes thousands of opportunities daily
                    to find the perfect contracts for your business.
                  </Typography>
                  <Box
                    sx={{
                      height: 120,
                      background: `linear-gradient(45deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.1)})`,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="h4" color="primary" fontWeight="bold">
                      🎯 95% Match
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ py: { xs: 8, md: 12 } }}>
        <Box sx={{ textAlign: 'center', mb: 8 }}>
          <Typography variant="h3" component="h2" fontWeight="bold" gutterBottom>
            Everything You Need to Win
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
            Comprehensive tools and insights to transform your government contracting success
          </Typography>
        </Box>

        <Grid container spacing={4}>
          {features.map((feature, index) => (
            <Grid item xs={12} md={6} lg={3} key={index}>
              <Card
                sx={{
                  height: '100%',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: theme.shadows[8],
                  },
                  border: 1,
                  borderColor: alpha(theme.palette.primary.main, 0.1),
                }}
              >
                <CardContent sx={{ p: 3, textAlign: 'center' }}>
                  <Box
                    sx={{
                      color: 'primary.main',
                      mb: 2,
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                  >
                    {feature.icon}
                  </Box>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    {feature.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {feature.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Benefits Section */}
      <Box sx={{ bgcolor: alpha(theme.palette.primary.main, 0.03), py: { xs: 8, md: 12 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="h3" fontWeight="bold" gutterBottom>
                Proven Results
              </Typography>
              <Typography variant="h6" color="text.secondary" paragraph>
                Join hundreds of government contractors who have transformed their business with GovBiz AI.
              </Typography>
              <Stack spacing={2}>
                {benefits.map((benefit, index) => (
                  <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <CheckCircle color="success" />
                    <Typography variant="body1">{benefit}</Typography>
                  </Box>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box
                sx={{
                  p: 4,
                  borderRadius: 3,
                  bgcolor: 'background.paper',
                  boxShadow: theme.shadows[8],
                  textAlign: 'center',
                }}
              >
                <Typography variant="h2" color="primary" fontWeight="bold" gutterBottom>
                  $2.5M+
                </Typography>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  In contracts won by our users
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Average contract value increase of 40% compared to traditional methods
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Container maxWidth="md" sx={{ py: { xs: 8, md: 12 }, textAlign: 'center' }}>
        <Typography variant="h3" fontWeight="bold" gutterBottom>
          Ready to Transform Your Business?
        </Typography>
        <Typography variant="h6" color="text.secondary" paragraph sx={{ mb: 4 }}>
          Start your free trial today and discover opportunities you never knew existed.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/auth/signup')}
            endIcon={<ArrowForward />}
            sx={{
              py: 2,
              px: 6,
              fontSize: '1.2rem',
              borderRadius: 2,
            }}
          >
            Start Free Trial
          </Button>
          <Button
            variant="outlined"
            size="large"
            onClick={() => window.open('mailto:support@govbiz.ai', '_blank')}
            sx={{
              py: 2,
              px: 6,
              fontSize: '1.2rem',
              borderRadius: 2,
            }}
          >
            Contact Sales
          </Button>
        </Stack>
      </Container>

      {/* Footer */}
      <Box
        component="footer"
        sx={{
          py: 4,
          px: 3,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: alpha(theme.palette.background.paper, 0.8),
          textAlign: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
          <Business color="primary" />
          <Typography variant="h6" fontWeight="bold" color="primary">
            GovBiz AI
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          © 2024 GovBiz AI. All rights reserved. Transforming government contracting with artificial intelligence.
        </Typography>
      </Box>
    </Box>
  );
};

export default LandingPage;