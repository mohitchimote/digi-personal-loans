import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
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

  constructor(private fb: FormBuilder, private appSvc: ApplicationService, private auth: AuthService, private router: Router) {
    this.form = this.fb.group({
      existingBusinessDebtService: [0, [Validators.required, Validators.min(0)]],
      monthlyLeaseRent:            [0, [Validators.required, Validators.min(0)]],
      monthlyPayroll:              [0, [Validators.required, Validators.min(0)]],
      monthlySupplierPayments:     [0, [Validators.required, Validators.min(0)]],
    });
  }

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.businessOutgoingsJson) this.form.patchValue(JSON.parse(app.businessOutgoingsJson));
      }
    });
  }

  f(name: string) { return this.form.get(name); }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'businessOutgoings', this.form.value, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/business/apply/credit-declarations']); },
      error: () => this.saving.set(false)
    });
  }
}
