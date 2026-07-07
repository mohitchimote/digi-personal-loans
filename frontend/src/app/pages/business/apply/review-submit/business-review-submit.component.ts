import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApplicationService } from '../../../../core/services/application.service';
import { EffectiveIdentityService } from '../../../../core/services/effective-identity.service';
import { LoanApplication } from '../../../../core/models';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-business-review-submit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './business-review-submit.component.html',
  styleUrl: './business-review-submit.component.scss'
})
export class BusinessReviewSubmitComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  readOnly = signal(false);
  agreedToTerms   = false;
  agreedToPrivacy = false;
  agreedToCredit  = false;
  signature       = '';
  submitting = signal(false);
  error = signal('');

  constructor(private appSvc: ApplicationService, public identity: EffectiveIdentityService, private router: Router) {}

  ngOnInit(): void {
    const userId = this.identity.userId; const email = this.identity.userEmail;
    if (!userId || !email) return;
    this.appSvc.resolveEditableBusiness(userId, email, this.identity.appRef ?? undefined, this.identity.isAssisting).subscribe({
      next: app => {
        this.application.set(app);
        this.readOnly.set(this.identity.isAssisting && !this.appSvc.isEditableStatus(app.status));
      }
    });
  }

  parseSection(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  get company()     { return this.parseSection(this.application()?.companyDetailsJson); }
  get signatories()  { return this.parseSection(this.application()?.signatoriesJson).signatories || []; }
  get bankConnection() { return this.parseSection(this.application()?.businessBankConnectionJson); }
  get financials()  { return this.parseSection(this.application()?.businessFinancialsJson); }
  get outgoings()   { return this.parseSection(this.application()?.businessOutgoingsJson); }
  get credit()      { return this.parseSection(this.application()?.businessCreditDeclarationsJson); }
  get verifyId()    { return this.parseSection(this.application()?.verifyIdJson); }
  get directDebit() { return this.parseSection(this.application()?.directDebitJson); }
  get guarantorDetails() { return this.parseSection(this.application()?.guarantorDetailsJson); }

  get canSubmit(): boolean {
    return this.agreedToTerms && this.agreedToPrivacy && this.agreedToCredit && this.signature.trim().length > 2;
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.submitting.set(true);
    this.error.set('');

    const app = this.application();
    if (!app) return;

    this.appSvc.saveSection(app.applicationRef, 'reviewSubmit',
      { agreedToTerms: true, agreedToPrivacyPolicy: true, electronicSignature: this.signature, submittedAt: new Date().toISOString() },
      this.identity.userId!
    ).subscribe({
      next: () => {
        this.appSvc.submit(app.applicationRef).subscribe({
          next: () => {
            this.submitting.set(false);
            this.router.navigate(this.identity.stepUrl('affordability-results', true, '/business'));
          },
          error: () => { this.submitting.set(false); this.error.set('Submission failed. Please try again.'); }
        });
      },
      error: () => { this.submitting.set(false); this.error.set('Submission failed. Please try again.'); }
    });
  }
}
