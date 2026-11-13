import { Component, OnInit, effect, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { MasterListsService } from '../../../../core/services/master-lists.service';
import { FieldOption } from '../../../../core/services/form-builder.service';
import { reconcileStoredValue } from '../../../../shared/master-options';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../../core/i18n/i18n.service';

/** First business wizard step — company identity doubles as "loan requirements" the same way
 * loanRequirements does for the personal journey (amount/purpose/term captured alongside identity). */
@Component({
  selector: 'app-company-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './company-details.component.html',
  styleUrl: './company-details.component.scss'
})
export class CompanyDetailsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  readOnly = signal(false);

  constructor(
    private fb: FormBuilder,
    private appSvc: ApplicationService,
    public identity: EffectiveIdentityService,
    private router: Router,
    private i18n: I18nService,
    private lists: MasterListsService
  ) {
    this.lists.load(['business_loan_purpose', 'branch', 'branch_staff']);
    // A saved record may hold the old display text ("Working Capital", a branch name): map it to the code once the lists arrive.
    effect(() => { ['business_loan_purpose', 'branch', 'branch_staff'].forEach((m) => this.lists.options(m)); this.reconcileLegacyValues(); });
    this.form = this.fb.group({
      companyName:               ['', Validators.required],
      companyRegistrationNumber: ['', Validators.required],
      industry:                  ['', Validators.required],
      yearFounded:                [null, Validators.required],
      street:   ['', Validators.required],
      city:     ['', Validators.required],
      postCode: ['', Validators.required],
      country:  ['Israel', Validators.required],
      loanAmount: [100000, [Validators.required, Validators.min(20000), Validators.max(1000000)]],
      loanPurpose: ['', Validators.required],
      loanTerm:   [36, [Validators.required, Validators.min(6), Validators.max(84)]],
      assistedByStaff: [false],
      preferredBranch: [''],
      staffName: [''],
    });
  }

  purposeOptions(): FieldOption[] { return this.lists.options('business_loan_purpose'); }
  branchOptions(): FieldOption[] { return this.lists.options('branch'); }
  optionLabel(o: FieldOption): string { return this.i18n.lang() === 'he' ? o.label.he || o.label.en : o.label.en; }

  /** Staff the customer can name at the chosen branch: the Branch Staff master's items under it. */
  staffOptionsForBranch(): FieldOption[] {
    const branch = this.f('preferredBranch')?.value;
    return branch ? this.lists.optionsUnder('branch_staff', branch) : [];
  }

  onBranchChange(): void {
    if (!this.staffOptionsForBranch().some((o) => o.value === this.f('staffName')?.value)) {
      this.f('staffName')?.setValue('');
    }
  }

  private reconcileLegacyValues(): void {
    const fix = (name: string, options: FieldOption[]) => {
      const c = this.form?.get(name);
      if (!c?.value || !options.length) return;
      const fixed = reconcileStoredValue(options, c.value);
      if (fixed === null) c.setValue('', { emitEvent: false });
      else if (fixed !== c.value) c.setValue(fixed, { emitEvent: false });
    };
    fix('loanPurpose', this.purposeOptions());
    fix('preferredBranch', this.branchOptions());
    fix('staffName', this.staffOptionsForBranch());
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        this.readOnly.set(this.identity.isAssisting && !this.appSvc.isEditableStatus(app.status));
        if (app.companyDetailsJson) {
          this.form.patchValue(JSON.parse(app.companyDetailsJson));
        } else {
          // Registration already collects these for a business account — prefill rather than
          // making the customer retype what they just gave us.
          this.form.patchValue({
            companyName: this.identity.companyName || '',
            companyRegistrationNumber: this.identity.companyRegistrationNumber || '',
            industry: this.identity.companyIndustry || '',
            yearFounded: this.identity.companyFoundedYear ?? null,
          });
        }
        // The lists may have arrived before this record did: map any old display text now.
        this.reconcileLegacyValues();
        if (this.readOnly()) this.form.disable();
      }
    });
  }

  f(name: string) { return this.form.get(name); }

  optLabel(namespace: string, value: string): string {
    return this.i18n.t(`${namespace}.${value}`);
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'companyDetails', this.form.value, this.identity.userId!).subscribe({
      next: () => {
        this.saving.set(false);
        if (this.identity.isAssisting) {
          this.router.navigate(this.identity.applyUrl('signatories', true));
        } else {
          this.router.navigate(['/business/apply/consent-management']);
        }
      },
      error: () => this.saving.set(false)
    });
  }
}
