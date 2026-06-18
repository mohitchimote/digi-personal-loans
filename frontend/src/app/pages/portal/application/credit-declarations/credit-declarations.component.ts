import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../../core/i18n/i18n.service';

@Component({
  selector: 'app-credit-declarations',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './credit-declarations.component.html',
  styleUrl: './credit-declarations.component.scss'
})
export class CreditDeclarationsComponent implements OnInit {
  form: FormGroup;
  applicant2Form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  numberOfApplicants = signal(1);
  applicant2Error = signal('');

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              private auth: AuthService, private router: Router, private i18n: I18nService) {
    this.form = this.fb.group({
      hasDefaulted:   [false, Validators.required],
      hasBankruptcy:  [false, Validators.required],
      hasCCJ:         [false, Validators.required],
      hasPaymentPlan: [false, Validators.required],
      creditScore:    [700, [Validators.required, Validators.min(300), Validators.max(850)]],
    });
    this.applicant2Form = this.fb.group({
      hasDefaulted:   [false],
      hasBankruptcy:  [false],
      hasCCJ:         [false],
      hasPaymentPlan: [false],
      creditScore:    [null],
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
        if (app.creditDeclarationsJson) {
          const data = JSON.parse(app.creditDeclarationsJson);
          this.form.patchValue(data);
          if (data.applicant2) this.applicant2Form.patchValue(data.applicant2);
        }
      }
    });
  }

  get isJoint(): boolean {
    return this.numberOfApplicants() === 2;
  }

  scoreCategory(score: number): string {
    const s = score || 0;
    if (s >= 750) return 'Excellent';
    if (s >= 700) return 'Good';
    if (s >= 650) return 'Fair';
    if (s >= 580) return 'Poor';
    return 'Very Poor';
  }

  scoreColor(score: number): string {
    const s = score || 0;
    if (s >= 700) return 'var(--success)';
    if (s >= 580) return 'var(--warning)';
    return 'var(--error)';
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.applicant2Error.set('');
    if (this.isJoint && !this.applicant2Form.value.creditScore) {
      this.applicant2Error.set(this.i18n.t('credit.applicant2Required'));
      this.applicant2Form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const payload = { ...this.form.value, applicant2: this.isJoint ? this.applicant2Form.value : null };
    this.appSvc.saveSection(this.appRef(), 'creditDeclarations', payload, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/portal/apply/verify-id']); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
  f2(name: string) { return this.applicant2Form.get(name); }
}
