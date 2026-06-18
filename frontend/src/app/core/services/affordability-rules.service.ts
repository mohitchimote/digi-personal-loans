import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from './api-base';

export interface AffordabilityRules {
  maxDti: number;
  maxHti: number;
  minMonthlyIncome: number;
  baseAnnualRate: number;
  repaymentCapacityFactor: number;
  minCreditScore: number;
  autoApprovalThresholdSingle: number;
  autoApprovalThresholdJoint: number;
}

const API = `${API_BASE}/api/affordability`;

@Injectable({ providedIn: 'root' })
export class AffordabilityRulesService {
  constructor(private http: HttpClient) {}

  getRules(): Observable<AffordabilityRules> {
    return this.http.get<AffordabilityRules>(`${API}/rules`);
  }

  updateRules(rules: AffordabilityRules): Observable<AffordabilityRules> {
    return this.http.put<AffordabilityRules>(`${API}/rules`, rules);
  }
}
