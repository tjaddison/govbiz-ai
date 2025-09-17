import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { AuthService } from './auth';
import {
  Company,
  Document,
  Opportunity,
  Match,
  Analytics,
  APIResponse,
  PaginatedResponse,
  FilterOptions,
  SortOptions,
  UserFeedback
} from '../types';

class APIService {
  private api: AxiosInstance;

  constructor() {

    this.api = axios.create({
      baseURL: process.env.REACT_APP_API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });


    // Request interceptor to add auth token with refresh logic
    this.api.interceptors.request.use(
      async (config) => {
        try {
          // Check if we have a valid session first
          if (!AuthService.hasValidSession()) {
            console.log('❌ [API] No valid session - attempting token refresh');

            // Try to refresh the token
            const refreshSuccess = await AuthService.refreshToken();
            if (!refreshSuccess) {
              console.log('❌ [API] Token refresh failed - no valid authentication');
              throw new Error('No valid authentication');
            }
          }

          // Get the ID token (preferred for Cognito authorization)
          const idToken = localStorage.getItem('id_token');
          const accessToken = localStorage.getItem('access_token');

          // Use ID token if available, otherwise fall back to access token
          const token = idToken || accessToken;

          console.log('🔧 [API] Request interceptor:', {
            hasIdToken: !!idToken,
            hasAccessToken: !!accessToken,
            usingToken: idToken ? 'id_token' : (accessToken ? 'access_token' : 'none'),
            tokenPreview: token ? `${token.substring(0, 20)}...` : 'null'
          });

          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            console.log('🔧 [API] Added Authorization header with', idToken ? 'ID token' : 'access token');
          } else {
            console.log('❌ [API] No token found after refresh attempt');
            throw new Error('No authentication token available');
          }

          return config;
        } catch (error) {
          console.error('❌ [API] Request interceptor error:', error);
          // Allow the request to continue without auth header - let the server handle the 401
          return config;
        }
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          console.log('❌ [API] 401 Unauthorized received - attempting token refresh (v2)');
          originalRequest._retry = true;

          try {
            // Try to refresh the token
            const refreshSuccess = await AuthService.refreshToken();
            if (refreshSuccess) {
              console.log('✅ [API] Token refresh successful - retrying original request');

              // Get the new token and retry the original request
              const idToken = localStorage.getItem('id_token');
              const accessToken = localStorage.getItem('access_token');
              const token = idToken || accessToken;

              if (token) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return this.api(originalRequest);
              }
            }
          } catch (refreshError) {
            console.error('❌ [API] Token refresh failed:', refreshError);
          }

          // If refresh failed or no new token, clear auth and redirect
          console.log('❌ [API] Authentication failed - clearing auth and redirecting to login');
          localStorage.clear();
          window.location.href = '/';
          return Promise.reject(new Error('Authentication expired. Please log in again.'));
        }
        return Promise.reject(error);
      }
    );
  }

  // Company Profile API
  getCompanyProfile = async (): Promise<Company> => {

    try {
      const response = await this.api.get<APIResponse<Company>>('/api/company/profile');

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Failed to get company profile');
      }
      return response.data.data;
    } catch (error: any) {

      // If this is an authentication error or network error (CORS) and we're in development, return a mock profile
      if (process.env.NODE_ENV === 'development' &&
          (error.response?.status === 401 ||
           error.code === 'ERR_NETWORK' ||
           error.message === 'Network Error')) {
        return {
          tenant_id: 'demo-tenant',
          company_id: 'mock-company-id',
          company_name: 'Demo Company Inc.',
          duns_number: '123456789',
          cage_code: 'DEMO1',
          website_url: 'https://demo-company.com',
          naics_codes: ['541511', '541512'],
          certifications: ['8(a)', 'WOSB'],
          revenue_range: '$1M-$5M',
          employee_count: '11-50',
          locations: [
            {
              city: 'Washington',
              state: 'DC',
              zip_code: '20001'
            }
          ],
          capability_statement: 'Demo company providing technology solutions for government contracts.',
          primary_contact_name: 'John Doe',
          primary_contact_email: 'john@demo-company.com',
          primary_contact_phone: '(555) 123-4567',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_active: true,
          version: 1
        };
      }

      throw error;
    }
  }

  async updateCompanyProfile(company: Partial<Company>): Promise<Company> {
    const response = await this.api.put<APIResponse<Company>>('/api/company/profile', company);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to update company profile');
    }
    return response.data.data;
  }

  async scrapeCompanyWebsite(websiteUrl: string): Promise<void> {
    const response = await this.api.post<APIResponse<void>>('/api/company/scrape-website', {
      website_url: websiteUrl,
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to initiate website scraping');
    }
  }

  // Document Management API
  async getDocuments(): Promise<Document[]> {
    const response = await this.api.get<APIResponse<Document[]>>('/api/company/documents');
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get documents');
    }
    return response.data.data;
  }

  async uploadDocument(file: File, documentType: string, tags: string[]): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);
    formData.append('tags', JSON.stringify(tags));

    const response = await this.api.post<APIResponse<Document>>(
      '/api/company/documents',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to upload document');
    }
    return response.data.data;
  }

  async deleteDocument(documentId: string): Promise<void> {
    const response = await this.api.delete<APIResponse<void>>(`/api/company/documents/${documentId}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete document');
    }
  }

  async getPresignedUploadUrl(fileName: string, fileType: string): Promise<{ uploadUrl: string; key: string }> {
    const response = await this.api.post<APIResponse<{ uploadUrl: string; key: string }>>(
      '/api/company/documents/presigned-url',
      {
        file_name: fileName,
        file_type: fileType,
      }
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get presigned URL');
    }
    return response.data.data;
  }

  // Opportunities API
  async getOpportunities(
    page: number = 1,
    pageSize: number = 10,
    filters?: FilterOptions,
    sort?: SortOptions
  ): Promise<PaginatedResponse<Opportunity>> {
    const params: any = { page, pageSize };
    if (filters) Object.assign(params, { filters: JSON.stringify(filters) });
    if (sort) Object.assign(params, { sort: JSON.stringify(sort) });

    const response = await this.api.get<APIResponse<PaginatedResponse<Opportunity>>>(
      '/api/opportunities',
      { params }
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get opportunities');
    }
    return response.data.data;
  }

  async getOpportunity(opportunityId: string): Promise<Opportunity> {
    const response = await this.api.get<APIResponse<Opportunity>>(`/api/opportunities/${opportunityId}`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get opportunity');
    }
    return response.data.data;
  }

  async getOpportunityAttachments(opportunityId: string): Promise<any[]> {
    const response = await this.api.get<APIResponse<any[]>>(`/api/opportunities/${opportunityId}/attachments`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get opportunity attachments');
    }
    return response.data.data;
  }

  // Matching API
  async getMatches(
    page: number = 1,
    pageSize: number = 10,
    filters?: FilterOptions,
    sort?: SortOptions
  ): Promise<PaginatedResponse<Match>> {
    const params: any = { page, pageSize };
    if (filters) Object.assign(params, { filters: JSON.stringify(filters) });
    if (sort) Object.assign(params, { sort: JSON.stringify(sort) });

    const response = await this.api.get<APIResponse<PaginatedResponse<Match>>>(
      '/api/matches',
      { params }
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get matches');
    }
    return response.data.data;
  }

  async getMatch(matchId: string): Promise<Match> {
    const response = await this.api.get<APIResponse<Match>>(`/api/matches/${matchId}`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get match');
    }
    return response.data.data;
  }

  async markMatchAsPursued(matchId: string): Promise<void> {
    const response = await this.api.post<APIResponse<void>>(`/api/matches/${matchId}/pursue`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to mark match as pursued');
    }
  }

  async submitMatchOutcome(matchId: string, outcome: UserFeedback): Promise<void> {
    const response = await this.api.post<APIResponse<void>>(`/api/matches/${matchId}/outcome`, outcome);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to submit match outcome');
    }
  }

  async submitMatchFeedback(matchId: string, feedback: Partial<UserFeedback>): Promise<void> {
    const response = await this.api.post<APIResponse<void>>(`/api/matches/${matchId}/feedback`, feedback);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to submit feedback');
    }
  }

  // Analytics API
  async getAnalytics(): Promise<Analytics> {
    const response = await this.api.get<APIResponse<Analytics>>('/api/analytics/dashboard');
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get analytics');
    }
    return response.data.data;
  }

  async getPerformanceMetrics(dateRange?: { start: string; end: string }): Promise<any> {
    const params = dateRange ? { start: dateRange.start, end: dateRange.end } : {};
    const response = await this.api.get<APIResponse<any>>('/api/analytics/performance', { params });
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get performance metrics');
    }
    return response.data.data;
  }

  async getTrends(dateRange?: { start: string; end: string }): Promise<any> {
    const params = dateRange ? { start: dateRange.start, end: dateRange.end } : {};
    const response = await this.api.get<APIResponse<any>>('/api/analytics/trends', { params });
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get trends');
    }
    return response.data.data;
  }

  async getMatchStats(): Promise<any> {
    const response = await this.api.get<APIResponse<any>>('/api/matches/stats');
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get match stats');
    }
    return response.data.data;
  }

  // WebSocket for real-time updates
  connectWebSocket(): WebSocket {
    const wsUrl = process.env.REACT_APP_API_BASE_URL?.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(`${wsUrl}/ws`);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return ws;
  }
}

export const apiService = new APIService();