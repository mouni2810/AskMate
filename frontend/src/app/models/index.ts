export interface HealthStatus {
  status: string;
  app: string;
  version: string;
  database: string;
  vector_store: string;
  gemini_configured: boolean;
}

export interface DocumentItem {
  id: string;
  filename: string;
  file_size: number;
  upload_date: string;
  page_count: number;
  chunk_count: number;
  status: string;
}

export interface DocumentListResponse {
  documents: DocumentItem[];
  total: number;
}

export interface SourceReference {
  document_id: string;
  filename: string;
  page: number;
  snippet: string;
  score?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceReference[];
  clarification_needed?: boolean;
  intent_category?: string;
  tool_used?: string;
  timestamp?: Date;
  audioUrl?: string;
}

export interface ChatRequest {
  message: string;
  conversation_history?: { role: string; content: string }[];
  document_ids?: string[];
  use_agent?: boolean;
}

export interface ChatResponse {
  response: string;
  sources: SourceReference[];
  clarification_needed: boolean;
  intent_category?: string;
  tool_used?: string;
}

export interface SummaryRequest {
  document_id: string;
  summary_type: 'short' | 'detailed' | 'key_points';
}

export interface SummaryResponse {
  document_id: string;
  filename: string;
  summary_type: string;
  summary: string;
  key_points?: string[];
}

export interface TranscribeResponse {
  text: string;
  language: string;
  duration: number;
}

