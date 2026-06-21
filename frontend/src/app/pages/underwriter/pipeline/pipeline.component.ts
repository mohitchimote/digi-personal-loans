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

  statuses = PIPELINE_STATUSES;

  filteredApplications = computed(() => {
    const filter = this.activeFilter();
    if (filter === 'ALL') return this.applications();
    if (filter === 'APPROVED') {
      return this.applications().filter(a => a.status === 'APPROVED' && !a.disbursementStatus);
    }
    if (filter === 'PENDING_DISBURSEMENT') {
      return this.applications().filter(a => a.status === 'APPROVED' && a.disbursementStatus === 'SECOND_CHECK_PENDING');
    }
    if (filter === 'DISBURSED') {
      return this.applications().filter(a => a.disbursementStatus === 'FUNDS_RELEASED');
    }
    return this.applications().filter(a => a.status === filter);
  });

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

  loanAmount(app: LoanApplication): number {
    try { return JSON.parse(app.loanRequirementsJson || '{}').loanAmount || 0; }
    catch { return 0; }
  }

  loanPurpose(app: LoanApplication): string {
    try { return JSON.parse(app.loanRequirementsJson || '{}').loanPurpose || ''; }
    catch { return ''; }
  }

  loanTerm(app: LoanApplication): number {
    try { return JSON.parse(app.loanRequirementsJson || '{}').loanTerm || 0; }
    catch { return 0; }
  }

  applicantName(app: LoanApplication): string {
    try {
      const p = JSON.parse(app.personalDetailsJson || '{}');
      return `${p.firstName || ''} ${p.lastName || ''}`.trim() || app.customerEmail;
    } catch { return app.customerEmail; }
  }
}
