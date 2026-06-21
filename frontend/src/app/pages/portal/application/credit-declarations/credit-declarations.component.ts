import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

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

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              private auth: AuthService, private router: Router) {
    this.form = this.fb.group({
      hasDefaulted:   [false, Validators.required],
      hasBankruptcy:  [false, Validators.required],
      hasCCJ:         [false, Validators.required],
      hasPaymentPlan: [false, Validators.required],
    });
    this.applicant2Form = this.fb.group({
      hasDefaulted:   [false],
      hasBankruptcy:  [false],
      hasCCJ:         [false],
      hasPaymentPlan: [false],
    });
  }

  /** Credit score is no longer asked of customers (underwriter-only data) — a simulated bureau
   * score is generated here instead, deterministically seeded so it stays stable across edits to
   * this section. Mirrors the seeded-PRNG "fake it" pattern used elsewhere (DataVerificationService,
   * DashboardComponent.seededRandom). */
  private existingScore: number | null = null;
  private existingScore2: number | null = null;

  private syntheticScore(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return 1 + (h % 9); // 1-9, same range/scale the old self-declared input used
  }

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditable(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.loanRequirementsJson) {
          const loanReqs = JSON.parse(app.loanRequirementsJson);
          this.numberOfApplicants.set(Number(loanReqs.numberOfApplicants) || 1);
        }
        if (app.creditDeclarationsJson) {
          const data = JSON.parse(app.creditDeclarationsJson);
          this.form.patchValue(data);
          this.existingScore = data.creditScore ?? null;
          if (data.applicant2) {
            this.applicant2Form.patchValue(data.applicant2);
            this.existingScore2 = data.applicant2.creditScore ?? null;
          }
        }
      }
    });
  }

  get isJoint(): boolean {
    return this.numberOfApplicants() === 2;
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const creditScore = this.existingScore ?? this.syntheticScore(this.auth.userNationalId || this.appRef());
    const applicant2 = this.isJoint
      ? { ...this.applicant2Form.value, creditScore: this.existingScore2 ?? this.syntheticScore(this.appRef() + '-a2') }
      : null;
    const payload = { ...this.form.value, creditScore, applicant2 };
    this.appSvc.saveSection(this.appRef(), 'creditDeclarations', payload, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/portal/apply/verify-id']); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
  f2(name: string) { return this.applicant2Form.get(name); }
}
