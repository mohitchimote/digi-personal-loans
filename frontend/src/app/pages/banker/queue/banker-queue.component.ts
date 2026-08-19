import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { LoanApplication } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { applicantDisplayName } from '../../../core/utils/application-display';

// Broader than the banker's day-to-day working set — also needs Declined for deep-links from the
// Home dashboard's tiles, so it fetches the same home-stats scope rather than /banker-queue.
const QUEUE_STATUSES = ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'CONDITIONALLY_APPROVED', 'REFERRED_TO_SENIOR', 'APPROVED', 'DECLINED'];

@Component({
  selector: 'app-banker-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './banker-queue.component.html',
  styleUrl: './banker-queue.component.scss'
})
export class BankerQueueComponent implements OnInit {
  applications = signal<LoanApplication[]>([]);
  loading = signal(true);

  statusFilter = signal('ALL');
  searchText = signal('');
  startDate = signal('');
  endDate = signal('');
  statuses = QUEUE_STATUSES;

  filteredApplications = computed(() => {
    let result = this.applications();

    const status = this.statusFilter();
    if (status === 'DRAFT_IN_PROGRESS') {
      result = result.filter(a => a.status === 'DRAFT' || a.status === 'IN_PROGRESS');
    } else if (status === 'APPROVED') {
      result = result.filter(a => a.status === 'APPROVED' && !a.disbursementStatus);
    } else if (status === 'PENDING_DISBURSEMENT') {
      result = result.filter(a => a.status === 'APPROVED' && a.disbursementStatus === 'SECOND_CHECK_PENDING');
    } else if (status === 'DISBURSED') {
      result = result.filter(a => a.disbursementStatus === 'FUNDS_RELEASED');
    } else if (status !== 'ALL') {
      result = result.filter(a => a.status === status);
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
        const t = new Date(a.updatedAt || a.createdAt).getTime();
        return (start === null || t >= start) && (end === null || t < end);
      });
    }

    return result;
  });

  constructor(private appSvc: ApplicationService, public i18n: I18nService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const initialStatus = this.route.snapshot.queryParamMap.get('status');
    if (initialStatus) this.statusFilter.set(initialStatus);

    this.appSvc.getHomeStats().subscribe({
      next: apps => { this.applications.set(apps); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  resetFilters(): void {
    this.statusFilter.set('ALL');
    this.searchText.set('');
    this.startDate.set('');
    this.endDate.set('');
  }

  statusLabel(status: string): string {
    return this.i18n.t('status.' + status);
  }

  isBusiness(app: LoanApplication): boolean {
    return app.applicationType === 'BUSINESS';
  }

  applicantName(app: LoanApplication): string {
    return applicantDisplayName(app);
  }
}
