import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MasterItemRow, MastersService } from '../../../core/services/masters.service';
import { I18nService } from '../../../core/i18n/i18n.service';

export interface PickedItem { id: number | null; label: string; code?: string | null; }

/** Search-as-you-type picker for one master's items. A plain dropdown can't cope with masters that hold
 * thousands of rows (states) or hundreds of thousands (cities), so this queries the server. */
@Component({
  selector: 'app-master-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="picker">
      <input class="db-input" type="text" autocomplete="off" role="combobox" [attr.aria-expanded]="open() && results().length > 0"
             [ngModel]="text()" (ngModelChange)="onType($event)" (focus)="onFocus()" (blur)="closeSoon()" [placeholder]="placeholder" />
      <button *ngIf="hasValue" type="button" class="clear" (mousedown)="clear($event)" aria-label="Clear">&times;</button>
      <ul class="results" *ngIf="open() && results().length" role="listbox">
        <li *ngFor="let r of results()" role="option" (mousedown)="choose(r)">
          <span>{{ name(r) }}</span><code>{{ r.code }}</code>
        </li>
      </ul>
      <div class="hint" *ngIf="open() && searched() && results().length === 0">…</div>
    </div>`,
  styles: [`
    .picker { position: relative; }
    .clear { position: absolute; inset-inline-end: 8px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; font-size: 1.2rem; cursor: pointer; color: rgba(0,0,0,.5); }
    .results { position: absolute; z-index: 30; inset-inline: 0; margin: 2px 0 0; padding: 4px; list-style: none; max-height: 260px; overflow-y: auto; background: #fff; border: 1px solid rgba(0,0,0,.15); border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.12); }
    .results li { display: flex; justify-content: space-between; gap: 12px; padding: 7px 10px; border-radius: 6px; cursor: pointer; }
    .results li:hover { background: rgba(0,63,121,.08); }
    .results code { font-size: .72rem; color: rgba(0,0,0,.5); }
    .hint { position: absolute; z-index: 30; inset-inline: 0; padding: 8px 12px; background: #fff; border: 1px solid rgba(0,0,0,.15); border-radius: 8px; color: rgba(0,0,0,.5); }
  `],
})
export class MasterPickerComponent implements OnChanges {
  /** Which master to search (the parent master's code). */
  @Input({ required: true }) typeCode!: string;
  /** Currently selected item id, if any. */
  @Input() valueId: number | null = null;
  /** Alternative to valueId for callers that store the item's code (e.g. organisation units). */
  @Input() valueCode: string | null = null;
  /** Shown while the id is set but the item hasn't been fetched (editing an existing row). */
  @Input() initialLabel = '';
  @Input() placeholder = '';
  @Output() picked = new EventEmitter<PickedItem>();

  text = signal('');
  results = signal<MasterItemRow[]>([]);
  open = signal(false);
  searched = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  constructor(private svc: MastersService, private i18n: I18nService) {}

  get hasValue(): boolean { return this.valueId != null || !!this.valueCode; }

  name(i: MasterItemRow): string { return this.i18n.lang() === 'he' ? i.nameHe : i.nameEn; }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['valueId'] || ch['valueCode'] || ch['initialLabel'] || ch['typeCode']) {
      this.text.set(this.hasValue ? this.initialLabel : '');
      this.results.set([]);
    }
  }

  onFocus(): void { this.open.set(true); this.search(this.hasValue ? '' : this.text()); }

  onType(v: string): void {
    this.text.set(v);
    if (this.hasValue) this.picked.emit({ id: null, label: '', code: null }); // typing replaces the selection
    this.open.set(true);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.search(v), 250);
  }

  private search(q: string): void {
    const mine = ++this.seq;
    this.svc.items(this.typeCode, { q: q.trim(), limit: 20 }).subscribe({
      next: page => { if (mine === this.seq) { this.results.set(page.items); this.searched.set(true); } },
      error: () => { if (mine === this.seq) { this.results.set([]); this.searched.set(true); } },
    });
  }

  choose(r: MasterItemRow): void {
    const label = `${this.name(r)} · ${r.code}`;
    this.text.set(label);
    this.open.set(false);
    this.picked.emit({ id: r.id, label, code: r.code });
  }

  clear(e: Event): void {
    e.preventDefault();
    this.text.set('');
    this.picked.emit({ id: null, label: '', code: null });
  }

  closeSoon(): void { setTimeout(() => this.open.set(false), 150); }
}
