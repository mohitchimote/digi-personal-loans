import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-business-consent-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './business-consent-management.component.html',
  styleUrl: './business-consent-management.component.scss'
})
export class BusinessConsentManagementComponent implements OnInit {
  form: FormGroup;
  saving = signal(false);
  appRef = signal('');

  constructor(
    private fb: FormBuilder,
    private appSvc: ApplicationService,
    private auth: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group({
      creditBureauConsent:       [false, Validators.requiredTrue],
      pepScreeningConsent:       [false, Validators.requiredTrue],
      sanctionsScreeningConsent: [false, Validators.requiredTrue],
      dataProcessingConsent:     [false, Validators.requiredTrue],
    });
  }

  ngOnInit(): void {
    const userId = this.auth.userId;
    const email  = this.auth.userEmail;
    if (!userId || !email) return;

    this.appSvc.resolveEditableBusiness(userId, email).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        if (app.consentManagementJson) {
          this.form.patchValue(JSON.parse(app.consentManagementJson));
        }
      }
    });
  }

  saveAndNext(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);

    this.appSvc.saveSection(this.appRef(), 'consentManagement', this.form.value, this.auth.userId!).subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/business/apply/signatories']);
      },
      error: () => this.saving.set(false)
    });
  }

  f(name: string) { return this.form.get(name); }
}
