import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-credit-declarations',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './credit-declarations.component.html',
  styleUrl: './credit-declarations.component.scss'
})
export class CreditDeclarationsComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');

  constructor(private fb: FormBuilder, private appSvc: ApplicationService,
              private auth: AuthService, private router: Router) {
    this.form = this.fb.group({
      hasDefaulted:   [false, Validators.required],
      hasBankruptcy:  [false, Validators.required],
      hasCCJ:         [false, Validators.required],
      hasPaymentPlan: [false, Validators.required],
      creditScore:    [700, [Validators.required, Validators.min(300), Validators.max(850)]],
    });
  }

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.startOrResume(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.creditDeclarationsJson) this.form.patchValue(JSON.parse(app.creditDeclarationsJson));
      }
    });
  }

  scoreCategory(): string {
    const s = this.form.value.creditScore || 0;
    if (s >= 750) return 'Excellent';
    if (s >= 700) return 'Good';
    if (s >= 650) return 'Fair';
    if (s >= 580) return 'Poor';
    return 'Very Poor';
  }

  scoreColor(): string {
    const s = this.form.value.creditScore || 0;
    if (s >= 700) return 'var(--success)';
    if (s >= 580) return 'var(--warning)';
    return 'var(--error)';
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.appSvc.saveSection(this.appRef(), 'creditDeclarations', this.form.value, this.auth.userId!).subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/portal/apply/review-submit']); },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
}
