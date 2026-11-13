import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LetterTemplateRow, LettersService } from '../../../core/services/letters.service';

@Component({
  selector: 'app-admin-letters',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
  <div class="page-header mb-24">
    <h2>Letters</h2>
    <p class="page-sub">Regulatory and customer letters produced as PDF, in English and Hebrew. Each letter is built from blocks, conditions and fields, versioned, and kept with the data it was issued from.</p>
  </div>
  <div class="db-alert db-alert--error mb-16" *ngIf="error()">{{ error() }}</div>

  <div class="db-card mb-24">
    <div class="card-header"><h3>New letter</h3></div>
    <div class="form-row">
      <div class="db-form-group"><label>Name (English)</label><input class="db-input" [(ngModel)]="nameEn" placeholder="Key features of the loan" /></div>
      <div class="db-form-group"><label>Name (עברית)</label><input class="db-input" dir="rtl" [(ngModel)]="nameHe" /></div>
      <div class="db-form-group"><label>For</label>
        <select class="db-select" [(ngModel)]="appliesTo"><option value="BOTH">Personal and business</option><option value="PERSONAL">Personal loans</option><option value="BUSINESS">Business loans</option></select></div>
    </div>
    <label class="db-checkbox"><input type="checkbox" [(ngModel)]="starter" /> <span>Start from the sample letter (a loan summary with a table, a condition and a repeat)</span></label>
    <p class="db-hint">The code that identifies the letter is generated from the English name.</p>
    <button class="db-btn db-btn--accent mt-16" (click)="create()" [disabled]="!nameEn.trim() || busy()">Create letter</button>
  </div>

  <div class="loading-row" *ngIf="loading()"><div class="spinner"></div><span>Loading…</span></div>
  <div class="db-card" *ngIf="!loading()">
    <div class="card-header"><h3>Letters</h3></div>
    <p class="db-hint" *ngIf="!rows().length">No letters yet.</p>
    <table class="db-table" *ngIf="rows().length">
      <thead><tr><th>Letter</th><th>For</th><th>Published</th><th>Draft</th><th></th></tr></thead>
      <tbody>
        <tr *ngFor="let r of rows()">
          <td><strong>{{ r.nameEn }}</strong><div class="db-hint" *ngIf="r.nameHe" dir="rtl">{{ r.nameHe }}</div></td>
          <td>{{ r.appliesTo === 'BOTH' ? 'Personal and business' : (r.appliesTo | titlecase) }}</td>
          <td>{{ r.publishedVersion ? 'v' + r.publishedVersion : '—' }}</td>
          <td>{{ r.hasDraft ? 'Yes' : '—' }}</td>
          <td><a class="db-btn db-btn--ghost db-btn--sm" [routerLink]="['/admin/letters', r.key]">Open</a></td>
        </tr>
      </tbody>
    </table>
  </div>`,
})
export class AdminLettersComponent implements OnInit {
  rows = signal<LetterTemplateRow[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  nameEn = ''; nameHe = ''; appliesTo = 'BOTH'; starter = true;

  constructor(private svc: LettersService, private router: Router) {}
  ngOnInit(): void { this.svc.templates().subscribe({ next: (r) => { this.rows.set(r); this.loading.set(false); }, error: (e) => { this.error.set(e?.error?.message ?? 'Could not load letters.'); this.loading.set(false); } }); }
  create(): void {
    this.busy.set(true); this.error.set('');
    this.svc.create({ nameEn: this.nameEn.trim(), nameHe: this.nameHe.trim(), appliesTo: this.appliesTo, starter: this.starter }).subscribe({
      next: (r) => this.router.navigate(['/admin/letters', r.key]),
      error: (e) => { this.busy.set(false); this.error.set(e?.error?.message ?? 'Could not create the letter.'); },
    });
  }
}
