import React from 'react';
import { Box, Typography, Alert } from '@mui/material';

const Matches: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" fontWeight={600} mb={2}>
        Opportunity Matches
      </Typography>
      <Alert severity="info">
        Matches page is under development. This will show your opportunity matches with scoring details.
      </Alert>
    </Box>
  );
};

export default Matches;