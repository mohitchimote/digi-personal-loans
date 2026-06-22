import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { ApplicationService } from '../services/application.service';
import { AuthService } from '../services/auth.service';
import { AssistContextService } from '../services/assist-context.service';
import { LoanApplication } from '../models';

/** Resolvers block route (and child route) activation until they complete — unlike starting the
 * assist context from a component's ngOnInit, which races the child wizard step's own ngOnInit
 * and can lose, leaving EffectiveIdentityService silently falling back to the Banker's own
 * identity (this raced and lost in testing, creating a stray draft application for the Banker
 * instead of editing the customer's). Attached to the `case/:appRef/apply` parent route so
 * AssistContextService is guaranteed populated before any wizard step component initializes.
 *
 * Also fetches the customer's own profile (name/phone/National ID/issue date) so Personal Details
 * (and Company Details for business) can prefill it, the same way it would for the customer's own
 * login session — that data was already captured when the account was created (self-registration
 * or BankerCreateApplicationComponent) and isn't the Banker's to begin with. Best-effort: a failed
 * profile lookup still lets the assist session start, just without prefill. */
export const assistContextResolver: ResolveFn<LoanApplication> = (route) => {
  const appSvc = inject(ApplicationService);
  const auth = inject(AuthService);
  const assist = inject(AssistContextService);
  const appRef = route.paramMap.get('appRef')!;

  return appSvc.getApplication(appRef).pipe(
    switchMap(app => auth.getCustomerProfile(app.customerId).pipe(
      map(res => res.data),
      catchError(() => of(null)),
      map(profile => {
        assist.start({
          customerId: app.customerId,
          customerEmail: app.customerEmail,
          appRef: app.applicationRef,
          applicationType: app.applicationType === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL',
          customerFullName: profile?.fullName ?? null,
          customerPhone: profile?.phoneNumber ?? null,
          customerNationalId: profile?.nationalId ?? null,
          customerIdIssueDate: profile?.idIssueDate ?? null,
          customerCompanyName: profile?.companyName ?? null,
        });
        return app;
      })
    ))
  );
};
