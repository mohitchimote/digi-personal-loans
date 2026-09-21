import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ConditionNode,
  ConditionGroup as ConditionGroupModel,
  Condition,
  ScalarOperand,
  ListOperand,
  NamedConstant,
  ConditionOp,
  COMPARISON_OPS,
  MEMBERSHIP_OPS,
} from '../../../../core/services/form-builder.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

export interface FieldPickerOption {
  sectionKey: string;
  fieldKey: string;
  label: string;
}

type OperandKind = 'field' | 'constant' | 'computed' | 'literal';
type FieldOperand = Extract<ScalarOperand, { kind: 'field' }>;
type ConstantOperand = Extract<ScalarOperand, { kind: 'constant' }>;
type ComputedOperand = Extract<ScalarOperand, { kind: 'computed' }>;
type LiteralOperand = Extract<ScalarOperand, { kind: 'literal' }>;

// Recursive AND/OR condition-tree editor for a field's `visibility` — see
// worker/src/lib/form-schema-types.ts for the condition engine this edits. A standalone
// component importing itself is Angular's supported pattern for a recursive tree UI (each
// nested group renders via <app-condition-group> again). Every mutation is in-place on the
// bound `group` object, followed by emitting `changed` — mirrors the parent page's existing
// "mutate then touch()" pattern rather than introducing ControlValueAccessor machinery for
// what's still an internal admin tool.
@Component({
  selector: 'app-condition-group',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, ConditionGroupComponent],
  templateUrl: './condition-group.component.html',
  styleUrl: './condition-group.component.scss',
})
export class ConditionGroupComponent {
  @Input({ required: true }) group!: ConditionGroupModel;
  @Input({ required: true }) fields: FieldPickerOption[] = [];
  @Input({ required: true }) constants: NamedConstant[] = [];
  @Input() disabled = false;
  @Output() changed = new EventEmitter<void>();

  comparisonOps = COMPARISON_OPS;
  membershipOps = MEMBERSHIP_OPS;

  private emit(): void {
    this.changed.emit();
  }

  setGroupOp(op: 'and' | 'or'): void {
    this.group.op = op;
    this.emit();
  }

  private blankCondition(): Condition {
    const first = this.fields[0];
    const left: ScalarOperand = first ? { kind: 'field', sectionKey: first.sectionKey, fieldKey: first.fieldKey } : { kind: 'literal', value: '' };
    return { kind: 'condition', left, op: 'equals', right: { kind: 'literal', value: '' } };
  }

  addCondition(): void {
    this.group.conditions.push(this.blankCondition());
    this.emit();
  }

  addNestedGroup(): void {
    this.group.conditions.push({ kind: 'group', op: 'and', conditions: [this.blankCondition()] });
    this.emit();
  }

  removeNode(index: number): void {
    this.group.conditions.splice(index, 1);
    this.emit();
  }

  isGroup(node: ConditionNode): node is ConditionGroupModel {
    return node.kind === 'group';
  }

  asCondition(node: ConditionNode): Condition {
    return node as Condition;
  }

  asGroup(node: ConditionNode): ConditionGroupModel {
    return node as ConditionGroupModel;
  }

  isMembership(op: ConditionOp): boolean {
    return op === 'in' || op === 'notIn';
  }

  setConditionOp(cond: Condition, op: ConditionOp): void {
    (cond as { op: ConditionOp }).op = op;
    if (this.isMembership(op) && cond.right.kind !== 'list') {
      (cond as { right: ListOperand }).right = { kind: 'list', values: [] };
    } else if (!this.isMembership(op) && cond.right.kind === 'list') {
      (cond as { right: ScalarOperand }).right = { kind: 'literal', value: '' };
    }
    this.emit();
  }

  // --- Operand editing (shared by a condition's `left` and, when not in/notIn, `right`) ---

  operandKindOf(op: ScalarOperand): OperandKind {
    return op.kind;
  }

  setOperandKind(cond: Condition, side: 'left' | 'right', kind: OperandKind): void {
    const first = this.fields[0];
    let next: ScalarOperand;
    switch (kind) {
      case 'field':
        next = first ? { kind: 'field', sectionKey: first.sectionKey, fieldKey: first.fieldKey } : { kind: 'literal', value: '' };
        break;
      case 'constant':
        next = { kind: 'constant', key: this.constants[0]?.key ?? '' };
        break;
      case 'computed':
        next = { kind: 'computed', fn: 'age', dateField: first ? { sectionKey: first.sectionKey, fieldKey: first.fieldKey } : { sectionKey: '', fieldKey: '' } };
        break;
      default:
        next = { kind: 'literal', value: '' };
    }
    (cond as any)[side] = next;
    this.emit();
  }

  fieldRefKey(op: FieldOperand): string {
    return `${op.sectionKey}::${op.fieldKey}`;
  }

  setFieldOperand(op: FieldOperand, ref: string): void {
    const [sectionKey, fieldKey] = ref.split('::');
    op.sectionKey = sectionKey;
    op.fieldKey = fieldKey;
    this.emit();
  }

  setConstantOperand(op: ConstantOperand, key: string): void {
    op.key = key;
    this.emit();
  }

  setComputedDateField(op: ComputedOperand, ref: string): void {
    const [sectionKey, fieldKey] = ref.split('::');
    op.dateField = { sectionKey, fieldKey };
    this.emit();
  }

  toggleComputedOffset(op: ComputedOperand): void {
    if (op.offsetField) {
      delete op.offsetField;
      delete op.offsetUnit;
    } else {
      const first = this.fields[0];
      op.offsetField = first ? { sectionKey: first.sectionKey, fieldKey: first.fieldKey } : { sectionKey: '', fieldKey: '' };
      op.offsetUnit = 'months';
    }
    this.emit();
  }

  setComputedOffsetField(op: ComputedOperand, ref: string): void {
    const [sectionKey, fieldKey] = ref.split('::');
    op.offsetField = { sectionKey, fieldKey };
    this.emit();
  }

  setComputedOffsetUnit(op: ComputedOperand, unit: 'months' | 'years'): void {
    op.offsetUnit = unit;
    this.emit();
  }

  literalType(op: LiteralOperand): 'text' | 'number' | 'boolean' {
    if (typeof op.value === 'number') return 'number';
    if (typeof op.value === 'boolean') return 'boolean';
    return 'text';
  }

  setLiteralType(op: LiteralOperand, type: 'text' | 'number' | 'boolean'): void {
    op.value = type === 'boolean' ? true : type === 'number' ? 0 : '';
    this.emit();
  }

  setLiteralValue(op: LiteralOperand, raw: string): void {
    op.value = this.literalType(op) === 'number' ? Number(raw) || 0 : raw;
    this.emit();
  }

  setLiteralBool(op: LiteralOperand, value: boolean): void {
    op.value = value;
    this.emit();
  }

  // --- List operand (in / notIn right-hand side) ---

  addListValue(list: ListOperand): void {
    list.values.push('');
    this.emit();
  }

  removeListValue(list: ListOperand, index: number): void {
    list.values.splice(index, 1);
    this.emit();
  }

  setListValue(list: ListOperand, index: number, raw: string): void {
    list.values[index] = raw;
    this.emit();
  }
}
