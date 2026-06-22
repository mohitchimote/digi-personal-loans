import { Injectable, signal } from '@angular/core';

export interface AssistTarget {
  customerId: number;
  customerEmail: string;
  appRef: string;
  applicationType: 'PERSONAL' | 'BUSINESS';
  /** The customer's own profile data, captured at account creation — never the Banker's. Used to
   * prefill wizard sections (e.g. Personal Details) the way a normal customer's own login data
   * would. Optional because it's a best-effort fetch (see assistContextResolver) — missing it
   * just means no prefill, not a broken assist session. */
  customerFullName?: string | null;
  customerPhone?: string | null;
  customerNationalId?: string | null;
  customerIdIssueDate?: string | null;
  customerCompanyName?: string | null;
}

/** Holds the active "Banker acting as customer X" target while a staff member fills in a
 * customer's wizard on their behalf. The real wizard step components (LoanRequirementsComponent,
 * PersonalDetailsComponent, etc.) never know this exists directly — they read identity through
 * EffectiveIdentityService, which consults this service. */
@Injectable({ providedIn: 'root' })
export class AssistContextService {
  private target = signal<AssistTarget | null>(null);

  get current(): AssistTarget | null {
    return this.target();
  }

  get isActive(): boolean {
    return this.target() !== null;
  }

  start(target: AssistTarget): void {
    this.target.set(target);
  }

  stop(): void {
    this.target.set(null);
  }
}
