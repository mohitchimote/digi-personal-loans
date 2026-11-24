import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // A super admin outside any lender has nothing to administer here: pick a lender first.
  if (auth.isLoggedIn && auth.isAtPlatformLevel) { router.navigate(['/platform']); return false; }
  if (auth.isLoggedIn && auth.isAdmin) return true;
  router.navigate(['/login']);
  return false;
};
