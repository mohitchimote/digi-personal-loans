import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { LoanApplication, UnderwritingNote } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

/** Business equivalent of ViewApplicationComponent — read-only summary once an application is
 * no longer editable (submitted/decided), same pull-back affordance for submitted/under-review. */
@Component({
  selector: 'app-business-view-application',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './business-view-application.component.html',
  styleUrl: './business-view-application.component.scss'
})
export class BusinessViewApplicationComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  notes = signal<UnderwritingNote[]>([]);
  loading = signal(true);
  withdrawing = signal(false);
  error = signal('');

  constructor(
    private route: ActivatedRoute,
    private appSvc: ApplicationService,
    private router: Router,
    private i18n: I18nService
  ) {}

  statusLabel(status: string): string {
    return this.i18n.t('status.' + status);
  }

  noteTypeLabel(type: string): string {
    return this.i18n.t('aside.noteType.' + type) || type;
  }

  ngOnInit(): void {
    const appRef = this.route.snapshot.paramMap.get('appRef');
    if (!appRef) return;
    this.appSvc.getApplication(appRef).subscribe({
      next: app => { this.application.set(app); this.loading.set(false); this.scrollToFragment(); },
      error: () => this.loading.set(false)
    });
    this.appSvc.getNotes(appRef).subscribe({
      next: notes => this.notes.set(notes.filter(n => n.noteType === 'CLARIFICATION_REQUEST' || n.noteType === 'DOCUMENT_REQUEST' || n.noteType === 'SEND_BACK' || n.noteType === 'DECISION_DECLINED')),
      error: () => {}
    });
  }

  /** Lets the sidebar's per-section links (shown once an application is no longer editable, see
   * SidebarComponent.isEditableApplication) jump straight to that section on this read-only page,
   * instead of only ever landing at the top. Deferred a tick since the page is behind *ngIf="!loading()". */
  private scrollToFragment(): void {
    const fragment = this.route.snapshot.fragment;
    if (!fragment) return;
    setTimeout(() => document.getElementById('section-' + fragment)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  parseSection(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  get company()     { return this.parseSection(this.application()?.companyDetailsJson); }
  get signatories()  { return this.parseSection(this.application()?.signatoriesJson).signatories || []; }
  get bankConnection() { return this.parseSection(this.application()?.businessBankConnectionJson); }
  get financials()  { return this.parseSection(this.application()?.businessFinancialsJson); }
  get outgoings()   { return this.parseSection(this.application()?.businessOutgoingsJson); }
  get credit()      { return this.parseSection(this.application()?.businessCreditDeclarationsJson); }
  get verifyId()    { return this.parseSection(this.application()?.verifyIdJson); }
  get directDebit() { return this.parseSection(this.application()?.directDebitJson); }
  get guarantorDetails() { return this.parseSection(this.application()?.guarantorDetailsJson); }
  get consent()          { return this.parseSection(this.application()?.consentManagementJson); }

  get canPullBack(): boolean {
    const status = this.application()?.status;
    return status === 'SUBMITTED' || status === 'UNDER_REVIEW';
  }

  pullBack(): void {
    const app = this.application();
    if (!app) return;
    this.withdrawing.set(true);
    this.error.set('');
    this.appSvc.withdraw(app.applicationRef).subscribe({
      next: () => this.router.navigate(['/business/apply/review-submit']),
      error: () => { this.withdrawing.set(false); this.error.set(this.i18n.t('viewApp.pullBackError')); }
    });
  }
}
