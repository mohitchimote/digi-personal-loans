import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { LanguageSwitcherComponent } from '../../../shared/language-switcher/language-switcher.component';
import { BrandLogoComponent } from '../../../shared/brand-logo/brand-logo.component';
import { ADMIN_NAV } from './admin-nav';

const COLLAPSED_KEY = 'admin.rail.collapsed';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe, LanguageSwitcherComponent, BrandLogoComponent],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss'
})
export class AdminShellComponent {
  readonly nav = ADMIN_NAV;
  readonly collapsed = signal(this.loadCollapsed());

  constructor(public auth: AuthService) {}

  toggleRail(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* storage unavailable: just don't remember */ }
  }

  private loadCollapsed(): boolean {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  }
}
