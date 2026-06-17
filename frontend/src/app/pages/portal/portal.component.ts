import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { ChatbotComponent } from '../../shared/chatbot/chatbot.component';
import { ApplicationService } from '../../core/services/application.service';
import { AuthService } from '../../core/services/auth.service';
import { LoanApplication } from '../../core/models';

@Component({
  selector: 'app-portal',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, ChatbotComponent],
  templateUrl: './portal.component.html',
  styleUrl: './portal.component.scss'
})
export class PortalComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  sidebarCollapsed = signal(false);

  constructor(private appSvc: ApplicationService, public auth: AuthService) {}

  ngOnInit(): void {
    const userId = this.auth.userId;
    const email  = this.auth.userEmail;
    if (userId && email) {
      this.appSvc.startOrResume(userId, email).subscribe({
        next: app => this.application.set(app),
        error: () => {}
      });
    }
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.set(!this.sidebarCollapsed());
  }
}
