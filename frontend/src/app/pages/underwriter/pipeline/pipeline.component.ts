import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { LoanApplication } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

const PIPELINE_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'CONDITIONALLY_APPROVED', 'REFERRED_TO_SENIOR', 'APPROVED'];

@Component({
  selector: 'app-uw-pipeline',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './pipeline.component.html',
  styleUrl: './pipeline.component.scss'
})
export class PipelineComponent implements OnInit {
  applications = signal<LoanApplication[]>([]);
  loading = signal(true);
  activeFilter = signal<string>('ALL');
  sortDir = signal<'asc' | 'desc'>('desc');

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

  constructor(private appSvc: ApplicationService, public i18n: I18nService) {}

  statusLabel(status: string): string {
    return this.i18n.t('status.' + status);
  }

  ngOnInit(): void {
    this.appSvc.getPipeline().subscribe({
      next: apps => { this.applications.set(apps); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  countFor(status: string): number {
    if (status === 'ALL') return this.applications().length;
    if (status === 'APPROVED') return this.applications().filter(a => a.status === 'APPROVED' && !a.disbursementStatus).length;
    if (status === 'PENDING_DISBURSEMENT') return this.applications().filter(a => a.status === 'APPROVED' && a.disbursementStatus === 'SECOND_CHECK_PENDING').length;
    if (status === 'DISBURSED') return this.applications().filter(a => a.disbursementStatus === 'FUNDS_RELEASED').length;
    return this.applications().filter(a => a.status === status).length;
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
    try {
      if (this.isBusiness(app)) {
        const c = JSON.parse(app.companyDetailsJson || '{}');
        return c.companyName || app.customerEmail;
      }
      const p = JSON.parse(app.personalDetailsJson || '{}');
      const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || app.customerEmail;
      const a2 = p.applicant2;
      const name2 = a2 ? `${a2.firstName || ''} ${a2.lastName || ''}`.trim() : '';
      return name2 ? `${name} & ${name2}` : name;
    } catch { return app.customerEmail; }
  }
}
