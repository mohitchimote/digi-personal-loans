import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConditionRule, Dictionary, GroupRule, Operator, Rule, SavedRule } from '../../../core/services/letters.service';
import { FieldChoice, NEEDS_NUMBER, NEEDS_VALUE, OPS_BY_TYPE, OP_LABEL, choicesOf, fieldChoices, metaFor } from './letter-model';

/**
 * Edits one rule in place: a group of conditions (all / any, optionally "not"), a condition, or a saved
 * rule. Conditions on a list can carry their own group for the entries (`item.*`). Changes are made on the
 * object it is given and announced with `changed`, so the editor above knows the letter is dirty.
 */
@Component({
  selector: 'app-rule-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.Default,
  styles: [`
    :host { display: block; }
    .grp { border-left: 3px solid var(--brand-blue, #003f79); background: rgba(0, 63, 121, 0.04); padding: 8px 10px; border-radius: 4px; margin: 6px 0; }
    .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0; }
    .row select, .row input { min-width: 0; }
    .head { display: flex; gap: 8px; align-items: center; font-size: 13px; }
    .mut { color: var(--text-muted, #667); font-size: 12px; }
    .x { background: none; border: 0; cursor: pointer; color: #b3261e; font-size: 16px; line-height: 1; }
    .nested { margin-left: 14px; flex-basis: 100%; }
  `],
  template: `
    <ng-container *ngIf="rule as r">
      <!-- group -->
      <div class="grp" *ngIf="r.t === 'group'">
        <div class="head">
          <span>Show when</span>
          <select class="db-select" [ngModel]="asGroup(r).op" (ngModelChange)="asGroup(r).op = $event; changed.emit()">
            <option value="all">all</option><option value="any">any</option>
          </select>
          <span>of these are true</span>
          <label class="mut"><input type="checkbox" [ngModel]="!!asGroup(r).not" (ngModelChange)="asGroup(r).not = $event; changed.emit()" /> reverse (not)</label>
          <button type="button" class="x" *ngIf="removable" title="Remove" (click)="remove.emit()">×</button>
        </div>
        <div *ngFor="let it of asGroup(r).items; let i = index">
          <app-rule-editor [rule]="it" [dictionary]="dictionary" [saved]="saved" [list]="list" [removable]="true"
            (changed)="changed.emit()" (remove)="asGroup(r).items.splice(i, 1); changed.emit()" />
        </div>
        <div class="row">
          <button type="button" class="db-btn db-btn--ghost db-btn--sm" (click)="addCondition(asGroup(r))">+ condition</button>
          <button type="button" class="db-btn db-btn--ghost db-btn--sm" (click)="addGroup(asGroup(r))">+ group</button>
          <button type="button" class="db-btn db-btn--ghost db-btn--sm" *ngIf="saved.length" (click)="addRef(asGroup(r))">+ saved rule</button>
        </div>
      </div>

      <!-- saved rule -->
      <div class="row" *ngIf="r.t === 'ref'">
        <span class="mut">Saved rule</span>
        <select class="db-select" [ngModel]="asRef(r).id" (ngModelChange)="asRef(r).id = $event; changed.emit()">
          <option *ngFor="let s of saved" [value]="s.id">{{ s.name }}</option>
          <option *ngIf="!hasSaved(asRef(r).id)" [value]="asRef(r).id">{{ asRef(r).id }} (missing)</option>
        </select>
        <button type="button" class="x" *ngIf="removable" title="Remove" (click)="remove.emit()">×</button>
      </div>

      <!-- condition -->
      <div *ngIf="r.t === 'condition'">
        <div class="row">
          <select class="db-select" [ngModel]="asCond(r).field" (ngModelChange)="setField(asCond(r), $event)">
            <option value="" disabled>Choose a field…</option>
            <optgroup *ngFor="let g of groups()" [label]="g.name">
              <option *ngFor="let f of g.items" [value]="f.path">{{ f.label }}</option>
            </optgroup>
          </select>
          <select class="db-select" [ngModel]="asCond(r).op" (ngModelChange)="setOp(asCond(r), $event)" [disabled]="!asCond(r).field">
            <option *ngFor="let o of opsFor(asCond(r))" [value]="o">{{ label(o) }}</option>
          </select>

          <!-- value -->
          <ng-container *ngIf="needsValue(asCond(r))">
            <select class="db-select" *ngIf="isChoice(asCond(r)) && asCond(r).rhs?.k !== 'field'" [ngModel]="asCond(r).rhs?.v" (ngModelChange)="setValue(asCond(r), $event)">
              <option value="" disabled>Choose…</option>
              <option *ngFor="let c of choices(asCond(r))" [value]="c.v">{{ c.en }}</option>
            </select>
            <input class="db-input" *ngIf="!isChoice(asCond(r)) && asCond(r).rhs?.k === 'value'" [type]="inputType(asCond(r))" [ngModel]="asCond(r).rhs?.v" (ngModelChange)="setValue(asCond(r), $event)" placeholder="value" />
            <span class="mut" *ngIf="asCond(r).rhs?.k === 'today'">today</span>
            <select class="db-select" *ngIf="asCond(r).rhs?.k === 'field'" [ngModel]="asCond(r).rhs?.v" (ngModelChange)="setValue(asCond(r), $event)">
              <option value="" disabled>Choose a field…</option>
              <option *ngFor="let f of sameType(asCond(r))" [value]="f.path">{{ f.label }}</option>
            </select>
            <select class="db-select" [ngModel]="asCond(r).rhs?.k || 'value'" (ngModelChange)="setKind(asCond(r), $event)" title="Compare with">
              <option value="value">a value</option><option value="field">another field</option><option *ngIf="isDate(asCond(r))" value="today">today</option>
            </select>
          </ng-container>
          <ng-container *ngIf="asCond(r).op === 'in'">
            <input class="db-input" [ngModel]="(asCond(r).rhs?.list || []).join(', ')" (ngModelChange)="setList(asCond(r), $event)" placeholder="a, b, c" />
          </ng-container>
          <ng-container *ngIf="asCond(r).op === 'between'">
            <input class="db-input" type="number" style="width:90px" [ngModel]="asCond(r).rhs?.v" (ngModelChange)="setBetween(asCond(r), 'v', $event)" />
            <span class="mut">and</span>
            <input class="db-input" type="number" style="width:90px" [ngModel]="asCond(r).rhs?.v2" (ngModelChange)="setBetween(asCond(r), 'v2', $event)" />
          </ng-container>
          <input class="db-input" type="number" style="width:90px" *ngIf="needsNumber(asCond(r))" [ngModel]="asCond(r).rhs?.v" (ngModelChange)="setNumber(asCond(r), $event)" />
          <button type="button" class="x" *ngIf="removable" title="Remove" (click)="remove.emit()">×</button>
        </div>
        <div class="nested" *ngIf="asCond(r).op === 'anyMatch' || asCond(r).op === 'noneMatch'">
          <app-rule-editor [rule]="asCond(r).nested ?? null" [dictionary]="dictionary" [saved]="saved" [list]="asCond(r).field"
            (changed)="changed.emit()" (create)="asCond(r).nested = asGroup($event); changed.emit()" />
        </div>
      </div>
    </ng-container>

    <!-- nothing yet -->
    <div class="row" *ngIf="!rule">
      <span class="mut">No condition.</span>
      <button type="button" class="db-btn db-btn--ghost db-btn--sm" (click)="create.emit(emptyGroup())">Add a condition</button>
    </div>
  `,
})
export class RuleEditorComponent {
  @Input() rule: Rule | null = null;
  @Input() dictionary: Dictionary | null = null;
  @Input() saved: SavedRule[] = [];
  /** The list this rule is inside (a repeat, or a list condition), so item.* can be chosen. */
  @Input() list?: string;
  @Input() removable = false;
  @Output() changed = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();
  /** The rule did not exist and has just been created: the parent stores it. */
  @Output() create = new EventEmitter<Rule>();

