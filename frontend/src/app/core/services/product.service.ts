import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { EligibleProduct } from '../models';
import { API_BASE } from './api-base';

const API = `${API_BASE}/api/products`;

@Injectable({ providedIn: 'root' })
export class ProductService {
  constructor(private http: HttpClient) {}

  getEligible(request: any): Observable<EligibleProduct[]> {
    return this.http.post<EligibleProduct[]>(`${API}/eligible`, request);
  }

  selectProduct(applicationRef: string, productCode: string, termMonths: number): Observable<any> {
    return this.http.post<any>(`${API}/select`, { applicationRef, productCode, termMonths });
  }

  getSelection(appRef: string): Observable<any> {
    return this.http.get<any>(`${API}/selection/${appRef}`);
  }
}
