import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dictionary, LetterImage, LetterIssue, LetterNode, SavedRule } from '../../../core/services/letters.service';
import { BLOCK_KINDS, cloneNode, fieldChoices, newNode } from './letter-model';
import { BiTextComponent } from './bi-text.component';
import { RuleEditorComponent } from './rule-editor.component';

/** One level of a letter: its blocks in order, each editable, movable, duplicable and removable; conditional,
 * repeat and choice blocks contain further levels, edited by this same component. */
@Component({
  selector: 'app-letter-blocks',
  standalone: true,
  // Edits are made in place on the letter, so these must be checked on every pass, not only when an input changes.
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [CommonModule, FormsModule, BiTextComponent, RuleEditorComponent, LetterBlocksComponent],
  styles: [`
    .blk { border: 1px solid var(--border, #d6dde6); border-radius: 6px; background: #fff; margin: 0 0 10px; }
    .blk.has-error { border-color: #b3261e; } .blk.has-warning { border-color: #c77700; }
    .bh { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #f4f6f9; border-radius: 6px 6px 0 0; font-size: 12px; font-weight: 600; letter-spacing: .02em; }
    .bh .sp { flex: 1; }
    .bh button { background: none; border: 0; cursor: pointer; padding: 2px 6px; color: #445; }
    .bh button:hover { color: #003f79; }
    .bb { padding: 10px; }
    .issue { font-size: 12px; margin: 4px 0; } .issue.error { color: #b3261e; } .issue.warning { color: #8a5a00; }
    .kids { margin-top: 10px; padding-left: 12px; border-left: 3px solid #cfd8e3; }
    .variant { margin: 10px 0; padding: 8px; background: #fafbfd; border: 1px dashed #cfd8e3; border-radius: 6px; }
    .add { display: flex; gap: 8px; align-items: center; margin: 6px 0 12px; }
    .rows .r { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: start; margin-bottom: 10px; }
    .hint { color: #667; font-size: 12px; }
    .empty { color: #889; font-size: 13px; padding: 6px 0; }
  `],
  template: `
    <div *ngFor="let n of nodes; let i = index" class="blk" [id]="'blk-' + n.id" [class.has-error]="severity(n.id) === 'error'" [class.has-warning]="severity(n.id) === 'warning'">
      <div class="bh">
        <span>{{ title(n) }}</span><span class="sp"></span>
        <button type="button" title="Move up" [disabled]="i === 0" (click)="move(i, -1)">↑</button>
        <button type="button" title="Move down" [disabled]="i === nodes.length - 1" (click)="move(i, 1)">↓</button>
        <button type="button" title="Duplicate" (click)="duplicate(i)">⧉</button>
        <button type="button" title="Delete" (click)="remove(i)">🗑</button>
      </div>
      <div class="bb">
        <div class="issue" [ngClass]="x.severity" *ngFor="let x of issuesFor(n.id)">{{ x.message }}</div>

        <ng-container [ngSwitch]="n.t">
          <ng-container *ngSwitchCase="'heading'"><app-bi-text [text]="$any(n).text" [rows]="1" [dictionary]="dictionary" [list]="list" (changed)="changed.emit()" /></ng-container>
          <ng-container *ngSwitchCase="'paragraph'"><app-bi-text [text]="$any(n).text" [rows]="4" [dictionary]="dictionary" [list]="list" (changed)="changed.emit()" /></ng-container>

          <ng-container *ngSwitchCase="'list'">
            <div class="rows">
              <div class="r" style="grid-template-columns: 1fr auto" *ngFor="let it of $any(n).items; let k = index">
                <app-bi-text [text]="it" [rows]="2" [dictionary]="dictionary" [list]="list" (changed)="changed.emit()" />
                <button type="button" class="db-btn db-btn--ghost db-btn--sm" (click)="$any(n).items.splice(k, 1); changed.emit()">Remove</button>
              </div>
            </div>
            <button type="button" class="db-btn db-btn--ghost db-btn--sm" (click)="$any(n).items.push({ en: '', he: '' }); changed.emit()">+ bullet</button>
          </ng-container>

          <ng-container *ngSwitchCase="'table'">
            <div class="rows">
              <div class="r" *ngFor="let r of $any(n).rows; let k = index" style="grid-template-columns: 1fr 1fr auto">
                <div><div class="hint">Label</div><app-bi-text [text]="r.label" [rows]="1" [dictionary]="dictionary" [list]="list" (changed)="changed.emit()" /></div>
                <div><div class="hint">Value</div><app-bi-text [text]="r.value" [rows]="1" [dictionary]="dictionary" [list]="list" (changed)="changed.emit()" /></div>
                <button type="button" class="db-btn db-btn--ghost db-btn--sm" (click)="$any(n).rows.splice(k, 1); changed.emit()">Remove</button>
              </div>
            </div>
            <button type="button" class="db-btn db-btn--ghost db-btn--sm" (click)="$any(n).rows.push({ label: { en: '', he: '' }, value: { en: '', he: '' } }); changed.emit()">+ row</button>
          </ng-container>

          <ng-container *ngSwitchCase="'image'">
            <div class="db-form-group"><label>Picture</label>
              <select class="db-select" [ngModel]="$any(n).imageId || ''" (ngModelChange)="$any(n).imageId = $event || undefined; changed.emit()">
                <option value="">— none chosen —</option>
                <option *ngFor="let im of images" [value]="im.id">{{ im.name }} ({{ im.kind }})</option>
              </select></div>
            <div class="hint">Description (read by screen readers and shown if the picture is missing)</div>
            <app-bi-text [text]="$any(n).alt" [rows]="1" [dictionary]="dictionary" [list]="list" (changed)="changed.emit()" />
          </ng-container>

          <ng-container *ngSwitchCase="'signature'">
            <div class="db-form-group"><label>Signature picture</label>
              <select class="db-select" [ngModel]="$any(n).imageId || ''" (ngModelChange)="$any(n).imageId = $event || undefined; changed.emit()">
                <option value="">— none (blank line to sign) —</option>
                <option *ngFor="let im of images" [value]="im.id">{{ im.name }} ({{ im.kind }})</option>
              </select></div>
            <div class="hint">Caption under the line</div>
            <app-bi-text [text]="$any(n).caption" [rows]="1" [dictionary]="dictionary" [list]="list" (changed)="changed.emit()" />
          </ng-container>

          <ng-container *ngSwitchCase="'when'">
            <app-rule-editor [rule]="$any(n).rule" [dictionary]="dictionary" [saved]="saved" [list]="list" (changed)="changed.emit()" (create)="$any(n).rule = $event; changed.emit()" />
            <div class="kids"><app-letter-blocks [nodes]="$any(n).children" [list]="list" [dictionary]="dictionary" [saved]="saved" [images]="images" [issues]="issues" (changed)="changed.emit()" /></div>
          </ng-container>

          <ng-container *ngSwitchCase="'repeat'">
            <div class="db-form-group"><label>Repeat for each entry of</label>
              <select class="db-select" [ngModel]="$any(n).over" (ngModelChange)="$any(n).over = $event; changed.emit()">
                <option value="" disabled>Choose a list…</option>
                <option *ngFor="let l of lists()" [value]="l.path">{{ l.label }}</option>
              </select></div>
            <div class="hint">Only entries where (optional)</div>
            <app-rule-editor [rule]="$any(n).where" [dictionary]="dictionary" [saved]="saved" [list]="$any(n).over || undefined" (changed)="changed.emit()" (create)="$any(n).where = $event; changed.emit()" />
            <button type="button" class="db-btn db-btn--ghost db-btn--sm" *ngIf="$any(n).where" (click)="$any(n).where = null; changed.emit()">Remove filter</button>
            <div class="kids"><app-letter-blocks [nodes]="$any(n).children" [list]="$any(n).over || undefined" [dictionary]="dictionary" [saved]="saved" [images]="images" [issues]="issues" (changed)="changed.emit()" /></div>
          </ng-container>

          <ng-container *ngSwitchCase="'alternatives'">
            <div class="hint">The first variant whose condition is met is used. A variant with no condition means "otherwise" and should be last.</div>
            <div class="variant" *ngFor="let v of $any(n).variants; let k = index">
              <div style="display:flex;gap:8px;align-items:center"><strong>{{ k === 0 ? 'If' : 'Otherwise if' }}</strong><span style="flex:1"></span>
                <button type="button" class="db-btn db-btn--ghost db-btn--sm" [disabled]="k === 0" (click)="moveVariant($any(n), k, -1)">↑</button>
                <button type="button" class="db-btn db-btn--ghost db-btn--sm" [disabled]="k === $any(n).variants.length - 1" (click)="moveVariant($any(n), k, 1)">↓</button>
                <button type="button" class="db-btn db-btn--ghost db-btn--sm" (click)="$any(n).variants.splice(k, 1); changed.emit()">Remove variant</button></div>
              <app-rule-editor [rule]="v.rule" [dictionary]="dictionary" [saved]="saved" [list]="list" (changed)="changed.emit()" (create)="v.rule = $event; changed.emit()" />
              <button type="button" class="db-btn db-btn--ghost db-btn--sm" *ngIf="v.rule" (click)="v.rule = null; changed.emit()">Make this the "otherwise" variant</button>
              <div class="kids"><app-letter-blocks [nodes]="v.children" [list]="list" [dictionary]="dictionary" [saved]="saved" [images]="images" [issues]="issues" (changed)="changed.emit()" /></div>
            </div>
            <button type="button" class="db-btn db-btn--ghost db-btn--sm" (click)="$any(n).variants.push({ rule: null, children: [] }); changed.emit()">+ variant</button>
          </ng-container>
        </ng-container>
      </div>
    </div>

    <div class="empty" *ngIf="nodes.length === 0">Nothing here yet.</div>
    <div class="add">
      <select class="db-select" #kind>
        <option *ngFor="let k of kinds" [value]="k.value">{{ k.label }}</option>
      </select>
      <button type="button" class="db-btn db-btn--accent db-btn--sm" (click)="add(kind.value)">+ Add block</button>
    </div>
  `,
})
export class LetterBlocksComponent {
  @Input({ required: true }) nodes!: LetterNode[];
  @Input() list?: string;
  @Input() dictionary: Dictionary | null = null;
  @Input() saved: SavedRule[] = [];
  @Input() images: LetterImage[] = [];
  @Input() issues: LetterIssue[] = [];
  @Output() changed = new EventEmitter<void>();
  kinds = BLOCK_KINDS;

  title(n: LetterNode): string { return BLOCK_KINDS.find((k) => k.value === n.t)?.label ?? n.t; }
  issuesFor = (id: string) => this.issues.filter((i) => i.nodeId === id);
  severity(id: string): 'error' | 'warning' | null { const x = this.issuesFor(id); return x.some((i) => i.severity === 'error') ? 'error' : x.length ? 'warning' : null; }
  lists = () => fieldChoices(this.dictionary, undefined, { scalars: false });

  add(kind: string) { this.nodes.push(newNode(kind)); this.changed.emit(); }
  remove(i: number) { this.nodes.splice(i, 1); this.changed.emit(); }
  duplicate(i: number) { this.nodes.splice(i + 1, 0, cloneNode(this.nodes[i])); this.changed.emit(); }
  move(i: number, d: number) { const j = i + d; if (j < 0 || j >= this.nodes.length) return; [this.nodes[i], this.nodes[j]] = [this.nodes[j], this.nodes[i]]; this.changed.emit(); }
  moveVariant(n: { variants: unknown[] }, i: number, d: number) { const j = i + d; if (j < 0 || j >= n.variants.length) return; [n.variants[i], n.variants[j]] = [n.variants[j], n.variants[i]]; this.changed.emit(); }
}