  asGroup = (r: Rule) => r as GroupRule;
  asCond = (r: Rule) => r as ConditionRule;
  asRef = (r: Rule) => r as { t: 'ref'; id: string };
  emptyGroup(): GroupRule { return { t: 'group', op: 'all', items: [{ t: 'condition', field: '', op: 'eq' }] }; }
  label = (o: Operator) => OP_LABEL[o];
  hasSaved = (id: string) => this.saved.some((s) => s.id === id);

  groups(): { name: string; items: FieldChoice[] }[] {
    const by = new Map<string, FieldChoice[]>();
    for (const f of fieldChoices(this.dictionary, this.list)) (by.get(f.group) ?? by.set(f.group, []).get(f.group)!).push(f);
    return [...by].map(([name, items]) => ({ name, items }));
  }
  private meta(c: ConditionRule) { return metaFor(this.dictionary, c.field, this.list); }
  opsFor(c: ConditionRule): Operator[] { const m = this.meta(c); return m ? OPS_BY_TYPE[m.type] : []; }
  needsValue = (c: ConditionRule) => NEEDS_VALUE.includes(c.op);
  needsNumber = (c: ConditionRule) => NEEDS_NUMBER.includes(c.op);
  isChoice = (c: ConditionRule) => this.meta(c)?.type === 'choice';
  isDate = (c: ConditionRule) => this.meta(c)?.type === 'date';
  choices = (c: ConditionRule) => choicesOf(this.meta(c));
  inputType(c: ConditionRule): string { const t = this.meta(c)?.type; return t === 'number' || t === 'money' || t === 'percent' ? 'number' : t === 'date' ? 'date' : 'text'; }
  sameType(c: ConditionRule): FieldChoice[] {
    const t = this.meta(c)?.type;
    const num = (x?: string) => x === 'number' || x === 'money' || x === 'percent';
    return fieldChoices(this.dictionary, this.list, { lists: false }).filter((f) => f.path !== c.field && (f.type === t || (num(f.type) && num(t))));
  }

