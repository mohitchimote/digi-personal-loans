import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { DocumentService } from '../../../core/services/document.service';
import { CaseOwnershipComponent } from '../../../shared/case-ownership/case-ownership.component';
import { WorkflowService, CaseActions, CaseAction } from '../../../core/services/workflow.service';
import { LoanApplication, UnderwritingNote, GeneratedDocument, UploadedDocument, REQUIRED_DOCUMENT_TYPES, BUSINESS_REQUIRED_DOCUMENT_TYPES, DataVerificationSummary, DataVerificationRule, DataVerificationAction, CaseMandate, CaseReferral, BusinessFinancialsAnalysis } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ficoToLenderGrade, dnbScoreToLenderGrade, dnbScoreToRiskClass } from '../../../core/utils/credit-score.util';
import { buttonClassOf, doneMessage, fieldLabelOf, labelOf, missingInputMessage, parseNumber } from '../../../shared/workflow-actions/workflow-actions.util';
import { WorkflowActionsComponent } from '../../../shared/workflow-actions/workflow-actions.component';
import { HAND_WIRED_ACTIONS } from '../../../shared/workflow-actions/workflow-actions.const';
import { CaseSectionNavComponent } from '../../../shared/case-section-nav/case-section-nav.component';

type TabKey = 'overview' | 'identity' | 'affordability' | 'creditRisk' | 'dataVerification' | 'decision' | 'disbursement';

