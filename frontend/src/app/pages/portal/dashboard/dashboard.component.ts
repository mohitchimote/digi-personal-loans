import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ApplicationService } from '../../../core/services/application.service';
import { ProductService } from '../../../core/services/product.service';
import { LoanApplication, PreApprovedOffer, UnderwritingNote } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  applications = signal<LoanApplication[]>([]);
  feedbackByAppRef = signal<Record<string, UnderwritingNote[]>>({});
  startingApplication = signal(false);
  preApprovedOffer = signal<PreApprovedOffer | null>(null);
  startingPreApproved = signal(false);

  constructor(public auth: AuthService, private appSvc: ApplicationService, private productSvc: ProductService,
              public i18n: I18nService, private router: Router) {}

  startOrResumeApplication(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.startingApplication.set(true);
    this.appSvc.startOrResume(userId, email).subscribe({
      next: app => { this.startingApplication.set(false); this.router.navigate([this.getResumeRoute(app)]); },
      error: () => this.startingApplication.set(false)
    });
  }

  applyForPreApprovedOffer(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail; const nationalId = this.auth.userNationalId;
    if (!userId || !email || !nationalId) return;
    this.startingPreApproved.set(true);
    this.appSvc.startPreApproved(userId, email, nationalId).subscribe({
      next: app => { this.startingPreApproved.set(false); this.preApprovedOffer.set(null); this.router.navigate([this.getResumeRoute(app)]); },
      error: () => this.startingPreApproved.set(false)
    });
  }

  ngOnInit(): void {
    const userId = this.auth.userId;
    if (userId) {
      this.appSvc.getMyApplications(userId).subscribe({
        next: apps => {
          this.applications.set(apps);
          apps.filter(a => a.status === 'IN_PROGRESS').forEach(a => this.loadFeedback(a.applicationRef));
        },
        error: () => {}
      });
    }
    const nationalId = this.auth.userNationalId;
    if (nationalId) {
      this.productSvc.getPreApprovedOffer(nationalId).subscribe(offer => this.preApprovedOffer.set(offer));
    }
  }

  private loadFeedback(appRef: string): void {
    this.appSvc.getNotes(appRef).subscribe({
      next: notes => {
        const relevant = notes.filter(n => n.noteType === 'SEND_BACK' || n.noteType === 'CLARIFICATION_REQUEST' || n.noteType === 'DOCUMENT_REQUEST');
        if (relevant.length > 0) {
          this.feedbackByAppRef.update(map => ({ ...map, [appRef]: relevant }));
        }
      },
      error: () => {}
    });
  }

  feedbackFor(app: LoanApplication): UnderwritingNote[] {
    return this.feedbackByAppRef()[app.applicationRef] || [];
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

  private readonly cancellableStatuses = ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'CONDITIONALLY_APPROVED', 'REFERRED_TO_SENIOR'];

  canCancel(app: LoanApplication): boolean {
    return this.cancellableStatuses.includes(app.status);
  }

  cancelling = signal<string | null>(null);

  cancelApplication(app: LoanApplication): void {
    const confirmMsg = this.i18n.t('dashboard.confirmCancel');
    if (!window.confirm(confirmMsg)) return;
    this.cancelling.set(app.applicationRef);
    this.appSvc.cancel(app.applicationRef).subscribe({
      next: updated => {
        this.applications.update(list => list.map(a => a.applicationRef === updated.applicationRef ? updated : a));
        this.cancelling.set(null);
      },
      error: () => this.cancelling.set(null)
    });
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

  getResumeRoute(app: LoanApplication): string {
    return this.appSvc.getResumeRoute(app);
  }
}
