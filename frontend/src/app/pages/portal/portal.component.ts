import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
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
}
