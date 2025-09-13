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

    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      async (config) => {
        const token = await AuthService.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          try {
            await AuthService.refreshToken();
            // Retry the original request
            return this.api(error.config);
          } catch (refreshError) {
            // Refresh failed, redirect to login
            AuthService.signOut();
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Company Profile API
  async getCompanyProfile(): Promise<Company> {
    const response = await this.api.get<APIResponse<Company>>('/api/company/profile');
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get company profile');
    }
    return response.data.data;
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