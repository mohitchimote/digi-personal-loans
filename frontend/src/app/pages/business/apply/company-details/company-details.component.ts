import { Component, OnInit, effect, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { FieldSelectComponent } from '../../../../shared/field-select/field-select.component';
import { FormFieldOptionsService } from '../../../../core/services/form-field-options.service';
import { FieldOption, FormField, fieldIn } from '../../../../core/services/form-builder.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../../core/i18n/i18n.service';

/** First business wizard step — company identity doubles as "loan requirements" the same way
 * loanRequirements does for the personal journey (amount/purpose/term captured alongside identity). */
@Component({
  selector: 'app-company-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe, FieldSelectComponent],
  templateUrl: './company-details.component.html',
  styleUrl: './company-details.component.scss'
})
export class CompanyDetailsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  readOnly = signal(false);
  /** The form definition's fields for the pick-lists on this step: they say where the options come from. */
  fieldDefs = signal<{ purpose?: FormField; branch?: FormField; staff?: FormField; industry?: FormField; country?: FormField; state?: FormField; city?: FormField }>({});

  constructor(
    private fb: FormBuilder,
    private appSvc: ApplicationService,
    public identity: EffectiveIdentityService,
    private router: Router,
    private i18n: I18nService,
    private opts: FormFieldOptionsService
  ) {
    // A saved record may hold the old display text ("Working Capital", a branch name): map it to the code once the options arrive.
    effect(() => { this.purposeOptions(); this.branchOptions(); this.staffOptionsForBranch(); this.reconcileLegacyValues(); });
    this.form = this.fb.group({
      companyName:               ['', Validators.required],
      companyRegistrationNumber: ['', Validators.required],
      industry:                  ['', Validators.required],
      yearFounded:                [null, Validators.required],
      street:   ['', Validators.required],
      country:  ['IL', Validators.required],
      state:    ['', Validators.required],
      city:     ['', Validators.required],
      postCode: ['', Validators.required],
      loanAmount: [100000, [Validators.required, Validators.min(20000), Validators.max(1000000)]],
      loanPurpose: ['', Validators.required],
      loanTerm:   [36, [Validators.required, Validators.min(6), Validators.max(84)]],
      assistedByStaff: [false],
      preferredBranch: [''],
      staffName: [''],
    });
  }

  purposeOptions(): FieldOption[] { return this.opts.options(this.fieldDefs().purpose); }
  branchOptions(): FieldOption[] { return this.opts.options(this.fieldDefs().branch); }
  optionLabel(o: FieldOption): string { return this.opts.localised(o); }

  /** Staff the customer can name at the chosen branch; the form definition says where they come from. */
  staffOptionsForBranch(): FieldOption[] {
    return this.opts.options(this.fieldDefs().staff, this.f('preferredBranch')?.value);
  }

  onBranchChange(): void {
    if (!this.staffOptionsForBranch().some((o) => o.value === this.f('staffName')?.value)) {
      this.f('staffName')?.setValue('');
    }
  }

  private reconcileLegacyValues(): void {
    const fix = (name: string, def: FormField | undefined, parent?: unknown) => {
      const c = this.form?.get(name);
      if (!c?.value || !this.opts.options(def, parent).length) return;
      const fixed = this.opts.normalise(def, c.value, parent);
      if (fixed === null) c.setValue('', { emitEvent: false });
      else if (fixed !== c.value) c.setValue(fixed, { emitEvent: false });
    };
    fix('loanPurpose', this.fieldDefs().purpose);
    fix('preferredBranch', this.fieldDefs().branch);
    fix('staffName', this.fieldDefs().staff, this.f('preferredBranch')?.value);
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        this.fieldDefs.set({
          purpose: fieldIn(app.formSchema, 'companyDetails', 'loanPurpose'),
          branch: fieldIn(app.formSchema, 'companyDetails', 'preferredBranch'),
          staff: fieldIn(app.formSchema, 'companyDetails', 'staffName'),
          industry: fieldIn(app.formSchema, 'companyDetails', 'industry'),
          country: fieldIn(app.formSchema, 'companyDetails', 'country'),
          state: fieldIn(app.formSchema, 'companyDetails', 'state'),
          city: fieldIn(app.formSchema, 'companyDetails', 'city'),
        });
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
