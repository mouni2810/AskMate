import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { HealthStatus, DocumentItem } from '../../models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dashboard-container">
      <header class="welcome-header">
        <div class="welcome-text">
          <h1>Welcome to <span class="brand-highlight">AskMate</span></h1>
          <p class="subtitle">Your intelligent, document-grounded AI knowledge companion powered by Gemini, RAG, and LangChain.</p>
        </div>
        <div class="status-badge" [class.online]="health?.status === 'healthy'" [class.offline]="!health || health.status !== 'healthy'">
          <span class="dot"></span>
          <span>Backend: {{ health?.status || 'Connecting...' }}</span>
        </div>
      </header>

      <!-- System Status Cards -->
      <section class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon docs-icon">
            <span class="material-icons">description</span>
          </div>
          <div class="stat-details">
            <span class="stat-value">{{ documents.length }}</span>
            <span class="stat-label">Uploaded Documents</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon chunks-icon">
            <span class="material-icons">storage</span>
          </div>
          <div class="stat-details">
            <span class="stat-value">{{ totalChunks }}</span>
            <span class="stat-label">Indexed Vector Chunks</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon ai-icon">
            <span class="material-icons">psychology</span>
          </div>
          <div class="stat-details">
            <span class="stat-value">{{ health?.gemini_configured ? 'Active' : 'Missing Key' }}</span>
            <span class="stat-label">Gemini LLM Engine</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon voice-icon">
            <span class="material-icons">mic</span>
          </div>
          <div class="stat-details">
            <span class="stat-value">Whisper + gTTS</span>
            <span class="stat-label">Speech Engine</span>
          </div>
        </div>
      </section>

      <!-- Quick Action Cards -->
      <section class="actions-section">
        <h2>Quick Actions</h2>
        <div class="actions-grid">
          <a routerLink="/documents" class="action-card">
            <div class="action-icon"><span class="material-icons">cloud_upload</span></div>
            <h3>Upload PDF Document</h3>
            <p>Upload new research papers, reports, or guides to expand your knowledge base.</p>
            <span class="action-arrow">Manage Documents &rarr;</span>
          </a>

          <a routerLink="/chat" class="action-card highlight-card">
            <div class="action-icon"><span class="material-icons">chat</span></div>
            <h3>Ask AI Assistant</h3>
            <p>Ask questions with citations and page references or get clarification on complex topics.</p>
            <span class="action-arrow">Start Chatting &rarr;</span>
          </a>

          <a routerLink="/summary" class="action-card">
            <div class="action-icon"><span class="material-icons">summarize</span></div>
            <h3>Document Summarizer</h3>
            <p>Generate short, detailed, or key-point summaries of your indexed documents.</p>
            <span class="action-arrow">Summarize &rarr;</span>
          </a>

          <a routerLink="/voice" class="action-card">
            <div class="action-icon"><span class="material-icons">record_voice_over</span></div>
            <h3>Voice Assistant</h3>
            <p>Ask queries via speech and listen to audio responses synthesized with gTTS.</p>
            <span class="action-arrow">Open Voice Assistant &rarr;</span>
          </a>
        </div>
      </section>

      <!-- Recent Documents Section -->
      <section class="recent-docs-section">
        <div class="section-header">
          <h2>Recent Documents</h2>
          <a routerLink="/documents" class="view-all-link">View all &rarr;</a>
        </div>

        <div *ngIf="loadingDocs" class="loading-state">
          <p>Loading documents...</p>
        </div>

        <div *ngIf="!loadingDocs && documents.length === 0" class="empty-state">
          <span class="material-icons empty-icon">folder_open</span>
          <p>No documents uploaded yet.</p>
          <a routerLink="/documents" class="btn-primary">Upload your first PDF</a>
        </div>

        <div *ngIf="!loadingDocs && documents.length > 0" class="docs-table-wrapper">
          <table class="docs-table">
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Pages</th>
                <th>Chunks</th>
                <th>Size</th>
                <th>Date Added</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let doc of documents.slice(0, 5)">
                <td class="doc-name">
                  <span class="material-icons table-doc-icon">picture_as_pdf</span>
                  {{ doc.filename }}
                </td>
                <td>{{ doc.page_count }}</td>
                <td>{{ doc.chunk_count }}</td>
                <td>{{ formatSize(doc.file_size) }}</td>
                <td>{{ doc.upload_date | date:'shortDate' }}</td>
                <td>
                  <span class="status-pill status-ready">{{ doc.status }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .dashboard-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }

    .welcome-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .welcome-text h1 {
      font-size: 2rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.5rem;
    }

    .brand-highlight {
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      color: #64748b;
      font-size: 1rem;
      max-width: 600px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 500;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
    }

    .status-badge.online {
      background: #ecfdf5;
      color: #065f46;
      border-color: #a7f3d0;
    }

    .status-badge.offline {
      background: #fef2f2;
      color: #991b1b;
      border-color: #fecaca;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: currentColor;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2.5rem;
    }

    .stat-card {
      background: #ffffff;
      padding: 1.25rem;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 1rem;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }

    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .docs-icon { background: #eff6ff; color: #2563eb; }
    .chunks-icon { background: #f5f3ff; color: #7c3aed; }
    .ai-icon { background: #ecfdf5; color: #059669; }
    .voice-icon { background: #fff7ed; color: #ea580c; }

    .stat-details {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #0f172a;
    }

    .stat-label {
      font-size: 0.8125rem;
      color: #64748b;
    }

    .actions-section {
      margin-bottom: 2.5rem;
    }

    .actions-section h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: #1e293b;
    }

    .actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.25rem;
    }

    .action-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      text-decoration: none;
      color: inherit;
      transition: all 0.2s ease;
    }

    .action-card:hover {
      border-color: #3b82f6;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.08);
      transform: translateY(-2px);
    }

    .highlight-card {
      background: linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%);
      border-color: #bfdbfe;
    }

    .action-icon {
      width: 42px;
      height: 42px;
      border-radius: 8px;
      background: #f1f5f9;
      color: #2563eb;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1rem;
    }

    .action-card h3 {
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #0f172a;
    }

    .action-card p {
      font-size: 0.875rem;
      color: #64748b;
      line-height: 1.5;
      margin-bottom: 1.25rem;
      flex-grow: 1;
    }

    .action-arrow {
      font-size: 0.875rem;
      font-weight: 600;
      color: #2563eb;
    }

    .recent-docs-section {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.5rem;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
    }

    .section-header h2 {
      font-size: 1.125rem;
      font-weight: 600;
      color: #1e293b;
    }

    .view-all-link {
      font-size: 0.875rem;
      font-weight: 500;
      color: #2563eb;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: #64748b;
    }

    .empty-icon {
      font-size: 3rem;
      color: #cbd5e1;
      margin-bottom: 0.75rem;
    }

    .btn-primary {
      display: inline-block;
      margin-top: 1rem;
      background: #2563eb;
      color: #ffffff;
      padding: 0.625rem 1.25rem;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.875rem;
    }

    .docs-table-wrapper {
      overflow-x: auto;
    }

    .docs-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.875rem;
    }

    .docs-table th {
      padding: 0.75rem 1rem;
      color: #64748b;
      font-weight: 500;
      border-bottom: 1px solid #e2e8f0;
    }

    .docs-table td {
      padding: 1rem;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
    }

    .doc-name {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 500;
      color: #0f172a;
    }

    .table-doc-icon {
      color: #ef4444;
      font-size: 1.25rem;
    }

    .status-pill {
      display: inline-block;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: capitalize;
    }

    .status-ready {
      background: #ecfdf5;
      color: #065f46;
    }
  `]
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  health: HealthStatus | null = null;
  documents: DocumentItem[] = [];
  loadingDocs = true;

  get totalChunks(): number {
    return this.documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0);
  }

  ngOnInit() {
    this.fetchHealth();
    this.fetchDocuments();
  }

  fetchHealth() {
    this.api.getHealth().subscribe({
      next: (h) => this.health = h,
      error: () => this.health = null
    });
  }

  fetchDocuments() {
    this.loadingDocs = true;
    this.api.getDocuments().subscribe({
      next: (res) => {
        this.documents = res.documents || [];
        this.loadingDocs = false;
      },
      error: () => {
        this.documents = [];
        this.loadingDocs = false;
      }
    });
  }

  formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

