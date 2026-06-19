import { Component, OnInit, signal, WritableSignal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { MARITAL_STATUSES, NATIONALITIES } from '../../../../core/models';
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
  numberOfApplicants = signal(1);
  maritalStatuses = MARITAL_STATUSES;
  nationalities = NATIONALITIES;
  applicant2Error = signal('');
  addressHistoryError = signal('');

  readonly ADDRESS_HISTORY_TARGET_MONTHS = 36;

  nationalIdVerifying = signal(false);
  nationalIdVerified = signal(false);
  nationalIdVerifying2 = signal(false);
  nationalIdVerified2 = signal(false);

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              private auth: AuthService, private router: Router, private i18n: I18nService) {
    this.form = this.fb.group({
      firstName:    ['', Validators.required],
      lastName:     ['', Validators.required],
      dateOfBirth:  ['', Validators.required],
      nationalId:   ['', Validators.required],
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
    });
    this.applicant2Form = this.fb.group({
      firstName:    [''],
      lastName:     [''],
      dateOfBirth:  [''],
      nationalId:   [''],
      nationality:  ['Israeli'],
      maritalStatus:[''],
      relationshipToApplicant1: [''],
      phoneNumber:  [''],
      email:        ['', Validators.email],
    });

    this.watchNationalId(this.form.get('nationalId')!, this.nationalIdVerifying, this.nationalIdVerified);
    this.watchNationalId(this.applicant2Form.get('nationalId')!, this.nationalIdVerifying2, this.nationalIdVerified2);
  }

  private watchNationalId(control: any, verifying: WritableSignal<boolean>, verified: WritableSignal<boolean>): void {
    control.valueChanges.subscribe((value: string) => {
      verified.set(false);
      if (value && /^\d{9}$/.test(value)) {
        verifying.set(true);
        setTimeout(() => {
          verifying.set(false);
          verified.set(true);
        }, 700);
      } else {
        verifying.set(false);
      }
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
    const userId = this.auth.userId;
    const email  = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditable(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.loanRequirementsJson) {
          const loanReqs = JSON.parse(app.loanRequirementsJson);
          this.numberOfApplicants.set(Number(loanReqs.numberOfApplicants) || 1);
        }
        if (app.personalDetailsJson) {
          const data = JSON.parse(app.personalDetailsJson);
          (data.previousAddresses || []).forEach((pa: any) => this.previousAddresses.push(this.buildPreviousAddress(pa)));
          this.form.patchValue(data);
          if (data.applicant2) this.applicant2Form.patchValue(data.applicant2);
        } else {
          this.form.patchValue({ phoneNumber: this.auth.userPhone, email: this.auth.userEmail });
        }
      }
    });
  }

  get isJoint(): boolean {
    return this.numberOfApplicants() === 2;
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
    this.saving.set(true);
    const payload = { ...this.form.value, applicant2: this.isJoint ? this.applicant2Form.value : null };
    this.appSvc.saveSection(this.appRef(), 'personalDetails', payload, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/portal/apply/connect-bank']); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
  f2(name: string) { return this.applicant2Form.get(name); }
}
