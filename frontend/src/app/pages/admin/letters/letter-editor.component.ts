import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Dictionary, LetterDocument, LetterImage, LetterIssue, LetterTemplateRow, LetterVersionInfo, LettersService, SavedRule } from '../../../core/services/letters.service';
import { LetterBlocksComponent } from './letter-blocks.component';

type Zone = 'header' | 'body' | 'footer';

@Component({
  selector: 'app-letter-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LetterBlocksComponent],
  styles: [`
    .top { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
    .top h2 { margin: 0; }
    .chip { font-size: 12px; padding: 2px 8px; border-radius: 10px; background: #e8eef5; color: #234; }
    .chip.pub { background: #e3f4e6; color: #1b5e2a; } .chip.dirty { background: #fff1d6; color: #7a4b00; }
    .sp { flex: 1; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; align-items: start; }
    .page { background: #fff; border: 1px solid var(--border, #d6dde6); border-radius: 8px; padding: 16px; }
    .tabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid var(--border, #d6dde6); }
    .tabs button { background: none; border: 0; padding: 8px 14px; cursor: pointer; border-bottom: 3px solid transparent; font-weight: 600; color: #556; }
    .tabs button.on { color: #003f79; border-color: #003f79; }
    aside .db-card { margin-bottom: 14px; }
    .issue { font-size: 13px; padding: 6px 0; border-bottom: 1px solid #eef1f5; cursor: pointer; }
    .issue.error { color: #b3261e; } .issue.warning { color: #8a5a00; }
    .ok { color: #1b5e2a; font-size: 13px; }
    .hint { color: #667; font-size: 12px; }
    @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }
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

  <div class="layout" *ngIf="doc() as d">
    <div class="page">
      <div class="tabs">
        <button *ngFor="let z of zones" [class.on]="zone() === z.id" (click)="zone.set(z.id)">{{ z.label }} <span class="hint">({{ d[z.id].length }})</span></button>
      </div>
      <p class="hint" *ngIf="zone() !== 'body'">Printed at the top (or bottom) of every page, in both languages. <code>{{ '{{page.number}}' }}</code> and <code>{{ '{{page.total}}' }}</code> become the page numbers.</p>
      <app-letter-blocks [nodes]="d[zone()]" [dictionary]="dictionary()" [saved]="saved()" [images]="images()" [issues]="issues()" (changed)="touch()" />
    </div>

    <aside>
      <div class="db-card">
        <div class="card-header"><h3>Check</h3></div>
        <div class="ok" *ngIf="checked() && !issues().length">No problems found.</div>
        <div *ngIf="!checked()" class="hint">Press Check (or Save draft) to find problems before publishing.</div>
        <div class="issue" [ngClass]="i.severity" *ngFor="let i of issues()" (click)="jump(i)">
          <strong>{{ i.severity === 'error' ? 'Error' : 'Warning' }}</strong> — {{ i.message }}
        </div>
      </div>

      <div class="db-card">
        <div class="card-header"><h3>Preview with</h3></div>
        <input class="db-input" [(ngModel)]="previewRef" placeholder="Application reference (optional)" />
        <p class="hint">Leave empty for sample data. Missing values are listed after the PDF opens.</p>
      </div>

      <div class="db-card">
        <div class="card-header"><h3>Pictures</h3></div>
        <p class="hint">PNG or JPEG, up to 500 KB. Logos, signatures and seals are kept in the database.</p>
        <div *ngFor="let im of images()" class="hint">• {{ im.name }} <span>({{ im.kind }}, {{ (im.sizeBytes / 1024).toFixed(0) }} KB)</span></div>
        <div class="db-form-group mt-16"><label>Name</label><input class="db-input" [(ngModel)]="newImageName" /></div>
        <div class="db-form-group"><label>Kind</label>
          <select class="db-select" [(ngModel)]="newImageKind"><option value="logo">Logo</option><option value="signature">Signature</option><option value="seal">Seal</option><option value="other">Other</option></select></div>
        <input type="file" accept="image/png,image/jpeg" (change)="upload($event)" />
      </div>

      <div class="db-card" *ngIf="template() as t">
        <div class="card-header"><h3>Versions</h3></div>
        <div class="hint" *ngFor="let v of versions()">v{{ v.version }} · {{ v.status.toLowerCase() }} · {{ (v.publishedAt || v.createdAt) | date:'medium' }}<span *ngIf="v.changeNote"> · {{ v.changeNote }}</span></div>
      </div>
    </aside>
  </div>
  `,
})
export class LetterEditorComponent implements OnInit, OnDestroy {
  zones: { id: Zone; label: string }[] = [{ id: 'header', label: 'Header' }, { id: 'body', label: 'Body' }, { id: 'footer', label: 'Footer' }];
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
  zone = signal<Zone>('body');
  dirty = signal(false);
  busy = signal(false);
  loading = signal(true);
  error = signal('');
  notice = signal('');
  editingVersion = signal<number | null>(null);
  previewRef = '';
  newImageName = '';
  newImageKind = 'logo';
  private beforeUnload = (e: BeforeUnloadEvent) => { if (this.dirty()) { e.preventDefault(); } };

  constructor(private route: ActivatedRoute, private svc: LettersService) {}

  ngOnInit(): void {
    window.addEventListener('beforeunload', this.beforeUnload);
    this.key = this.route.snapshot.paramMap.get('key') ?? '';
    this.svc.dictionary().subscribe((d) => this.dictionary.set(d));
    this.svc.rules().subscribe((r) => this.saved.set(r));
    this.svc.images().subscribe((i) => this.images.set(i));
    this.reload();
  }
  ngOnDestroy(): void { window.removeEventListener('beforeunload', this.beforeUnload); }

  private reload(): void {
    this.svc.template(this.key).subscribe({
      next: (t) => {
        this.template.set(t);
        const draft = t.versions.find((v) => v.status === 'DRAFT');
        const which = draft ? 'draft' : 'published';
        this.editingVersion.set(draft?.version ?? null);
        this.svc.version(this.key, which).subscribe({
          next: (v) => { this.doc.set(v.document); this.dirty.set(false); this.loading.set(false); },
          error: (e) => { this.error.set(this.msg(e)); this.loading.set(false); },
        });
      },
      error: (e) => { this.error.set(this.msg(e)); this.loading.set(false); },
    });
  }

  touch(): void { this.dirty.set(true); this.notice.set(''); this.checked.set(false); }
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
    this.run(this.svc.preview(this.key, d, this.previewRef.trim()), (blob) => {
      window.open(URL.createObjectURL(blob), '_blank');
    });
  }
  jump(i: LetterIssue): void {
    if (!i.nodeId) return;
    const d = this.doc(); if (!d) return;
    const zone = (['header', 'body', 'footer'] as Zone[]).find((z) => JSON.stringify(d[z]).includes(`"id":"${i.nodeId}"`));
    if (zone) this.zone.set(zone);
    setTimeout(() => document.getElementById('blk-' + i.nodeId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
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
