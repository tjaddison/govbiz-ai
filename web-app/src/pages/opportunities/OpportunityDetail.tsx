import React from 'react';
import { Box, Typography, Alert } from '@mui/material';

const OpportunityDetail: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={600} mb={2}>
        Opportunity Detail
      </Typography>
      <Alert severity="info">
        Opportunity detail page is under development.
      </Alert>
    </Box>
  );
};

export default OpportunityDetail;