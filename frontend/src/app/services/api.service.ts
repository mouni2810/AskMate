import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  HealthStatus,
  DocumentItem,
  DocumentListResponse,
  ChatRequest,
  ChatResponse,
  SummaryRequest,
  SummaryResponse,
  TranscribeResponse
} from '../models';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = 'http://localhost:8000/api';

  getHealth(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>(`${this.baseUrl}/health`);
  }

  getDocuments(): Observable<DocumentListResponse> {
    return this.http.get<DocumentListResponse>(`${this.baseUrl}/documents`);
  }

  uploadDocument(file: File): Observable<DocumentItem> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<DocumentItem>(`${this.baseUrl}/documents/upload`, formData);
  }

  deleteDocument(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.baseUrl}/documents/${id}`);
  }

  sendChatMessage(request: ChatRequest): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.baseUrl}/chat`, request);
  }

  generateSummary(request: SummaryRequest): Observable<SummaryResponse> {
    return this.http.post<SummaryResponse>(`${this.baseUrl}/summary`, request);
  }

  transcribeAudio(file: File | Blob): Observable<TranscribeResponse> {
    const formData = new FormData();
    formData.append('file', file, 'recording.wav');
    return this.http.post<TranscribeResponse>(`${this.baseUrl}/voice/transcribe`, formData);
  }

  synthesizeSpeech(text: string, lang = 'en'): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/voice/speak`, { text, lang }, { responseType: 'blob' });
  }
}

