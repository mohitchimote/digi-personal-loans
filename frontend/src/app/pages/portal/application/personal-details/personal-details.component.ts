import { Component, OnInit, signal, computed, WritableSignal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription, merge } from 'rxjs';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { MARITAL_STATUSES, NATIONALITIES, DIGIBANK_BRANCHES, DIGIBANK_BRANCH_STAFF } from '../../../../core/models';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { yearRangeValidator, idIssueNotBeforeDobValidator } from '../../../../core/validators/date-validators';
import { DynamicFieldComponent, isFieldVisible, EvalContext } from '../../../../shared/dynamic-field/dynamic-field.component';
import { FieldHelpComponent } from '../../../../shared/field-help/field-help.component';
import { FormField, FormSectionHeader, NamedConstant } from '../../../../core/services/form-builder.service';

// Mirrors worker/src/lib/sections.ts's SECTION_TO_COLUMN — which section's saved data lives in
// which JSON column on the application row. Used to flatten every *other* section's last-saved
// values into this component's cross-section evalContext (see buildStaticValues below); kept in
// sync by hand like every other worker/frontend pair in this feature.
const SECTION_JSON_COLUMNS: Record<string, string> = {
  loanRequirements: 'loanRequirementsJson',
  consentManagement: 'consentManagementJson',
  personalDetails: 'personalDetailsJson',
  connectBank: 'bankConnectionJson',
  incomeEmployment: 'incomeEmploymentJson',
  outgoings: 'outgoingsJson',
  creditDeclarations: 'creditDeclarationsJson',
  verifyId: 'verifyIdJson',
  directDebit: 'directDebitJson',
  reviewSubmit: 'reviewSubmitJson',
  guarantorDetails: 'guarantorDetailsJson',
  companyDetails: 'companyDetailsJson',
  signatories: 'signatoriesJson',
  connectBusinessBank: 'businessBankConnectionJson',
  businessFinancials: 'businessFinancialsJson',
  businessOutgoings: 'businessOutgoingsJson',
  businessCreditDeclarations: 'businessCreditDeclarationsJson',
};

@Component({
  selector: 'app-personal-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ApplicationAsideComponent, TranslatePipe, DynamicFieldComponent, FieldHelpComponent],
  templateUrl: './personal-details.component.html',
  styleUrl: './personal-details.component.scss'
})
export class PersonalDetailsComponent implements OnInit {
  form: FormGroup;
  applicant2Form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  readOnly = signal(false);
  numberOfApplicants = signal(1);
  maritalStatuses = MARITAL_STATUSES;
  nationalities = NATIONALITIES;
  branches = DIGIBANK_BRANCHES;
  applicant2Error = signal('');
  addressHistoryError = signal('');

  readonly ADDRESS_HISTORY_TARGET_MONTHS = 36;
  readonly CONSENT_VALIDITY_DAYS = 90;

  nationalIdVerifying = signal(false);
  nationalIdVerified = signal(false);
  nationalIdVerifying2 = signal(false);
  nationalIdVerified2 = signal(false);

  consentForm: FormGroup;
  consentValid = signal(false);
  consentValidUntil = signal<string | null>(null);
  showConsentModal = signal(false);
  showRemoteConsentNotice = signal(false);
  consentRecorded = signal(false);
  consentError = signal('');
  private storedConsent: any = null;

  // Admin Form Builder integration: any `kind: "custom"` field the admin added to the
  // personalDetails section of the resolved form version (see lib/form-versions.ts's
  // withResolvedFormVersion) — rendered generically via DynamicFieldComponent, kept in a
  // separate FormGroup from `form` above so none of the hand-built fields/validators/logic
  // there are touched. Empty array/group when nothing's been added, which is every application
  // until an admin actually adds a custom field — zero behavior change until then.
  customFieldDefs = signal<FormField[]>([]);
  customFields!: FormGroup;
  needsAttention = signal(false);

  // The personalDetails section's own header list (e.g. "Employment", "Contact") — used only to
  // group/label groupedCustomFields() below; admins manage these in the Form Builder's canvas.
  sectionHeaders = signal<FormSectionHeader[]>([]);

