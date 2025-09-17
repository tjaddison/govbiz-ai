import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContextManaged';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import Login from './pages/auth/Login';
import SignUp from './pages/auth/SignUp';
import ConfirmSignUp from './pages/auth/ConfirmSignUp';
import ForgotPassword from './pages/auth/ForgotPassword';
import AuthCallback from './pages/auth/AuthCallback';
import Dashboard from './pages/Dashboard';
import CompanyProfile from './pages/company/CompanyProfile';
import DocumentManagement from './pages/company/DocumentManagement';
import Opportunities from './pages/opportunities/Opportunities';
import OpportunityDetail from './pages/opportunities/OpportunityDetail';
import Matches from './pages/matches/Matches';
import MatchDetail from './pages/matches/MatchDetail';
import Analytics from './pages/Analytics';
import './App.css';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
    },
    secondary: {
      main: '#dc004e',
      light: '#ff5983',
      dark: '#9a0036',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    text: {
      primary: '#333333',
      secondary: '#666666',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600,
      color: '#333333',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      color: '#333333',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 500,
      color: '#333333',
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 500,
      color: '#333333',
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
      color: '#333333',
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      color: '#333333',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          padding: '10px 20px',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <Router
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<LandingPage />} />

              {/* Auth routes */}
              <Route path="/auth/login" element={<Login />} />
              <Route path="/auth/signup" element={<SignUp />} />
              <Route path="/auth/confirm-signup" element={<ConfirmSignUp />} />
              <Route path="/auth/forgot-password" element={<ForgotPassword />} />
              <Route path="/auth/callback" element={<AuthCallback />} />

              {/* Redirect old patterns to new auth routes */}
              <Route path="/login" element={<Navigate to="/auth/login" replace />} />
              <Route path="/signup" element={<Navigate to="/auth/signup" replace />} />
              <Route path="/register" element={<Navigate to="/auth/signup" replace />} />

              {/* Redirect dashboard access to protected app */}
              <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />

              {/* Protected routes */}
              <Route
                path="/app/*"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
                        <Route path="/dashboard" element={<Dashboard />} />

                        {/* Company routes */}
                        <Route path="/company/profile" element={<CompanyProfile />} />
                        <Route path="/company/documents" element={<DocumentManagement />} />

                        {/* Opportunity routes */}
                        <Route path="/opportunities" element={<Opportunities />} />
                        <Route path="/opportunities/:id" element={<OpportunityDetail />} />

                        {/* Match routes */}
                        <Route path="/matches" element={<Matches />} />
                        <Route path="/matches/:id" element={<MatchDetail />} />

                        {/* Analytics */}
                        <Route path="/analytics" element={<Analytics />} />

                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
                      </Routes>
                    </Layout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
