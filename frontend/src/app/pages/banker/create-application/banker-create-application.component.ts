import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { ApplicationService } from '../../../core/services/application.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

/** Banker-initiated application creation — for customers who called/walked in but can't (or
 * haven't yet) self-registered. Creates a pre-verified account (see AuthService.registerByStaff)
 * then immediately starts a DRAFT application, landing the Banker straight in the case editor to
 * fill it in on the call. The customer can later log in with the same National ID + OTP to check
 * progress or upload documents themselves. */
@Component({
  selector: 'app-banker-create-application',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './banker-create-application.component.html',
  styleUrl: './banker-create-application.component.scss'
})
export class BankerCreateApplicationComponent {
  form: FormGroup;
  loading = signal(false);
  error = signal('');

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private appSvc: ApplicationService,
    private router: Router,
    private i18n: I18nService
  ) {
    this.form = this.fb.group({
      accountType: ['PERSONAL' as 'PERSONAL' | 'BUSINESS'],
      companyName: [''],
      companyRegistrationNumber: [''],
      companyIndustry: [''],
      companyFoundedYear: [null],
      fullName:    ['', [Validators.required, Validators.minLength(2)]],
      email:       ['', [Validators.required, Validators.email]],
      phoneNumber: [''],
      nationalId:  ['', [Validators.required, Validators.pattern(/^\d{9}$/)]],
      idIssueDate: ['', Validators.required],
    });

    this.form.get('accountType')!.valueChanges.subscribe(type => this.applyAccountTypeValidators(type));
    this.applyAccountTypeValidators('PERSONAL');
  }

  get isBusiness(): boolean {
    return this.form.get('accountType')?.value === 'BUSINESS';
  }

  setAccountType(type: 'PERSONAL' | 'BUSINESS'): void {
    this.form.get('accountType')!.setValue(type);
  }

  private applyAccountTypeValidators(type: 'PERSONAL' | 'BUSINESS'): void {
    const companyName = this.form.get('companyName')!;
    const companyRegistrationNumber = this.form.get('companyRegistrationNumber')!;
    if (type === 'BUSINESS') {
      companyName.setValidators([Validators.required]);
      companyRegistrationNumber.setValidators([Validators.required]);
    } else {
      companyName.clearValidators();
      companyRegistrationNumber.clearValidators();
    }
    companyName.updateValueAndValidity();
    companyRegistrationNumber.updateValueAndValidity();
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set('');

    const req = this.form.value;
    this.auth.registerByStaff(req).subscribe({
      next: res => {
        if (!res.success) {
          this.loading.set(false);
          this.error.set(res.message || this.i18n.t('banker.errCreateApplication'));
          return;
        }
        const { userId, email } = res.data;
        const start = this.isBusiness
          ? this.appSvc.startOrResumeBusiness(userId, email)
          : this.appSvc.startOrResume(userId, email);
        start.subscribe({
          next: app => {
            this.loading.set(false);
            this.router.navigate(['/banker/case', app.applicationRef]);
          },
          error: () => {
            this.loading.set(false);
            this.error.set(this.i18n.t('banker.errCreateApplication'));
          }
        });
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.error?.message || this.i18n.t('banker.errCreateApplication'));
      }
    });
  }

  f(name: string) { return this.form.get(name); }
}
