import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { EMPTY, Observable, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { LoanApplication, UnderwritingNote, DataVerificationSummary, DataVerificationAction, MandateRules, BusinessFinancialsAnalysis } from '../models';
import { API_BASE } from './api-base';
import { AssistContextService } from './assist-context.service';
import { AuthService } from './auth.service';

const API = `${API_BASE}/api/applications`;
const EDITABLE_STATUSES = ['DRAFT', 'IN_PROGRESS'];

@Injectable({ providedIn: 'root' })
export class ApplicationService {
  constructor(
    private http: HttpClient,
    private router: Router,
    private assist: AssistContextService,
    private auth: AuthService
  ) {}

  startOrResume(customerId: number, customerEmail: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/start`, { customerId, customerEmail });
  }

  startPreApproved(customerId: number, customerEmail: string, nationalId: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/start-pre-approved`, { customerId, customerEmail, nationalId });
  }

  startOrResumeBusiness(customerId: number, customerEmail: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/start-business`, { customerId, customerEmail });
  }

  /**
   * Resolves the application a wizard step should edit. Never spawns a phantom draft for an
   * already-decided application: if the customer's current application isn't DRAFT/IN_PROGRESS,
   * redirects to the read-only view instead and emits nothing.
   *
   * When `appRef` is provided (a Banker assisting a specific customer), fetches that exact
   * application instead of "this customer's most recently updated one" — a customer with more
   * than one application could otherwise land the Banker on the wrong one. `redirectBase` lets
   * the Banker path redirect back into the Banker shell instead of the customer's read-only view.
   */
  resolveEditable(customerId: number, customerEmail: string, appRef?: string, redirectBase = '/portal/view-application'): Observable<LoanApplication> {
    const source = appRef
      ? this.getApplication(appRef)
      : this.getCurrent(customerId).pipe(catchError(() => this.startOrResume(customerId, customerEmail)));
    return source.pipe(
      switchMap(app => {
        if (EDITABLE_STATUSES.includes(app.status)) return of(app);
        this.router.navigate([redirectBase, app.applicationRef]);
        return EMPTY;
      })
    );
  }

  /** Business-loan equivalent of resolveEditable. */
  resolveEditableBusiness(customerId: number, customerEmail: string, appRef?: string, redirectBase = '/business/view-application'): Observable<LoanApplication> {
    const source = appRef
      ? this.getApplication(appRef)
      : this.getCurrent(customerId).pipe(catchError(() => this.startOrResumeBusiness(customerId, customerEmail)));
    return source.pipe(
      switchMap(app => {
        if (EDITABLE_STATUSES.includes(app.status)) return of(app);
        this.router.navigate([redirectBase, app.applicationRef]);
        return EMPTY;
      })
    );
  }

  /** While a Banker is assisting, logs an audit note on every section save so there's a record
   * of which sections staff touched on a customer's behalf — centralized here instead of at
   * every one of the ~20 wizard step call sites. */
  saveSection(appRef: string, section: string, data: any, customerId: number): Observable<LoanApplication> {
    return this.http.put<LoanApplication>(`${API}/${appRef}/section`, { section, data, customerId }).pipe(
      tap(() => {
        if (this.assist.isActive) {
          this.addNote(appRef, section, 'Section edited by staff member (assisted application).', 'EDIT', this.auth.userFullName || 'Banker').subscribe();
        }
      })
    );
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

  getBankerQueue(): Observable<LoanApplication[]> {
    return this.http.get<LoanApplication[]>(`${API}/banker-queue`);
  }

  decline(appRef: string, reason: string, reviewedBy: string): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/decline`, { reason, reviewedBy });
  }

  sendBack(appRef: string, reason: string, reviewedBy: string, requireGuarantor = false): Observable<LoanApplication> {
    return this.http.post<LoanApplication>(`${API}/${appRef}/send-back`, { reason, reviewedBy, requireGuarantor: String(requireGuarantor) });
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

  getDataVerification(appRef: string): Observable<DataVerificationSummary> {
    return this.http.get<DataVerificationSummary>(`${API}/${appRef}/data-verification`);
  }

  resolveDataVerificationRule(appRef: string, ruleKey: string, action: DataVerificationAction, note: string, reviewedBy: string): Observable<DataVerificationSummary> {
    return this.http.post<DataVerificationSummary>(`${API}/${appRef}/data-verification/resolve`, { ruleKey, action, note, reviewedBy });
  }

  getBusinessFinancialsAnalysis(appRef: string): Observable<BusinessFinancialsAnalysis> {
    return this.http.get<BusinessFinancialsAnalysis>(`${API}/${appRef}/business-financials-analysis`);
  }

  getMandateRules(): Observable<MandateRules> {
    return this.http.get<MandateRules>(`${API}/mandate-rules`);
  }

  updateMandateRules(rules: MandateRules): Observable<MandateRules> {
    return this.http.put<MandateRules>(`${API}/mandate-rules`, rules);
  }

  private readonly sectionRoutes: Record<string, string> = {
    loanRequirements:   '/portal/apply/loan-requirements',
    personalDetails:    '/portal/apply/personal-details',
    connectBank:        '/portal/apply/connect-bank',
    incomeEmployment:   '/portal/apply/income-employment',
    outgoings:          '/portal/apply/outgoings',
    creditDeclarations: '/portal/apply/credit-declarations',
    verifyId:           '/portal/apply/verify-id',
    directDebit:        '/portal/apply/direct-debit',
    reviewSubmit:       '/portal/apply/review-submit',
  };

  private readonly businessSectionRoutes: Record<string, string> = {
    companyDetails:             '/business/apply/company-details',
    signatories:                '/business/apply/signatories',
    connectBusinessBank:        '/business/apply/connect-bank',
    businessFinancials:         '/business/apply/financials',
    businessOutgoings:          '/business/apply/outgoings',
    businessCreditDeclarations: '/business/apply/credit-declarations',
    verifyId:                   '/business/apply/verify-id',
    directDebit:                '/business/apply/direct-debit',
    reviewSubmit:               '/business/apply/review-submit',
  };

  /** Route to resume editing a draft/in-progress application, or view a decided one. */
  getResumeRoute(app: LoanApplication): string {
    const isBusiness = app.applicationType === 'BUSINESS';
    const base = isBusiness ? '/business' : '/portal';
    if (app.status === 'DRAFT' || app.status === 'IN_PROGRESS') {
      const routes = isBusiness ? this.businessSectionRoutes : this.sectionRoutes;
      return routes[app.currentSection] || (isBusiness ? '/business/apply/company-details' : '/portal/apply/loan-requirements');
    }
    if (app.status === 'APPROVED' || app.status === 'CONDITIONALLY_APPROVED') {
      return `${base}/approval/${app.applicationRef}`;
    }
    return `${base}/view-application/${app.applicationRef}`;
  }
}
