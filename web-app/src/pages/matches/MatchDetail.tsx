import React from 'react';
import { Box, Typography, Alert } from '@mui/material';

const MatchDetail: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={600} mb={2}>
        Match Detail
      </Typography>
      <Alert severity="info">
        Match detail page is under development.
      </Alert>
    </Box>
  );
};

export default MatchDetail;