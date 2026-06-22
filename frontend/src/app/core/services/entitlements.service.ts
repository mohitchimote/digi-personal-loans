import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

/** Single source of truth for what a role is allowed to do, beyond which routes/shells it can
 * reach (that's still the role guards). Anything that differs between "customer filling their
 * own application" and "staff filling it on a customer's behalf" — extra menus, extra fields,
 * free section navigation — should be gated through a flag here, not an ad-hoc role check
 * scattered into a shared component. Add a flag here first when a new staff-only capability is
 * needed; only then wire it into the relevant template. */
@Injectable({ providedIn: 'root' })
export class EntitlementsService {
  constructor(private auth: AuthService) {}

  /** Can open and edit another customer's in-progress application (the Banker "assist" flow). */
  get canActAsCustomer(): boolean {
    return this.auth.role === 'BANKER';
  }

  /** Can jump directly to any wizard section instead of following the customer's sequential,
   * progress-gated step order. */
  get canFreelyNavigateSections(): boolean {
    return this.auth.role === 'BANKER';
  }
}
