import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApplicationService } from '../../../core/services/application.service';
import { AuthService } from '../../../core/services/auth.service';
import { LoanApplication, UnderwritingNote, DIGIBANK_BRANCHES, DIGIBANK_BRANCH_STAFF } from '../../../core/models';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';

/** Maps a wizard section key to the LoanApplication field that stores its JSON. "general" has no
 * backing field — it's a notes-only bucket, same convention as the Underwriter's case-detail. */
const SECTION_FIELD_MAP: Record<string, keyof LoanApplication> = {
  loanRequirements: 'loanRequirementsJson',
  consentManagement: 'consentManagementJson',
  personalDetails: 'personalDetailsJson',
  connectBank: 'bankConnectionJson',
  incomeEmployment: 'incomeEmploymentJson',
  outgoings: 'outgoingsJson',
  creditDeclarations: 'creditDeclarationsJson',
  verifyId: 'verifyIdJson',
  directDebit: 'directDebitJson',
  companyDetails: 'companyDetailsJson',
  signatories: 'signatoriesJson',
  connectBusinessBank: 'businessBankConnectionJson',
  businessFinancials: 'businessFinancialsJson',
  businessOutgoings: 'businessOutgoingsJson',
  businessCreditDeclarations: 'businessCreditDeclarationsJson',
};

type FieldType = 'text' | 'number' | 'date' | 'checkbox';
interface FieldDef { key: string; labelKey: string; type: FieldType; }

/** Explicit field lists per section, mirroring the real customer wizard's labels/fields exactly —
 * so a Banker always sees the same labeled fields a customer would, blank or not, instead of a
 * generic dump of whatever keys happen to exist in the JSON so far. The personalDetails/
 * companyDetails sections also carry the assisted-by-staff trio, handled separately below (its
 * own branch/staff-name dropdown UI) rather than as a generic field here. Section keys with
 * nested/array data (signatories, previousAddresses, applicant2, uploaded files, bank-connection
 * summary) aren't listed — they fall back to the raw-JSON editor for whatever doesn't fit. */
