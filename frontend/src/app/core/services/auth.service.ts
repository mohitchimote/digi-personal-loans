import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { AuthResponse, LoginOtpInitiatedResponse, LoginOtpRequest, LoginVerifyRequest, OtpVerifyRequest, RegisterInitiatedResponse, RegisterRequest } from '../models';
import { API_BASE } from './api-base';

const API = `${API_BASE}/api/auth`;
const TOKEN_KEY = 'db_token';
const USER_KEY  = 'db_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  currentUser = signal<AuthResponse | null>(this.loadUser());

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

  requestLoginOtp(req: LoginOtpRequest): Observable<{ success: boolean; message: string; data: LoginOtpInitiatedResponse }> {
    return this.http.post<any>(`${API}/login/request-otp`, req);
  }

  verifyLoginOtp(req: LoginVerifyRequest): Observable<any> {
    return this.http.post<any>(`${API}/login/verify-otp`, req).pipe(
      tap(res => { if (res.success) this.storeSession(res.data); })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
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

  /** Covers the whole approval-mandate hierarchy (UW -> Senior UW -> Head of Lending -> COO ->
   * CEO) — all five roles share the same Underwriter shell/pipeline/case-detail UI for this demo
   * (see PROJECT_DOCUMENTATION.md's Mandates section for why no per-role shells were built). */
  get isUnderwriter(): boolean {
    return ['UNDERWRITER', 'SENIOR_UNDERWRITER', 'HEAD_OF_LENDING', 'COO', 'CEO'].includes(this.role || '');
  }

  get isAdmin(): boolean {
    return this.role === 'ADMIN';
  }

  get isBusinessOwner(): boolean {
    return this.role === 'BUSINESS_OWNER';
  }

  get isBanker(): boolean {
    return this.role === 'BANKER';
  }

  get companyName(): string | null {
    return this.currentUser()?.companyName ?? null;
  }

  private storeSession(auth: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, auth.token);
    localStorage.setItem(USER_KEY, JSON.stringify(auth));
    this.currentUser.set(auth);
  }

  private loadUser(): AuthResponse | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}
