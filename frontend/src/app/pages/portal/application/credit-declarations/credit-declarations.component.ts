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
  readOnly = signal(false);
  numberOfApplicants = signal(1);

  /** DEMO-ONLY: credit score is underwriter-only data a real bureau pull would populate. Customers
   * were previously shown an editable slider for this, which confused SME demo audiences ("why can
   * I set my own credit score?") — fixed in the background instead so every demo application lands
   * in the same good-credit STP path (ficoToLenderGrade(770/750) both clear
   * AffordabilityRules.minCreditScore comfortably), never surfaced to the customer at all. */
  readonly PRIMARY_CREDIT_SCORE = 770;
  readonly SECONDARY_CREDIT_SCORE = 750;

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              public identity: EffectiveIdentityService, private router: Router) {
    this.form = this.fb.group({
      hasDefaulted:   [false, Validators.required],
      hasBankruptcy:  [false, Validators.required],
      hasCCJ:         [false, Validators.required],
      hasPaymentPlan: [false, Validators.required],
      creditScore:    [this.PRIMARY_CREDIT_SCORE, [Validators.required, Validators.min(300), Validators.max(850)]],
    });
    this.applicant2Form = this.fb.group({
      hasDefaulted:   [false],
      hasBankruptcy:  [false],
      hasCCJ:         [false],
      hasPaymentPlan: [false],
      creditScore:    [this.SECONDARY_CREDIT_SCORE, [Validators.min(300), Validators.max(850)]],
    });
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditable(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        this.readOnly.set(this.identity.isAssisting && !this.appSvc.isEditableStatus(app.status));
        if (this.readOnly()) { this.form.disable(); this.applicant2Form.disable(); }
        if (app.loanRequirementsJson) {
          const loanReqs = JSON.parse(app.loanRequirementsJson);
          this.numberOfApplicants.set(Number(loanReqs.numberOfApplicants) || 1);
        }
        const data = app.creditDeclarationsJson ? JSON.parse(app.creditDeclarationsJson) : null;
        this.form.patchValue({ ...data, creditScore: this.PRIMARY_CREDIT_SCORE });
        this.applicant2Form.patchValue({ ...data?.applicant2, creditScore: this.SECONDARY_CREDIT_SCORE });
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