const SECTION_FIELDS: Record<string, FieldDef[]> = {
  loanRequirements: [
    { key: 'loanAmount', labelKey: 'loanReq.amountLabel', type: 'number' },
    { key: 'loanPurpose', labelKey: 'loanReq.purposeLabel', type: 'text' },
    { key: 'loanTerm', labelKey: 'loanReq.termLabel', type: 'number' },
    { key: 'numberOfApplicants', labelKey: 'loanReq.numberOfApplicantsLabel', type: 'number' },
  ],
  consentManagement: [
    { key: 'creditBureauConsent', labelKey: 'consent.creditBureauText', type: 'checkbox' },
    { key: 'pepScreeningConsent', labelKey: 'consent.pepText', type: 'checkbox' },
    { key: 'sanctionsScreeningConsent', labelKey: 'consent.sanctionsText', type: 'checkbox' },
    { key: 'dataProcessingConsent', labelKey: 'consent.dataProcessingText', type: 'checkbox' },
  ],
  personalDetails: [
    { key: 'firstName', labelKey: 'personal.firstNameLabel', type: 'text' },
    { key: 'lastName', labelKey: 'personal.lastNameLabel', type: 'text' },
    { key: 'dateOfBirth', labelKey: 'personal.dobLabel', type: 'date' },
    { key: 'nationalId', labelKey: 'personal.nationalIdLabel', type: 'text' },
    { key: 'idIssueDate', labelKey: 'personal.idIssueDateLabel', type: 'date' },
    { key: 'nationality', labelKey: 'personal.nationalityLabel', type: 'text' },
    { key: 'maritalStatus', labelKey: 'personal.maritalStatusLabel', type: 'text' },
    { key: 'dependents', labelKey: 'personal.dependentsLabel', type: 'number' },
    { key: 'phoneNumber', labelKey: 'personal.phoneLabel', type: 'text' },
    { key: 'email', labelKey: 'personal.emailLabel', type: 'text' },
    { key: 'street', labelKey: 'personal.streetLabel', type: 'text' },
    { key: 'city', labelKey: 'personal.cityLabel', type: 'text' },
    { key: 'postCode', labelKey: 'personal.postCodeLabel', type: 'text' },
    { key: 'country', labelKey: 'personal.countryLabel', type: 'text' },
    { key: 'monthsAtCurrentAddress', labelKey: 'personal.monthsAtAddressLabel', type: 'number' },
  ],
  connectBank: [
    { key: 'connected', labelKey: 'banker.connectedLabel', type: 'checkbox' },
    { key: 'bankId', labelKey: 'banker.bankIdLabel', type: 'text' },
    { key: 'bankName', labelKey: 'banker.bankNameFieldLabel', type: 'text' },
  ],
  incomeEmployment: [
    { key: 'employmentStatus', labelKey: 'income.statusLabel', type: 'text' },
    { key: 'employer', labelKey: 'income.employerLabel', type: 'text' },
    { key: 'jobTitle', labelKey: 'income.jobTitleLabel', type: 'text' },
    { key: 'employmentDuration', labelKey: 'income.durationLabel', type: 'text' },
    { key: 'monthlyGrossIncome', labelKey: 'income.grossIncomeLabel', type: 'number' },
    { key: 'monthlyNetIncome', labelKey: 'income.netIncomeLabel', type: 'number' },
    { key: 'otherIncome', labelKey: 'income.otherIncomeLabel', type: 'number' },
  ],
  outgoings: [
    { key: 'monthlyRent', labelKey: 'outgoings.rentLabel', type: 'number' },
    { key: 'monthlyMortgage', labelKey: 'outgoings.mortgageLabel', type: 'number' },
    { key: 'monthlyLoans', labelKey: 'outgoings.loansLabel', type: 'number' },
    { key: 'creditCardPayments', labelKey: 'outgoings.creditCardLabel', type: 'number' },
    { key: 'otherMonthlyCommitments', labelKey: 'outgoings.otherLabel', type: 'number' },
    { key: 'monthlyLivingExpenses', labelKey: 'outgoings.livingLabel', type: 'number' },
  ],
  creditDeclarations: [
    { key: 'hasDefaulted', labelKey: 'credit.defaultQuestion', type: 'checkbox' },
    { key: 'hasBankruptcy', labelKey: 'credit.bankruptcyQuestion', type: 'checkbox' },
    { key: 'hasCCJ', labelKey: 'credit.ccjQuestion', type: 'checkbox' },
    { key: 'hasPaymentPlan', labelKey: 'credit.paymentPlanQuestion', type: 'checkbox' },
    { key: 'creditScore', labelKey: 'credit.demoScoreTitle', type: 'number' },
  ],
  verifyId: [
    { key: 'idVerified', labelKey: 'verifyId.title', type: 'checkbox' },
  ],
  directDebit: [
    { key: 'accountHolderName', labelKey: 'directDebit.accountHolderLabel', type: 'text' },
    { key: 'bankName', labelKey: 'directDebit.bankNameLabel', type: 'text' },
    { key: 'accountNumber', labelKey: 'directDebit.accountNumberLabel', type: 'text' },
    { key: 'branchCode', labelKey: 'directDebit.branchCodeLabel', type: 'text' },
    { key: 'preferredRepaymentDay', labelKey: 'loanReq.repaymentDayLabel', type: 'number' },
    { key: 'confirmAuthorisation', labelKey: 'directDebit.authConsent', type: 'checkbox' },
  ],
  companyDetails: [
    { key: 'companyName', labelKey: 'register.companyNameLabel', type: 'text' },
    { key: 'companyRegistrationNumber', labelKey: 'register.companyRegNumberLabel', type: 'text' },
    { key: 'industry', labelKey: 'register.companyIndustryLabel', type: 'text' },
    { key: 'yearFounded', labelKey: 'register.companyFoundedYearLabel', type: 'number' },
    { key: 'street', labelKey: 'personal.streetLabel', type: 'text' },
    { key: 'city', labelKey: 'personal.cityLabel', type: 'text' },
    { key: 'postCode', labelKey: 'register.postCodeLabel', type: 'text' },
    { key: 'country', labelKey: 'personal.countryLabel', type: 'text' },
    { key: 'loanAmount', labelKey: 'loanReq.amountLabel', type: 'number' },
    { key: 'loanPurpose', labelKey: 'loanReq.purposeLabel', type: 'text' },
    { key: 'loanTerm', labelKey: 'loanReq.termLabel', type: 'number' },
  ],
  connectBusinessBank: [
    { key: 'connected', labelKey: 'banker.connectedLabel', type: 'checkbox' },
    { key: 'bankId', labelKey: 'banker.bankIdLabel', type: 'text' },
    { key: 'bankName', labelKey: 'banker.bankNameFieldLabel', type: 'text' },
  ],
  businessFinancials: [
    { key: 'annualTurnover', labelKey: 'company.annualTurnoverLabel', type: 'number' },
    { key: 'monthlyRevenue', labelKey: 'company.monthlyRevenueLabel', type: 'number' },
    { key: 'netProfitMargin', labelKey: 'company.netProfitMarginLabel', type: 'number' },
    { key: 'yearsTrading', labelKey: 'company.yearsTradingLabel', type: 'number' },
    { key: 'employeeCount', labelKey: 'company.employeeCountLabel', type: 'number' },
  ],
  businessOutgoings: [
    { key: 'existingBusinessDebtService', labelKey: 'company.existingDebtServiceLabel', type: 'number' },
    { key: 'monthlyLeaseRent', labelKey: 'company.leaseRentLabel', type: 'number' },
    { key: 'monthlyPayroll', labelKey: 'company.payrollLabel', type: 'number' },
    { key: 'monthlySupplierPayments', labelKey: 'company.supplierPaymentsLabel', type: 'number' },
  ],
  businessCreditDeclarations: [
    { key: 'hasLiquidationOrWindingUp', labelKey: 'company.liquidationQuestion', type: 'checkbox' },
    { key: 'hasCompanyDefaulted', labelKey: 'company.companyDefaultQuestion', type: 'checkbox' },
    { key: 'hasCCJ', labelKey: 'company.ccjQuestion', type: 'checkbox' },
    { key: 'directorCreditScore', labelKey: 'company.demoScoreTitle', type: 'number' },
  ],
};

