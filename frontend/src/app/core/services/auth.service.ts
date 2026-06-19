import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { AuthResponse, LoginRequest, OtpVerifyRequest, RegisterInitiatedResponse, RegisterRequest } from '../models';
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

  login(req: LoginRequest): Observable<any> {
    return this.http.post<any>(`${API}/login`, req).pipe(
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

  get role(): string | null {
    return this.currentUser()?.role ?? null;
  }

  get isUnderwriter(): boolean {
    return this.role === 'UNDERWRITER';
  }

  get isAdmin(): boolean {
    return this.role === 'ADMIN';
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
