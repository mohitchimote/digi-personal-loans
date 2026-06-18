import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

interface BankOption { id: string; name: string; icon: string; }

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
  connecting = signal(false);
  connected = signal(false);
  skipped = signal(false);
  selectedBank: BankOption | null = null;

  banks: BankOption[] = [
    { id: 'hapoalim', name: 'Bank Hapoalim', icon: '🏦' },
    { id: 'leumi',    name: 'Bank Leumi',    icon: '🏛️' },
    { id: 'discount',  name: 'Discount Bank', icon: '🏦' },
    { id: 'mizrahi',  name: 'Mizrahi-Tefahot', icon: '🏛️' },
  ];

  connectionSummary: { accountMasked: string; avgBalance: number; transactions: number } | null = null;

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
        if (app.bankConnectionJson) {
          const data = JSON.parse(app.bankConnectionJson);
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

  connect(bank: BankOption): void {
    this.selectedBank = bank;
    this.connecting.set(true);
    this.skipped.set(false);
    setTimeout(() => {
      this.connecting.set(false);
      this.connected.set(true);
      this.connectionSummary = {
        accountMasked: '**** **** **** ' + Math.floor(1000 + Math.random() * 9000),
        avgBalance: Math.floor(8000 + Math.random() * 12000),
        transactions: Math.floor(40 + Math.random() * 60)
      };
    }, 1600);
  }

  disconnect(): void {
    this.connected.set(false);
    this.connectionSummary = null;
    this.selectedBank = null;
  }

  private save(payload: any, next: string): void {
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'connectBank', payload, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate([next]); },
      error: () => this.saving.set(false)
    });
  }

  continue(): void {
    if (this.connected()) {
      this.save({ connected: true, bankId: this.selectedBank?.id, bankName: this.selectedBank?.name, summary: this.connectionSummary }, '/portal/apply/income-employment');
    } else {
      this.save({ connected: false, skipped: true }, '/portal/apply/income-employment');
    }
  }
}
