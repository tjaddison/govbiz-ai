import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Card,
  CardContent,
  CardHeader,
  Slider,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Save as SaveIcon,
  RestoreFromTrash as RestoreIcon,
  History as HistoryIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';

interface WeightConfiguration {
  weights: {
    semantic_similarity: number;
    keyword_matching: number;
    naics_alignment: number;
    past_performance: number;
    certification_bonus: number;
    geographic_match: number;
    capacity_fit: number;
    recency_factor: number;
  };
  confidence_levels: {
    high_threshold: number;
    medium_threshold: number;
    low_threshold: number;
  };
  algorithm_params: {
    cache_ttl_hours: number;
    min_score_threshold: number;
    max_concurrent_matches: number;
    semantic_similarity_threshold: number;
  };
  version: string;
  updated_at: string;
}

interface ConfigurationHistory {
  config_id: string;
  timestamp: string;
  updated_by: string;
  configuration: WeightConfiguration;
}

const WeightConfiguration: React.FC = () => {
  const queryClient = useQueryClient();
  const [currentConfig, setCurrentConfig] = useState<WeightConfiguration | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch current configuration (automatically uses authenticated user's tenant)
  const { data: configuration, isLoading, error } = useQuery({
    queryKey: ['weight-configuration'],
    queryFn: async () => {
      return await apiService.getWeightConfiguration();
    },
  });

  // Fetch configuration history
  const { data: history } = useQuery({
    queryKey: ['weight-configuration-history'],
    queryFn: async () => {
      return await apiService.getWeightConfigurationHistory(undefined, 20);
    },
    enabled: showHistory,
  });

  // Update configuration mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (config: Partial<WeightConfiguration>) => {
      return await apiService.updateWeightConfiguration(config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight-configuration'] });
      setSuccessMessage('Configuration updated successfully!');
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.error || 'Failed to update configuration');
    },
  });

  // Reset to defaults mutation
  const resetConfigMutation = useMutation({
    mutationFn: async () => {
      return await apiService.resetWeightConfiguration();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight-configuration'] });
      setSuccessMessage('Configuration reset to defaults successfully!');
    },
    onError: (error: any) => {
      setErrorMessage(error.response?.data?.error || 'Failed to reset configuration');
    },
  });

  useEffect(() => {
    if (configuration) {
      setCurrentConfig({ ...configuration });
    }
  }, [configuration]);

  const handleWeightChange = (component: string, value: number) => {
    if (!currentConfig) return;

    setCurrentConfig({
      ...currentConfig,
      weights: {
        ...currentConfig.weights,
        [component]: value / 100, // Convert from percentage
      },
    });
  };

  const handleConfidenceLevelChange = (level: string, value: number) => {
    if (!currentConfig) return;

    setCurrentConfig({
      ...currentConfig,
      confidence_levels: {
        ...currentConfig.confidence_levels,
        [level]: value / 100, // Convert from percentage
      },
    });
  };

  const handleAlgorithmParamChange = (param: string, value: number) => {
    if (!currentConfig) return;

    setCurrentConfig({
      ...currentConfig,
      algorithm_params: {
        ...currentConfig.algorithm_params,
        [param]: value,
      },
    });
  };

  const handleSaveConfiguration = () => {
    if (!currentConfig) return;

    // Validate weights sum to 1.0
    const weightSum = Object.values(currentConfig.weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
      setErrorMessage('Weights must sum to 100% (currently ' + (weightSum * 100).toFixed(1) + '%)');
      return;
    }

    // Validate confidence level ordering
    const { high_threshold, medium_threshold, low_threshold } = currentConfig.confidence_levels;
    if (high_threshold <= medium_threshold || medium_threshold <= low_threshold) {
      setErrorMessage('Confidence thresholds must be ordered: High > Medium > Low');
      return;
    }

    updateConfigMutation.mutate(currentConfig);
  };

  const handleResetToDefaults = () => {
    resetConfigMutation.mutate();
  };

  const getWeightSum = () => {
    if (!currentConfig) return 0;
    return Object.values(currentConfig.weights).reduce((sum, weight) => sum + weight, 0);
  };

  const formatComponentName = (component: string) => {
    return component
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading configuration...</Typography>
      </Box>
    );
  }

  if (error || !currentConfig) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Failed to load configuration: {error?.message}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Weight Configuration
      </Typography>

      <Typography variant="body1" color="text.secondary" paragraph>
        Adjust matching algorithm weights and confidence levels to optimize opportunity matching for your organization.
      </Typography>

      <Grid container spacing={3}>
        {/* Component Weights */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardHeader
              title="Component Weights"
              subheader={`Total: ${(getWeightSum() * 100).toFixed(1)}% (should be 100%)`}
              action={
                <Tooltip title="These weights determine how much each matching component contributes to the overall score">
                  <IconButton>
                    <InfoIcon />
                  </IconButton>
                </Tooltip>
              }
            />
            <CardContent>
              <Grid container spacing={2}>
                {Object.entries(currentConfig.weights).map(([component, weight]) => (
                  <Grid item xs={12} sm={6} key={component}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" gutterBottom>
                        {formatComponentName(component)}: {(weight * 100).toFixed(1)}%
                      </Typography>
                      <Slider
                        value={weight * 100}
                        onChange={(_, value) => handleWeightChange(component, value as number)}
                        step={0.5}
                        min={0}
                        max={50}
                        marks={[
                          { value: 0, label: '0%' },
                          { value: 25, label: '25%' },
                          { value: 50, label: '50%' },
                        ]}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(value) => `${value.toFixed(1)}%`}
                      />
                    </Box>
                  </Grid>
                ))}
              </Grid>

              {Math.abs(getWeightSum() - 1.0) > 0.01 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Weights must sum to 100%. Current total: {(getWeightSum() * 100).toFixed(1)}%
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Confidence Levels */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardHeader
              title="Confidence Levels"
              subheader="Score thresholds for match confidence"
            />
            <CardContent>
              {Object.entries(currentConfig.confidence_levels).map(([level, threshold]) => (
                <Box key={level} sx={{ mb: 2 }}>
                  <Typography variant="body2" gutterBottom>
                    {formatComponentName(level)}: {(threshold * 100).toFixed(1)}%
                  </Typography>
                  <Slider
                    value={threshold * 100}
                    onChange={(_, value) => handleConfidenceLevelChange(level, value as number)}
                    step={1}
                    min={0}
                    max={100}
                    marks={[
                      { value: 0, label: '0%' },
                      { value: 50, label: '50%' },
                      { value: 100, label: '100%' },
                    ]}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => `${value.toFixed(0)}%`}
                  />
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Algorithm Parameters */}
        <Grid item xs={12}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Advanced Algorithm Parameters</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    label="Cache TTL (hours)"
                    type="number"
                    value={currentConfig.algorithm_params.cache_ttl_hours}
                    onChange={(e) => handleAlgorithmParamChange('cache_ttl_hours', parseInt(e.target.value))}
                    inputProps={{ min: 1, max: 168 }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    label="Min Score Threshold"
                    type="number"
                    value={currentConfig.algorithm_params.min_score_threshold}
                    onChange={(e) => handleAlgorithmParamChange('min_score_threshold', parseFloat(e.target.value))}
                    inputProps={{ min: 0, max: 1, step: 0.01 }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    label="Max Concurrent Matches"
                    type="number"
                    value={currentConfig.algorithm_params.max_concurrent_matches}
                    onChange={(e) => handleAlgorithmParamChange('max_concurrent_matches', parseInt(e.target.value))}
                    inputProps={{ min: 1, max: 1000 }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    label="Semantic Similarity Threshold"
                    type="number"
                    value={currentConfig.algorithm_params.semantic_similarity_threshold}
                    onChange={(e) => handleAlgorithmParamChange('semantic_similarity_threshold', parseFloat(e.target.value))}
                    inputProps={{ min: 0, max: 1, step: 0.01 }}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Action Buttons */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              startIcon={<HistoryIcon />}
              onClick={() => setShowHistory(true)}
            >
              View History
            </Button>
            <Button
              variant="outlined"
              startIcon={<RestoreIcon />}
              onClick={handleResetToDefaults}
              disabled={resetConfigMutation.isPending}
            >
              Reset to Defaults
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSaveConfiguration}
              disabled={updateConfigMutation.isPending || Math.abs(getWeightSum() - 1.0) > 0.01}
            >
              Save Configuration
            </Button>
          </Box>
        </Grid>
      </Grid>

      {/* Configuration History Dialog */}
      <Dialog
        open={showHistory}
        onClose={() => setShowHistory(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Configuration History</DialogTitle>
        <DialogContent>
          {history && (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Timestamp</TableCell>
                    <TableCell>Updated By</TableCell>
                    <TableCell>Version</TableCell>
                    <TableCell>Weight Sum</TableCell>
                    <TableCell>High Threshold</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.map((item: ConfigurationHistory) => (
                    <TableRow key={item.config_id}>
                      <TableCell>
                        {new Date(item.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>{item.updated_by}</TableCell>
                      <TableCell>
                        <Chip label={item.configuration.version} size="small" />
                      </TableCell>
                      <TableCell>
                        {(Object.values(item.configuration.weights).reduce((sum, w) => sum + w, 0) * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        {(item.configuration.confidence_levels.high_threshold * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowHistory(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Success/Error Snackbars */}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={6000}
        onClose={() => setSuccessMessage('')}
      >
        <Alert severity="success" onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!errorMessage}
        autoHideDuration={6000}
        onClose={() => setErrorMessage('')}
      >
        <Alert severity="error" onClose={() => setErrorMessage('')}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default WeightConfiguration;