  /** Custom fields grouped into one card per section header, sorted by each header's own
   * `order` and each field's own `order` within it — this is what actually drives what the
   * customer sees, unlike the raw `customFieldDefs()` array order. */
  groupedCustomFields = computed(() => {
    const headers = [...this.sectionHeaders()].sort((a, b) => a.order - b.order);
    const fields = [...this.customFieldDefs()].sort((a, b) => a.order - b.order);
    return headers
      .map((header) => ({ header, fields: fields.filter((f) => f.sectionHeaderKey === header.key) }))
      .filter((group) => group.fields.length > 0);
  });

  headerLabel(header: FormSectionHeader): string {
    if (header.labelKey) return this.i18n.t(header.labelKey);
    if (header.label) return this.i18n.lang() === 'he' ? header.label.he : header.label.en;
    return header.key;
  }

  // All resolved personalDetails fields (existing + custom), keyed for <app-field-help> lookups
  // and for applySchemaFieldRules()'s required/visibility wiring — see both below.
  allFieldDefs = signal<FormField[]>([]);
  private ruleSubs: Subscription[] = [];
  private baseValidators = new Map<AbstractControl, ValidatorFn | null>();

  // A visibility condition can reference a field in *any* section (see form-schema-types.ts's
  // condition engine on the worker, mirrored in dynamic-field.component.ts). `staticValues` is
  // every *other* section's last-saved data, flattened once at load (this component has no live
  // form for those steps, so it can't do better than the snapshot from when this page loaded);
  // `evalContext` overlays that with personalDetails' own live, currently-being-typed values and
  // is what both DynamicFieldComponent and applySchemaFieldRules() evaluate against.
  private staticValues: Record<string, unknown> = {};
  private constants: NamedConstant[] = [];
  evalContext = signal<EvalContext>({ constants: [], values: {} });

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              public identity: EffectiveIdentityService, private router: Router, private i18n: I18nService,
              private notifications: NotificationService) {
    this.customFields = this.fb.group({});
    this.form = this.fb.group({
      firstName:    ['', Validators.required],
      lastName:     ['', Validators.required],
      dateOfBirth:  ['', [Validators.required, yearRangeValidator()]],
      nationalId:   ['', Validators.required],
      idIssueDate:  ['', [Validators.required, yearRangeValidator()]],
      nationality:  ['Israeli', Validators.required],
      maritalStatus:['', Validators.required],
      dependents:   [0, [Validators.required, Validators.min(0)]],
      phoneNumber:  [''],
      email:        ['', Validators.email],
      street:       ['', Validators.required],
      city:         ['', Validators.required],
      postCode:     ['', Validators.required],
      country:      ['Israel', Validators.required],
      monthsAtCurrentAddress: [null, [Validators.min(0)]],
      previousAddresses: this.fb.array([]),
      assistedByStaff: [false],
      preferredBranch: [''],
      staffName: [''],
    }, { validators: idIssueNotBeforeDobValidator() });
    this.applicant2Form = this.fb.group({
      firstName:    [''],
      lastName:     [''],
      dateOfBirth:  ['', yearRangeValidator()],
      nationalId:   [''],
      idIssueDate:  ['', yearRangeValidator()],
      nationality:  ['Israeli'],
      maritalStatus:[''],
      relationshipToApplicant1: [''],
      phoneNumber:  [''],
      email:        ['', Validators.email],
    }, { validators: idIssueNotBeforeDobValidator() });
    this.consentForm = this.fb.group({
      creditBureauConsent:       [false, Validators.requiredTrue],
      pepScreeningConsent:       [false, Validators.requiredTrue],
      sanctionsScreeningConsent: [false, Validators.requiredTrue],
      dataProcessingConsent:     [false, Validators.requiredTrue],
    });

    this.watchIdVerification(this.form, this.nationalIdVerifying, this.nationalIdVerified, true);
    this.watchIdVerification(this.applicant2Form, this.nationalIdVerifying2, this.nationalIdVerified2, false);
  }

  /** Simulated national-ID-database lookup: only "succeeds" once both the ID number and its
   * issue date are well-formed — mirrors a real lookup needing both fields to match a record. */
  private watchIdVerification(group: FormGroup, verifying: WritableSignal<boolean>, verified: WritableSignal<boolean>, isPrimary: boolean): void {
    const check = () => {
      const id = group.get('nationalId')?.value;
      const issueDate = group.get('idIssueDate')?.value;
      const idValid = !!id && /^\d{9}$/.test(id);
      const dateValid = !!issueDate && new Date(issueDate) <= new Date();
      verified.set(false);
      if (idValid && dateValid) {
        verifying.set(true);
        setTimeout(() => {
          verifying.set(false);
          verified.set(true);
          if (isPrimary) this.refreshConsentValidity();
        }, 700);
      } else {
        verifying.set(false);
      }
    };
    group.get('nationalId')!.valueChanges.subscribe(check);
    group.get('idIssueDate')!.valueChanges.subscribe(check);
  }

  /** Consent is recorded in the bank's CMS and is valid for CONSENT_VALIDITY_DAYS. This only ever
   * picks up an *existing* valid consent (e.g. resuming an application) — it never opens the
   * consent modal itself, so identity verification can run silently while the customer is still
   * filling in the rest of the form. The modal is only ever opened explicitly, from saveAndNext(),
   * once the whole form (including address history and branch questions) is complete. */
  private refreshConsentValidity(): void {
    if (this.consentValid()) return;
    const timestamp = this.storedConsent?.consentTimestamp;
    const validUntil = timestamp ? new Date(new Date(timestamp).getTime() + this.CONSENT_VALIDITY_DAYS * 86400000) : null;
    if (validUntil && validUntil > new Date()) {
      this.consentValid.set(true);
      this.consentValidUntil.set(validUntil.toISOString());
    }
  }

  confirmConsent(): void {
    if (this.consentForm.invalid) { this.consentForm.markAllAsTouched(); return; }
    this.consentError.set('');
    const payload = { ...this.consentForm.value, consentTimestamp: new Date().toISOString() };
    this.appSvc.saveSection(this.appRef(), 'consentManagement', payload, this.identity.userId!).subscribe({
      next: () => {
        this.storedConsent = payload;
        const validUntil = new Date(Date.now() + this.CONSENT_VALIDITY_DAYS * 86400000);
        this.consentValid.set(true);
        this.consentValidUntil.set(validUntil.toISOString());
        this.consentRecorded.set(true);
        const userId = this.identity.userId;
        if (userId) {
          this.notifications.create(
            userId,
            this.i18n.t('consent.notifyTitle'),
            this.i18n.t('consent.notifyMessage', { date: validUntil.toLocaleDateString() }),
            'INFO',
            this.appRef()
          ).subscribe();
        }
      },
      error: () => this.consentError.set(this.i18n.t('consent.requiredError'))
    });
  }

  continueAfterConsent(): void {
    this.showConsentModal.set(false);
    this.consentRecorded.set(false);
    this.proceedToSave();
  }

  /** A Banker assisting a customer can't tick consent checkboxes on their behalf — that's the
   * customer's own decision. Instead of the self-service modal, assisting staff see a notice that
   * consent has been requested remotely and can carry on with the rest of the application.
   * DEMO-ONLY: there's no real SMS/email gateway, so this records consent immediately rather than
   * waiting for an actual customer confirmation — a real deployment would poll for that instead. */
  acknowledgeRemoteConsent(): void {
    this.consentError.set('');
    const payload = {
      creditBureauConsent: true,
      pepScreeningConsent: true,
      sanctionsScreeningConsent: true,
      dataProcessingConsent: true,
      consentTimestamp: new Date().toISOString(),
      consentMethod: 'remote-notification',
    };
    this.appSvc.saveSection(this.appRef(), 'consentManagement', payload, this.identity.userId!).subscribe({
      next: () => {
        this.storedConsent = payload;
        this.consentValid.set(true);
        this.consentValidUntil.set(new Date(Date.now() + this.CONSENT_VALIDITY_DAYS * 86400000).toISOString());
        this.showRemoteConsentNotice.set(false);
        this.proceedToSave();
      },
      error: () => this.consentError.set(this.i18n.t('consent.requiredError'))
    });
  }

  get previousAddresses(): FormArray {
    return this.form.get('previousAddresses') as FormArray;
  }

  private buildPreviousAddress(data?: any): FormGroup {
    return this.fb.group({
      street:          [data?.street || '', Validators.required],
      city:            [data?.city || '', Validators.required],
      postCode:        [data?.postCode || '', Validators.required],
      country:         [data?.country || 'Israel', Validators.required],
      monthsAtAddress: [data?.monthsAtAddress ?? null, [Validators.min(0)]],
    });
  }

  get totalAddressMonths(): number {
    const current = Number(this.form.get('monthsAtCurrentAddress')?.value) || 0;
    const previous = this.previousAddresses.controls
      .reduce((sum, c) => sum + (Number(c.get('monthsAtAddress')?.value) || 0), 0);
    return current + previous;
  }

  get needsMoreAddressHistory(): boolean {
    return this.totalAddressMonths < this.ADDRESS_HISTORY_TARGET_MONTHS;
  }

  addPreviousAddress(): void {
    this.previousAddresses.push(this.buildPreviousAddress());
  }

  removePreviousAddress(index: number): void {
    this.previousAddresses.removeAt(index);
  }

  ngOnInit(): void {
    const userId = this.identity.userId;
    const email  = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditable(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        this.readOnly.set(this.identity.isAssisting && !this.appSvc.isEditableStatus(app.status));
        if (app.loanRequirementsJson) {
          const loanReqs = JSON.parse(app.loanRequirementsJson);
          this.numberOfApplicants.set(Number(loanReqs.numberOfApplicants) || 1);
        }
        this.storedConsent = app.consentManagementJson ? JSON.parse(app.consentManagementJson) : null;
        if (app.personalDetailsJson) {
          const data = JSON.parse(app.personalDetailsJson);
          (data.previousAddresses || []).forEach((pa: any) => this.previousAddresses.push(this.buildPreviousAddress(pa)));
          this.form.patchValue(data);
          if (data.applicant2) this.applicant2Form.patchValue(data.applicant2);
        } else {
          const [firstName, ...rest] = (this.identity.userFullName || '').trim().split(/\s+/).filter(Boolean);
          this.form.patchValue({
            firstName: firstName || '',
            lastName: rest.join(' '),
            phoneNumber: this.identity.userPhone,
            email: this.identity.userEmail,
            nationalId: this.identity.userNationalId,
            idIssueDate: this.identity.userIdIssueDate,
          });
        }

        const existingCustomData = app.personalDetailsJson ? JSON.parse(app.personalDetailsJson) : {};
        const personalDetailsSection = app.formSchema?.sections?.find((s: any) => s.key === 'personalDetails');
        const allFields: FormField[] = personalDetailsSection?.fields ?? [];
        this.allFieldDefs.set(allFields);
        this.sectionHeaders.set(personalDetailsSection?.sectionHeaders ?? []);
        this.constants = app.formSchema?.constants ?? [];
        this.staticValues = this.buildStaticValues(app);
        this.setUpCustomFields(allFields, existingCustomData);
        this.applySchemaFieldRules(allFields);
        this.needsAttention.set((app.needsAttentionSections ?? []).includes('personalDetails'));

        if (this.readOnly()) { this.form.disable(); this.applicant2Form.disable(); this.customFields.disable(); }
      }
    });
  }

  /** Builds `customFields` from the resolved form version's personalDetails section, if any admin
   * has added one — see the field on this class for why it's a separate FormGroup. Re-running this
   * on every load (rather than once) is what lets a newly-published required field show up on an
   * in-flight application's very next visit, per lib/sections.ts's needsAttentionSections.
   * Required/visibility-driven validators are layered on afterwards by applySchemaFieldRules() —
   * not set here — so both existing and custom fields go through one shared mechanism. */
  private setUpCustomFields(allFields: FormField[], existingData: Record<string, any>): void {
    const fields = allFields.filter((f) => f.kind === 'custom');
    this.customFieldDefs.set(fields);
    for (const key of Object.keys(this.customFields.controls)) this.customFields.removeControl(key);
    for (const field of fields) {
      const defaultValue = field.type === 'checkbox' ? false : '';
      this.customFields.addControl(field.key, this.fb.control(existingData[field.key] ?? defaultValue));
    }
  }

  fieldDef(key: string): FormField | undefined {
    return this.allFieldDefs().find((f) => f.key === key);
  }

  private resolveControl(key: string): AbstractControl | null {
    return this.form.get(key) ?? this.customFields.get(key);
  }

  /** Every *other* section's last-saved data, flattened once at load into `"sectionKey.fieldKey"`
   * keys — see the class-level comment on `staticValues`/`evalContext`. A section with nothing
   * saved yet contributes no entries, so referencing one of its fields resolves to undefined —
   * which the evaluator already treats as "condition unmet," never an error (this is what makes
   * a rule referencing a later, not-yet-reached wizard step safe). */
  private buildStaticValues(app: any): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const [sectionKey, column] of Object.entries(SECTION_JSON_COLUMNS)) {
      const raw = app[column];
      if (!raw) continue;
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      for (const [fieldKey, value] of Object.entries(data)) {
        values[`${sectionKey}.${fieldKey}`] = value;
      }
    }
    return values;
  }

  /** Overlays `staticValues` with personalDetails' own live, currently-being-typed values (so a
   * same-section condition reacts to typing) and republishes `evalContext` for
   * DynamicFieldComponent and applySchemaFieldRules() to evaluate against. */
  private recomputeEvalContext(): void {
    const values = { ...this.staticValues };
    const live = { ...this.form.getRawValue(), ...this.customFields.getRawValue() };
    for (const [fieldKey, value] of Object.entries(live)) values[`personalDetails.${fieldKey}`] = value;
    this.evalContext.set({ constants: this.constants, values });
  }

  /** Layers schema-driven `required`/`visibility` on top of every existing (hardcoded) and custom
   * field's own validators, for both kinds uniformly — never removing whatever validators a field
   * already had (e.g. firstName's hardcoded Validators.required stays regardless of what the
   * schema says). Recomputed on *any* change to this section's own fields — simpler and more
   * correct than tracking individual trigger controls once a condition can be a tree referencing
   * several fields across several sections; cross-section triggers can't be "live" anyway, since
   * this component has no form for other steps. Mirrors DynamicFieldComponent's isFieldVisible
   * (and worker/src/lib/form-schema-types.ts's isFieldVisible server-side) so the wizard, its own
   * display, and the Admin Form Builder all agree on what "shown only if" means. */
  private applySchemaFieldRules(fields: FormField[]): void {
    this.ruleSubs.forEach((s) => s.unsubscribe());
    this.ruleSubs = [];

    const recomputeAll = () => {
      this.recomputeEvalContext();
      const ctx = this.evalContext();
      for (const field of fields) {
        const control = this.resolveControl(field.key);
        if (!control) continue;
        if (!this.baseValidators.has(control)) {
          this.baseValidators.set(control, control.validator);
        }
        const base = this.baseValidators.get(control) ?? null;
        const applies = field.required && !field.hidden && isFieldVisible(field, 'personalDetails', ctx);
        control.setValidators(applies ? Validators.compose([base, Validators.required]) : base);
        control.updateValueAndValidity({ emitEvent: false });
      }
    };

    this.ruleSubs.push(merge(this.form.valueChanges, this.customFields.valueChanges).subscribe(recomputeAll));
    recomputeAll();
  }

  get isJoint(): boolean {
    return this.numberOfApplicants() === 2;
  }

  staffOptionsForBranch(): string[] {
    return DIGIBANK_BRANCH_STAFF[this.f('preferredBranch')?.value] || [];
  }

  onBranchChange(): void {
    if (!this.staffOptionsForBranch().includes(this.f('staffName')?.value)) {
      this.f('staffName')?.setValue('');
    }
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.customFields.invalid) { this.customFields.markAllAsTouched(); return; }
    this.applicant2Error.set('');
    this.addressHistoryError.set('');
    if (this.needsMoreAddressHistory) {
      this.addressHistoryError.set(this.i18n.t('personal.addressHistoryError'));
      return;
    }
    if (this.isJoint) {
      const a2 = this.applicant2Form.value;
      if (!a2.firstName?.trim() || !a2.lastName?.trim() || !a2.dateOfBirth || !a2.nationalId?.trim()) {
        this.applicant2Error.set(this.i18n.t('personal.applicant2Required'));
        this.applicant2Form.markAllAsTouched();
        return;
      }
    }
    // The whole form (identity, contact, address history, branch questions) is complete at this
    // point — only now do we check whether a valid consent is on file, and interrupt with the
    // consent modal if not. Confirming consent there continues straight on to the actual save.
    this.refreshConsentValidity();
    if (!this.consentValid()) {
      if (this.identity.isAssisting) { this.showRemoteConsentNotice.set(true); return; }
      this.showConsentModal.set(true);
      return;
    }
    this.proceedToSave();
  }

  private proceedToSave(): void {
    this.saving.set(true);
    const payload = { ...this.form.value, ...this.customFields.value, applicant2: this.isJoint ? this.applicant2Form.value : null };
    this.appSvc.saveSection(this.appRef(), 'personalDetails', payload, this.identity.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(this.identity.applyUrl('connect-bank')); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
  f2(name: string) { return this.applicant2Form.get(name); }
  fc(name: string) { return this.consentForm.get(name); }

  optLabel(namespace: string, value: string): string {
    return this.i18n.t(`${namespace}.${value}`);
  }

  get todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
