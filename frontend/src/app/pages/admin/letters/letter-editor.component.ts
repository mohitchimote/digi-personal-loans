import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Dictionary, Lang, LetterDocument, LetterImage, LetterIssue, LetterNode, LetterTemplateRow, LetterVersionInfo, LettersService, SavedRule } from '../../../core/services/letters.service';
import { EvalContext } from '../../../core/letters/rules';
import { LetterBlocksComponent } from './letter-blocks.component';
import { LetterListComponent } from './letter-list.component';
import { PageHost, ZONES, Zone } from './page-host';
import { RuleEditorComponent } from './rule-editor.component';
import { BLOCK_KINDS, FieldChoice, cloneNode, fieldChoices, newId, newNode } from './letter-model';

interface Found { node: LetterNode; list: LetterNode[]; parent: LetterNode | null; zone: Zone }
interface OutlineRow { id: string; depth: number; label: string; kind: string }
const TAG: Record<string, string> = { heading: 'Heading', paragraph: 'Text', list: 'List', table: 'Table', image: 'Picture', signature: 'Signature', when: 'Show only if', repeat: 'For each', alternatives: 'Alternatives' };

/**
 * The letter editor. The main surface is the page itself: type on it like a word processor, press / to put a field in,
 * and use the toolbar to show a part only sometimes, repeat it, or offer alternatives. Letter view shows the letter
 * as it prints for the sample data; Structure view shows every part and the rule around it. A third view lists the
 * blocks as forms.
 */
