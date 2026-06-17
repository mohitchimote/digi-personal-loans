import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { EMPLOYMENT_STATUSES } from '../../../../core/models';

@Component({
  selector: 'app-income-employment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './income-employment.component.html',
  styleUrl: './income-employment.component.scss'
})
export class IncomeEmploymentComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  statuses = EMPLOYMENT_STATUSES;

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              private auth: AuthService, private router: Router) {
    this.form = this.fb.group({
      employmentStatus:   ['', Validators.required],
      employer:           [''],
      jobTitle:           [''],
      employmentDuration: [''],
      monthlyGrossIncome: [null, [Validators.required, Validators.min(0)]],
      monthlyNetIncome:   [null, [Validators.required, Validators.min(0)]],
      otherIncome:        [0],
    });
  }

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.startOrResume(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.incomeEmploymentJson) this.form.patchValue(JSON.parse(app.incomeEmploymentJson));
      }
    });
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'incomeEmployment', this.form.value, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/portal/apply/outgoings']); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
  isEmployed(): boolean { const s = this.f('employmentStatus')?.value; return s && !['Retired','Unemployed','Student'].includes(s); }
}
