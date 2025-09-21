import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Breadcrumbs,
  Link as MuiLink
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  OpenInNew as OpenInNewIcon,
  Download as DownloadIcon,
  Business as BusinessIcon,
  CalendarToday as CalendarIcon,
  LocationOn as LocationIcon,
  MonetizationOn as MoneyIcon,
  Assignment as AssignmentIcon,
  AttachFile as AttachmentIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Fax as FaxIcon,
  Person as PersonIcon,
  Description as DescriptionIcon,
  Info as InfoIcon,
  Schedule as ScheduleIcon,
  Category as CategoryIcon
} from '@mui/icons-material';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import { Opportunity, AttachmentInfo } from '../../types';

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
      id={`opportunity-tabpanel-${index}`}
      aria-labelledby={`opportunity-tab-${index}`}
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

const OpportunityDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  useEffect(() => {
    const loadOpportunity = async () => {
      if (!id) {
        setError('Opportunity ID not provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const oppData = await apiService.getOpportunity(id);
        setOpportunity(oppData);

        // Load attachments
        if (oppData.attachments && oppData.attachments.length > 0) {
          setLoadingAttachments(true);
          try {
            const attachmentData = await apiService.getOpportunityAttachments(id);
            setAttachments(attachmentData);
          } catch (attachErr) {
            console.error('Error loading attachments:', attachErr);
            setAttachments(oppData.attachments || []);
          } finally {
            setLoadingAttachments(false);
          }
        }
      } catch (err: any) {
        console.error('Error loading opportunity:', err);
        setError('Failed to load opportunity details. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadOpportunity();
  }, [id]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const formatCurrency = (amount: string | number | null | undefined) => {
    if (!amount || amount === 'None' || amount === 'null') return 'Not specified';
    const amountStr = String(amount);
    return amountStr.startsWith('$') ? amountStr : `$${amountStr}`;
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getDeadlineColor = (daysUntil: number) => {
    if (daysUntil < 0) return 'error';
    if (daysUntil <= 7) return 'warning';
    if (daysUntil <= 30) return 'info';
    return 'success';
  };

  const getSetAsideColor = (setAside: string) => {
    if (setAside.includes('Small Business')) return 'primary';
    if (setAside.includes('Women-Owned')) return 'secondary';
    if (setAside.includes('Veteran')) return 'success';
    if (setAside.includes('8(a)')) return 'warning';
    return 'default';
  };

  const handleDownloadAttachment = async (attachment: AttachmentInfo) => {
    try {
      if (attachment.download_url && attachment.download_url !== '#') {
        window.open(attachment.download_url, '_blank');
      } else {
        console.warn('Download URL not available for attachment:', attachment.name);
      }
    } catch (error) {
      console.error('Error downloading attachment:', error);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (error || !opportunity) {
    return (
      <Box>
        <Box display="flex" alignItems="center" mb={3}>
          <IconButton onClick={() => navigate('/app/opportunities')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" fontWeight={600}>
            Opportunity Details
          </Typography>
        </Box>
        <Alert severity="error">
          {error || 'Opportunity not found'}
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Navigation */}
      <Box mb={3}>
        <Breadcrumbs aria-label="breadcrumb">
          <MuiLink
            component={Link}
            to="/app/opportunities"
            color="inherit"
            underline="hover"
          >
            Opportunities
          </MuiLink>
          <Typography color="text.primary">Opportunity Details</Typography>
        </Breadcrumbs>
      </Box>

      {/* Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
            <Box flex={1}>
              <Typography variant="h4" fontWeight={600} gutterBottom>
                {opportunity.title}
              </Typography>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Solicitation: {opportunity.sol_number}
              </Typography>
            </Box>
            <Box display="flex" gap={1}>
              <Chip
                label={opportunity.type}
                color="primary"
                variant="outlined"
              />
              <Chip
                label={opportunity.set_aside}
                color={getSetAsideColor(opportunity.set_aside)}
              />
            </Box>
          </Box>

          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <BusinessIcon color="action" />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Department
                  </Typography>
                  <Typography variant="body1">
                    {opportunity.department}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {opportunity.sub_tier} • {opportunity.office}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <MoneyIcon color="action" />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Award Amount
                  </Typography>
                  <Typography variant="h6" color="primary">
                    {formatCurrency(opportunity.award_amount || 'TBD')}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <CalendarIcon color="action" />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Posted Date
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(opportunity.posted_date)}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <ScheduleIcon color={getDeadlineColor(opportunity.days_until_deadline || 0)} />
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Response Deadline
                  </Typography>
                  <Typography
                    variant="body1"
                    color={getDeadlineColor(opportunity.days_until_deadline || 0) === 'error' ? 'error' : 'text.primary'}
                    fontWeight={600}
                  >
                    {formatDate(opportunity.response_deadline)}
                    {opportunity.days_until_deadline !== undefined && (
                      <span> ({opportunity.days_until_deadline} days remaining)</span>
                    )}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>

          <Box display="flex" gap={2} mt={3}>
            <Button
              variant="contained"
              color="primary"
              endIcon={<OpenInNewIcon />}
              href={opportunity.sam_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on SAM.gov
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate('/app/opportunities')}
            >
              Back to Opportunities
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} variant="fullWidth">
          <Tab
            icon={<DescriptionIcon />}
            label="Description"
            iconPosition="start"
          />
          <Tab
            icon={<InfoIcon />}
            label="Details"
            iconPosition="start"
          />
          <Tab
            icon={<PersonIcon />}
            label="Contacts"
            iconPosition="start"
          />
          <Tab
            icon={<AttachmentIcon />}
            label={`Attachments (${attachments.length})`}
            iconPosition="start"
          />
        </Tabs>

        {/* Description Tab */}
        <TabPanel value={tabValue} index={0}>
          <Typography variant="h6" gutterBottom>
            Opportunity Description
          </Typography>
          <Typography variant="body1" paragraph sx={{ lineHeight: 1.7 }}>
            {opportunity.description}
          </Typography>
        </TabPanel>

        {/* Details Tab */}
        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Classification
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon><CategoryIcon /></ListItemIcon>
                  <ListItemText
                    primary="NAICS Code"
                    secondary={opportunity.naics_code}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon><AssignmentIcon /></ListItemIcon>
                  <ListItemText
                    primary="Opportunity Type"
                    secondary={opportunity.type}
                  />
                </ListItem>
                <ListItem>
                  <ListItemIcon><BusinessIcon /></ListItemIcon>
                  <ListItemText
                    primary="Set-Aside Type"
                    secondary={opportunity.set_aside}
                  />
                </ListItem>
              </List>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Place of Performance
              </Typography>
              {opportunity.pop_address ? (
                <List dense>
                  <ListItem>
                    <ListItemIcon><LocationIcon /></ListItemIcon>
                    <ListItemText
                      primary="Address"
                      secondary={
                        <>
                          {opportunity.pop_address.street}<br />
                          {opportunity.pop_address.city}, {opportunity.pop_address.state} {opportunity.pop_address.zip}<br />
                          {opportunity.pop_address.country}
                        </>
                      }
                    />
                  </ListItem>
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Not specified
                </Typography>
              )}
            </Grid>
          </Grid>
        </TabPanel>

        {/* Contacts Tab */}
        <TabPanel value={tabValue} index={2}>
          <Grid container spacing={3}>
            {opportunity.contacts.primary && (
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Primary Contact
                    </Typography>
                    <List dense>
                      <ListItem>
                        <ListItemIcon><PersonIcon /></ListItemIcon>
                        <ListItemText
                          primary={opportunity.contacts.primary.name}
                          secondary={opportunity.contacts.primary.title}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon><EmailIcon /></ListItemIcon>
                        <ListItemText
                          primary="Email"
                          secondary={
                            <MuiLink href={`mailto:${opportunity.contacts.primary.email}`}>
                              {opportunity.contacts.primary.email}
                            </MuiLink>
                          }
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon><PhoneIcon /></ListItemIcon>
                        <ListItemText
                          primary="Phone"
                          secondary={opportunity.contacts.primary.phone || 'Not provided'}
                        />
                      </ListItem>
                      {opportunity.contacts.primary.fax && (
                        <ListItem>
                          <ListItemIcon><FaxIcon /></ListItemIcon>
                          <ListItemText
                            primary="Fax"
                            secondary={opportunity.contacts.primary.fax}
                          />
                        </ListItem>
                      )}
                    </List>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {opportunity.contacts.secondary && (
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Secondary Contact
                    </Typography>
                    <List dense>
                      <ListItem>
                        <ListItemIcon><PersonIcon /></ListItemIcon>
                        <ListItemText
                          primary={opportunity.contacts.secondary.name}
                          secondary={opportunity.contacts.secondary.title}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon><EmailIcon /></ListItemIcon>
                        <ListItemText
                          primary="Email"
                          secondary={
                            <MuiLink href={`mailto:${opportunity.contacts.secondary.email}`}>
                              {opportunity.contacts.secondary.email}
                            </MuiLink>
                          }
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon><PhoneIcon /></ListItemIcon>
                        <ListItemText
                          primary="Phone"
                          secondary={opportunity.contacts.secondary.phone || 'Not provided'}
                        />
                      </ListItem>
                      {opportunity.contacts.secondary.fax && (
                        <ListItem>
                          <ListItemIcon><FaxIcon /></ListItemIcon>
                          <ListItemText
                            primary="Fax"
                            secondary={opportunity.contacts.secondary.fax}
                          />
                        </ListItem>
                      )}
                    </List>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        </TabPanel>

        {/* Attachments Tab */}
        <TabPanel value={tabValue} index={3}>
          {loadingAttachments ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : attachments.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Filename</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {attachments.map((attachment, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <AttachmentIcon color="action" />
                          <Typography variant="body2">
                            {attachment.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatFileSize(attachment.size)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title="Download attachment">
                          <IconButton
                            size="small"
                            onClick={() => handleDownloadAttachment(attachment)}
                            disabled={!attachment.download_url || attachment.download_url === '#'}
                          >
                            <DownloadIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box textAlign="center" py={4}>
              <Typography variant="body1" color="text.secondary">
                No attachments available for this opportunity.
              </Typography>
            </Box>
          )}
        </TabPanel>
      </Paper>
    </Box>
  );
};

export default OpportunityDetail;