import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { EMPTY, Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { LoanApplication, UnderwritingNote } from '../models';

const API = 'http://localhost:8080/api/applications';
const EDITABLE_STATUSES = ['DRAFT', 'IN_PROGRESS'];

@Injectable({ providedIn: 'root' })
export class ApplicationService {
  constructor(private http: HttpClient, private router: Router) {}

  startOrResume(customerId: number, customerEmail: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/start`, { customerId, customerEmail });
  }

  /**
   * Resolves the application a wizard step should edit. Never spawns a phantom draft for an
   * already-decided application: if the customer's current application isn't DRAFT/IN_PROGRESS,
   * redirects to the read-only view instead and emits nothing.
   */
  resolveEditable(customerId: number, customerEmail: string): Observable<LoanApplication> {
    return this.getCurrent(customerId).pipe(
      catchError(() => this.startOrResume(customerId, customerEmail)),
      switchMap(app => {
        if (EDITABLE_STATUSES.includes(app.status)) return of(app);
        this.router.navigate(['/portal/view-application', app.applicationRef]);
        return EMPTY;
      })
    );
  }

  saveSection(appRef: string, section: string, data: any, customerId: number): Observable<LoanApplication> {
    return this.http.put<LoanApplication>(`${API}/${appRef}/section`, { section, data, customerId });
  }

  saveSectionByUnderwriter(appRef: string, section: string, data: any, editedBy: string): Observable<LoanApplication> {
    return this.http.put<LoanApplication>(`${API}/${appRef}/section-by-underwriter?editedBy=${encodeURIComponent(editedBy)}`, { section, data });
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

  cancel(appRef: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/cancel`, {});
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

  approveByUnderwriter(appRef: string, reviewedBy: string, approvedAmount?: number): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/approve-by-underwriter`, { reviewedBy, approvedAmount });
  }

  addNote(appRef: string, section: string, note: string, noteType: string, createdBy: string): Observable<UnderwritingNote> {
    return this.http.post<UnderwritingNote>(`${API}/${appRef}/notes`, { section, note, noteType, createdBy });
  }

  getNotes(appRef: string): Observable<UnderwritingNote[]> {
    return this.http.get<UnderwritingNote[]>(`${API}/${appRef}/notes`);
  }

  saveAffordabilityResult(appRef: string, result: any): Observable<LoanApplication> {
    return this.http.put<LoanApplication>(`${API}/${appRef}/affordability-result`, result);
  }

  referToSenior(appRef: string, reason: string, reviewedBy: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/refer-to-senior`, { reason, reviewedBy });
  }

  authoriseFundRelease(appRef: string, reviewedBy: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/disbursement/authorise`, { reviewedBy });
  }

  submitForSecondCheck(appRef: string, reviewedBy: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/disbursement/second-check`, { reviewedBy });
  }
}
