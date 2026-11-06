import { Injectable, effect, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from './api-base';
import { AuthService } from './auth.service';
import { I18nService } from '../i18n/i18n.service';
import { CaseWorkflowInfo } from '../models';
import { Observable } from 'rxjs';

export interface Bilingual { en: string; he: string }
export interface StatusInfo { label: Bilingual; badge: string; category: string; stage: string | null }
export interface ActionMeta { track: string; label: Bilingual; from: string[]; to: string | null; actors: string[] }
export interface QueueMeta {
  key: string; label: Bilingual; track: string; statuses: string[];
  requiresEntitlement: string; requiresAlso?: string; excludesEntitlement?: string;
  applyScope: boolean; hideReferredAbove: boolean;
}
export interface WorkflowDefinitionView {
  definitionId: number; key: string; version: number;
  stages: { key: string; label: Bilingual }[];
  /** track -> status key -> display info (includes statuses that only older versions define) */
  statuses: Record<string, Record<string, StatusInfo>>;
  queues: QueueMeta[];
  actions: Record<string, ActionMeta>;
}

export interface EligibleStaff { userId: number; name: string; role: string; available: boolean; load: number; lastAssignedAt: string | null }
export interface SlaCounts { green: number; amber: number; red: number; unassigned: number; total: number }
export interface SlaUnit { unitId: number; name: string; code: string; parentId: number | null; own: SlaCounts; total: SlaCounts }
export interface SlaSummary { units: SlaUnit[]; noUnit: SlaCounts }

/** What the signed-in caller may do to one case right now (GET /api/workflow/cases/:ref/actions). */
export interface CaseActions {
  allowed: { key: string; track: string; label: Bilingual }[];
  blocked: Record<string, { code: string; label: Bilingual }>;
}

// Existing pages render the disbursement track through these i18n keys, so the definition's labels
// are layered over them rather than renaming every call site.
const DISBURSEMENT_LABEL_KEYS: Record<string, string> = {
  NOT_STARTED: 'uw.notStarted',
  SECOND_CHECK_PENDING: 'uw.pendingDisbursement',
  FUNDS_RELEASED: 'uw.disbursed',
};

/** The workflow definition as the UI sees it. Status names, badge colours, queue contents and which
 * statuses allow which action all come from the published definition, so an admin changing the
 * workflow changes the screens without a code change. Every lookup takes a fallback, used until
 * the definition has loaded (or if it can't), so a page never renders empty. */
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  definition = signal<WorkflowDefinitionView | null>(null);

  constructor(private http: HttpClient, private auth: AuthService, private i18n: I18nService) {
    effect(() => {
      if (this.auth.currentUser()) this.load();
      else { this.definition.set(null); this.i18n.setOverlay({}); }
    });
  }

  load(): void {
    this.http.get<WorkflowDefinitionView>(`${API_BASE}/api/workflow/definition`).subscribe({
      next: d => this.apply(d),
      error: () => { /* keep the built-in labels and rules */ },
    });
  }

  private apply(d: WorkflowDefinitionView): void {
    const overlay: Record<string, Bilingual> = {};
    for (const [key, info] of Object.entries(d.statuses['case'] ?? {})) overlay[`status.${key}`] = info.label;
    for (const [key, info] of Object.entries(d.statuses['disbursement'] ?? {})) {
      const i18nKey = DISBURSEMENT_LABEL_KEYS[key];
      if (i18nKey) overlay[i18nKey] = info.label;
    }
    this.i18n.setOverlay(overlay);
    this.definition.set(d);
  }

  statusInfo(status: string, track = 'case'): StatusInfo | null {
    return this.definition()?.statuses[track]?.[status] ?? null;
  }

  /** CSS class for a status badge, from the definition's badge for that status. */
  badgeClass(status: string, fallback = 'db-badge--draft'): string {
    const info = this.statusInfo(status);
    return info ? `db-badge--${info.badge}` : fallback;
  }

  /** True when `action` may be taken from `status` (by a customer by default). Callers pass what
   * the page did before so behaviour is unchanged until the definition is available. */
  canDo(action: string, status: string, fallback: boolean, actor: 'CUSTOMER' | 'STAFF' = 'CUSTOMER'): boolean {
    const a = this.definition()?.actions[action];
    if (!a) return fallback;
    return a.actors.includes(actor) && (a.from.includes('*') || a.from.includes(status));
  }

  /** The customer can still be working on the application (draft, or sent back to them). */
  isEditable(status: string): boolean {
    const info = this.statusInfo(status);
    return info ? info.category === 'DRAFT' || info.category === 'WAITING_CUSTOMER' : status === 'DRAFT' || status === 'IN_PROGRESS';
  }

  queueStatuses(key: string, fallback: string[]): string[] {
    return this.definition()?.queues.find(q => q.key === key)?.statuses ?? fallback;
  }

  caseActions(appRef: string) {
    return this.http.get<CaseActions>(`${API_BASE}/api/workflow/cases/${appRef}/actions`);
  }

  // ---- ownership, availability and SLA
  caseState(appRef: string): Observable<CaseWorkflowInfo> { return this.http.get<CaseWorkflowInfo>(`${API_BASE}/api/workflow/cases/${appRef}/state`); }
  claim(appRef: string): Observable<CaseWorkflowInfo> { return this.http.post<CaseWorkflowInfo>(`${API_BASE}/api/workflow/cases/${appRef}/claim`, {}); }
  release(appRef: string): Observable<CaseWorkflowInfo> { return this.http.post<CaseWorkflowInfo>(`${API_BASE}/api/workflow/cases/${appRef}/release`, {}); }
  assign(appRef: string, userId: number): Observable<CaseWorkflowInfo> { return this.http.post<CaseWorkflowInfo>(`${API_BASE}/api/workflow/cases/${appRef}/assign`, { userId }); }
  eligible(appRef: string): Observable<EligibleStaff[]> { return this.http.get<EligibleStaff[]>(`${API_BASE}/api/workflow/cases/${appRef}/eligible`); }
  availability(): Observable<{ available: boolean }> { return this.http.get<{ available: boolean }>(`${API_BASE}/api/workflow/availability`); }
  setAvailability(available: boolean): Observable<{ available: boolean }> { return this.http.put<{ available: boolean }>(`${API_BASE}/api/workflow/availability`, { available }); }
  slaSummary(): Observable<SlaSummary> { return this.http.get<SlaSummary>(`${API_BASE}/api/workflow/sla-summary`); }
}
