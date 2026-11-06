import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BrandingService } from './core/services/branding.service';
import { WorkflowService } from './core/services/workflow.service';
import { ConnectionWatchdogBannerComponent } from './shared/connection-watchdog-banner/connection-watchdog-banner.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConnectionWatchdogBannerComponent],
  template: '<app-connection-watchdog-banner /><router-outlet />',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  // WorkflowService is injected so it starts loading the definition as soon as someone is signed in.
  constructor(private branding: BrandingService, private workflow: WorkflowService) {}

  ngOnInit(): void {
    this.branding.loadAndApply();
  }
}
