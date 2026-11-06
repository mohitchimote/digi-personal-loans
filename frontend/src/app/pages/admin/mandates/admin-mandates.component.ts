import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, LadderRole, MandateRow, OrgUnit } from '../../../core/services/admin.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

interface Draft { roleCode: string; orgUnitId: number | null; applicationType: 'PERSONAL' | 'BUSINESS' | null; maxAmount: number | null; }

/** Phase 3 - approval mandates with organisational context. Each row is a limit for a role on
 * the escalation ladder, optionally narrowed to an org unit (and below) and/or application type.
 * The ladder order itself is set on the Roles page. */
@Component({
  selector: 'app-admin-mandates',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-mandates.component.html',
  styleUrl: './admin-mandates.component.scss'
})
export class AdminMandatesComponent implements OnInit {
  rows = signal<MandateRow[]>([]);
  ladder = signal<LadderRole[]>([]);
  units = signal<OrgUnit[]>([]);
  loading = signal(true);
  error = signal('');

  /** null = closed; 0 = adding; otherwise the id being edited. */
  editingId = signal<number | null>(null);
  draft: Draft = this.blank();

  constructor(private adminSvc: AdminService, private i18n: I18nService) {}

  ngOnInit(): void {
    this.adminSvc.getOrg().subscribe({ next: o => this.units.set(o.units) });
    this.reload();
  }

  private blank(): Draft { return { roleCode: '', orgUnitId: null, applicationType: null, maxAmount: null }; }

  private reload(): void {
    this.adminSvc.getMandates().subscribe({
      next: r => { this.rows.set(r.mandates); this.ladder.set(r.ladder); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(this.i18n.t('admin.mandates.errLoad')); }
    });
  }

  roleLabel(code: string): string { return this.ladder().find(l => l.code === code)?.label ?? code; }
  unitName(id: number | null): string { return id == null ? '' : (this.units().find(u => u.id === id)?.name ?? `#${id}`); }

  /** Ladder order, then default row first, then narrower rows. */
  sorted(): MandateRow[] {
    const rank = (c: string) => this.ladder().find(l => l.code === c)?.rank ?? 999;
    const spec = (m: MandateRow) => (m.orgUnitId != null ? 2 : 0) + (m.applicationType != null ? 1 : 0);
    return [...this.rows()].sort((a, b) => rank(a.roleCode) - rank(b.roleCode) || spec(a) - spec(b));
  }

  openAdd(): void {
    this.draft = { ...this.blank(), roleCode: this.ladder()[0]?.code ?? '' };
    this.editingId.set(0); this.error.set('');
  }
  openEdit(m: MandateRow): void {
    this.draft = { roleCode: m.roleCode, orgUnitId: m.orgUnitId, applicationType: m.applicationType, maxAmount: m.maxAmount };
    this.editingId.set(m.id); this.error.set('');
  }
  cancel(): void { this.editingId.set(null); }

  save(): void {
    const d = this.draft;
    if (!d.roleCode || d.maxAmount == null || Number(d.maxAmount) < 0) return;
    const body = { roleCode: d.roleCode, orgUnitId: d.orgUnitId == null ? null : Number(d.orgUnitId), applicationType: d.applicationType, maxAmount: Number(d.maxAmount) };
    const id = this.editingId();
    this.error.set('');
    (id ? this.adminSvc.updateMandate(id, body) : this.adminSvc.createMandate(body)).subscribe({
      next: () => { this.editingId.set(null); this.reload(); },
      error: (e: any) => this.error.set(e?.error?.message || this.i18n.t('admin.org.errSave'))
    });
  }

  remove(m: MandateRow): void {
    this.error.set('');
    this.adminSvc.deleteMandate(m.id).subscribe({
      next: () => this.reload(),
      error: (e: any) => this.error.set(e?.error?.message || this.i18n.t('admin.org.errSave'))
    });
  }
}
