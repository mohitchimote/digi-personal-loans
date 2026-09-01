import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApplicationService } from '../../core/services/application.service';
import { LoanApplication, StaffActivityItem } from '../../core/models';
import { TranslatePipe } from '../pipes/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { LanguageSwitcherComponent } from '../language-switcher/language-switcher.component';
import { BrandLogoComponent } from '../brand-logo/brand-logo.component';
import { applicantDisplayName } from '../../core/utils/application-display';

export interface StaffNavItem {
  labelKey: string;
  route: string;
}

const MIN_SEARCH_CHARS = 3;
const MAX_RESULTS = 8;

/** Shared two-row header for the underwriter and banker shells (admin keeps its own) — brand,
 * global search, notification bell, date/time, and user info on top; tab navigation below. Both
 * shells wire in their own nav items and case-detail route prefix, everything else (search,
 * bell) is self-contained here since the underlying data (home-stats, staff-activity) is
 * identical for every staff role. */
@Component({
  selector: 'app-staff-header',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, TranslatePipe, LanguageSwitcherComponent, BrandLogoComponent],
  templateUrl: './staff-header.component.html',
  styleUrl: './staff-header.component.scss'
})
export class StaffHeaderComponent implements OnInit {
  @Input() brandKey = 'uw.brand';
  @Input() navItems: StaffNavItem[] = [];
  @Input() caseDetailBasePath = '/underwriter/case';

  now = signal(new Date());
  searchQuery = signal('');
  searchOpen = signal(false);
  bellOpen = signal(false);
  private appsCache = signal<LoanApplication[]>([]);
  private activity = signal<StaffActivityItem[]>([]);

  searchResults = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (q.length < MIN_SEARCH_CHARS) return [];
    return this.appsCache().filter(app => this.matches(app, q)).slice(0, MAX_RESULTS);
  });

  recentActivity = computed(() => this.activity().slice(0, 8));

  unreadCount = computed(() => {
    const since = this.auth.previousLogin;
    if (!since) return this.activity().length;
    const sinceTime = new Date(since).getTime();
    return this.activity().filter(a => new Date(a.createdAt).getTime() > sinceTime).length;
  });

  constructor(public auth: AuthService, private appSvc: ApplicationService, private router: Router, private i18n: I18nService) {}

  ngOnInit(): void {
    this.refreshCache();
    this.refreshActivity();
    setInterval(() => this.now.set(new Date()), 60_000);
  }

  onSearchFocus(): void {
    this.searchOpen.set(true);
    this.refreshCache();
  }

  onSearchBlur(): void {
    setTimeout(() => this.searchOpen.set(false), 150);
  }

  toggleBell(): void {
    this.bellOpen.update(v => !v);
    if (this.bellOpen()) this.refreshActivity();
  }

  closeBell(): void {
    setTimeout(() => this.bellOpen.set(false), 150);
  }

  openResult(app: LoanApplication): void {
    this.router.navigateByUrl(`${this.caseDetailBasePath}/${app.applicationRef}`);
    this.searchQuery.set('');
    this.searchOpen.set(false);
  }

  openActivityItem(item: StaffActivityItem): void {
    this.router.navigateByUrl(`${this.caseDetailBasePath}/${item.applicationRef}`);
    this.bellOpen.set(false);
  }

  searchLabel(app: LoanApplication): string {
    return applicantDisplayName(app);
  }

  activityLabel(item: StaffActivityItem): string {
    return applicantDisplayName(item);
  }

  statusLabel(status: string): string {
    return this.i18n.t('status.' + status);
  }

  noteTypeLabel(noteType: string): string {
    return this.i18n.t('noteType.' + noteType);
  }

  private refreshCache(): void {
    this.appSvc.getHomeStats().subscribe({ next: apps => this.appsCache.set(apps), error: () => {} });
  }

  private refreshActivity(): void {
    this.appSvc.getStaffActivity().subscribe({ next: items => this.activity.set(items), error: () => {} });
  }

  private matches(app: LoanApplication, q: string): boolean {
    if (app.applicationRef.toLowerCase().includes(q)) return true;
    if (app.customerEmail?.toLowerCase().includes(q)) return true;
    if (applicantDisplayName(app).toLowerCase().includes(q)) return true;
    return false;
  }
}
