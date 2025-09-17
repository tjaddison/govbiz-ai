import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  IconButton,
  LinearProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Snackbar,
  Avatar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  Autocomplete,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Work as WorkIcon,
  School as SchoolIcon,
  Security as SecurityIcon,
  AttachFile as AttachFileIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { TeamMember } from '../../types';

const TeamManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const [memberDialog, setMemberDialog] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [resumeUpload, setResumeUpload] = useState<{ memberId: string; file: File } | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as any });
  const [formData, setFormData] = useState<Partial<TeamMember>>({
    name: '',
    email: '',
    phone: '',
    role: '',
    title: '',
    security_clearance: '',
    years_experience: 0,
    skills: [],
    certifications: [],
    education: '',
    hourly_rate: undefined,
    availability: 'full-time',
    is_active: true,
  });

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: apiService.getTeamMembers,
  });

  const createMutation = useMutation({
    mutationFn: (memberData: Omit<TeamMember, 'member_id' | 'tenant_id' | 'company_id' | 'created_at' | 'updated_at'>) => apiService.createTeamMember(memberData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setSnackbar({ open: true, message: 'Team member added successfully!', severity: 'success' });
      setMemberDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      setSnackbar({ open: true, message: error.message || 'Failed to add team member', severity: 'error' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: Partial<TeamMember> }) =>
      apiService.updateTeamMember(memberId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setSnackbar({ open: true, message: 'Team member updated successfully!', severity: 'success' });
      setMemberDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      setSnackbar({ open: true, message: error.message || 'Failed to update team member', severity: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (memberId: string) => apiService.deleteTeamMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setSnackbar({ open: true, message: 'Team member deleted successfully!', severity: 'success' });
    },
    onError: (error: any) => {
      setSnackbar({ open: true, message: error.message || 'Failed to delete team member', severity: 'error' });
    },
  });

  const resumeUploadMutation = useMutation({
    mutationFn: ({ memberId, file }: { memberId: string; file: File }) =>
      apiService.uploadTeamMemberResume(memberId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setSnackbar({ open: true, message: 'Resume uploaded successfully!', severity: 'success' });
      setResumeUpload(null);
    },
    onError: (error: any) => {
      setSnackbar({ open: true, message: error.message || 'Resume upload failed', severity: 'error' });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      role: '',
      title: '',
      security_clearance: '',
      years_experience: 0,
      skills: [],
      certifications: [],
      education: '',
      hourly_rate: undefined,
      availability: 'full-time',
      is_active: true,
    });
    setEditingMember(null);
  };

  const handleAddMember = () => {
    setEditingMember(null);
    resetForm();
    setMemberDialog(true);
  };

  const handleEditMember = (member: TeamMember) => {
    setEditingMember(member);
    setFormData(member);
    setMemberDialog(true);
  };

  const handleSave = () => {
    if (editingMember) {
      updateMutation.mutate({ memberId: editingMember.member_id, data: formData });
    } else {
      createMutation.mutate(formData as any);
    }
  };

  const handleResumeUpload = (memberId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setResumeUpload({ memberId, file });
    }
  };

  const confirmResumeUpload = () => {
    if (resumeUpload) {
      resumeUploadMutation.mutate(resumeUpload);
    }
  };

  const roleOptions = [
    'Project Manager',
    'Technical Lead',
    'Senior Developer',
    'Developer',
    'DevOps Engineer',
    'Security Engineer',
    'Business Analyst',
    'Technical Writer',
    'QA Engineer',
    'Data Scientist',
    'Architect',
    'Consultant',
  ];

  const skillOptions = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'Go', 'Rust',
    'React', 'Angular', 'Vue.js', 'Node.js', 'Express', 'Django', 'Flask',
    'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
    'Git', 'CI/CD', 'Jenkins', 'GitLab', 'GitHub Actions',
    'Machine Learning', 'AI', 'Data Analysis', 'ETL', 'Big Data',
    'Cybersecurity', 'Penetration Testing', 'CISSP', 'Security+',
    'Project Management', 'Agile', 'Scrum', 'PMP',
  ];

  const clearanceOptions = [
    'None', 'Public Trust', 'Secret', 'Top Secret', 'Top Secret/SCI'
  ];

  const certificationOptions = [
    'PMP', 'CISSP', 'Security+', 'Network+', 'AWS Certified', 'Azure Certified',
    'Scrum Master', 'Product Owner', 'ITIL', 'Six Sigma', 'CPA', 'PE'
  ];

  const availabilityOptions = [
    { value: 'full-time', label: 'Full-time' },
    { value: 'part-time', label: 'Part-time' },
    { value: 'contract', label: 'Contract' },
    { value: 'as-needed', label: 'As-needed' },
  ];

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            Team Management
          </Typography>
          <Typography variant="body1" color="text.secondary" mt={1}>
            Manage your team members, skills, and qualifications for better opportunity matching.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddMember}
        >
          Add Team Member
        </Button>
      </Box>

      {/* Team Members Table */}
      {isLoading ? (
        <LinearProgress />
      ) : teamMembers?.length ? (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Member</TableCell>
                <TableCell>Role & Title</TableCell>
                <TableCell>Skills</TableCell>
                <TableCell>Experience</TableCell>
                <TableCell>Clearance</TableCell>
                <TableCell>Availability</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {teamMembers.map((member) => (
                <TableRow key={member.member_id}>
                  <TableCell>
                    <Box display="flex" alignItems="center" gap={2}>
                      <Avatar sx={{ bgcolor: 'primary.main' }}>
                        <PersonIcon />
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {member.name}
                        </Typography>
                        <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                          <EmailIcon fontSize="small" color="disabled" />
                          <Typography variant="caption" color="text.secondary">
                            {member.email}
                          </Typography>
                        </Box>
                        {member.phone && (
                          <Box display="flex" alignItems="center" gap={1}>
                            <PhoneIcon fontSize="small" color="disabled" />
                            <Typography variant="caption" color="text.secondary">
                              {member.phone}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {member.role}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {member.title}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" flexWrap="wrap" gap={0.5} maxWidth="200px">
                      {member.skills.slice(0, 3).map((skill) => (
                        <Chip key={skill} label={skill} size="small" variant="outlined" />
                      ))}
                      {member.skills.length > 3 && (
                        <Tooltip title={member.skills.slice(3).join(', ')}>
                          <Chip label={`+${member.skills.length - 3}`} size="small" variant="outlined" />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {member.years_experience} years
                    </Typography>
                    {member.education && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {member.education}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {member.security_clearance && (
                      <Chip
                        label={member.security_clearance}
                        size="small"
                        icon={<SecurityIcon />}
                        color={member.security_clearance.includes('Secret') ? 'warning' : 'default'}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={availabilityOptions.find(opt => opt.value === member.availability)?.label}
                      size="small"
                      color={member.availability === 'full-time' ? 'success' : 'default'}
                    />
                    {member.hourly_rate && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        ${member.hourly_rate}/hr
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={0.5}>
                      <Tooltip title="Upload Resume">
                        <IconButton
                          size="small"
                          component="label"
                          color={member.resume_document_id ? 'success' : 'default'}
                        >
                          <AttachFileIcon fontSize="small" />
                          <input
                            type="file"
                            hidden
                            accept=".pdf,.doc,.docx"
                            onChange={(e) => handleResumeUpload(member.member_id, e)}
                          />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          onClick={() => handleEditMember(member)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => deleteMutation.mutate(member.member_id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Alert severity="info">
          No team members added yet. Start by adding your first team member using the button above.
        </Alert>
      )}

      {/* Add/Edit Member Dialog */}
      <Dialog open={memberDialog} onClose={() => setMemberDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingMember ? 'Edit Team Member' : 'Add Team Member'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ pt: 1 }}>
            {/* Basic Information */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Basic Information</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Full Name"
                value={formData.name || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Phone"
                value={formData.phone || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Availability"
                value={formData.availability || 'full-time'}
                onChange={(e) => setFormData(prev => ({ ...prev, availability: e.target.value as any }))}
              >
                {availabilityOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Professional Information */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Professional Information</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={roleOptions}
                freeSolo
                value={formData.role || ''}
                onChange={(_, value) => setFormData(prev => ({ ...prev, role: value || '' }))}
                renderInput={(params) => (
                  <TextField {...params} label="Role" required />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Job Title"
                value={formData.title || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Years of Experience"
                type="number"
                value={formData.years_experience || 0}
                onChange={(e) => setFormData(prev => ({ ...prev, years_experience: parseInt(e.target.value) || 0 }))}
                inputProps={{ min: 0, max: 50 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Hourly Rate"
                type="number"
                value={formData.hourly_rate || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, hourly_rate: parseFloat(e.target.value) || undefined }))}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Education"
                value={formData.education || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, education: e.target.value }))}
                placeholder="e.g., BS Computer Science, University of Technology"
              />
            </Grid>

            {/* Skills and Certifications */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Skills & Qualifications</Typography>
            </Grid>
            <Grid item xs={12}>
              <Autocomplete
                multiple
                options={skillOptions}
                freeSolo
                value={formData.skills || []}
                onChange={(_, value) => setFormData(prev => ({ ...prev, skills: value }))}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip variant="outlined" label={option} {...getTagProps({ index })} />
                  ))
                }
                renderInput={(params) => (
                  <TextField {...params} label="Skills" placeholder="Add skills" />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                multiple
                options={certificationOptions}
                freeSolo
                value={formData.certifications || []}
                onChange={(_, value) => setFormData(prev => ({ ...prev, certifications: value }))}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip variant="outlined" label={option} {...getTagProps({ index })} />
                  ))
                }
                renderInput={(params) => (
                  <TextField {...params} label="Certifications" placeholder="Add certifications" />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                select
                fullWidth
                label="Security Clearance"
                value={formData.security_clearance || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, security_clearance: e.target.value }))}
              >
                {clearanceOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMemberDialog(false)}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {editingMember ? 'Update' : 'Add'} Member
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resume Upload Confirmation Dialog */}
      <Dialog open={!!resumeUpload} onClose={() => setResumeUpload(null)}>
        <DialogTitle>Upload Resume</DialogTitle>
        <DialogContent>
          <Typography>
            Upload resume for team member? This will replace any existing resume.
          </Typography>
          {resumeUpload && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              File: {resumeUpload.file.name}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResumeUpload(null)}>Cancel</Button>
          <Button
            onClick={confirmResumeUpload}
            variant="contained"
            disabled={resumeUploadMutation.isPending}
          >
            Upload
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

export default TeamManagement;