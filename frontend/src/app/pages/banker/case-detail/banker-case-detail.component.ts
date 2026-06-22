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

/** The assisted-by-staff trio gets its own hand-built branch/staff-name dropdown UI (see
 * personal-details.component.ts / company-details.component.ts) instead of going through the
 * generic per-key editor below. */
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

  scalarKeys(sectionKey: string, obj: any): string[] {
    const skip = this.hasAssistFields(sectionKey) ? ASSIST_KEYS : [];
    return Object.keys(obj || {}).filter(k => !skip.includes(k) && (obj[k] === null || typeof obj[k] !== 'object'));
  }

  complexKeys(sectionKey: string, obj: any): string[] {
    return Object.keys(obj || {}).filter(k => obj[k] !== null && typeof obj[k] === 'object');
  }

  fieldType(value: any): 'checkbox' | 'number' | 'text' {
    if (typeof value === 'boolean') return 'checkbox';
    if (typeof value === 'number') return 'number';
    return 'text';
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

  startEdit(section: string): void {
    const data = this.sectionData(section);
    this.editingSection.set(section);
    this.editBuffer = JSON.parse(JSON.stringify(data));
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
