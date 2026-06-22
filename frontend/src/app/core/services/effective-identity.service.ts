import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { AssistContextService } from './assist-context.service';

/** Facade every wizard component reads identity through instead of AuthService directly. For a
 * normal customer this is a pass-through to AuthService. While a Banker is assisting, it resolves
 * to the assisted customer's identity instead — so the exact same wizard component works for both
 * without a single role check inside it. Convenience-prefill fields (phone/National ID/issue
 * date/company name) read from the customer's own profile while assisting (fetched by
 * assistContextResolver) — never the Banker's own AuthService data. */
@Injectable({ providedIn: 'root' })
export class EffectiveIdentityService {
  constructor(private auth: AuthService, private assist: AssistContextService) {}

  get isAssisting(): boolean {
    return this.assist.isActive;
  }

  get userId(): number | null {
    return this.assist.current?.customerId ?? this.auth.userId;
  }

  get userEmail(): string | null {
    return this.assist.current?.customerEmail ?? this.auth.userEmail;
  }

  /** Pins a wizard step to the exact application a Banker opened, instead of resolveEditable()
   * falling back to "this customer's most recently updated application" — which could be the
   * wrong one if they have more than one. Null for a normal customer (unused in that path). */
  get appRef(): string | null {
    return this.assist.current?.appRef ?? null;
  }

  get userPhone(): string | null {
    return this.isAssisting ? (this.assist.current?.customerPhone ?? null) : this.auth.userPhone;
  }

  get userNationalId(): string | null {
    return this.isAssisting ? (this.assist.current?.customerNationalId ?? null) : this.auth.userNationalId;
  }

  get userIdIssueDate(): string | null {
    return this.isAssisting ? (this.assist.current?.customerIdIssueDate ?? null) : this.auth.userIdIssueDate;
  }

  get userFullName(): string | null {
    return this.isAssisting ? (this.assist.current?.customerFullName ?? null) : this.auth.userFullName;
  }

  get companyName(): string | null {
    return this.isAssisting ? (this.assist.current?.customerCompanyName ?? null) : this.auth.companyName;
  }

  /** "Save & Next" route for a wizard step — every step hardcodes its own next-step slug. While
   * assisting, that needs to land back inside the Banker shell instead of the customer's /portal
   * or /business routes (wrong shell entirely, and the Banker isn't logged in as that customer). */
  applyUrl(routeSlug: string, isBusiness = false, toCaseOverview = false): any[] {
    if (this.isAssisting) {
      if (toCaseOverview) return ['/banker/case', this.appRef];
      return ['/banker/case', this.appRef, 'apply', isBusiness ? 'business' : 'personal', routeSlug];
    }
    return [isBusiness ? '/business/apply' : '/portal/apply', routeSlug];
  }

  /** Same idea as applyUrl, but for the post-submit stages (review-submit, affordability-results,
   * products, approval) which live outside /portal/apply|/business/apply for a normal customer —
   * they take an explicit customer-side prefix instead of assuming the wizard's "apply" base. */
  stepUrl(routeSlug: string, isBusiness: boolean, customerPrefix: string): any[] {
    if (this.isAssisting) {
      return ['/banker/case', this.appRef, 'apply', isBusiness ? 'business' : 'personal', routeSlug];
    }
    return [customerPrefix, routeSlug];
  }
}
