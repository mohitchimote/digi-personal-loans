import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

/** Business equivalent of IncomeEmploymentComponent — turnover/revenue replaces salary. */
@Component({
  selector: 'app-financials',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './financials.component.html',
  styleUrl: './financials.component.scss'
})
export class FinancialsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');

  constructor(private fb: FormBuilder, private appSvc: ApplicationService, private identity: EffectiveIdentityService, private router: Router) {
    this.form = this.fb.group({
      annualTurnover:   [null, [Validators.required, Validators.min(0)]],
      monthlyRevenue:   [null, [Validators.required, Validators.min(0)]],
      netProfitMargin:  [null, [Validators.required, Validators.min(0), Validators.max(100)]],
      yearsTrading:     [null, [Validators.required, Validators.min(0)]],
      employeeCount:    [null, [Validators.required, Validators.min(0)]],
    });
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting ? '/banker/case' : undefined).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.businessFinancialsJson) this.form.patchValue(JSON.parse(app.businessFinancialsJson));
      }
    });
  }

  f(name: string) { return this.form.get(name); }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'businessFinancials', this.form.value, this.identity.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(this.identity.applyUrl('outgoings', true)); },
      error: () => this.saving.set(false)
    });
  }
}
