import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { ChatMessage, SourceReference, DocumentItem } from '../../models';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="chat-container">
      <!-- Chat Header -->
      <div class="chat-header">
        <div class="header-info">
          <div class="bot-avatar">
            <span class="material-icons">psychology</span>
          </div>
          <div>
            <h2>AskMate AI Chat & Agent</h2>
            <p class="header-status">
              <span class="online-dot"></span>
              Orchestrating {{ documents.length }} document{{ documents.length === 1 ? '' : 's' }} via AI Agent, RAG & Gemini
            </p>
          </div>
        </div>

        <div class="header-actions">
          <!-- Document Scope Selector -->
          <div class="scope-selector" *ngIf="documents.length > 0">
            <label for="docScope">Scope:</label>
            <select id="docScope" [(ngModel)]="selectedDocId" class="doc-select">
              <option value="">All Documents ({{ documents.length }})</option>
              <option *ngFor="let doc of documents" [value]="doc.id">
                {{ doc.filename }}
              </option>
            </select>
          </div>

          <button class="btn-clear" (click)="clearChat()" title="Clear conversation">
            <span class="material-icons">delete_sweep</span>
            <span>Clear</span>
          </button>
        </div>
      </div>

      <!-- Messages Viewport -->
      <div class="messages-viewport" #scrollViewport>
        <!-- Welcome Screen if no messages -->
        <div *ngIf="messages.length === 0" class="chat-welcome">
          <div class="welcome-badge">
            <span class="material-icons">smart_toy</span>
          </div>
          <h3>AI Agent & Knowledge Assistant</h3>
          <p *ngIf="documents.length > 0">
            Ask any question about your <strong>{{ documents.length }}</strong> uploaded document{{ documents.length === 1 ? '' : 's' }}, request summaries, search for exact excerpts, or chat freely. The AI agent automatically selects the right tool!
          </p>
          <p *ngIf="documents.length === 0" class="no-docs-hint">
            💡 No documents are uploaded yet. Ask general questions, or visit the <strong>Documents</strong> tab to upload PDFs for document-grounded answers!
          </p>

          <div class="suggestion-chips" *ngIf="documents.length > 0">
            <button class="chip" (click)="sendPreset('Summarize the uploaded document')">
              📝 Summarize the uploaded document
            </button>
            <button class="chip" (click)="sendPreset('What are the key points and findings in the document?')">
              📑 What are the key points and findings?
            </button>
            <button class="chip" (click)="sendPreset('Search for main principles in the document')">
              🔍 Search for main principles in the document
            </button>
            <button class="chip" (click)="sendPreset('Explain that in more detail')">
              ❓ Explain that in more detail (Tests follow-up clarification)
            </button>
          </div>

          <div class="suggestion-chips" *ngIf="documents.length === 0">
            <button class="chip" (click)="sendPreset('How does the AI Agent orchestrate RAG and tools?')">
              💡 How does the AI Agent work?
            </button>
            <button class="chip" (click)="sendPreset('Explain that in more detail')">
              ❓ Explain that in more detail (Tests isolated clarification)
            </button>
            <button class="chip" (click)="sendPreset('What are the latest best practices in AI Engineering?')">
              🚀 What are the best practices in AI Engineering?
            </button>
          </div>
        </div>

        <!-- Messages List -->
        <div class="messages-list">
          <div
            *ngFor="let msg of messages"
            class="message-row"
            [class.user-row]="msg.role === 'user'"
            [class.bot-row]="msg.role === 'assistant'"
          >
            <!-- Avatar -->
            <div class="msg-avatar">
              <span class="material-icons">
                {{ msg.role === 'user' ? 'person' : 'smart_toy' }}
              </span>
            </div>

            <!-- Content Bubble -->
            <div class="message-bubble">
              <div class="bubble-header">
                <span class="author-name">{{ msg.role === 'user' ? 'You' : 'AskMate' }}</span>
                <span class="time-label">{{ msg.timestamp | date:'shortTime' }}</span>

                <!-- Audio Playback Button -->
                <button 
                  *ngIf="msg.role === 'assistant'" 
                  class="btn-speak-icon" 
                  (click)="speakMessage(msg)"
                  title="Listen to response (gTTS)"
                >
                  <span class="material-icons">{{ playingMessage === msg ? 'volume_up' : 'volume_mute' }}</span>
                </button>

                <!-- Clarification Badge -->
                <span *ngIf="msg.clarification_needed" class="badge-clarification">
                  <span class="material-icons">help_outline</span>
                  Clarification Required
                </span>

                <!-- Agent Tool Badges -->
                <span *ngIf="msg.tool_used === 'document_qa'" class="badge-tool qa">
                  <span class="material-icons">auto_stories</span>
                  Document Q&A
                </span>
                <span *ngIf="msg.tool_used === 'summarize_document'" class="badge-tool summary">
                  <span class="material-icons">summarize</span>
                  Document Summary
                </span>
                <span *ngIf="msg.tool_used === 'search_documents'" class="badge-tool search">
                  <span class="material-icons">manage_search</span>
                  Semantic Search
                </span>
                <span *ngIf="msg.tool_used === 'general_response'" class="badge-tool general">
                  <span class="material-icons">forum</span>
                  General AI
                </span>
              </div>

              <!-- Clarification Notice Box -->
              <div *ngIf="msg.clarification_needed" class="clarification-notice">
                <span class="material-icons">info</span>
                <span>The AI Agent noticed essential information or context is missing. Please review the question below:</span>
              </div>

              <!-- Message Text -->
              <div class="bubble-text">
                {{ msg.content }}
              </div>

              <!-- Source Citations Card (Feature 2 & Tool 1/3) -->
              <div *ngIf="msg.sources && msg.sources.length > 0" class="sources-card">
                <div class="sources-header">
                  <div class="sources-title">
                    <span class="material-icons source-book-icon">menu_book</span>
                    <span>Source Citations ({{ msg.sources.length }})</span>
                  </div>
                  <span class="sources-subtitle">Retrieved from ChromaDB vector store</span>
                </div>

                <div class="sources-grid">
                  <div *ngFor="let src of msg.sources" class="source-box">
                    <div class="source-top">
                      <div class="source-file">
                        <span class="material-icons pdf-icon">picture_as_pdf</span>
                        <span class="source-filename" [title]="src.filename">{{ src.filename }}</span>
                      </div>
                      <div class="source-badges">
                        <span class="page-badge">Page {{ src.page }}</span>
                        <span *ngIf="src.score" class="score-badge">
                          {{ (src.score * 100).toFixed(0) }}% match
                        </span>
                      </div>
                    </div>
                    <blockquote class="source-excerpt">
                      "{{ src.snippet }}"
                    </blockquote>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Loading State -->
          <div *ngIf="isLoading" class="message-row bot-row">
            <div class="msg-avatar bot-loading">
              <span class="material-icons">smart_toy</span>
            </div>
            <div class="message-bubble loading-bubble">
              <div class="typing-indicator">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
              </div>
              <span class="loading-label">AI Agent analyzing query & orchestrating tools...</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Chat Input Bar -->
      <div class="chat-input-bar">
        <div class="input-wrapper">
          <textarea
            #messageInput
            rows="1"
            class="chat-textarea"
            [(ngModel)]="userInput"
            (keydown.enter)="onEnterPress($event)"
            placeholder="Ask a question, request a summary, or search documents..."
            [disabled]="isLoading"
          ></textarea>

          <button
            type="button"
            class="btn-voice"
            [class.recording]="isRecordingVoice"
            (click)="toggleVoiceInput()"
            [disabled]="isLoading || isTranscribingVoice"
            title="{{ isRecordingVoice ? 'Stop recording & transcribe' : 'Voice input (Whisper)' }}"
          >
            <span class="material-icons">{{ isRecordingVoice ? 'stop' : (isTranscribingVoice ? 'sync' : 'mic') }}</span>
          </button>

          <button
            class="btn-send"
            (click)="sendMessage()"
            [disabled]="!userInput.trim() || isLoading"
            title="Send query"
          >
            <span class="material-icons">send</span>
          </button>
        </div>
        <div class="input-footer">
          <span>Press <strong>Enter</strong> to send &bull; <strong>Shift + Enter</strong> for new line</span>
          <span class="rag-status-indicator" [class.active]="documents.length > 0">
            <span class="dot"></span>
            {{ documents.length > 0 ? 'AI Agent Grounding Active (' + documents.length + ' indexed)' : 'General Assistant Mode' }}
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .chat-container {
      max-width: 1000px;
      margin: 1.5rem auto;
      height: calc(100vh - 120px);
      display: flex;
      flex-direction: column;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);
      overflow: hidden;
    }

    .chat-header {
      padding: 0.875rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fafafa;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .header-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .bot-avatar {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .header-info h2 {
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.2;
    }

    .header-status {
      font-size: 0.75rem;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin-top: 2px;
    }

    .online-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .scope-selector {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      color: #64748b;
    }

    .doc-select {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      color: #1e293b;
      max-width: 180px;
    }

    .btn-clear {
      background: transparent;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.35rem 0.65rem;
      font-size: 0.75rem;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      cursor: pointer;
    }

    .btn-clear:hover {
      background: #fee2e2;
      color: #dc2626;
      border-color: #fca5a5;
    }

    .messages-viewport {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      background: #f8fafc;
    }

    .chat-welcome {
      margin: auto;
      text-align: center;
      max-width: 580px;
      padding: 2rem 1rem;
    }

    .welcome-badge {
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: #eff6ff;
      color: #2563eb;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1rem;
    }

    .welcome-badge .material-icons {
      font-size: 1.75rem;
    }

    .chat-welcome h3 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.5rem;
    }

    .chat-welcome p {
      font-size: 0.875rem;
      color: #64748b;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }

    .no-docs-hint {
      background: #fffbeb;
      border: 1px solid #fde68a;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      color: #92400e;
    }

    .suggestion-chips {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .chip {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.65rem 1rem;
      font-size: 0.875rem;
      color: #334155;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s ease;
    }

    .chip:hover {
      border-color: #3b82f6;
      background: #eff6ff;
      color: #1d4ed8;
      transform: translateY(-1px);
    }

    .messages-list {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .message-row {
      display: flex;
      gap: 0.75rem;
      max-width: 90%;
    }

    .user-row {
      margin-left: auto;
      flex-direction: row-reverse;
    }

    .bot-row {
      margin-right: auto;
    }

    .msg-avatar {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .user-row .msg-avatar {
      background: #2563eb;
      color: #ffffff;
    }

    .bot-row .msg-avatar {
      background: #7c3aed;
      color: #ffffff;
    }

    .message-bubble {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 0.875rem 1.125rem;
      box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    }

    .user-row .message-bubble {
      background: #2563eb;
      color: #ffffff;
      border-color: #2563eb;
      border-top-right-radius: 2px;
    }

    .bot-row .message-bubble {
      border-top-left-radius: 2px;
    }

    .bubble-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
      font-size: 0.75rem;
      flex-wrap: wrap;
    }

    .author-name {
      font-weight: 600;
    }

    .user-row .author-name {
      color: #dbeafe;
    }

    .bot-row .author-name {
      color: #64748b;
    }

    .time-label {
      opacity: 0.7;
    }

    .badge-clarification {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: #fffbeb;
      color: #b45309;
      border: 1px solid #fde68a;
      padding: 0.15rem 0.45rem;
      border-radius: 9999px;
      font-size: 0.6875rem;
      font-weight: 600;
    }

    .badge-clarification .material-icons {
      font-size: 0.8125rem;
    }

    .badge-tool {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.15rem 0.45rem;
      border-radius: 9999px;
      font-size: 0.6875rem;
      font-weight: 600;
    }

    .badge-tool .material-icons {
      font-size: 0.8125rem;
    }

    .badge-tool.qa {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }

    .badge-tool.summary {
      background: #faf5ff;
      color: #7c3aed;
      border: 1px solid #ddd6fe;
    }

    .badge-tool.search {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }

    .badge-tool.general {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
    }

    .clarification-notice {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      padding: 0.5rem 0.75rem;
      margin-bottom: 0.75rem;
      font-size: 0.75rem;
      color: #92400e;
      font-weight: 500;
    }

    .clarification-notice .material-icons {
      font-size: 1rem;
      color: #d97706;
    }

    .bubble-text {
      font-size: 0.9375rem;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Sources Cards */
    .sources-card {
      margin-top: 1rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.875rem;
    }

    .sources-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #edf2f7;
    }

    .sources-title {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #1e293b;
    }

    .source-book-icon {
      font-size: 1rem;
      color: #2563eb;
    }

    .sources-subtitle {
      font-size: 0.6875rem;
      color: #94a3b8;
    }

    .sources-grid {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }

    .source-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-left: 3px solid #2563eb;
      border-radius: 6px;
      padding: 0.625rem;
    }

    .source-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.35rem;
      font-size: 0.75rem;
    }

    .source-file {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: 600;
      color: #0f172a;
    }

    .pdf-icon {
      color: #ef4444;
      font-size: 1rem;
    }

    .source-filename {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .source-badges {
      display: flex;
      gap: 0.35rem;
    }

    .page-badge {
      background: #eff6ff;
      color: #1d4ed8;
      font-weight: 600;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.6875rem;
    }

    .score-badge {
      background: #ecfdf5;
      color: #047857;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.6875rem;
    }

    .source-excerpt {
      font-size: 0.75rem;
      color: #475569;
      font-style: italic;
      line-height: 1.45;
      margin: 0;
    }

    .loading-bubble {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1.25rem;
    }

    .typing-indicator {
      display: flex;
      gap: 4px;
    }

    .typing-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #94a3b8;
      animation: pulse 1.4s infinite ease-in-out both;
    }

    .typing-dot:nth-child(1) { animation-delay: -0.32s; }
    .typing-dot:nth-child(2) { animation-delay: -0.16s; }

    @keyframes pulse {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }

    .loading-label {
      font-size: 0.8125rem;
      color: #64748b;
    }

    .chat-input-bar {
      padding: 1rem 1.5rem;
      border-top: 1px solid #e2e8f0;
      background: #ffffff;
    }

    .input-wrapper {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 0.5rem 0.75rem;
      transition: border-color 0.15s ease;
    }

    .input-wrapper:focus-within {
      border-color: #2563eb;
      background: #ffffff;
      box-shadow: 0 0 0 2px rgb(37 99 235 / 0.1);
    }

    .chat-textarea {
      flex: 1;
      border: none;
      background: transparent;
      outline: none;
      resize: none;
      font-family: inherit;
      font-size: 0.9375rem;
      line-height: 1.4;
      color: #0f172a;
      max-height: 120px;
    }

    .btn-send {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      background: #2563eb;
      color: #ffffff;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.15s ease;
    }

    .btn-send:hover:not(:disabled) {
      background: #1d4ed8;
      transform: scale(1.05);
    }

    .btn-send:disabled {
      background: #cbd5e1;
      cursor: not-allowed;
    }

    .btn-speak-icon {
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 0;
      display: inline-flex;
      align-items: center;
      transition: color 0.15s ease;
    }

    .btn-speak-icon:hover {
      color: #ea580c;
    }

    .btn-speak-icon .material-icons {
      font-size: 1rem;
    }

    .btn-voice {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.15s ease;
    }

    .btn-voice:hover:not(:disabled) {
      background: #e2e8f0;
      color: #0f172a;
    }

    .btn-voice.recording {
      background: #fee2e2;
      color: #dc2626;
      border-color: #fca5a5;
      animation: pulse-mic 1s infinite alternate;
    }

    @keyframes pulse-mic {
      from { transform: scale(1); }
      to { transform: scale(1.08); }
    }

    .input-footer {
      display: flex;
      justify-content: space-between;
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .rag-status-indicator {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: #94a3b8;
    }

    .rag-status-indicator.active {
      color: #10b981;
      font-weight: 500;
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
  `]
})
export class ChatComponent implements OnInit, AfterViewChecked {
  @ViewChild('scrollViewport') private scrollViewport!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  messages: ChatMessage[] = [];
  documents: DocumentItem[] = [];
  selectedDocId = '';
  userInput = '';
  isLoading = false;

  // Voice recording & playback state
  isRecordingVoice = false;
  isTranscribingVoice = false;
  mediaRecorder?: MediaRecorder;
  audioChunks: Blob[] = [];
  playingMessage: ChatMessage | null = null;
  currentAudio?: HTMLAudioElement;

  ngOnInit() {
    this.fetchDocuments();
    this.route.queryParams.subscribe(params => {
      if (params['docId']) {
        this.selectedDocId = params['docId'];
      }
    });
  }

  fetchDocuments() {
    this.api.getDocuments().subscribe({
      next: (res) => {
        this.documents = res.documents || [];
      },
      error: () => {
        this.documents = [];
      }
    });
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      if (this.scrollViewport) {
        this.scrollViewport.nativeElement.scrollTop = this.scrollViewport.nativeElement.scrollHeight;
      }
    } catch {}
  }

  onEnterPress(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  sendPreset(text: string) {
    this.userInput = text;
    this.sendMessage();
  }

  sendMessage() {
    const query = this.userInput.trim();
    if (!query || this.isLoading) return;

    // 1. Add user query to UI
    const userMsg: ChatMessage = {
      role: 'user',
      content: query,
      timestamp: new Date()
    };
    this.messages.push(userMsg);
    this.userInput = '';
    this.isLoading = true;

    // 2. Prepare conversation history
    const historyPayload = this.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
      .map(m => ({ role: m.role, content: m.content }));

    // 3. Document filter if selected
    const docIds = this.selectedDocId ? [this.selectedDocId] : undefined;

    // 4. Send to backend through AI Agent
    this.api.sendChatMessage({
      message: query,
      conversation_history: historyPayload,
      document_ids: docIds,
      use_agent: true
    }).subscribe({
      next: (res) => {
        const botMsg: ChatMessage = {
          role: 'assistant',
          content: res.response,
          sources: res.sources || [],
          clarification_needed: res.clarification_needed,
          intent_category: res.intent_category,
          tool_used: res.tool_used,
          timestamp: new Date()
        };
        this.messages.push(botMsg);
        this.isLoading = false;
      },
      error: (err) => {
        const errorMsg: ChatMessage = {
          role: 'assistant',
          content: `⚠️ Failed to get answer: ${err.error?.detail || err.message || 'Server error'}. Please verify backend connection.`,
          timestamp: new Date()
        };
        this.messages.push(errorMsg);
        this.isLoading = false;
      }
    });
  }

  clearChat() {
    this.messages = [];
  }

  async toggleVoiceInput() {
    if (this.isRecordingVoice) {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      this.isRecordingVoice = false;
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
          stream.getTracks().forEach(track => track.stop());
          this.transcribeVoiceBlob(audioBlob);
        };

        this.mediaRecorder.start();
        this.isRecordingVoice = true;
      } catch (err) {
        alert('Could not access microphone. Please grant microphone permissions.');
        this.isRecordingVoice = false;
      }
    }
  }

  private transcribeVoiceBlob(blob: Blob) {
    this.isTranscribingVoice = true;
    this.api.transcribeAudio(blob).subscribe({
      next: (res) => {
        this.isTranscribingVoice = false;
        if (res.text) {
          this.userInput = res.text;
          // Focus input or auto-send if clear query
          if (this.messageInput?.nativeElement) {
            this.messageInput.nativeElement.focus();
          }
        }
      },
      error: (err) => {
        this.isTranscribingVoice = false;
        alert('Voice transcription failed: ' + (err.error?.detail || err.message || 'Unknown error'));
      }
    });
  }

  speakMessage(msg: ChatMessage) {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = undefined;
    }

    if (this.playingMessage === msg) {
      this.playingMessage = null;
      return;
    }

    this.playingMessage = msg;
    this.api.synthesizeSpeech(msg.content, 'en').subscribe({
      next: (blob: Blob) => {
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        this.currentAudio = audio;
        audio.play().catch(() => {});
        audio.onended = () => {
          this.playingMessage = null;
          URL.revokeObjectURL(audioUrl);
        };
      },
      error: () => {
        this.playingMessage = null;
      }
    });
  }
}
