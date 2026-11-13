import { Injectable, computed, signal } from '@angular/core';
import { FieldOption } from './form-builder.service';
import { MasterOption, MastersService } from './masters.service';
import { I18nService } from '../i18n/i18n.service';
import { normaliseName, reconcileStoredValue, toFieldOptions } from '../../shared/master-options';

const EMPTY_OPTIONS: FieldOption[] = [];

/**
 * Loads and caches small master lists (employment status, marital status, banks ...) for the forms and
 * for showing a stored value's label. Lists are fetched once, on first use, and exposed as signals so
 * templates update when they arrive.
 *
 * Arrays handed out are stable references (rebuilt only when a list actually changes): a getter that
 * returned a fresh array on every change-detection pass would make an un-trackBy'd *ngFor destroy and
 * recreate its rows constantly - the cause of the wizard hang fixed earlier.
 */
@Injectable({ providedIn: 'root' })
export class MasterListsService {
  private readonly lists = signal<Record<string, MasterOption[]>>({});
  private readonly children = signal<Record<string, MasterOption[]>>({});
  private readonly inflight = new Set<string>();

  private readonly optionLists = computed(() => {
    const out: Record<string, FieldOption[]> = {};
    for (const [t, items] of Object.entries(this.lists())) out[t] = toFieldOptions(items);
    return out;
  });
  private readonly childOptionLists = computed(() => {
    const out: Record<string, FieldOption[]> = {};
    for (const [k, items] of Object.entries(this.children())) out[k] = toFieldOptions(items);
    return out;
  });

  constructor(private masters: MastersService, private i18n: I18nService) {}

  /** Makes sure these (small, top-level) masters are loaded. Safe to call repeatedly. */
  load(types: string[]): void {
    const need = [...new Set(types)].filter((t) => t && !(t in this.lists()) && !this.inflight.has(t));
    if (!need.length) return;
    need.forEach((t) => this.inflight.add(t));
    this.masters.optionsFor(need).subscribe({
      next: (res) => { this.lists.update((d) => ({ ...d, ...res })); need.forEach((t) => this.inflight.delete(t)); },
      error: () => need.forEach((t) => this.inflight.delete(t)),
    });
  }

  /** The master's active items as form options (value = code). Empty until loaded. */
  options(type: string): FieldOption[] {
    return this.optionLists()[type] ?? EMPTY_OPTIONS;
  }
  items(type: string): MasterOption[] {
    return this.lists()[type] ?? [];
  }
  isLoaded(type: string): boolean {
    return type in this.lists();
  }

  /** Items of a master that sit under one parent (e.g. a bank's branches). Fetched per parent. */
  loadChildren(type: string, parentCode: string): void {
    const key = `${type}|${parentCode}`;
    if (!parentCode || key in this.children() || this.inflight.has(key)) return;
    this.inflight.add(key);
    this.masters.options(type, parentCode).subscribe({
      next: (items) => { this.children.update((d) => ({ ...d, [key]: items })); this.inflight.delete(key); },
      error: () => this.inflight.delete(key),
    });
  }
  childItems(type: string, parentCode: string): MasterOption[] {
    return this.children()[`${type}|${parentCode}`] ?? [];
  }
  childOptions(type: string, parentCode: string): FieldOption[] {
    return this.childOptionLists()[`${type}|${parentCode}`] ?? EMPTY_OPTIONS;
  }

  /**
   * A bank's branches as form options whose VALUE is the branch number (what goes on a direct-debit
   * mandate), not the master item's own code ("10-926"). Load them first with loadChildren('bank_branch', bank).
   */
  bankBranchOptions(bankCode: string): FieldOption[] {
    return this.branchNumberLists()[bankCode] ?? EMPTY_OPTIONS;
  }
  private readonly branchNumberLists = computed(() => {
    const out: Record<string, FieldOption[]> = {};
    for (const [key, items] of Object.entries(this.children())) {
      if (!key.startsWith('bank_branch|')) continue;
      out[key.slice('bank_branch|'.length)] = items.map((i) => ({
        value: String(i.attributes['branchCode'] ?? i.code.split('-').pop()),
        label: { en: i.name.en, he: i.name.he },
      }));
    }
    return out;
  });

  /** Finds a bank by a looser name, ignoring case, spacing and punctuation: "Mizrahi-Tefahot" finds
   * "Mizrahi Tefahot Bank Ltd", "Bank Leumi" finds "Bank Leumi Le-Israel B.M". */
  bankByName(name: string): MasterOption | undefined {
    const wanted = normaliseName(name);
    if (!wanted) return undefined;
    return this.items('bank').find((b) => {
      const n = normaliseName(b.name.en);
      return n.includes(wanted) || wanted.includes(n);
    });
  }

  /** Items of an already-loaded master that sit under one parent, filtered locally (small masters only). */
  optionsUnder(type: string, parentCode: string): FieldOption[] {
    return this.unders()[`${type}|${parentCode}`] ?? EMPTY_OPTIONS;
  }
  private readonly unders = computed(() => {
    const out: Record<string, FieldOption[]> = {};
    for (const [t, items] of Object.entries(this.lists())) {
      const byParent = new Map<string, MasterOption[]>();
      for (const i of items) if (i.parentCode) byParent.set(i.parentCode, [...(byParent.get(i.parentCode) ?? []), i]);
      for (const [p, arr] of byParent) out[`${t}|${p}`] = toFieldOptions(arr);
    }
    return out;
  });

  /**
   * The display name for a stored value, in the current language. Accepts a code, or legacy text saved
   * before the field moved to a master ("Full-Time Employed"). Falls back to the raw value so nothing
   * ever renders blank.
   */
  label(type: string, value: unknown): string {
    const v = value == null ? '' : String(value);
    if (!v) return '';
    const opts = this.options(type);
    const code = reconcileStoredValue(opts, v);
    const hit = code ? opts.find((o) => o.value === code) : undefined;
    return hit ? (this.i18n.lang() === 'he' ? hit.label.he || hit.label.en : hit.label.en) : v;
  }

  /** True if `value` is (or maps to) an item of the master: for deciding whether legacy text needs fixing. */
  normalise(type: string, value: unknown): string | null {
    return reconcileStoredValue(this.options(type), value);
  }

  normaliseName = normaliseName;
}
