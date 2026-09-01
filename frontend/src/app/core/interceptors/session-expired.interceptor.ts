import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { I18nService } from '../i18n/i18n.service';

/** A 401 only ever means "the token was missing/invalid/expired" — every backend (Worker and,
 * as of the auth fix, every Java service) uses 401 exclusively for that and reserves 403 for
 * "valid token, wrong role" (see PRODUCTION_READINESS.md §5). So any 401 on an authenticated
 * request means the session is dead server-side; nothing short-lived like a wrong-OTP submission
 * can produce one, since login/OTP endpoints are public and fail with 400, not 401. */
export const sessionExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const i18n = inject(I18nService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && auth.isLoggedIn) {
        auth.logout(i18n.t('login.sessionExpired'));
      }
      return throwError(() => err);
    })
  );
};
