import { Component, OnInit, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ISRAELI_BANKS, IsraeliBank, IsraeliBankBranch } from '../../../../core/models';

interface BankOption { id: string; name: string; icon: string; }
type BankConnectionSummary = { accountMasked: string; avgBalance: number; transactions: number };

/** A single linked account, whether pulled in via the (simulated) Open Banking connect flow or
 * typed in manually. `avgBalance`/`transactions` are only ever populated for Open Banking
 * accounts — there's no real feed to pull them from for a manually entered one. */
interface ConnectedAccount {
  id: string;
  bankName: string;
  accountMasked: string;
  avgBalance: number | null;
  transactions: number | null;
  manual: boolean;
}

@Component({
  selector: 'app-connect-bank',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './connect-bank.component.html',
  styleUrl: './connect-bank.component.scss'
})
export class ConnectBankComponent implements OnInit {
  saving = signal(false);
  appRef = signal('');
  readOnly = signal(false);
  numberOfApplicants = signal(1);

  // Applicant 1 — one or more linked accounts, with one marked as the repayment account.
  connecting = signal(false);
  skipped = signal(false);
  selectedBank: BankOption | null = null;
  accounts = signal<ConnectedAccount[]>([]);
  primaryAccountId = signal<string | null>(null);
  connected = computed(() => this.accounts().length > 0);
  primaryAccount = computed(() => this.accounts().find(a => a.id === this.primaryAccountId()) ?? this.accounts()[0] ?? null);

  showManualForm = signal(false);
  manualBankCode = '';
  manualBranchCode = '';
  manualAccountNumber = '';
  israeliBanks: IsraeliBank[] = ISRAELI_BANKS;

  // Applicant 2 (joint applications only) — unchanged single-account flow.
  connecting2 = signal(false);
  connected2 = signal(false);
  skipped2 = signal(false);
  selectedBank2: BankOption | null = null;
  connectionSummary2: BankConnectionSummary | null = null;

  banks: BankOption[] = [
    { id: 'hapoalim', name: 'Bank Hapoalim', icon: 'account_balance' },
    { id: 'leumi',    name: 'Bank Leumi',    icon: 'account_balance' },
    { id: 'discount',  name: 'Discount Bank', icon: 'account_balance' },
    { id: 'mizrahi',  name: 'Mizrahi-Tefahot', icon: 'account_balance' },
  ];

