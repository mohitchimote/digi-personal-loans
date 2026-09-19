import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

const API = `${API_BASE}/api/auth/admin/form-builder`;

export type FormKey = 'personal-loan-wizard' | 'business-loan-wizard';
export type FieldKind = 'existing' | 'custom';
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'textarea';

export interface BilingualLabel {
  en: string;
  he: string;
}

export interface FieldOption {
  value: string;
  label: BilingualLabel;
}

export interface VisibilityRule {
  fieldKey: string;
  op: 'equals' | 'notEquals';
  value: string | number | boolean;
}

export interface FieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface FormField {
  key: string;
  sectionHeaderKey: string;
  kind: FieldKind;
  type?: FieldType;
  labelKey?: string;
  label?: BilingualLabel;
  helpText?: BilingualLabel;
  tooltip?: BilingualLabel;
  required: boolean;
  hidden?: boolean;
  order: number;
  options?: FieldOption[];
  validation?: FieldValidation;
  visibility?: VisibilityRule | null;
}

export interface FormSectionHeader {
  key: string;
  labelKey?: string;
  label?: BilingualLabel;
  order: number;
}

export interface FormSection {
  key: string;
  order: number;
  sideMenuLabelKey: string;
  sectionHeaders: FormSectionHeader[];
  fields: FormField[];
}

export interface FormVersionSchema {
  sections: FormSection[];
}

export type FormVersionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface FormVersionSummary {
  id: number;
  formKey: FormKey;
  version: number;
  status: FormVersionStatus;
  changeNote: string | null;
  createdAt: string;
  createdBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

export interface FormVersionFull extends FormVersionSummary {
  schemaJson: string;
}

export interface FormSummary {
  formKey: FormKey;
  published: { id: number; version: number; publishedAt: string | null; publishedBy: string | null } | null;
  draftCount: number;
  totalVersions: number;
}

@Injectable({ providedIn: 'root' })
export class FormBuilderService {
  constructor(private http: HttpClient) {}

  listForms(): Observable<FormSummary[]> {
    return this.http.get<FormSummary[]>(`${API}/forms`);
  }

  listVersions(formKey: FormKey): Observable<FormVersionSummary[]> {
    return this.http.get<FormVersionSummary[]>(`${API}/forms/${formKey}/versions`);
  }

  getVersion(id: number): Observable<FormVersionFull> {
    return this.http.get<FormVersionFull>(`${API}/versions/${id}`);
  }

  createDraft(formKey: FormKey, sourceVersionId: number | null = null): Observable<{ success: boolean; message: string; data: FormVersionFull }> {
    return this.http.post<{ success: boolean; message: string; data: FormVersionFull }>(`${API}/forms/${formKey}/draft`, { sourceVersionId });
  }

  saveDraft(id: number, schemaJson: string, changeNote: string | null): Observable<{ success: boolean; message: string; data: FormVersionFull }> {
    return this.http.put<{ success: boolean; message: string; data: FormVersionFull }>(`${API}/versions/${id}`, { schemaJson, changeNote });
  }

  publish(id: number): Observable<{ success: boolean; message: string; data: FormVersionFull }> {
    return this.http.post<{ success: boolean; message: string; data: FormVersionFull }>(`${API}/versions/${id}/publish`, {});
  }

  discardDraft(id: number): Observable<{ success: boolean; message: string; data: null }> {
    return this.http.delete<{ success: boolean; message: string; data: null }>(`${API}/versions/${id}`);
  }
}
