import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

interface BankOption { id: string; name: string; icon: string; }
type BankConnectionSummary = { accountMasked: string; avgBalance: number; transactions: number };

/** Business-account equivalent of ConnectBankComponent — same simulated-connection pattern,
 * single business account (no joint-applicant complexity). */
@Component({
  selector: 'app-business-connect-bank',
  standalone: true,
  imports: [CommonModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './business-connect-bank.component.html',
  styleUrl: './business-connect-bank.component.scss'
})
export class BusinessConnectBankComponent implements OnInit {
  saving = signal(false);
  appRef = signal('');
  connecting = signal(false);
  connected = signal(false);
  skipped = signal(false);
  selectedBank: BankOption | null = null;
  connectionSummary: BankConnectionSummary | null = null;

  banks: BankOption[] = [
    { id: 'hapoalim', name: 'Bank Hapoalim', icon: 'account_balance' },
    { id: 'leumi',    name: 'Bank Leumi',    icon: 'account_balance' },
    { id: 'discount',  name: 'Discount Bank', icon: 'account_balance' },
    { id: 'mizrahi',  name: 'Mizrahi-Tefahot', icon: 'account_balance' },
  ];

  constructor(private appSvc: ApplicationService, private auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.businessBankConnectionJson) {
          const data = JSON.parse(app.businessBankConnectionJson);
          if (data.connected) {
            this.connected.set(true);
            this.selectedBank = this.banks.find(b => b.id === data.bankId) || null;
            this.connectionSummary = data.summary;
          } else if (data.skipped) {
            this.skipped.set(true);
          }
        }
      }
    });
  }

  private fakeSummary(): BankConnectionSummary {
    return {
      accountMasked: '**** **** **** ' + Math.floor(1000 + Math.random() * 9000),
      avgBalance: Math.floor(40000 + Math.random() * 160000),
      transactions: Math.floor(80 + Math.random() * 200)
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

  continue(): void {
    this.saving.set(true);
    const payload = this.connected()
      ? { connected: true, bankId: this.selectedBank?.id, bankName: this.selectedBank?.name, summary: this.connectionSummary }
      : { connected: false, skipped: true };
    this.appSvc.saveSection(this.appRef(), 'connectBusinessBank', payload, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/business/apply/financials']); },
      error: () => this.saving.set(false)
    });
  }
}
