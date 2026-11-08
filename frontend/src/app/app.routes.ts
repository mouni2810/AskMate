import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { DocumentsComponent } from './components/documents/documents.component';
import { ChatComponent } from './components/chat/chat.component';
import { SummaryComponent } from './components/summary/summary.component';
import { VoiceComponent } from './components/voice/voice.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'documents', component: DocumentsComponent },
  { path: 'chat', component: ChatComponent },
  { path: 'summary', component: SummaryComponent },
  { path: 'voice', component: VoiceComponent },
  { path: '**', redirectTo: 'dashboard' }
];
