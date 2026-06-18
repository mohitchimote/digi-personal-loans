import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GeneratedDocument } from '../models';

const API = 'http://localhost:8080/api/documents';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  constructor(private http: HttpClient) {}

  generate(request: any): Observable<GeneratedDocument> {
    return this.http.post<GeneratedDocument>(`${API}/generate`, request);
  }

  getGenerated(customerId: number): Observable<GeneratedDocument[]> {
    return this.http.get<GeneratedDocument[]>(`${API}/customer/${customerId}`);
  }

  getUploaded(appRef: string): Observable<any[]> {
    return this.http.get<any[]>(`${API}/uploaded/${appRef}`);
  }

  upload(appRef: string, customerId: number, file: File, docType = 'SUPPORTING'): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    form.append('applicationRef', appRef);
    form.append('customerId', String(customerId));
    form.append('documentType', docType);
    return this.http.post<any>(`${API}/upload`, form);
  }

  download(docId: string | number): void {
    window.open(`${API}/${docId}/download`, '_blank');
  }
}
