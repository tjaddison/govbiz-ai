import React from 'react';
import { Box, Typography, Alert } from '@mui/material';

const Analytics: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={600} mb={2}>
        Analytics
      </Typography>
      <Alert severity="info">
        Analytics page is under development. This will show performance metrics and trends.
      </Alert>
    </Box>
  );
};

export default Analytics;