import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Bi, Dictionary } from '../../../core/services/letters.service';
import { FieldChoice, fieldChoices } from './letter-model';

/** English and Hebrew text side by side, with a field picker that inserts {{field}} where the cursor is. */
@Component({
  selector: 'app-bi-text',
  standalone: true,
  // Edits are made in place on the letter, so these must be checked on every pass, not only when an input changes.
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [CommonModule, FormsModule],
  styles: [`
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    textarea { width: 100%; resize: vertical; font: inherit; padding: 6px 8px; border: 1px solid var(--border, #d6dde6); border-radius: 4px; background: #fff; }
    textarea[dir=rtl] { text-align: right; }
    .bar { display: flex; gap: 6px; align-items: center; margin: 2px 0 6px; font-size: 12px; color: var(--text-muted, #667); }
    .bar select { max-width: 260px; }
    .lang { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted, #667); }
    @media (max-width: 760px) { .pair { grid-template-columns: 1fr; } }
  `],
  template: `
    <div class="bar">
      <span>Insert field</span>
      <select class="db-select" #pick (change)="insert(pick.value); pick.value = ''">
        <option value="">Choose…</option>
        <optgroup *ngFor="let g of groups()" [label]="g.name">
          <option *ngFor="let f of g.items" [value]="f.path">{{ f.label }}</option>
        </optgroup>
      </select>
    </div>
    <div class="pair">
      <div><div class="lang">English</div><textarea #en [rows]="rows" [ngModel]="text.en" (ngModelChange)="text.en = $event; changed.emit()" (focus)="focused = en"></textarea></div>
      <div><div class="lang">עברית</div><textarea #he dir="rtl" [rows]="rows" [ngModel]="text.he" (ngModelChange)="text.he = $event; changed.emit()" (focus)="focused = he"></textarea></div>
    </div>
  `,
})
export class BiTextComponent {
  @Input({ required: true }) text!: Bi;
  @Input() dictionary: Dictionary | null = null;
  @Input() list?: string;
  @Input() rows = 3;
  @Output() changed = new EventEmitter<void>();
  @ViewChild('en') en!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('he') he!: ElementRef<HTMLTextAreaElement>;
  focused?: HTMLTextAreaElement | ElementRef<HTMLTextAreaElement>;

  groups(): { name: string; items: FieldChoice[] }[] {
    const by = new Map<string, FieldChoice[]>();
    for (const f of fieldChoices(this.dictionary, this.list, { lists: false })) (by.get(f.group) ?? by.set(f.group, []).get(f.group)!).push(f);
    return [...by].map(([name, items]) => ({ name, items }));
  }

  /** Puts the field into the language box that was last used (English if none was), at its cursor. */
  insert(path: string): void {
    if (!path) return;
    const el = ((this.focused as ElementRef<HTMLTextAreaElement> | undefined)?.nativeElement ?? (this.focused as HTMLTextAreaElement | undefined) ?? this.en.nativeElement);
    const lang: 'en' | 'he' = el === this.he.nativeElement ? 'he' : 'en';
    const start = el.selectionStart ?? this.text[lang].length, end = el.selectionEnd ?? start;
    const token = `{{${path}}}`;
    this.text[lang] = this.text[lang].slice(0, start) + token + this.text[lang].slice(end);
    this.changed.emit();
    queueMicrotask(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  }
}
