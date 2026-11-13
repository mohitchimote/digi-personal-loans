import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AttributeDef, AttrKind, MasterItem, MasterType, MastersService } from '../../../core/services/masters.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

interface ItemDraft {
  code: string; nameEn: string; nameHe: string; parentId: number | null; sortOrder: number; active: boolean;
  attrs: Record<string, string | number | boolean | null>;
}
interface TypeDraft {
  code: string; labelEn: string; labelHe: string; description: string; parentTypeCode: string | null;
  attributeDefs: AttributeDef[];
}

/** Define-once reference data. Left: the list of masters. Right: the selected master's items.
 * Other modules store an item's `code`, so a code is fixed once created; names and translations are
 * free to change, and items are deactivated (not deleted) once in use. */
@Component({
  selector: 'app-admin-masters',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-masters.component.html',
  styleUrl: './admin-masters.component.scss'
})
export class AdminMastersComponent implements OnInit {
  types = signal<MasterType[]>([]);
  selectedCode = signal<string | null>(null);
  items = signal<MasterItem[]>([]);
  parentItems = signal<MasterItem[]>([]);
  loading = signal(true);
  loadingItems = signal(false);
  error = signal('');
  notice = signal('');

  search = '';
  itemFilter = '';
  parentFilter: number | null = null;

  readonly selected = computed(() => this.types().find(t => t.code === this.selectedCode()) ?? null);
  readonly filteredTypes = computed(() => {
    const q = this.searchSig().trim().toLowerCase();
    return q ? this.types().filter(t => (t.labelEn + ' ' + t.labelHe + ' ' + t.code).toLowerCase().includes(q)) : this.types();
  });
  private searchSig = signal('');
  readonly parentType = computed(() => {
    const p = this.selected()?.parentTypeCode;
    return p ? this.types().find(t => t.code === p) ?? null : null;
  });
  readonly visibleItems = computed(() => {
    const q = this.itemFilterSig().trim().toLowerCase();
    const pf = this.parentFilterSig();
    return this.items().filter(i =>
      (pf == null || i.parentId === pf) &&
      (!q || (i.code + ' ' + i.nameEn + ' ' + i.nameHe).toLowerCase().includes(q)));
  });
  private itemFilterSig = signal('');
  private parentFilterSig = signal<number | null>(null);

  // Item form
  showItemForm = signal(false);
  editingItemId = signal<number | null>(null);
  itemDraft: ItemDraft = this.blankItem();
  confirmDeleteItemId = signal<number | null>(null);

  // Type form
  showTypeForm = signal(false);
  editingTypeCode = signal<string | null>(null);
  typeDraft: TypeDraft = this.blankType();
  confirmDeleteType = signal(false);

  constructor(private svc: MastersService, private i18n: I18nService) {}

  ngOnInit(): void { this.loadTypes(); }

  // ---- helpers
  typeLabel(t: MasterType): string { return this.i18n.lang() === 'he' ? t.labelHe : t.labelEn; }
  itemName(i: MasterItem): string { return this.i18n.lang() === 'he' ? i.nameHe : i.nameEn; }
  attrLabel(d: AttributeDef): string { return this.i18n.lang() === 'he' ? d.label.he : d.label.en; }
  parentName(id: number | null): string {
    if (id == null) return '';
    const p = this.parentItems().find(x => x.id === id);
    return p ? this.itemName(p) : '';
  }
  private blankItem(): ItemDraft { return { code: '', nameEn: '', nameHe: '', parentId: null, sortOrder: 0, active: true, attrs: {} }; }
  private blankType(): TypeDraft { return { code: '', labelEn: '', labelHe: '', description: '', parentTypeCode: null, attributeDefs: [] }; }
  private fail(e: unknown, fallbackKey: string): void {
    const msg = e instanceof HttpErrorResponse ? (e.error?.message as string | undefined) : undefined;
    this.error.set(msg || this.i18n.t(fallbackKey));
    this.notice.set('');
  }
  private ok(key: string): void { this.notice.set(this.i18n.t(key)); this.error.set(''); }
  onSearch(v: string): void { this.search = v; this.searchSig.set(v); }
  onItemFilter(v: string): void { this.itemFilter = v; this.itemFilterSig.set(v); }
  onParentFilter(v: number | null): void { this.parentFilter = v; this.parentFilterSig.set(v); }

