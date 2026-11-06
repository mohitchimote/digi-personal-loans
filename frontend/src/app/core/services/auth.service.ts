import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { AuthResponse, CustomerProfileResponse, LoginOtpInitiatedResponse, LoginOtpRequest, LoginVerifyRequest, OtpVerifyRequest, RegisterInitiatedResponse, RegisterRequest } from '../models';
import { API_BASE } from './api-base';

const API = `${API_BASE}/api/auth`;
const TOKEN_KEY = 'db_token';
const USER_KEY  = 'db_user';

const APPROVER_LEGACY = ['portal.underwriter', 'queue.pipeline', 'dashboard.view', 'case.addNote', 'case.editSection', 'case.approve', 'case.decline', 'case.sendBack', 'case.refer', 'case.disburse', 'case.disburseSecondCheck', 'case.resolveVerification', 'mandates.view'];
const LEGACY_ENTITLEMENTS: Record<string, string[]> = {
  BANKER: ['portal.banker', 'queue.banker', 'dashboard.view', 'case.addNote', 'case.actAsCustomer', 'mandates.view'],
  UNDERWRITER: APPROVER_LEGACY, SENIOR_UNDERWRITER: APPROVER_LEGACY, HEAD_OF_LENDING: APPROVER_LEGACY, COO: APPROVER_LEGACY, CEO: APPROVER_LEGACY,
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser = signal<AuthResponse | null>(this.loadUser());

  /** Tracks whether the Home dashboard's "last accessed" toast has already been shown this login
   * session — set true the first time it's displayed, reset on every new login. Lives here
   * (rather than on the dashboard component itself) because the component is destroyed and
   * recreated on every navigation to/from Home, so its own state can't survive a round trip to a
   * case and back the way this singleton service can. */
  lastAccessedToastShown = false;

  constructor(private http: HttpClient, private router: Router) {}

  register(req: RegisterRequest): Observable<{ success: boolean; message: string; data: RegisterInitiatedResponse }> {
    return this.http.post<any>(`${API}/register`, req);
  }

  verifyOtp(req: OtpVerifyRequest): Observable<any> {
    return this.http.post<any>(`${API}/register/verify-otp`, req).pipe(
      tap(res => { if (res.success) this.storeSession(res.data); })
    );
  }

  resendOtp(email: string): Observable<{ success: boolean; message: string; data: RegisterInitiatedResponse }> {
    return this.http.post<any>(`${API}/register/resend-otp`, { email });
  }

  /** Banker-assisted registration — creates the customer account pre-verified (the Banker has
   * already confirmed identity by phone/in branch). Deliberately does NOT call storeSession():
   * the response's token belongs to the new customer, not the Banker, and must never overwrite
   * the Banker's own logged-in session. */
  registerByStaff(req: RegisterRequest): Observable<{ success: boolean; message: string; data: AuthResponse }> {
    return this.http.post<any>(`${API}/register-by-staff`, req);
  }

  /** Banker-only — looks up a customer's own profile data (name/phone/National ID/issue date)
   * so an assisted application's wizard can prefill it, without ever exposing the Banker's own
   * identity in that prefill. See EffectiveIdentityService. */
  getCustomerProfile(customerId: number): Observable<{ success: boolean; message: string; data: CustomerProfileResponse }> {
    return this.http.get<any>(`${API}/customer-profile/${customerId}`);
  }

  requestLoginOtp(req: LoginOtpRequest): Observable<{ success: boolean; message: string; data: LoginOtpInitiatedResponse }> {
    return this.http.post<any>(`${API}/login/request-otp`, req);
  }

  verifyLoginOtp(req: LoginVerifyRequest): Observable<any> {
    return this.http.post<any>(`${API}/login/verify-otp`, req).pipe(
      tap(res => { if (res.success) this.storeSession(res.data); })
    );
  }

  /** @param sessionExpiredMessage set only by the 401 interceptor (session-expired.interceptor.ts)
   * — a manual "Log out" click never passes this, so the login screen stays silent for that case. */
  logout(sessionExpiredMessage?: string): void {
    // S2 (ARCHITECTURE_REVIEW_GAPS.md) — a manual logout now also revokes server-side (the token
    // stays otherwise valid until its 24h expiry if only cleared client-side). Fire-and-forget:
    // logout must proceed immediately regardless of network state, and never on the
    // session-expired path — that token is already invalid, there's nothing to revoke.
    if (!sessionExpiredMessage) {
      this.http.post(`${API}/logout`, {}).subscribe({ error: () => {} });
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/login'], sessionExpiredMessage ? { state: { message: sessionExpiredMessage } } : undefined);
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get isLoggedIn(): boolean {
    return !!this.token;
  }

  get userId(): number | null {
    return this.currentUser()?.userId ?? null;
  }

  get userEmail(): string | null {
    return this.currentUser()?.email ?? null;
  }

  get userFullName(): string | null {
    return this.currentUser()?.fullName ?? null;
  }

  get userPhone(): string | null {
    return this.currentUser()?.phoneNumber ?? null;
  }

  get userNationalId(): string | null {
    return this.currentUser()?.nationalId ?? null;
  }

  get userIdIssueDate(): string | null {
    return this.currentUser()?.idIssueDate ?? null;
  }

  get role(): string | null {
    return this.currentUser()?.role ?? null;
  }

  /** Entitlements granted to the signed-in user's role (admin-configured, delivered at login).
   * A session stored before entitlements existed has none - fall back to the legacy role map so
   * it keeps working until the user next signs in. */
  get entitlements(): string[] {
    const u = this.currentUser();
    if (!u) return [];
    if (u.entitlements) return u.entitlements;
    return LEGACY_ENTITLEMENTS[u.role] ?? [];
  }

  has(key: string): boolean {
    return this.entitlements.includes(key);
  }

  /** Display name of the user's role: the admin-configured label for staff. */
  get roleLabel(): string | null {
    return this.currentUser()?.roleLabel ?? null;
  }

  /** Lands in the Underwriter shell: any role holding the underwriting-portal entitlement
   * (the five approval-mandate roles by default, plus any role the admin configures that way). */
  get isUnderwriter(): boolean {
    return this.has('portal.underwriter');
  }

  get isAdmin(): boolean {
    return this.role === 'ADMIN';
  }

  get isBusinessOwner(): boolean {
    return this.role === 'BUSINESS_OWNER';
  }

  get isBanker(): boolean {
    return this.has('portal.banker');
  }

  get companyName(): string | null {
    return this.currentUser()?.companyName ?? null;
  }

  get companyRegistrationNumber(): string | null {
    return this.currentUser()?.companyRegistrationNumber ?? null;
  }

  get companyIndustry(): string | null {
    return this.currentUser()?.companyIndustry ?? null;
  }

  get companyFoundedYear(): number | null {
    return this.currentUser()?.companyFoundedYear ?? null;
  }

  get previousLogin(): string | null {
    return this.currentUser()?.previousLogin ?? null;
  }

  private storeSession(auth: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, auth.token);
    localStorage.setItem(USER_KEY, JSON.stringify(auth));
    this.currentUser.set(auth);
    this.lastAccessedToastShown = false;
  }

  private loadUser(): AuthResponse | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}
