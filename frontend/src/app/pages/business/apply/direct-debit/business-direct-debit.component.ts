import { Component, OnInit, effect, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { MasterListsService } from '../../../../core/services/master-lists.service';
import { FieldOption } from '../../../../core/services/form-builder.service';
import { I18nService } from '../../../../core/i18n/i18n.service';

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
  readOnly = signal(false);
  prefilledFromBank = signal(false);
  repaymentDays = Array.from({ length: 28 }, (_, i) => i + 1);
  /** Set when a bank is filled in for the customer: pick that bank's first branch once its branches arrive. */
  private wantDefaultBranch = false;

  constructor(private fb: FormBuilder, private appSvc: ApplicationService, public identity: EffectiveIdentityService, private router: Router,
              private lists: MasterListsService, private i18n: I18nService) {
    this.lists.load(['bank']);
    this.form = this.fb.group({
      accountHolderName: ['', Validators.required],
      bankCode:          ['', Validators.required],
      branchCode:        ['', Validators.required],
      accountNumber:     ['', Validators.required],
      preferredRepaymentDay: [1, Validators.required],
      confirmAuthorisation: [false, Validators.requiredTrue],
    });

    this.form.get('bankCode')!.valueChanges.subscribe((code) => {
      this.form.patchValue({ branchCode: '' }, { emitEvent: false });
      if (code) this.lists.loadChildren('bank_branch', code);
    });
    // Once a filled-in bank's branches have arrived, choose the first (what the old list did).
    effect(() => {
      const branches = this.lists.bankBranchOptions(this.form.value.bankCode);
      if (this.wantDefaultBranch && branches.length && !this.form.value.branchCode) {
        this.wantDefaultBranch = false;
        this.form.patchValue({ branchCode: branches[0].value }, { emitEvent: false });
      }
    });
  }

  get selectedBank(): { code: string } | undefined {
    return this.lists.items('bank').find(b => b.code === this.form.value.bankCode);
  }

  bankOptions(): FieldOption[] { return this.lists.options('bank'); }
  branchOptions(): FieldOption[] { return this.lists.bankBranchOptions(this.form.value.bankCode); }
  optionLabel(o: FieldOption): string { return this.i18n.lang() === 'he' ? o.label.he || o.label.en : o.label.en; }

  /** Names are stored on the mandate in English, as before. */
  private bankDisplayName(code: string): string {
    return this.lists.items('bank').find(b => b.code === code)?.name.en || '';
  }

  get selectedBranchName(): string {
    return this.branchOptions().find(b => b.value === this.form.value.branchCode)?.label.en || '';
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        this.readOnly.set(this.identity.isAssisting && !this.appSvc.isEditableStatus(app.status));
        if (this.readOnly()) this.form.disable();
        if (app.directDebitJson) {
          const data = JSON.parse(app.directDebitJson);
          this.form.patchValue(data);
          if (data.bankCode) this.lists.loadChildren('bank_branch', data.bankCode);
          return;
        }

        if (!app.businessBankConnectionJson) return;
        const bankConnection = JSON.parse(app.businessBankConnectionJson);
        const company = app.companyDetailsJson ? JSON.parse(app.companyDetailsJson) : {};
        if (bankConnection.connected) {
          const match = this.lists.bankByName(bankConnection.bankName || '');
          this.form.patchValue({
            accountHolderName: company.companyName || this.identity.companyName || '',
            bankCode: match?.code || '',
            branchCode: '',
            accountNumber: String(Math.floor(10000000 + Math.random() * 89999999)),
          });
          this.wantDefaultBranch = !!match;
          if (match) this.lists.loadChildren('bank_branch', match.code);
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
    this.appSvc.saveSection(this.appRef(), 'directDebit', value, this.identity.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(this.identity.applyUrl('review-submit', true)); },
      error: () => this.saving.set(false)
    });
  }
}