  // ---- loading
  private loadTypes(selectCode?: string): void {
    this.svc.types().subscribe({
      next: ts => {
        this.types.set(ts);
        this.loading.set(false);
        const want = selectCode ?? this.selectedCode() ?? ts[0]?.code ?? null;
        if (want) this.select(want, true);
      },
      error: e => { this.loading.set(false); this.fail(e, 'admin.masters.errLoad'); },
    });
  }

  select(code: string, force = false): void {
    if (!force && code === this.selectedCode()) return;
    this.selectedCode.set(code);
    this.cancelItem(); this.cancelType();
    this.onItemFilter(''); this.onParentFilter(null);
    this.confirmDeleteItemId.set(null); this.confirmDeleteType.set(false);
    this.loadItems(code);
  }

  private loadItems(code: string): void {
    this.loadingItems.set(true);
    this.svc.items(code).subscribe({
      next: rows => { this.items.set(rows); this.loadingItems.set(false); },
      error: e => { this.loadingItems.set(false); this.fail(e, 'admin.masters.errLoad'); },
    });
    const parent = this.types().find(t => t.code === code)?.parentTypeCode;
    if (parent) this.svc.items(parent).subscribe({ next: rows => this.parentItems.set(rows), error: () => this.parentItems.set([]) });
    else this.parentItems.set([]);
  }

  // ---- items
  openCreateItem(): void {
    this.editingItemId.set(null);
    this.itemDraft = this.blankItem();
    this.itemDraft.sortOrder = (this.items().reduce((m, i) => Math.max(m, i.sortOrder), 0)) + 10;
    if (this.parentFilter != null) this.itemDraft.parentId = this.parentFilter;
    this.showItemForm.set(true);
  }
  editItem(i: MasterItem): void {
    this.editingItemId.set(i.id);
    this.itemDraft = {
      code: i.code, nameEn: i.nameEn, nameHe: i.nameHe, parentId: i.parentId, sortOrder: i.sortOrder, active: i.active,
      attrs: { ...(i.attributes as Record<string, string | number | boolean>) },
    };
    this.showItemForm.set(true);
  }
  cancelItem(): void { this.showItemForm.set(false); this.editingItemId.set(null); }

  saveItem(): void {
    const t = this.selected(); if (!t) return;
    const d = this.itemDraft;
    if (!d.code.trim() || !d.nameEn.trim() || !d.nameHe.trim()) { this.error.set(this.i18n.t('admin.masters.errRequired')); return; }
    const attributes: Record<string, unknown> = {};
    for (const def of t.attributeDefs) {
      const v = d.attrs[def.key];
      if (v !== undefined && v !== null && v !== '') attributes[def.key] = v;
    }
    const body = { code: d.code.trim(), nameEn: d.nameEn.trim(), nameHe: d.nameHe.trim(), parentId: d.parentId, sortOrder: Number(d.sortOrder) || 0, active: d.active, attributes };
    const id = this.editingItemId();
    const call = id == null ? this.svc.createItem(t.code, body) : this.svc.updateItem(id, body);
    call.subscribe({
      next: () => { this.cancelItem(); this.ok('admin.masters.itemSaved'); this.loadItems(t.code); this.refreshCounts(); },
      error: e => this.fail(e, 'admin.masters.errSave'),
    });
  }