@Component({
  selector: 'app-letter-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LetterBlocksComponent, LetterListComponent, RuleEditorComponent],
  styles: [`
    .top { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
    .top h2 { margin: 0; } .sp { flex: 1; }
    .chip { font-size: 12px; padding: 2px 8px; border-radius: 10px; background: #e8eef5; color: #234; }
    .chip.pub { background: #e3f4e6; color: #1b5e2a; } .chip.dirty { background: #fff1d6; color: #7a4b00; }
    .toolbar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; background: #fff; border: 1px solid var(--border, #d6dde6); border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
    .grp { display: flex; gap: 6px; align-items: center; } .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #667; }
    .segs { display: inline-flex; border: 1px solid var(--border, #cfd8e3); border-radius: 6px; overflow: hidden; }
    .seg { background: #fff; border: 0; padding: 5px 10px; cursor: pointer; font-size: 13px; } .seg.on { background: #003f79; color: #fff; }
    .doc { display: grid; grid-template-columns: 210px minmax(0, 1fr) 320px; gap: 14px; align-items: start; }
    .panel { background: #fff; border: 1px solid var(--border, #d6dde6); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .panel h2 { font-size: 13px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: .05em; color: #556; }
    .note, .hint { color: #667; font-size: 12px; }
    .outline button { display: block; width: 100%; text-align: start; background: none; border: 0; padding: 3px 4px; border-radius: 4px; cursor: pointer; font-size: 12px; color: #223; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .outline button:hover { background: #eef3f9; } .outline button.on { background: #dbe8f6; font-weight: 600; }
    .outline .k { color: #003f79; font-size: 10px; text-transform: uppercase; margin-inline-end: 4px; }
    .pages { display: grid; gap: 16px; min-width: 0; } .pages.both { grid-template-columns: 1fr 1fr; }
    .paper { background: #fff; border: 1px solid #cdd5df; box-shadow: 0 1px 6px rgba(20, 40, 70, .12); border-radius: 3px; padding: 36px 40px; min-height: 640px; font-family: Georgia, 'Times New Roman', serif; font-size: 14px; color: #1b2330; }
    .paper .lang { font: 600 10px system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #889; margin-bottom: 10px; }
    .zone { position: relative; } .zone.hf { color: #556; font-size: 12px; border: 1px dashed #d4dbe5; border-radius: 4px; padding: 6px 10px; margin: 6px 0 14px; background: #fafbfd; }
    .zone .zl { font: 600 9px system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #99a; }
    .empty { color: #99a; font-size: 12px; font-style: italic; }
    .issue { font-size: 13px; padding: 5px 0; border-bottom: 1px solid #eef1f5; cursor: pointer; } .issue.error { color: #b3261e; } .issue.warning { color: #8a5a00; }
    .ok { color: #1b5e2a; font-size: 13px; }
    .picker { position: fixed; z-index: 50; width: 380px; max-height: 340px; display: flex; flex-direction: column; background: #fff; border: 1px solid #b9c6d6; border-radius: 8px; box-shadow: 0 8px 28px rgba(10, 30, 60, .22); }
    .picker input { margin: 8px; } .picker .body { overflow: auto; padding: 0 6px 8px; }
    .pg { font: 600 10px system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; color: #667; padding: 8px 6px 2px; }
    .pitem { display: flex; gap: 8px; align-items: baseline; width: 100%; text-align: start; background: none; border: 0; padding: 5px 6px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .pitem:hover { background: #eef3f9; } .pitem .pt { color: #889; font-size: 11px; } .pitem .pp { margin-inline-start: auto; color: #99a; font-size: 11px; font-family: ui-monospace, monospace; }
    .vbox { border: 1px dashed #cfd8e3; border-radius: 6px; padding: 8px; margin: 8px 0; background: #fafbfd; }
    :host ::ng-deep .tok { display: inline-block; background: #e6eef8; color: #0b3a6b; border-radius: 4px; padding: 0 5px; margin: 0 1px; font-size: .92em; font-family: system-ui, sans-serif; white-space: nowrap; }
    :host ::ng-deep .tok.bad { background: #fde8e6; color: #9a1b12; }
    @media (max-width: 1250px) { .doc { grid-template-columns: minmax(0, 1fr) 320px; } .doc > .outline-panel { display: none; } }
    @media (max-width: 950px) { .doc { grid-template-columns: 1fr; } .pages.both { grid-template-columns: 1fr; } }
  `],
  template: `
  <div class="top" *ngIf="template() as t">
    <a routerLink="/admin/letters" class="db-btn db-btn--ghost db-btn--sm">← Letters</a>
    <h2>{{ t.nameEn }}</h2>
    <span class="chip pub" *ngIf="published() as pv">Published v{{ pv }}</span>
    <span class="chip" *ngIf="!published()">Not published</span>
    <span class="chip" *ngIf="editingVersion()">Editing draft v{{ editingVersion() }}</span>
    <span class="chip dirty" *ngIf="dirty()">Unsaved changes</span>
    <span class="sp"></span>
    <button class="db-btn db-btn--ghost" (click)="check()" [disabled]="busy()">Check</button>
    <button class="db-btn db-btn--ghost" (click)="preview()" [disabled]="busy()">Preview PDF</button>
    <button class="db-btn db-btn--accent" (click)="save()" [disabled]="busy() || !dirty()">Save draft</button>
    <button class="db-btn db-btn--primary" (click)="publish()" [disabled]="busy()">Publish</button>
  </div>

  <div class="db-alert db-alert--error mb-16" *ngIf="error()">{{ error() }}</div>
  <div class="db-alert db-alert--info mb-16" *ngIf="notice()">{{ notice() }}</div>
  <div class="loading-row" *ngIf="loading()"><div class="spinner"></div><span>Loading…</span></div>

  <ng-container *ngIf="doc() as d">
    <div class="toolbar">
      <div class="grp"><span class="lbl">View</span><span class="segs">
        <button class="seg" [class.on]="mode() === 'letter'" (click)="mode.set('letter')">Letter view</button>
        <button class="seg" [class.on]="mode() === 'structure'" (click)="mode.set('structure')">Structure view</button>
        <button class="seg" [class.on]="mode() === 'blocks'" (click)="mode.set('blocks')">Blocks</button></span></div>
      <div class="grp" *ngIf="mode() !== 'blocks'"><span class="lbl">Show</span><span class="segs">
        <button class="seg" [class.on]="show() === 'both'" (click)="show.set('both')">Both</button>
        <button class="seg" [class.on]="show() === 'en'" (click)="show.set('en')">English</button>
        <button class="seg" [class.on]="show() === 'he'" (click)="show.set('he')">עברית</button></span></div>
      <ng-container *ngIf="mode() !== 'blocks'">
        <div class="grp"><span class="lbl">Add</span>
          <select class="db-select" [(ngModel)]="addKind">
            <option *ngFor="let k of kinds" [value]="k.value">{{ k.label }}</option>
          </select>
          <select class="db-select" [(ngModel)]="addZone" *ngIf="!selected()" title="Where to add">
            <option value="body">to the body</option><option value="header">to the header</option><option value="footer">to the footer</option>
          </select>
          <button class="db-btn db-btn--ghost db-btn--sm" (click)="add()">{{ selected() ? 'Add after selected' : 'Add' }}</button></div>
        <div class="grp"><span class="lbl">Wrap selected</span>
          <button class="db-btn db-btn--ghost db-btn--sm" (click)="wrap('when')">Show only if…</button>
          <button class="db-btn db-btn--ghost db-btn--sm" (click)="wrap('repeat')">Repeat for each…</button>
          <button class="db-btn db-btn--ghost db-btn--sm" (click)="wrap('alternatives')">Alternatives</button></div>
        <div class="grp">
          <button class="db-btn db-btn--ghost db-btn--sm" (click)="insertFieldFromToolbar()">Insert field <code>/</code></button>
          <button class="db-btn db-btn--ghost db-btn--sm" (click)="undo()" [disabled]="!history.length">Undo</button></div>
      </ng-container>
    </div>

    <!-- blocks as forms -->
    <div class="panel" *ngIf="mode() === 'blocks'">
      <div class="tabsb" style="display:flex;gap:6px;margin-bottom:10px">
        <button *ngFor="let z of zones" class="seg" [class.on]="blocksZone() === z" (click)="blocksZone.set(z)" style="border:1px solid #cfd8e3;border-radius:6px">{{ z | titlecase }} ({{ d[z].length }})</button>
      </div>
      <app-letter-blocks [nodes]="d[blocksZone()]" [dictionary]="dictionary()" [saved]="saved()" [images]="images()" [issues]="issues()" (changed)="touch()" />
    </div>

    <!-- the page -->
    <div class="doc" *ngIf="mode() !== 'blocks'">
      <div class="panel outline-panel outline">
        <h2>Outline</h2>
        <ng-container *ngFor="let z of zones">
          <div class="hint" style="margin-top:6px">{{ z | titlecase }}</div>
          <button *ngFor="let r of outline(z)" [class.on]="selected() === r.id" [style.padding-inline-start.px]="4 + r.depth * 12" (click)="selectAndScroll(r.id)"><span class="k">{{ r.kind }}</span>{{ r.label }}</button>
          <div class="hint" *ngIf="!d[z].length">empty</div>
        </ng-container>
      </div>

      <div class="pages" [class.both]="show() === 'both'" (click)="select(null)">
        <div class="paper" *ngFor="let l of langs()">
          <div class="lang">{{ l === 'en' ? 'English' : 'עברית' }}</div>
          <ng-container *ngFor="let z of zones">
            <div class="zone" [class.hf]="z !== 'body'" *ngIf="z === 'body' || d[z].length || mode() === 'structure'">
              <div class="zl" *ngIf="z !== 'body'">{{ z === 'header' ? 'Header — every page' : 'Footer — every page' }}</div>
              <app-letter-list [nodes]="d[z]" [lang]="l" [host]="self" [ctx]="ctx()"></app-letter-list>
              <div class="empty" *ngIf="!d[z].length">{{ z === 'body' ? 'Nothing here yet. Use Add in the toolbar.' : 'Empty. Use Add → to the ' + z + '.' }}</div>
            </div>
          </ng-container>
        </div>
      </div>

      <div>
        <div class="panel">
          <h2>{{ selectedFound() ? 'Selected: ' + tagOf(selectedFound()!.node) : 'Selected block' }}</h2>
          <p class="note" *ngIf="!selectedFound()">Click a block on the page or in the outline to move it, give it a rule, or change its picture. Type <code>/</code> inside any text to insert a field.</p>
          <ng-container *ngIf="selectedFound() as f">
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
              <button class="db-btn db-btn--ghost db-btn--sm" (click)="move(-1)">Move up</button>
              <button class="db-btn db-btn--ghost db-btn--sm" (click)="move(1)">Move down</button>
              <button class="db-btn db-btn--ghost db-btn--sm" (click)="duplicate()">Duplicate</button>
              <button class="db-btn db-btn--ghost db-btn--sm" *ngIf="isContainer(f.node)" (click)="unwrap()">Unwrap</button>
              <button class="db-btn db-btn--ghost db-btn--sm" (click)="remove()">Delete</button>
            </div>

            <ng-container [ngSwitch]="f.node.t">
              <div *ngSwitchCase="'when'">
                <div class="hint">Show this part</div>
                <app-rule-editor [rule]="$any(f.node).rule" [dictionary]="dictionary()" [saved]="saved()" [list]="listOf(f.node.id)" (changed)="touch()" (create)="$any(f.node).rule = $event; touch()" />
                <button class="db-btn db-btn--ghost db-btn--sm mt-16" (click)="addInside($any(f.node).children)">+ Add a text block inside</button>
              </div>
              <div *ngSwitchCase="'repeat'">
                <div class="hint">For each entry of</div>
                <select class="db-select" [ngModel]="$any(f.node).over" (ngModelChange)="snap(); $any(f.node).over = $event; $any(f.node).where = null; touch()">
                  <option value="" disabled>Choose a list…</option>
                  <option *ngFor="let l of lists()" [value]="l.path">{{ l.label }}</option>
                </select>
                <div class="hint" style="margin-top:10px">Only the entries where (optional)</div>
                <app-rule-editor [rule]="$any(f.node).where" [dictionary]="dictionary()" [saved]="saved()" [list]="$any(f.node).over || undefined" (changed)="touch()" (create)="$any(f.node).where = $event; touch()" />
                <button class="db-btn db-btn--ghost db-btn--sm" *ngIf="$any(f.node).where" (click)="snap(); $any(f.node).where = null; touch()">Remove filter</button>
                <button class="db-btn db-btn--ghost db-btn--sm mt-16" (click)="addInside($any(f.node).children)">+ Add a text block inside</button>
              </div>
              <div *ngSwitchCase="'alternatives'">
                <p class="note">Each variant has its own rule. The first one that is met is used; a variant with no rule means "otherwise".</p>
                <div class="vbox" *ngFor="let v of $any(f.node).variants; let i = index">
                  <div style="display:flex;gap:6px;align-items:center"><strong style="font-size:12px">Variant {{ i + 1 }}{{ !v.rule && i === $any(f.node).variants.length - 1 ? ' (otherwise)' : '' }}</strong><span class="sp"></span>
                    <button class="db-btn db-btn--ghost db-btn--sm" [disabled]="i === 0" (click)="moveVariant($any(f.node), i, -1)">↑</button>
                    <button class="db-btn db-btn--ghost db-btn--sm" [disabled]="i === $any(f.node).variants.length - 1" (click)="moveVariant($any(f.node), i, 1)">↓</button>
                    <button class="db-btn db-btn--ghost db-btn--sm" [disabled]="$any(f.node).variants.length < 2" (click)="snap(); $any(f.node).variants.splice(i, 1); touch()">✕</button></div>
                  <app-rule-editor [rule]="v.rule" [dictionary]="dictionary()" [saved]="saved()" [list]="listOf(f.node.id)" (changed)="touch()" (create)="v.rule = $event; touch()" />
                  <button class="db-btn db-btn--ghost db-btn--sm" *ngIf="v.rule" (click)="snap(); v.rule = null; touch()">Make this "otherwise"</button>
                  <button class="db-btn db-btn--ghost db-btn--sm" (click)="addInside(v.children)">+ text block in this variant</button>
                </div>
                <button class="db-btn db-btn--ghost db-btn--sm" (click)="snap(); $any(f.node).variants.splice(Math.max(0, $any(f.node).variants.length - 1), 0, { rule: null, children: [] }); touch()">+ variant</button>
              </div>
              <div *ngSwitchCase="'image'">
                <div class="hint">Picture</div>
                <select class="db-select" [ngModel]="$any(f.node).imageId || ''" (ngModelChange)="snap(); $any(f.node).imageId = $event || undefined; touch()">
                  <option value="">— none chosen —</option><option *ngFor="let im of images()" [value]="im.id">{{ im.name }} ({{ im.kind }})</option></select>
              </div>
              <div *ngSwitchCase="'signature'">
                <div class="hint">Signature picture</div>
                <select class="db-select" [ngModel]="$any(f.node).imageId || ''" (ngModelChange)="snap(); $any(f.node).imageId = $event || undefined; touch()">
                  <option value="">— none (blank line to sign) —</option><option *ngFor="let im of images()" [value]="im.id">{{ im.name }} ({{ im.kind }})</option></select>
              </div>
              <div *ngSwitchDefault class="note">Edit the text on the page. To show it only sometimes use <b>Show only if…</b>; to vary the wording use <b>Alternatives</b>.</div>
            </ng-container>
            <div *ngIf="issuesFor(f.node.id).length" style="margin-top:10px">
              <div class="issue" [ngClass]="x.severity" *ngFor="let x of issuesFor(f.node.id)">{{ x.message }}</div></div>
          </ng-container>
        </div>

        <div class="panel">
          <h2>Sample data</h2>
          <p class="note" *ngIf="!sampleRef">Showing the built-in sample. Enter an application reference to see the letter filled with that application's real values.</p>
          <p class="note" *ngIf="sampleRef">Showing {{ sampleRef }}.</p>
          <input class="db-input" [(ngModel)]="sampleInput" placeholder="Application reference" (keyup.enter)="loadSample()" />
          <div style="display:flex;gap:6px;margin-top:6px"><button class="db-btn db-btn--ghost db-btn--sm" (click)="loadSample()">Use this application</button>
            <button class="db-btn db-btn--ghost db-btn--sm" *ngIf="sampleRef" (click)="useBuiltIn()">Back to sample</button></div>
        </div>

        <div class="panel">
          <h2>Check</h2>
          <div class="ok" *ngIf="checked() && !issues().length">No problems found.</div>
          <div class="note" *ngIf="!checked()">Press Check (or Save draft) to find problems before publishing.</div>
          <div class="issue" [ngClass]="i.severity" *ngFor="let i of issues()" (click)="jump(i)"><strong>{{ i.severity === 'error' ? 'Error' : 'Warning' }}</strong> — {{ i.message }}</div>
        </div>

        <div class="panel">
          <h2>Pictures</h2>
          <p class="note">PNG or JPEG, up to 500 KB, kept in the database.</p>
          <div *ngFor="let im of images()" class="note">• {{ im.name }} ({{ im.kind }}, {{ (im.sizeBytes / 1024).toFixed(0) }} KB)</div>
          <div class="db-form-group mt-16"><label>Name</label><input class="db-input" [(ngModel)]="newImageName" /></div>
          <div class="db-form-group"><label>Kind</label>
            <select class="db-select" [(ngModel)]="newImageKind"><option value="logo">Logo</option><option value="signature">Signature</option><option value="seal">Seal</option><option value="other">Other</option></select></div>
          <input type="file" accept="image/png,image/jpeg" (change)="upload($event)" />
        </div>

        <div class="panel"><h2>Versions</h2>
          <div class="note" *ngFor="let v of versions()">v{{ v.version }} · {{ v.status.toLowerCase() }} · {{ (v.publishedAt || v.createdAt) | date:'medium' }}<span *ngIf="v.changeNote"> · {{ v.changeNote }}</span></div></div>
      </div>
    </div>
  </ng-container>

  <!-- field picker -->
  <div class="picker" *ngIf="picker() as p" [style.left.px]="p.x" [style.top.px]="p.y" (mousedown)="$event.stopPropagation()">
    <input class="db-input" #q [value]="p.q" (input)="setPickerQuery(q.value)" placeholder="Search fields…" (keydown.escape)="closePicker()" autofocus />
    <div class="body">
      <ng-container *ngFor="let g of pickerGroups()">
        <div class="pg">{{ g.name }}</div>
        <button type="button" class="pitem" *ngFor="let i of g.items" (click)="insertToken(i.path)"><span>{{ i.label }}</span><span class="pt">{{ i.type }}</span><span class="pp">{{ i.path }}</span></button>
      </ng-container>
      <p class="note" style="padding:8px" *ngIf="!pickerGroups().length">Nothing matches.</p>
    </div>
  </div>
  `,
})
export class LetterEditorComponent implements OnInit, OnDestroy, PageHost {
  readonly self = this;
  readonly zones = ZONES;
  readonly kinds = BLOCK_KINDS.map((k) => (k.value === 'paragraph' ? { ...k, label: 'Text' } : k));
  readonly Math = Math;
  key = '';
  template = signal<(LetterTemplateRow & { versions: LetterVersionInfo[] }) | null>(null);
  versions = computed(() => this.template()?.versions ?? []);
  published = computed(() => this.versions().find((v) => v.status === 'PUBLISHED')?.version ?? null);
  doc = signal<LetterDocument | null>(null);
  dictionary = signal<Dictionary | null>(null);
  saved = signal<SavedRule[]>([]);
  images = signal<LetterImage[]>([]);
  issues = signal<LetterIssue[]>([]);
  checked = signal(false);
  mode = signal<'letter' | 'structure' | 'blocks'>('letter');
  show = signal<'both' | 'en' | 'he'>('both');
  blocksZone = signal<Zone>('body');
  selected = signal<string | null>(null);
  dirty = signal(false);
  busy = signal(false);
  loading = signal(true);
  error = signal('');
  notice = signal('');
  editingVersion = signal<number | null>(null);
  data = signal<Record<string, unknown>>({});
  sampleRef = '';
  sampleInput = '';
  newImageName = '';
  newImageKind = 'logo';
  addKind = 'paragraph';
  addZone: Zone = 'body';
  history: string[] = [];
  picker = signal<{ x: number; y: number; q: string; lang: Lang; list?: string } | null>(null);
  private pickTarget: { el: HTMLElement; range: Range | null } | null = null;
  private lastEd: { el: HTMLElement; range: Range | null; lang: Lang; list?: string } | null = null;
  private imgUrls = new Map<string, string | null>();
  private readonly today = new Date().toISOString().slice(0, 10);

