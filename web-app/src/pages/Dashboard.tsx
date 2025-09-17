import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Chip,
  IconButton,
  Alert,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Work as WorkIcon,
  Assessment as AssessmentIcon,
  Notifications as NotificationsIcon,
  Business as BusinessIcon,
  Description as DocumentIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContextManaged';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: apiService.getAnalytics,
  });

  const { data: recentMatches, isLoading: matchesLoading } = useQuery({
    queryKey: ['recent-matches'],
    queryFn: () => apiService.getMatches(1, 5),
  });

  const { data: companyProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['company-profile'],
    queryFn: apiService.getCompanyProfile,
  });

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'HIGH':
        return 'success';
      case 'MEDIUM':
        return 'warning';
      case 'LOW':
        return 'info';
      default:
        return 'default';
    }
  };

  const getProfileCompleteness = () => {
    if (!companyProfile) return 0;

    const fields = [
      companyProfile.company_name,
      companyProfile.primary_contact_email,
      companyProfile.primary_contact_name,
      companyProfile.capability_statement,
      companyProfile.naics_codes?.length > 0,
      companyProfile.locations?.length > 0,
    ];

    const completedFields = fields.filter(Boolean).length;
    return Math.round((completedFields / fields.length) * 100);
  };

  const stats = [
    {
      title: 'Total Matches',
      value: analytics?.totalMatches || 0,
      icon: <WorkIcon />,
      color: '#1976d2',
      change: '+12%',
    },
    {
      title: 'High Confidence',
      value: analytics?.highConfidenceMatches || 0,
      icon: <TrendingUpIcon />,
      color: '#2e7d32',
      change: '+8%',
    },
    {
      title: 'Win Rate',
      value: `${analytics?.winRate || 0}%`,
      icon: <AssessmentIcon />,
      color: '#ed6c02',
      change: '+3%',
    },
    {
      title: 'Pursued',
      value: analytics?.pursuedOpportunities || 0,
      icon: <NotificationsIcon />,
      color: '#9c27b0',
      change: '+15%',
    },
  ];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            Welcome back, {user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'User'}!
          </Typography>
          <Typography variant="body1" color="text.secondary" mt={1}>
            Here's what's happening with your government contract opportunities.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<WorkIcon />}
          onClick={() => navigate('/matches')}
        >
          View All Matches
        </Button>
      </Box>

      {/* Profile Completeness Alert */}
      {!profileLoading && getProfileCompleteness() < 80 && (
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => navigate('/company/profile')}
            >
              Complete Profile
            </Button>
          }
          sx={{ mb: 3 }}
        >
          Your company profile is {getProfileCompleteness()}% complete. Complete your profile to improve match accuracy.
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={3} mb={4}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {stat.title}
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {analyticsLoading ? '-' : stat.value}
                    </Typography>
                    <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
                      {stat.change} this week
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      backgroundColor: stat.color + '20',
                      borderRadius: 2,
                      p: 1.5,
                      color: stat.color,
                    }}
                  >
                    {stat.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Recent Matches */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h6" fontWeight={600}>
                  Recent Matches
                </Typography>
                <Button
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => navigate('/matches')}
                >
                  View All
                </Button>
              </Box>

              {matchesLoading ? (
                <LinearProgress />
              ) : recentMatches?.items?.length ? (
                <Box>
                  {recentMatches.items.slice(0, 5).map((match) => (
                    <Box
                      key={match.match_id}
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      py={2}
                      borderBottom="1px solid"
                      borderColor="divider"
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { backgroundColor: 'action.hover' },
                        '&:last-child': { borderBottom: 'none' },
                      }}
                      onClick={() => navigate(`/matches/${match.match_id}`)}
                    >
                      <Box flexGrow={1}>
                        <Typography variant="subtitle1" fontWeight={500}>
                          Match #{match.match_id.slice(-8)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Score: {(match.total_score * 100).toFixed(1)}% •
                          {' '}{match.match_reasons.slice(0, 2).join(', ')}
                        </Typography>
                      </Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Chip
                          label={match.confidence_level}
                          color={getConfidenceColor(match.confidence_level) as any}
                          size="small"
                        />
                        <ArrowForwardIcon color="action" fontSize="small" />
                      </Box>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary" textAlign="center" py={4}>
                  No matches found. Complete your company profile to start receiving matches.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12} md={4}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={3}>
                Quick Actions
              </Typography>

              <Box display="flex" flexDirection="column" gap={2}>
                <Button
                  variant="outlined"
                  startIcon={<BusinessIcon />}
                  fullWidth
                  onClick={() => navigate('/company/profile')}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  Update Company Profile
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<DocumentIcon />}
                  fullWidth
                  onClick={() => navigate('/company/documents')}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  Manage Documents
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<WorkIcon />}
                  fullWidth
                  onClick={() => navigate('/opportunities')}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  Browse Opportunities
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<AssessmentIcon />}
                  fullWidth
                  onClick={() => navigate('/analytics')}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  View Analytics
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* Profile Status */}
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>
                Profile Status
              </Typography>

              <Box mb={2}>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2">Completeness</Typography>
                  <Typography variant="body2">{getProfileCompleteness()}%</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={getProfileCompleteness()}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>

              <Box display="flex" flexDirection="column" gap={1}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Company Info
                  </Typography>
                  <Chip
                    label={companyProfile?.company_name ? 'Complete' : 'Incomplete'}
                    color={companyProfile?.company_name ? 'success' : 'error'}
                    size="small"
                  />
                </Box>

                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    NAICS Codes
                  </Typography>
                  <Chip
                    label={companyProfile?.naics_codes?.length ? 'Complete' : 'Incomplete'}
                    color={companyProfile?.naics_codes?.length ? 'success' : 'error'}
                    size="small"
                  />
                </Box>

                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Capability Statement
                  </Typography>
                  <Chip
                    label={companyProfile?.capability_statement ? 'Complete' : 'Incomplete'}
                    color={companyProfile?.capability_statement ? 'success' : 'error'}
                    size="small"
                  />
                </Box>
              </Box>

              {getProfileCompleteness() < 100 && (
                <Button
                  variant="contained"
                  fullWidth
                  sx={{ mt: 2 }}
                  onClick={() => navigate('/company/profile')}
                >
                  Complete Profile
                </Button>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;