import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  FormField,
  FormSection,
  FormVersionSchema,
  FieldType,
  BilingualLabel,
  ConditionGroup,
} from '../../../../core/services/form-builder.service';
import { toConditionNode } from '../../../../shared/dynamic-field/dynamic-field.component';
import { ConditionGroupComponent, FieldPickerOption } from '../condition-group/condition-group.component';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { MasterType, MastersService } from '../../../../core/services/masters.service';
import { I18nService } from '../../../../core/i18n/i18n.service';

type BilingualProp = 'label' | 'helpText' | 'tooltip' | 'errorMessage' | 'successMessage' | 'warningMessage';

const OPTION_TYPES: FieldType[] = ['select', 'radio'];
const VALIDATION_TYPES: FieldType[] = ['text', 'number', 'textarea'];

// Deliberately narrow, hand-picked list — NOT a generic "any existing field can carry options"
// mechanism. These are plain enumerable choices (pick-lists whose values live in the Masters, or a
// list typed here) with no other special behavior; they were originally four personalDetails fields, plain enumerable choices (hardcoded TS
// arrays in core/models/index.ts) with no other special behavior, unlike e.g. nationalId (live
// verification) or previousAddresses (a FormArray) — see the architecture-review discussion this
// came out of. Extending this list to another existing field is a deliberate decision, not a
// side effect of adding a new field type.
const EXISTING_OPTION_FIELD_KEYS = [
  'maritalStatus', 'nationality', 'preferredBranch', 'staffName',
  'employmentStatus', 'employmentDuration', 'loanPurpose', 'bankCode', 'branchCode',
];

// Extracted out of AdminFormBuilderComponent so the same label/tooltip/help-text/visibility/
// options/validation editor can be reused by both the List view's inline expanded row and the
// Canvas view's double-click popup, without duplicating ~90 lines of template and a dozen
// mutation methods in two places.
@Component({
  selector: 'app-field-detail-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, ConditionGroupComponent],
  templateUrl: './field-detail-panel.component.html',
  styleUrl: './field-detail-panel.component.scss',
})
export class FieldDetailPanelComponent implements OnChanges, OnInit {
  @Input({ required: true }) field!: FormField;
  @Input({ required: true }) section!: FormSection;
  @Input({ required: true }) schema!: FormVersionSchema;
  @Input({ required: true }) fieldPickerOptions!: FieldPickerOption[];
  @Input() disabled = false;
  @Output() changed = new EventEmitter<void>();

  masterTypes: MasterType[] = [];

  constructor(private masters: MastersService, private i18n: I18nService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // The list arrives after the first render; a parent that doesn't re-check on its own would never show it.
    this.masters.types().subscribe({
      next: t => { this.masterTypes = t; this.cdr.markForCheck(); },
      error: () => { this.masterTypes = []; this.cdr.markForCheck(); },
    });
  }

  // ---- options that come from a master
  isMasterMode(): boolean { return !!this.field.optionsSource; }

  setOptionsMode(mode: 'custom' | 'master'): void {
    if (mode === 'master') {
      // One source per field: drop the typed list and its dependency map (the schema rejects both).
      this.field.options = undefined;
      this.field.optionsDependOn = undefined;
      this.field.optionsSource = { master: this.masterTypes[0]?.code ?? '' };
    } else {
      this.field.optionsSource = undefined;
      this.field.options = [];
    }
    this.changed.emit();
  }

  masterLabel(t: MasterType): string { return this.i18n.lang() === 'he' ? t.labelHe : t.labelEn; }

  setMaster(code: string): void {
    this.field.optionsSource = { master: code };   // a different master invalidates any cascade
    this.changed.emit();
  }

  /** The master that the chosen master belongs to (State -> Country), if it has one. */
  masterParentType(): MasterType | null {
    const t = this.masterTypes.find(x => x.code === this.field.optionsSource?.master);
    return t?.parentTypeCode ? this.masterTypes.find(x => x.code === t.parentTypeCode) ?? null : null;
  }

  /** Earlier fields of this section that take their options from this master's parent master. */
  masterTriggerFields(): FormField[] {
    const parent = this.masterParentType();
    if (!parent) return [];
    return this.section.fields
      .filter(f => f.key !== this.field.key && f.order < this.field.order && f.optionsSource?.master === parent.code)
      .sort((a, b) => a.order - b.order);
  }

