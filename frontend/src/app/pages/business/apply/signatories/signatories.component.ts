import { Component, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../../core/i18n/i18n.service';

/** Directors/UBOs (Ultimate Beneficial Owners) — at least one signatory required, defaults to the
 * authorized signatory who is logged in (mirrors how personalDetails prefills from registration). */
@Component({
  selector: 'app-signatories',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './signatories.component.html',
  styleUrl: './signatories.component.scss'
})
export class SignatoriesComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  readOnly = signal(false);

  readonly CONSENT_VALIDITY_DAYS = 90;
  consentForm: FormGroup;
  consentValid = signal(false);
  consentValidUntil = signal<string | null>(null);
  showConsentModal = signal(false);
  consentRecorded = signal(false);
  consentError = signal('');
  private storedConsent: any = null;

  constructor(
    private fb: FormBuilder,
    private appSvc: ApplicationService,
    public identity: EffectiveIdentityService,
    private router: Router,
    private i18n: I18nService,
    private notifications: NotificationService
  ) {
    this.form = this.fb.group({ signatories: this.fb.array([]) });
    this.consentForm = this.fb.group({
      creditBureauConsent:       [false, Validators.requiredTrue],
      pepScreeningConsent:       [false, Validators.requiredTrue],
      sanctionsScreeningConsent: [false, Validators.requiredTrue],
      dataProcessingConsent:     [false, Validators.requiredTrue],
    });
  }

  get signatories(): FormArray { return this.form.get('signatories') as FormArray; }

  private newSignatory(primary = false): FormGroup {
    return this.fb.group({
      fullName: ['', Validators.required],
      nationalId: ['', [Validators.required, Validators.pattern(/^\d{9}$/)]],
      title: ['', Validators.required],
      ownershipPercentage: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
      primarySignatory: [primary],
    });
  }

  addSignatory(): void {
    this.signatories.push(this.newSignatory());
  }

  removeSignatory(i: number): void {
    if (this.signatories.length > 1) this.signatories.removeAt(i);
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        this.readOnly.set(this.identity.isAssisting && !this.appSvc.isEditableStatus(app.status));
        this.storedConsent = app.consentManagementJson ? JSON.parse(app.consentManagementJson) : null;
        if (app.signatoriesJson) {
          const data = JSON.parse(app.signatoriesJson);
          (data.signatories || []).forEach((s: any) => {
            const group = this.newSignatory(s.primarySignatory);
            group.patchValue(s);
            this.signatories.push(group);
          });
        }
        if (this.signatories.length === 0) {
          const primary = this.newSignatory(true);
          primary.patchValue({ fullName: this.identity.userFullName || '', nationalId: this.identity.userNationalId || '' });
          this.signatories.push(primary);
        }
        if (this.readOnly()) this.form.disable();
      }
    });
  }

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

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.refreshConsentValidity();
    if (!this.consentValid()) {
      this.showConsentModal.set(true);
      return;
    }
    this.proceedToSave();
  }

  private proceedToSave(): void {
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'signatories', this.form.value, this.identity.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(this.identity.applyUrl('connect-bank', true)); },
      error: () => this.saving.set(false)
    });
  }
}