/** directDebit on the business journey uses bankCode (paired with a fixed bank registry), unlike
 * personal directDebit's free-text bankName — needs its own field list. */
const BUSINESS_DIRECT_DEBIT_FIELDS: FieldDef[] = [
  { key: 'accountHolderName', labelKey: 'directDebit.accountHolderLabel', type: 'text' },
  { key: 'bankCode', labelKey: 'directDebit.bankNameLabel', type: 'text' },
  { key: 'accountNumber', labelKey: 'directDebit.accountNumberLabel', type: 'text' },
  { key: 'branchCode', labelKey: 'directDebit.branchCodeLabel', type: 'text' },
  { key: 'preferredRepaymentDay', labelKey: 'loanReq.repaymentDayLabel', type: 'number' },
  { key: 'confirmAuthorisation', labelKey: 'directDebit.authConsent', type: 'checkbox' },
];

/** The assisted-by-staff trio gets its own hand-built branch/staff-name dropdown UI (see
 * personal-details.component.ts / company-details.component.ts) instead of going through the
 * field list above. */
const ASSIST_KEYS = ['assistedByStaff', 'preferredBranch', 'staffName'];

@Component({
  selector: 'app-banker-case-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './banker-case-detail.component.html',
  styleUrl: './banker-case-detail.component.scss'
})
export class BankerCaseDetailComponent implements OnInit {
  application = signal<LoanApplication | null>(null);
  notes = signal<UnderwritingNote[]>([]);
  loading = signal(true);
  error = signal('');
  appRef = '';

  branches = DIGIBANK_BRANCHES;

  editingSection = signal<string | null>(null);
  savingEdit = signal(false);
  editBuffer: any = {};
  complexBuffer: Record<string, string> = {};
  complexError = signal('');

