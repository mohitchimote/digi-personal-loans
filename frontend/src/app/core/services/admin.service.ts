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
  companyName?: string;
  orgUnitId?: number | null;
}

export interface OrgLevel { id: number; name: string; depth: number; masterTypeCode: string | null; }
export interface OrgLevelInput { name: string; depth: number; masterTypeCode?: string | null; }
export interface OrgUnit { id: number; code: string; name: string; nameHe: string | null; masterCode: string | null; levelId: number; parentId: number | null; active: boolean; }
/** At a level with a source master send masterCode (code and names are copied from the master item); otherwise code and name. */
export interface OrgUnitInput { code?: string; name?: string; masterCode?: string | null; levelId: number; parentId: number | null; active?: boolean; }

export interface EntitlementDef { key: string; group: string; label: string; description: string; }
export type RoleScope = 'ALL' | 'UNIT_TREE' | 'UNIT_ONLY';
export interface RoleRow {
  code: string; label: string; description: string | null; scope: RoleScope;
  isSystem: boolean; locked: boolean; escalationRank: number | null; entitlements: string[]; userCount: number;
}
export interface RoleInput { label: string; description?: string | null; scope: RoleScope; escalationRank?: number | null; entitlements: string[]; }
export interface MandateRow { id: number; roleCode: string; orgUnitId: number | null; applicationType: 'PERSONAL' | 'BUSINESS' | null; maxAmount: number; }
export type MandateInput = Omit<MandateRow, 'id'>;
export interface LadderRole { code: string; label: string; rank: number; }

export interface CreateStaffRequest {
  email: string;
  fullName: string;
  nationalId: string;
  phoneNumber?: string;
  role: string;
  orgUnitId?: number | null;
}

const API = `${API_BASE}/api/auth/admin`;

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private http: HttpClient) {}

  getUsers(): Observable<UserSummary[]> {
    return this.http.get<UserSummary[]>(`${API}/users`);
  }

  getStaff(): Observable<UserSummary[]> {
    return this.http.get<UserSummary[]>(`${API}/users?type=staff`);
  }

  getCustomers(): Observable<UserSummary[]> {
    return this.http.get<UserSummary[]>(`${API}/users?type=customers`);
  }

  createStaffUser(req: CreateStaffRequest): Observable<any> {
    return this.http.post<any>(`${API}/users`, req);
  }

  updateRole(id: number, role: string): Observable<any> {
    return this.http.put<any>(`${API}/users/${id}/role`, { role });
  }

  setEnabled(id: number, enabled: boolean): Observable<any> {
    return this.http.put<any>(`${API}/users/${id}/enabled`, { enabled });
  }

  getRoles(): Observable<{ catalog: EntitlementDef[]; scopes: RoleScope[]; roles: RoleRow[] }> {
    return this.http.get<{ catalog: EntitlementDef[]; scopes: RoleScope[]; roles: RoleRow[] }>(`${API}/roles`);
  }
  createRole(r: RoleInput & { code: string }): Observable<any> {
    return this.http.post<any>(`${API}/roles`, r);
  }
  updateRole2(code: string, r: RoleInput): Observable<any> {
    return this.http.put<any>(`${API}/roles/${code}`, r);
  }
  deleteRole(code: string): Observable<void> {
    return this.http.delete<void>(`${API}/roles/${code}`);
  }

  getMandates(): Observable<{ mandates: MandateRow[]; ladder: LadderRole[] }> {
    return this.http.get<{ mandates: MandateRow[]; ladder: LadderRole[] }>(`${API}/mandates`);
  }
  createMandate(m: MandateInput): Observable<MandateRow> {
    return this.http.post<MandateRow>(`${API}/mandates`, m);
  }
  updateMandate(id: number, m: MandateInput): Observable<MandateRow> {
    return this.http.put<MandateRow>(`${API}/mandates/${id}`, m);
  }
  deleteMandate(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/mandates/${id}`);
  }

  getOrg(): Observable<{ levels: OrgLevel[]; units: OrgUnit[] }> {
    return this.http.get<{ levels: OrgLevel[]; units: OrgUnit[] }>(`${API}/org`);
  }
  createOrgLevel(l: OrgLevelInput): Observable<OrgLevel> {
    return this.http.post<OrgLevel>(`${API}/org/levels`, l);
  }
  updateOrgLevel(id: number, l: OrgLevelInput): Observable<OrgLevel> {
    return this.http.put<OrgLevel>(`${API}/org/levels/${id}`, l);
  }
  deleteOrgLevel(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/org/levels/${id}`);
  }
  createOrgUnit(u: OrgUnitInput): Observable<OrgUnit> {
    return this.http.post<OrgUnit>(`${API}/org/units`, u);
  }
  updateOrgUnit(id: number, u: OrgUnitInput): Observable<OrgUnit> {
    return this.http.put<OrgUnit>(`${API}/org/units/${id}`, u);
  }
  deleteOrgUnit(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/org/units/${id}`);
  }
  setUserOrgUnit(id: number, orgUnitId: number | null): Observable<any> {
    return this.http.put<any>(`${API}/users/${id}/org-unit`, { orgUnitId });
  }

  deleteUser(id: number): Observable<any> {
    return this.http.delete<any>(`${API}/users/${id}`);
  }
}
