import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { LanguageSwitcherComponent } from '../../shared/language-switcher/language-switcher.component';
import { BrandLogoComponent } from '../../shared/brand-logo/brand-logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, LanguageSwitcherComponent, BrandLogoComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  form: FormGroup;
  loading = signal(false);
  error = signal('');

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router) {
    this.form = this.fb.group({
      nationalId: ['', [Validators.required, Validators.pattern(/^\d{9}$/)]],
    });
    // Set by the 401 interceptor (session-expired.interceptor.ts) via AuthService.logout()'s
    // router state — history.state survives the navigation but not a later reload, which is the
    // desired behavior (don't keep re-showing a stale expiry message).
    const message = (history.state as { message?: string })?.message;
    if (message) this.error.set(message);
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set('');

    this.auth.requestLoginOtp(this.form.value).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success) {
          this.router.navigate(['/login/verify-otp'], {
            state: { nationalId: res.data.nationalId, demoOtp: res.data.demoOtp, otpExpiresInSeconds: res.data.otpExpiresInSeconds }
          });
        } else {
          this.error.set(res.message || 'Login failed.');
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'No account found for this National ID.');
      }
    });
  }

  f(name: string) { return this.form.get(name); }
}
