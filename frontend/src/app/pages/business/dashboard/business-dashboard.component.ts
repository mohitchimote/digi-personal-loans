import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ApplicationService } from '../../../core/services/application.service';
import { LoanApplication } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-business-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './business-dashboard.component.html',
  styleUrl: './business-dashboard.component.scss'
})
export class BusinessDashboardComponent implements OnInit {
  applications = signal<LoanApplication[]>([]);
  startingApplication = signal(false);

  constructor(public auth: AuthService, private appSvc: ApplicationService, public i18n: I18nService, private router: Router) {}

  ngOnInit(): void {
    const userId = this.auth.userId;
    if (!userId) return;
    this.appSvc.getMyApplications(userId).subscribe({
      next: apps => this.applications.set(apps),
      error: () => {}
    });
  }

  startOrResumeApplication(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.startingApplication.set(true);
    this.appSvc.startOrResumeBusiness(userId, email).subscribe({
      next: app => { this.startingApplication.set(false); this.router.navigate([this.getResumeRoute(app)]); },
      error: () => this.startingApplication.set(false)
    });
  }

  getResumeRoute(app: LoanApplication): string {
    return this.appSvc.getResumeRoute(app);
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      DRAFT: 'db-badge--draft', IN_PROGRESS: 'db-badge--in-progress',
      SUBMITTED: 'db-badge--in-progress', UNDER_REVIEW: 'db-badge--review',
      CONDITIONALLY_APPROVED: 'db-badge--review', REFERRED_TO_SENIOR: 'db-badge--review',
      APPROVED: 'db-badge--approved', DECLINED: 'db-badge--declined', WITHDRAWN: 'db-badge--declined',
    };
    return map[status] || 'db-badge--draft';
  }

  statusLabel(status: string): string {
    return this.i18n.t('status.' + status);
  }

  get activeCount(): number {
    const activeStatuses = ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'CONDITIONALLY_APPROVED'];
    return this.applications().filter(a => activeStatuses.includes(a.status)).length;
  }

  get approvedCount(): number {
    return this.applications().filter(a => a.status === 'APPROVED').length;
  }
}
