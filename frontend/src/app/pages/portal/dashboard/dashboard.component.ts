import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ApplicationService } from '../../../core/services/application.service';
import { LoanApplication } from '../../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  applications = signal<LoanApplication[]>([]);

  constructor(public auth: AuthService, private appSvc: ApplicationService) {}

  ngOnInit(): void {
    const userId = this.auth.userId;
    if (userId) {
      this.appSvc.getMyApplications(userId).subscribe({
        next: apps => this.applications.set(apps),
        error: () => {}
      });
    }
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      DRAFT: 'db-badge--draft', IN_PROGRESS: 'db-badge--in-progress',
      SUBMITTED: 'db-badge--in-progress', UNDER_REVIEW: 'db-badge--review',
      APPROVED: 'db-badge--approved', DECLINED: 'db-badge--declined',
    };
    return map[status] || 'db-badge--draft';
  }

  get activeCount(): number {
    return this.applications().filter(a => a.status === 'DRAFT' || a.status === 'IN_PROGRESS' || a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW').length;
  }

  get approvedCount(): number {
    return this.applications().filter(a => a.status === 'APPROVED').length;
  }

  getResumeRoute(app: LoanApplication): string {
    const sectionRoutes: Record<string, string> = {
      loanRequirements:   '/portal/apply/loan-requirements',
      personalDetails:    '/portal/apply/personal-details',
      incomeEmployment:   '/portal/apply/income-employment',
      outgoings:          '/portal/apply/outgoings',
      creditDeclarations: '/portal/apply/credit-declarations',
      reviewSubmit:       '/portal/apply/review-submit',
    };
    return sectionRoutes[app.currentSection] || '/portal/apply/loan-requirements';
  }
}
