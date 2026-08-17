import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BrandingService } from './core/services/branding.service';
import { ConnectionWatchdogBannerComponent } from './shared/connection-watchdog-banner/connection-watchdog-banner.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConnectionWatchdogBannerComponent],
  template: '<app-connection-watchdog-banner /><router-outlet />',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  constructor(private branding: BrandingService) {}

  ngOnInit(): void {
    this.branding.loadAndApply();
  }
}
