import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-business-credit-declarations',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './business-credit-declarations.component.html',
  styleUrl: './business-credit-declarations.component.scss'
})
export class BusinessCreditDeclarationsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');

  constructor(private fb: FormBuilder, private appSvc: ApplicationService, private identity: EffectiveIdentityService, private router: Router) {
    this.form = this.fb.group({
      hasLiquidationOrWindingUp: [false, Validators.required],
      hasCompanyDefaulted:       [false, Validators.required],
      hasCCJ:                    [false, Validators.required],
      directorCreditScore:       [65, [Validators.required, Validators.min(1), Validators.max(100)]],
    });
  }

  /** DEMO-ONLY: director credit score is normally underwriter-only data (a simulated bureau score).
   * Surfaced here as an editable input so a presenter can dial it up/down to show the
   * approval/decline (and "no eligible products") paths live. Scale is a Dun & Bradstreet-style
   * Commercial Delinquency Score (1-100, higher = lower risk) — the internal 1-9 lender risk grade
   * and D&B Risk Class used by eligibility/affordability logic are derived from this via
   * dnbScoreToLenderGrade()/dnbScoreToRiskClass(), underwriter-only, never shown here. In a real
   * deployment this input would be removed again and the synthetic default would apply unconditionally. */
  private syntheticScore(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return 1 + (h % 100); // 1-100, D&B Delinquency Score-style range
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting ? '/banker/case' : undefined).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        const data = app.businessCreditDeclarationsJson ? JSON.parse(app.businessCreditDeclarationsJson) : null;
        this.form.patchValue({
          ...data,
          directorCreditScore: data?.directorCreditScore ?? this.syntheticScore(this.identity.userNationalId || app.applicationRef),
        });
      }
    });
  }

  f(name: string) { return this.form.get(name); }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const payload = this.form.value;
    this.appSvc.saveSection(this.appRef(), 'businessCreditDeclarations', payload, this.identity.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(this.identity.applyUrl('verify-id', true)); },
      error: () => this.saving.set(false)
    });
  }
}
