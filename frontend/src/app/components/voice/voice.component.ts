import { Component, OnInit, OnDestroy, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { ChatResponse, SourceReference, TranscribeResponse } from '../../models';

@Component({
  selector: 'app-voice',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="voice-container">
      <!-- Page Header -->
      <div class="page-header">
        <div class="header-icon-wrap">
          <span class="material-icons">record_voice_over</span>
        </div>
        <div>
          <h1>Voice Assistant</h1>
          <p>Interact with AskMate using speech-to-text (Whisper) and text-to-speech (gTTS).</p>
        </div>
      </div>

      <div class="voice-layout">
        <!-- Input Panel: Record or Upload -->
        <div class="card input-card">
          <!-- Mode Tabs -->
          <div class="mode-tabs">
            <button 
              class="tab-btn" 
              [class.active]="activeTab === 'record'"
              (click)="activeTab = 'record'"
            >
              <span class="material-icons">mic</span>
              Record Speech
            </button>
            <button 
              class="tab-btn" 
              [class.active]="activeTab === 'upload'"
              (click)="activeTab = 'upload'"
            >
              <span class="material-icons">upload_file</span>
              Upload Audio File
            </button>
          </div>

          <!-- Tab 1: Live Microphone Recording -->
          <div *ngIf="activeTab === 'record'" class="tab-content record-section">
            <div class="mic-stage">
              <button 
                class="mic-circle"
                [class.recording]="isRecording"
                [class.processing]="isTranscribing || isAnswering"
                (click)="toggleRecording()"
                [disabled]="isTranscribing || isAnswering"
                title="{{ isRecording ? 'Click to stop recording' : 'Click to start speaking' }}"
              >
                <span class="material-icons mic-icon">
                  {{ isRecording ? 'stop' : (isTranscribing || isAnswering ? 'sync' : 'mic') }}
                </span>
                <span *ngIf="isRecording" class="pulse-ring"></span>
              </button>

              <div class="mic-status">
                <div *ngIf="!isRecording && !recordedBlob && !isTranscribing && !isAnswering" class="status-hint">
                  Click the microphone to start speaking
                </div>
                <div *ngIf="isRecording" class="status-recording">
                  <span class="rec-dot"></span>
                  Listening... {{ recordingTimeFormatted }}
                </div>
                <div *ngIf="isTranscribing" class="status-processing">
                  <span class="material-icons spinning">autorenew</span>
                  Transcribing speech with Whisper...
                </div>
                <div *ngIf="isAnswering" class="status-processing">
                  <span class="material-icons spinning">psychology</span>
                  Generating response & synthesizing audio...
                </div>
              </div>
            </div>

            <!-- Recorded Preview & Submit -->
            <div *ngIf="recordedBlob && !isRecording && !isTranscribing && !isAnswering" class="recorded-preview">
              <div class="preview-info">
                <span class="material-icons">graphic_eq</span>
                <span>Audio recorded ({{ recordingDurationSeconds }}s)</span>
              </div>
              <div class="preview-actions">
                <button class="btn-secondary" (click)="resetRecording()">
                  <span class="material-icons">refresh</span>
                  Re-record
                </button>
                <button class="btn-primary" (click)="processAudioBlob(recordedBlob)">
                  <span class="material-icons">send</span>
                  Ask AskMate
                </button>
              </div>
            </div>
          </div>

          <!-- Tab 2: Audio File Upload -->
          <div *ngIf="activeTab === 'upload'" class="tab-content upload-section">
            <div 
              class="dropzone"
              [class.has-file]="selectedAudioFile"
              (click)="fileInput.click()"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onFileDrop($event)"
            >
              <input 
                #fileInput 
                type="file" 
                accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg" 
                (change)="onFileSelected($event)" 
                style="display: none"
              />
              <span class="material-icons drop-icon">
                {{ selectedAudioFile ? 'audio_file' : 'cloud_upload' }}
              </span>
              <h4 *ngIf="!selectedAudioFile">Drop audio file here or click to browse</h4>
              <p *ngIf="!selectedAudioFile" class="drop-hint">Supports WAV, MP3, M4A, WebM, OGG up to 25MB</p>

              <div *ngIf="selectedAudioFile" class="selected-file-details">
                <span class="file-name">{{ selectedAudioFile.name }}</span>
                <span class="file-size">{{ (selectedAudioFile.size / 1024).toFixed(1) }} KB</span>
              </div>
            </div>

            <div *ngIf="selectedAudioFile" class="upload-actions">
              <button class="btn-secondary" (click)="selectedAudioFile = null">
                Clear
              </button>
              <button 
                class="btn-primary" 
                (click)="processAudioFile(selectedAudioFile)"
                [disabled]="isTranscribing || isAnswering"
              >
                <span class="material-icons">send</span>
                Transcribe & Ask
              </button>
            </div>
          </div>

          <!-- Error Alert -->
          <div *ngIf="errorMessage" class="error-banner">
            <span class="material-icons">error_outline</span>
            <span>{{ errorMessage }}</span>
          </div>
        </div>

        <!-- Output Panel: Transcription, AI Response & Audio Playback -->
        <div class="card output-card">
          <!-- Placeholder when empty -->
          <div *ngIf="!transcription && !isTranscribing && !isAnswering" class="empty-placeholder">
            <div class="placeholder-icon">
              <span class="material-icons">graphic_eq</span>
            </div>
            <h3>Voice Output</h3>
            <p>Your speech will be transcribed using Whisper, routed through the AskMate AI Agent, and read aloud with gTTS speech synthesis.</p>
          </div>

          <!-- Transcription Card -->
          <div *ngIf="transcription" class="result-block transcription-block">
            <div class="block-header">
              <div class="block-title">
                <span class="material-icons icon-user">record_voice_over</span>
                <span>You Asked (Transcribed via Whisper)</span>
              </div>
              <span class="meta-pill" *ngIf="detectedLanguage">
                {{ detectedLanguage.toUpperCase() }}
              </span>
            </div>
            <div class="transcription-text">
              "{{ transcription }}"
            </div>
          </div>

          <!-- AI Response Card -->
          <div *ngIf="aiResponse" class="result-block response-block">
            <div class="block-header">
              <div class="block-title">
                <span class="material-icons icon-bot">smart_toy</span>
                <span>AskMate AI Response</span>
              </div>
              <div class="header-badges">
                <span *ngIf="aiResponse.tool_used" class="tool-pill" [class]="aiResponse.tool_used">
                  {{ aiResponse.tool_used }}
                </span>
                <span *ngIf="aiResponse.clarification_needed" class="clarify-pill">
                  Clarification Required
                </span>
              </div>
            </div>

            <div class="response-text">
              {{ aiResponse.response }}
            </div>

            <!-- Source Citations if present -->
            <div *ngIf="aiResponse.sources && aiResponse.sources.length > 0" class="voice-sources">
              <div class="sources-label">
                <span class="material-icons">menu_book</span>
                <span>Sources ({{ aiResponse.sources.length }}):</span>
              </div>
              <div class="sources-tags">
                <span *ngFor="let s of aiResponse.sources" class="source-tag">
                  {{ s.filename }} (Page {{ s.page }})
                </span>
              </div>
            </div>

            <!-- Audio Player Bar (Feature 5) -->
            <div class="audio-player-wrap">
              <div class="player-label">
                <span class="material-icons">volume_up</span>
                <span>Spoken Audio Response (gTTS)</span>
              </div>

              <div class="audio-controls">
                <audio #audioPlayer controls [src]="audioUrl" class="custom-audio" *ngIf="audioUrl"></audio>
                <button class="btn-replay" (click)="playAudio()" [disabled]="!audioUrl">
                  <span class="material-icons">play_arrow</span>
                  Play Response
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .voice-container {
      max-width: 1100px;
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
      background: linear-gradient(135deg, #ea580c, #c2410c);
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

    .voice-layout {
      display: grid;
      grid-template-columns: 440px 1fr;
      gap: 1.5rem;
      align-items: start;
    }

    @media (max-width: 900px) {
      .voice-layout {
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

    .mode-tabs {
      display: flex;
      gap: 0.5rem;
      background: #f1f5f9;
      padding: 0.25rem;
      border-radius: 10px;
      margin-bottom: 1.5rem;
    }

    .tab-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      padding: 0.625rem;
      border: none;
      background: transparent;
      border-radius: 8px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .tab-btn.active {
      background: #ffffff;
      color: #0f172a;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
    }

    .tab-btn .material-icons {
      font-size: 1rem;
    }

    .mic-stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2.5rem 1rem;
    }

    .mic-circle {
      position: relative;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #ffffff;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 14px rgb(37 99 235 / 0.35);
    }

    .mic-circle:hover:not(:disabled) {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgb(37 99 235 / 0.45);
    }

    .mic-circle.recording {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      box-shadow: 0 4px 14px rgb(239 68 68 / 0.4);
    }

    .pulse-ring {
      position: absolute;
      top: -10px;
      left: -10px;
      right: -10px;
      bottom: -10px;
      border-radius: 50%;
      border: 3px solid #ef4444;
      animation: pulse-ring 1.5s infinite;
    }

    @keyframes pulse-ring {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.2); opacity: 0.2; }
      100% { transform: scale(1.3); opacity: 0; }
    }

    .mic-icon {
      font-size: 2.5rem;
    }

    .spinning {
      animation: spin 1.2s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .mic-status {
      margin-top: 1.5rem;
      text-align: center;
      min-height: 24px;
    }

    .status-hint {
      font-size: 0.875rem;
      color: #64748b;
    }

    .status-recording {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9375rem;
      font-weight: 600;
      color: #dc2626;
    }

    .rec-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #dc2626;
      animation: blink 1s infinite;
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.2; }
    }

    .status-processing {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: #2563eb;
    }

    .status-processing .material-icons {
      font-size: 1.125rem;
    }

    .recorded-preview {
      margin-top: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .preview-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #334155;
    }

    .preview-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-primary {
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 0.5rem 1rem;
      font-size: 0.8125rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 0.5rem 0.875rem;
      font-size: 0.8125rem;
      font-weight: 500;
      color: #475569;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      cursor: pointer;
    }

    .btn-secondary:hover {
      background: #f1f5f9;
    }

    .dropzone {
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 3rem 1.5rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s ease;
      background: #f8fafc;
    }

    .dropzone:hover {
      border-color: #2563eb;
      background: #eff6ff;
    }

    .dropzone.has-file {
      border-color: #10b981;
      background: #ecfdf5;
    }

    .drop-icon {
      font-size: 2.5rem;
      color: #94a3b8;
      margin-bottom: 0.75rem;
    }

    .dropzone h4 {
      font-size: 0.9375rem;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 0.35rem;
    }

    .drop-hint {
      font-size: 0.75rem;
      color: #64748b;
    }

    .selected-file-details {
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .file-name {
      font-weight: 600;
      color: #065f46;
      font-size: 0.875rem;
    }

    .file-size {
      font-size: 0.75rem;
      color: #047857;
    }

    .upload-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1rem;
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

    /* Output Card */
    .output-card {
      min-height: 480px;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .empty-placeholder {
      margin: auto;
      text-align: center;
      max-width: 380px;
      padding: 3rem 1rem;
    }

    .placeholder-icon {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      background: #fff7ed;
      color: #ea580c;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1rem;
    }

    .empty-placeholder h3 {
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.5rem;
    }

    .empty-placeholder p {
      font-size: 0.875rem;
      color: #64748b;
      line-height: 1.5;
    }

    .result-block {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.25rem;
    }

    .transcription-block {
      border-left: 4px solid #ea580c;
    }

    .response-block {
      border-left: 4px solid #2563eb;
    }

    .block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .block-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #1e293b;
    }

    .icon-user { color: #ea580c; font-size: 1.125rem; }
    .icon-bot { color: #2563eb; font-size: 1.125rem; }

    .meta-pill {
      background: #ffedd5;
      color: #9a3412;
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
    }

    .header-badges {
      display: flex;
      gap: 0.35rem;
    }

    .tool-pill {
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      border: 1px solid #bfdbfe;
    }

    .clarify-pill {
      background: #fef3c7;
      color: #92400e;
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      border: 1px solid #fde68a;
    }

    .transcription-text {
      font-size: 0.9375rem;
      color: #0f172a;
      font-style: italic;
      line-height: 1.5;
    }

    .response-text {
      font-size: 0.9375rem;
      color: #1e293b;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .voice-sources {
      margin-top: 1rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e2e8f0;
    }

    .sources-label {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #475569;
      margin-bottom: 0.35rem;
    }

    .sources-label .material-icons {
      font-size: 0.875rem;
      color: #2563eb;
    }

    .sources-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .source-tag {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-size: 0.6875rem;
      color: #334155;
    }

    .audio-player-wrap {
      margin-top: 1.25rem;
      padding: 1rem;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
    }

    .player-label {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 0.75rem;
    }

    .player-label .material-icons {
      color: #ea580c;
      font-size: 1rem;
    }

    .audio-controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .custom-audio {
      flex: 1;
      height: 38px;
    }

    .btn-replay {
      background: #ea580c;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 0.5rem 0.875rem;
      font-size: 0.8125rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      cursor: pointer;
    }

    .btn-replay:hover:not(:disabled) {
      background: #c2410c;
    }
  `]
})
export class VoiceComponent implements OnInit, OnDestroy {
  @ViewChild('audioPlayer') audioPlayerRef?: ElementRef<HTMLAudioElement>;

  private api = inject(ApiService);

  activeTab: 'record' | 'upload' = 'record';
  isRecording = false;
  isTranscribing = false;
  isAnswering = false;

  recordingTimer: any;
  recordingSeconds = 0;
  recordingTimeFormatted = '00:00';
  recordingDurationSeconds = 0;

  mediaRecorder?: MediaRecorder;
  audioChunks: Blob[] = [];
  recordedBlob: Blob | null = null;
  selectedAudioFile: File | null = null;

  transcription = '';
  detectedLanguage = '';
  aiResponse: ChatResponse | null = null;
  audioUrl = '';
  errorMessage = '';

  ngOnInit() {}

  ngOnDestroy() {
    this.stopRecordingTimer();
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
    }
  }

  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  async startRecording() {
    this.errorMessage = '';
    this.recordedBlob = null;
    this.audioChunks = [];
    this.recordingSeconds = 0;
    this.recordingTimeFormatted = '00:00';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.recordedBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        this.recordingDurationSeconds = this.recordingSeconds;
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.startRecordingTimer();
    } catch (err: any) {
      this.errorMessage = 'Could not access microphone. Please allow microphone permissions in your browser.';
      this.isRecording = false;
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      this.stopRecordingTimer();
    }
  }

  startRecordingTimer() {
    this.recordingTimer = setInterval(() => {
      this.recordingSeconds++;
      const mins = Math.floor(this.recordingSeconds / 60).toString().padStart(2, '0');
      const secs = (this.recordingSeconds % 60).toString().padStart(2, '0');
      this.recordingTimeFormatted = `${mins}:${secs}`;
    }, 1000);
  }

  stopRecordingTimer() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  resetRecording() {
    this.recordedBlob = null;
    this.audioChunks = [];
    this.recordingSeconds = 0;
    this.recordingTimeFormatted = '00:00';
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.selectedAudioFile = event.dataTransfer.files[0];
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedAudioFile = input.files[0];
    }
  }

  processAudioBlob(blob: Blob) {
    this.executeVoicePipeline(blob);
  }

  processAudioFile(file: File) {
    this.executeVoicePipeline(file);
  }

  executeVoicePipeline(audio: Blob | File) {
    this.errorMessage = '';
    this.isTranscribing = true;
    this.transcription = '';
    this.aiResponse = null;
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = '';
    }

    // Step 1: Speech-to-Text via Whisper
    this.api.transcribeAudio(audio).subscribe({
      next: (transcribeRes: TranscribeResponse) => {
        this.transcription = transcribeRes.text;
        this.detectedLanguage = transcribeRes.language;
        this.isTranscribing = false;

        if (!this.transcription) {
          this.errorMessage = 'No speech could be recognized in the audio. Please try again.';
          return;
        }

        // Step 2: Route transcribed question through AskMate AI Agent
        this.isAnswering = true;
        this.api.sendChatMessage({
          message: this.transcription,
          use_agent: true
        }).subscribe({
          next: (chatRes: ChatResponse) => {
            this.aiResponse = chatRes;

            // Step 3: Text-to-Speech synthesis via gTTS
            this.api.synthesizeSpeech(chatRes.response, 'en').subscribe({
              next: (audioBlob: Blob) => {
                this.audioUrl = URL.createObjectURL(audioBlob);
                this.isAnswering = false;
                setTimeout(() => this.playAudio(), 300);
              },
              error: () => {
                // If TTS fails, still show the text response
                this.isAnswering = false;
              }
            });
          },
          error: (chatErr) => {
            this.errorMessage = chatErr.error?.detail || chatErr.message || 'Failed to generate AI response.';
            this.isAnswering = false;
          }
        });
      },
      error: (transcribeErr) => {
        this.errorMessage = transcribeErr.error?.detail || transcribeErr.message || 'Failed to transcribe audio.';
        this.isTranscribing = false;
      }
    });
  }

  playAudio() {
    if (this.audioPlayerRef?.nativeElement) {
      this.audioPlayerRef.nativeElement.play().catch(() => {});
    }
  }
}
