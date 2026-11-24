import { Component, OnInit, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BrandingService } from './core/services/branding.service';
import { AuthService } from './core/services/auth.service';
import { captureLenderFromUrl } from './core/services/lender-context';
import { WorkflowService } from './core/services/workflow.service';
import { ViewingAsBannerComponent } from './shared/viewing-as-banner/viewing-as-banner.component';
import { ConnectionWatchdogBannerComponent } from './shared/connection-watchdog-banner/connection-watchdog-banner.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConnectionWatchdogBannerComponent, ViewingAsBannerComponent],
  template: '<app-viewing-as-banner /><app-connection-watchdog-banner /><router-outlet />',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  // WorkflowService is injected so it starts loading the definition as soon as someone is signed in.
  constructor(private branding: BrandingService, private workflow: WorkflowService, private auth: AuthService) {
    // Branding is per lender: load it again when someone signs in or out.
    effect(() => { this.auth.currentUser(); this.branding.loadAndApply(); });
  }

  ngOnInit(): void {
    captureLenderFromUrl();
  }
}
