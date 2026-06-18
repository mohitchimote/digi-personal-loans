import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AffordabilityService } from '../../../core/services/affordability.service';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { AffordabilityResult } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-affordability-results',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './affordability-results.component.html',
  styleUrl: './affordability-results.component.scss'
})
export class AffordabilityResultsComponent implements OnInit {
  result  = signal<AffordabilityResult | null>(null);
  loading = signal(true);
  appRef  = signal('');
  Math    = Math;

  constructor(
    private affordability: AffordabilityService,
    private appSvc: ApplicationService,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const userId = this.auth.userId; const email = this.auth.userEmail;
    if (!userId || !email) return;

    this.appSvc.getCurrent(userId).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        const income    = JSON.parse(app.incomeEmploymentJson || '{}');
        const outgoings = JSON.parse(app.outgoingsJson || '{}');
        const credit    = JSON.parse(app.creditDeclarationsJson || '{}');
        const loan      = JSON.parse(app.loanRequirementsJson || '{}');

        // For joint applications, combine both applicants' income and take the more conservative
        // credit position (lower score, either applicant's adverse history) since liability is joint.
        const a2Income = income.applicant2;
        const a2Credit = credit.applicant2;

        const request = {
          monthlyGrossIncome:      (income.monthlyGrossIncome || 0) + (a2Income?.monthlyGrossIncome || 0),
          monthlyNetIncome:        (income.monthlyNetIncome || 0) + (a2Income?.monthlyNetIncome || 0),
          monthlyRent:             outgoings.monthlyRent || 0,
          monthlyMortgage:         outgoings.monthlyMortgage || 0,
          monthlyLoans:            outgoings.monthlyLoans || 0,
          creditCardPayments:      outgoings.creditCardPayments || 0,
          otherMonthlyCommitments: outgoings.otherMonthlyCommitments || 0,
          monthlyLivingExpenses:   outgoings.monthlyLivingExpenses || 0,
          requestedLoanAmount:     loan.loanAmount || 50000,
          requestedTermMonths:     loan.loanTerm || 36,
          creditScore:             a2Credit?.creditScore ? Math.min(credit.creditScore || 700, a2Credit.creditScore) : (credit.creditScore || 700),
          hasDefaulted:            (credit.hasDefaulted || false) || (a2Credit?.hasDefaulted || false),
          hasBankruptcy:           (credit.hasBankruptcy || false) || (a2Credit?.hasBankruptcy || false),
        };

        this.affordability.check(request).subscribe({
          next: res => {
            this.result.set(res);
            this.loading.set(false);
            this.appSvc.saveAffordabilityResult(app.applicationRef, res).subscribe({ error: () => {} });
          },
          error: () => this.loading.set(false)
        });
      }
    });
  }

  proceed(): void {
    this.router.navigate(['/portal/products']);
  }
}
