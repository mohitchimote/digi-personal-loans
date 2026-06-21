import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductService, LoanProduct } from '../../../core/services/product.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

const EMPTY_FORM: Partial<LoanProduct> = {
  productCode: '', productName: '', description: '',
  annualInterestRate: 5, minAmount: 10000, maxAmount: 100000,
  minTermMonths: 12, maxTermMonths: 60, minCreditScore: 5,
  minMonthlyIncome: 0, maxDti: 40, riskCategories: 'LOW,MEDIUM,HIGH',
  active: true, productType: 'PERSONAL'
};

@Component({
  selector: 'app-admin-products',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-products.component.html',
  styleUrl: './admin-products.component.scss'
})
export class AdminProductsComponent implements OnInit {
  products = signal<LoanProduct[]>([]);
  loading = signal(true);
  error = signal('');
  editingId = signal<number | null>(null);
  showForm = signal(false);
  filterType = signal<'ALL' | 'PERSONAL' | 'BUSINESS'>('ALL');

  form: Partial<LoanProduct> = { ...EMPTY_FORM };

  filteredProducts = computed(() => {
    const type = this.filterType();
    return type === 'ALL' ? this.products() : this.products().filter(p => p.productType === type);
  });

  constructor(private productSvc: ProductService, private i18n: I18nService) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.productSvc.adminListAll().subscribe({
      next: products => { this.products.set(products); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.i18n.t('admin.errLoadProducts')); }
    });
  }

  startNew(): void {
    this.form = { ...EMPTY_FORM, productType: this.filterType() === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL' };
    this.editingId.set(null);
    this.error.set('');
    this.showForm.set(true);
  }

  startEdit(product: LoanProduct): void {
    this.form = { ...product };
    this.editingId.set(product.id ?? null);
    this.error.set('');
    this.showForm.set(true);
  }

  cancel(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    if (!this.form.productCode?.trim() || !this.form.productName?.trim()) {
      this.error.set(this.i18n.t('admin.productValidation'));
      return;
    }
    const id = this.editingId();
    const op = id ? this.productSvc.updateProduct(id, this.form) : this.productSvc.createProduct(this.form);
    op.subscribe({
      next: () => { this.showForm.set(false); this.editingId.set(null); this.error.set(''); this.load(); },
      error: (err) => this.error.set(err?.error?.message || this.i18n.t('admin.errSaveProduct'))
    });
  }

  remove(product: LoanProduct): void {
    if (!product.id) return;
    this.productSvc.deleteProduct(product.id).subscribe({
      next: () => this.products.update(list => list.filter(p => p.id !== product.id)),
      error: () => this.error.set(this.i18n.t('admin.errDeleteProduct'))
    });
  }

  toggleActive(product: LoanProduct): void {
    if (!product.id) return;
    this.productSvc.updateProduct(product.id, { ...product, active: !product.active }).subscribe({
      next: updated => this.products.update(list => list.map(p => p.id === updated.id ? updated : p)),
      error: () => this.error.set(this.i18n.t('admin.errSaveProduct'))
    });
  }
}
