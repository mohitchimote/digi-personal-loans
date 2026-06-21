import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { LanguageSwitcherComponent } from '../../../shared/language-switcher/language-switcher.component';
import { BrandLogoComponent } from '../../../shared/brand-logo/brand-logo.component';

@Component({
  selector: 'app-verify-otp',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, LanguageSwitcherComponent, BrandLogoComponent],
  templateUrl: './verify-otp.component.html',
  styleUrl: '../register.component.scss'
})
export class VerifyOtpComponent {
  email = '';
  demoOtp = signal('');
  otp = '';
  loading = signal(false);
  resending = signal(false);
  error = signal('');

  constructor(
    private auth: AuthService,
    private notifications: NotificationService,
    private router: Router
  ) {
    const state = this.router.getCurrentNavigation()?.extras.state as
      { email?: string; demoOtp?: string } | undefined;
    if (!state?.email) {
      this.router.navigate(['/register']);
      return;
    }
    this.email = state.email;
    this.demoOtp.set(state.demoOtp || '');
  }

  verify(): void {
    if (!this.otp || this.otp.length !== 6) { this.error.set('Please enter the 6-digit code.'); return; }
    this.loading.set(true);
    this.error.set('');

    this.auth.verifyOtp({ email: this.email, otp: this.otp }).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success) {
          const userId = res.data?.userId;
          if (userId) this.notifications.seedWelcome(userId).subscribe();
          this.router.navigate([this.auth.isBusinessOwner ? '/business/dashboard' : '/intro']);
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
    this.auth.resendOtp(this.email).subscribe({
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
