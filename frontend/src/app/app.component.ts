import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from './services/api.service';
import { HealthStatus } from './models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'AskMate';
  private api = inject(ApiService);
  health: HealthStatus | null = null;
  checking = true;

  ngOnInit() {
    this.checkHealth();
  }

  checkHealth() {
    this.checking = true;
    this.api.getHealth().subscribe({
      next: (res) => {
        this.health = res;
        this.checking = false;
      },
      error: () => {
        this.health = null;
        this.checking = false;
      }
    });
  }
}
