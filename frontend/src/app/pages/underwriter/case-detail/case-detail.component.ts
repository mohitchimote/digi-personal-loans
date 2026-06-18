import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoanApplication, UnderwritingNote } from '../../../core/models';

@Component({
  selector: 'app-uw-case-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './case-detail.component.html',
  styleUrl: './case-detail.component.scss'
})
export class CaseDetailComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  notes = signal<UnderwritingNote[]>([]);
  loading = signal(true);
  submittingAction = signal(false);
  error = signal('');
  appRef = '';

  sections = [
    { key: 'loanRequirements',   label: 'Loan Requirements' },
    { key: 'personalDetails',    label: 'Personal Details' },
    { key: 'incomeEmployment',   label: 'Income & Employment' },
    { key: 'outgoings',          label: 'Outgoings & Expenditure' },
    { key: 'creditDeclarations', label: 'Credit Declarations' },
  ];

  noteSection = 'loanRequirements';
  noteText = '';
  noteType: 'NOTE' | 'CLARIFICATION_REQUEST' | 'DOCUMENT_REQUEST' = 'NOTE';

  decisionReason = '';

  constructor(
    private route: ActivatedRoute,
    private appSvc: ApplicationService,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.appRef = this.route.snapshot.paramMap.get('appRef') || '';
    if (!this.appRef) return;
    this.load();
  }

  private load(): void {
    this.appSvc.getApplication(this.appRef).subscribe({
      next: app => { this.application.set(app); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.appSvc.getNotes(this.appRef).subscribe({
      next: notes => this.notes.set(notes)
    });
  }

  parseSection(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  get loanReqs() { return this.parseSection(this.application()?.loanRequirementsJson); }
  get personal() { return this.parseSection(this.application()?.personalDetailsJson); }
  get income()   { return this.parseSection(this.application()?.incomeEmploymentJson); }
  get outgoings() { return this.parseSection(this.application()?.outgoingsJson); }
  get credit()   { return this.parseSection(this.application()?.creditDeclarationsJson); }

  notesFor(sectionKey: string): UnderwritingNote[] {
    return this.notes().filter(n => n.section === sectionKey);
  }

  addNote(): void {
    if (!this.noteText.trim()) return;
    this.appSvc.addNote(this.appRef, this.noteSection, this.noteText.trim(), this.noteType, this.auth.userFullName || 'Underwriter').subscribe({
      next: note => {
        this.notes.update(n => [note, ...n]);
        this.noteText = '';
      },
      error: () => this.error.set('Could not save note. Please try again.')
    });
  }

  approve(): void {
    this.submittingAction.set(true);
    this.appSvc.approveByUnderwriter(this.appRef, this.auth.userFullName || 'Underwriter').subscribe({
      next: () => this.router.navigate(['/underwriter/pipeline']),
      error: () => { this.submittingAction.set(false); this.error.set('Could not approve application.'); }
    });
  }

  decline(): void {
    if (!this.decisionReason.trim()) { this.error.set('Please provide a reason for declining.'); return; }
    this.submittingAction.set(true);
    this.appSvc.decline(this.appRef, this.decisionReason.trim(), this.auth.userFullName || 'Underwriter').subscribe({
      next: () => this.router.navigate(['/underwriter/pipeline']),
      error: () => { this.submittingAction.set(false); this.error.set('Could not decline application.'); }
    });
  }

  sendBack(): void {
    if (!this.decisionReason.trim()) { this.error.set('Please provide a reason for sending back.'); return; }
    this.submittingAction.set(true);
    this.appSvc.sendBack(this.appRef, this.decisionReason.trim(), this.auth.userFullName || 'Underwriter').subscribe({
      next: () => this.router.navigate(['/underwriter/pipeline']),
      error: () => { this.submittingAction.set(false); this.error.set('Could not send back application.'); }
    });
  }
}
