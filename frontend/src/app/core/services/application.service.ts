import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LoanApplication } from '../models';

const API = 'http://localhost:8080/api/applications';

@Injectable({ providedIn: 'root' })
export class ApplicationService {
  constructor(private http: HttpClient) {}

  startOrResume(customerId: number, customerEmail: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/start`, { customerId, customerEmail });
  }

  saveSection(appRef: string, section: string, data: any, customerId: number): Observable<LoanApplication> {
    return this.http.put<LoanApplication>(`${API}/${appRef}/section`, { section, data, customerId });
  }

  getApplication(appRef: string): Observable<LoanApplication> {
    return this.http.get<LoanApplication>(`${API}/${appRef}`);
  }

  getMyApplications(customerId: number): Observable<LoanApplication[]> {
    return this.http.get<LoanApplication[]>(`${API}/customer/${customerId}`);
  }

  submit(appRef: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/submit`, {});
  }

  selectProduct(appRef: string, selection: {
    productId: string; productName: string;
    interestRate: number; termMonths: number; monthlyRepayment: number;
  }): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/select-product`, selection);
  }

  approve(appRef: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/approve`, {});
  }
}
