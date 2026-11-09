import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, EntitlementDef, RoleRow, RoleScope } from '../../../core/services/admin.service';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

interface Draft { code: string; label: string; description: string; scope: RoleScope; escalationRank: number | null; entitlements: Set<string>; }

/** Phase 2 - admin-configured staff roles: name, case-visibility scope and the entitlement set
 * each role holds. Built-in roles are editable except ADMIN (locked super-role). */
@Component({
  selector: 'app-admin-roles',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-roles.component.html',
  styleUrl: './admin-roles.component.scss'
})
export class AdminRolesComponent implements OnInit {
  roles = signal<RoleRow[]>([]);
  catalog = signal<EntitlementDef[]>([]);
  scopes = signal<RoleScope[]>([]);
  loading = signal(true);
  error = signal('');
  saved = signal(false);
  saving = signal(false);

  /** null = nothing open; '' = creating a new role; otherwise the code being edited. */
  editing = signal<string | null>(null);
  draft: Draft = this.blank();
  confirmingDelete = signal(false);

  groups = computed(() => {
    const out = new Map<string, EntitlementDef[]>();
    for (const e of this.catalog()) out.set(e.group, [...(out.get(e.group) ?? []), e]);
    return [...out.entries()].map(([name, items]) => ({ name, items }));
  });

  constructor(private adminSvc: AdminService, public i18n: I18nService) {}

  ngOnInit(): void { this.reload(); }

  private blank(): Draft { return { code: '', label: '', description: '', scope: 'ALL', escalationRank: null, entitlements: new Set() }; }

  private reload(keepOpen?: string): void {
    this.adminSvc.getRoles().subscribe({
      next: r => {
        this.roles.set(r.roles); this.catalog.set(r.catalog); this.scopes.set(r.scopes);
        this.loading.set(false);
        if (keepOpen) { const row = r.roles.find(x => x.code === keepOpen); if (row) this.open(row, false); }
      },
      error: () => { this.loading.set(false); this.error.set(this.i18n.t('admin.roles.errLoad')); }
    });
  }

  roleName(r: RoleRow): string { return this.i18n.roleName(r.code, r.label); }

  openNew(): void {
    this.editing.set(''); this.draft = this.blank(); this.error.set(''); this.saved.set(false); this.confirmingDelete.set(false);
  }

  open(r: RoleRow, resetMessages = true): void {
    this.editing.set(r.code);
    this.draft = { code: r.code, label: r.label, description: r.description ?? '', scope: r.scope, escalationRank: r.escalationRank, entitlements: new Set(r.entitlements) };
    this.confirmingDelete.set(false);
    if (resetMessages) { this.error.set(''); this.saved.set(false); }
  }

  get current(): RoleRow | undefined { return this.roles().find(r => r.code === this.editing()); }
  get isLocked(): boolean { return !!this.current?.locked; }

  toggle(key: string): void {
    if (this.isLocked) return;
    this.draft.entitlements.has(key) ? this.draft.entitlements.delete(key) : this.draft.entitlements.add(key);
  }

  private fail = (err: any) => { this.saving.set(false); this.error.set(err?.error?.message || err?.error?.error || this.i18n.t('admin.org.errSave')); };

  save(): void {
    const d = this.draft;
    if (!d.label.trim()) return;
    this.saving.set(true); this.error.set(''); this.saved.set(false);
    const body = { label: d.label.trim(), description: d.description.trim() || null, scope: d.scope, escalationRank: d.escalationRank == null || (d.escalationRank as unknown) === '' ? null : Number(d.escalationRank), entitlements: [...d.entitlements] };
    const creating = this.editing() === '';
    const call = creating ? this.adminSvc.createRole({ code: d.code.trim().toUpperCase(), ...body }) : this.adminSvc.updateRole2(d.code, body);
    call.subscribe({
      next: () => { this.saving.set(false); this.saved.set(true); this.reload(creating ? d.code.trim().toUpperCase() : d.code); },
      error: this.fail
    });
  }

  remove(): void {
    const c = this.editing();
    if (!c) return;
    this.adminSvc.deleteRole(c).subscribe({
      next: () => { this.editing.set(null); this.confirmingDelete.set(false); this.reload(); },
      error: (e) => { this.confirmingDelete.set(false); this.fail(e); }
    });
  }
}
