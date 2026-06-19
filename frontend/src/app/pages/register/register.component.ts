import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { LanguageSwitcherComponent } from '../../shared/language-switcher/language-switcher.component';
import { BrandLogoComponent } from '../../shared/brand-logo/brand-logo.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, LanguageSwitcherComponent, BrandLogoComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  form: FormGroup;
  loading = signal(false);
  error = signal('');

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group({
      fullName:    ['', [Validators.required, Validators.minLength(2)]],
      email:       ['', [Validators.required, Validators.email]],
      phoneNumber: [''],
      nationalId:  ['', [Validators.required, Validators.pattern(/^\d{9}$/)]],
      idIssueDate: ['', Validators.required],
      agreeTerms:  [false, Validators.requiredTrue],
    });
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set('');

    const { agreeTerms, ...req } = this.form.value;

    this.auth.register(req).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success) {
          this.router.navigate(['/register/verify-otp'], {
            state: { email: res.data.email, demoOtp: res.data.demoOtp, otpExpiresInSeconds: res.data.otpExpiresInSeconds }
          });
        } else {
          this.error.set(res.message || 'Registration failed.');
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'Registration failed. Please try again.');
      }
    });
  }

  f(name: string) { return this.form.get(name); }
}
