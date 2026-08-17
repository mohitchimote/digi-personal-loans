import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, timeout } from 'rxjs/operators';
import { ConnectionWatchdogService } from '../services/connection-watchdog.service';

/** Backstop so a request that outlives the watchdog's auto-reload (e.g. once the per-session
 * auto-reload budget is spent) still errors out instead of hanging its caller forever. */
const REQUEST_TIMEOUT_MS = 15000;

export const connectionWatchdogInterceptor: HttpInterceptorFn = (req, next) => {
  const watchdog = inject(ConnectionWatchdogService);
  const id = watchdog.start();
  return next(req).pipe(
    timeout(REQUEST_TIMEOUT_MS),
    finalize(() => watchdog.finish(id))
  );
};
