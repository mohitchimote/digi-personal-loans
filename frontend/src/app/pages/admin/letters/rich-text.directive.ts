import { Directive, DoCheck, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { Lang } from '../../../core/services/letters.service';

export interface Chip { label: string; ok: boolean }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TOKEN = /\{\{\s*([\w.]+)(?:\|(\w+))?\s*\}\}/g;

/** The text of a block, edited like a word processor: type freely, and fields appear as chips that behave as one character. */
@Directive({ selector: '[appRich]', standalone: true, host: { contenteditable: 'true', spellcheck: 'false', class: 'ed' } })
export class RichTextDirective implements DoCheck {
  /** The stored text, with {{field}} tokens. */
  @Input('appRich') text = '';
  @Input() lang: Lang = 'en';
  /** What a chip shows: the field's name (structure view) or its value for the sample (letter view). */
  @Input() chip: (path: string, fmt: string | undefined) => Chip = (p) => ({ label: p, ok: true });
  /** Changes whenever the chip texts could differ (view, sample data, language), so chips are redrawn. */
  @Input() renderKey = '';
  /** 'break': Enter makes a line break (table cells). 'emit': Enter is left to the owner, who starts a new paragraph or point. */
  @Input() enter: 'break' | 'emit' = 'break';
  @Output() textChange = new EventEmitter<string>();
  @Output() slash = new EventEmitter<DOMRect | null>();
  @Output() focused = new EventEmitter<void>();
  @Output() cursor = new EventEmitter<Range | null>();
  @Output() enterKey = new EventEmitter<void>();
  /** Backspace pressed with nothing typed yet. */
  @Output() backspaceEmpty = new EventEmitter<void>();
  /** Tab (false) or Shift+Tab (true): indent or outdent. */
  @Output() tabKey = new EventEmitter<boolean>();

  private last = '';
  constructor(private ref: ElementRef<HTMLElement>) {}

  /** Stored text is already HTML-shaped (<b> <i> <u>, &amp; &lt; &gt;); anything else that looks like a tag is shown as text. */
  private html(): string {
    const safe = (this.text ?? '').replace(/<(?!\/?[biu]>)/g, '&lt;').replace(/&(?!(amp|lt|gt);)/g, '&amp;');
    return safe.replace(TOKEN, (_all, path: string, fmt?: string) => {
      const c = this.chip(path, fmt);
      const raw = path + (fmt ? '|' + fmt : '');
      return `<span class="tok${c.ok ? '' : ' bad'}" contenteditable="false" data-t="${esc(raw)}" title="${esc(path)}">${esc(c.label || '·')}</span>`;
    }).replace(/\n/g, '<br>');
  }

  ngDoCheck(): void {
    const el = this.ref.nativeElement;
    if (this.lang === 'he') { el.setAttribute('dir', 'rtl'); el.setAttribute('lang', 'he'); }
    // Never redraw under the user's cursor: what they typed is already on screen.
    if (document.activeElement === el) return;
    const h = this.html() + '\u0000' + this.renderKey;
    if (h !== this.last) { this.last = h; el.innerHTML = this.html(); }
  }

  /** Back to stored text: chips become {{tokens}}, line breaks become newlines. */
  static serialize(el: Node): string {
    let out = '';
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) out += (n.nodeValue ?? '').replace(/​/g, '');
      else if (n.nodeName === 'BR') out += '\n';
      else if ((n as HTMLElement).classList?.contains('tok')) out += '{{' + (n as HTMLElement).dataset['t'] + '}}';
      else if (n.nodeName === 'DIV' || n.nodeName === 'P') { if (out && !out.endsWith('\n')) out += '\n'; out += RichTextDirective.serialize(n); }
      else out += RichTextDirective.serialize(n);
    });
    return out;
  }

  @HostListener('input') onInput(): void {
    const t = RichTextDirective.serialize(this.ref.nativeElement);
    // The screen already shows what was typed, so it must not be redrawn (that would drop the cursor, and the
    // saved cursor position while the field picker is open).
    this.text = t; this.last = this.html() + '\u0000' + this.renderKey;
    this.textChange.emit(t);
  }
  @HostListener('focus') onFocus(): void { this.focused.emit(); }
  @HostListener('keyup') @HostListener('mouseup') onCursor(): void {
    const s = getSelection();
    this.cursor.emit(s && s.rangeCount && this.ref.nativeElement.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null);
  }
  @HostListener('keydown', ['$event']) onKey(e: KeyboardEvent): void {
    if (e.key === '/') {
      e.preventDefault();
      const s = getSelection();
      const r = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
      this.cursor.emit(r);
      const rect = r && (r.getBoundingClientRect().width + r.getBoundingClientRect().height) ? r.getBoundingClientRect() : this.ref.nativeElement.getBoundingClientRect();
      this.slash.emit(rect);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey || this.enter === 'break') document.execCommand('insertLineBreak'); else this.enterKey.emit();
    } else if (e.key === 'Backspace' && this.enter === 'emit' && RichTextDirective.serialize(this.ref.nativeElement) === '') {
      e.preventDefault(); this.backspaceEmpty.emit();
    } else if (e.key === 'Tab' && this.enter === 'emit') {
      e.preventDefault(); this.tabKey.emit(e.shiftKey);
    }
  }
  @HostListener('paste', ['$event']) onPaste(e: ClipboardEvent): void {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
  }
  /** Asked for after a chip was inserted by script: draw it properly once the cursor has left. */
  @HostListener('refresh') onRefresh(): void { this.last = ''; }
}
