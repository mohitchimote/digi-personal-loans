import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { rememberedLender } from '../services/lender-context';

// Public, lender-specific reads: without a token the server needs to be told which lender.
const PUBLIC_LENDER_PATHS = [/^\/api\/branding$/, /^\/api\/masters(\/|$)/, /^\/api\/auth\/faqs$/];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token;
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  } else if (req.method === 'GET') {
    const lender = rememberedLender();
    const path = req.url.split('?')[0];
    if (lender && PUBLIC_LENDER_PATHS.some((p) => p.test(path)) && !req.params.has('lender')) {
      req = req.clone({ setParams: { lender } });
    }
  }
  return next(req);
};