  constructor(
    private appSvc: ApplicationService,
    public identity: EffectiveIdentityService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditable(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        this.readOnly.set(this.identity.isAssisting && !this.appSvc.isEditableStatus(app.status));
        if (app.loanRequirementsJson) {
          const loanReqs = JSON.parse(app.loanRequirementsJson);
          this.numberOfApplicants.set(Number(loanReqs.numberOfApplicants) || 1);
        }
        if (app.bankConnectionJson) {
          const data = JSON.parse(app.bankConnectionJson);
          if (Array.isArray(data.accounts) && data.accounts.length) {
            this.accounts.set(data.accounts);
            this.primaryAccountId.set(data.primaryAccountId || data.accounts[0].id);
          } else if (data.connected) {
            // Legacy shape from before multi-account support — wrap it in the new list format.
            this.accounts.set([{
              id: 'legacy',
              bankName: data.bankName || '',
              accountMasked: data.summary?.accountMasked || '',
              avgBalance: data.summary?.avgBalance ?? null,
              transactions: data.summary?.transactions ?? null,
              manual: false,
            }]);
            this.primaryAccountId.set('legacy');
          } else if (data.skipped) {
            this.skipped.set(true);
          }
          if (data.applicant2?.connected) {
            this.connected2.set(true);
            this.selectedBank2 = this.banks.find(b => b.id === data.applicant2.bankId) || null;
            this.connectionSummary2 = data.applicant2.summary;
          } else if (data.applicant2?.skipped) {
            this.skipped2.set(true);
          }
        }
      }
    });
  }

  get isJoint(): boolean {
    return this.numberOfApplicants() === 2;
  }

  private fakeSummary(): BankConnectionSummary {
    return {
      accountMasked: '**** **** **** ' + Math.floor(1000 + Math.random() * 9000),
      avgBalance: Math.floor(8000 + Math.random() * 12000),
      transactions: Math.floor(40 + Math.random() * 60)
    };
  }

  connect(bank: BankOption): void {
    this.selectedBank = bank;
    this.connecting.set(true);
    this.skipped.set(false);
    setTimeout(() => {
      this.connecting.set(false);
      const summary = this.fakeSummary();
      this.addAccount({
        id: crypto.randomUUID(),
        bankName: bank.name,
        accountMasked: summary.accountMasked,
        avgBalance: summary.avgBalance,
        transactions: summary.transactions,
        manual: false,
      });
      this.selectedBank = null;
    }, 1600);
  }

  private addAccount(account: ConnectedAccount): void {
    const wasEmpty = this.accounts().length === 0;
    this.accounts.update(list => [...list, account]);
    if (wasEmpty) this.primaryAccountId.set(account.id);
  }

  removeAccount(id: string): void {
    this.accounts.update(list => list.filter(a => a.id !== id));
    if (this.primaryAccountId() === id) {
      this.primaryAccountId.set(this.accounts()[0]?.id ?? null);
    }
  }

  setPrimaryAccount(id: string): void {
    this.primaryAccountId.set(id);
  }

  get manualBank(): IsraeliBank | undefined {
    return this.israeliBanks.find(b => b.code === this.manualBankCode);
  }

  get manualBranches(): IsraeliBankBranch[] {
    return this.manualBank?.branches || [];
  }

  onManualBankChange(): void {
    this.manualBranchCode = '';
  }

  get manualFormValid(): boolean {
    return !!this.manualBankCode && !!this.manualBranchCode && /^\d{4,12}$/.test(this.manualAccountNumber);
  }

  addManualAccount(): void {
    if (!this.manualFormValid) return;
    const bank = this.manualBank;
    const last4 = this.manualAccountNumber.slice(-4);
    this.addAccount({
      id: crypto.randomUUID(),
      bankName: bank?.name || '',
      accountMasked: '**** **** **** ' + last4,
      avgBalance: null,
      transactions: null,
      manual: true,
    });
    this.manualBankCode = '';
    this.manualBranchCode = '';
    this.manualAccountNumber = '';
    this.showManualForm.set(false);
  }

  connect2(bank: BankOption): void {
    this.selectedBank2 = bank;
    this.connecting2.set(true);
    this.skipped2.set(false);
    setTimeout(() => {
      this.connecting2.set(false);
      this.connected2.set(true);
      this.connectionSummary2 = this.fakeSummary();
    }, 1600);
  }

  disconnect2(): void {
    this.connected2.set(false);
    this.connectionSummary2 = null;
    this.selectedBank2 = null;
  }

  private save(payload: any, next: any[]): void {
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'connectBank', payload, this.identity.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(next); },
      error: () => this.saving.set(false)
    });
  }

  continue(): void {
    const primary = this.primaryAccount();
    // `connected`/`bankName`/`summary` are kept at the top level (mirroring the repayment
    // account) for backward compatibility with everything that reads this section — direct debit
    // prefill, review & submit, underwriter case view, etc. `accounts` is the new, additive list.
    const applicant1 = primary
      ? {
          connected: true,
          bankName: primary.bankName,
          summary: { accountMasked: primary.accountMasked, avgBalance: primary.avgBalance, transactions: primary.transactions },
          accounts: this.accounts(),
          primaryAccountId: this.primaryAccountId(),
        }
      : { connected: false, skipped: true, accounts: [] };
    const applicant2 = this.isJoint
      ? (this.connected2()
          ? { connected: true, bankId: this.selectedBank2?.id, bankName: this.selectedBank2?.name, summary: this.connectionSummary2 }
          : { connected: false, skipped: true })
      : null;
    this.save({ ...applicant1, applicant2 }, this.identity.applyUrl('income-employment'));
  }
}