  addCondition(g: GroupRule) { g.items.push({ t: 'condition', field: '', op: 'eq' }); this.changed.emit(); }
  addGroup(g: GroupRule) { g.items.push(this.emptyGroup()); this.changed.emit(); }
  addRef(g: GroupRule) { g.items.push({ t: 'ref', id: this.saved[0].id }); this.changed.emit(); }

  setField(c: ConditionRule, path: string) {
    c.field = path;
    const ops = this.opsFor(c);
    if (!ops.includes(c.op)) c.op = ops[0];
    this.reset(c);
    this.changed.emit();
  }
  setOp(c: ConditionRule, op: Operator) { c.op = op; this.reset(c); this.changed.emit(); }
  /** Starting values for the operator, so a freshly chosen condition is complete or visibly empty. */
  private reset(c: ConditionRule) {
    delete c.nested;
    if (NEEDS_VALUE.includes(c.op)) c.rhs = { k: 'value', v: this.isChoice(c) ? undefined : '' };
    else if (c.op === 'in') c.rhs = { k: 'value', list: [] };
    else if (c.op === 'between') c.rhs = { k: 'value', v: 0, v2: 0 };
    else if (NEEDS_NUMBER.includes(c.op)) c.rhs = { k: 'value', v: 0 };
    else delete c.rhs;
    if (c.op === 'anyMatch' || c.op === 'noneMatch') c.nested = { t: 'group', op: 'all', items: [] };
  }
  setValue(c: ConditionRule, v: string | number) {
    const t = this.meta(c)?.type;
    c.rhs = { k: c.rhs?.k === 'field' ? 'field' : 'value', v: c.rhs?.k !== 'field' && (t === 'number' || t === 'money' || t === 'percent') && v !== '' ? Number(v) : v };
    this.changed.emit();
  }
  setKind(c: ConditionRule, k: 'value' | 'field' | 'today') { c.rhs = k === 'today' ? { k } : { k, v: '' }; this.changed.emit(); }
  setNumber(c: ConditionRule, v: string) { c.rhs = { k: 'value', v: Number(v) }; this.changed.emit(); }
  setBetween(c: ConditionRule, which: 'v' | 'v2', v: string) { c.rhs = { ...(c.rhs ?? { k: 'value' }), k: 'value', [which]: Number(v) }; this.changed.emit(); }
  setList(c: ConditionRule, text: string) { c.rhs = { k: 'value', list: text.split(',').map((s) => s.trim()).filter(Boolean) }; this.changed.emit(); }
}
