import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { LanguageSwitcherComponent } from '../../../shared/language-switcher/language-switcher.component';
import { BrandLogoComponent } from '../../../shared/brand-logo/brand-logo.component';

@Component({
  selector: 'app-login-verify-otp',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, LanguageSwitcherComponent, BrandLogoComponent],
  templateUrl: './login-verify-otp.component.html',
  styleUrl: '../login.component.scss'
})
export class LoginVerifyOtpComponent {
  nationalId = '';
  demoOtp = signal('');
  otp = '';
  loading = signal(false);
  resending = signal(false);
  error = signal('');

  constructor(
    private auth: AuthService,
    private router: Router
  ) {
    const state = this.router.getCurrentNavigation()?.extras.state as
      { nationalId?: string; demoOtp?: string } | undefined;
    if (!state?.nationalId) {
      this.router.navigate(['/login']);
      return;
    }
    this.nationalId = state.nationalId;
    this.demoOtp.set(state.demoOtp || '');
  }

  verify(): void {
    if (!this.otp || this.otp.length !== 6) { this.error.set('Please enter the 6-digit code.'); return; }
    this.loading.set(true);
    this.error.set('');

    this.auth.verifyLoginOtp({ nationalId: this.nationalId, otp: this.otp }).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success) {
          const dest = this.auth.isAdmin ? '/admin/users'
            : this.auth.isUnderwriter ? '/underwriter/pipeline'
            : this.auth.isBanker ? '/banker/queue'
            : this.auth.isBusinessOwner ? '/business/dashboard'
            : '/portal/dashboard';
          this.router.navigate([dest]);
        } else {
          this.error.set(res.message || 'Verification failed.');
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.error?.message || 'Verification failed. Please try again.');
      }
    });
  }

  resend(): void {
    this.resending.set(true);
    this.error.set('');
    this.auth.requestLoginOtp({ nationalId: this.nationalId }).subscribe({
      next: res => {
        this.resending.set(false);
        if (res.success) {
          this.demoOtp.set(res.data.demoOtp);
        } else {
          this.error.set(res.message || 'Could not resend code.');
        }
      },
      error: err => {
        this.resending.set(false);
        this.error.set(err.error?.message || 'Could not resend code. Please try again.');
      }
    });
  }
}
