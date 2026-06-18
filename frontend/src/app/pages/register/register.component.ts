import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { LanguageSwitcherComponent } from '../../shared/language-switcher/language-switcher.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, LanguageSwitcherComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  form: FormGroup;
  loading = signal(false);
  error = signal('');
  showPw = signal(false);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private notifications: NotificationService,
    private router: Router
  ) {
    this.form = this.fb.group({
      fullName:    ['', [Validators.required, Validators.minLength(2)]],
      email:       ['', [Validators.required, Validators.email]],
      phoneNumber: [''],
      password:    ['', [Validators.required, Validators.minLength(8)]],
      confirmPw:   ['', Validators.required],
      agreeTerms:  [false, Validators.requiredTrue],
    }, { validators: this.pwMatch });
  }

  pwMatch(g: AbstractControl) {
    const pw = g.get('password')?.value;
    const cp = g.get('confirmPw')?.value;
    return pw === cp ? null : { mismatch: true };
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set('');

    const { confirmPw, agreeTerms, ...req } = this.form.value;

    this.auth.register(req).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success) {
          const userId = res.data?.userId;
          if (userId) this.notifications.seedWelcome(userId).subscribe();
          this.router.navigate(['/intro']);
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
