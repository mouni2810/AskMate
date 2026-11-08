import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { DocumentItem } from '../../models';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <!-- Page Header -->
      <header class="page-header">
        <div>
          <h1>Document Management</h1>
          <p class="subtitle">Upload and index your PDF documents into ChromaDB for semantic retrieval and AI question answering.</p>
        </div>
      </header>

      <!-- Alert Banners -->
      <div *ngIf="errorMessage" class="alert-banner alert-error">
        <span class="material-icons">error_outline</span>
        <div class="alert-content">
          <strong>Upload Error:</strong> {{ errorMessage }}
        </div>
        <button class="alert-close" (click)="errorMessage = null">&times;</button>
      </div>

      <div *ngIf="successMessage" class="alert-banner alert-success">
        <span class="material-icons">check_circle</span>
        <div class="alert-content">
          {{ successMessage }}
        </div>
        <button class="alert-close" (click)="successMessage = null">&times;</button>
      </div>

      <!-- Upload Dropzone Card -->
      <div
        class="upload-card"
        [class.dragging]="isDragging"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onFileDrop($event)"
      >
        <div class="upload-dropzone">
          <div class="dropzone-icon-wrap" [class.pulse]="isUploading">
            <span class="material-icons dropzone-icon">
              {{ isUploading ? 'sync' : 'cloud_upload' }}
            </span>
          </div>

          <div *ngIf="!isUploading">
            <h3>Upload PDF Knowledge Source</h3>
            <p>Drag and drop PDF files here, or click to browse files from your computer</p>
            <div class="file-badges">
              <span class="meta-tag">Format: PDF</span>
              <span class="meta-tag">Max size: 25 MB</span>
              <span class="meta-tag">Vector Store: ChromaDB</span>
            </div>
            <input
              type="file"
              #fileInput
              (change)="onFileSelected($event)"
              accept=".pdf,application/pdf"
              style="display: none;"
            />
            <button class="btn-browse" (click)="fileInput.click()">
              <span class="material-icons">folder_open</span>
              <span>Browse PDF File</span>
            </button>
          </div>

          <!-- Uploading / Processing State -->
          <div *ngIf="isUploading" class="upload-progress-state">
            <h3>Processing & Indexing Document...</h3>
            <p class="upload-status-text">
              PyMuPDF text extraction &rarr; Recursive chunking &rarr; SentenceTransformers embeddings &rarr; ChromaDB vector store
            </p>
            <div class="progress-bar-wrap">
              <div class="progress-bar-indeterminate"></div>
            </div>
            <span class="uploading-filename">{{ uploadingFilename }}</span>
          </div>
        </div>
      </div>

      <!-- Uploaded Documents List Section -->
      <section class="documents-list-section">
        <div class="section-top">
          <div class="top-meta">
            <h2>Indexed Documents ({{ documents.length }})</h2>
            <span class="total-chunks-label" *ngIf="documents.length > 0">
              Total vector chunks: <strong>{{ totalChunks }}</strong>
            </span>
          </div>
          <button class="btn-refresh" (click)="fetchDocuments()" title="Refresh documents list">
            <span class="material-icons">refresh</span>
          </button>
        </div>

        <!-- Loading State -->
        <div *ngIf="loading" class="loading-state">
          <div class="spinner"></div>
          <p>Loading indexed documents from database...</p>
        </div>

        <!-- Empty State -->
        <div *ngIf="!loading && documents.length === 0" class="empty-state">
          <span class="material-icons empty-icon">folder_open</span>
          <h3>No documents indexed yet</h3>
          <p>Upload a PDF document above to start indexing for AskMate's AI.</p>
        </div>

        <!-- Documents Table -->
        <div *ngIf="!loading && documents.length > 0" class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Pages</th>
                <th>Chunks</th>
                <th>File Size</th>
                <th>Upload Date</th>
                <th>Status</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let doc of documents">
                <td class="name-cell">
                  <span class="material-icons pdf-icon">picture_as_pdf</span>
                  <span class="doc-title" [title]="doc.filename">{{ doc.filename }}</span>
                </td>
                <td>
                  <span class="badge-num">{{ doc.page_count }} {{ doc.page_count === 1 ? 'page' : 'pages' }}</span>
                </td>
                <td>
                  <span class="badge-chunks">{{ doc.chunk_count }} chunks</span>
                </td>
                <td>{{ formatSize(doc.file_size) }}</td>
                <td>{{ doc.upload_date | date:'mediumDate' }}</td>
                <td>
                  <span class="status-pill status-ready">
                    <span class="status-dot"></span>
                    {{ doc.status }}
                  </span>
                </td>
                <td class="text-right">
                  <button
                    class="btn-delete"
                    (click)="deleteDoc(doc)"
                    [disabled]="deletingId === doc.id"
                    title="Delete document and its ChromaDB vectors"
                  >
                    <span class="material-icons">{{ deletingId === doc.id ? 'hourglass_top' : 'delete_outline' }}</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .page-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }

    .page-header {
      margin-bottom: 2rem;
    }

    .page-header h1 {
      font-size: 1.875rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.35rem;
    }

    .subtitle {
      color: #64748b;
      font-size: 0.9375rem;
    }

    .alert-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.875rem 1.25rem;
      border-radius: 10px;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
      animation: fadeIn 0.2s ease;
    }

    .alert-error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
    }

    .alert-success {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #065f46;
    }

    .alert-content {
      flex: 1;
    }

    .alert-close {
      background: transparent;
      border: none;
      font-size: 1.25rem;
      color: inherit;
      cursor: pointer;
      line-height: 1;
    }

    .upload-card {
      background: #ffffff;
      border: 2px dashed #cbd5e1;
      border-radius: 16px;
      padding: 3rem 1.5rem;
      text-align: center;
      margin-bottom: 2.5rem;
      transition: all 0.2s ease;
    }

    .upload-card.dragging {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .dropzone-icon-wrap {
      width: 64px;
      height: 64px;
      border-radius: 16px;
      background: #eff6ff;
      color: #2563eb;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.25rem;
    }

    .dropzone-icon {
      font-size: 2.25rem;
    }

    .pulse {
      animation: spin 1.5s linear infinite;
    }

    @keyframes spin {
      100% { transform: rotate(360deg); }
    }

    .upload-dropzone h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.35rem;
    }

    .upload-dropzone p {
      color: #64748b;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    .file-badges {
      display: flex;
      justify-content: center;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }

    .meta-tag {
      background: #f1f5f9;
      color: #475569;
      padding: 0.25rem 0.625rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .btn-browse {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 0.65rem 1.5rem;
      border-radius: 10px;
      font-weight: 500;
      font-size: 0.875rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .btn-browse:hover {
      background: #1d4ed8;
    }

    .upload-progress-state {
      max-width: 500px;
      margin: 0 auto;
    }

    .upload-status-text {
      font-size: 0.8125rem;
      color: #64748b;
      margin-bottom: 1rem;
    }

    .progress-bar-wrap {
      height: 8px;
      background: #e2e8f0;
      border-radius: 9999px;
      overflow: hidden;
      margin-bottom: 0.75rem;
    }

    .progress-bar-indeterminate {
      height: 100%;
      width: 40%;
      background: linear-gradient(90deg, #2563eb, #7c3aed);
      border-radius: 9999px;
      animation: indeterminate 1.5s infinite ease-in-out;
    }

    @keyframes indeterminate {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }

    .uploading-filename {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #2563eb;
    }

    .documents-list-section {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
    }

    .section-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.25rem;
    }

    .top-meta h2 {
      font-size: 1.125rem;
      font-weight: 600;
      color: #0f172a;
    }

    .total-chunks-label {
      font-size: 0.8125rem;
      color: #64748b;
      margin-top: 2px;
      display: block;
    }

    .btn-refresh {
      background: transparent;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      cursor: pointer;
    }

    .btn-refresh:hover {
      background: #f8fafc;
      color: #0f172a;
    }

    .loading-state {
      text-align: center;
      padding: 3rem 1rem;
      color: #64748b;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e2e8f0;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 0.75rem;
    }

    .empty-state {
      text-align: center;
      padding: 3.5rem 1rem;
      color: #64748b;
    }

    .empty-icon {
      font-size: 3.5rem;
      color: #cbd5e1;
      margin-bottom: 0.5rem;
    }

    .empty-state h3 {
      font-size: 1.125rem;
      color: #1e293b;
      margin-bottom: 0.25rem;
    }

    .table-container {
      overflow-x: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.875rem;
    }

    .data-table th {
      padding: 0.75rem 1rem;
      color: #64748b;
      font-weight: 500;
      border-bottom: 1px solid #e2e8f0;
    }

    .data-table td {
      padding: 1rem;
      border-bottom: 1px solid #f1f5f9;
      color: #334155;
    }

    .name-cell {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      font-weight: 500;
      color: #0f172a;
      max-width: 300px;
    }

    .pdf-icon {
      color: #ef4444;
      font-size: 1.35rem;
      flex-shrink: 0;
    }

    .doc-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .badge-num {
      background: #f1f5f9;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      font-size: 0.75rem;
      color: #475569;
    }

    .badge-chunks {
      background: #f5f3ff;
      color: #6d28d9;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: capitalize;
    }

    .status-ready {
      background: #ecfdf5;
      color: #065f46;
    }

    .status-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: currentColor;
    }

    .text-right {
      text-align: right;
    }

    .btn-delete {
      background: transparent;
      border: none;
      color: #ef4444;
      cursor: pointer;
      padding: 0.35rem;
      border-radius: 6px;
      transition: background 0.15s ease;
    }

    .btn-delete:hover:not(:disabled) {
      background: #fee2e2;
    }

    .btn-delete:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class DocumentsComponent implements OnInit {
  private api = inject(ApiService);

  documents: DocumentItem[] = [];
  loading = true;
  isUploading = false;
  uploadingFilename = '';
  isDragging = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  deletingId: string | null = null;

  get totalChunks(): number {
    return this.documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0);
  }

  ngOnInit() {
    this.fetchDocuments();
  }

  fetchDocuments() {
    this.loading = true;
    this.api.getDocuments().subscribe({
      next: (res) => {
        this.documents = res.documents || [];
        this.loading = false;
      },
      error: (err) => {
        this.errorMessage = 'Failed to load documents from backend.';
        this.loading = false;
      }
    });
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
      input.value = ''; // Reset input so same file can be re-selected if needed
    }
  }

  handleFile(file: File) {
    this.errorMessage = null;
    this.successMessage = null;

    // Client-side validations
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.errorMessage = 'Only PDF documents (.pdf) can be uploaded.';
      return;
    }

    const maxBytes = 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      this.errorMessage = `File exceeds the 25MB limit (${(file.size / (1024*1024)).toFixed(1)}MB).`;
      return;
    }

    this.isUploading = true;
    this.uploadingFilename = file.name;

    this.api.uploadDocument(file).subscribe({
      next: (doc) => {
        this.isUploading = false;
        this.uploadingFilename = '';
        this.successMessage = `Document "${doc.filename}" successfully uploaded and indexed into ChromaDB (${doc.page_count} pages, ${doc.chunk_count} vector chunks).`;
        this.fetchDocuments();
      },
      error: (err) => {
        this.isUploading = false;
        this.uploadingFilename = '';
        const detail = err.error?.detail || err.message || 'Failed to upload document.';
        this.errorMessage = detail;
      }
    });
  }

  deleteDoc(doc: DocumentItem) {
    if (!confirm(`Are you sure you want to delete "${doc.filename}"?\nThis will remove the file and all its associated vector records from ChromaDB.`)) {
      return;
    }

    this.deletingId = doc.id;
    this.errorMessage = null;
    this.api.deleteDocument(doc.id).subscribe({
      next: () => {
        this.deletingId = null;
        this.successMessage = `Document "${doc.filename}" and its vector chunks deleted.`;
        this.fetchDocuments();
      },
      error: (err) => {
        this.deletingId = null;
        this.errorMessage = `Failed to delete document: ${err.message || 'Unknown error'}`;
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
