import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
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
              public identity: EffectiveIdentityService, private router: Router) {
    this.form = this.fb.group({
      hasDefaulted:   [false, Validators.required],
      hasBankruptcy:  [false, Validators.required],
      hasCCJ:         [false, Validators.required],
      hasPaymentPlan: [false, Validators.required],
      creditScore:    [650, [Validators.required, Validators.min(300), Validators.max(850)]],
    });
    this.applicant2Form = this.fb.group({
      hasDefaulted:   [false],
      hasBankruptcy:  [false],
      hasCCJ:         [false],
      hasPaymentPlan: [false],
      creditScore:    [650, [Validators.min(300), Validators.max(850)]],
    });
  }

  /** DEMO-ONLY: credit score is normally underwriter-only data (a simulated bureau score, seeded
   * so it's stable across edits — same "fake it" pattern as DataVerificationService). For this demo
   * we surface it as an editable input so a presenter can dial it up/down to show the
   * approval/decline paths live. In a real deployment this input would be removed again and the
   * synthetic default below would apply unconditionally. Scale is a FICO-style bureau score
   * (300-850) — the internal 1-9 lender risk grade used by eligibility/affordability logic is
   * derived from this via ficoToLenderGrade(), underwriter-only, never shown here. */
  private syntheticScore(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return 300 + (h % 551); // 300-850, FICO-style range
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditable(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting ? '/banker/case' : undefined).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.loanRequirementsJson) {
          const loanReqs = JSON.parse(app.loanRequirementsJson);
          this.numberOfApplicants.set(Number(loanReqs.numberOfApplicants) || 1);
        }
        const data = app.creditDeclarationsJson ? JSON.parse(app.creditDeclarationsJson) : null;
        this.form.patchValue({
          ...data,
          creditScore: data?.creditScore ?? this.syntheticScore(this.identity.userNationalId || app.applicationRef),
        });
        this.applicant2Form.patchValue({
          ...data?.applicant2,
          creditScore: data?.applicant2?.creditScore ?? this.syntheticScore(app.applicationRef + '-a2'),
        });
      }
    });
  }

  get isJoint(): boolean {
    return this.numberOfApplicants() === 2;
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const applicant2 = this.isJoint ? this.applicant2Form.value : null;
    const payload = { ...this.form.value, applicant2 };
    this.appSvc.saveSection(this.appRef(), 'creditDeclarations', payload, this.identity.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(this.identity.applyUrl('verify-id')); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
  f2(name: string) { return this.applicant2Form.get(name); }
}