@Component({
  selector: 'app-uw-case-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, CaseSectionNavComponent, CaseOwnershipComponent, WorkflowActionsComponent],
  templateUrl: './case-detail.component.html',
  styleUrl: './case-detail.component.scss'
})
export class CaseDetailComponent implements OnInit {
  private workflow = inject(WorkflowService);
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
    return this.navTabs.filter(t => t.key === 'overview').map(t => ({ key: t.key, labelKey: t.labelKey, status: this.sectionStatus(t.key) }));
  }

  get navGroupItems() {
    return this.navTabs.filter(t => t.key !== 'overview' && t.key !== 'decision').map(t => ({ key: t.key, labelKey: t.labelKey, status: this.sectionStatus(t.key) }));
  }

  get navBottomItems() {
    const items = this.navTabs.filter(t => t.key === 'decision').map(t => ({ key: t.key, labelKey: t.labelKey, status: this.sectionStatus(t.key) }));
    if (this.isApproved) items.push({ key: 'disbursement', labelKey: 'uw.tabDisbursement', status: this.sectionStatus('disbursement') });
    return items;
  }

  /** Drives the checkmark/warning icon next to each left-nav item — tied to real data (has the
   * underlying section been filled in / does data verification have unresolved red flags /
   * has a decision been recorded), not decorative. 'pending' renders no icon at all. */
  sectionStatus(key: TabKey | 'disbursement'): 'complete' | 'warning' | 'pending' {
    const app = this.application();
    if (!app) return 'pending';
    switch (key) {
      case 'overview':
        return 'complete';
      case 'identity':
        return (this.isBusiness ? app.companyDetailsJson : app.personalDetailsJson) ? 'complete' : 'pending';
      case 'affordability':
        return app.affordabilityResultJson ? 'complete' : 'pending';
      case 'creditRisk':
        return (this.isBusiness ? app.businessCreditDeclarationsJson : app.creditDeclarationsJson) ? 'complete' : 'pending';
      case 'dataVerification':
        if (!this.dataVerification()) return 'pending';
        return this.hasUnresolvedRed() ? 'warning' : 'complete';
      case 'decision':
        return ['APPROVED', 'CONDITIONALLY_APPROVED', 'DECLINED'].includes(app.status) ? 'complete' : 'pending';
      case 'disbursement':
        return app.disbursementStatus === 'FUNDS_RELEASED' ? 'complete' : 'pending';
      default:
        return 'pending';
    }
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
  caseMandate = signal<CaseMandate | null>(null);
  referrals = signal<CaseReferral[]>([]);

  /** Admin-configured limit for this role on THIS case (role + the case's org unit / type). */
  myMandateLimit = computed(() => this.caseMandate()?.limit ?? null);

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
    this.appSvc.getCaseMandate(this.appRef).subscribe({
      next: m => this.caseMandate.set(m),
      error: () => {}
    });
    this.loadReferrals();
  }

  private loadReferrals(): void {
    this.appSvc.getReferrals(this.appRef).subscribe({ next: r => this.referrals.set(r), error: () => {} });
  }

  /** True when the case has been referred above the signed-in approver - every decision action is
   * refused server-side, so the buttons are disabled to match. */
  get lockedByReferral(): boolean {
    return this.caseActions()?.blocked['approve']?.code === 'REFERRAL_LOCKED' || !!this.caseMandate()?.lockedTo;
  }

  /** What the signed-in approver can do to this case right now, from the workflow definition. The
   * Decision and Disbursement buttons are built from this, so a failed load is reported, not silent. */
  caseActions = signal<CaseActions | null>(null);

  // ---- actions the workflow defines that this screen has no hand-written control for (see HAND_WIRED_ACTIONS):
  // everything else the engine offers the caller gets a generic button, so an action added in the workflow
  // builder works without code.
  /** Where each action's button goes comes from the definition's `ui.area` (defaults resolved by the
   * server): the Decision tab, the Disbursement tab, or the general card at the top. */
  private offered = computed(() => (this.caseActions()?.allowed ?? []).filter(a => this.hasTarget(a)));
  disbursementActions = computed(() => this.offered().filter(a => a.ui.area === 'disbursement'));
  decisionActions = computed(() => this.offered().filter(a => a.ui.area === 'decision' && !HAND_WIRED_ACTIONS.has(a.key)));

  /** An action that hands the case to another role (it has a `toRole` input) is only worth offering
   * when there is a role above the user to hand it to. Until the mandate has loaded, assume there is. */
  private takesTarget(a: CaseAction): boolean { return a.inputs.some(f => f.field === 'toRole'); }
  private hasTarget(a: CaseAction): boolean {
    const m = this.caseMandate();
    return !this.takesTarget(a) || !m || !!m.nextRole;
  }

  /** The button's text: a role-handing action names the role it will go to ("Refer to Senior Underwriter"). */
  actionText(a: CaseAction): string {
    const next = this.caseMandate()?.nextRole;
    return this.takesTarget(a) && next ? this.i18n.t('mandate.referTo', { role: this.i18n.roleName(next.code, next.label) }) : this.actionLabel(a);
  }

  /** The Decision tab owns two widgets, the Reason box and the "require a guarantor" checkbox. Its
   * actions read those instead of showing a copy of their own. */
  usesSharedInput(a: CaseAction, field: string): boolean {
    return a.ui.area === 'decision' && (field === 'reason' || field === 'requireGuarantor' || field === 'approvedAmount');
  }

  /** An action that grants an amount is an approval: the mandate limit and the exception-notes rule apply to it. */
  grantsAmount(a: CaseAction): boolean { return a.ui.area === 'decision' && a.inputs.some(f => f.field === 'approvedAmount'); }

  /** Why the button cannot be pressed right now: busy, over the user's mandate, or red data checks without exception notes. */
  blocked(a: CaseAction): boolean {
    if (this.runningExtra() !== '') return true;
    return this.grantsAmount(a) && (this.isOverMandate() || (this.hasUnresolvedRed() && !this.exceptionNotes.trim()));
  }

  /** Inputs the screen decides for the person: in the Decision tab a referral goes to the next role up. */
  isImplicit(a: CaseAction, field: string): boolean { return a.ui.area === 'decision' && field === 'toRole'; }

  /** True when any Decision action takes this input, so the shared widget is worth showing. */
  decisionHas(field: string): boolean { return this.decisionActions().some(a => a.inputs.some(f => f.field === field)); }

  buttonClass(a: CaseAction): string { return buttonClassOf(a); }

  /** What the user typed for each generic action's inputs, keyed `action.field`. */
  extraInput: Record<string, string> = {};
  runningExtra = signal('');

  actionLabel(a: { label: { en: string; he: string } }): string { return labelOf(a, this.i18n); }

  fieldLabel(f: { field: string }): string { return fieldLabelOf(f, this.i18n); }

  /** What the person has entered for one input: from the Decision tab's shared widgets, or this action's own box. */
  private rawValue(a: CaseAction, field: string): string {
    if (this.usesSharedInput(a, field)) {
      if (field === 'approvedAmount') return this.approvedAmount == null ? '' : String(this.approvedAmount);
      return this.decisionReason;
    }
    return String(this.extraInput[`${a.key}.${field}`] ?? '');
  }

  runExtra(a: CaseAction): void {
    if (this.grantsAmount(a)) {
      if (this.isOverMandate()) { this.error.set(this.i18n.t('mandate.errOverLimit')); return; }
      if (this.hasUnresolvedRed() && !this.exceptionNotes.trim()) { this.error.set(this.i18n.t('dataVerification.errExceptionNotesRequired')); return; }
    }
    const input: Record<string, unknown> = {};
    for (const f of a.inputs) {
      if (f.kind === 'boolean') {
        input[f.field] = this.usesSharedInput(a, f.field) ? this.requireGuarantor : this.extraInput[`${a.key}.${f.field}`] === 'true';
        continue;
      }
      const raw = this.rawValue(a, f.field).trim();
      if (f.kind === 'number') {
        const n = parseNumber(raw);
        if (raw && n === null) { this.error.set(this.i18n.t('uw.extra.badNumber', { field: this.fieldLabel(f) })); return; }
        if (f.required && !(n !== null && n > 0)) { this.error.set(missingInputMessage(a, f, this.i18n)); return; }
        if (n !== null) input[f.field] = n;
        continue;
      }
      if (!raw) {
        if (f.required) { this.error.set(missingInputMessage(a, f, this.i18n)); return; }
        continue;
      }
      input[f.field] = raw;
    }
    const exceptionNotes = this.grantsAmount(a) && this.hasUnresolvedRed() ? this.exceptionNotes.trim() : '';
    this.runningExtra.set(a.key);
    this.error.set('');
    this.actionMessage.set('');
    this.workflow.runAction(this.appRef, a.key, input).subscribe({
      next: () => {
        this.runningExtra.set('');
        this.actionMessage.set(doneMessage(a, this.i18n));
        for (const f of a.inputs) delete this.extraInput[`${a.key}.${f.field}`];
        // An approval taken over unresolved red checks also records why, as before.
        if (exceptionNotes) {
          this.appSvc.addNote(this.appRef, 'general', exceptionNotes, 'DECISION_APPROVED_WITH_EXCEPTION', this.auth.userFullName || 'Underwriter').subscribe({
            error: () => this.error.set(this.i18n.t('uw.extra.noteFailed')),
          });
        }
        // Some actions take the case out of the user's hands: back to the queue, as the old buttons did.
        if (a.ui.after === 'pipeline') { this.router.navigate(['/underwriter/pipeline']); return; }
        this.load();
        this.loadReferrals();
      },
      error: e => { this.runningExtra.set(''); this.error.set(e?.error?.message || this.i18n.t('uw.extra.failed')); }
    });
  }

  private actionsSeq = 0;
  private loadActions(): void {
    const seq = ++this.actionsSeq;
    this.workflow.caseActions(this.appRef).subscribe({
      next: a => { if (seq === this.actionsSeq) this.caseActions.set(a); },
      error: () => { if (seq === this.actionsSeq) this.error.set(this.i18n.t('uw.extra.loadFailed')); },
    });
  }

  /** The open (unresolved) referral, if the case is currently sitting with a senior role. */
  get openReferral(): CaseReferral | null {
    return this.referrals().filter(r => !r.resolvedAt).slice(-1)[0] ?? null;
  }

  roleName(code: string): string {
    return this.i18n.roleName(code, this.caseMandate()?.nextRole?.code === code ? this.caseMandate()?.nextRole?.label : null);
  }

  /** The shared actions card ran an action: reload the case and its referrals. */
  afterWorkflowAction(): void { this.load(); this.loadReferrals(); }

  private load(): void {
    this.loadActions();
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

  /** Guards the secondary "Quick-scan" strip — without this it renders as an empty padded bar
   * whenever an application hasn't been through affordability assessment yet (all of dti/hti/
   * dscr/riskCategory undefined). */
  get hasSecondaryAffordabilityMetrics(): boolean {
    const a = this.affordability;
    if (this.isBusiness) return a.dscr !== undefined || !!a.riskCategory;
    return a.dti !== undefined || a.hti !== undefined || !!a.riskCategory;
  }
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


}
