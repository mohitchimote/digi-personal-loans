import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AffordabilityResult } from '../models';

const API = 'http://localhost:8080/api/affordability';

@Injectable({ providedIn: 'root' })
export class AffordabilityService {
  constructor(private http: HttpClient) {}

  check(request: any): Observable<AffordabilityResult> {
    return this.http.post<AffordabilityResult>(`${API}/check`, request);
  }
}
