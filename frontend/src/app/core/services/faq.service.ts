import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

export interface Faq {
  id: number;
  category: string;
  question: string;
  answer: string;
  videoId?: string;
  displayOrder: number;
}

const API = `${API_BASE}/api/auth`;

@Injectable({ providedIn: 'root' })
export class FaqService {
  constructor(private http: HttpClient) {}

  getFaqs(): Observable<Faq[]> {
    return this.http.get<Faq[]>(`${API}/faqs`);
  }

  createFaq(faq: Partial<Faq>): Observable<Faq> {
    return this.http.post<Faq>(`${API}/admin/faqs`, faq);
  }

  updateFaq(id: number, faq: Partial<Faq>): Observable<Faq> {
    return this.http.put<Faq>(`${API}/admin/faqs/${id}`, faq);
  }

  deleteFaq(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/admin/faqs/${id}`);
  }
}
