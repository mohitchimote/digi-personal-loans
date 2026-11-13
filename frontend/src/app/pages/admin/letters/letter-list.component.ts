import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LetterNode, Lang } from '../../../core/services/letters.service';
import { EvalContext, evalRule, getPath, isMissing, metaOf } from '../../../core/letters/rules';
import { formatValue } from '../../../core/letters/formats';
import { PageHost } from './page-host';
import { RichTextDirective, Chip } from './rich-text.directive';
import { describeRule } from './letter-model';

const TAGS: Record<string, string> = { heading: 'Heading', paragraph: 'Text', list: 'List', table: 'Table', image: 'Picture', signature: 'Signature', when: 'Show only if', repeat: 'For each', alternatives: 'Alternatives' };

/**
 * One list of blocks drawn as part of the page, in one language. Letter view shows the letter as it prints for
 * the sample (parts that do not apply are left out, repeats are expanded); Structure view shows every block and
 * the rule around it. Text is edited directly on the page in both views.
 */
@Component({
  selector: 'app-letter-list',
  standalone: true,
  // Edits are made in place on the letter, so these must be checked on every pass, not only when an input changes.
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [CommonModule, RichTextDirective, LetterListComponent],
  styles: [`
    :host { display: block; }
    .blk { position: relative; border-radius: 4px; outline: 2px solid transparent; outline-offset: 2px; margin: 0; cursor: text; }
    .blk:hover { outline-color: #dbe5f1; }
    .blk.sel { outline-color: #003f79; }
    .tag { position: absolute; top: -9px; inset-inline-start: 6px; font: 600 9px/1 system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; background: #003f79; color: #fff; padding: 2px 5px; border-radius: 3px; display: none; }
    .blk.sel > .tag, .st .blk:hover > .tag { display: block; }
    .st .blk { margin: 14px 0; }
    .box { border: 1px dashed #9aa8bd; border-radius: 6px; padding: 14px 10px 8px; margin: 16px 0; background: rgba(0, 63, 121, .03); position: relative; }
    .box.sel { border-color: #003f79; border-style: solid; }
    .box > .bl { position: absolute; top: -9px; inset-inline-start: 8px; background: #eef3f9; color: #234; font: 600 11px/1 system-ui, sans-serif; padding: 3px 6px; border-radius: 3px; max-width: 90%; }
    .variant-h { font: 600 11px system-ui, sans-serif; color: #556; margin: 8px 0 2px; }
    .ed { min-height: 1.3em; outline: none; }
    h3.ed { font-size: 17px; color: #003f79; margin: 14px 0 6px; }
    p.ed { margin: 6px 0; line-height: 1.55; }
    .li { display: flex; gap: 8px; align-items: baseline; margin: 2px 0; } .li .ed { flex: 1; } .mk { min-width: 18px; color: #556; user-select: none; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; } td { border-top: 1px solid #e2e7ee; border-bottom: 1px solid #e2e7ee; padding: 6px 4px; vertical-align: top; } td:last-child { font-weight: 600; text-align: end; width: 38%; }
    .pic { display: block; max-width: 170px; max-height: 80px; margin: 6px 0; } .nopic { display: inline-block; border: 1px dashed #9aa8bd; color: #778; font-size: 12px; padding: 14px 18px; border-radius: 4px; margin: 6px 0; }
    .sig { margin: 18px 0 8px; } .sig .line { border-top: 1px solid #667; width: 180px; margin-top: 4px; } .sig .ed { font-size: 12px; color: #556; margin-top: 4px; }
    .nodata { color: #889; font-size: 12px; font-style: italic; margin: 4px 0; }
  `],
  template: `
  <div [class.st]="host.view() === 'structure'">
  <ng-container *ngFor="let n of nodes; trackBy: byId">
    <ng-container [ngSwitch]="n.t">

      <div *ngSwitchCase="'heading'" class="blk" [attr.data-nid]="n.id" [class.sel]="isSel(n)" (click)="pick($event, n)">
        <span class="tag">{{ tag(n) }}</span>
        <h3 [appRich]="$any(n).text[lang]" [lang]="lang" [chip]="chipFn()" enter="emit" (enterKey)="host.enterFrom(n.id, lang)" (backspaceEmpty)="host.backspaceFrom(n.id, lang, -1)" (textChange)="$any(n).text[lang] = $event; host.touch()" (focused)="focus(n)" (slash)="slash($event)" (cursor)="cur($event)" [style.text-align]="$any(n).align || null" [style.margin-inline-start.px]="($any(n).indent || 0) * 18" [style.font-size.px]="headingSize($any(n).level)"></h3>
      </div>

      <div *ngSwitchCase="'paragraph'" class="blk" [attr.data-nid]="n.id" [class.sel]="isSel(n)" (click)="pick($event, n)">
        <span class="tag">{{ tag(n) }}</span>
        <p [appRich]="$any(n).text[lang]" [lang]="lang" [chip]="chipFn()" enter="emit" (enterKey)="host.enterFrom(n.id, lang)" (backspaceEmpty)="host.backspaceFrom(n.id, lang, -1)" (textChange)="$any(n).text[lang] = $event; host.touch()" (focused)="focus(n)" (slash)="slash($event)" (cursor)="cur($event)" [style.text-align]="$any(n).align || null" [style.margin-inline-start.px]="($any(n).indent || 0) * 18"></p>
      </div>

      <div *ngSwitchCase="'list'" class="blk" [attr.data-nid]="n.id" [class.sel]="isSel(n)" (click)="pick($event, n)">
        <span class="tag">{{ tag(n) }}</span>
        <div class="li" *ngFor="let it of $any(n).items; let k = index" [style.margin-inline-start.px]="(it.level || 0) * 20">
          <span class="mk" contenteditable="false">{{ markers($any(n))[k] }}</span>
          <div [appRich]="it[lang]" [lang]="lang" [chip]="chipFn()" enter="emit" (enterKey)="host.enterFrom(n.id, lang, k)" (backspaceEmpty)="host.backspaceFrom(n.id, lang, k)" (tabKey)="host.tabFrom(n.id, k, $event)" (textChange)="it[lang] = $event; host.touch()" (focused)="focus(n, k)" (slash)="slash($event)" (cursor)="cur($event)"></div>
        </div>
      </div>

      <div *ngSwitchCase="'table'" class="blk" [attr.data-nid]="n.id" [class.sel]="isSel(n)" (click)="pick($event, n)">
        <span class="tag">{{ tag(n) }}</span>
        <table><tr *ngFor="let r of $any(n).rows">
          <td [appRich]="r.label[lang]" [lang]="lang" [chip]="chipFn()" (textChange)="r.label[lang] = $event; host.touch()" (focused)="focus(n)" (slash)="slash($event)" (cursor)="cur($event)"></td>
          <td [appRich]="r.value[lang]" [lang]="lang" [chip]="chipFn()" (textChange)="r.value[lang] = $event; host.touch()" (focused)="focus(n)" (slash)="slash($event)" (cursor)="cur($event)"></td>
        </tr></table>
      </div>

      <div *ngSwitchCase="'image'" class="blk" [attr.data-nid]="n.id" [class.sel]="isSel(n)" (click)="pick($event, n)">
        <span class="tag">{{ tag(n) }}</span>
        <img class="pic" *ngIf="host.imageUrl($any(n).imageId) as u; else nopic" [src]="u" [alt]="$any(n).alt[lang]" />
        <ng-template #nopic><span class="nopic">Picture — choose one in the panel on the right</span></ng-template>
      </div>

      <div *ngSwitchCase="'signature'" class="blk sig" [attr.data-nid]="n.id" [class.sel]="isSel(n)" (click)="pick($event, n)">
        <span class="tag">{{ tag(n) }}</span>
        <img class="pic" *ngIf="host.imageUrl($any(n).imageId) as u" [src]="u" alt="" />
        <div class="line"></div>
        <div [appRich]="$any(n).caption[lang]" [lang]="lang" [chip]="chipFn()" (textChange)="$any(n).caption[lang] = $event; host.touch()" (focused)="focus(n)" (slash)="slash($event)" (cursor)="cur($event)"></div>
      </div>

      <!-- conditional parts -->
      <ng-container *ngSwitchCase="'when'">
        <ng-container *ngIf="host.view() === 'letter'">
          <app-letter-list *ngIf="holds($any(n).rule)" [nodes]="$any(n).children" [lang]="lang" [host]="host" [ctx]="ctx"></app-letter-list>
        </ng-container>
        <div *ngIf="host.view() === 'structure'" class="box" [attr.data-nid]="n.id" [class.sel]="isSel(n)" (click)="pick($event, n)">
          <span class="bl">Show only if: {{ describe($any(n).rule) }}</span>
          <app-letter-list [nodes]="$any(n).children" [lang]="lang" [host]="host" [ctx]="ctx"></app-letter-list>
          <div class="nodata" *ngIf="!$any(n).children.length">Empty — add a block inside from the panel on the right.</div>
        </div>
      </ng-container>

      <ng-container *ngSwitchCase="'repeat'">
        <ng-container *ngIf="host.view() === 'letter'">
          <ng-container *ngFor="let it of items($any(n))">
            <app-letter-list [nodes]="$any(n).children" [lang]="lang" [host]="host" [ctx]="itemCtx(n, it)"></app-letter-list>
          </ng-container>
        </ng-container>
        <div *ngIf="host.view() === 'structure'" class="box" [attr.data-nid]="n.id" [class.sel]="isSel(n)" (click)="pick($event, n)">
          <span class="bl">For each {{ listLabel($any(n).over) }}{{ $any(n).where ? ', only where ' + describe($any(n).where, $any(n).over) : '' }}</span>
          <app-letter-list [nodes]="$any(n).children" [lang]="lang" [host]="host" [ctx]="structCtx(n)"></app-letter-list>
        </div>
      </ng-container>

      <ng-container *ngSwitchCase="'alternatives'">
        <ng-container *ngIf="host.view() === 'letter'">
          <ng-container *ngIf="variant($any(n)) as v">
            <app-letter-list [nodes]="v.children" [lang]="lang" [host]="host" [ctx]="ctx"></app-letter-list>
          </ng-container>
        </ng-container>
        <div *ngIf="host.view() === 'structure'" class="box" [attr.data-nid]="n.id" [class.sel]="isSel(n)" (click)="pick($event, n)">
          <span class="bl">Alternatives — the first that applies is used</span>
          <ng-container *ngFor="let v of $any(n).variants; let i = index">
            <div class="variant-h">{{ i === 0 ? 'If' : (v.rule ? 'Otherwise if' : 'Otherwise') }}{{ v.rule ? ': ' + describe(v.rule) : '' }}</div>
            <app-letter-list [nodes]="v.children" [lang]="lang" [host]="host" [ctx]="ctx"></app-letter-list>
          </ng-container>
        </div>
      </ng-container>

    </ng-container>
  </ng-container>
  </div>
  `,
})
export class LetterListComponent {
  @Input({ required: true }) nodes!: LetterNode[];
  @Input({ required: true }) lang!: Lang;
  @Input({ required: true }) host!: PageHost;
  @Input({ required: true }) ctx!: EvalContext;

