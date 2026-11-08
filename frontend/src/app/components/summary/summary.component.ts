import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { DocumentItem, SummaryResponse } from '../../models';

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="summary-container">
      <!-- Page Header -->
      <div class="page-header">
        <div class="header-icon-wrap">
          <span class="material-icons">auto_stories</span>
        </div>
        <div>
          <h1>Document Summarization</h1>
          <p>Extract instant, high-fidelity insights from your uploaded documents using Gemini.</p>
        </div>
      </div>

      <!-- No Documents Uploaded State -->
      <div *ngIf="!isLoadingDocs && documents.length === 0" class="empty-docs-card">
        <div class="empty-icon-box">
          <span class="material-icons">upload_file</span>
        </div>
        <h3>No Documents Uploaded Yet</h3>
        <p>To generate summaries, please upload a PDF document first in the Document Management page.</p>
        <button class="btn-primary" routerLink="/documents">
          <span class="material-icons">add</span>
          Go to Document Upload
        </button>
      </div>

      <!-- Main Summarizer Form -->
      <div *ngIf="documents.length > 0" class="summarizer-grid">
        <!-- Configuration Card -->
        <div class="card config-card">
          <h2 class="card-title">
            <span class="step-num">1</span>
            Select Document
          </h2>
          
          <div class="form-group">
            <label for="docSelect" class="form-label">Uploaded PDF Document</label>
            <div class="select-wrapper">
              <span class="material-icons select-icon">picture_as_pdf</span>
              <select id="docSelect" [(ngModel)]="selectedDocumentId" class="custom-select">
                <option value="" disabled>-- Choose a document --</option>
                <option *ngFor="let doc of documents" [value]="doc.id">
                  {{ doc.filename }} ({{ doc.page_count }} pages, {{ (doc.file_size / 1024).toFixed(0) }} KB)
                </option>
              </select>
            </div>
          </div>

          <h2 class="card-title" style="margin-top: 1.5rem;">
            <span class="step-num">2</span>
            Choose Summary Type
          </h2>

          <div class="type-cards">
            <!-- Short Summary -->
            <div 
              class="type-card" 
              [class.active]="selectedType === 'short'"
              (click)="selectedType = 'short'"
            >
              <div class="type-icon-box short">
                <span class="material-icons">summarize</span>
              </div>
              <div class="type-info">
                <div class="type-title">Short Summary</div>
                <div class="type-desc">Executive 2-3 paragraph overview highlighting the core purpose, themes, and conclusion.</div>
              </div>
              <span class="material-icons check-icon" *ngIf="selectedType === 'short'">check_circle</span>
            </div>

            <!-- Detailed Summary -->
            <div 
              class="type-card" 
              [class.active]="selectedType === 'detailed'"
              (click)="selectedType = 'detailed'"
            >
              <div class="type-icon-box detailed">
                <span class="material-icons">menu_book</span>
              </div>
              <div class="type-info">
                <div class="type-title">Detailed Summary</div>
                <div class="type-desc">In-depth section-by-section breakdown with structured headers and full explanations.</div>
              </div>
              <span class="material-icons check-icon" *ngIf="selectedType === 'detailed'">check_circle</span>
            </div>

            <!-- Key Points -->
            <div 
              class="type-card" 
              [class.active]="selectedType === 'key_points'"
              (click)="selectedType = 'key_points'"
            >
              <div class="type-icon-box key-points">
                <span class="material-icons">format_list_bulleted</span>
              </div>
              <div class="type-info">
                <div class="type-title">Key Points</div>
                <div class="type-desc">Essential bullet points, critical metrics, requirements, and actionable takeaways.</div>
              </div>
              <span class="material-icons check-icon" *ngIf="selectedType === 'key_points'">check_circle</span>
            </div>
          </div>

          <!-- Generate Action -->
          <div class="action-footer">
            <button 
              class="btn-generate"
              (click)="generateSummary()"
              [disabled]="!selectedDocumentId || isGenerating"
            >
              <span class="material-icons" *ngIf="!isGenerating">bolt</span>
              <span class="material-icons spinning" *ngIf="isGenerating">sync</span>
              <span>{{ isGenerating ? 'Generating Summary...' : 'Generate Summary' }}</span>
            </button>
          </div>

          <div *ngIf="errorMessage" class="error-banner">
            <span class="material-icons">error_outline</span>
            <span>{{ errorMessage }}</span>
          </div>
        </div>

        <!-- Output / Results Viewport -->
        <div class="card result-card">
          <!-- Placeholder when empty -->
          <div *ngIf="!currentSummary && !isGenerating" class="result-placeholder">
            <div class="placeholder-icon">
              <span class="material-icons">article</span>
            </div>
            <h3>Summary Preview</h3>
            <p>Select your document and summary format on the left, then click <strong>Generate Summary</strong> to view the results here.</p>
          </div>

          <!-- Loading Skeleton -->
          <div *ngIf="isGenerating" class="skeleton-wrap">
            <div class="skeleton-header">
              <div class="skeleton-box title"></div>
              <div class="skeleton-box badge"></div>
            </div>
            <div class="skeleton-box line full"></div>
            <div class="skeleton-box line long"></div>
            <div class="skeleton-box line medium"></div>
            <div class="skeleton-box line long"></div>
            <div class="skeleton-box line full"></div>
            <div class="skeleton-box line medium"></div>
            <p class="skeleton-label">Reading document pages & generating summary with Gemini...</p>
          </div>

          <!-- Generated Summary View -->
          <div *ngIf="currentSummary && !isGenerating" class="summary-content-wrap">
            <div class="result-header">
              <div>
                <div class="doc-badge">
                  <span class="material-icons">picture_as_pdf</span>
                  <span>{{ currentSummary.filename }}</span>
                </div>
                <span class="type-chip" [class]="currentSummary.summary_type">
                  {{ getSummaryTypeLabel(currentSummary.summary_type) }}
                </span>
              </div>

              <div class="result-actions">
                <button class="btn-action" (click)="copyToClipboard()" title="Copy summary">
                  <span class="material-icons">{{ copySuccess ? 'done' : 'content_copy' }}</span>
                  <span>{{ copySuccess ? 'Copied!' : 'Copy' }}</span>
                </button>
                <button class="btn-action" (click)="downloadSummary()" title="Download text">
                  <span class="material-icons">download</span>
                  <span>Download</span>
                </button>
              </div>
            </div>

            <!-- Key Points List Format -->
            <div *ngIf="currentSummary.summary_type === 'key_points' && currentSummary.key_points && currentSummary.key_points.length > 0" class="keypoints-list">
              <div *ngFor="let point of currentSummary.key_points; let idx = index" class="point-item">
                <div class="point-num">{{ idx + 1 }}</div>
                <div class="point-text">{{ point }}</div>
              </div>
            </div>

            <!-- Full Text Format -->
            <div class="summary-body">
              {{ currentSummary.summary }}
            </div>

            <!-- Quick Navigation to Chat -->
            <div class="result-footer-nav">
              <div class="chat-prompt">
                <span class="material-icons">chat</span>
                <span>Want to ask specific questions about this document?</span>
              </div>
              <button class="btn-chat-nav" (click)="chatAboutDocument()">
                Open in AI Chat
                <span class="material-icons">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .summary-container {
      max-width: 1200px;
      margin: 1.5rem auto;
      padding: 0 1.5rem 3rem;
    }

    .page-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .header-icon-wrap {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: linear-gradient(135deg, #8b5cf6, #6d28d9);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .page-header h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.25rem;
    }

    .page-header p {
      color: #64748b;
      font-size: 0.9375rem;
    }

    .empty-docs-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 4rem 2rem;
      text-align: center;
      max-width: 600px;
      margin: 3rem auto;
    }

    .empty-icon-box {
      width: 64px;
      height: 64px;
      border-radius: 16px;
      background: #f1f5f9;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
    }

    .empty-icon-box .material-icons {
      font-size: 2rem;
    }

    .empty-docs-card h3 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.5rem;
    }

    .empty-docs-card p {
      color: #64748b;
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }

    .btn-primary {
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      padding: 0.75rem 1.5rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s ease;
    }

    .btn-primary:hover {
      background: #1d4ed8;
    }

    .summarizer-grid {
      display: grid;
      grid-template-columns: 420px 1fr;
      gap: 1.5rem;
      align-items: start;
    }

    @media (max-width: 900px) {
      .summarizer-grid {
        grid-template-columns: 1fr;
      }
    }

    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
    }

    .card-title {
      font-size: 1rem;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .step-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #eff6ff;
      color: #2563eb;
      font-size: 0.8125rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-label {
      display: block;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #334155;
      margin-bottom: 0.5rem;
    }

    .select-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .select-icon {
      position: absolute;
      left: 0.75rem;
      color: #ef4444;
      font-size: 1.25rem;
      pointer-events: none;
    }

    .custom-select {
      width: 100%;
      padding: 0.75rem 0.75rem 0.75rem 2.5rem;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      font-size: 0.875rem;
      color: #0f172a;
      background: #f8fafc;
      cursor: pointer;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .custom-select:focus {
      border-color: #2563eb;
      background: #ffffff;
      box-shadow: 0 0 0 2px rgb(37 99 235 / 0.1);
    }

    .type-cards {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .type-card {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      padding: 0.875rem;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
      background: #ffffff;
    }

    .type-card:hover {
      border-color: #cbd5e1;
      background: #f8fafc;
    }

    .type-card.active {
      border-color: #8b5cf6;
      background: #faf5ff;
      box-shadow: 0 2px 4px rgb(139 92 246 / 0.08);
    }

    .type-icon-box {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .type-icon-box.short { background: #eff6ff; color: #2563eb; }
    .type-icon-box.detailed { background: #faf5ff; color: #8b5cf6; }
    .type-icon-box.key-points { background: #ecfdf5; color: #059669; }

    .type-info {
      flex: 1;
    }

    .type-title {
      font-size: 0.875rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.15rem;
    }

    .type-desc {
      font-size: 0.75rem;
      color: #64748b;
      line-height: 1.35;
    }

    .check-icon {
      color: #8b5cf6;
      font-size: 1.25rem;
    }

    .action-footer {
      margin-top: 1rem;
    }

    .btn-generate {
      width: 100%;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      padding: 0.875rem;
      font-size: 0.9375rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-generate:hover:not(:disabled) {
      opacity: 0.95;
      transform: translateY(-1px);
      box-shadow: 0 4px 6px -1px rgb(37 99 235 / 0.2);
    }

    .btn-generate:disabled {
      background: #cbd5e1;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .spinning {
      animation: spin 1.2s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .error-banner {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: #fef2f2;
      border: 1px solid #fee2e2;
      border-radius: 8px;
      color: #dc2626;
      font-size: 0.8125rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* Result Card */
    .result-card {
      min-height: 520px;
      display: flex;
      flex-direction: column;
    }

    .result-placeholder {
      margin: auto;
      text-align: center;
      max-width: 380px;
      padding: 3rem 1rem;
    }

    .placeholder-icon {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      background: #f1f5f9;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1rem;
    }

    .result-placeholder h3 {
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.5rem;
    }

    .result-placeholder p {
      font-size: 0.875rem;
      color: #64748b;
      line-height: 1.5;
    }

    .skeleton-wrap {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }

    .skeleton-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .skeleton-box {
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 6px;
    }

    .skeleton-box.title { width: 180px; height: 24px; }
    .skeleton-box.badge { width: 90px; height: 24px; }
    .skeleton-box.line { height: 16px; }
    .skeleton-box.line.full { width: 100%; }
    .skeleton-box.line.long { width: 90%; }
    .skeleton-box.line.medium { width: 75%; }

    .skeleton-label {
      margin-top: 1.5rem;
      text-align: center;
      font-size: 0.875rem;
      color: #64748b;
      font-weight: 500;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .summary-content-wrap {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 1.25rem;
      gap: 1rem;
    }

    .doc-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: 700;
      color: #0f172a;
      font-size: 1.05rem;
      margin-bottom: 0.35rem;
    }

    .doc-badge .material-icons {
      color: #ef4444;
      font-size: 1.25rem;
    }

    .type-chip {
      display: inline-block;
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .type-chip.short { background: #eff6ff; color: #1d4ed8; }
    .type-chip.detailed { background: #faf5ff; color: #7c3aed; }
    .type-chip.key_points { background: #ecfdf5; color: #047857; }

    .result-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-action {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 0.4rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-action:hover {
      background: #eff6ff;
      border-color: #93c5fd;
      color: #1d4ed8;
    }

    .btn-action .material-icons {
      font-size: 0.9375rem;
    }

    .keypoints-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .point-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.75rem 1rem;
    }

    .point-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #10b981;
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .point-text {
      font-size: 0.875rem;
      color: #1e293b;
      line-height: 1.5;
    }

    .summary-body {
      font-size: 0.9375rem;
      line-height: 1.65;
      color: #334155;
      white-space: pre-wrap;
      word-break: break-word;
      flex: 1;
    }

    .result-footer-nav {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .chat-prompt {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      color: #64748b;
    }

    .chat-prompt .material-icons {
      color: #2563eb;
      font-size: 1.125rem;
    }

    .btn-chat-nav {
      background: #eff6ff;
      color: #2563eb;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 0.5rem 0.875rem;
      font-size: 0.8125rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-chat-nav:hover {
      background: #2563eb;
      color: #ffffff;
    }
  `]
})
export class SummaryComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  documents: DocumentItem[] = [];
  selectedDocumentId = '';
  selectedType: 'short' | 'detailed' | 'key_points' = 'short';
  currentSummary: SummaryResponse | null = null;

  isLoadingDocs = true;
  isGenerating = false;
  copySuccess = false;
  errorMessage = '';

  ngOnInit() {
    this.fetchDocuments();
  }

  fetchDocuments() {
    this.isLoadingDocs = true;
    this.api.getDocuments().subscribe({
      next: (res) => {
        this.documents = res.documents || [];
        if (this.documents.length > 0 && !this.selectedDocumentId) {
          this.selectedDocumentId = this.documents[0].id;
        }
        this.isLoadingDocs = false;
      },
      error: (err) => {
        this.documents = [];
        this.isLoadingDocs = false;
      }
    });
  }

  generateSummary() {
    if (!this.selectedDocumentId || this.isGenerating) return;

    this.isGenerating = true;
    this.errorMessage = '';
    this.currentSummary = null;
    this.copySuccess = false;

    this.api.generateSummary({
      document_id: this.selectedDocumentId,
      summary_type: this.selectedType
    }).subscribe({
      next: (res) => {
        this.currentSummary = res;
        this.isGenerating = false;
      },
      error: (err) => {
        this.errorMessage = err.error?.detail || err.message || 'Failed to generate summary. Please try again.';
        this.isGenerating = false;
      }
    });
  }

  getSummaryTypeLabel(type: string): string {
    switch (type) {
      case 'detailed': return 'Detailed Summary';
      case 'key_points': return 'Key Points';
      default: return 'Short Summary';
    }
  }

  copyToClipboard() {
    if (!this.currentSummary) return;
    const textToCopy = this.currentSummary.summary;
    navigator.clipboard.writeText(textToCopy).then(() => {
      this.copySuccess = true;
      setTimeout(() => (this.copySuccess = false), 2500);
    });
  }

  downloadSummary() {
    if (!this.currentSummary) return;
    const blob = new Blob([this.currentSummary.summary], { type: 'text/markdown;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentSummary.filename.replace('.pdf', '')}_${this.currentSummary.summary_type}_summary.md`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  chatAboutDocument() {
    if (!this.selectedDocumentId) return;
    this.router.navigate(['/chat'], {
      queryParams: { docId: this.selectedDocumentId }
    });
  }
}
