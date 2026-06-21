import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AffordabilityService } from '../../../core/services/affordability.service';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { BusinessAffordabilityResult } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-business-affordability-results',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './business-affordability-results.component.html',
  styleUrl: './business-affordability-results.component.scss'
})
export class BusinessAffordabilityResultsComponent implements OnInit {
  result  = signal<BusinessAffordabilityResult | null>(null);
  loading = signal(true);
  appRef  = signal('');

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
        const financials = JSON.parse(app.businessFinancialsJson || '{}');
        const outgoings   = JSON.parse(app.businessOutgoingsJson || '{}');
        const credit      = JSON.parse(app.businessCreditDeclarationsJson || '{}');
        const company     = JSON.parse(app.companyDetailsJson || '{}');

        const request = {
          annualTurnover:              financials.annualTurnover || 0,
          monthlyRevenue:              financials.monthlyRevenue || 0,
          monthlyOutgoings:            (outgoings.monthlyLeaseRent || 0) + (outgoings.monthlyPayroll || 0) + (outgoings.monthlySupplierPayments || 0),
          existingBusinessDebtService: outgoings.existingBusinessDebtService || 0,
          requestedLoanAmount:         company.loanAmount || 100000,
          requestedTermMonths:         company.loanTerm || 36,
          directorCreditScore:         credit.directorCreditScore || 7,
          hasCompanyDefaulted:         credit.hasCompanyDefaulted || false,
          hasLiquidationOrWindingUp:   credit.hasLiquidationOrWindingUp || false,
        };

        this.affordability.checkBusiness(request).subscribe({
          next: res => {
            this.result.set(res);
            this.loading.set(false);
            this.appSvc.saveAffordabilityResult(app.applicationRef, res).subscribe({ error: () => {} });
            if (res.passed) {
              this.router.navigate(['/business/products']);
            }
          },
          error: () => this.loading.set(false)
        });
      }
    });
  }

  proceed(): void {
    this.router.navigate(['/business/products']);
  }
}
