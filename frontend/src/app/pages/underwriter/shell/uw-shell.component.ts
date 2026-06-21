import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ApplicationService } from '../../../core/services/application.service';
import { LoanApplication } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { LanguageSwitcherComponent } from '../../../shared/language-switcher/language-switcher.component';

const MIN_SEARCH_CHARS = 3;
const MAX_RESULTS = 8;

@Component({
  selector: 'app-uw-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterOutlet, TranslatePipe, LanguageSwitcherComponent],
  templateUrl: './uw-shell.component.html',
  styleUrl: './uw-shell.component.scss'
})
export class UwShellComponent implements OnInit {
  searchQuery = signal('');
  searchOpen = signal(false);
  private pipelineCache = signal<LoanApplication[]>([]);

  /** `searchQuery` must be a signal (not a plain property) for this computed() to re-run on every
   * keystroke — computed() only tracks signal reads, so a plain ngModel-bound string would only
   * "update" whenever pipelineCache happened to change too, showing stale/frozen results. */
  searchResults = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (q.length < MIN_SEARCH_CHARS) return [];
    return this.pipelineCache().filter(app => this.matches(app, q)).slice(0, MAX_RESULTS);
  });

  constructor(public auth: AuthService, private appSvc: ApplicationService, private router: Router, private i18n: I18nService) {}

  ngOnInit(): void {
    this.refreshPipelineCache();
  }

  /** Refetched on every search-box focus (cheap, idempotent GET) rather than polled, so results
   * stay reasonably fresh without adding background polling. */
  onSearchFocus(): void {
    this.searchOpen.set(true);
    this.refreshPipelineCache();
  }

  onSearchBlur(): void {
    setTimeout(() => this.searchOpen.set(false), 150);
  }

  openResult(app: LoanApplication): void {
    this.router.navigate(['/underwriter/case', app.applicationRef]);
    this.searchQuery.set('');
    this.searchOpen.set(false);
  }

  searchLabel(app: LoanApplication): string {
    const personal = this.parseJson(app.personalDetailsJson);
    const name = `${personal.firstName || ''} ${personal.lastName || ''}`.trim();
    return name || app.customerEmail;
  }

  statusLabel(status: string): string {
    return this.i18n.t('status.' + status);
  }

  private refreshPipelineCache(): void {
    this.appSvc.getPipeline().subscribe({
      next: apps => this.pipelineCache.set(apps),
      error: () => {}
    });
  }

  private matches(app: LoanApplication, q: string): boolean {
    if (app.applicationRef.toLowerCase().includes(q)) return true;
    if (app.customerEmail?.toLowerCase().includes(q)) return true;
    const personal = this.parseJson(app.personalDetailsJson);
    const fullName = `${personal.firstName || ''} ${personal.lastName || ''}`.toLowerCase();
    if (fullName.includes(q)) return true;
    if ((personal.nationalId || '').toLowerCase().includes(q)) return true;
    return false;
  }

  private parseJson(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }
}
