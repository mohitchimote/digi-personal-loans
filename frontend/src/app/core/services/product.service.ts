import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { EligibleProduct, PreApprovedOffer } from '../models';
import { API_BASE } from './api-base';

const API = `${API_BASE}/api/products`;

export interface LoanProduct {
  id?: number;
  productCode: string;
  productName: string;
  description?: string;
  annualInterestRate: number;
  minAmount: number;
  maxAmount: number;
  minTermMonths: number;
  maxTermMonths: number;
  minCreditScore: number;
  minMonthlyIncome: number;
  maxDti: number;
  riskCategories?: string;
  active: boolean;
  productType: 'PERSONAL' | 'BUSINESS';
}

@Injectable({ providedIn: 'root' })
export class ProductService {
  constructor(private http: HttpClient) {}

  getEligible(request: any): Observable<EligibleProduct[]> {
    return this.http.post<EligibleProduct[]>(`${API}/eligible`, request);
  }

  getPreApprovedOffer(nationalId: string): Observable<PreApprovedOffer | null> {
    return this.http.get<PreApprovedOffer>(`${API}/pre-approved/${nationalId}`).pipe(
      catchError(() => of(null))
    );
  }

  selectProduct(applicationRef: string, productCode: string, termMonths: number): Observable<any> {
    return this.http.post<any>(`${API}/select`, { applicationRef, productCode, termMonths });
  }

  getSelection(appRef: string): Observable<any> {
    return this.http.get<any>(`${API}/selection/${appRef}`);
  }

  adminListAll(): Observable<LoanProduct[]> {
    return this.http.get<LoanProduct[]>(`${API}/admin/all`);
  }

  createProduct(product: Partial<LoanProduct>): Observable<LoanProduct> {
    return this.http.post<LoanProduct>(`${API}/admin`, product);
  }

  updateProduct(id: number, product: Partial<LoanProduct>): Observable<LoanProduct> {
    return this.http.put<LoanProduct>(`${API}/admin/${id}`, product);
  }

  deleteProduct(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/admin/${id}`);
  }
}
