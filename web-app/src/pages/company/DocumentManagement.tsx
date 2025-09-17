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
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { DocumentType } from '../../types';

const DocumentManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const [uploadDialog, setUploadDialog] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState<DocumentType>('capability_statement');
  const [tags, setTags] = useState<string>('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as any });
  const [uploadProgress, setUploadProgress] = useState<{ [fileName: string]: number }>({});

  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: apiService.getDocuments,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, type, tagList }: { file: File; type: DocumentType; tagList: string[] }) => {
      try {
        // Reset progress
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

        // Get presigned URL
        setUploadProgress(prev => ({ ...prev, [file.name]: 10 }));
        const { uploadUrl, key, document_id } = await apiService.getPresignedUploadUrl(file.name, file.type, type);

        // Upload to S3 with progress
        setUploadProgress(prev => ({ ...prev, [file.name]: 30 }));
        await apiService.uploadToS3(uploadUrl, file);

        // Confirm upload
        setUploadProgress(prev => ({ ...prev, [file.name]: 80 }));
        const result = await apiService.confirmDocumentUpload(document_id, tagList);

        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
        return result;
      } catch (error) {
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setSnackbar({ open: true, message: `${variables.file.name} uploaded successfully!`, severity: 'success' });
      // Remove completed file from progress
      setUploadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[variables.file.name];
        return newProgress;
      });
    },
    onError: (error: any, variables) => {
      setSnackbar({ open: true, message: `${variables.file.name}: ${error.message || 'Upload failed'}`, severity: 'error' });
      // Reset progress on error
      setUploadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[variables.file.name];
        return newProgress;
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => apiService.deleteDocument(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setSnackbar({ open: true, message: 'Document deleted successfully!', severity: 'success' });
    },
    onError: (error: any) => {
      setSnackbar({ open: true, message: error.message || 'Delete failed', severity: 'error' });
    },
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      setUploadFiles(acceptedFiles);
      setUploadDialog(true);
    },
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxSize: 100 * 1024 * 1024, // 100MB
  });

  const documentTypes: { value: DocumentType; label: string }[] = [
    { value: 'capability_statement', label: 'Capability Statement' },
    { value: 'past_performance', label: 'Past Performance' },
    { value: 'resume', label: 'Team Resume' },
    { value: 'proposal', label: 'Past Proposal' },
    { value: 'certification', label: 'Certification' },
    { value: 'financial', label: 'Financial Document' },
    { value: 'other', label: 'Other' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'processing':
        return 'warning';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const handleUpload = () => {
    if (uploadFiles.length === 0) return;

    const tagList = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

    // Upload files sequentially to avoid overwhelming the system
    uploadFiles.forEach((file, index) => {
      setTimeout(() => {
        uploadMutation.mutate({
          file,
          type: documentType,
          tagList,
        });
      }, index * 500); // Stagger uploads by 500ms
    });

    // Close dialog after starting uploads
    setUploadDialog(false);
    setUploadFiles([]);
    setTags('');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight={600}>
            Document Management
          </Typography>
          <Typography variant="body1" color="text.secondary" mt={1}>
            Upload and manage your company documents to improve opportunity matching.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setUploadDialog(true)}
        >
          Upload Documents
        </Button>
      </Box>

      {/* Upload Zone */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box
            {...getRootProps()}
            sx={{
              border: '2px dashed',
              borderColor: isDragActive ? 'primary.main' : 'grey.300',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: isDragActive ? 'action.hover' : 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            <input {...getInputProps()} />
            <UploadIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              {isDragActive
                ? 'Drop the files here...'
                : 'Drag & drop files here, or click to select files'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Supports PDF, DOC, DOCX, XLS, XLSX files up to 100MB
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Documents List */}
      {isLoading ? (
        <LinearProgress />
      ) : documents?.length ? (
        <Grid container spacing={3}>
          {documents.map((doc) => (
            <Grid item xs={12} sm={6} md={4} key={doc.document_id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="between" alignItems="flex-start" mb={2}>
                    <Typography variant="h6" fontSize="1rem" fontWeight={600} noWrap>
                      {doc.document_name}
                    </Typography>
                    <Box display="flex" gap={0.5}>
                      <IconButton
                        size="small"
                        onClick={async () => {
                          try {
                            const downloadUrl = await apiService.getDocumentDownloadUrl(doc.document_id);
                            window.open(downloadUrl, '_blank');
                          } catch (error) {
                            setSnackbar({
                              open: true,
                              message: 'Failed to download document',
                              severity: 'error'
                            });
                          }
                        }}
                        title="Download"
                      >
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => deleteMutation.mutate(doc.document_id)}
                        disabled={deleteMutation.isPending}
                        title="Delete"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  <Typography variant="body2" color="text.secondary" mb={1}>
                    Type: {documentTypes.find(t => t.value === doc.document_type)?.label}
                  </Typography>

                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Size: {formatFileSize(doc.file_size)}
                  </Typography>

                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Chip
                      label={doc.processing_status}
                      color={getStatusColor(doc.processing_status) as any}
                      size="small"
                    />
                    <Typography variant="caption" color="text.secondary">
                      v{doc.version}
                    </Typography>
                  </Box>

                  {doc.tags.length > 0 && (
                    <Box>
                      {doc.tags.slice(0, 3).map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          variant="outlined"
                          sx={{ mr: 0.5, mb: 0.5 }}
                        />
                      ))}
                      {doc.tags.length > 3 && (
                        <Typography variant="caption" color="text.secondary">
                          +{doc.tags.length - 3} more
                        </Typography>
                      )}
                    </Box>
                  )}

                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    Uploaded: {new Date(doc.upload_date).toLocaleDateString()}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Alert severity="info">
          No documents uploaded yet. Start by uploading your first document using the upload zone above.
        </Alert>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialog} onClose={() => setUploadDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Upload Documents</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              select
              fullWidth
              label="Document Type"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              sx={{ mb: 2 }}
            >
              {documentTypes.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              fullWidth
              label="Tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tag1, tag2, tag3"
              helperText="Separate tags with commas"
              sx={{ mb: 2 }}
            />

            {uploadFiles.length > 0 && (
              <Box>
                <Typography variant="subtitle2" mb={1}>
                  Files to upload:
                </Typography>
                {uploadFiles.map((file, index) => (
                  <Box key={index} mb={1}>
                    <Box display="flex" alignItems="center" mb={0.5}>
                      <Typography variant="body2" flexGrow={1}>
                        {file.name} ({formatFileSize(file.size)})
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => {
                          const newFiles = uploadFiles.filter((_, i) => i !== index);
                          setUploadFiles(newFiles);
                        }}
                        disabled={uploadProgress[file.name] > 0}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    {uploadProgress[file.name] > 0 && (
                      <LinearProgress
                        variant="determinate"
                        value={uploadProgress[file.name]}
                        sx={{ height: 4, borderRadius: 2 }}
                      />
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialog(false)}>Cancel</Button>
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={uploadFiles.length === 0 || uploadMutation.isPending}
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

export default DocumentManagement;