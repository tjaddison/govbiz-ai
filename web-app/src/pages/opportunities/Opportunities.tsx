import React from 'react';
import { Box, Typography, Alert } from '@mui/material';

const Opportunities: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={600} mb={2}>
        Opportunities
      </Typography>
      <Alert severity="info">
        Opportunities page is under development. This will show all available government contract opportunities.
      </Alert>
    </Box>
  );
};

export default Opportunities;