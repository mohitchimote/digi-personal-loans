import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { LoanApplication } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { applicantDisplayName } from '../../../core/utils/application-display';

// Broader than the underwriter's day-to-day working set (which excludes closed-out outcomes) —
// this page also needs to show Declined cases when filtered/deep-linked to from the Home
// dashboard's tiles, so it fetches the same home-stats scope rather than /pipeline.
const PIPELINE_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'CONDITIONALLY_APPROVED', 'REFERRED_TO_SENIOR', 'APPROVED', 'DECLINED'];

@Component({
  selector: 'app-uw-pipeline',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './pipeline.component.html',
  styleUrl: './pipeline.component.scss'
})
export class PipelineComponent implements OnInit {
  applications = signal<LoanApplication[]>([]);
  loading = signal(true);
  activeFilter = signal<string>('ALL');
  sortDir = signal<'asc' | 'desc'>('desc');

  searchText = signal('');
  startDate = signal('');
  endDate = signal('');

  statuses = PIPELINE_STATUSES;

  filteredApplications = computed(() => {
    const filter = this.activeFilter();
    let result: LoanApplication[];
    if (filter === 'ALL') result = this.applications();
    else if (filter === 'APPROVED') {
      result = this.applications().filter(a => a.status === 'APPROVED' && !a.disbursementStatus);
    } else if (filter === 'PENDING_DISBURSEMENT') {
      result = this.applications().filter(a => a.status === 'APPROVED' && a.disbursementStatus === 'SECOND_CHECK_PENDING');
    } else if (filter === 'DISBURSED') {
      result = this.applications().filter(a => a.disbursementStatus === 'FUNDS_RELEASED');
    } else {
      result = this.applications().filter(a => a.status === filter);
    }

    const q = this.searchText().trim().toLowerCase();
    if (q) {
      result = result.filter(a =>
        a.applicationRef.toLowerCase().includes(q) ||
        a.customerEmail?.toLowerCase().includes(q) ||
        this.applicantName(a).toLowerCase().includes(q)
      );
    }

    const start = this.startDate() ? new Date(this.startDate()).getTime() : null;
    const end = this.endDate() ? new Date(this.endDate()).getTime() + 86_400_000 : null;
    if (start !== null || end !== null) {
      result = result.filter(a => {
        const t = new Date(a.submittedAt || a.createdAt).getTime();
        return (start === null || t >= start) && (end === null || t < end);
      });
    }

    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...result].sort((a, b) => {
      const dateA = new Date(a.submittedAt || a.createdAt).getTime();
      const dateB = new Date(b.submittedAt || b.createdAt).getTime();
      return (dateA - dateB) * dir;
    });
  });

  toggleSort(): void {
    this.sortDir.update(d => (d === 'asc' ? 'desc' : 'asc'));
  }

  resetFilters(): void {
    this.activeFilter.set('ALL');
    this.searchText.set('');
    this.startDate.set('');
    this.endDate.set('');
  }

  constructor(private appSvc: ApplicationService, public i18n: I18nService, private route: ActivatedRoute) {}

  statusLabel(status: string): string {
    return this.i18n.t('status.' + status);
  }

  ngOnInit(): void {
    const initialStatus = this.route.snapshot.queryParamMap.get('status');
    if (initialStatus) this.activeFilter.set(initialStatus);

    this.appSvc.getHomeStats().subscribe({
      next: apps => { this.applications.set(apps); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  setFilter(status: string): void {
    this.activeFilter.set(status);
  }

  effectiveStatusLabel(app: LoanApplication): string {
    if (app.status === 'APPROVED' && app.disbursementStatus === 'FUNDS_RELEASED') return this.i18n.t('uw.disbursed');
    if (app.status === 'APPROVED' && app.disbursementStatus === 'SECOND_CHECK_PENDING') return this.i18n.t('uw.pendingDisbursement');
    return this.statusLabel(app.status);
  }

  isBusiness(app: LoanApplication): boolean {
    return app.applicationType === 'BUSINESS';
  }

  private loanRequirementsSource(app: LoanApplication): any {
    try { return JSON.parse((this.isBusiness(app) ? app.companyDetailsJson : app.loanRequirementsJson) || '{}'); }
    catch { return {}; }
  }

  loanAmount(app: LoanApplication): number {
    return this.loanRequirementsSource(app).loanAmount || 0;
  }

  loanPurpose(app: LoanApplication): string {
    return this.loanRequirementsSource(app).loanPurpose || '';
  }

  loanTerm(app: LoanApplication): number {
    return this.loanRequirementsSource(app).loanTerm || 0;
  }

  applicantName(app: LoanApplication): string {
    return applicantDisplayName(app);
  }
}
