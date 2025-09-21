import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  LinearProgress,
  Divider,
  Stack,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Rating,
  TextField,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Breadcrumbs,
  Link,
  CircularProgress
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Launch as LaunchIcon,
  ThumbUp as ThumbUpIcon,
  Star as StarIcon,
  Assessment as AssessmentIcon,
  TrendingUp as TrendingUpIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  ExpandMore as ExpandMoreIcon,
  Lightbulb as LightbulbIcon,
  Assignment as AssignmentIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { Match } from '../../types';

const MatchDetail: React.FC = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [feedbackDialog, setFeedbackDialog] = useState(false);
  const [rating, setRating] = useState<number | null>(0);
  const [comments, setComments] = useState('');

  // Data fetching
  const { data: match, isLoading, error } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => apiService.getMatch(matchId!),
    enabled: !!matchId,
  });

  // Mutations
  const pursueMatch = useMutation({
    mutationFn: () => apiService.markMatchAsPursued(matchId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });

  const submitFeedback = useMutation({
    mutationFn: (feedback: any) => apiService.submitMatchFeedback(matchId!, feedback),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      setFeedbackDialog(false);
      setRating(0);
      setComments('');
    },
  });

  // Helper functions
  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'HIGH': return 'success';
      case 'MEDIUM': return 'warning';
      case 'LOW': return 'info';
      default: return 'default';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.75) return '#2e7d32';
    if (score >= 0.5) return '#ed6c02';
    return '#1976d2';
  };

  const formatScore = (score: number) => `${(score * 100).toFixed(1)}%`;

  const handleSubmitFeedback = () => {
    if (rating !== null) {
      submitFeedback.mutate({
        quality_rating: rating,
        comments: comments.trim() || undefined,
        submitted_at: new Date().toISOString()
      });
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !match) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 3 }}>
          Error loading match details. Please try again.
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/matches')}>
          Back to Matches
        </Button>
      </Box>
    );
  }

  const componentDetails = [
    {
      key: 'semantic_similarity',
      label: 'Semantic Similarity',
      weight: '25%',
      description: 'How well your capabilities align with the opportunity description using AI analysis',
      score: match.component_scores.semantic_similarity || 0
    },
    {
      key: 'past_performance',
      label: 'Past Performance',
      weight: '20%',
      description: 'Relevance of your previous work experience to this opportunity',
      score: match.component_scores.past_performance || 0
    },
    {
      key: 'keyword_match',
      label: 'Keyword Matching',
      weight: '15%',
      description: 'Alignment of key terms and technologies between opportunity and your profile',
      score: match.component_scores.keyword_match || 0
    },
    {
      key: 'naics_alignment',
      label: 'NAICS Code Alignment',
      weight: '15%',
      description: 'How well your registered NAICS codes match the opportunity requirements',
      score: match.component_scores.naics_alignment || 0
    },
    {
      key: 'certification_bonus',
      label: 'Certification Match',
      weight: '10%',
      description: 'Whether you have required certifications (8(a), WOSB, etc.)',
      score: match.component_scores.certification_bonus || 0
    },
    {
      key: 'geographic_match',
      label: 'Geographic Proximity',
      weight: '5%',
      description: 'Location compatibility with the place of performance',
      score: match.component_scores.geographic_match || 0
    },
    {
      key: 'capacity_fit',
      label: 'Capacity & Size Fit',
      weight: '5%',
      description: 'Whether your company size aligns with the contract scope',
      score: match.component_scores.capacity_fit || 0
    },
    {
      key: 'recency_factor',
      label: 'Recent Experience',
      weight: '5%',
      description: 'How recent your relevant experience is',
      score: match.component_scores.recency_factor || 0
    }
  ];

  return (
    <Box>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 3 }}>
        <Link color="inherit" onClick={() => navigate('/matches')} sx={{ cursor: 'pointer' }}>
          Matches
        </Link>
        <Typography color="text.primary">Match #{match.match_id.slice(-8)}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4}>
        <Box>
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <Typography variant="h4" fontWeight={600}>
              Match #{match.match_id.slice(-8)}
            </Typography>
            <Chip
              label={match.confidence_level}
              color={getConfidenceColor(match.confidence_level) as any}
              size="medium"
            />
            {match.user_feedback?.pursued && (
              <Chip
                label="Pursued"
                color="primary"
                icon={<CheckCircleIcon />}
              />
            )}
          </Box>

          <Box display="flex" alignItems="center" gap={4} mb={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <AssessmentIcon color="action" />
              <Typography variant="h5" fontWeight={600}>
                {formatScore(match.total_score)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Overall Score
              </Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <ScheduleIcon color="action" />
              <Typography variant="body1" color="text.secondary">
                Matched on {new Date(match.created_at).toLocaleDateString()}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<StarIcon />}
            onClick={() => setFeedbackDialog(true)}
          >
            Rate Match
          </Button>

          {!match.user_feedback?.pursued && (
            <Button
              variant="contained"
              startIcon={<ThumbUpIcon />}
              onClick={() => pursueMatch.mutate()}
              disabled={pursueMatch.isPending}
            >
              Mark as Pursued
            </Button>
          )}

          <Button
            variant="outlined"
            startIcon={<LaunchIcon />}
            onClick={() => navigate(`/opportunities/${match.opportunity_id}`)}
          >
            View Opportunity
          </Button>
        </Box>
      </Box>

      <Grid container spacing={4}>
        {/* Score Overview */}
        <Grid item xs={12} md={8}>
          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={3}>
                Score Breakdown & Analysis
              </Typography>

              <Box mb={4}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="body1" fontWeight={500}>
                    Overall Match Score
                  </Typography>
                  <Typography variant="h4" fontWeight={600} color={getScoreColor(match.total_score)}>
                    {formatScore(match.total_score)}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={match.total_score * 100}
                  sx={{
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getScoreColor(match.total_score)
                    }
                  }}
                />
              </Box>

              <Divider sx={{ mb: 3 }} />

              {/* Component Scores */}
              <Typography variant="h6" fontWeight={500} mb={3}>
                Component Analysis
              </Typography>

              <Stack spacing={3}>
                {componentDetails.map((component) => (
                  <Accordion key={component.key}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
                        <Box display="flex" alignItems="center" gap={2}>
                          <Typography variant="body1" fontWeight={500}>
                            {component.label}
                          </Typography>
                          <Chip label={component.weight} size="small" variant="outlined" />
                        </Box>
                        <Box display="flex" alignItems="center" gap={2} mr={2}>
                          <Typography variant="body1" fontWeight={600}>
                            {formatScore(component.score)}
                          </Typography>
                          <Box width={80}>
                            <LinearProgress
                              variant="determinate"
                              value={component.score * 100}
                              sx={{
                                height: 6,
                                borderRadius: 3,
                                '& .MuiLinearProgress-bar': {
                                  backgroundColor: getScoreColor(component.score)
                                }
                              }}
                            />
                          </Box>
                        </Box>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Typography variant="body2" color="text.secondary">
                        {component.description}
                      </Typography>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Stack>
            </CardContent>
          </Card>

          {/* Match Reasons */}
          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={3}>
                <TrendingUpIcon color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  Why This Match?
                </Typography>
              </Box>

              <Stack spacing={2}>
                {match.match_reasons.map((reason, idx) => (
                  <Box key={idx} display="flex" alignItems="flex-start" gap={2}>
                    <CheckCircleIcon
                      fontSize="small"
                      color="success"
                      sx={{ mt: 0.5, flexShrink: 0 }}
                    />
                    <Typography variant="body1">{reason}</Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Sidebar */}
        <Grid item xs={12} md={4}>
          {/* Recommendations */}
          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={3}>
                <LightbulbIcon color="warning" />
                <Typography variant="h6" fontWeight={600}>
                  Recommendations
                </Typography>
              </Box>

              <Stack spacing={2}>
                {match.recommendations.map((rec, idx) => (
                  <Paper key={idx} elevation={0} sx={{ p: 2, backgroundColor: 'grey.50' }}>
                    <Typography variant="body2">{rec}</Typography>
                  </Paper>
                ))}
              </Stack>
            </CardContent>
          </Card>

          {/* Action Items */}
          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2} mb={3}>
                <AssignmentIcon color="info" />
                <Typography variant="h6" fontWeight={600}>
                  Next Steps
                </Typography>
              </Box>

              <Stack spacing={2}>
                {match.action_items.map((item, idx) => (
                  <Box key={idx} display="flex" alignItems="flex-start" gap={2}>
                    <CheckCircleIcon
                      fontSize="small"
                      color="action"
                      sx={{ mt: 0.5, flexShrink: 0 }}
                    />
                    <Typography variant="body2">{item}</Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>

          {/* Feedback Status */}
          {match.user_feedback && (
            <Card>
              <CardContent>
                <Typography variant="h6" fontWeight={600} mb={2}>
                  Your Feedback
                </Typography>

                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <Typography variant="body2">Quality Rating:</Typography>
                  <Rating
                    value={match.user_feedback.quality_rating}
                    readOnly
                    size="small"
                  />
                </Box>

                {match.user_feedback.comments && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" mb={1}>
                      Comments:
                    </Typography>
                    <Typography variant="body2">
                      {match.user_feedback.comments}
                    </Typography>
                  </Box>
                )}

                <Typography variant="caption" color="text.secondary" display="block" mt={2}>
                  Submitted {new Date(match.user_feedback.submitted_at).toLocaleDateString()}
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Feedback Dialog */}
      <Dialog
        open={feedbackDialog}
        onClose={() => setFeedbackDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rate Match Quality</DialogTitle>
        <DialogContent>
          <Box py={2}>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Your feedback helps improve our matching algorithm for future opportunities.
            </Typography>

            <Box mb={3}>
              <Typography variant="body2" mb={2} fontWeight={500}>
                How would you rate the quality of this match? *
              </Typography>
              <Rating
                value={rating}
                onChange={(_, newValue) => setRating(newValue)}
                size="large"
              />
            </Box>

            <TextField
              fullWidth
              multiline
              rows={4}
              label="Additional Comments (Optional)"
              placeholder="What did you think about this match? Any specific feedback on accuracy or usefulness?"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />

            <Typography variant="caption" color="text.secondary" mt={2} display="block">
              This feedback is used to improve our AI matching algorithm and will not be shared.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFeedbackDialog(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitFeedback}
            disabled={!rating || submitFeedback.isPending}
          >
            {submitFeedback.isPending ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MatchDetail;