  langs = computed<Lang[]>(() => (this.show() === 'both' ? ['en', 'he'] : [this.show() as Lang]));
  ctx = computed<EvalContext>(() => ({ data: this.data(), today: this.today, dictionary: (this.dictionary() ?? { formatVersion: 1, fields: {} }) as never, saved: new Map(this.saved().map((s) => [s.id, s])) as never }));
  private beforeUnload = (e: BeforeUnloadEvent) => { if (this.dirty()) e.preventDefault(); };
  private onDocMouseDown = () => this.closePicker();

  constructor(private route: ActivatedRoute, private svc: LettersService) {}

  // ---- PageHost
  view(): 'letter' | 'structure' { return this.mode() === 'structure' ? 'structure' : 'letter'; }
  select(id: string | null): void { this.selected.set(id); }
  baseCtx(): EvalContext { return this.ctx(); }
  snap(): void { const d = this.doc(); if (!d) return; this.history.push(JSON.stringify(d)); if (this.history.length > 80) this.history.shift(); }
  touch(): void { this.dirty.set(true); this.notice.set(''); this.checked.set(false); }
  imageUrl(id: string | undefined): string | null {
    if (!id) return null;
    if (!this.imgUrls.has(id)) {
      this.imgUrls.set(id, null);
      this.svc.imageFile(id).subscribe({ next: (b) => this.imgUrls.set(id, URL.createObjectURL(b)), error: () => {} });
    }
    return this.imgUrls.get(id) ?? null;
  }
  remember(el: HTMLElement, range: Range | null, lang: Lang, list: string | undefined): void { this.lastEd = { el, range, lang, list }; }
  openPicker(el: HTMLElement, lang: Lang, list: string | undefined, anchor?: DOMRect): void {
    const sel = getSelection();
    this.pickTarget = { el, range: sel && sel.rangeCount && el.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : this.lastEd?.range ?? null };
    const r = anchor ?? el.getBoundingClientRect();
    const w = Math.min(380, innerWidth - 24);
    const top = r.bottom + 6;
    this.picker.set({ x: Math.max(12, Math.min(r.left, innerWidth - w - 12)), y: top + 340 > innerHeight ? Math.max(12, r.top - 346) : top, q: '', lang, list });
    setTimeout(() => (document.querySelector('.picker input') as HTMLInputElement | null)?.focus(), 0);
  }

