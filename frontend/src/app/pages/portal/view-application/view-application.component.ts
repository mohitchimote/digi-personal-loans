import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { LoanApplication, UnderwritingNote } from '../../../core/models';

@Component({
  selector: 'app-view-application',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './view-application.component.html',
  styleUrl: './view-application.component.scss'
})
export class ViewApplicationComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  notes = signal<UnderwritingNote[]>([]);
  loading = signal(true);
  withdrawing = signal(false);
  error = signal('');

  constructor(
    private route: ActivatedRoute,
    private appSvc: ApplicationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const appRef = this.route.snapshot.paramMap.get('appRef');
    if (!appRef) return;
    this.appSvc.getApplication(appRef).subscribe({
      next: app => { this.application.set(app); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.appSvc.getNotes(appRef).subscribe({
      next: notes => this.notes.set(notes.filter(n => n.noteType === 'CLARIFICATION_REQUEST' || n.noteType === 'DOCUMENT_REQUEST' || n.noteType === 'SEND_BACK' || n.noteType === 'DECISION_DECLINED')),
      error: () => {}
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

  get canPullBack(): boolean {
    const status = this.application()?.status;
    return status === 'SUBMITTED' || status === 'UNDER_REVIEW';
  }

  pullBack(): void {
    const app = this.application();
    if (!app) return;
    this.withdrawing.set(true);
    this.error.set('');
    this.appSvc.withdraw(app.applicationRef).subscribe({
      next: () => this.router.navigate(['/portal/apply/review-submit']),
      error: () => { this.withdrawing.set(false); this.error.set('Could not pull back the application. Please try again.'); }
    });
  }
}
