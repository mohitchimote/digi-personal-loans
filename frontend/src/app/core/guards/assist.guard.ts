import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { EntitlementsService } from '../services/entitlements.service';

/** Gates the Banker's "act as customer" wizard routes specifically — distinct from bankerGuard
 * (which just gates the Banker shell generally) so the check reflects the actual capability
 * being exercised, via EntitlementsService, rather than a raw role check duplicated here. */
export const assistGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const entitlements = inject(EntitlementsService);
  const router = inject(Router);
  if (auth.isLoggedIn && entitlements.canActAsCustomer) return true;
  router.navigate(['/login']);
  return false;
};
