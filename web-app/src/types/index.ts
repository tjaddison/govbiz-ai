export interface User {
  id: string;
  email: string;
  name: string;
  companyId: string;
  tenantId: string;
  role: 'admin' | 'user' | 'viewer';
  subscriptionTier: 'basic' | 'professional' | 'enterprise';
}

export interface Company {
  tenant_id: string;
  company_id: string;
  company_name: string;
  duns_number: string;
  cage_code: string;
  uei: string;
  website_url: string;
  naics_codes: string[];
  certifications: string[];
  revenue_range: string;
  employee_count: string;
  locations: Location[];
  capability_statement: string;
  primary_contact_name: string;
  primary_contact_email: string;
  primary_contact_phone: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  version: number;
  website_scraping_status?: string;
  website_scraping_message?: string;
  website_scraped_at?: string;
  embedding_metadata?: {
    embeddings_generated: number;
    embedding_types: string[];
    last_embedded_at: string;
  };
}

export interface Location {
  city: string;
  state: string;
  zip_code: string;
}

export interface Document {
  document_id: string;
  tenant_id: string;
  company_id: string;
  document_name: string;
  document_type: DocumentType;
  file_size: number;
  mime_type: string;
  upload_date: string;
  s3_bucket: string;
  s3_key: string;
  processing_status: ProcessingStatus;
  embedding_id?: string;
  tags: string[];
  version: number;
}

export type DocumentType =
  | 'capability_statement'
  | 'past_performance'
  | 'resume'
  | 'proposal'
  | 'certification'
  | 'financial'
  | 'other';

export type ProcessingStatus = 'uploading' | 'processing' | 'completed' | 'failed';

export interface Opportunity {
  notice_id: string;
  title: string;
  sol_number: string;
  department: string;
  sub_tier: string;
  office: string;
  posted_date: string;
  response_deadline: string;
  naics_code: string;
  set_aside: string;
  set_aside_code?: string;
  type: string;
  description: string;
  award_amount?: string;
  pop_address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  contacts: {
    primary: ContactInfo;
    secondary?: ContactInfo;
  };
  attachments: AttachmentInfo[];
  sam_url: string;
  active?: string;
  is_expired?: boolean;
  days_until_deadline?: number;
}

export interface ContactInfo {
  title: string;
  name: string;
  email: string;
  phone: string;
  fax?: string;
}

export interface AttachmentInfo {
  name: string;
  size: number;
  resource_id: string;
  download_url: string;
}

export interface Match {
  match_id: string;
  opportunity_id: string;
  company_id: string;
  tenant_id: string;
  total_score: number;
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW';
  component_scores: ComponentScores;
  match_reasons: string[];
  recommendations: string[];
  action_items: string[];
  created_at: string;
  updated_at: string;
  user_feedback?: UserFeedback;
  opportunity: {
    title: string;
    description: string;
    department: string;
    sub_tier?: string;
    office?: string;
    response_deadline: string;
    posted_date: string;
    set_aside: string;
    set_aside_code?: string;
    naics_code: string;
    type: string;
    award_amount?: string;
    sam_gov_link: string;
    pop_city?: string;
    pop_state?: string;
  };
}

export interface MatchExplanation {
  total_score: number;
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NO_MATCH';
  component_scores: ComponentScores;
  match_reasons: string[];
  non_match_reasons: string[];
  recommendations: string[];
  action_items: string[];
}

export interface OpportunityWithMatchExplanation extends Opportunity {
  match_explanation?: MatchExplanation;
  match_id?: string;
  deep_analysis_url?: string;
}

export interface ComponentScores {
  semantic_similarity: number;
  keyword_match: number;
  naics_alignment: number;
  past_performance: number;
  certification_bonus: number;
  geographic_match: number;
  capacity_fit: number;
  recency_factor: number;
}

export interface UserFeedback {
  feedback_id: string;
  match_id: string;
  tenant_id: string;
  user_id: string;
  pursued: boolean;
  outcome?: 'won' | 'lost' | 'no_bid';
  quality_rating: 1 | 2 | 3 | 4 | 5;
  comments?: string;
  submitted_at: string;
}

export interface Analytics {
  totalMatches: number;
  highConfidenceMatches: number;
  mediumConfidenceMatches: number;
  lowConfidenceMatches: number;
  pursuedOpportunities: number;
  wonOpportunities: number;
  winRate: number;
  avgMatchScore: number;
  trendsData: TrendData[];
  componentPerformance: ComponentScores;
}

export interface TrendData {
  date: string;
  matches: number;
  pursued: number;
  won: number;
  avgScore: number;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
}

export interface FilterOptions {
  confidenceLevel?: string[];
  naicsCodes?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
  minScore?: number;
  maxScore?: number;
  pursued?: boolean;
  posted_after?: string;
  posted_before?: string;
  department?: string;
  set_aside?: string;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface TableColumn {
  id: string;
  label: string;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  format?: (value: any) => string;
  sortable?: boolean;
}

export interface TeamMember {
  member_id: string;
  tenant_id: string;
  company_id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  title: string;
  security_clearance?: string;
  years_experience: number;
  skills: string[];
  certifications: string[];
  education: string;
  resume_document_id?: string;
  hourly_rate?: number;
  availability: 'full-time' | 'part-time' | 'contract' | 'as-needed';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}