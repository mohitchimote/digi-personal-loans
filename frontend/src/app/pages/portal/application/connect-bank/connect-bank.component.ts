import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

interface BankOption { id: string; name: string; icon: string; }
type BankConnectionSummary = { accountMasked: string; avgBalance: number; transactions: number };

@Component({
  selector: 'app-connect-bank',
  standalone: true,
  imports: [CommonModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './connect-bank.component.html',
  styleUrl: './connect-bank.component.scss'
})
export class ConnectBankComponent implements OnInit {
  saving = signal(false);
  appRef = signal('');
  numberOfApplicants = signal(1);

  // Applicant 1
  connecting = signal(false);
  connected = signal(false);
  skipped = signal(false);
  selectedBank: BankOption | null = null;
  connectionSummary: BankConnectionSummary | null = null;

  // Applicant 2 (joint applications only)
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
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditable(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.loanRequirementsJson) {
          const loanReqs = JSON.parse(app.loanRequirementsJson);
          this.numberOfApplicants.set(Number(loanReqs.numberOfApplicants) || 1);
        }
        if (app.bankConnectionJson) {
          const data = JSON.parse(app.bankConnectionJson);
          if (data.connected) {
            this.connected.set(true);
            this.selectedBank = this.banks.find(b => b.id === data.bankId) || null;
            this.connectionSummary = data.summary;
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
      this.connected.set(true);
      this.connectionSummary = this.fakeSummary();
    }, 1600);
  }

  disconnect(): void {
    this.connected.set(false);
    this.connectionSummary = null;
    this.selectedBank = null;
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

  private save(payload: any, next: string): void {
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'connectBank', payload, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate([next]); },
      error: () => this.saving.set(false)
    });
  }

  continue(): void {
    const applicant1 = this.connected()
      ? { connected: true, bankId: this.selectedBank?.id, bankName: this.selectedBank?.name, summary: this.connectionSummary }
      : { connected: false, skipped: true };
    const applicant2 = this.isJoint
      ? (this.connected2()
          ? { connected: true, bankId: this.selectedBank2?.id, bankName: this.selectedBank2?.name, summary: this.connectionSummary2 }
          : { connected: false, skipped: true })
      : null;
    this.save({ ...applicant1, applicant2 }, '/portal/apply/income-employment');
  }
}
