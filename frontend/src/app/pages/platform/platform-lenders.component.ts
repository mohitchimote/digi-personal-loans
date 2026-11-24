import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PlatformService, PlatformLender } from '../../core/services/platform.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { LanguageSwitcherComponent } from '../../shared/language-switcher/language-switcher.component';

/** The platform console: every lender, create one by copying another's configuration, suspend,
 * rename, and enter one to administer it with the ordinary admin screens. Super admin only. */
@Component({
  selector: 'app-platform-lenders',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, LanguageSwitcherComponent],
  templateUrl: './platform-lenders.component.html',
  styleUrl: './platform-lenders.component.scss',
})
export class PlatformLendersComponent implements OnInit {
  lenders = signal<PlatformLender[]>([]);
  loading = signal(true);
  error = signal('');
  notice = signal('');
  showForm = signal(false);
  saving = signal(false);
  renamingId = signal<number | null>(null);
  renameValue = '';
  domainsId = signal<number | null>(null);
  domainsValue = '';

  form = { code: '', name: '', cloneFromLenderId: 0, adminName: '', adminEmail: '', adminNationalId: '' };

  constructor(private platform: PlatformService, public auth: AuthService, private router: Router, private i18n: I18nService) {}

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.platform.list().subscribe({
      next: rows => { this.lenders.set(rows); this.loading.set(false); },
      error: e => { this.error.set(this.message(e)); this.loading.set(false); },
    });
  }

  private message(e: unknown): string {
    const err = e as HttpErrorResponse;
    return err?.error?.message ?? this.i18n.t('platform.failed');
  }

  startNew(): void {
    this.form = { code: '', name: '', cloneFromLenderId: this.lenders().find(l => l.status === 'ACTIVE')?.id ?? 0, adminName: '', adminEmail: '', adminNationalId: '' };
    this.error.set(''); this.notice.set('');
    this.showForm.set(true);
  }

  create(): void {
    const f = this.form;
    if (!f.code.trim() || !f.name.trim() || !f.cloneFromLenderId || !f.adminName.trim() || !f.adminEmail.trim() || !f.adminNationalId.trim()) {
      this.error.set(this.i18n.t('platform.required')); return;
    }
    this.saving.set(true); this.error.set('');
    this.platform.create({
      code: f.code.trim().toUpperCase(), name: f.name.trim(), cloneFromLenderId: Number(f.cloneFromLenderId),
      admin: { fullName: f.adminName.trim(), email: f.adminEmail.trim(), nationalId: f.adminNationalId.trim() },
    }).subscribe({
      next: res => {
        this.saving.set(false); this.showForm.set(false);
        const skipped = res.data.mastersWithoutItems;
        this.notice.set(res.message + (skipped.length ? ' ' + this.i18n.t('platform.mastersSkipped') + ' ' + skipped.join(', ') : ''));
        this.load();
      },
      error: e => { this.saving.set(false); this.error.set(this.zodOrMessage(e)); },
    });
  }

  private zodOrMessage(e: unknown): string {
    const err = e as HttpErrorResponse;
    const issues = err?.error?.issues ?? err?.error?.error?.issues;
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
    return this.message(e);
  }

  enter(l: PlatformLender): void {
    this.platform.enter(l.id).subscribe({
      next: () => this.router.navigate(['/admin/home']),
      error: e => this.error.set(this.message(e)),
    });
  }

  toggle(l: PlatformLender): void {
    const suspend = l.status === 'ACTIVE';
    if (suspend && !confirm(this.i18n.t('platform.confirmSuspend'))) return;
    this.platform.setSuspended(l.id, suspend).subscribe({ next: () => this.load(), error: e => this.error.set(this.message(e)) });
  }

  startDomains(l: PlatformLender): void { this.domainsId.set(l.id); this.domainsValue = l.domains.join(', '); }

  saveDomains(l: PlatformLender): void {
    const domains = this.domainsValue.split(/[\s,;]+/).filter(Boolean);
    this.error.set('');
    this.platform.setDomains(l.id, domains).subscribe({
      next: () => { this.domainsId.set(null); this.load(); },
      error: e => this.error.set(this.message(e)),
    });
  }

  startRename(l: PlatformLender): void { this.renamingId.set(l.id); this.renameValue = l.name; }

  saveRename(l: PlatformLender): void {
    if (!this.renameValue.trim()) return;
    this.platform.rename(l.id, this.renameValue.trim()).subscribe({
      next: () => { this.renamingId.set(null); this.load(); },
      error: e => this.error.set(this.message(e)),
    });
  }
}
