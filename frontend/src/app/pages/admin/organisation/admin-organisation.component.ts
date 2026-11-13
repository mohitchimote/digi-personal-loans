import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, OrgLevel, OrgUnit } from '../../../core/services/admin.service';
import { MastersService, MasterType } from '../../../core/services/masters.service';
import { MasterPickerComponent, PickedItem } from '../masters/master-picker.component';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

interface UnitDraft {
  code: string; name: string; levelId: number | null; parentId: number | null; active: boolean;
  /** Item picked from the level's source master (units at a level with a master are picked, not typed). */
  masterCode: string | null; masterLabel: string;
}
interface UnitRow { unit: OrgUnit; indent: number; levelName: string; }

/** Y1 - admin-configured organisational hierarchy: the levels (Head Office / Region / Branch ...)
 * and the units under them. Branch-scoped case visibility keys off this tree. */
@Component({
  selector: 'app-admin-organisation',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, MasterPickerComponent],
  templateUrl: './admin-organisation.component.html',
  styleUrl: './admin-organisation.component.scss'
})
export class AdminOrganisationComponent implements OnInit {
  levels = signal<OrgLevel[]>([]);
  units = signal<OrgUnit[]>([]);
  loading = signal(true);
  error = signal('');

  masterTypes = signal<MasterType[]>([]);

  newLevel: { name: string; depth: number; masterTypeCode: string | null } = { name: '', depth: 1, masterTypeCode: null };
  editingLevelId = signal<number | null>(null);
  levelDraft: { name: string; depth: number; masterTypeCode: string | null } = { name: '', depth: 1, masterTypeCode: null };

  showUnitForm = signal(false);
  editingUnitId = signal<number | null>(null);
  unitDraft: UnitDraft = this.blankUnit();

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

  constructor(private adminSvc: AdminService, private mastersSvc: MastersService, private i18n: I18nService) {}

  ngOnInit(): void {
    this.reload();
    this.mastersSvc.types().subscribe({ next: t => this.masterTypes.set(t), error: () => this.masterTypes.set([]) });
  }

  /** The level currently chosen in the unit form, and the master its units are picked from. */
  draftLevel(): OrgLevel | null { return this.levels().find(l => l.id === Number(this.unitDraft.levelId)) ?? null; }
  levelMaster(l: OrgLevel | null): MasterType | null { return l?.masterTypeCode ? this.masterTypes().find(t => t.code === l.masterTypeCode) ?? null : null; }
  /** True when the unit sits at a level with a source master (so it could be, or is, linked). */
  levelMasterOf(u: OrgUnit): boolean { return !!this.levels().find(l => l.id === u.levelId)?.masterTypeCode; }
  masterLabel(t: MasterType): string { return this.i18n.lang() === 'he' ? t.labelHe : t.labelEn; }
  onLevelChanged(): void { this.unitDraft.masterCode = null; this.unitDraft.masterLabel = ''; }
  onMasterPicked(p: PickedItem): void { this.unitDraft.masterCode = p.code ?? null; this.unitDraft.masterLabel = p.label; }

  private blankUnit(): UnitDraft { return { code: '', name: '', levelId: null, parentId: null, active: true, masterCode: null, masterLabel: '' }; }

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
    this.adminSvc.createOrgLevel({ name: this.newLevel.name.trim(), depth: Number(this.newLevel.depth), masterTypeCode: this.newLevel.masterTypeCode }).subscribe({
      next: () => { this.newLevel.name = ''; this.newLevel.masterTypeCode = null; this.reload(); },
      error: this.fail
    });
  }
  editLevel(l: OrgLevel): void { this.editingLevelId.set(l.id); this.levelDraft = { name: l.name, depth: l.depth, masterTypeCode: l.masterTypeCode }; }
  saveLevel(l: OrgLevel): void {
    this.error.set('');
    this.adminSvc.updateOrgLevel(l.id, { name: this.levelDraft.name.trim(), depth: Number(this.levelDraft.depth), masterTypeCode: this.levelDraft.masterTypeCode }).subscribe({
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
    this.unitDraft = {
      code: u.code, name: u.name, levelId: u.levelId, parentId: u.parentId, active: u.active,
      masterCode: u.masterCode, masterLabel: u.masterCode ? `${u.name} · ${u.masterCode}` : '',
    };
    this.showUnitForm.set(true);
  }
  cancelUnit(): void { this.showUnitForm.set(false); this.editingUnitId.set(null); }
  saveUnit(): void {
    const d = this.unitDraft;
    if (d.levelId == null) return;
    const mastered = !!this.levelMaster(this.draftLevel());
    // At a mastered level the unit is picked (code and names come from the master item); a legacy
    // unit with no link can still be saved as typed until someone links it.
    if (mastered && !d.masterCode && !(this.editingUnitId() != null && d.code.trim() && d.name.trim())) { this.error.set(this.i18n.t('admin.org.pickRequired')); return; }
    if (!mastered && (!d.code.trim() || !d.name.trim())) return;
    this.error.set('');
    const base = { levelId: Number(d.levelId), parentId: d.parentId == null ? null : Number(d.parentId), active: d.active };
    const body = mastered && d.masterCode ? { ...base, masterCode: d.masterCode } : { ...base, code: d.code.trim(), name: d.name.trim() };
    const id = this.editingUnitId();
    (id == null ? this.adminSvc.createOrgUnit(body) : this.adminSvc.updateOrgUnit(id, body)).subscribe({
      next: () => { this.cancelUnit(); this.reload(); },
      error: this.fail
    });
  }
  toggleActive(u: OrgUnit): void {
    this.adminSvc.updateOrgUnit(u.id, u.masterCode
      ? { masterCode: u.masterCode, levelId: u.levelId, parentId: u.parentId, active: !u.active }
      : { code: u.code, name: u.name, levelId: u.levelId, parentId: u.parentId, active: !u.active }).subscribe({
      next: () => this.reload(), error: this.fail
    });
  }
  removeUnit(u: OrgUnit): void {
    this.error.set('');
    this.adminSvc.deleteOrgUnit(u.id).subscribe({ next: () => this.reload(), error: this.fail });
  }
}
