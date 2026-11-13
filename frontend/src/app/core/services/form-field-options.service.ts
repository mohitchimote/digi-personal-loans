import { Injectable } from '@angular/core';
import { FieldOption, FormField } from './form-builder.service';
import { MasterListsService } from './master-lists.service';
import { I18nService } from '../i18n/i18n.service';
import { normaliseName, reconcileStoredValue } from '../../shared/master-options';

const EMPTY_OPTIONS: FieldOption[] = [];

/**
 * What a form field offers, decided by the form definition. A screen passes in the field's definition
 * (from the application's form schema) and gets its options; it never names a master. Where the options
 * come from is the form's business: a list typed in the Form Builder, or a master the form points at,
 * optionally cascading from an earlier field's value.
 */
@Injectable({ providedIn: 'root' })
export class FormFieldOptionsService {
  private readonly dependMemo = new WeakMap<FieldOption[], Map<string, FieldOption[]>>();

  constructor(private lists: MasterListsService, private i18n: I18nService) {}

  /**
   * The field's options. `parentValue` is the current value of the field it depends on, if it does.
   * Empty while loading, or while a cascading field's parent has no value.
   */
  options(field: FormField | null | undefined, parentValue?: unknown): FieldOption[] {
    if (!field) return EMPTY_OPTIONS;

    if (field.options?.length) {
      if (!field.optionsDependOn) return field.options;
      return this.filtered(field.options, field.optionsDependOn.map, parentValue);
    }

    const src = field.optionsSource;
    if (!src) return EMPTY_OPTIONS;
    if (src.dependsOn) {
      const parent = parentValue == null ? '' : String(parentValue);
      if (!parent) return EMPTY_OPTIONS;
      this.lists.loadChildren(src.master, parent);
      return src.valueAttribute ? this.lists.childOptionsBy(src.master, parent, src.valueAttribute) : this.lists.childOptions(src.master, parent);
    }
    this.lists.load([src.master]);
    return src.valueAttribute ? this.lists.optionsBy(src.master, src.valueAttribute) : this.lists.options(src.master);
  }

  /** The name to show for a stored value, in the current language. Understands codes and the display
   * text older records hold. Falls back to the raw value so nothing renders blank. */
  label(field: FormField | null | undefined, value: unknown, parentValue?: unknown): string {
    const v = value == null ? '' : String(value);
    if (!v) return '';
    const opts = this.options(field, parentValue);
    const code = reconcileStoredValue(opts, v);
    const hit = code === null ? undefined : opts.find((o) => o.value === code);
    return hit ? this.localised(hit) : v;
  }

  /** The option value a stored value stands for (maps old display text to its code), or null. */
  normalise(field: FormField | null | undefined, value: unknown, parentValue?: unknown): string | null {
    return reconcileStoredValue(this.options(field, parentValue), value);
  }

  /** An extra field of the chosen master item (e.g. employment status -> isEmployed). */
  attribute(field: FormField | null | undefined, value: unknown, key: string): unknown {
    const src = field?.optionsSource;
    if (!src || src.dependsOn || src.valueAttribute) return undefined;
    this.lists.load([src.master]);
    const code = this.normalise(field, value);
    return code === null ? undefined : this.lists.items(src.master).find((i) => i.code === code)?.attributes[key];
  }

  /** Finds the option whose name loosely matches (case, spacing and punctuation ignored): lets a bank
   * name from the bank-connection step find the bank in this field. */
  findByName(field: FormField | null | undefined, name: string, parentValue?: unknown): FieldOption | undefined {
    const wanted = normaliseName(name);
    if (!wanted) return undefined;
    return this.options(field, parentValue).find((o) => {
      const n = normaliseName(o.label.en);
      return n.includes(wanted) || wanted.includes(n);
    });
  }

  localised(o: FieldOption): string {
    return this.i18n.lang() === 'he' ? o.label.he || o.label.en : o.label.en;
  }

  private filtered(options: FieldOption[], map: Record<string, string[]>, parentValue: unknown): FieldOption[] {
    const key = parentValue == null ? '' : String(parentValue);
    let perParent = this.dependMemo.get(options);
    if (!perParent) { perParent = new Map(); this.dependMemo.set(options, perParent); }
    let out = perParent.get(key);
    if (!out) {
      const allowed = new Set(map[key] ?? []);
      out = options.filter((o) => allowed.has(o.value));
      perParent.set(key, out);
    }
    return out;
  }
}
