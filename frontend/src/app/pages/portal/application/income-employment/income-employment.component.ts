import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
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
  numberOfApplicants = signal(1);
  statuses = EMPLOYMENT_STATUSES;
  applicant2Error = signal('');

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              private auth: AuthService, private router: Router, private i18n: I18nService) {
    this.form = this.fb.group({
      employmentStatus:   ['', Validators.required],
      employer:           [''],
      jobTitle:           [''],
      employmentDuration: [''],
      monthlyGrossIncome: [null, [Validators.required, Validators.min(0)]],
      monthlyNetIncome:   [null, [Validators.required, Validators.min(0)]],
      otherIncome:        [0],
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
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.startOrResume(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.loanRequirementsJson) {
          const loanReqs = JSON.parse(app.loanRequirementsJson);
          this.numberOfApplicants.set(Number(loanReqs.numberOfApplicants) || 1);
        }
        if (app.incomeEmploymentJson) {
          const data = JSON.parse(app.incomeEmploymentJson);
          this.form.patchValue(data);
          if (data.applicant2) this.applicant2Form.patchValue(data.applicant2);
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
    if (this.isJoint) {
      const a2 = this.applicant2Form.value;
      if (!a2.employmentStatus || a2.monthlyGrossIncome === null || a2.monthlyNetIncome === null) {
        this.applicant2Error.set(this.i18n.t('income.applicant2Required'));
        this.applicant2Form.markAllAsTouched();
        return;
      }
    }
    this.saving.set(true);
    const payload = { ...this.form.value, applicant2: this.isJoint ? this.applicant2Form.value : null };
    this.appSvc.saveSection(this.appRef(), 'incomeEmployment', payload, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/portal/apply/outgoings']); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
  f2(name: string) { return this.applicant2Form.get(name); }
  isEmployed(): boolean { const s = this.f('employmentStatus')?.value; return s && !['Retired','Unemployed','Student'].includes(s); }
  isEmployed2(): boolean { const s = this.f2('employmentStatus')?.value; return s && !['Retired','Unemployed','Student'].includes(s); }
}
