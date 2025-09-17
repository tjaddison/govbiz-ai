import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Grid,
  Chip,
  Autocomplete,
  Alert,
  Snackbar,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  LinearProgress,
  Paper,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Language as WebsiteIcon,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContextManaged';
import { Company, Location } from '../../types';

const CompanyProfile: React.FC = () => {
  const { isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [showWebscrapeDialog, setShowWebscrapeDialog] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [formData, setFormData] = useState<Partial<Company>>({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as any });
  const { data: company, isLoading, error } = useQuery({
    queryKey: ['company-profile'],
    queryFn: apiService.getCompanyProfile,
    enabled: !authLoading, // Always allow the query, let the API service handle auth/fallback
    retry: 1, // Only retry once to avoid repeated failed calls
  });

  const updateMutation = useMutation({
    mutationFn: (company: Partial<Company>) => apiService.updateCompanyProfile(company),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-profile'] });
      setIsEditing(false);
      setSnackbar({ open: true, message: 'Profile updated successfully!', severity: 'success' });
    },
    onError: (error: any) => {
      setSnackbar({ open: true, message: error.message || 'Failed to update profile', severity: 'error' });
    },
  });

  const scrapeMutation = useMutation({
    mutationFn: (websiteUrl: string) => apiService.scrapeCompanyWebsite(websiteUrl),
    onSuccess: () => {
      setShowWebscrapeDialog(false);
      setWebsiteUrl('');
      setSnackbar({ open: true, message: 'Website scraping initiated!', severity: 'success' });
    },
    onError: (error: any) => {
      setSnackbar({ open: true, message: error.message || 'Failed to scrape website', severity: 'error' });
    },
  });

  useEffect(() => {
    if (company) {
      setFormData(company);
    }
  }, [company]);

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLocationChange = (index: number, field: string, value: string) => {
    const newLocations = [...(formData.locations || [])];
    newLocations[index] = {
      ...newLocations[index],
      [field]: value,
    };
    setFormData(prev => ({
      ...prev,
      locations: newLocations,
    }));
  };

  const addLocation = () => {
    const newLocation: Location = { city: '', state: '', zip_code: '' };
    setFormData(prev => ({
      ...prev,
      locations: [...(prev.locations || []), newLocation],
    }));
  };

  const removeLocation = (index: number) => {
    const newLocations = formData.locations?.filter((_, i) => i !== index) || [];
    setFormData(prev => ({
      ...prev,
      locations: newLocations,
    }));
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleWebscrape = () => {
    if (websiteUrl) {
      scrapeMutation.mutate(websiteUrl);
    }
  };

  const naicsOptions = [
    '541511', '541512', '541513', '541519', '541611', '541612', '541613', '541614', '541618', '541620',
    '541690', '541711', '541712', '541713', '541714', '541715', '541720', '541810', '541820', '541830',
    '541840', '541850', '541860', '541870', '541880', '541890', '541910', '541921', '541922', '541930',
    '541940', '541950', '541960', '541970', '541980', '541990',
  ];

  const certificationOptions = [
    '8(a)', 'WOSB', 'EDWOSB', 'SDVOSB', 'HUBZone', 'SBA Small Business', 'Minority-Owned', 'Veteran-Owned',
    'Disabled Veteran-Owned', 'Service-Disabled Veteran-Owned', 'Large Business', 'AbilityOne'
  ];

  const revenueRanges = [
    'Under $1M', '$1M-$5M', '$5M-$10M', '$10M-$25M', '$25M-$50M', '$50M-$100M', 'Over $100M'
  ];

  const employeeRanges = [
    '1-10', '11-50', '51-100', '101-250', '251-500', '501-1000', '1000+'
  ];

  const stateOptions = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
    'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
    'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
  ];

  const calculateProfileCompleteness = (companyData: Partial<Company>): { percentage: number; missing: string[] } => {
    const requiredFields = [
      { key: 'company_name', label: 'Company Name' },
      { key: 'primary_contact_name', label: 'Contact Name' },
      { key: 'primary_contact_email', label: 'Contact Email' },
      { key: 'naics_codes', label: 'NAICS Codes', check: (val: any) => Array.isArray(val) && val.length > 0 },
      { key: 'capability_statement', label: 'Capability Statement' },
      { key: 'locations', label: 'Business Locations', check: (val: any) => Array.isArray(val) && val.length > 0 },
    ];

    const optionalFields = [
      { key: 'duns_number', label: 'DUNS Number' },
      { key: 'cage_code', label: 'CAGE Code' },
      { key: 'uei', label: 'UEI' },
      { key: 'website_url', label: 'Website URL' },
      { key: 'revenue_range', label: 'Revenue Range' },
      { key: 'employee_count', label: 'Employee Count' },
      { key: 'certifications', label: 'Certifications', check: (val: any) => Array.isArray(val) && val.length > 0 },
      { key: 'primary_contact_phone', label: 'Contact Phone' },
    ];

    const allFields = [...requiredFields, ...optionalFields];
    const missing: string[] = [];
    let completed = 0;

    allFields.forEach(field => {
      const value = companyData[field.key as keyof Company];
      const isComplete = field.check ? field.check(value) : Boolean(value && value !== '');

      if (isComplete) {
        completed++;
      } else {
        missing.push(field.label);
      }
    });

    return {
      percentage: Math.round((completed / allFields.length) * 100),
      missing
    };
  };

  const profileCompleteness = calculateProfileCompleteness(formData);

  const getCompletenessColor = (percentage: number) => {
    if (percentage >= 80) return 'success';
    if (percentage >= 60) return 'warning';
    return 'error';
  };


  if (authLoading || isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>
          {authLoading ? 'Authenticating...' : 'Loading company profile...'}
        </Typography>
      </Box>
    );
  }

  if (error) {
    console.error('Company Profile Error:', error);
    return (
      <Alert severity="error">
        <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
          Failed to load company profile
        </Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
          Error: {error instanceof Error ? error.message : JSON.stringify(error)}
        </Typography>
        <Typography variant="body2" sx={{ mt: 1, fontSize: '0.8em', opacity: 0.7 }}>
          Check browser console for more details
        </Typography>
      </Alert>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            Company Profile
          </Typography>
          <Typography variant="body1" color="text.secondary" mt={1}>
            Manage your company information to improve opportunity matching.
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <Button
            variant="outlined"
            startIcon={<WebsiteIcon />}
            onClick={() => setShowWebscrapeDialog(true)}
          >
            Scrape Website
          </Button>
          {isEditing ? (
            <>
              <Button variant="outlined" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? <CircularProgress size={20} /> : 'Save Changes'}
              </Button>
            </>
          ) : (
            <Button variant="contained" onClick={() => setIsEditing(true)}>
              Edit Profile
            </Button>
          )}
        </Box>
      </Box>

      {/* Profile Completeness Indicator */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: 'background.paper' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight={600}>
            Profile Completeness
          </Typography>
          <Typography variant="h6" color={`${getCompletenessColor(profileCompleteness.percentage)}.main`}>
            {profileCompleteness.percentage}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={profileCompleteness.percentage}
          color={getCompletenessColor(profileCompleteness.percentage) as any}
          sx={{ height: 8, borderRadius: 4, mb: 2 }}
        />
        {profileCompleteness.missing.length > 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={1}>
              Missing information:
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={1}>
              {profileCompleteness.missing.slice(0, 6).map((item) => (
                <Chip key={item} label={item} size="small" variant="outlined" />
              ))}
              {profileCompleteness.missing.length > 6 && (
                <Chip label={`+${profileCompleteness.missing.length - 6} more`} size="small" variant="outlined" />
              )}
            </Box>
          </Box>
        )}
      </Paper>

      <Grid container spacing={3}>
        {/* Basic Information */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={3}>
                Basic Information
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Company Name"
                    value={formData.company_name || ''}
                    onChange={(e) => handleFieldChange('company_name', e.target.value)}
                    disabled={!isEditing}
                    required
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="DUNS Number"
                    value={formData.duns_number || ''}
                    onChange={(e) => handleFieldChange('duns_number', e.target.value)}
                    disabled={!isEditing}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="CAGE Code"
                    value={formData.cage_code || ''}
                    onChange={(e) => handleFieldChange('cage_code', e.target.value)}
                    disabled={!isEditing}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="UEI (Unique Entity Identifier)"
                    value={formData.uei || ''}
                    onChange={(e) => handleFieldChange('uei', e.target.value)}
                    disabled={!isEditing}
                    helperText="12-character alphanumeric identifier required for federal contracting"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Website URL"
                    value={formData.website_url || ''}
                    onChange={(e) => handleFieldChange('website_url', e.target.value)}
                    disabled={!isEditing}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Autocomplete
                    value={formData.revenue_range || ''}
                    onChange={(_, value) => handleFieldChange('revenue_range', value)}
                    options={revenueRanges}
                    disabled={!isEditing}
                    renderInput={(params) => (
                      <TextField {...params} label="Revenue Range" />
                    )}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Autocomplete
                    value={formData.employee_count || ''}
                    onChange={(_, value) => handleFieldChange('employee_count', value)}
                    options={employeeRanges}
                    disabled={!isEditing}
                    renderInput={(params) => (
                      <TextField {...params} label="Employee Count" />
                    )}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Contact Information */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={3}>
                Primary Contact
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Contact Name"
                    value={formData.primary_contact_name || ''}
                    onChange={(e) => handleFieldChange('primary_contact_name', e.target.value)}
                    disabled={!isEditing}
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={formData.primary_contact_email || ''}
                    onChange={(e) => handleFieldChange('primary_contact_email', e.target.value)}
                    disabled={!isEditing}
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Phone"
                    value={formData.primary_contact_phone || ''}
                    onChange={(e) => handleFieldChange('primary_contact_phone', e.target.value)}
                    disabled={!isEditing}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* NAICS Codes */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={3}>
                NAICS Codes
              </Typography>

              <Autocomplete
                multiple
                value={formData.naics_codes || []}
                onChange={(_, value) => handleFieldChange('naics_codes', value)}
                options={naicsOptions}
                disabled={!isEditing}
                renderTags={(tagValue, getTagProps) =>
                  tagValue.map((option, index) => (
                    <Chip
                      label={option}
                      {...getTagProps({ index })}
                      key={option}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="NAICS Codes"
                    placeholder="Select NAICS codes"
                  />
                )}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Certifications */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={3}>
                Certifications
              </Typography>

              <Autocomplete
                multiple
                value={formData.certifications || []}
                onChange={(_, value) => handleFieldChange('certifications', value)}
                options={certificationOptions}
                disabled={!isEditing}
                renderTags={(tagValue, getTagProps) =>
                  tagValue.map((option, index) => (
                    <Chip
                      label={option}
                      {...getTagProps({ index })}
                      key={option}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Certifications"
                    placeholder="Select certifications"
                  />
                )}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Locations */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h6" fontWeight={600}>
                  Business Locations
                </Typography>
                {isEditing && (
                  <Button
                    startIcon={<AddIcon />}
                    onClick={addLocation}
                    variant="outlined"
                    size="small"
                  >
                    Add Location
                  </Button>
                )}
              </Box>

              {(formData.locations || []).map((location, index) => (
                <Box key={index} mb={2}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        label="City"
                        value={location.city}
                        onChange={(e) => handleLocationChange(index, 'city', e.target.value)}
                        disabled={!isEditing}
                      />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                      <Autocomplete
                        value={location.state}
                        onChange={(_, value) => handleLocationChange(index, 'state', value || '')}
                        options={stateOptions}
                        disabled={!isEditing}
                        renderInput={(params) => (
                          <TextField {...params} label="State" />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                      <TextField
                        fullWidth
                        label="ZIP Code"
                        value={location.zip_code}
                        onChange={(e) => handleLocationChange(index, 'zip_code', e.target.value)}
                        disabled={!isEditing}
                      />
                    </Grid>
                    {isEditing && (
                      <Grid item xs={12} sm={2}>
                        <IconButton
                          onClick={() => removeLocation(index)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              ))}

              {(!formData.locations || formData.locations.length === 0) && (
                <Typography color="text.secondary" textAlign="center" py={2}>
                  No locations added yet.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Capability Statement */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={3}>
                Capability Statement
              </Typography>

              <TextField
                fullWidth
                multiline
                rows={6}
                label="Capability Statement"
                value={formData.capability_statement || ''}
                onChange={(e) => handleFieldChange('capability_statement', e.target.value)}
                disabled={!isEditing}
                placeholder="Describe your company's capabilities, experience, and expertise..."
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Website Scraping Dialog */}
      <Dialog open={showWebscrapeDialog} onClose={() => setShowWebscrapeDialog(false)}>
        <DialogTitle>Scrape Company Website</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Enter your company website URL to automatically extract capability information.
          </Typography>
          <TextField
            fullWidth
            label="Website URL"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://yourcompany.com"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowWebscrapeDialog(false)}>Cancel</Button>
          <Button
            onClick={handleWebscrape}
            variant="contained"
            disabled={!websiteUrl || scrapeMutation.isPending}
          >
            {scrapeMutation.isPending ? <CircularProgress size={20} /> : 'Start Scraping'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CompanyProfile;