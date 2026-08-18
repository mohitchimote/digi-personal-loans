import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

export interface EmailVariable {
  name: string;
  description: string;
}

export interface EmailEventMeta {
  eventKey: string;
  label: string;
  description: string;
  variables: EmailVariable[];
}

export interface EmailTemplate {
  id: number;
  eventKey: string;
  enabled: boolean;
  toAddress: string | null;
  ccAddress: string | null;
  subject: string;
  headerContent: string | null;
  bodyContent: string;
  signature: string | null;
  footer: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  label: string;
  description: string;
  variables: EmailVariable[];
}

export type EmailTemplateDraft = Partial<
  Pick<EmailTemplate, 'subject' | 'headerContent' | 'bodyContent' | 'signature' | 'footer' | 'ccAddress'>
>;

const API = `${API_BASE}/api/auth/admin/email-templates`;

@Injectable({ providedIn: 'root' })
export class EmailTemplateService {
  constructor(private http: HttpClient) {}

  getEvents(): Observable<EmailEventMeta[]> {
    return this.http.get<EmailEventMeta[]>(`${API}/events`);
  }

  getTemplates(): Observable<EmailTemplate[]> {
    return this.http.get<EmailTemplate[]>(`${API}`);
  }

  updateTemplate(eventKey: string, body: Partial<EmailTemplate>): Observable<EmailTemplate> {
    return this.http.put<EmailTemplate>(`${API}/${eventKey}`, body);
  }

  preview(eventKey: string, draft: EmailTemplateDraft): Observable<{ html: string }> {
    return this.http.post<{ html: string }>(`${API}/${eventKey}/preview`, draft);
  }

  sendTest(eventKey: string, draft: EmailTemplateDraft): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${API}/${eventKey}/test`, draft);
  }
}
