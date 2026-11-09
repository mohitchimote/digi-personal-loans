import { Component, EventEmitter, Input, OnChanges, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CaseAction, CaseActions, WorkflowService } from '../../core/services/workflow.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { HAND_WIRED_ACTIONS } from './workflow-actions.const';
import { buttonClassOf, doneMessage, fieldLabelOf, labelOf, missingInputMessage, parseNumber } from './workflow-actions.util';

/** Buttons for whatever the workflow offers the signed-in person on one case right now: labels, styles,
 * icons and inputs all come from the published definition, and every press goes through the generic
 * action endpoint (so the same guards, entitlements, events and audit apply as anywhere else). A new
 * action added in the workflow builder shows up here without a code change. */
@Component({
  selector: 'app-workflow-actions',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <div class="db-card mb-16" *ngIf="actions().length || message() || error()" data-testid="workflow-actions">
      <div class="card-header"><h3>{{ 'uw.extra.title' | translate }}</h3></div>
      <div class="db-alert db-alert--success mb-8" *ngIf="message()">✓ {{ message() }}</div>
      <div class="db-alert db-alert--error mb-8" *ngIf="error()"><span class="material-icons mi-sm">warning</span> {{ error() }}</div>
      <div class="wfa-row">
        <div class="wfa-action" *ngFor="let a of actions()">
          <ng-container *ngFor="let f of a.inputs">
            <label class="db-checkbox" *ngIf="f.kind === 'boolean'">
              <input type="checkbox" [checked]="input[a.key + '.' + f.field] === 'true'" (change)="input[a.key + '.' + f.field] = $any($event.target).checked ? 'true' : ''" />
              <span>{{ fieldLabel(f) }}</span>
            </label>
            <div class="db-form-group wfa-field" *ngIf="f.kind !== 'boolean'">
              <label>{{ fieldLabel(f) }}<span class="required" *ngIf="f.required"> *</span></label>
              <input class="db-input" [type]="f.kind === 'number' ? 'number' : 'text'" [ngModel]="input[a.key + '.' + f.field] || ''" (ngModelChange)="input[a.key + '.' + f.field] = $event" />
            </div>
          </ng-container>
          <button class="db-btn" [ngClass]="buttonClass(a)" [style.color]="a.ui.style === 'danger' ? '#c62828' : null"
                  [attr.data-action]="a.key" [disabled]="running() !== ''" (click)="run(a)">
            <span class="material-icons mi-sm" *ngIf="a.ui.icon">{{ a.ui.icon }}</span> {{ label(a) }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .wfa-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
    .wfa-action { display: flex; gap: 8px; align-items: flex-end; }
    .wfa-field { margin: 0; }
  `],
})
export class WorkflowActionsComponent implements OnChanges {
  @Input({ required: true }) appRef = '';
  /** Which placement to show; the screens that have a Decision or Disbursement tab render those themselves. */
  @Input() area: 'general' | 'decision' | 'disbursement' = 'general';
  /** Where "return to the queue" goes on this screen. */
  @Input() queueUrl = '/underwriter/pipeline';
  /** Change this (e.g. the case's status) to make the list reload after the case moved elsewhere. */
  @Input() refreshKey: unknown = null;
  /** Emitted after an action ran, so the screen can reload the case. */
  @Output() done = new EventEmitter<void>();

  private offered = signal<CaseActions | null>(null);
  actions = computed(() => (this.offered()?.allowed ?? []).filter(a => a.ui.area === this.area && !HAND_WIRED_ACTIONS.has(a.key)));

  input: Record<string, string> = {};
  running = signal('');
  message = signal('');
  error = signal('');

  constructor(private workflow: WorkflowService, private i18n: I18nService, private router: Router) {}

  ngOnChanges(): void { if (this.appRef) this.reload(); }

  /** Only the latest request may update the list: a slow earlier answer must not overwrite a newer one. */
  private requestSeq = 0;

  private reload(): void {
    const seq = ++this.requestSeq;
    this.workflow.caseActions(this.appRef).subscribe({
      next: a => { if (seq === this.requestSeq) this.offered.set(a); },
      error: () => { if (seq === this.requestSeq) { this.offered.set(null); this.error.set(this.i18n.t('uw.extra.loadFailed')); } },
    });
  }

  label(a: CaseAction): string { return labelOf(a, this.i18n); }

  buttonClass(a: CaseAction): string { return buttonClassOf(a); }

  fieldLabel(f: { field: string }): string { return fieldLabelOf(f, this.i18n); }

  run(a: CaseAction): void {
    const body: Record<string, unknown> = {};
    for (const f of a.inputs) {
      const raw = (this.input[`${a.key}.${f.field}`] ?? '').trim();
      if (f.kind === 'boolean') { body[f.field] = raw === 'true'; continue; }
      if (f.kind === 'number') {
        const n = parseNumber(raw);
        if (raw && n === null) { this.error.set(this.i18n.t('uw.extra.badNumber', { field: this.fieldLabel(f) })); return; }
        if (f.required && !(n !== null && n > 0)) { this.error.set(missingInputMessage(a, f, this.i18n)); return; }
        if (n !== null) body[f.field] = n;
        continue;
      }
      if (!raw) {
        if (f.required) { this.error.set(missingInputMessage(a, f, this.i18n)); return; }
        continue;
      }
      body[f.field] = raw;
    }
    this.running.set(a.key);
    this.error.set('');
    this.message.set('');
    this.workflow.runAction(this.appRef, a.key, body).subscribe({
      next: r => {
        this.running.set('');
        this.message.set(doneMessage(a, this.i18n));
        for (const f of a.inputs) delete this.input[`${a.key}.${f.field}`];
        if (r.actions) { this.requestSeq++; this.offered.set(r.actions); } else { this.reload(); }
        if (a.ui.after === 'pipeline') { this.router.navigate([this.queueUrl]); return; }
        this.done.emit();
      },
      error: e => { this.running.set(''); this.error.set(e?.error?.message || this.i18n.t('uw.extra.failed')); },
    });
  }
}
