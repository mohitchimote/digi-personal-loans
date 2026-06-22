import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoanApplication, UnderwritingNote } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { CaseSectionNavComponent } from '../../../shared/case-section-nav/case-section-nav.component';
import { PERSONAL_CASE_SECTIONS, BUSINESS_CASE_SECTIONS, CaseSectionDef } from '../../../shared/case-section-nav/case-sections.const';

/** Landing page for a Banker's case — an overview card + Call Notes, plus the left case-nav
 * sidebar for jumping into the actual wizard steps (real customer components, rendered by
 * BankerApplyShellComponent under /banker/case/:appRef/apply/...). No inline editing happens
 * here anymore — see plan in iridescent-launching-gray.md for why the previous generic
 * field-renderer was replaced by reusing the real wizard components. */
@Component({
  selector: 'app-banker-case-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, CaseSectionNavComponent],
  templateUrl: './banker-case-detail.component.html',
  styleUrl: './banker-case-detail.component.scss'
})
export class BankerCaseDetailComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  notes = signal<UnderwritingNote[]>([]);
  loading = signal(true);
  error = signal('');
  appRef = '';

  noteText = '';
  noteType: 'NOTE' | 'CLARIFICATION_REQUEST' | 'DOCUMENT_REQUEST' = 'NOTE';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private appSvc: ApplicationService,
    private auth: AuthService,
    public i18n: I18nService
  ) {}

  ngOnInit(): void {
    this.appRef = this.route.snapshot.paramMap.get('appRef') || '';
    this.load();
  }

  private load(): void {
    this.appSvc.getApplication(this.appRef).subscribe({
      next: app => { this.application.set(app); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.appSvc.getNotes(this.appRef).subscribe({ next: n => this.notes.set(n) });
  }

  get isBusiness(): boolean {
    return this.application()?.applicationType === 'BUSINESS';
  }

  get navTopItems() {
    return [{ key: 'overview', labelKey: 'banker.caseOverview' }];
  }

  get navGroupItems(): CaseSectionDef[] {
    return this.isBusiness ? BUSINESS_CASE_SECTIONS : PERSONAL_CASE_SECTIONS;
  }

  onNavSelect(key: string): void {
    if (key === 'overview') return;
    const def = this.navGroupItems.find(s => s.key === key);
    if (def) {
      this.router.navigate(['/banker/case', this.appRef, 'apply', this.isBusiness ? 'business' : 'personal', def.route]);
    }
  }

  parseSection(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  get applicantName(): string {
    const app = this.application();
    if (!app) return '';
    if (this.isBusiness) {
      const c = this.parseSection(app.companyDetailsJson);
      return c.companyName || app.customerEmail;
    }
    const p = this.parseSection(app.personalDetailsJson);
    return `${p.firstName || ''} ${p.lastName || ''}`.trim() || app.customerEmail;
  }

  statusLabel(status: string): string {
    return this.i18n.t('status.' + status);
  }

  notesFor(sectionKey: string): UnderwritingNote[] {
    return this.notes().filter(n => n.section === sectionKey);
  }

  addNote(): void {
    if (!this.noteText.trim()) return;
    this.appSvc.addNote(this.appRef, 'general', this.noteText.trim(), this.noteType, this.auth.userFullName || 'Banker').subscribe({
      next: note => { this.notes.update(n => [note, ...n]); this.noteText = ''; },
      error: () => this.error.set(this.i18n.t('banker.errSaveNote'))
    });
  }
}
