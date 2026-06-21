import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { SidebarComponent, NavItem } from '../../shared/sidebar/sidebar.component';
import { ChatbotComponent } from '../../shared/chatbot/chatbot.component';
import { ApplicationService } from '../../core/services/application.service';
import { AuthService } from '../../core/services/auth.service';
import { LoanApplication } from '../../core/models';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { LanguageSwitcherComponent } from '../../shared/language-switcher/language-switcher.component';

@Component({
  selector: 'app-portal',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, ChatbotComponent, TranslatePipe, LanguageSwitcherComponent],
  templateUrl: './portal.component.html',
  styleUrl: './portal.component.scss'
})
export class PortalComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  sidebarCollapsed = signal(false);

  constructor(private appSvc: ApplicationService, public auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.refreshApplication();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.refreshApplication());
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

  /** Guarantor Details is only inserted when an underwriter has flagged guarantorRequired (see
   * ApplicationService.sendBackApplication) — never shown in the first pass. */
  get applicationSteps(): NavItem[] {
    const steps: NavItem[] = [
      { labelKey: 'steps.loanRequirements', route: '/portal/apply/loan-requirements', sectionKey: 'loanRequirements' },
      { labelKey: 'steps.personalDetails',  route: '/portal/apply/personal-details',  sectionKey: 'personalDetails' },
    ];
    if (this.application()?.guarantorRequired) {
      steps.push({ labelKey: 'guarantor.title', route: '/portal/apply/guarantor-details', sectionKey: 'guarantorDetails' });
    }
    steps.push(
      { labelKey: 'steps.connectBank',        route: '/portal/apply/connect-bank',        sectionKey: 'connectBank' },
      { labelKey: 'steps.incomeEmployment',   route: '/portal/apply/income-employment',   sectionKey: 'incomeEmployment' },
      { labelKey: 'steps.outgoings',          route: '/portal/apply/outgoings',           sectionKey: 'outgoings' },
      { labelKey: 'steps.creditDeclarations', route: '/portal/apply/credit-declarations', sectionKey: 'creditDeclarations' },
      { labelKey: 'steps.verifyId',           route: '/portal/apply/verify-id',           sectionKey: 'verifyId' },
      { labelKey: 'steps.directDebit',        route: '/portal/apply/direct-debit',        sectionKey: 'directDebit' },
      { labelKey: 'steps.reviewSubmit',       route: '/portal/apply/review-submit',       sectionKey: 'reviewSubmit' },
    );
    return steps;
  }
}
