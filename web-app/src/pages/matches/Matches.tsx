import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  LinearProgress,
  Tabs,
  Tab,
  Stack,
  Divider,
  Alert,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Rating,
  TablePagination,
  Collapse,
  Badge
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  ThumbUp as ThumbUpIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
  Schedule as ScheduleIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Launch as LaunchIcon,
  Star as StarIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { Match, FilterOptions, SortOptions } from '../../types';
import { useNavigate } from 'react-router-dom';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const Matches: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State management
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [tabValue, setTabValue] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [feedbackDialog, setFeedbackDialog] = useState<{open: boolean, matchId: string | null}>({open: false, matchId: null});

  // Filter and sort state
  const [filters, setFilters] = useState<FilterOptions>({
    confidenceLevel: [],
    minScore: 0,
    maxScore: 100
  });

  const [sort, setSort] = useState<SortOptions>({
    field: 'total_score',
    direction: 'desc'
  });

  // Build query filters
  const queryFilters = useMemo(() => {
    const f: FilterOptions = {
      ...filters,
      minScore: filters.minScore ? filters.minScore / 100 : undefined,
      maxScore: filters.maxScore ? filters.maxScore / 100 : undefined
    };

    if (tabValue === 1) f.pursued = true;
    if (tabValue === 2) f.pursued = false;

    return f;
  }, [filters, tabValue]);

  // Data fetching
  const { data: matchesData, isLoading, error } = useQuery({
    queryKey: ['matches', page, pageSize, queryFilters, sort, searchTerm],
    queryFn: () => apiService.getMatches(page + 1, pageSize, queryFilters, sort),
    placeholderData: (previousData) => previousData,
  });

  const { data: analytics } = useQuery({
    queryKey: ['match-stats'],
    queryFn: apiService.getMatchStats,
  });

  // Mutations
  const pursueMatch = useMutation({
    mutationFn: (matchId: string) => apiService.markMatchAsPursued(matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['match-stats'] });
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

  const handlePursue = (matchId: string) => {
    pursueMatch.mutate(matchId);
  };

  const handleFeedback = (matchId: string) => {
    setFeedbackDialog({open: true, matchId});
  };

  const renderComponentScores = (match: Match) => {
    const components = [
      { key: 'semantic_similarity', label: 'Semantic Match', weight: '25%' },
      { key: 'past_performance', label: 'Past Performance', weight: '20%' },
      { key: 'keyword_match', label: 'Keyword Match', weight: '15%' },
      { key: 'naics_alignment', label: 'NAICS Alignment', weight: '15%' },
      { key: 'certification_bonus', label: 'Certifications', weight: '10%' },
      { key: 'geographic_match', label: 'Geographic', weight: '5%' },
      { key: 'capacity_fit', label: 'Capacity Fit', weight: '5%' },
      { key: 'recency_factor', label: 'Recency', weight: '5%' }
    ];

    return (
      <Grid container spacing={2}>
        {components.map((component) => {
          const score = match.component_scores[component.key as keyof typeof match.component_scores] || 0;
          return (
            <Grid item xs={12} sm={6} md={3} key={component.key}>
              <Box>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="body2" fontWeight={500}>
                    {component.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {component.weight}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={score * 100}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getScoreColor(score)
                    }
                  }}
                />
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  {formatScore(score)}
                </Typography>
              </Box>
            </Grid>
          );
        })}
      </Grid>
    );
  };

  const renderMatchCard = (match: Match) => {
    const isExpanded = expandedMatch === match.match_id;

    return (
      <Card key={match.match_id} sx={{ mb: 2, border: 1, borderColor: 'divider' }}>
        <CardContent>
          {/* Header */}
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
            <Box flexGrow={1}>
              <Box display="flex" alignItems="center" gap={2} mb={1}>
                <Typography variant="h6" fontWeight={600}>
                  Match #{match.match_id.slice(-8)}
                </Typography>
                <Chip
                  label={match.confidence_level}
                  color={getConfidenceColor(match.confidence_level) as any}
                  size="small"
                />
                {match.user_feedback?.pursued && (
                  <Chip
                    label="Pursued"
                    color="primary"
                    size="small"
                    icon={<CheckCircleIcon />}
                  />
                )}
              </Box>

              <Box display="flex" alignItems="center" gap={3} mb={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <AssessmentIcon fontSize="small" color="action" />
                  <Typography variant="body2" fontWeight={600}>
                    {formatScore(match.total_score)}
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <ScheduleIcon fontSize="small" color="action" />
                  <Typography variant="body2" color="text.secondary">
                    {new Date(match.created_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>

              {/* Opportunity Details */}
              {match.opportunity ? (
                <Box mb={2} p={2} sx={{ backgroundColor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="h6" fontWeight={600} mb={1} color="primary">
                    {match.opportunity.title}
                  </Typography>

                  <Box display="flex" flexWrap="wrap" gap={2} mb={2}>
                    <Chip
                      label={match.opportunity.department}
                      variant="outlined"
                      size="small"
                      color="primary"
                    />
                    {match.opportunity.set_aside && (
                      <Chip
                        label={match.opportunity.set_aside}
                        variant="outlined"
                        size="small"
                        color="secondary"
                      />
                    )}
                    <Chip
                      label={`NAICS: ${match.opportunity.naics_code}`}
                      variant="outlined"
                      size="small"
                    />
                    {match.opportunity.award_amount && (
                      <Chip
                        label={`Value: ${match.opportunity.award_amount}`}
                        variant="outlined"
                        size="small"
                        color="success"
                      />
                    )}
                  </Box>

                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {match.opportunity.description.length > 200
                      ? `${match.opportunity.description.substring(0, 200)}...`
                      : match.opportunity.description}
                  </Typography>

                  <Box display="flex" alignItems="center" gap={3} mb={1}>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Posted:</strong> {new Date(match.opportunity.posted_date).toLocaleDateString()}
                    </Typography>
                    <Typography variant="body2" color="error.main" fontWeight={600}>
                      <strong>Deadline:</strong> {new Date(match.opportunity.response_deadline).toLocaleDateString()}
                    </Typography>
                    {match.opportunity.pop_city && match.opportunity.pop_state && (
                      <Typography variant="body2" color="text.secondary">
                        <strong>Location:</strong> {match.opportunity.pop_city}, {match.opportunity.pop_state}
                      </Typography>
                    )}
                  </Box>

                  <Box display="flex" alignItems="center" gap={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      href={match.opportunity.sam_gov_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      startIcon={<LaunchIcon />}
                    >
                      View on SAM.gov
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Box mb={2} p={2} sx={{ backgroundColor: 'grey.100', borderRadius: 1, border: '1px dashed #ccc' }}>
                  <Typography variant="body2" color="text.secondary" textAlign="center">
                    Opportunity details loading... (ID: {match.opportunity_id})
                  </Typography>
                </Box>
              )}

              {/* Match Reasons */}
              <Box mb={2}>
                <Typography variant="body2" color="text.secondary" mb={1}>
                  Key Match Factors:
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1}>
                  {match.match_reasons.slice(0, 3).map((reason, idx) => (
                    <Chip
                      key={idx}
                      label={reason}
                      variant="outlined"
                      size="small"
                    />
                  ))}
                  {match.match_reasons.length > 3 && (
                    <Chip
                      label={`+${match.match_reasons.length - 3} more`}
                      variant="outlined"
                      size="small"
                      color="primary"
                    />
                  )}
                </Box>
              </Box>
            </Box>

            {/* Actions */}
            <Box display="flex" flexDirection="column" gap={1} alignItems="flex-end">
              <Box display="flex" gap={1}>
                <Tooltip title="View Details">
                  <IconButton
                    size="small"
                    onClick={() => setExpandedMatch(isExpanded ? null : match.match_id)}
                  >
                    {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Tooltip>

                <Tooltip title="View Opportunity">
                  <IconButton
                    size="small"
                    onClick={() => navigate(`/opportunities/${match.opportunity_id}`)}
                  >
                    <LaunchIcon />
                  </IconButton>
                </Tooltip>
              </Box>

              {!match.user_feedback?.pursued && (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<ThumbUpIcon />}
                  onClick={() => handlePursue(match.match_id)}
                  disabled={pursueMatch.isPending}
                >
                  Pursue
                </Button>
              )}

              <Button
                variant="outlined"
                size="small"
                startIcon={<StarIcon />}
                onClick={() => handleFeedback(match.match_id)}
              >
                Rate Match
              </Button>
            </Box>
          </Box>

          {/* Expanded Details */}
          <Collapse in={isExpanded}>
            <Divider sx={{ mb: 3 }} />

            {/* Component Scores */}
            <Box mb={3}>
              <Typography variant="h6" fontWeight={600} mb={2}>
                Score Breakdown
              </Typography>
              {renderComponentScores(match)}
            </Box>

            {/* Recommendations */}
            {match.recommendations.length > 0 && (
              <Box mb={3}>
                <Typography variant="h6" fontWeight={600} mb={2}>
                  Recommendations
                </Typography>
                <Stack spacing={1}>
                  {match.recommendations.map((rec, idx) => (
                    <Box key={idx} display="flex" alignItems="flex-start" gap={1}>
                      <TrendingUpIcon fontSize="small" color="primary" sx={{ mt: 0.5 }} />
                      <Typography variant="body2">{rec}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            {/* Action Items */}
            {match.action_items.length > 0 && (
              <Box>
                <Typography variant="h6" fontWeight={600} mb={2}>
                  Next Steps
                </Typography>
                <Stack spacing={1}>
                  {match.action_items.map((item, idx) => (
                    <Box key={idx} display="flex" alignItems="flex-start" gap={1}>
                      <CheckCircleIcon fontSize="small" color="action" sx={{ mt: 0.5 }} />
                      <Typography variant="body2">{item}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </Collapse>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            Opportunity Matches
          </Typography>
          <Typography variant="body1" color="text.secondary" mt={1}>
            AI-powered opportunity matching with detailed scoring analysis
          </Typography>
        </Box>

        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<FilterIcon />}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters
          </Button>
        </Box>
      </Box>

      {/* Analytics Summary */}
      {analytics && (
        <Grid container spacing={3} mb={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Total Matches
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {analytics.totalMatches || 0}
                    </Typography>
                  </Box>
                  <AssessmentIcon color="primary" fontSize="large" />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      High Confidence
                    </Typography>
                    <Typography variant="h4" fontWeight={600} color="success.main">
                      {analytics.highConfidenceMatches || 0}
                    </Typography>
                  </Box>
                  <TrendingUpIcon color="success" fontSize="large" />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Win Rate
                    </Typography>
                    <Typography variant="h4" fontWeight={600} color="warning.main">
                      {analytics.winRate || 0}%
                    </Typography>
                  </Box>
                  <StarIcon color="warning" fontSize="large" />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Avg Score
                    </Typography>
                    <Typography variant="h4" fontWeight={600}>
                      {formatScore(analytics.avgMatchScore || 0)}
                    </Typography>
                  </Box>
                  <AssessmentIcon color="info" fontSize="large" />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters Panel */}
      <Collapse in={showFilters}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={600} mb={3}>
              Filter & Sort Options
            </Typography>

            <Grid container spacing={3}>
              {/* Search */}
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Search Matches"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />
                  }}
                />
              </Grid>

              {/* Confidence Level */}
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Confidence Level</InputLabel>
                  <Select
                    multiple
                    value={filters.confidenceLevel || []}
                    onChange={(e) => setFilters({...filters, confidenceLevel: e.target.value as string[]})}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as string[]).map((value) => (
                          <Chip key={value} label={value} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    <MenuItem value="HIGH">High Confidence</MenuItem>
                    <MenuItem value="MEDIUM">Medium Confidence</MenuItem>
                    <MenuItem value="LOW">Low Confidence</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Sort */}
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Sort By</InputLabel>
                  <Select
                    value={`${sort.field}-${sort.direction}`}
                    onChange={(e) => {
                      const [field, direction] = e.target.value.split('-');
                      setSort({field, direction: direction as 'asc' | 'desc'});
                    }}
                  >
                    <MenuItem value="total_score-desc">Score (High to Low)</MenuItem>
                    <MenuItem value="total_score-asc">Score (Low to High)</MenuItem>
                    <MenuItem value="created_at-desc">Date (Newest First)</MenuItem>
                    <MenuItem value="created_at-asc">Date (Oldest First)</MenuItem>
                    <MenuItem value="confidence_level-desc">Confidence (High to Low)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Score Range */}
              <Grid item xs={12}>
                <Typography variant="body2" gutterBottom>
                  Score Range: {filters.minScore || 0}% - {filters.maxScore || 100}%
                </Typography>
                <Slider
                  value={[filters.minScore || 0, filters.maxScore || 100]}
                  onChange={(_, value) => {
                    const [min, max] = value as number[];
                    setFilters({...filters, minScore: min, maxScore: max});
                  }}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(value) => `${value}%`}
                  step={5}
                  marks
                  min={0}
                  max={100}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Collapse>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab
            label={(
              <Badge badgeContent={analytics?.totalMatches || 0} color="primary">
                All Matches
              </Badge>
            )}
          />
          <Tab
            label={(
              <Badge badgeContent={analytics?.pursuedOpportunities || 0} color="success">
                Pursued
              </Badge>
            )}
          />
          <Tab label="Not Pursued" />
        </Tabs>
      </Box>

      {/* Content */}
      <TabPanel value={tabValue} index={0}>
        {isLoading ? (
          <Box textAlign="center" py={4}>
            <LinearProgress sx={{ mb: 2 }} />
            <Typography color="text.secondary">Loading matches...</Typography>
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 3 }}>
            Error loading matches. Please try again.
          </Alert>
        ) : !matchesData?.items?.length ? (
          <Alert severity="info" sx={{ mb: 3 }}>
            No matches found. Complete your company profile to start receiving matches.
          </Alert>
        ) : (
          <Box>
            {matchesData.items.map(renderMatchCard)}

            <TablePagination
              component="div"
              count={matchesData.totalCount}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={pageSize}
              onRowsPerPageChange={(e) => setPageSize(parseInt(e.target.value, 10))}
              rowsPerPageOptions={[5, 10, 25, 50]}
            />
          </Box>
        )}
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        {/* Same content with pursued filter */}
        {isLoading ? (
          <Box textAlign="center" py={4}>
            <LinearProgress sx={{ mb: 2 }} />
            <Typography color="text.secondary">Loading pursued matches...</Typography>
          </Box>
        ) : (
          <Box>
            {matchesData?.items?.length ? (
              matchesData.items.map(renderMatchCard)
            ) : (
              <Alert severity="info">
                No pursued opportunities yet. Mark matches as "Pursued" to track them here.
              </Alert>
            )}
          </Box>
        )}
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        {/* Not pursued matches */}
        {isLoading ? (
          <Box textAlign="center" py={4}>
            <LinearProgress sx={{ mb: 2 }} />
            <Typography color="text.secondary">Loading available matches...</Typography>
          </Box>
        ) : (
          <Box>
            {matchesData?.items?.length ? (
              matchesData.items.map(renderMatchCard)
            ) : (
              <Alert severity="info">
                All current matches have been pursued. Check back for new opportunities.
              </Alert>
            )}
          </Box>
        )}
      </TabPanel>

      {/* Feedback Dialog */}
      <Dialog
        open={feedbackDialog.open}
        onClose={() => setFeedbackDialog({open: false, matchId: null})}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rate Match Quality</DialogTitle>
        <DialogContent>
          <Box py={2}>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Your feedback helps improve our matching algorithm.
            </Typography>

            <Box mb={3}>
              <Typography variant="body2" mb={1}>Match Quality Rating</Typography>
              <Rating size="large" defaultValue={0} />
            </Box>

            <TextField
              fullWidth
              multiline
              rows={4}
              label="Additional Comments (Optional)"
              placeholder="What did you think about this match? Any specific feedback?"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFeedbackDialog({open: false, matchId: null})}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => {
            // Submit feedback logic here
            setFeedbackDialog({open: false, matchId: null});
          }}>
            Submit Feedback
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Matches;