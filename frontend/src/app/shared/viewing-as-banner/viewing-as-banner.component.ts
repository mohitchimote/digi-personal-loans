import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe } from '../pipes/translate.pipe';

/** Shown on every screen while an administrator is viewing the system as another user, so it is
 * never mistaken for the user's own session. The session is read-only; Exit returns to the admin. */
@Component({
  selector: 'app-viewing-as-banner',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="viewing-as" *ngIf="auth.isViewingAs" role="status">
      <span class="material-icons mi-sm">visibility</span>
      <span>
        {{ 'viewas.banner' | translate }}
        <strong>{{ auth.userFullName }}</strong>
        <span class="role">({{ auth.roleLabel || auth.role }})</span>
        &middot; {{ 'viewas.readOnly' | translate }}
        &middot; {{ 'viewas.by' | translate }} {{ auth.currentUser()?.viewingAs?.administrator }}
      </span>
      <button class="db-btn db-btn--sm exit" (click)="exit()">{{ 'viewas.exit' | translate }}</button>
    </div>
  `,
  styles: [`
    .viewing-as { position: sticky; top: 0; z-index: 1000; display: flex; align-items: center; gap: 10px;
      padding: 8px 24px; background: #7a1f1f; color: #fff; font-size: 13px; }
    .role { opacity: .85; }
    .exit { margin-inline-start: auto; background: #fff; color: #7a1f1f; border: 0; font-weight: 600; }
  `],
})
export class ViewingAsBannerComponent {
  constructor(public auth: AuthService, private router: Router) {}

  exit(): void {
    this.auth.exitViewAs().subscribe({ next: () => this.router.navigate([this.auth.isInsideLender || this.auth.isAdmin ? '/admin/users' : this.auth.homePath]) });
  }
}
