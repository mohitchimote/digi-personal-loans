import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ISRAELI_BANKS, IsraeliBank, IsraeliBankBranch } from '../../../../core/models';

@Component({
  selector: 'app-direct-debit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './direct-debit.component.html',
  styleUrl: './direct-debit.component.scss'
})
export class DirectDebitComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  addGuarantor = signal(false);
  prefilledFromBank = signal(false);
  isJoint = signal(false);
  repaymentDays = Array.from({ length: 28 }, (_, i) => i + 1);
  banks: IsraeliBank[] = ISRAELI_BANKS;

  accountCandidates: { source: 'applicant1' | 'applicant2'; name: string; bankName: string }[] = [];

  constructor(
    private fb: FormBuilder,
    private appSvc: ApplicationService,
    private auth: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group({
      accountSource:     ['applicant1'],
      accountHolderName: ['', Validators.required],
      bankCode:          ['', Validators.required],
      branchCode:        ['', Validators.required],
      accountNumber:     ['', Validators.required],
      preferredRepaymentDay: [1, Validators.required],
      confirmAuthorisation: [false, Validators.requiredTrue],
      guarantorName:     [''],
      guarantorNationalId: [''],
      guarantorRelationship: [''],
      guarantorPhone:    [''],
      guarantorEmail:    [''],
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
    this.appSvc.resolveEditable(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.loanRequirementsJson) {
          const loanReqs = JSON.parse(app.loanRequirementsJson);
          this.isJoint.set((Number(loanReqs.numberOfApplicants) || 1) === 2);
        }

        if (app.directDebitJson) {
          const data = JSON.parse(app.directDebitJson);
          if (!data.bankCode && data.bankName) {
            // Backward compatibility with data saved before bank/branch became dropdowns.
            const match = this.banks.find(b => data.bankName.includes(b.name) || b.name.includes(data.bankName));
            if (match) data.bankCode = match.code;
          }
          this.form.patchValue(data);
          if (data.guarantorName) this.addGuarantor.set(true);
          return;
        }

        if (!app.bankConnectionJson) return;
        const bankConnection = JSON.parse(app.bankConnectionJson);
        const personal = app.personalDetailsJson ? JSON.parse(app.personalDetailsJson) : {};

        if (bankConnection.connected) {
          this.accountCandidates.push({
            source: 'applicant1',
            name: [personal.firstName, personal.lastName].filter(Boolean).join(' ') || this.auth.userFullName || '',
            bankName: bankConnection.bankName || '',
          });
        }
        if (this.isJoint() && bankConnection.applicant2?.connected) {
          this.accountCandidates.push({
            source: 'applicant2',
            name: [personal.applicant2?.firstName, personal.applicant2?.lastName].filter(Boolean).join(' '),
            bankName: bankConnection.applicant2.bankName || '',
          });
        }

        if (this.accountCandidates.length) {
          this.applyAccountSource(this.accountCandidates[0].source);
        }
      }
    });
  }

  applyAccountSource(source: 'applicant1' | 'applicant2' | 'manual'): void {
    this.form.patchValue({ accountSource: source });
    const candidate = this.accountCandidates.find(c => c.source === source);
    if (!candidate) {
      this.prefilledFromBank.set(false);
      return;
    }
    const match = this.banks.find(b => candidate.bankName.includes(b.name) || b.name.includes(candidate.bankName));
    this.form.patchValue({
      accountHolderName: candidate.name,
      bankCode: match?.code || '',
      branchCode: match?.branches[0]?.code || '',
      accountNumber: String(Math.floor(10000000 + Math.random() * 89999999)),
    });
    this.prefilledFromBank.set(true);
  }

  toggleGuarantor(): void {
    this.addGuarantor.set(!this.addGuarantor());
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
    if (!this.addGuarantor()) {
      value.guarantorName = '';
      value.guarantorNationalId = '';
      value.guarantorRelationship = '';
      value.guarantorPhone = '';
      value.guarantorEmail = '';
    }
    this.appSvc.saveSection(this.appRef(), 'directDebit', value, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/portal/apply/review-submit']); },
      error: () => this.saving.set(false)
    });
  }
}