  byId = (_: number, n: LetterNode) => n.id;
  tag = (n: LetterNode) => TAGS[n.t];
  isSel = (n: LetterNode) => this.host.selected() === n.id;
  pick(e: Event, n: LetterNode) { e.stopPropagation(); this.host.select(n.id); }
  focus(n: LetterNode, item?: number) { this.host.snap(); this.host.select(n.id, item); }
  headingSize = (level?: number) => (level === 3 ? 14 : level === 2 ? 15.5 : 18);
  /** The marker in front of each point: a bullet, or a number that restarts below a shallower point. */
  markers(n: { ordered?: boolean; items: { level?: number }[] }): string[] {
    const counters = [0, 0, 0];
    return n.items.map((it) => {
      const level = Math.min(2, it.level ?? 0);
      counters[level]++; for (let d = level + 1; d < 3; d++) counters[d] = 0;
      return n.ordered ? `${counters[level]}.` : level === 0 ? '•' : '–';
    });
  }

  holds = (r: any) => evalRule(r, this.ctx);
  describe = (r: any, list?: string) => describeRule(r, this.host.dictionary(), this.host.saved(), list ?? this.ctx.list);
  listLabel = (path: string) => this.host.dictionary()?.fields[path]?.label.en ?? (path || '…');

  items(n: Extract<LetterNode, { t: 'repeat' }>): Record<string, unknown>[] {
    const raw = getPath(n.over, this.ctx);
    const all = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
    return all.filter((it) => evalRule(n.where, { ...this.ctx, item: it, list: n.over }));
  }
  itemCtx(n: LetterNode, it: Record<string, unknown>): EvalContext { return { ...this.ctx, item: it, list: (n as { over: string }).over }; }
  structCtx(n: LetterNode): EvalContext { return { ...this.ctx, item: undefined, list: (n as { over: string }).over }; }
  variant(n: Extract<LetterNode, { t: 'alternatives' }>) { return n.variants.find((v) => evalRule(v.rule, this.ctx)) ?? null; }

  /** What a field chip shows in this view: its name in the structure view, its sample value in the letter view. */
  chipFn() {
    const ctx = this.ctx, lang = this.lang, structure = this.host.view() === 'structure';
    return (path: string, fmt: string | undefined): Chip => {
      // Page numbers only exist once the PDF is laid out.
      if (path === 'page.number' || path === 'page.total') return { label: structure ? (path === 'page.number' ? 'page number' : 'page count') : '1', ok: true };
      const m = metaOf(path, ctx);
      if (structure) return { label: m ? (m.label[lang] || m.label.en) : path, ok: !!m };
      const v = getPath(path, ctx);
      return { label: isMissing(v) ? '·' : formatValue(v, m, fmt, lang), ok: !!m };
    };
  }

  slash(rect: DOMRect | null) {
    const el = document.activeElement as HTMLElement | null;
    if (el) this.host.openPicker(el, this.lang, this.ctx.list, rect ?? undefined);
  }
  cur(range: Range | null) {
    const el = document.activeElement as HTMLElement | null;
    if (el) this.host.remember(el, range, this.lang, this.ctx.list);
  }
}
