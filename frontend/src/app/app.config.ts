import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { PreloadAllModules, provideRouter, withPreloading } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { sessionExpiredInterceptor } from './core/interceptors/session-expired.interceptor';
import { connectionWatchdogInterceptor } from './core/interceptors/connection-watchdog.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    /* Every route is lazy-loaded with no preloading, so a click on any sidebar link previously
     * had to download that route's JS chunk over the network at the exact same moment it fired
     * that page's API calls, on the same connection. Real-world DevTools timing showed the API
     * call sitting in "Stalled" — Chrome's network scheduler deprioritizing it behind the
     * higher-priority script fetch. Preloading every chunk in the background right after bootstrap
     * means navigation-time requests are just the API call, not a script download racing it. */
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptors([authInterceptor, sessionExpiredInterceptor, connectionWatchdogInterceptor])),
    provideAnimations()
  ]
};