  // ---- lifecycle
  ngOnInit(): void {
    window.addEventListener('beforeunload', this.beforeUnload);
    document.addEventListener('mousedown', this.onDocMouseDown);
    this.key = this.route.snapshot.paramMap.get('key') ?? '';
    this.svc.dictionary().subscribe((d) => this.dictionary.set(d));
    this.svc.rules().subscribe((r) => this.saved.set(r));
    this.svc.images().subscribe((i) => this.images.set(i));
    this.svc.sampleData().subscribe((d) => this.data.set(d));
    this.reload();
  }
  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.beforeUnload);
    document.removeEventListener('mousedown', this.onDocMouseDown);
    this.imgUrls.forEach((u) => u && URL.revokeObjectURL(u));
  }

  private reload(): void {
    this.svc.template(this.key).subscribe({
      next: (t) => {
        this.template.set(t);
        const draft = t.versions.find((v) => v.status === 'DRAFT');
        this.editingVersion.set(draft?.version ?? null);
        this.svc.version(this.key, draft ? 'draft' : 'published').subscribe({
          next: (v) => { this.doc.set(v.document); this.dirty.set(false); this.history = []; this.selected.set(null); this.loading.set(false); },
          error: (e) => { this.error.set(this.msg(e)); this.loading.set(false); },
        });
      },
      error: (e) => { this.error.set(this.msg(e)); this.loading.set(false); },
    });
  }

  // ---- sample data
  loadSample(): void {
    const ref = this.sampleInput.trim(); if (!ref) return;
    this.svc.applicationData(ref).subscribe({ next: (d) => { this.data.set(d); this.sampleRef = ref; this.error.set(''); }, error: (e) => this.error.set(this.msg(e)) });
  }
  useBuiltIn(): void { this.sampleRef = ''; this.sampleInput = ''; this.svc.sampleData().subscribe((d) => this.data.set(d)); }

  // ---- finding and changing blocks
  private find(id: string | null): Found | null {
    const d = this.doc(); if (!id || !d) return null;
    const walk = (list: LetterNode[], parent: LetterNode | null, zone: Zone): Found | null => {
      for (const n of list) {
        if (n.id === id) return { node: n, list, parent, zone };
        const kids: LetterNode[][] = n.t === 'when' || n.t === 'repeat' ? [n.children] : n.t === 'alternatives' ? n.variants.map((v) => v.children) : [];
        for (const k of kids) { const f = walk(k, n, zone); if (f) return f; }
      }
      return null;
    };
    for (const z of ZONES) { const f = walk(d[z], null, z); if (f) return f; }
    return null;
  }
  selectedFound = computed(() => { this.dirty(); this.doc(); return this.find(this.selected()); });
  tagOf = (n: LetterNode) => TAG[n.t];
  isContainer = (n: LetterNode) => n.t === 'when' || n.t === 'repeat' || n.t === 'alternatives';
  lists = () => fieldChoices(this.dictionary(), undefined, { scalars: false });
  listOf(id: string): string | undefined {
    let f = this.find(id)?.parent ?? null;
    while (f) { if (f.t === 'repeat' && f.over) return f.over; f = this.find(f.id)?.parent ?? null; }
    return undefined;
  }
  issuesFor = (id: string) => this.issues().filter((i) => i.nodeId === id);

  add(): void {
    const d = this.doc(); if (!d) return;
    this.snap();
    const n = newNode(this.addKind);
    const f = this.find(this.selected());
    if (f) f.list.splice(f.list.indexOf(f.node) + 1, 0, n); else d[this.addZone].push(n);
    this.selected.set(n.id); this.touch();
  }
  addInside(list: LetterNode[]): void { this.snap(); const n = newNode('paragraph'); list.push(n); this.selected.set(n.id); this.touch(); }
  remove(): void { const f = this.find(this.selected()); if (!f) return; this.snap(); f.list.splice(f.list.indexOf(f.node), 1); this.selected.set(null); this.touch(); }
  duplicate(): void { const f = this.find(this.selected()); if (!f) return; this.snap(); const c = cloneNode(f.node); f.list.splice(f.list.indexOf(f.node) + 1, 0, c); this.selected.set(c.id); this.touch(); }
  move(dir: number): void {
    const f = this.find(this.selected()); if (!f) return;
    const i = f.list.indexOf(f.node), j = i + dir; if (j < 0 || j >= f.list.length) return;
    this.snap(); [f.list[i], f.list[j]] = [f.list[j], f.list[i]]; this.touch();
  }
  moveVariant(n: { variants: unknown[] }, i: number, d: number): void { const j = i + d; if (j < 0 || j >= n.variants.length) return; this.snap(); [n.variants[i], n.variants[j]] = [n.variants[j], n.variants[i]]; this.touch(); }
  wrap(kind: 'when' | 'repeat' | 'alternatives'): void {
    const f = this.find(this.selected()); if (!f) { this.notice.set('Click a block first, then wrap it.'); return; }
    this.snap();
    const inner = f.node;
    let w: LetterNode;
    const cond = { t: 'group' as const, op: 'all' as const, items: [{ t: 'condition' as const, field: '', op: 'eq' as const }] };
    if (kind === 'when') w = { id: newId(), t: 'when', rule: cond, children: [inner] };
    else if (kind === 'repeat') w = { id: newId(), t: 'repeat', over: this.lists()[0]?.path ?? '', where: null, children: [inner] };
    else w = { id: newId(), t: 'alternatives', variants: [{ rule: cond, children: [inner] }, { rule: null, children: [{ id: newId(), t: 'paragraph', text: { en: 'Other wording', he: 'ניסוח אחר' } }] }] };
    f.list.splice(f.list.indexOf(inner), 1, w);
    this.selected.set(w.id); this.touch();
  }
  unwrap(): void {
    const f = this.find(this.selected()); if (!f || !this.isContainer(f.node)) return;
    this.snap();
    const n = f.node;
    const kids = n.t === 'alternatives' ? n.variants[0].children : (n as { children: LetterNode[] }).children;
    f.list.splice(f.list.indexOf(n), 1, ...kids);
    this.selected.set(kids[0]?.id ?? null); this.touch();
  }
  undo(): void {
    const s = this.history.pop(); if (!s) return;
    this.doc.set(JSON.parse(s));
    if (!this.find(this.selected())) this.selected.set(null);
    this.touch();
  }

  // ---- outline
  outline(zone: Zone): OutlineRow[] {
    const d = this.doc(); if (!d) return [];
    const rows: OutlineRow[] = [];
    const strip = (s: string) => s.replace(/\{\{\s*([\w.]+)[^}]*\}\}/g, (_a, p: string) => '‹' + (this.dictionary()?.fields[p]?.label.en ?? p.replace('item.', '')) + '›').replace(/\n/g, ' ').slice(0, 40);
    const label = (n: LetterNode): string => n.t === 'heading' || n.t === 'paragraph' ? strip(n.text.en) : n.t === 'list' ? strip(n.items[0]?.en ?? '') : n.t === 'table' ? strip(n.rows[0]?.label.en ?? '') : n.t === 'signature' ? strip(n.caption.en) : n.t === 'repeat' ? (this.dictionary()?.fields[n.over]?.label.en ?? n.over) : '';
    const walk = (list: LetterNode[], depth: number) => {
      for (const n of list) {
        rows.push({ id: n.id, depth, label: label(n), kind: TAG[n.t] });
        if (n.t === 'when' || n.t === 'repeat') walk(n.children, depth + 1);
        if (n.t === 'alternatives') n.variants.forEach((v) => walk(v.children, depth + 1));
      }
    };
    walk(d[zone], 0);
    return rows;
  }
  selectAndScroll(id: string): void {
    this.selected.set(id);
    setTimeout(() => document.querySelector(`[data-nid="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
  }

  // ---- field picker
  setPickerQuery(q: string): void { this.picker.update((p) => (p ? { ...p, q } : p)); }
  closePicker(): void { if (this.picker()) this.picker.set(null); }
  pickerGroups(): { name: string; items: FieldChoice[] }[] {
    const p = this.picker(); if (!p) return [];
    const q = p.q.trim().toLowerCase();
    const by = new Map<string, FieldChoice[]>();
    for (const f of fieldChoices(this.dictionary(), p.list, { lists: false })) {
      if (q && !(f.label + ' ' + f.path).toLowerCase().includes(q)) continue;
      (by.get(f.group) ?? by.set(f.group, []).get(f.group)!).push(f);
    }
    return [...by].map(([name, items]) => ({ name, items }));
  }
  insertFieldFromToolbar(): void {
    const e = this.lastEd;
    if (!e || !document.contains(e.el)) { this.notice.set('Click inside some text first.'); return; }
    this.openPicker(e.el, e.lang, e.list, undefined);
  }
  insertToken(path: string): void {
    const t = this.pickTarget; const p = this.picker(); this.closePicker();
    if (!t) return;
    const el = t.el; el.focus();
    const s = getSelection(); if (!s) return; s.removeAllRanges();
    const r = t.range && el.contains(t.range.startContainer) ? t.range : (() => { const x = document.createRange(); x.selectNodeContents(el); x.collapse(false); return x; })();
    s.addRange(r);
    const meta = this.dictionary()?.fields[path] ?? (path.startsWith('item.') && p?.list ? this.dictionary()?.fields[p.list]?.itemFields?.[path.slice(5)] : undefined);
    const chip = document.createElement('span');
    chip.className = 'tok'; chip.contentEditable = 'false'; chip.dataset['t'] = path; chip.title = path;
    chip.textContent = meta ? (meta.label[p?.lang ?? 'en'] || meta.label.en) : path;
    r.deleteContents(); r.insertNode(chip);
    const sp = document.createTextNode(' '); chip.after(sp); r.setStartAfter(sp); r.collapse(true); s.removeAllRanges(); s.addRange(r);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('refresh'));
  }

  // ---- saving, checking, publishing
  private msg(e: any): string { return e?.error?.message ?? e?.error?.error ?? e?.message ?? 'Something went wrong.'; }
  private run<T>(obs: import('rxjs').Observable<T>, ok: (r: T) => void): void {
    this.busy.set(true); this.error.set('');
    obs.subscribe({ next: (r) => { this.busy.set(false); ok(r); }, error: (e) => { this.busy.set(false); this.error.set(this.msg(e)); if (e?.error?.issues) { this.issues.set(e.error.issues); this.checked.set(true); } } });
  }
  save(done?: () => void): void {
    const d = this.doc(); if (!d) return;
    this.run(this.svc.saveDraft(this.key, d), (r) => {
      this.issues.set(r.issues); this.checked.set(true); this.dirty.set(false); this.editingVersion.set(r.version);
      this.notice.set(`Draft v${r.version} saved.`);
      this.svc.template(this.key).subscribe((t) => this.template.set(t));
      done?.();
    });
  }
  check(): void {
    const d = this.doc(); if (!d) return;
    this.run(this.svc.validate(this.key, d), (r) => { this.issues.set(r.issues); this.checked.set(true); this.notice.set(r.canPublish ? '' : 'There are errors to fix before this can be published.'); });
  }
  publish(): void {
    const go = () => this.run(this.svc.publish(this.key), (r) => { this.notice.set(`Published v${r.version}.`); this.reload(); this.issues.set([]); });
    if (this.dirty()) this.save(go); else go();
  }
  preview(): void {
    const d = this.doc(); if (!d) return;
    this.run(this.svc.preview(this.key, d, this.sampleRef), (blob) => { window.open(URL.createObjectURL(blob), '_blank'); });
  }
  jump(i: LetterIssue): void {
    if (!i.nodeId) return;
    if (this.mode() === 'blocks') { const f = this.find(i.nodeId); if (f) this.blocksZone.set(f.zone); }
    this.selectAndScroll(i.nodeId);
  }
  upload(e: Event): void {
    const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
    const name = this.newImageName.trim() || file.name.replace(/\.[^.]+$/, '');
    const reader = new FileReader();
    reader.onload = () => this.run(this.svc.uploadImage(name, this.newImageKind, String(reader.result)), (im) => { this.images.update((l) => [...l, im]); this.newImageName = ''; this.notice.set(`Picture "${im.name}" added.`); });
    reader.readAsDataURL(file);
    (e.target as HTMLInputElement).value = '';
  }
}
