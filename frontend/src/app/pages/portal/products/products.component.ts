import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService } from '../../../core/services/product.service';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { EligibleProduct } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { ficoToLenderGrade } from '../../../core/utils/credit-score.util';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss'
})
export class ProductsComponent implements OnInit {
  products = signal<EligibleProduct[]>([]);
  loading = signal(true);
  selecting = signal(false);
  selectedId = signal<string | null>(null);
  appRef = signal('');
  loanAmount = signal(50000);
  selectedTerm: { [productId: string]: number } = {};

  constructor(
    private productSvc: ProductService,
    private appSvc: ApplicationService,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const userId = this.auth.userId;
    const email  = this.auth.userEmail;
    if (!userId || !email) return;

    this.appSvc.getCurrent(userId).subscribe({
      next: app => {
        this.appRef.set(app.applicationRef);
        const loan = JSON.parse(app.loanRequirementsJson || '{}');
        const credit = JSON.parse(app.creditDeclarationsJson || '{}');
        const income = JSON.parse(app.incomeEmploymentJson || '{}');
        const amount = loan.loanAmount || 50000;
        const term   = loan.loanTerm || 36;
        this.loanAmount.set(amount);

        const a2Income = income.applicant2?.monthlyGrossIncome || 0;
        const a2Credit = credit.applicant2?.creditScore;
        const fico = a2Credit ? Math.min(credit.creditScore || 700, a2Credit) : (credit.creditScore || 700);

        this.productSvc.getEligible({
          requestedAmount: amount,
          requestedTermMonths: term,
          creditScore: ficoToLenderGrade(fico),
          monthlyIncome: (income.monthlyGrossIncome || 0) + a2Income
        }).subscribe({
          next: list => {
            this.products.set(list);
            list.forEach(p => { this.selectedTerm[p.productId] = p.minTermMonths; });
            this.loading.set(false);
          },
          error: () => this.loading.set(false)
        });
      }
    });
  }

  monthlyRepayment(product: EligibleProduct, productId: string): number {
    const term = this.selectedTerm[productId] || product.minTermMonths;
    const r = product.interestRate / 100 / 12;
    const n = term;
    const P = this.loanAmount();
    if (r === 0) return P / n;
    return Math.round(P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
  }

  totalRepayable(product: EligibleProduct, productId: string): number {
    const term = this.selectedTerm[productId] || product.minTermMonths;
    return this.monthlyRepayment(product, productId) * term;
  }

  selectProduct(product: EligibleProduct): void {
    const ref = this.appRef();
    if (!ref) return;
    this.selecting.set(true);
    this.selectedId.set(product.productId);

    this.appSvc.selectProduct(ref, {
      productId: product.productId,
      productName: product.productName,
      interestRate: product.interestRate,
      termMonths: this.selectedTerm[product.productId] || product.minTermMonths,
      monthlyRepayment: this.monthlyRepayment(product, product.productId)
    }).subscribe({
      next: app => {
        if (app.status === 'APPROVED') {
          this.router.navigate(['/portal/approval']);
          return;
        }
        this.appSvc.approve(ref).subscribe({
          next: () => this.router.navigate(['/portal/approval']),
          error: () => { this.selecting.set(false); this.router.navigate(['/portal/approval']); }
        });
      },
      error: () => this.selecting.set(false)
    });
  }
}
