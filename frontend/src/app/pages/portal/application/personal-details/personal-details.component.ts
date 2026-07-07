import { Component, OnInit, signal, WritableSignal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { MARITAL_STATUSES, NATIONALITIES, DIGIBANK_BRANCHES, DIGIBANK_BRANCH_STAFF } from '../../../../core/models';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../../core/i18n/i18n.service';

@Component({
  selector: 'app-personal-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
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

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              public identity: EffectiveIdentityService, private router: Router, private i18n: I18nService,
              private notifications: NotificationService) {
    this.form = this.fb.group({
      firstName:    ['', Validators.required],
      lastName:     ['', Validators.required],
      dateOfBirth:  ['', Validators.required],
      nationalId:   ['', Validators.required],
      idIssueDate:  ['', Validators.required],
      nationality:  ['Israeli', Validators.required],
      maritalStatus:['', Validators.required],
      dependents:   [0, [Validators.required, Validators.min(0)]],
      phoneNumber:  [''],
      email:        ['', Validators.email],
      street:       ['', Validators.required],
      city:         ['', Validators.required],
      postCode:     ['', Validators.required],
      country:      ['Israel', Validators.required],
      monthsAtCurrentAddress: [null, [Validators.required, Validators.min(0)]],
      previousAddresses: this.fb.array([]),
      assistedByStaff: [false],
      preferredBranch: [''],
      staffName: [''],
    });
    this.applicant2Form = this.fb.group({
      firstName:    [''],
      lastName:     [''],
      dateOfBirth:  [''],
      nationalId:   [''],
      idIssueDate:  [''],
      nationality:  ['Israeli'],
      maritalStatus:[''],
      relationshipToApplicant1: [''],
      phoneNumber:  [''],
      email:        ['', Validators.email],
    });
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
      monthsAtAddress: [data?.monthsAtAddress ?? null, [Validators.required, Validators.min(0)]],
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
        if (this.readOnly()) { this.form.disable(); this.applicant2Form.disable(); }
      }
    });
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
    const payload = { ...this.form.value, applicant2: this.isJoint ? this.applicant2Form.value : null };
    this.appSvc.saveSection(this.appRef(), 'personalDetails', payload, this.identity.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(this.identity.applyUrl('connect-bank')); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
  f2(name: string) { return this.applicant2Form.get(name); }
  fc(name: string) { return this.consentForm.get(name); }
}
