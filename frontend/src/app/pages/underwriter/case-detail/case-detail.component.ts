import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { DocumentService } from '../../../core/services/document.service';
import { LoanApplication, UnderwritingNote, GeneratedDocument, UploadedDocument, REQUIRED_DOCUMENT_TYPES, BUSINESS_REQUIRED_DOCUMENT_TYPES, DataVerificationSummary, DataVerificationRule, DataVerificationAction, MandateRules, BusinessFinancialsAnalysis } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ficoToLenderGrade, dnbScoreToLenderGrade, dnbScoreToRiskClass } from '../../../core/utils/credit-score.util';
import { CaseSectionNavComponent } from '../../../shared/case-section-nav/case-section-nav.component';

type TabKey = 'overview' | 'identity' | 'affordability' | 'creditRisk' | 'dataVerification' | 'decision' | 'disbursement';

@Component({
  selector: 'app-uw-case-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, CaseSectionNavComponent],
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
    const baseTypes = this.application()?.applicationType === 'BUSINESS' ? BUSINESS_REQUIRED_DOCUMENT_TYPES : this.requiredTypes;
    const types = this.application()?.guarantorRequired
      ? [...baseTypes, { type: 'GUARANTOR_ID', labelKey: 'docs.requiredGuarantorId' }]
      : baseTypes;
    return types.map(rt => ({ ...rt, received: receivedTypes.has(rt.type) }));
  });
  loading = signal(true);
  submittingAction = signal(false);
  error = signal('');
  actionMessage = signal('');
  appRef = '';

  activeTab = signal<TabKey>('overview');

  personalNavTabs: { key: TabKey; labelKey: string; icon: string }[] = [
    { key: 'overview',         labelKey: 'uw.tabOverview',         icon: 'description' },
    { key: 'identity',         labelKey: 'uw.tabIdentity',         icon: 'badge' },
    { key: 'affordability',    labelKey: 'uw.tabAffordability',    icon: 'account_balance' },
    { key: 'creditRisk',       labelKey: 'uw.tabCreditRisk',       icon: 'shield' },
    { key: 'dataVerification', labelKey: 'uw.tabDataVerification', icon: 'fact_check' },
    { key: 'decision',         labelKey: 'uw.tabDecision',         icon: 'gavel' },
  ];

  /** Business cases skip Data Verification for now (out of scope for this pass — see
   * PROJECT_DOCUMENTATION.md) and relabel Identity/Affordability/Credit & Risk to their
   * company/DSCR equivalents; same tab mechanics, same Decision/Disbursement tabs reused. */
  businessNavTabs: { key: TabKey; labelKey: string; icon: string }[] = [
    { key: 'overview',      labelKey: 'uw.tabOverview',          icon: 'description' },
    { key: 'identity',      labelKey: 'company.tabCompany',      icon: 'apartment' },
    { key: 'affordability', labelKey: 'company.tabAffordability', icon: 'account_balance' },
    { key: 'creditRisk',    labelKey: 'company.tabCreditRisk',   icon: 'shield' },
    { key: 'decision',      labelKey: 'uw.tabDecision',          icon: 'gavel' },
  ];

  get navTabs(): { key: TabKey; labelKey: string; icon: string }[] {
    return this.isBusiness ? this.businessNavTabs : this.personalNavTabs;
  }

  /** Left-nav split into a flat top item (Application Overview), a collapsible group of the
   * remaining section tabs, and a flat bottom item (Decision) — mirrors the staff-tool reference
   * the user supplied, reusing the same navTabs/setTab() the old top-tab bar used. */
  get navTopItems() {
    return this.navTabs.filter(t => t.key === 'overview').map(t => ({ key: t.key, labelKey: t.labelKey }));
  }

  get navGroupItems() {
    return this.navTabs.filter(t => t.key !== 'overview' && t.key !== 'decision').map(t => ({ key: t.key, labelKey: t.labelKey }));
  }

  get navBottomItems() {
    const items = this.navTabs.filter(t => t.key === 'decision').map(t => ({ key: t.key, labelKey: t.labelKey }));
    if (this.isApproved) items.push({ key: 'disbursement', labelKey: 'uw.tabDisbursement' });
    return items;
  }

  get isBusiness(): boolean {
    return this.application()?.applicationType === 'BUSINESS';
  }

  personalSections = [
    { key: 'loanRequirements',   labelKey: 'steps.loanRequirements' },
    { key: 'consentManagement',  labelKey: 'steps.consentManagement' },
    { key: 'personalDetails',    labelKey: 'steps.personalDetails' },
    { key: 'connectBank',        labelKey: 'steps.connectBank' },
    { key: 'incomeEmployment',   labelKey: 'steps.incomeEmployment' },
    { key: 'outgoings',          labelKey: 'outgoings.title' },
    { key: 'creditDeclarations', labelKey: 'steps.creditDeclarations' },
    { key: 'verifyId',           labelKey: 'steps.verifyId' },
    { key: 'directDebit',        labelKey: 'steps.directDebit' },
    { key: 'general',            labelKey: 'uw.generalSection' },
  ];

  businessSections = [
    { key: 'companyDetails',             labelKey: 'company.detailsTitle' },
    { key: 'signatories',                labelKey: 'company.signatoriesTitle' },
    { key: 'connectBusinessBank',        labelKey: 'company.connectBankTitle' },
    { key: 'businessFinancials',         labelKey: 'company.financialsTitle' },
    { key: 'businessOutgoings',          labelKey: 'company.outgoingsTitle' },
    { key: 'businessCreditDeclarations', labelKey: 'company.creditTitle' },
    { key: 'verifyId',                   labelKey: 'steps.verifyId' },
    { key: 'directDebit',                labelKey: 'steps.directDebit' },
    { key: 'general',                    labelKey: 'uw.generalSection' },
  ];

  get sections() {
    return this.isBusiness ? this.businessSections : this.personalSections;
  }

  noteSection = 'loanRequirements';
  noteText = '';
  noteType: 'NOTE' | 'CLARIFICATION_REQUEST' | 'DOCUMENT_REQUEST' = 'NOTE';

  decisionReason = '';
  approvedAmount: number | null = null;
  exceptionNotes = '';
  requireGuarantor = false;

  editingSection = signal<string | null>(null);
  editBuffer: any = {};
  savingEdit = signal(false);

  dataVerification = signal<DataVerificationSummary | null>(null);
  businessFinancialsAnalysis = signal<BusinessFinancialsAnalysis | null>(null);
  private financialsAnalysisRequested = false;
  openResolutionFor = signal<string | null>(null);
  resolutionAction: DataVerificationAction | '' = '';
  resolutionNote = '';
  savingResolution = signal(false);

  redCount = computed(() => this.dataVerification()?.rules.filter(r => r.status === 'RED' && !r.resolution).length ?? 0);
  amberCount = computed(() => this.dataVerification()?.rules.filter(r => r.status === 'AMBER' && !r.resolution).length ?? 0);
  greenCount = computed(() => this.dataVerification()?.rules.filter(r => r.status === 'GREEN').length ?? 0);
  hasUnresolvedRed = computed(() => this.redCount() > 0);

  /** Approval Mandates (UW -> Senior UW -> Head of Lending -> COO -> CEO): admin-editable limits
   * per role, fetched once on load. If the requested/approved amount exceeds the logged-in
   * approver's own mandate, they cannot Approve at all — only Refer to Senior. */
  mandateRules = signal<MandateRules | null>(null);

  myMandateLimit = computed(() => {
    const rules = this.mandateRules();
    if (!rules) return null;
    switch (this.auth.role) {
      case 'SENIOR_UNDERWRITER': return rules.seniorUnderwriterLimit;
      case 'HEAD_OF_LENDING':    return rules.headOfLendingLimit;
      case 'COO':                return rules.cooLimit;
      case 'CEO':                return rules.ceoLimit;
      default:                   return rules.underwriterLimit;
    }
  });

  /** Plain method, not computed() — approvedAmount is a plain ngModel-bound property, not a
   * signal, so a computed() here would go stale exactly like the underwriter search bug earlier
   * (computed() only re-runs when a signal it reads changes). Template re-evaluates methods every
   * change-detection cycle, which is what we want here. */
  isOverMandate(): boolean {
    const limit = this.myMandateLimit();
    if (limit == null || this.isApproved) return false;
    return (this.approvedAmount ?? 0) > limit;
  }

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

  onNavSelect(key: string): void {
    this.setTab(key as TabKey);
  }

  ngOnInit(): void {
    this.appRef = this.route.snapshot.paramMap.get('appRef') || '';
    if (!this.appRef) return;
    this.load();
    this.appSvc.getMandateRules().subscribe({
      next: rules => this.mandateRules.set(rules),
      error: () => {}
    });
  }

  private load(): void {
    this.appSvc.getApplication(this.appRef).subscribe({
      next: app => {
        this.application.set(app);
        this.loading.set(false);
        const requested = app.applicationType === 'BUSINESS'
          ? this.parseSection(app.companyDetailsJson)?.loanAmount
          : this.parseSection(app.loanRequirementsJson)?.loanAmount;
        this.approvedAmount = app.approvedAmount ?? requested ?? null;
        if (app.applicationType === 'BUSINESS') {
          this.noteSection = 'companyDetails';
        }
        if (app.applicationType !== 'BUSINESS') {
          this.appSvc.getDataVerification(this.appRef).subscribe({
            next: dv => this.dataVerification.set(dv),
            error: () => {}
          });
        } else {
          this.maybeLoadFinancialsAnalysis();
        }
      },
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
      next: docs => { this.uploadedDocs.set(docs); this.maybeLoadFinancialsAnalysis(); },
      error: () => {}
    });
  }

  /** Business Financials Intelligence is only generated once a qualifying business document
   * (financial statements or business bank statements) has been uploaded — mirrors the "customer
   * attaches docs, system derives the rest" design (no OCR exists, figures are fabricated but
   * seeded/stable, see BusinessFinancialsAnalysisService). */
  private maybeLoadFinancialsAnalysis(): void {
    if (this.financialsAnalysisRequested || !this.isBusiness) return;
    const types = new Set(this.uploadedDocs().map(d => d.documentType));
    if (!types.has('FINANCIAL_STATEMENTS') && !types.has('BUSINESS_BANK_STATEMENTS')) return;
    this.financialsAnalysisRequested = true;
    this.appSvc.getBusinessFinancialsAnalysis(this.appRef).subscribe({
      next: analysis => this.businessFinancialsAnalysis.set(analysis),
      error: () => {}
    });
  }

  parseSection(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  get loanReqs() { return this.parseSection(this.application()?.loanRequirementsJson); }
  get consent() { return this.parseSection(this.application()?.consentManagementJson); }
  get personal() { return this.parseSection(this.application()?.personalDetailsJson); }

  /** Header/queue rows previously showed only the primary applicant's name, giving no indication
   * a joint application had a second applicant at all — appends them when present. */
  get applicantDisplayName(): string {
    const name = `${this.personal.firstName || ''} ${this.personal.lastName || ''}`.trim();
    const a2 = this.personal.applicant2;
    const name2 = a2 ? `${a2.firstName || ''} ${a2.lastName || ''}`.trim() : '';
    return name2 ? `${name} & ${name2}` : name;
  }
  get bankConnection() { return this.parseSection(this.application()?.bankConnectionJson); }
  get income()   { return this.parseSection(this.application()?.incomeEmploymentJson); }
  get outgoings() { return this.parseSection(this.application()?.outgoingsJson); }
  get credit()   { return this.parseSection(this.application()?.creditDeclarationsJson); }
  get verifyId() { return this.parseSection(this.application()?.verifyIdJson); }
  get directDebit() { return this.parseSection(this.application()?.directDebitJson); }
  get guarantorDetails() { return this.parseSection(this.application()?.guarantorDetailsJson); }
  get company() { return this.parseSection(this.application()?.companyDetailsJson); }
  get signatories() { return this.parseSection(this.application()?.signatoriesJson).signatories || []; }
  get businessBankConnection() { return this.parseSection(this.application()?.businessBankConnectionJson); }
  get businessFinancials() { return this.parseSection(this.application()?.businessFinancialsJson); }
  get businessOutgoings() { return this.parseSection(this.application()?.businessOutgoingsJson); }
  get businessCredit() { return this.parseSection(this.application()?.businessCreditDeclarationsJson); }

  /** Internal lender risk grading (1-9) and, for business, D&B's own Risk Class (1-5) — derived
   * purely from the customer-visible bureau score, underwriter-only, never shown to the customer. */
  lenderRiskGrade(): number | null {
    if (this.isBusiness) {
      const score = this.businessCredit?.directorCreditScore;
      return score != null ? dnbScoreToLenderGrade(score) : null;
    }
    const score = this.credit?.creditScore;
    return score != null ? ficoToLenderGrade(score) : null;
  }

  lenderRiskGradeApplicant2(): number | null {
    const score = this.credit?.applicant2?.creditScore;
    return score != null ? ficoToLenderGrade(score) : null;
  }

  dnbRiskClass(): number {
    const score = this.businessCredit?.directorCreditScore;
    return score != null ? dnbScoreToRiskClass(score) : 5;
  }
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

  ragClass(rule: DataVerificationRule): string {
    if (rule.resolution) return 'dv-resolved';
    if (rule.status === 'GREEN') return 'risk-low';
    if (rule.status === 'AMBER') return 'risk-medium';
    if (rule.status === 'RED') return 'risk-high';
    return '';
  }

  staffContactHint(): string {
    const p = this.personal;
    if (p.staffName) return p.staffName;
    if (p.preferredBranch) return p.preferredBranch;
    return '';
  }

  openResolution(rule: DataVerificationRule): void {
    this.openResolutionFor.set(rule.ruleKey);
    this.resolutionAction = rule.resolution?.action ?? '';
    this.resolutionNote = rule.resolution?.note ?? '';
  }

  cancelResolution(): void {
    this.openResolutionFor.set(null);
    this.resolutionAction = '';
    this.resolutionNote = '';
  }

  submitResolution(rule: DataVerificationRule): void {
    if (!this.resolutionAction) { this.error.set(this.i18n.t('dataVerification.errActionRequired')); return; }
    if (this.resolutionAction === 'APPROVE_EXCEPTION' && !this.resolutionNote.trim()) {
      this.error.set(this.i18n.t('dataVerification.errNoteRequired'));
      return;
    }
    this.savingResolution.set(true);
    this.error.set('');
    this.appSvc.resolveDataVerificationRule(this.appRef, rule.ruleKey, this.resolutionAction, this.resolutionNote.trim(), this.auth.userFullName || 'Underwriter').subscribe({
      next: dv => {
        this.dataVerification.set(dv);
        this.savingResolution.set(false);
        this.cancelResolution();
      },
      error: () => { this.savingResolution.set(false); this.error.set(this.i18n.t('dataVerification.errSaveResolution')); }
    });
  }

  notesFor(sectionKey: string): UnderwritingNote[] {
    return this.notes().filter(n => n.section === sectionKey);
  }

  isEditing(section: string): boolean {
    return this.editingSection() === section;
  }

  startEdit(section: string, current: any): void {
    this.editingSection.set(section);
    this.editBuffer = JSON.parse(JSON.stringify(current || {}));
  }

  cancelEdit(): void {
    this.editingSection.set(null);
    this.editBuffer = {};
  }

  saveEdit(section: string): void {
    this.savingEdit.set(true);
    this.appSvc.saveSectionByUnderwriter(this.appRef, section, this.editBuffer, this.auth.userFullName || 'Underwriter').subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.editingSection.set(null);
        this.editBuffer = {};
        this.load();
      },
      error: () => { this.savingEdit.set(false); this.error.set(this.i18n.t('uw.errSaveSection')); }
    });
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
    if (!this.approvedAmount || this.approvedAmount <= 0) { this.error.set(this.i18n.t('uw.errApprovedAmount')); return; }
    if (this.isOverMandate()) { this.error.set(this.i18n.t('mandate.errOverLimit')); return; }
    if (this.hasUnresolvedRed() && !this.exceptionNotes.trim()) {
      this.error.set(this.i18n.t('dataVerification.errExceptionNotesRequired'));
      return;
    }
    this.submittingAction.set(true);
    this.error.set('');
    const exceptionNotes = this.exceptionNotes.trim();
    this.appSvc.approveByUnderwriter(this.appRef, this.auth.userFullName || 'Underwriter', this.approvedAmount).subscribe({
      next: () => {
        this.submittingAction.set(false);
        this.actionMessage.set(this.i18n.t('uw.caseApproved'));
        if (exceptionNotes) {
          this.appSvc.addNote(this.appRef, 'general', exceptionNotes, 'DECISION_APPROVED_WITH_EXCEPTION', this.auth.userFullName || 'Underwriter').subscribe();
        }
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
    this.appSvc.sendBack(this.appRef, this.decisionReason.trim(), this.auth.userFullName || 'Underwriter', this.requireGuarantor).subscribe({
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
