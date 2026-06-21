import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AffordabilityResult, BusinessAffordabilityResult } from '../models';
import { API_BASE } from './api-base';

const API = `${API_BASE}/api/affordability`;

@Injectable({ providedIn: 'root' })
export class AffordabilityService {
  constructor(private http: HttpClient) {}

  check(request: any): Observable<AffordabilityResult> {
    return this.http.post<AffordabilityResult>(`${API}/check`, request);
  }

  checkBusiness(request: any): Observable<BusinessAffordabilityResult> {
    return this.http.post<BusinessAffordabilityResult>(`${API}/check-business`, request);
  }
}
