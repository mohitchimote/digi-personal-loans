import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

export interface UserSummary {
  id: number;
  email: string;
  nationalId: string;
  fullName: string;
  phoneNumber?: string;
  role: string;
  enabled: boolean;
  createdAt: string;
  lastLogin?: string;
}

const API = `${API_BASE}/api/auth/admin`;

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) {}

  getUsers(): Observable<UserSummary[]> {
    return this.http.get<UserSummary[]>(`${API}/users`);
  }

  updateRole(id: number, role: string): Observable<any> {
    return this.http.put<any>(`${API}/users/${id}/role`, { role });
  }

  setEnabled(id: number, enabled: boolean): Observable<any> {
    return this.http.put<any>(`${API}/users/${id}/enabled`, { enabled });
  }
}
