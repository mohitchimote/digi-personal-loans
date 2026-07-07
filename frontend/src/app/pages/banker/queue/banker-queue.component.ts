import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { LoanApplication } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

@Component({
  selector: 'app-banker-queue',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './banker-queue.component.html',
  styleUrl: './banker-queue.component.scss'
})
export class BankerQueueComponent implements OnInit {
  applications = signal<LoanApplication[]>([]);
  loading = signal(true);

  constructor(private appSvc: ApplicationService, public i18n: I18nService) {}

  ngOnInit(): void {
    this.appSvc.getBankerQueue().subscribe({
      next: apps => { this.applications.set(apps); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  statusLabel(status: string): string {
    return this.i18n.t('status.' + status);
  }

  isBusiness(app: LoanApplication): boolean {
    return app.applicationType === 'BUSINESS';
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
