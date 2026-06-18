import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-outgoings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './outgoings.component.html',
  styleUrl: './outgoings.component.scss'
})
export class OutgoingsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              private auth: AuthService, private router: Router) {
    this.form = this.fb.group({
      monthlyRent:               [0, [Validators.required, Validators.min(0)]],
      monthlyMortgage:           [0, [Validators.required, Validators.min(0)]],
      monthlyLoans:              [0, [Validators.required, Validators.min(0)]],
      creditCardPayments:        [0, [Validators.required, Validators.min(0)]],
      otherMonthlyCommitments:   [0, [Validators.required, Validators.min(0)]],
      monthlyLivingExpenses:     [null, [Validators.required, Validators.min(0)]],
    });
  }

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.startOrResume(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.outgoingsJson) this.form.patchValue(JSON.parse(app.outgoingsJson));
      }
    });
  }

  get totalOutgoings(): number {
    const v = this.form.value;
    return (v.monthlyRent || 0) + (v.monthlyMortgage || 0) + (v.monthlyLoans || 0)
         + (v.creditCardPayments || 0) + (v.otherMonthlyCommitments || 0) + (v.monthlyLivingExpenses || 0);
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'outgoings', this.form.value, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/portal/apply/credit-declarations']); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
}
