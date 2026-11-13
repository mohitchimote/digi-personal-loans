import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

// Mirrors worker/src/lib/letters/types.ts (language-neutral model: letter-spec/README.md).
export interface Bi { en: string; he: string }
export type FieldType = 'text' | 'number' | 'money' | 'percent' | 'date' | 'bool' | 'choice' | 'list';
export interface Choice { v: string; en: string; he: string }
export interface FieldMeta { label: Bi; type: FieldType; fmt?: string; choices?: Choice[]; itemFields?: Record<string, FieldMeta> }
export interface Dictionary { formatVersion: 1; fields: Record<string, FieldMeta>; storedOnApplication?: string[] }

export type Operator = 'eq' | 'ne' | 'contains' | 'in' | 'empty' | 'notEmpty' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'isYes' | 'isNo' | 'before' | 'after' | 'withinDays' | 'ageAtLeast' | 'ageBelow' | 'anyMatch' | 'noneMatch';
export interface Rhs { k: 'value' | 'field' | 'today'; v?: string | number | boolean; v2?: number; list?: string[] }
export interface ConditionRule { t: 'condition'; field: string; op: Operator; rhs?: Rhs; nested?: GroupRule }
export interface GroupRule { t: 'group'; op: 'all' | 'any'; not?: boolean; items: Rule[] }
export interface RefRule { t: 'ref'; id: string }
export type Rule = ConditionRule | GroupRule | RefRule;
export interface SavedRule { id: string; name: string; rule: Rule }

export type LetterNode =
  | { id: string; t: 'heading'; text: Bi }
  | { id: string; t: 'paragraph'; text: Bi }
  | { id: string; t: 'list'; items: Bi[] }
  | { id: string; t: 'table'; rows: { label: Bi; value: Bi }[] }
  | { id: string; t: 'image'; imageId?: string; kind?: string; alt: Bi }
  | { id: string; t: 'signature'; imageId?: string; caption: Bi }
  | { id: string; t: 'when'; rule: Rule | null; children: LetterNode[] }
  | { id: string; t: 'repeat'; over: string; where: Rule | null; children: LetterNode[] }
  | { id: string; t: 'alternatives'; variants: { rule: Rule | null; children: LetterNode[] }[] };
export interface LetterDocument { formatVersion: 1; header: LetterNode[]; body: LetterNode[]; footer: LetterNode[] }

export interface LetterIssue { severity: 'error' | 'warning'; code: string; message: string; nodeId?: string }
export interface LetterTemplateRow { key: string; nameEn: string; nameHe: string; description: string | null; appliesTo: 'PERSONAL' | 'BUSINESS' | 'BOTH'; publishedVersion: number | null; hasDraft: boolean; versionCount: number }
export interface LetterVersionInfo { version: number; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; changeNote: string | null; createdAt: string; createdBy: string | null; publishedAt: string | null; publishedBy: string | null }
export interface LetterImage { id: string; name: string; kind: string; mimeType: string; width: number | null; height: number | null; sizeBytes: number }

/** Admin API for letter templates, shared rules, pictures and the data dictionary. */
@Injectable({ providedIn: 'root' })
export class LettersService {
  private readonly base = `${API_BASE}/api/auth/admin/letters`;
  constructor(private http: HttpClient) {}

  dictionary(): Observable<Dictionary> { return this.http.get<Dictionary>(`${this.base}/dictionary`); }
  rules(): Observable<SavedRule[]> { return this.http.get<SavedRule[]>(`${this.base}/rules`); }
  saveRule(name: string, rule: Rule): Observable<SavedRule> { return this.http.post<SavedRule>(`${this.base}/rules`, { name, rule }); }
  images(): Observable<LetterImage[]> { return this.http.get<LetterImage[]>(`${this.base}/images`); }
  uploadImage(name: string, kind: string, dataBase64: string): Observable<LetterImage> { return this.http.post<LetterImage>(`${this.base}/images`, { name, kind, dataBase64 }); }

  templates(): Observable<LetterTemplateRow[]> { return this.http.get<LetterTemplateRow[]>(`${this.base}/templates`); }
  create(body: { nameEn: string; nameHe: string; description?: string; appliesTo: string; starter: boolean }): Observable<{ key: string }> { return this.http.post<{ key: string }>(`${this.base}/templates`, body); }
  template(key: string): Observable<LetterTemplateRow & { versions: LetterVersionInfo[] }> { return this.http.get<LetterTemplateRow & { versions: LetterVersionInfo[] }>(`${this.base}/templates/${key}`); }
  version(key: string, which: string | number): Observable<LetterVersionInfo & { document: LetterDocument }> { return this.http.get<LetterVersionInfo & { document: LetterDocument }>(`${this.base}/templates/${key}/versions/${which}`); }
  saveDraft(key: string, document: LetterDocument, changeNote?: string): Observable<{ version: number; issues: LetterIssue[] }> { return this.http.put<{ version: number; issues: LetterIssue[] }>(`${this.base}/templates/${key}/draft`, { document, changeNote }); }
  discardDraft(key: string): Observable<unknown> { return this.http.post(`${this.base}/templates/${key}/discard-draft`, {}); }
  validate(key: string, document: LetterDocument): Observable<{ issues: LetterIssue[]; canPublish: boolean }> { return this.http.post<{ issues: LetterIssue[]; canPublish: boolean }>(`${this.base}/templates/${key}/validate`, { document }); }
  publish(key: string): Observable<{ version: number }> { return this.http.post<{ version: number }>(`${this.base}/templates/${key}/publish`, {}); }
  preview(key: string, document: LetterDocument, applicationRef?: string): Observable<Blob> {
    return this.http.post(`${this.base}/templates/${key}/preview`, { document, applicationRef: applicationRef || undefined }, { responseType: 'blob' });
  }
}
