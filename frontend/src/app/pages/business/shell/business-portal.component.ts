import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { SidebarComponent, NavItem } from '../../../shared/sidebar/sidebar.component';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoanApplication } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { LanguageSwitcherComponent } from '../../../shared/language-switcher/language-switcher.component';

/** Mirrors PortalComponent exactly, but for business applicants — same header/sidebar shell,
 * pointed at /business/* routes and business wizard steps via SidebarComponent's inputs. */
@Component({
  selector: 'app-business-portal',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, TranslatePipe, LanguageSwitcherComponent],
  templateUrl: './business-portal.component.html',
  styleUrl: './business-portal.component.scss'
})
export class BusinessPortalComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  sidebarCollapsed = signal(false);

  constructor(private appSvc: ApplicationService, public auth: AuthService, private router: Router) {}

  /** Guarantor Details is only inserted when an underwriter has flagged guarantorRequired (see
   * ApplicationService.sendBackApplication) — never shown in the first pass. */
  get businessSteps(): NavItem[] {
    const steps: NavItem[] = [
      { labelKey: 'company.stepCompanyDetails', route: '/business/apply/company-details', sectionKey: 'companyDetails' },
      { labelKey: 'company.stepSignatories',    route: '/business/apply/signatories',     sectionKey: 'signatories' },
    ];
    if (this.application()?.guarantorRequired) {
      steps.push({ labelKey: 'guarantor.title', route: '/business/apply/guarantor-details', sectionKey: 'guarantorDetails' });
    }
    steps.push(
      { labelKey: 'company.stepConnectBank',        route: '/business/apply/connect-bank',         sectionKey: 'connectBusinessBank' },
      { labelKey: 'company.stepFinancials',         route: '/business/apply/financials',           sectionKey: 'businessFinancials' },
      { labelKey: 'company.stepOutgoings',          route: '/business/apply/outgoings',            sectionKey: 'businessOutgoings' },
      { labelKey: 'company.stepCreditDeclarations', route: '/business/apply/credit-declarations',  sectionKey: 'businessCreditDeclarations' },
      { labelKey: 'steps.verifyId',                 route: '/business/apply/verify-id',            sectionKey: 'verifyId' },
      { labelKey: 'steps.directDebit',              route: '/business/apply/direct-debit',         sectionKey: 'directDebit' },
      { labelKey: 'steps.reviewSubmit',             route: '/business/apply/review-submit',        sectionKey: 'reviewSubmit' },
    );
    return steps;
  }

  ngOnInit(): void {
    this.refreshApplication();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.refreshApplication());
  }

  get sectionValues(): Record<string, string | undefined> {
    const app = this.application();
    return {
      companyDetails:             app?.companyDetailsJson,
      signatories:                app?.signatoriesJson,
      guarantorDetails:           app?.guarantorDetailsJson,
      connectBusinessBank:        app?.businessBankConnectionJson,
      businessFinancials:         app?.businessFinancialsJson,
      businessOutgoings:          app?.businessOutgoingsJson,
      businessCreditDeclarations: app?.businessCreditDeclarationsJson,
      verifyId:                   app?.verifyIdJson,
      directDebit:                app?.directDebitJson,
      reviewSubmit:               app?.reviewSubmitJson,
    };
  }

  private refreshApplication(): void {
    const userId = this.auth.userId;
    if (!userId) return;
    const appRef = this.findAppRefParam(this.router.routerState.snapshot.root);
    const source = appRef ? this.appSvc.getApplication(appRef) : this.appSvc.getCurrent(userId);
    source.subscribe({
      next: app => this.application.set(app),
      error: () => {}
    });
  }

  private findAppRefParam(route: ActivatedRouteSnapshot): string | null {
    if (route.paramMap.has('appRef')) return route.paramMap.get('appRef');
    for (const child of route.children) {
      const found = this.findAppRefParam(child);
      if (found) return found;
    }
    return null;
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.set(!this.sidebarCollapsed());
  }
}
