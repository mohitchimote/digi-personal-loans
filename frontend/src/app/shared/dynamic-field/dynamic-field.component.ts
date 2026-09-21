import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  FormField,
  VisibilityNode,
  ConditionNode,
  ScalarOperand,
  NamedConstant,
} from '../../core/services/form-builder.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../pipes/translate.pipe';

/** Values a condition's field/computed operands resolve against, flat-keyed
 * `"sectionKey.fieldKey"` across the whole application (not just one step) — see
 * personal-details.component.ts for how this is built. */
export interface EvalContext {
  constants: readonly NamedConstant[];
  values: Record<string, unknown>;
}

// --- Visibility condition engine — mirrors worker/src/lib/form-schema-types.ts exactly (same
// operand kinds, operators, and "unknown operand -> condition false" rule). Shared by
// DynamicFieldComponent (display) and personal-details.component.ts (reactive required-
// validator toggling). Kept in sync by hand — see that file for the full design rationale;
// this is the frontend's copy since the two apps deploy separately with no shared package. ---

function isLegacyRule(node: VisibilityNode): node is Extract<VisibilityNode, { fieldKey: string }> {
  return !('kind' in node);
}

export function toConditionNode(node: VisibilityNode, currentSectionKey: string): ConditionNode {
  if (isLegacyRule(node)) {
    return {
      kind: 'condition',
      left: { kind: 'field', sectionKey: currentSectionKey, fieldKey: node.fieldKey },
      op: node.op,
      right: { kind: 'literal', value: node.value },
    };
  }
  return node;
}

function resolveComputed(op: Extract<ScalarOperand, { kind: 'computed' }>, ctx: EvalContext): number | undefined {
  const dobRaw = ctx.values[`${op.dateField.sectionKey}.${op.dateField.fieldKey}`];
  if (typeof dobRaw !== 'string' || !dobRaw) return undefined;
  const dob = new Date(dobRaw);
  if (Number.isNaN(dob.getTime())) return undefined;

  let asOf = new Date();
  if (op.offsetField) {
    const offsetRaw = ctx.values[`${op.offsetField.sectionKey}.${op.offsetField.fieldKey}`];
    const offset = Number(offsetRaw);
    if (offsetRaw == null || offsetRaw === '' || Number.isNaN(offset)) return undefined;
    const days = op.offsetUnit === 'years' ? offset * 365.25 : offset * 30.4375;
    asOf = new Date(asOf.getTime() + days * 86400000);
  }

  let age = asOf.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear = asOf.getMonth() > dob.getMonth() || (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age--;
  return age;
}

function resolveOperand(operand: ScalarOperand, ctx: EvalContext): unknown {
  switch (operand.kind) {
    case 'literal':
      return operand.value;
    case 'field':
      return ctx.values[`${operand.sectionKey}.${operand.fieldKey}`];
    case 'constant':
      return ctx.constants.find((c) => c.key === operand.key)?.value;
    case 'computed':
      return resolveComputed(operand, ctx);
  }
}

function evaluateNode(node: ConditionNode, ctx: EvalContext): boolean {
  if (node.kind === 'group') {
    const results = node.conditions.map((c) => evaluateNode(c, ctx));
    return node.op === 'and' ? results.every(Boolean) : results.some(Boolean);
  }

  const left = resolveOperand(node.left, ctx);

  switch (node.op) {
    case 'in':
    case 'notIn': {
      if (left === null || left === undefined) return false;
      const found = node.right.values.some((v) => String(v) === String(left));
      return node.op === 'in' ? found : !found;
    }
    default: {
      const right = resolveOperand(node.right, ctx);
      if (left === null || left === undefined || right === null || right === undefined) return false;
      switch (node.op) {
        case 'equals':
          return left === right;
        case 'notEquals':
          return left !== right;
        case 'gt':
          return Number(left) > Number(right);
        case 'gte':
          return Number(left) >= Number(right);
        case 'lt':
          return Number(left) < Number(right);
        case 'lte':
          return Number(left) <= Number(right);
        case 'contains':
          return String(left).toLowerCase().includes(String(right).toLowerCase());
        default:
          return false;
      }
    }
  }
}

export function isFieldVisible(field: { visibility?: VisibilityNode | null }, currentSectionKey: string, ctx: EvalContext): boolean {
  if (!field.visibility) return true;
  return evaluateNode(toConditionNode(field.visibility, currentSectionKey), ctx);
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
  /** The section this field lives in — only matters for upgrading a legacy visibility rule
   * (its bare fieldKey always meant "same section"), see toConditionNode. */
  @Input({ required: true }) sectionKey!: string;
  /** Cross-application values + constants this field's `visibility` condition (if any) is
   * evaluated against — see personal-details.component.ts for how this is built. */
  @Input() evalContext: EvalContext = { constants: [], values: {} };

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
    return isFieldVisible(this.field, this.sectionKey, this.evalContext);
  }
}
