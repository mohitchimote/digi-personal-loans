import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
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

type BilingualProp = 'label' | 'helpText' | 'tooltip';

const OPTION_TYPES: FieldType[] = ['select', 'radio'];
const VALIDATION_TYPES: FieldType[] = ['text', 'number', 'textarea'];

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
export class FieldDetailPanelComponent implements OnChanges {
  @Input({ required: true }) field!: FormField;
  @Input({ required: true }) section!: FormSection;
  @Input({ required: true }) schema!: FormVersionSchema;
  @Input({ required: true }) fieldPickerOptions!: FieldPickerOption[];
  @Input() disabled = false;
  @Output() changed = new EventEmitter<void>();

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

  hasOptions(): boolean {
    return this.field.kind === 'custom' && !!this.field.type && OPTION_TYPES.includes(this.field.type);
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

  removeOption(index: number): void {
    this.field.options?.splice(index, 1);
    this.changed.emit();
  }

  setOptionField(opt: { value: string; label: BilingualLabel }, key: 'value' | 'labelEn' | 'labelHe', raw: string): void {
    if (key === 'value') opt.value = raw;
    else if (key === 'labelEn') opt.label.en = raw;
    else opt.label.he = raw;
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
