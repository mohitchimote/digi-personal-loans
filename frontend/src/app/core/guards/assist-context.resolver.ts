import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { tap } from 'rxjs/operators';
import { ApplicationService } from '../services/application.service';
import { AssistContextService } from '../services/assist-context.service';
import { LoanApplication } from '../models';

/** Resolvers block route (and child route) activation until they complete — unlike starting the
 * assist context from a component's ngOnInit, which races the child wizard step's own ngOnInit
 * and can lose, leaving EffectiveIdentityService silently falling back to the Banker's own
 * identity (this raced and lost in testing, creating a stray draft application for the Banker
 * instead of editing the customer's). Attached to the `case/:appRef/apply` parent route so
 * AssistContextService is guaranteed populated before any wizard step component initializes. */
export const assistContextResolver: ResolveFn<LoanApplication> = (route) => {
  const appSvc = inject(ApplicationService);
  const assist = inject(AssistContextService);
  const appRef = route.paramMap.get('appRef')!;

  return appSvc.getApplication(appRef).pipe(
    tap(app => assist.start({
      customerId: app.customerId,
      customerEmail: app.customerEmail,
      appRef: app.applicationRef,
      applicationType: app.applicationType === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL'
    }))
  );
};
