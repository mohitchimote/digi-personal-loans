import { Component, inject } from '@angular/core';
import { ConnectionWatchdogService } from '../../core/services/connection-watchdog.service';

@Component({
  selector: 'app-connection-watchdog-banner',
  template: `
    @if (watchdog.stuck()) {
      <div class="connection-banner" role="status">
        <span>{{ watchdog.reloading() ? 'Connection issue detected — reloading…' : 'Connection is slow. Reconnecting…' }}</span>
        <button type="button" (click)="watchdog.reloadNow()">Reload now</button>
      </div>
    }
  `,
  styleUrl: './connection-watchdog-banner.component.scss'
})
export class ConnectionWatchdogBannerComponent {
  protected watchdog = inject(ConnectionWatchdogService);
}