  toggleActive(i: MasterItem): void {
    this.svc.updateItem(i.id, {
      code: i.code, nameEn: i.nameEn, nameHe: i.nameHe, parentId: i.parentId, sortOrder: i.sortOrder, active: !i.active, attributes: i.attributes,
    }).subscribe({
      next: () => this.loadItems(i.typeCode),
      error: e => this.fail(e, 'admin.masters.errSave'),
    });
  }

  deleteItem(i: MasterItem): void {
    if (this.confirmDeleteItemId() !== i.id) { this.confirmDeleteItemId.set(i.id); return; }
    this.svc.deleteItem(i.id).subscribe({
      next: () => { this.confirmDeleteItemId.set(null); this.ok('admin.masters.itemDeleted'); this.loadItems(i.typeCode); this.refreshCounts(); },
      error: e => { this.confirmDeleteItemId.set(null); this.fail(e, 'admin.masters.errSave'); },
    });
  }

  private refreshCounts(): void { this.svc.types().subscribe({ next: ts => this.types.set(ts) }); }

  // ---- types
  openCreateType(): void {
    this.editingTypeCode.set(null);
    this.typeDraft = this.blankType();
    this.showTypeForm.set(true);
    this.cancelItem();
  }
  editType(): void {
    const t = this.selected(); if (!t) return;
    this.editingTypeCode.set(t.code);
    this.typeDraft = {
      code: t.code, labelEn: t.labelEn, labelHe: t.labelHe, description: t.description ?? '',
      parentTypeCode: t.parentTypeCode, attributeDefs: t.attributeDefs.map(a => ({ ...a, label: { ...a.label } })),
    };
    this.showTypeForm.set(true);
    this.cancelItem();
  }
  cancelType(): void { this.showTypeForm.set(false); this.editingTypeCode.set(null); }

  addAttr(): void { this.typeDraft.attributeDefs.push({ key: '', label: { en: '', he: '' }, kind: 'text' }); }
  removeAttr(i: number): void { this.typeDraft.attributeDefs.splice(i, 1); }
  kinds: AttrKind[] = ['text', 'number', 'boolean'];

  /** The parent master can only change while the master is empty - the server enforces it too. */
  get parentLocked(): boolean {
    const t = this.selected();
    return !!this.editingTypeCode() && !!t && (t.itemCount ?? 0) > 0;
  }
  /** Masters that could be a parent: everything but itself. (The server rejects cycles.) */
  parentChoices(): MasterType[] { return this.types().filter(t => t.code !== this.editingTypeCode()); }

  saveType(): void {
    const d = this.typeDraft;
    if (!d.labelEn.trim() || !d.labelHe.trim() || (!this.editingTypeCode() && !d.code.trim())) { this.error.set(this.i18n.t('admin.masters.errRequired')); return; }
    const body = {
      labelEn: d.labelEn.trim(), labelHe: d.labelHe.trim(), description: d.description.trim() || null,
      parentTypeCode: d.parentTypeCode, attributeDefs: d.attributeDefs.map(a => ({ ...a, key: a.key.trim(), label: { en: a.label.en.trim(), he: a.label.he.trim() } })),
    };
    const code = this.editingTypeCode();
    const call = code ? this.svc.updateType(code, body) : this.svc.createType({ ...body, code: d.code.trim() });
    call.subscribe({
      next: saved => { this.cancelType(); this.ok('admin.masters.typeSaved'); this.loadTypes(saved.code); },
      error: e => this.fail(e, 'admin.masters.errSave'),
    });
  }

  deleteType(): void {
    const t = this.selected(); if (!t) return;
    if (!this.confirmDeleteType()) { this.confirmDeleteType.set(true); return; }
    this.svc.deleteType(t.code).subscribe({
      next: () => { this.confirmDeleteType.set(false); this.selectedCode.set(null); this.ok('admin.masters.typeDeleted'); this.loadTypes(); },
      error: e => { this.confirmDeleteType.set(false); this.fail(e, 'admin.masters.errSave'); },
    });
  }
}
