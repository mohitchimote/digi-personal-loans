import { Component, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { EMPLOYMENT_STATUSES } from '../../../../core/models';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../../core/i18n/i18n.service';

@Component({
  selector: 'app-income-employment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './income-employment.component.html',
  styleUrl: './income-employment.component.scss'
})
export class IncomeEmploymentComponent implements OnInit {
  form: FormGroup;
  applicant2Form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  readOnly = signal(false);
  numberOfApplicants = signal(1);
  statuses = EMPLOYMENT_STATUSES;
  applicant2Error = signal('');

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              public identity: EffectiveIdentityService, private router: Router, private i18n: I18nService) {
    this.form = this.fb.group({
      employmentStatus:   ['', Validators.required],
      employer:           [''],
      jobTitle:           [''],
      employmentDuration: [''],
      monthlyGrossIncome: [null, [Validators.required, Validators.min(0)]],
      monthlyNetIncome:   [null, [Validators.required, Validators.min(0)]],
      otherIncome:        [0],
      additionalEmployments: this.fb.array([]),
    });
    this.applicant2Form = this.fb.group({
      employmentStatus:   [''],
      employer:           [''],
      jobTitle:           [''],
      employmentDuration: [''],
      monthlyGrossIncome: [null],
      monthlyNetIncome:   [null],
      otherIncome:        [0],
    });
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditable(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        this.readOnly.set(this.identity.isAssisting && !this.appSvc.isEditableStatus(app.status));
        if (app.loanRequirementsJson) {
          const loanReqs = JSON.parse(app.loanRequirementsJson);
          this.numberOfApplicants.set(Number(loanReqs.numberOfApplicants) || 1);
        }
        if (app.incomeEmploymentJson) {
          const data = JSON.parse(app.incomeEmploymentJson);
          if (Array.isArray(data.employments) && data.employments.length) {
            // monthlyGrossIncome/monthlyNetIncome at the top level are saved as totals across all
            // employments (affordability calc reads them flat) — rehydrate employment 1's own
            // figures from the breakdown instead of the total.
            this.form.patchValue({ ...data, ...data.employments[0] });
            data.employments.slice(1).forEach((e: any) => this.additionalEmployments.push(this.buildEmployment(e)));
          } else {
            this.form.patchValue(data);
          }
          if (data.applicant2) this.applicant2Form.patchValue(data.applicant2);
        }
        if (this.readOnly()) { this.form.disable(); this.applicant2Form.disable(); }
      }
    });
  }

  get isJoint(): boolean {
    return this.numberOfApplicants() === 2;
  }

  get additionalEmployments(): FormArray {
    return this.form.get('additionalEmployments') as FormArray;
  }

  private buildEmployment(data?: any): FormGroup {
    return this.fb.group({
      employmentStatus:   [data?.employmentStatus || '', Validators.required],
      employer:           [data?.employer || ''],
      jobTitle:           [data?.jobTitle || ''],
      employmentDuration: [data?.employmentDuration || ''],
      monthlyGrossIncome: [data?.monthlyGrossIncome ?? null, [Validators.required, Validators.min(0)]],
      monthlyNetIncome:   [data?.monthlyNetIncome ?? null, [Validators.required, Validators.min(0)]],
      otherIncome:        [data?.otherIncome ?? 0],
    });
  }

  addEmployment(): void {
    this.additionalEmployments.push(this.buildEmployment());
  }

  removeEmployment(index: number): void {
    this.additionalEmployments.removeAt(index);
  }

  isEmployedAt(group: any): boolean {
    const s = group.get('employmentStatus')?.value;
    return s && !['Retired', 'Unemployed', 'Student'].includes(s);
  }

  get totalGrossIncome(): number {
    const primary = Number(this.f('monthlyGrossIncome')?.value) || 0;
    const extra = this.additionalEmployments.controls.reduce((sum, c) => sum + (Number(c.get('monthlyGrossIncome')?.value) || 0), 0);
    return primary + extra;
  }

  get totalNetIncome(): number {
    const primary = Number(this.f('monthlyNetIncome')?.value) || 0;
    const extra = this.additionalEmployments.controls.reduce((sum, c) => sum + (Number(c.get('monthlyNetIncome')?.value) || 0), 0);
    return primary + extra;
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.applicant2Error.set('');
    if (this.isJoint) {
      const a2 = this.applicant2Form.value;
      if (!a2.employmentStatus || a2.monthlyGrossIncome === null || a2.monthlyNetIncome === null) {
        this.applicant2Error.set(this.i18n.t('income.applicant2Required'));
        this.applicant2Form.markAllAsTouched();
        return;
      }
    }
    this.saving.set(true);
    const formValue = this.form.value;
    const { additionalEmployments, ...employment1 } = formValue;
    const payload = {
      ...employment1,
      monthlyGrossIncome: this.totalGrossIncome,
      monthlyNetIncome: this.totalNetIncome,
      employments: [employment1, ...additionalEmployments],
      applicant2: this.isJoint ? this.applicant2Form.value : null,
    };
    this.appSvc.saveSection(this.appRef(), 'incomeEmployment', payload, this.identity.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(this.identity.applyUrl('outgoings')); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
  f2(name: string) { return this.applicant2Form.get(name); }
  isEmployed(): boolean { const s = this.f('employmentStatus')?.value; return s && !['Retired','Unemployed','Student'].includes(s); }
  isEmployed2(): boolean { const s = this.f2('employmentStatus')?.value; return s && !['Retired','Unemployed','Student'].includes(s); }
}
