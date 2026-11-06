import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

const API = `${API_BASE}/api/auth/admin/workflow`;

export interface WorkflowVersionRow {
  id: number; key: string; version: number; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  changeNote: string | null; createdAt: string; createdBy: string | null;
  publishedAt: string | null; publishedBy: string | null; caseCount?: number;
}
export interface WorkflowVersionDetail extends WorkflowVersionRow { definition: any }

export interface WorkflowCatalog {
  entitlements: { key: string; group: string; label: string; description: string }[];
  guards: string[]; effects: string[]; setFields: string[]; emailEvents: string[]; notifyTemplates: string[];
}

/** Admin API for the workflow builder. Definitions are versioned DRAFT -> PUBLISHED -> ARCHIVED. */
@Injectable({ providedIn: 'root' })
export class WorkflowAdminService {
  constructor(private http: HttpClient) {}

  catalog(): Observable<WorkflowCatalog> { return this.http.get<WorkflowCatalog>(`${API}/catalog`); }
  versions(): Observable<WorkflowVersionRow[]> { return this.http.get<WorkflowVersionRow[]>(`${API}/definitions`); }
  version(id: number): Observable<WorkflowVersionDetail> { return this.http.get<WorkflowVersionDetail>(`${API}/definitions/${id}`); }
  validate(definition: unknown): Observable<{ ok: boolean; errors: string[] }> {
    return this.http.post<{ ok: boolean; errors: string[] }>(`${API}/validate`, { definition });
  }
  createDraft(key: string, sourceId?: number): Observable<WorkflowVersionRow & { existing: boolean }> {
    return this.http.post<WorkflowVersionRow & { existing: boolean }>(`${API}/definitions/${key}/draft`, sourceId ? { sourceId } : {});
  }
  saveDraft(id: number, definition: unknown, changeNote: string | null): Observable<WorkflowVersionRow> {
    return this.http.put<WorkflowVersionRow>(`${API}/definitions/${id}`, { definition, changeNote });
  }
  publish(id: number): Observable<WorkflowVersionRow> { return this.http.post<WorkflowVersionRow>(`${API}/definitions/${id}/publish`, {}); }
  discard(id: number): Observable<void> { return this.http.delete<void>(`${API}/definitions/${id}`); }
}
