import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApplicationService } from '../../../../core/services/application.service';
import { AuthService } from '../../../../core/services/auth.service';
import { LoanApplication } from '../../../../core/models';
import { ApplicationAsideComponent } from '../../../../shared/application-aside/application-aside.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-review-submit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ApplicationAsideComponent, TranslatePipe],
  templateUrl: './review-submit.component.html',
  styleUrl: './review-submit.component.scss'
})
export class ReviewSubmitComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  agreedToTerms   = false;
  agreedToPrivacy = false;
  agreedToCredit  = false;
  signature       = '';
  submitting = signal(false);
  error = signal('');

  constructor(private appSvc: ApplicationService, private auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;
    this.appSvc.startOrResume(userId, email).subscribe({
      next: app => this.application.set(app)
    });
  }

  parseSection(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  get loanReqs() { return this.parseSection(this.application()?.loanRequirementsJson); }
  get personal()  { return this.parseSection(this.application()?.personalDetailsJson); }
  get bankConnection() { return this.parseSection(this.application()?.bankConnectionJson); }
  get income()    { return this.parseSection(this.application()?.incomeEmploymentJson); }
  get outgoings() { return this.parseSection(this.application()?.outgoingsJson); }
  get credit()    { return this.parseSection(this.application()?.creditDeclarationsJson); }
  get verifyId()  { return this.parseSection(this.application()?.verifyIdJson); }
  get directDebit() { return this.parseSection(this.application()?.directDebitJson); }

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
      this.auth.userId!
    ).subscribe({
      next: () => {
        this.appSvc.submit(app.applicationRef).subscribe({
          next: () => {
            this.submitting.set(false);
            this.router.navigate(['/portal/affordability-results']);
          },
          error: () => { this.submitting.set(false); this.error.set('Submission failed. Please try again.'); }
        });
      },
      error: () => { this.submitting.set(false); this.error.set('Submission failed. Please try again.'); }
    });
  }
}
