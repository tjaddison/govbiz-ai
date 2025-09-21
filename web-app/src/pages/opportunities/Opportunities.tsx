import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Pagination,
  CircularProgress,
  Alert,
  IconButton,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Badge,
  SelectChangeEvent
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  OpenInNew as OpenInNewIcon,
  CalendarToday as CalendarIcon,
  AttachFile as AttachmentIcon,
  MonetizationOn as MoneyIcon,
  ExpandMore as ExpandMoreIcon,
  Clear as ClearIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { apiService } from '../../services/api';
import { OpportunityWithMatchExplanation } from '../../types';
import { useNavigate } from 'react-router-dom';

interface FilterState {
  search: string;
  department: string;
  naicsCode: string;
  setAside: string;
  minAmount: string;
  maxAmount: string;
  dateRange: string;
  activeOnly: boolean;
  unexpiredOnly: boolean;
}

const Opportunities: React.FC = () => {
  const navigate = useNavigate();
  const [opportunities, setOpportunities] = useState<OpportunityWithMatchExplanation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    search: '',
    department: 'All Departments',
    naicsCode: 'All NAICS',
    setAside: 'All Types',
    minAmount: '',
    maxAmount: '',
    dateRange: 'all',
    activeOnly: true,
    unexpiredOnly: true
  });

  const loadOpportunities = async (page: number = 1, customPageSize?: number) => {
    try {
      setLoading(true);
      setError(null);

      const queryParams: any = {
        page,
        limit: customPageSize || pageSize,
        active_only: filters.activeOnly,
        unexpired_only: filters.unexpiredOnly
      };

      if (filters.naicsCode && filters.naicsCode !== 'All NAICS') {
        queryParams.naics_code = filters.naicsCode;
      }

      if (filters.setAside && filters.setAside !== 'All Types') {
        queryParams.set_aside = filters.setAside;
      }

      // Add search and department filters to backend query
      if (filters.search && filters.search.trim()) {
        queryParams.search = filters.search.trim();
      }

      if (filters.department && filters.department !== 'All Departments') {
        queryParams.department = filters.department;
      }

      const response = await apiService.getOpportunitiesWithMatchExplanations(page, customPageSize || pageSize, queryParams);

      setOpportunities(response.items);
      setTotalCount(response.totalCount);
      setCurrentPage(response.currentPage);
      setTotalPages(response.totalPages);
    } catch (err: any) {
      console.error('Error loading opportunities:', err);
      setError('Failed to load opportunities. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOpportunities(1);
  }, [filters]);

  // Remove client-side filtering since backend handles all filtering
  const filteredOpportunities = opportunities;

  const handlePageChange = (event: React.ChangeEvent<unknown>, page: number) => {
    setCurrentPage(page);
    loadOpportunities(page);
  };

  const handlePageSizeChange = (event: SelectChangeEvent<number>) => {
    const newPageSize = Number(event.target.value);
    setPageSize(newPageSize);
    setCurrentPage(1);
    loadOpportunities(1, newPageSize);
  };

  const handleFilterChange = (field: keyof FilterState, value: string | boolean) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      department: 'All Departments',
      naicsCode: 'All NAICS',
      setAside: 'All Types',
      minAmount: '',
      maxAmount: '',
      dateRange: 'all',
      activeOnly: true,
      unexpiredOnly: true
    });
    setCurrentPage(1);
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: string | undefined) => {
    if (!amount) return 'Not specified';
    const num = parseFloat(amount.replace(/[^0-9.-]+/g, ''));
    if (isNaN(num)) return amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  const formatScore = (score: number) => {
    return (score * 100).toFixed(1) + '%';
  };

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'HIGH': return 'success';
      case 'MEDIUM': return 'warning';
      case 'LOW': return 'info';
      default: return 'default';
    }
  };

  const getConfidenceLevelText = (level: string) => {
    switch (level) {
      case 'HIGH': return 'High Match';
      case 'MEDIUM': return 'Medium Match';
      case 'LOW': return 'Low Match';
      default: return 'No Match';
    }
  };

  const getDaysUntilDeadline = (deadline: string) => {
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getDeadlineColor = (daysLeft: number) => {
    if (daysLeft < 0) return 'error';
    if (daysLeft <= 7) return 'error';
    if (daysLeft <= 14) return 'warning';
    return 'success';
  };

  const openSamGovLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={() => loadOpportunities(1)}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Government Contract Opportunities
      </Typography>

      {/* Filter Controls */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: showFilters ? 2 : 0 }}>
          <Typography variant="h6">
            Filters & Search
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton onClick={() => setShowFilters(!showFilters)}>
              <FilterIcon />
            </IconButton>
            <IconButton onClick={() => loadOpportunities(currentPage)} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>

        {showFilters && (
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Search opportunities..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                  endAdornment: filters.search && (
                    <InputAdornment position="end">
                      <IconButton onClick={() => handleFilterChange('search', '')} size="small">
                        <ClearIcon />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Department</InputLabel>
                <Select
                  value={filters.department}
                  label="Department"
                  onChange={(e) => handleFilterChange('department', e.target.value)}
                >
                  <MenuItem value="All Departments">All Departments</MenuItem>
                  <MenuItem value="Department of Defense">Department of Defense</MenuItem>
                  <MenuItem value="Department of Health and Human Services">Department of Health and Human Services</MenuItem>
                  <MenuItem value="Department of Homeland Security">Department of Homeland Security</MenuItem>
                  <MenuItem value="Department of Veterans Affairs">Department of Veterans Affairs</MenuItem>
                  <MenuItem value="General Services Administration">General Services Administration</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>NAICS Code</InputLabel>
                <Select
                  value={filters.naicsCode}
                  label="NAICS Code"
                  onChange={(e) => handleFilterChange('naicsCode', e.target.value)}
                >
                  <MenuItem value="All NAICS">All NAICS</MenuItem>
                  <MenuItem value="541511">Custom Computer Programming Services</MenuItem>
                  <MenuItem value="541512">Computer Systems Design Services</MenuItem>
                  <MenuItem value="541519">Other Computer Related Services</MenuItem>
                  <MenuItem value="541330">Engineering Services</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Set Aside</InputLabel>
                <Select
                  value={filters.setAside}
                  label="Set Aside"
                  onChange={(e) => handleFilterChange('setAside', e.target.value)}
                >
                  <MenuItem value="All Types">All Types</MenuItem>
                  <MenuItem value="Small Business">Small Business</MenuItem>
                  <MenuItem value="8(a)">8(a)</MenuItem>
                  <MenuItem value="WOSB">Women-Owned Small Business</MenuItem>
                  <MenuItem value="SDVOSB">Service-Disabled Veteran-Owned</MenuItem>
                  <MenuItem value="HUBZone">HUBZone</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Button
                  variant="outlined"
                  onClick={clearFilters}
                  startIcon={<ClearIcon />}
                >
                  Clear Filters
                </Button>
              </Box>
            </Grid>
          </Grid>
        )}
      </Paper>

      {/* Pagination Controls (Top) */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="body1">
          {loading ? 'Loading...' : `${totalCount} opportunities found`}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControl size="small">
            <InputLabel>Per Page</InputLabel>
            <Select
              value={pageSize}
              label="Per Page"
              onChange={handlePageSizeChange}
            >
              <MenuItem value={25}>25</MenuItem>
              <MenuItem value={50}>50</MenuItem>
              <MenuItem value={100}>100</MenuItem>
            </Select>
          </FormControl>
          <Pagination
            count={totalPages}
            page={currentPage}
            onChange={handlePageChange}
            color="primary"
            showFirstButton
            showLastButton
            disabled={loading}
          />
        </Box>
      </Box>

      {/* Opportunities List */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {filteredOpportunities.map((opportunity) => {
            const daysLeft = getDaysUntilDeadline(opportunity.response_deadline);

            return (
              <Grid item xs={12} key={opportunity.notice_id}>
                <Card sx={{ height: '100%' }}>
                  <CardContent>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={6}>
                        <Typography variant="h6" gutterBottom>
                          {opportunity.title}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                          <Chip size="small" label={opportunity.type} />
                          <Chip size="small" label={opportunity.department} />
                          {opportunity.set_aside && (
                            <Chip size="small" label={opportunity.set_aside} color="primary" />
                          )}
                          <Badge
                            badgeContent={daysLeft > 0 ? daysLeft : 'Expired'}
                            color={getDeadlineColor(daysLeft)}
                          >
                            <Chip
                              size="small"
                              icon={<CalendarIcon />}
                              label={`Due: ${formatDate(opportunity.response_deadline)}`}
                            />
                          </Badge>
                        </Box>
                        {opportunity.match_explanation && (
                          <Chip
                            size="small"
                            label={getConfidenceLevelText(opportunity.match_explanation.confidence_level)}
                            color={getConfidenceColor(opportunity.match_explanation.confidence_level)}
                            sx={{ mb: 1 }}
                          />
                        )}
                      </Grid>

                      <Grid item xs={12} md={6}>
                        <Box display="flex" justifyContent="flex-end" alignItems="center" gap={2}>
                          {opportunity.match_explanation && (
                            <Box display="flex" alignItems="center" gap={0.5}>
                              <Typography variant="body2" fontWeight={600} color="primary">
                                Match Score: {formatScore(opportunity.match_explanation.total_score)}
                              </Typography>
                            </Box>
                          )}
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <MoneyIcon fontSize="small" />
                            <Typography variant="body2">
                              {formatCurrency(opportunity.award_amount)}
                            </Typography>
                          </Box>
                          {opportunity.attachments && opportunity.attachments.length > 0 && (
                            <Box display="flex" alignItems="center" gap={0.5}>
                              <AttachmentIcon fontSize="small" />
                              <Typography variant="body2">
                                {opportunity.attachments.length} attachment(s)
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </Grid>
                    </Grid>

                    <Typography variant="body2" sx={{ mt: 2, mb: 2 }}>
                      {opportunity.description?.length > 300
                        ? `${opportunity.description.substring(0, 300)}...`
                        : opportunity.description}
                    </Typography>

                    {/* Match Explanation Accordion */}
                    {opportunity.match_explanation && (
                      <Accordion sx={{ mt: 2 }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography variant="subtitle1" fontWeight={600}>
                            Match Analysis Details
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                              <Typography variant="subtitle2" gutterBottom>
                                Component Scores
                              </Typography>
                              <Box sx={{ '& > *': { mb: 1 } }}>
                                {Object.entries(opportunity.match_explanation.component_scores).map(([key, value]) => (
                                  <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                                      {key.replace(/_/g, ' ')}:
                                    </Typography>
                                    <Typography variant="body2" fontWeight="bold">
                                      {formatScore(value)}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Grid>
                            <Grid item xs={12} md={6}>
                              {opportunity.match_explanation.match_reasons.length > 0 && (
                                <>
                                  <Typography variant="subtitle2" gutterBottom>
                                    Match Reasons
                                  </Typography>
                                  <Box component="ul" sx={{ pl: 2, mb: 2 }}>
                                    {opportunity.match_explanation.match_reasons.map((reason, index) => (
                                      <li key={index}>
                                        <Typography variant="body2">{reason}</Typography>
                                      </li>
                                    ))}
                                  </Box>
                                </>
                              )}
                              {opportunity.match_explanation.recommendations.length > 0 && (
                                <>
                                  <Typography variant="subtitle2" gutterBottom>
                                    Recommendations
                                  </Typography>
                                  <Box component="ul" sx={{ pl: 2 }}>
                                    {opportunity.match_explanation.recommendations.map((rec, index) => (
                                      <li key={index}>
                                        <Typography variant="body2">{rec}</Typography>
                                      </li>
                                    ))}
                                  </Box>
                                </>
                              )}
                            </Grid>
                          </Grid>
                        </AccordionDetails>
                      </Accordion>
                    )}
                  </CardContent>

                  <CardActions>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => openSamGovLink(opportunity.sam_url)}
                      startIcon={<OpenInNewIcon />}
                    >
                      View on SAM.gov
                    </Button>
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                      Posted: {formatDate(opportunity.posted_date)}
                    </Typography>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Pagination Controls (Bottom) */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination
            count={totalPages}
            page={currentPage}
            onChange={handlePageChange}
            color="primary"
            showFirstButton
            showLastButton
            disabled={loading}
          />
        </Box>
      )}
    </Box>
  );
};

export default Opportunities;