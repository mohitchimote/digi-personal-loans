import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LoanApplication, UnderwritingNote } from '../models';

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

  getCurrent(customerId: number): Observable<LoanApplication> {
    return this.http.get<LoanApplication>(`${API}/customer/${customerId}/current`);
  }

  withdraw(appRef: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/withdraw`, {});
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

  getPipeline(): Observable<LoanApplication[]> {
    return this.http.get<LoanApplication[]>(`${API}/pipeline`);
  }

  decline(appRef: string, reason: string, reviewedBy: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/decline`, { reason, reviewedBy });
  }

  sendBack(appRef: string, reason: string, reviewedBy: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/send-back`, { reason, reviewedBy });
  }

  approveByUnderwriter(appRef: string, reviewedBy: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/approve-by-underwriter`, { reviewedBy });
  }

  addNote(appRef: string, section: string, note: string, noteType: string, createdBy: string): Observable<UnderwritingNote> {
    return this.http.post<UnderwritingNote>(`${API}/${appRef}/notes`, { section, note, noteType, createdBy });
  }

  getNotes(appRef: string): Observable<UnderwritingNote[]> {
    return this.http.get<UnderwritingNote[]>(`${API}/${appRef}/notes`);
  }
}
