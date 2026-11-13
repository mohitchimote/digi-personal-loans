import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

export type AttrKind = 'text' | 'number' | 'boolean';
export interface AttributeDef { key: string; label: { en: string; he: string }; kind: AttrKind; required?: boolean; }

export interface MasterType {
  code: string;
  labelEn: string;
  labelHe: string;
  description: string | null;
  parentTypeCode: string | null;
  attributeDefs: AttributeDef[];
  isSystem: boolean;
  sortOrder: number;
  itemCount?: number;
}
export interface MasterTypeInput {
  code?: string;
  labelEn: string;
  labelHe: string;
  description?: string | null;
  parentTypeCode?: string | null;
  attributeDefs?: AttributeDef[];
  sortOrder?: number;
}
export interface MasterItem {
  id: number;
  typeCode: string;
  code: string;
  nameEn: string;
  nameHe: string;
  parentId: number | null;
  sortOrder: number;
  active: boolean;
  attributes: Record<string, string | number | boolean>;
}
export interface MasterItemInput {
  code: string;
  nameEn: string;
  nameHe: string;
  parentId: number | null;
  sortOrder?: number;
  active?: boolean;
  attributes?: Record<string, unknown>;
}

/** Pick-list entry returned by the public read endpoint that forms and other modules consume. */
export interface MasterOption {
  code: string;
  name: { en: string; he: string };
  parentCode: string | null;
  attributes: Record<string, unknown>;
}

const ADMIN = `${API_BASE}/api/auth/admin/masters`;
const PUBLIC = `${API_BASE}/api/masters`;

@Injectable({ providedIn: 'root' })
export class MastersService {
  constructor(private http: HttpClient) {}

  // Admin
  types(): Observable<MasterType[]> { return this.http.get<MasterType[]>(`${ADMIN}/types`); }
  createType(t: MasterTypeInput): Observable<MasterType> { return this.http.post<MasterType>(`${ADMIN}/types`, t); }
  updateType(code: string, t: MasterTypeInput): Observable<MasterType> { return this.http.put<MasterType>(`${ADMIN}/types/${code}`, t); }
  deleteType(code: string): Observable<void> { return this.http.delete<void>(`${ADMIN}/types/${code}`); }
  items(typeCode: string): Observable<MasterItem[]> { return this.http.get<MasterItem[]>(`${ADMIN}/types/${typeCode}/items`); }
  createItem(typeCode: string, i: MasterItemInput): Observable<MasterItem> { return this.http.post<MasterItem>(`${ADMIN}/types/${typeCode}/items`, i); }
  updateItem(id: number, i: MasterItemInput): Observable<MasterItem> { return this.http.put<MasterItem>(`${ADMIN}/items/${id}`, i); }
  deleteItem(id: number): Observable<void> { return this.http.delete<void>(`${ADMIN}/items/${id}`); }

  // Read-only pick-lists for forms
  options(typeCode: string, parentCode?: string): Observable<MasterOption[]> {
    return this.http.get<MasterOption[]>(`${PUBLIC}/${typeCode}`, { params: parentCode ? { parent: parentCode } : {} });
  }
  optionsFor(typeCodes: string[]): Observable<Record<string, MasterOption[]>> {
    return this.http.get<Record<string, MasterOption[]>>(PUBLIC, { params: { types: typeCodes.join(',') } });
  }
}
