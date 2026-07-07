import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-business-outgoings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './business-outgoings.component.html',
  styleUrl: './business-outgoings.component.scss'
})
export class BusinessOutgoingsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');
  readOnly = signal(false);

  constructor(private fb: FormBuilder, private appSvc: ApplicationService, public identity: EffectiveIdentityService, private router: Router) {
    this.form = this.fb.group({
      existingBusinessDebtService: [0, [Validators.required, Validators.min(0)]],
      monthlyLeaseRent:            [0, [Validators.required, Validators.min(0)]],
      monthlyPayroll:              [0, [Validators.required, Validators.min(0)]],
      monthlySupplierPayments:     [0, [Validators.required, Validators.min(0)]],
    });
  }

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        this.readOnly.set(this.identity.isAssisting && !this.appSvc.isEditableStatus(app.status));
        if (this.readOnly()) this.form.disable();
        if (app.businessOutgoingsJson) this.form.patchValue(JSON.parse(app.businessOutgoingsJson));
      }
    });
  }

  f(name: string) { return this.form.get(name); }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'businessOutgoings', this.form.value, this.identity.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(this.identity.applyUrl('credit-declarations', true)); },
      error: () => this.saving.set(false)
    });
  }
}
