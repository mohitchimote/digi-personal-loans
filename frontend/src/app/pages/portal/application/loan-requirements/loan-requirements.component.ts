import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { LOAN_PURPOSES } from '../../../../core/models';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-loan-requirements',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './loan-requirements.component.html',
  styleUrl: './loan-requirements.component.scss'
})
export class LoanRequirementsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  readOnly = signal(false);
  purposes = LOAN_PURPOSES;

  constructor(
    private fb: FormBuilder,
    private appSvc: ApplicationService,
    public identity: EffectiveIdentityService,
    private router: Router
  ) {
    this.form = this.fb.group({
      loanAmount:            [50000, [Validators.required, Validators.min(5000), Validators.max(300000)]],
      loanPurpose:           ['', Validators.required],
      loanTerm:              [36, [Validators.required, Validators.min(6), Validators.max(84)]],
      numberOfApplicants:    [1, Validators.required],
    });
  }

  onAmountSlide(value: string): void {
    this.form.patchValue({ loanAmount: Number(value) });
  }

  onTermSlide(value: string): void {
    this.form.patchValue({ loanTerm: Number(value) });
  }

  ngOnInit(): void {
    const userId = this.identity.userId;
    const email  = this.identity.userEmail;
    if (!userId || !email) return;

    this.appSvc.resolveEditable(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        this.readOnly.set(this.identity.isAssisting && !this.appSvc.isEditableStatus(app.status));
        if (this.readOnly()) this.form.disable();
        if (app.loanRequirementsJson) {
          this.form.patchValue(JSON.parse(app.loanRequirementsJson));
        }
      }
    });
  }

  get monthlyPayment(): number {
    const amt  = this.form.value.loanAmount || 0;
    const term = this.form.value.loanTerm || 12;
    if (!amt || !term) return 0;
    const r = 0.055 / 12;
    return Math.round(amt * r * Math.pow(1 + r, term) / (Math.pow(1 + r, term) - 1));
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);

    this.appSvc.saveSection(this.appRef(), 'loanRequirements', this.form.value, this.identity.userId!).subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(this.identity.applyUrl('personal-details'));
      },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
}