  noteText = '';
  noteType: 'NOTE' | 'CLARIFICATION_REQUEST' | 'DOCUMENT_REQUEST' = 'NOTE';

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
  ];

  constructor(
    private route: ActivatedRoute,
    private appSvc: ApplicationService,
    private auth: AuthService,
    public i18n: I18nService
  ) {}

  ngOnInit(): void {
    this.appRef = this.route.snapshot.paramMap.get('appRef') || '';
    this.load();
  }

  private load(): void {
    this.appSvc.getApplication(this.appRef).subscribe({
      next: app => { this.application.set(app); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.appSvc.getNotes(this.appRef).subscribe({ next: n => this.notes.set(n) });
  }

  get isBusiness(): boolean {
    return this.application()?.applicationType === 'BUSINESS';
  }

  get sections() {
    return this.isBusiness ? this.businessSections : this.personalSections;
  }

  get applicantName(): string {
    const app = this.application();
    if (!app) return '';
    if (this.isBusiness) {
      const c = this.parseSection(app.companyDetailsJson);
      return c.companyName || app.customerEmail;
    }
    const p = this.parseSection(app.personalDetailsJson);
    return `${p.firstName || ''} ${p.lastName || ''}`.trim() || app.customerEmail;
  }

  statusLabel(status: string): string {
    return this.i18n.t('status.' + status);
  }

  parseSection(json: string | null | undefined): any {
    if (!json) return {};
    try { return JSON.parse(json); } catch { return {}; }
  }

  sectionData(sectionKey: string): any {
    const field = SECTION_FIELD_MAP[sectionKey];
    if (!field) return {};
    return this.parseSection(this.application()?.[field] as string | null | undefined);
  }

  hasAssistFields(sectionKey: string): boolean {
    return sectionKey === 'personalDetails' || sectionKey === 'companyDetails';
  }

  /** Business directDebit uses bankCode instead of personal's bankName — same section key,
   * different shape, so pick the field list based on application type. */
  fieldsFor(sectionKey: string): FieldDef[] {
    if (sectionKey === 'directDebit' && this.isBusiness) return BUSINESS_DIRECT_DEBIT_FIELDS;
    return SECTION_FIELDS[sectionKey] || [];
  }

  displayValue(value: any): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return this.i18n.t(value ? 'common.yes' : 'common.no');
    return String(value);
  }

  /** Keys present in the actual data but not covered by fieldsFor()/the assist trio — nested
   * objects/arrays (previousAddresses, applicant2, signatories, summary, files) fall back to a
   * raw-JSON editor rather than being silently dropped. */
  complexKeys(sectionKey: string, obj: any): string[] {
    const known = new Set([...this.fieldsFor(sectionKey).map(f => f.key), ...(this.hasAssistFields(sectionKey) ? ASSIST_KEYS : [])]);
    return Object.keys(obj || {}).filter(k => !known.has(k) && obj[k] !== null && typeof obj[k] === 'object');
  }

  staffOptionsForBranch(): string[] {
    return DIGIBANK_BRANCH_STAFF[this.editBuffer.preferredBranch] || [];
  }

  onAssistBranchChange(): void {
    if (!this.staffOptionsForBranch().includes(this.editBuffer.staffName)) {
      this.editBuffer.staffName = '';
    }
  }

  isEditing(section: string): boolean {
    return this.editingSection() === section;
  }

  private defaultFor(type: FieldType): any {
    return type === 'checkbox' ? false : '';
  }

  startEdit(section: string): void {
    const data = this.sectionData(section);
    this.editingSection.set(section);
    this.editBuffer = JSON.parse(JSON.stringify(data));
    for (const f of this.fieldsFor(section)) {
      if (this.editBuffer[f.key] === undefined) this.editBuffer[f.key] = this.defaultFor(f.type);
    }
    if (this.hasAssistFields(section)) {
      if (this.editBuffer.assistedByStaff === undefined) this.editBuffer.assistedByStaff = false;
      if (this.editBuffer.preferredBranch === undefined) this.editBuffer.preferredBranch = '';
      if (this.editBuffer.staffName === undefined) this.editBuffer.staffName = '';
    }
    this.complexBuffer = {};
    this.complexError.set('');
    for (const key of this.complexKeys(section, data)) {
      this.complexBuffer[key] = JSON.stringify(data[key], null, 2);
    }
  }

  cancelEdit(): void {
    this.editingSection.set(null);
    this.editBuffer = {};
    this.complexBuffer = {};
    this.complexError.set('');
  }

  saveEdit(section: string): void {
    this.complexError.set('');
    for (const key of Object.keys(this.complexBuffer)) {
      try {
        this.editBuffer[key] = JSON.parse(this.complexBuffer[key]);
      } catch {
        this.complexError.set(this.i18n.t('banker.errInvalidJson') + ` (${key})`);
        return;
      }
    }
    this.savingEdit.set(true);
    this.appSvc.saveSectionByUnderwriter(this.appRef, section, this.editBuffer, this.auth.userFullName || 'Banker').subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.editingSection.set(null);
        this.editBuffer = {};
        this.complexBuffer = {};
        this.load();
      },
      error: () => { this.savingEdit.set(false); this.error.set(this.i18n.t('banker.errSaveSection')); }
    });
  }

  notesFor(sectionKey: string): UnderwritingNote[] {
    return this.notes().filter(n => n.section === sectionKey);
  }

  addNote(): void {
    if (!this.noteText.trim()) return;
    this.appSvc.addNote(this.appRef, 'general', this.noteText.trim(), this.noteType, this.auth.userFullName || 'Banker').subscribe({
      next: note => { this.notes.update(n => [note, ...n]); this.noteText = ''; },
      error: () => this.error.set(this.i18n.t('banker.errSaveNote'))
    });
  }
}
