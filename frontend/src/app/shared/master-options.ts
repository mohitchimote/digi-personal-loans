import { FieldOption } from '../core/services/form-builder.service';
import { MasterOption } from '../core/services/masters.service';

/** Same rule as the Worker's normaliseName (lib/masters.ts): "Full-Time Employed" -> "FULL_TIME_EMPLOYED". */
export function normaliseName(name: string): string {
  return name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' AND ')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** A master's pick-list as the form components' own option shape (value = the item's code). */
export function toFieldOptions(items: readonly MasterOption[]): FieldOption[] {
  return items.map(i => ({ value: i.code, label: { en: i.name.en, he: i.name.he } }));
}

/**
 * Brings an already-stored value into line with a master's codes. Records saved before a field moved
 * to a master hold the old display text ("Single", "Full-Time Employed"); this finds the item whose
 * English name matches it, so the form shows the right choice and saves the code from then on.
 * Returns the value to use, or null when it matches nothing in `options`.
 */
export function reconcileStoredValue(options: readonly FieldOption[], stored: unknown): string | null {
  const v = stored == null ? '' : String(stored);
  if (!v) return null;
  if (options.some(o => o.value === v)) return v;
  const wanted = normaliseName(v);
  const byName = options.find(o => normaliseName(o.label.en) === wanted || o.value === wanted);
  return byName ? byName.value : null;
}
