import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { DocumentService } from '../../../core/services/document.service';
import { LoanApplication, UnderwritingNote, GeneratedDocument, UploadedDocument, REQUIRED_DOCUMENT_TYPES } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

type TabKey = 'overview' | 'identity' | 'affordability' | 'creditRisk' | 'decision' | 'disbursement';

@Component({
  selector: 'app-uw-case-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './case-detail.component.html',
  styleUrl: './case-detail.component.scss'
})
export class CaseDetailComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  notes = signal<UnderwritingNote[]>([]);
  generatedDocs = signal<GeneratedDocument[]>([]);
  uploadedDocs = signal<UploadedDocument[]>([]);
  requiredTypes = REQUIRED_DOCUMENT_TYPES;
  checklist = computed(() => {
    const receivedTypes = new Set(this.uploadedDocs().map(u => u.documentType));
    return this.requiredTypes.map(rt => ({ ...rt, received: receivedTypes.has(rt.type) }));
  });
  loading = signal(true);
  submittingAction = signal(false);
  error = signal('');
  actionMessage = signal('');
  appRef = '';

  activeTab = signal<TabKey>('overview');

  navTabs: { key: TabKey; labelKey: string; icon: string }[] = [
    { key: 'overview',      labelKey: 'uw.tabOverview',      icon: 'description' },
    { key: 'identity',      labelKey: 'uw.tabIdentity',      icon: 'badge' },
    { key: 'affordability', labelKey: 'uw.tabAffordability', icon: 'account_balance' },
    { key: 'creditRisk',    labelKey: 'uw.tabCreditRisk',    icon: 'shield' },
    { key: 'decision',      labelKey: 'uw.tabDecision',      icon: 'gavel' },
  ];

  sections = [
    { key: 'loanRequirements',   labelKey: 'steps.loanRequirements' },
    { key: 'personalDetails',    labelKey: 'steps.personalDetails' },
    { key: 'connectBank',        labelKey: 'steps.connectBank' },
    { key: 'incomeEmployment',   labelKey: 'steps.incomeEmployment' },
    { key: 'outgoings',          labelKey: 'outgoings.title' },
    { key: 'creditDeclarations', labelKey: 'steps.creditDeclarations' },
    { key: 'verifyId',           labelKey: 'steps.verifyId' },
    { key: 'directDebit',        labelKey: 'steps.directDebit' },
    { key: 'general',            labelKey: 'uw.generalSection' },
  ];

  noteSection = 'loanRequirements';
  noteText = '';
  noteType: 'NOTE' | 'CLARIFICATION_REQUEST' | 'DOCUMENT_REQUEST' = 'NOTE';

  decisionReason = '';

  constructor(
    private route: ActivatedRoute,
    private appSvc: ApplicationService,
    private auth: AuthService,
    private docSvc: DocumentService,
    private router: Router,
    private i18n: I18nService
  ) {}

  statusLabel(status: string): string {
    return this.i18n.t('status.' + status);
  }

  noteTypeLabel(type: string): string {
    return this.i18n.t('aside.noteType.' + type) || type;
  }

  get isApproved(): boolean {
    return this.application()?.status === 'APPROVED';
  }

  get disbursementStatus(): string | undefined {
    return this.application()?.disbursementStatus;
  }

  setTab(tab: TabKey): void {
    this.activeTab.set(tab);
  }

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
    this.docSvc.getByApplication(this.appRef).subscribe({
      next: docs => this.generatedDocs.set(docs),
      error: () => {}
    });
    this.docSvc.getUploaded(this.appRef).subscribe({
      next: docs => this.uploadedDocs.set(docs),
      error: () => {}
    });
  }

  parseSection(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  get loanReqs() { return this.parseSection(this.application()?.loanRequirementsJson); }
  get personal() { return this.parseSection(this.application()?.personalDetailsJson); }
  get bankConnection() { return this.parseSection(this.application()?.bankConnectionJson); }
  get income()   { return this.parseSection(this.application()?.incomeEmploymentJson); }
  get outgoings() { return this.parseSection(this.application()?.outgoingsJson); }
  get credit()   { return this.parseSection(this.application()?.creditDeclarationsJson); }
  get verifyId() { return this.parseSection(this.application()?.verifyIdJson); }
  get directDebit() { return this.parseSection(this.application()?.directDebitJson); }
  get affordability() { return this.parseSection(this.application()?.affordabilityResultJson); }
  get product()  { return this.parseSection(this.application()?.selectedProductJson); }

  downloadDoc(doc: GeneratedDocument): void {
    this.docSvc.download(doc.id);
  }

  viewDoc(doc: GeneratedDocument): void {
    this.docSvc.view(doc.id);
  }

  viewUploaded(doc: UploadedDocument): void {
    this.docSvc.viewUploaded(doc.id);
  }

  uploadedTypeLabel(type: string): string {
    const match = this.requiredTypes.find(t => t.type === type);
    return match ? this.i18n.t(match.labelKey) : type;
  }

  docLabel(type: string): string {
    switch (type) {
      case 'APPROVAL_LETTER':       return this.i18n.t('docs.conditionalLetter');
      case 'FINAL_APPROVAL_LETTER': return this.i18n.t('docs.finalLetter');
      case 'LOAN_AGREEMENT':        return this.i18n.t('docs.loanAgreement');
      case 'REPAYMENT_SCHEDULE':    return this.i18n.t('docs.repaymentSchedule');
      default: return type;
    }
  }

  riskClass(): string {
    const risk = this.affordability.riskCategory;
    if (risk === 'LOW') return 'risk-low';
    if (risk === 'MEDIUM') return 'risk-medium';
    if (risk === 'HIGH') return 'risk-high';
    return '';
  }

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
      error: () => this.error.set(this.i18n.t('uw.errSaveNote'))
    });
  }

  approve(): void {
    this.submittingAction.set(true);
    this.error.set('');
    this.appSvc.approveByUnderwriter(this.appRef, this.auth.userFullName || 'Underwriter').subscribe({
      next: () => {
        this.submittingAction.set(false);
        this.actionMessage.set(this.i18n.t('uw.caseApproved'));
        this.load();
      },
      error: () => { this.submittingAction.set(false); this.error.set(this.i18n.t('uw.errApprove')); }
    });
  }

  decline(): void {
    if (!this.decisionReason.trim()) { this.error.set(this.i18n.t('uw.errDeclineReason')); return; }
    this.submittingAction.set(true);
    this.appSvc.decline(this.appRef, this.decisionReason.trim(), this.auth.userFullName || 'Underwriter').subscribe({
      next: () => this.router.navigate(['/underwriter/pipeline']),
      error: () => { this.submittingAction.set(false); this.error.set(this.i18n.t('uw.errDecline')); }
    });
  }

  referToSenior(): void {
    if (!this.decisionReason.trim()) { this.error.set(this.i18n.t('uw.errReferReason')); return; }
    this.submittingAction.set(true);
    this.appSvc.referToSenior(this.appRef, this.decisionReason.trim(), this.auth.userFullName || 'Underwriter').subscribe({
      next: () => this.router.navigate(['/underwriter/pipeline']),
      error: () => { this.submittingAction.set(false); this.error.set(this.i18n.t('uw.errRefer')); }
    });
  }

  sendBack(): void {
    if (!this.decisionReason.trim()) { this.error.set(this.i18n.t('uw.errSendBackReason')); return; }
    this.submittingAction.set(true);
    this.appSvc.sendBack(this.appRef, this.decisionReason.trim(), this.auth.userFullName || 'Underwriter').subscribe({
      next: () => this.router.navigate(['/underwriter/pipeline']),
      error: () => { this.submittingAction.set(false); this.error.set(this.i18n.t('uw.errSendBack')); }
    });
  }

  authoriseFundRelease(): void {
    this.submittingAction.set(true);
    this.error.set('');
    this.appSvc.authoriseFundRelease(this.appRef, this.auth.userFullName || 'Underwriter').subscribe({
      next: () => { this.submittingAction.set(false); this.actionMessage.set(this.i18n.t('uw.fundsReleased')); this.load(); },
      error: () => { this.submittingAction.set(false); this.error.set(this.i18n.t('uw.errDisbursement')); }
    });
  }

  submitForSecondCheck(): void {
    this.submittingAction.set(true);
    this.error.set('');
    this.appSvc.submitForSecondCheck(this.appRef, this.auth.userFullName || 'Underwriter').subscribe({
      next: () => { this.submittingAction.set(false); this.actionMessage.set(this.i18n.t('uw.secondCheckSubmitted')); this.load(); },
      error: () => { this.submittingAction.set(false); this.error.set(this.i18n.t('uw.errDisbursement')); }
    });
  }
}
