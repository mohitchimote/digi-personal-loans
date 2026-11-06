import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, OrgLevel, OrgUnit } from '../../../core/services/admin.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

interface UnitRow { unit: OrgUnit; indent: number; levelName: string; }

/** Y1 - admin-configured organisational hierarchy: the levels (Head Office / Region / Branch ...)
 * and the units under them. Branch-scoped case visibility keys off this tree. */
@Component({
  selector: 'app-admin-organisation',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-organisation.component.html',
  styleUrl: './admin-organisation.component.scss'
})
export class AdminOrganisationComponent implements OnInit {
  levels = signal<OrgLevel[]>([]);
  units = signal<OrgUnit[]>([]);
  loading = signal(true);
  error = signal('');

  newLevel = { name: '', depth: 1 };
  editingLevelId = signal<number | null>(null);
  levelDraft = { name: '', depth: 1 };

  showUnitForm = signal(false);
  editingUnitId = signal<number | null>(null);
  unitDraft: { code: string; name: string; levelId: number | null; parentId: number | null; active: boolean } = this.blankUnit();

  /** Units flattened depth-first so the table reads as a tree. */
  rows = computed<UnitRow[]>(() => {
    const units = this.units();
    const levelName = new Map(this.levels().map(l => [l.id, l.name]));
    const byParent = new Map<number | null, OrgUnit[]>();
    for (const u of units) {
      const k = u.parentId != null && units.some(p => p.id === u.parentId) ? u.parentId : null;
      byParent.set(k, [...(byParent.get(k) ?? []), u]);
    }
    const out: UnitRow[] = [];
    const walk = (parent: number | null, indent: number) => {
      for (const u of byParent.get(parent) ?? []) {
        out.push({ unit: u, indent, levelName: levelName.get(u.levelId) ?? '?' });
        walk(u.id, indent + 1);
      }
    };
    walk(null, 0);
    return out;
  });

  constructor(private adminSvc: AdminService, private i18n: I18nService) {}

  ngOnInit(): void { this.reload(); }

  private blankUnit() { return { code: '', name: '', levelId: null, parentId: null, active: true }; }

  private reload(): void {
    this.adminSvc.getOrg().subscribe({
      next: o => {
        this.levels.set(o.levels);
        this.units.set(o.units);
        this.newLevel.depth = o.levels.length ? Math.max(...o.levels.map(l => l.depth)) + 1 : 1;
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set(this.i18n.t('admin.org.errLoad')); }
    });
  }

  private fail = (err: any) => this.error.set(err?.error?.message || this.i18n.t('admin.org.errSave'));

  // ---- levels
  addLevel(): void {
    if (!this.newLevel.name.trim()) return;
    this.error.set('');
    this.adminSvc.createOrgLevel({ name: this.newLevel.name.trim(), depth: Number(this.newLevel.depth) }).subscribe({
      next: () => { this.newLevel.name = ''; this.reload(); },
      error: this.fail
    });
  }
  editLevel(l: OrgLevel): void { this.editingLevelId.set(l.id); this.levelDraft = { name: l.name, depth: l.depth }; }
  saveLevel(l: OrgLevel): void {
    this.error.set('');
    this.adminSvc.updateOrgLevel(l.id, { name: this.levelDraft.name.trim(), depth: Number(this.levelDraft.depth) }).subscribe({
      next: () => { this.editingLevelId.set(null); this.reload(); },
      error: this.fail
    });
  }
  removeLevel(l: OrgLevel): void {
    this.error.set('');
    this.adminSvc.deleteOrgLevel(l.id).subscribe({ next: () => this.reload(), error: this.fail });
  }

  // ---- units
  openCreateUnit(parent?: OrgUnit): void {
    this.editingUnitId.set(null);
    const levels = [...this.levels()].sort((a, b) => a.depth - b.depth);
    const parentDepth = parent ? (levels.find(x => x.id === parent.levelId)?.depth ?? 0) : 0;
    const suggested = levels.find(l => l.depth > parentDepth);
    this.unitDraft = { ...this.blankUnit(), parentId: parent?.id ?? null, levelId: suggested?.id ?? null };
    this.showUnitForm.set(true);
  }
  openEditUnit(u: OrgUnit): void {
    this.editingUnitId.set(u.id);
    this.unitDraft = { code: u.code, name: u.name, levelId: u.levelId, parentId: u.parentId, active: u.active };
    this.showUnitForm.set(true);
  }
  cancelUnit(): void { this.showUnitForm.set(false); this.editingUnitId.set(null); }
  saveUnit(): void {
    const d = this.unitDraft;
    if (!d.code.trim() || !d.name.trim() || d.levelId == null) return;
    this.error.set('');
    const body = { code: d.code.trim(), name: d.name.trim(), levelId: Number(d.levelId), parentId: d.parentId == null ? null : Number(d.parentId), active: d.active };
    const id = this.editingUnitId();
    (id == null ? this.adminSvc.createOrgUnit(body) : this.adminSvc.updateOrgUnit(id, body)).subscribe({
      next: () => { this.cancelUnit(); this.reload(); },
      error: this.fail
    });
  }
  toggleActive(u: OrgUnit): void {
    this.adminSvc.updateOrgUnit(u.id, { code: u.code, name: u.name, levelId: u.levelId, parentId: u.parentId, active: !u.active }).subscribe({
      next: () => this.reload(), error: this.fail
    });
  }
  removeUnit(u: OrgUnit): void {
    this.error.set('');
    this.adminSvc.deleteOrgUnit(u.id).subscribe({ next: () => this.reload(), error: this.fail });
  }
}
