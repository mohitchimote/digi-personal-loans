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
  readOnly = signal(false);

  /** DEMO-ONLY: director credit score is underwriter-only data a real D&B pull would populate.
   * Previously shown to the customer as an editable slider, which confused SME demo audiences —
   * fixed in the background instead so every demo application lands in the same good-credit STP
   * path (dnbScoreToLenderGrade(85) clears AffordabilityRules.minCreditScore comfortably and maps
   * to D&B Risk Class 1, the lowest-risk bracket), never surfaced to the customer at all. */
  readonly DIRECTOR_CREDIT_SCORE = 85;

  constructor(private fb: FormBuilder, private appSvc: ApplicationService, public identity: EffectiveIdentityService, private router: Router) {
    this.form = this.fb.group({
      hasLiquidationOrWindingUp: [false, Validators.required],
      hasCompanyDefaulted:       [false, Validators.required],
      hasCCJ:                    [false, Validators.required],
      directorCreditScore:       [this.DIRECTOR_CREDIT_SCORE, [Validators.required, Validators.min(1), Validators.max(100)]],
    });
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        this.readOnly.set(this.identity.isAssisting && !this.appSvc.isEditableStatus(app.status));
        const data = app.businessCreditDeclarationsJson ? JSON.parse(app.businessCreditDeclarationsJson) : null;
        this.form.patchValue({ ...data, directorCreditScore: this.DIRECTOR_CREDIT_SCORE });
        if (this.readOnly()) this.form.disable();
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
