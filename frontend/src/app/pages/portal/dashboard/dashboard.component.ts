import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ApplicationService } from '../../../core/services/application.service';
import { ProductService } from '../../../core/services/product.service';
import { LoanApplication, PreApprovedOffer, UnderwritingNote, BankRelationshipAccount, DIGIBANK_BRANCHES } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

interface StatementRow {
  month: number;
  date: string;
  payment: number;
  principalPortion: number;
  interestPortion: number;
  balance: number;
}

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
  relationshipAccounts = signal<BankRelationshipAccount[]>([]);
  loanAccounts = signal<BankRelationshipAccount[]>([]);
  allAccounts = computed(() => [...this.relationshipAccounts(), ...this.loanAccounts()]);

  /** Collapsed-by-default sections the customer can expand on demand, keyed by section id.
   * "relationship" starts collapsed since it's good-to-know info, not the day-to-day focus —
   * "applications" starts expanded since that's the primary task on this page. */
  collapsedSections = signal<Record<string, boolean>>({ relationship: true, applications: false });

  toggleSection(key: string): void {
    this.collapsedSections.update(map => ({ ...map, [key]: !map[key] }));
  }

  isCollapsed(key: string): boolean {
    return !!this.collapsedSections()[key];
  }

  infoMessage = signal('');
  viewingStatementFor = signal<BankRelationshipAccount | null>(null);
  statementRows = computed(() => {
    const acc = this.viewingStatementFor();
    return acc ? this.buildStatementRows(acc) : [];
  });

  /** Loan-account actions: Statements is built for real off the loan's actual figures (no
   * backend integration needed, everything is already known). The rest are flagged for later. */
  openStatement(acc: BankRelationshipAccount): void {
    this.viewingStatementFor.set(acc);
  }

  closeStatement(): void {
    this.viewingStatementFor.set(null);
  }

  comingSoon(featureLabelKey: string): void {
    this.infoMessage.set(this.i18n.t('dashboard.featureComingSoon', { feature: this.i18n.t(featureLabelKey) }));
    setTimeout(() => this.infoMessage.set(''), 4000);
  }

  /** Recomputes each month's principal/interest split and running balance from disbursement up
   * to now, the same way a real loan statement would — reusing the loan's actual rate/repayment
   * rather than re-deriving anything synthetic. */
  private buildStatementRows(acc: BankRelationshipAccount): StatementRow[] {
    if (!acc.disbursedDate || !acc.elapsedMonths || acc.elapsedMonths <= 0) return [];
    const rows: StatementRow[] = [];
    const r = (acc.interestRate ?? 0) / 100 / 12;
    const monthly = acc.monthlyRepayment ?? 0;
    const disbursed = new Date(acc.disbursedDate);
    let balance = acc.principal ?? 0;

    for (let i = 1; i <= acc.elapsedMonths; i++) {
      const interestPortion = balance * r;
      const principalPortion = Math.min(balance, monthly - interestPortion);
      balance = Math.max(0, balance - principalPortion);
      rows.push({
        month: i,
        date: this.addMonths(disbursed, i).toISOString().slice(0, 10),
        payment: monthly,
        principalPortion,
        interestPortion,
        balance,
      });
    }
    return rows;
  }

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
          this.loadLoanAccounts(apps);
        },
        error: () => {}
      });
    }
    const nationalId = this.auth.userNationalId;
    if (nationalId) {
      this.productSvc.getPreApprovedOffer(nationalId).subscribe(offer => {
        this.preApprovedOffer.set(offer);
        if (offer) this.relationshipAccounts.set(this.buildRelationshipAccounts(nationalId));
      });
    }
  }

  /** Demo-only: fakes "what this customer already holds with the bank" for pre-approved/existing
   * customers, since there's no core-banking integration to pull real accounts from. Deterministic
   * per nationalId (same customer always sees the same accounts; different customers see different
   * ones) so it works for any pre-approved persona without hardcoding specific names/numbers. */
  private buildRelationshipAccounts(nationalId: string): BankRelationshipAccount[] {
    const rand = this.seededRandom(nationalId);
    const branch = DIGIBANK_BRANCHES[Math.floor(rand() * DIGIBANK_BRANCHES.length)];
    const customerSinceYear = 2015 + Math.floor(rand() * 8);

    const accounts: BankRelationshipAccount[] = [{
      type: 'CURRENT',
      accountMasked: `**** ${1000 + Math.floor(rand() * 9000)}`,
      branch,
      balance: Math.round((8000 + rand() * 42000) / 100) * 100,
      customerSinceYear,
    }];

    if (rand() < 0.6) {
      const termMonths = [6, 12, 24, 36][Math.floor(rand() * 4)];
      const maturity = new Date();
      maturity.setMonth(maturity.getMonth() + termMonths);
      accounts.push({
        type: 'DEPOSIT',
        accountMasked: `**** ${1000 + Math.floor(rand() * 9000)}`,
        branch,
        balance: Math.round((20000 + rand() * 130000) / 500) * 500,
        customerSinceYear,
        interestRate: Math.round((2.5 + rand() * 2) * 10) / 10,
        termMonths,
        maturityDate: maturity.toISOString().slice(0, 10),
      });
    }
    return accounts;
  }

  /** Tiny deterministic PRNG seeded from a string (no crypto requirement — this only drives
   * cosmetic demo data), so the same nationalId always yields the same fake account details. */
  private seededRandom(seed: string): () => number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return () => {
      h = (h * 1103515245 + 12345) >>> 0;
      return h / 4294967296;
    };
  }

  /** Once a loan is disbursed it becomes a real loan account: builds it from the application's
   * actual approved amount and selected product (rate/term/monthly repayment), with the
   * outstanding balance genuinely amortized from the approval date rather than faked. */
  private loadLoanAccounts(apps: LoanApplication[]): void {
    this.loanAccounts.set([]);
    apps.filter(a => a.disbursementStatus === 'FUNDS_RELEASED').forEach(app => {
      this.appSvc.getNotes(app.applicationRef).subscribe({
        next: notes => {
          const approvalNote = notes.find(n => n.noteType === 'DECISION_APPROVED');
          const approvedDate = new Date(approvalNote?.createdAt || app.updatedAt);
          const account = this.buildLoanAccount(app, approvedDate);
          if (account) this.loanAccounts.update(list => [...list, account]);
        },
        error: () => {}
      });
    });
  }

  private buildLoanAccount(app: LoanApplication, approvedDate: Date): BankRelationshipAccount | null {
    const product = this.parseJson(app.selectedProductJson);
    const loanReq = this.parseJson(app.loanRequirementsJson);
    const principal = app.approvedAmount ?? loanReq.loanAmount ?? 0;
    const termMonths = product.termMonths ?? 0;
    const interestRate = product.interestRate ?? 0;
    const monthlyRepayment = product.monthlyRepayment ?? 0;
    if (!principal || !termMonths) return null;

    const elapsedMonths = this.monthsBetween(approvedDate, new Date(), termMonths);
    const balance = this.calculateOutstandingBalance(principal, interestRate, monthlyRepayment, elapsedMonths);
    const maturity = this.addMonths(approvedDate, termMonths);

    return {
      type: 'LOAN',
      accountMasked: app.applicationRef,
      branch: '',
      balance,
      customerSinceYear: approvedDate.getFullYear(),
      interestRate,
      termMonths,
      maturityDate: maturity.toISOString().slice(0, 10),
      principal,
      monthlyRepayment,
      disbursedDate: approvedDate.toISOString().slice(0, 10),
      elapsedMonths,
    };
  }

  /** Standard declining-balance amortization: how much of the original loan is still owed after
   * `elapsedMonths` of repayments at the agreed monthly rate. */
  private calculateOutstandingBalance(principal: number, annualRatePct: number, monthlyRepayment: number, elapsedMonths: number): number {
    if (elapsedMonths <= 0) return Math.round(principal);
    const r = annualRatePct / 100 / 12;
    if (r === 0) return Math.max(0, Math.round(principal - monthlyRepayment * elapsedMonths));
    const balance = principal * Math.pow(1 + r, elapsedMonths) - monthlyRepayment * ((Math.pow(1 + r, elapsedMonths) - 1) / r);
    return Math.max(0, Math.round(balance));
  }

  private monthsBetween(from: Date, to: Date, cap: number): number {
    let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    if (to.getDate() < from.getDate()) months--;
    return Math.max(0, Math.min(months, cap));
  }

  private addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  private parseJson(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  accountIcon(acc: BankRelationshipAccount): string {
    if (acc.type === 'CURRENT') return 'account_balance_wallet';
    if (acc.type === 'DEPOSIT') return 'savings';
    return 'request_quote';
  }

  accountLabelKey(acc: BankRelationshipAccount): string {
    if (acc.type === 'CURRENT') return 'dashboard.currentAccountLabel';
    if (acc.type === 'DEPOSIT') return 'dashboard.depositAccountLabel';
    return 'dashboard.loanAccountLabel';
  }

  balanceLabelKey(acc: BankRelationshipAccount): string {
    return acc.type === 'LOAN' ? 'dashboard.outstandingBalance' : 'dashboard.accountBalance';
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
