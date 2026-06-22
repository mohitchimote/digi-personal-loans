import { Injectable, signal } from '@angular/core';

export interface AssistTarget {
  customerId: number;
  customerEmail: string;
  appRef: string;
  applicationType: 'PERSONAL' | 'BUSINESS';
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
