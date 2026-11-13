import { Injectable, computed, signal } from '@angular/core';
import { FieldOption } from './form-builder.service';
import { MasterOption, MastersService } from './masters.service';
import { toFieldOptions } from '../../shared/master-options';

const EMPTY_OPTIONS: FieldOption[] = [];

/**
 * Loads and caches master lists. This is plumbing for FormFieldOptionsService: screens do not use it
 * (or name a master) themselves, they ask for a form field's options and the form definition decides
 * where those come from.
 *
 * Arrays handed out are stable references (rebuilt only when a list actually changes): a getter that
 * returned a fresh array on every change-detection pass would make an un-trackBy'd *ngFor destroy and
 * recreate its rows constantly, which is what made the wizard hang earlier.
 */
@Injectable({ providedIn: 'root' })
export class MasterListsService {
  private readonly lists = signal<Record<string, MasterOption[]>>({});
  private readonly children = signal<Record<string, MasterOption[]>>({});
  private readonly inflight = new Set<string>();
  private readonly attrMemo = new WeakMap<MasterOption[], Map<string, FieldOption[]>>();

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

  constructor(private masters: MastersService) {}

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

  /** Items under one parent (e.g. a bank's branches), fetched per parent. */
  loadChildren(type: string, parentCode: string): void {
    const key = `${type}|${parentCode}`;
    if (!parentCode || key in this.children() || this.inflight.has(key)) return;
    this.inflight.add(key);
    this.masters.options(type, parentCode).subscribe({
      next: (items) => { this.children.update((d) => ({ ...d, [key]: items })); this.inflight.delete(key); },
      error: () => this.inflight.delete(key),
    });
  }

  /** True once the list (or the children of this parent) has come back from the server, even if empty. */
  isLoaded(type: string, parentCode?: string): boolean {
    return parentCode ? `${type}|${parentCode}` in this.children() : type in this.lists();
  }

  items(type: string): MasterOption[] { return this.lists()[type] ?? []; }
  childItems(type: string, parentCode: string): MasterOption[] { return this.children()[`${type}|${parentCode}`] ?? []; }

  /** Form options (value = the item's code). Empty until loaded. */
  options(type: string): FieldOption[] { return this.optionLists()[type] ?? EMPTY_OPTIONS; }
  childOptions(type: string, parentCode: string): FieldOption[] { return this.childOptionLists()[`${type}|${parentCode}`] ?? EMPTY_OPTIONS; }

  /** Same, but the option value is an attribute of the item (a branch's number) rather than its code. */
  optionsBy(type: string, attribute: string): FieldOption[] { return this.byAttribute(this.items(type), attribute); }
  childOptionsBy(type: string, parentCode: string, attribute: string): FieldOption[] {
    return this.byAttribute(this.childItems(type, parentCode), attribute);
  }

  private byAttribute(items: MasterOption[], attribute: string): FieldOption[] {
    if (!items.length) return EMPTY_OPTIONS;
    let perAttr = this.attrMemo.get(items);
    if (!perAttr) { perAttr = new Map(); this.attrMemo.set(items, perAttr); }
    let out = perAttr.get(attribute);
    if (!out) {
      out = items.map((i) => ({ value: String(i.attributes[attribute] ?? i.code), label: { en: i.name.en, he: i.name.he } }));
      perAttr.set(attribute, out);
    }
    return out;
  }
}
