import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ISRAELI_BANKS, IsraeliBank, IsraeliBankBranch } from '../../../../core/models';

/** Business equivalent of DirectDebitComponent — repayment account capture is identical in shape,
 * just simplified to a single business account (no joint-applicant account-source picker). */
@Component({
  selector: 'app-business-direct-debit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './business-direct-debit.component.html',
  styleUrl: './business-direct-debit.component.scss'
})
export class BusinessDirectDebitComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  prefilledFromBank = signal(false);
  repaymentDays = Array.from({ length: 28 }, (_, i) => i + 1);
  banks: IsraeliBank[] = ISRAELI_BANKS;

  constructor(private fb: FormBuilder, private appSvc: ApplicationService, private auth: AuthService, private router: Router) {
    this.form = this.fb.group({
      accountHolderName: ['', Validators.required],
      bankCode:          ['', Validators.required],
      branchCode:        ['', Validators.required],
      accountNumber:     ['', Validators.required],
      preferredRepaymentDay: [1, Validators.required],
      confirmAuthorisation: [false, Validators.requiredTrue],
    });

    this.form.get('bankCode')!.valueChanges.subscribe(() => this.form.patchValue({ branchCode: '' }, { emitEvent: false }));
  }

  get selectedBank(): IsraeliBank | undefined {
    return this.banks.find(b => b.code === this.form.value.bankCode);
  }

  get selectedBankBranches(): IsraeliBankBranch[] {
    return this.selectedBank?.branches || [];
  }

  private bankDisplayName(code: string): string {
    return this.banks.find(b => b.code === code)?.name || '';
  }

  get selectedBranchName(): string {
    return this.selectedBankBranches.find(b => b.code === this.form.value.branchCode)?.name || '';
  }

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.directDebitJson) {
          const data = JSON.parse(app.directDebitJson);
          this.form.patchValue(data);
          return;
        }

        if (!app.businessBankConnectionJson) return;
        const bankConnection = JSON.parse(app.businessBankConnectionJson);
        const company = app.companyDetailsJson ? JSON.parse(app.companyDetailsJson) : {};
        if (bankConnection.connected) {
          const match = this.banks.find(b => bankConnection.bankName?.includes(b.name) || b.name.includes(bankConnection.bankName));
          this.form.patchValue({
            accountHolderName: company.companyName || this.auth.companyName || '',
            bankCode: match?.code || '',
            branchCode: match?.branches[0]?.code || '',
            accountNumber: String(Math.floor(10000000 + Math.random() * 89999999)),
          });
          this.prefilledFromBank.set(true);
        }
      }
    });
  }

  f(name: string) { return this.form.get(name); }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const value = {
      ...this.form.value,
      bankName: this.bankDisplayName(this.form.value.bankCode),
      branchName: this.selectedBranchName,
    };
    this.appSvc.saveSection(this.appRef(), 'directDebit', value, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/business/apply/review-submit']); },
      error: () => this.saving.set(false)
    });
  }
}
