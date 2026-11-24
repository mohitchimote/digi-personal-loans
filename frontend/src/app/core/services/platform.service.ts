import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { API_BASE } from './api-base';
import { AuthResponse } from '../models';
import { AuthService } from './auth.service';

export interface PlatformLender {
  id: number;
  code: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  users: number;
  applications: number;
  /** Addresses the lender is reached on (its own URLs). */
  domains: string[];
}

export interface CreateLenderRequest {
  code: string;
  name: string;
  cloneFromLenderId: number;
  admin: { fullName: string; email: string; nationalId: string };
}

const API = `${API_BASE}/api/platform`;

/** The super admin's console: lenders across the platform. */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  constructor(private http: HttpClient, private auth: AuthService) {}

  list(): Observable<PlatformLender[]> {
    return this.http.get<PlatformLender[]>(`${API}/lenders`);
  }

  create(req: CreateLenderRequest): Observable<{ success: boolean; message: string; data: { lender: PlatformLender; mastersWithoutItems: string[] } }> {
    return this.http.post<any>(`${API}/lenders`, req);
  }

  setDomains(id: number, domains: string[]): Observable<{ domains: string[] }> {
    return this.http.put<{ domains: string[] }>(`${API}/lenders/${id}/domains`, { domains });
  }

  rename(id: number, name: string): Observable<PlatformLender> {
    return this.http.put<PlatformLender>(`${API}/lenders/${id}`, { name });
  }

  setSuspended(id: number, suspended: boolean): Observable<PlatformLender> {
    return this.http.post<PlatformLender>(`${API}/lenders/${id}/${suspended ? 'suspend' : 'activate'}`, {});
  }

  /** Enter a lender: the session continues as the same super admin, now inside that lender. */
  enter(id: number): Observable<{ success: boolean; data: AuthResponse }> {
    return this.http.post<any>(`${API}/lenders/${id}/enter`, {}).pipe(tap(res => this.auth.replaceSession(res.data)));
  }

  /** Back to platform level (no lender). */
  exit(): Observable<{ success: boolean; data: AuthResponse }> {
    return this.http.post<any>(`${API}/exit`, {}).pipe(tap(res => this.auth.replaceSession(res.data)));
  }
}
