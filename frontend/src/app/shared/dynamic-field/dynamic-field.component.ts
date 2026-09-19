import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FormField, VisibilityRule } from '../../core/services/form-builder.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../pipes/translate.pipe';

/** Shared by DynamicFieldComponent (display) and personal-details.component.ts (reactive
 * required-validator toggling) — mirrors worker/src/lib/form-schema-types.ts's isFieldVisible so
 * both sides agree on what a field's visibility rule means. */
export function isFieldVisible(field: { visibility?: VisibilityRule | null }, values: Record<string, any>): boolean {
  const rule = field.visibility;
  if (!rule) return true;
  const actual = values[rule.fieldKey];
  const matches = actual === rule.value;
  return rule.op === 'equals' ? matches : !matches;
}

// Renders one admin-added `kind: "custom"` field (see AdminFormBuilder) — text / number / date /
// select / radio / checkbox / textarea, bound to a plain FormControl the caller owns (not an
// ambient FormGroup — keeps this component self-contained regardless of which step's form it's
// dropped into) and evaluating the field's own `visibility` rule against the rest of that step's
// current values. Never renders a `kind: "existing"` field — those keep their real, hand-built
// Angular input and business logic exactly as they are; this only exists for genuinely new fields.
@Component({
  selector: 'app-dynamic-field',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './dynamic-field.component.html',
})
export class DynamicFieldComponent {
  @Input({ required: true }) field!: FormField;
  @Input({ required: true }) control!: FormControl;
  /** The rest of the step's current raw values, so this field's `visibility` rule (if any) can be
   * evaluated against a sibling field that isn't itself a custom field. */
  @Input() allValues: Record<string, any> = {};

  constructor(public i18n: I18nService) {}

  get label(): string {
    if (this.field.labelKey) return this.i18n.t(this.field.labelKey);
    if (this.field.label) return this.i18n.lang() === 'he' ? this.field.label.he : this.field.label.en;
    return this.field.key;
  }

  optionLabel(opt: { label: { en: string; he: string } }): string {
    return this.i18n.lang() === 'he' ? opt.label.he : opt.label.en;
  }

  get helpText(): string {
    if (!this.field.helpText) return '';
    return this.i18n.lang() === 'he' ? this.field.helpText.he : this.field.helpText.en;
  }

  get tooltip(): string {
    if (!this.field.tooltip) return '';
    return this.i18n.lang() === 'he' ? this.field.tooltip.he : this.field.tooltip.en;
  }

  get isVisible(): boolean {
    if (this.field.hidden) return false;
    const values = { ...this.allValues };
    const rule = this.field.visibility;
    if (rule && !(rule.fieldKey in values)) {
      values[rule.fieldKey] = this.control.parent?.get(rule.fieldKey)?.value;
    }
    return isFieldVisible(this.field, values);
  }
}