  /** Extra fields the chosen master's items carry (a branch's number, an address ...): one can be stored instead of the code. */
  masterAttributes(): { key: string; label: string }[] {
    const t = this.masterTypes.find(x => x.code === this.field.optionsSource?.master);
    return (t?.attributeDefs ?? []).map(d => ({ key: d.key, label: this.i18n.lang() === 'he' ? d.label.he : d.label.en }));
  }

  setValueAttribute(key: string): void {
    if (!this.field.optionsSource) return;
    const { valueAttribute: _drop, ...rest } = this.field.optionsSource;
    this.field.optionsSource = key ? { ...rest, valueAttribute: key } : rest;
    this.changed.emit();
  }

  setMasterDependsOn(fieldKey: string): void {
    if (!this.field.optionsSource) return;
    const { dependsOn: _drop, ...rest } = this.field.optionsSource;
    this.field.optionsSource = fieldKey ? { ...rest, dependsOn: { fieldKey } } : rest;
    this.changed.emit();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['field'] && this.field) this.upgradeLegacyVisibility();
  }

  /** A field's visibility can be the pre-existing single same-section equality rule (kept forever
   * for backward compatibility, see form-schema-types.ts's legacyVisibilityRuleSchema) — upgrade
   * it in place to a one-condition group the moment this panel opens on it, so the tree UI always
   * has a group to render. Untouched fields never go through this and keep validating against the
   * legacy shape indefinitely. */
  private upgradeLegacyVisibility(): void {
    if (this.field.visibility && !('kind' in this.field.visibility)) {
      this.field.visibility = { kind: 'group', op: 'and', conditions: [toConditionNode(this.field.visibility, this.section.key)] };
    }
  }

  isOptionBearing(f: FormField): boolean {
    return (f.kind === 'custom' && !!f.type && OPTION_TYPES.includes(f.type)) ||
           (f.kind === 'existing' && EXISTING_OPTION_FIELD_KEYS.includes(f.key));
  }

  hasOptions(): boolean {
    return this.isOptionBearing(this.field);
  }

  hasValidation(): boolean {
    return this.field.kind === 'custom' && !!this.field.type && VALIDATION_TYPES.includes(this.field.type);
  }

  bilingualValue(prop: BilingualProp, lang: 'en' | 'he'): string {
    return this.field[prop]?.[lang] ?? '';
  }

  setBilingual(prop: BilingualProp, lang: 'en' | 'he', value: string): void {
    const current: BilingualLabel = this.field[prop] ?? { en: '', he: '' };
    this.field[prop] = { ...current, [lang]: value };
    this.changed.emit();
  }

  toggleVisibility(): void {
    if (this.field.visibility) {
      this.field.visibility = null;
      this.changed.emit();
      return;
    }
    const first = this.fieldPickerOptions.find((f) => !(f.sectionKey === this.section.key && f.fieldKey === this.field.key));
    this.field.visibility = {
      kind: 'group',
      op: 'and',
      conditions: [
        {
          kind: 'condition',
          left: first ? { kind: 'field', sectionKey: first.sectionKey, fieldKey: first.fieldKey } : { kind: 'literal', value: '' },
          op: 'equals',
          right: { kind: 'literal', value: true },
        },
      ],
    };
    this.changed.emit();
  }

  asConditionGroup(): ConditionGroup {
    return this.field.visibility as ConditionGroup;
  }

  onConditionGroupChanged(): void {
    this.changed.emit();
  }

  addOption(): void {
    if (!this.field.options) this.field.options = [];
    this.field.options.push({ value: '', label: { en: '', he: '' } });
    this.changed.emit();
  }

  /** Also prunes the removed code out of this field's OWN optionsDependOn map (if it has one) so
   * a deleted option can't linger as a still-"allowed" value nobody can ever pick again. This is
   * local, single-field cleanup only — not the (separate, still-paused) cross-schema dependency
   * registry; see staleTriggerKeys()/clearStaleTriggerKeys() for the other direction (a TRIGGER
   * field losing an option out from under a field that depends on it). */
  removeOption(index: number): void {
    const removed = this.field.options?.[index]?.value;
    this.field.options?.splice(index, 1);
    if (removed && this.field.optionsDependOn) {
      const map = this.field.optionsDependOn.map;
      for (const k of Object.keys(map)) map[k] = map[k].filter((v) => v !== removed);
    }
    this.changed.emit();
  }

  setOptionField(opt: { value: string; label: BilingualLabel }, key: 'value' | 'labelEn' | 'labelHe', raw: string): void {
    if (key === 'value') opt.value = raw;
    else if (key === 'labelEn') opt.label.en = raw;
    else opt.label.he = raw;
    this.changed.emit();
  }

  /** Non-blocking client-side warning for a free-typed option value that's blank or reused within
   * this same field — option values double as comparison/lookup keys (server-side membership
   * checks, this field's own optionsDependOn map, and any OTHER field's map that targets this
   * field as its trigger), so a duplicate silently makes those ambiguous. The hard guard is the
   * worker's formSectionSchema.superRefine (form-schema-types.ts), enforced on every draft save —
   * this is just early, in-context feedback so an admin doesn't find out only after hitting Save. */
  duplicateOrEmptyOptionValues(): Set<string> {
    const counts = new Map<string, number>();
    for (const o of this.field.options ?? []) counts.set(o.value, (counts.get(o.value) ?? 0) + 1);
    return new Set([...counts.entries()].filter(([v, n]) => !v || n > 1).map(([v]) => v));
  }

  /** Same-section, earlier-in-display-order, option-bearing fields only — mirrors the worker's
   * formSectionSchema.superRefine constraint on optionsDependOn.fieldKey exactly, so nothing an
   * admin can pick here is ever rejected on save. Deliberately NOT the whole-schema
   * fieldPickerOptions list the visibility condition-group uses: that flattens every field across
   * every section for a general boolean condition, but a cascading options map only ever makes
   * sense against a field the customer has already answered earlier in this same section. */
  eligibleTriggerFields(): FormField[] {
    return this.section.fields
      .filter((f) => f.key !== this.field.key && f.order < this.field.order && this.isOptionBearing(f) && !f.optionsSource)
      .sort((a, b) => a.order - b.order);
  }

  hasOptionsDependency(): boolean {
    return !!this.field.optionsDependOn;
  }

  toggleOptionsDependency(): void {
    if (this.field.optionsDependOn) {
      this.field.optionsDependOn = undefined;
      this.changed.emit();
      return;
    }
    const first = this.eligibleTriggerFields()[0];
    if (!first) return;
    this.field.optionsDependOn = { fieldKey: first.key, map: {} };
    this.changed.emit();
  }

  /** Resets the map on a trigger change — a map built against the old trigger's option codes
   * would silently misfire (wrong keys) if just carried over onto a different trigger field. */
  setDependencyTrigger(fieldKey: string): void {
    if (!this.field.optionsDependOn) return;
    this.field.optionsDependOn = { fieldKey, map: {} };
    this.changed.emit();
  }

  triggerField(): FormField | undefined {
    return this.section.fields.find((f) => f.key === this.field.optionsDependOn?.fieldKey);
  }

  isAllowed(triggerValue: string, ownValue: string): boolean {
    return (this.field.optionsDependOn?.map[triggerValue] ?? []).includes(ownValue);
  }

  toggleAllowed(triggerValue: string, ownValue: string): void {
    if (!this.field.optionsDependOn) return;
    const current = this.field.optionsDependOn.map[triggerValue] ?? [];
    this.field.optionsDependOn.map = {
      ...this.field.optionsDependOn.map,
      [triggerValue]: current.includes(ownValue) ? current.filter((v) => v !== ownValue) : [...current, ownValue],
    };
    this.changed.emit();
  }

  /** Self-healing, not a hard block: if the trigger field's own options changed since this map
   * was built (an option renamed/removed there), the map can end up with rows keyed to a code
   * that no longer exists — harmless (that row's staff just never show, since nothing can ever
   * select that trigger value again) but worth surfacing so an admin can clean it up. */
  staleTriggerKeys(): string[] {
    const liveTriggerValues = new Set((this.triggerField()?.options ?? []).map((o) => o.value));
    return Object.keys(this.field.optionsDependOn?.map ?? {}).filter((k) => !liveTriggerValues.has(k));
  }

  clearStaleTriggerKeys(): void {
    if (!this.field.optionsDependOn) return;
    for (const k of this.staleTriggerKeys()) delete this.field.optionsDependOn.map[k];
    this.changed.emit();
  }

  setValidationField(key: 'min' | 'max' | 'minLength' | 'maxLength', raw: string): void {
    if (!this.field.validation) this.field.validation = {};
    const num = raw === '' ? undefined : Number(raw);
    this.field.validation = { ...this.field.validation, [key]: num };
    this.changed.emit();
  }

  setValidationPattern(raw: string): void {
    if (!this.field.validation) this.field.validation = {};
    this.field.validation = { ...this.field.validation, pattern: raw || undefined };
    this.changed.emit();
  }
}
