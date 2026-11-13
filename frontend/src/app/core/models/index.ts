export interface AuthResponse {
  token: string;
  tokenType: string;
  userId: number;
  email: string;
  nationalId: string;
  idIssueDate: string;
  fullName: string;
  phoneNumber?: string;
  role: string;
  /** Admin-configured display name of a staff role (null for customers). */
  roleLabel?: string | null;
  /** Entitlement keys the role holds - UI gating only; the server enforces every one itself. */
  entitlements?: string[];
  scope?: 'ALL' | 'UNIT_TREE' | 'UNIT_ONLY';
  expiresIn: number;
  companyName?: string;
  companyRegistrationNumber?: string;
  companyIndustry?: string;
  companyFoundedYear?: number;
  previousLogin?: string | null;
}

export interface RegisterRequest {
  email: string;
  nationalId: string;
  idIssueDate: string;
  fullName: string;
  phoneNumber?: string;
  accountType?: 'PERSONAL' | 'BUSINESS';
  companyName?: string;
  companyRegistrationNumber?: string;
  companyIndustry?: string;
  companyFoundedYear?: number;
}

export interface CustomerProfileResponse {
  id: number;
  email: string;
  nationalId: string;
  idIssueDate: string;
  fullName: string;
  phoneNumber?: string;
  companyName?: string;
  companyRegistrationNumber?: string;
  companyIndustry?: string;
  companyFoundedYear?: number;
}

export interface RegisterInitiatedResponse {
  email: string;
  // Demo-only: in production this would be sent via SMS/email, not returned in the API response.
  demoOtp: string;
  otpExpiresInSeconds: number;
}

export interface OtpVerifyRequest {
  email: string;
  otp: string;
}

export interface LoginOtpRequest {
  nationalId: string;
}

export interface LoginVerifyRequest {
  nationalId: string;
  otp: string;
}

export interface LoginOtpInitiatedResponse {
  nationalId: string;
  // Demo-only: in production this would be sent via SMS, not returned in the API response.
  demoOtp: string;
  otpExpiresInSeconds: number;
}

/** Stage, owner and SLA clock of a case, from the workflow definition. */
export interface CaseWorkflowInfo {
  track: string; status: string; stage: string | null; stageLabel: { en: string; he: string } | null; enteredAt: string;
  assigneeUserId: number | null; assigneeName: string | null; assignedAt: string | null;
  sla: { state: 'NONE' | 'GREEN' | 'AMBER' | 'RED'; hours: number | null; dueAt: string | null; percentUsed: number | null };
}

export interface LoanApplication {
  workflow?: CaseWorkflowInfo | null;
  id: number;
  applicationRef: string;
  customerId: number;
  customerEmail: string;
  status: ApplicationStatus;
  currentSection: string;
  completionPercentage: number;
  applicationType?: 'PERSONAL' | 'BUSINESS';
  loanRequirementsJson?: string;
  consentManagementJson?: string;
  personalDetailsJson?: string;
  bankConnectionJson?: string;
  incomeEmploymentJson?: string;
  outgoingsJson?: string;
  creditDeclarationsJson?: string;
  verifyIdJson?: string;
  directDebitJson?: string;
  reviewSubmitJson?: string;
  selectedProductJson?: string;
  affordabilityResultJson?: string;
  dataVerificationJson?: string;
  companyDetailsJson?: string;
  signatoriesJson?: string;
  businessBankConnectionJson?: string;
  businessFinancialsJson?: string;
  businessOutgoingsJson?: string;
  businessCreditDeclarationsJson?: string;
  businessFinancialsAnalysisJson?: string;
  guarantorRequired?: boolean;
  guarantorDetailsJson?: string;
  disbursementStatus?: DisbursementStatus;
  approvedAmount?: number;
  autoApproved?: boolean;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  formVersionId?: number | null;
  // Added by GET /:appRef and GET /customer/:customerId/current only (lib/form-versions.ts's
  // withResolvedFormVersion) — the resolved Admin Form Builder version and which already-filled
  // sections are missing a newly-required custom field. Absent on responses from every other
  // endpoint (e.g. a mutation's own `.returning()` row), so always guard with `?.`/`??`.
  resolvedFormVersion?: { id: number; version: number; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' } | null;
  formSchema?: import('../services/form-builder.service').FormVersionSchema | null;
  needsAttentionSections?: string[];
}

export type ApplicationStatus =
  | 'DRAFT' | 'IN_PROGRESS' | 'SUBMITTED'
  | 'UNDER_REVIEW' | 'CONDITIONALLY_APPROVED' | 'REFERRED_TO_SENIOR'
  | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';

export type DisbursementStatus = 'SECOND_CHECK_PENDING' | 'FUNDS_RELEASED';

export type DataVerificationStatus = 'GREEN' | 'AMBER' | 'RED';
export type DataVerificationAction = 'SEND_BACK' | 'APPROVE_EXCEPTION' | 'CALL_STAFF' | 'CALL_CUSTOMER';

export interface DataVerificationResolution {
  action: DataVerificationAction;
  note?: string;
  reviewedBy: string;
  resolvedAt: string;
}

export interface DataVerificationRule {
  ruleKey: string;
  section: string;
  applicationValue: string;
  documentValue?: string;
  thirdPartyValue?: string;
  status: DataVerificationStatus;
  resolution?: DataVerificationResolution;
}

export interface DataVerificationSummary {
  generatedAt: string;
  seed: string;
  rules: DataVerificationRule[];
}

export interface BusinessFinancialsAnalysis {
  generatedAt: string;
  seed: string;
  riskGrade: string;
  dscr?: number;
  profitAndLoss: {
    annualRevenue: number;
    costOfGoodsSold: number;
    grossProfit: number;
    operatingExpenses: number;
    ebitda: number;
    netProfit: number;
  };
  cashFlow: {
    operatingCashFlow: number;
    investingCashFlow: number;
    financingCashFlow: number;
    netCashFlow: number;
    closingCashBalance: number;
  };
  ratios: {
    currentRatio: number;
    quickRatio: number;
    debtToEquityRatio: number;
    netProfitMarginPct: number;
  };
}

export interface UnderwritingNote {
  id: number;
  applicationRef: string;
  section: string;
  note: string;
  noteType: string;
  createdBy: string;
  createdAt: string;
}

/** Backs the staff Home dashboard's Action Items / Recent Notifications panels — an
 * underwriting note enriched with just enough of its parent application to display and link to
 * it, without shipping the full application JSON blobs over the wire. */
export interface StaffActivityItem {
  id: number;
  applicationRef: string;
  applicationType: string;
  customerEmail: string;
  personalDetailsJson: string | null;
  companyDetailsJson: string | null;
  applicationStatus: string;
  section: string;
  noteType: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface LoanRequirements {
  loanAmount: number;
  loanPurpose: string;
  loanTerm: number;
  preferredRepaymentDay: number;
}

export interface ConsentManagement {
  creditBureauConsent: boolean;
  pepScreeningConsent: boolean;
  sanctionsScreeningConsent: boolean;
  dataProcessingConsent: boolean;
  // Set when consent is recorded; consent is treated as valid in the bank's CMS for 90 days
  // from this timestamp (see PersonalDetailsComponent.checkConsentValidity).
  consentTimestamp?: string;
}

export interface PersonalDetails {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationalId: string;
  idIssueDate?: string;
  nationality: string;
  maritalStatus: string;
  dependents: number;
  phoneNumber?: string;
  email?: string;
  street: string;
  city: string;
  postCode: string;
  country: string;
  monthsAtCurrentAddress?: number;
  previousAddresses?: AddressHistoryEntry[];
  assistedByStaff?: boolean;
  preferredBranch?: string;
  staffName?: string;
}

export interface AddressHistoryEntry {
  street: string;
  city: string;
  postCode: string;
  country: string;
  monthsAtAddress: number;
}

export interface IncomeEmployment {
  employmentStatus: string;
  employer: string;
  jobTitle: string;
  employmentDuration: string;
  monthlyGrossIncome: number;
  monthlyNetIncome: number;
  otherIncome: number;
  employments?: IncomeEmployment[];
}

export interface Outgoings {
  monthlyRent: number;
  monthlyMortgage: number;
  monthlyLoans: number;
  creditCardPayments: number;
  otherMonthlyCommitments: number;
  monthlyLivingExpenses: number;
}

export interface CreditDeclarations {
  hasDefaulted: boolean;
  hasBankruptcy: boolean;
  hasCCJ: boolean;
  hasPaymentPlan: boolean;
  creditScore: number;
}

/** What the signed-in approver may approve on one specific case (their role's mandate, resolved
 * against the case's org unit and type) and which role a referral from them would reach. */
export interface CaseMandate {
  limit: number;
  nextRole: { code: string; label: string } | null;
  /** Label of the role the case is referred to, when that is above the caller (case is locked). */
  lockedTo?: string | null;
}

/** One hop of a case's escalation chain of custody. */
export interface CaseReferral {
  id: number;
  fromRole: string;
  fromName: string;
  toRole: string;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** Only collected when an underwriter has flagged guarantorRequired via Send Back — never asked
 * in the first pass. Shared shape between personal and business journeys. */
export interface GuarantorDetails {
  guarantorName: string;
  guarantorNationalId: string;
  guarantorRelationship: string;
  guarantorPhone: string;
  guarantorEmail: string;
}

export interface CompanyDetails {
  companyName: string;
  companyRegistrationNumber: string;
  industry: string;
  yearFounded: number;
  street: string;
  city: string;
  postCode: string;
  country: string;
  loanAmount: number;
  loanPurpose: string;
  loanTerm: number;
}

export interface Signatory {
  fullName: string;
  nationalId: string;
  title: string;
  ownershipPercentage: number;
  primarySignatory: boolean;
}

export interface BusinessFinancials {
  annualTurnover: number;
  monthlyRevenue: number;
  netProfitMargin: number;
  yearsTrading: number;
  employeeCount: number;
}

export interface BusinessOutgoings {
  existingBusinessDebtService: number;
  monthlyLeaseRent: number;
  monthlyPayroll: number;
  monthlySupplierPayments: number;
}

export interface BusinessCreditDeclarations {
  hasLiquidationOrWindingUp: boolean;
  hasCompanyDefaulted: boolean;
  hasCCJ: boolean;
  directorCreditScore: number;
}

export type AffordabilityFailureType = 'CAPACITY' | 'STRUCTURAL' | 'TERMINAL' | null;

export interface BusinessAffordabilityResult {
  passed: boolean;
  dscr: number;
  monthlyNetOperatingIncome: number;
  monthlyRepaymentCapacity: number;
  calculatedMonthlyRepayment: number;
  failureReasons: string[];
  failureType: AffordabilityFailureType;
  maxAffordableAmount: number | null;
  minAffordableTermMonths: number | null;
  riskCategory: 'LOW' | 'MEDIUM' | 'HIGH';
  creditScoreCategory: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
}

export interface AffordabilityResult {
  passed: boolean;
  dti: number;
  hti: number;
  disposableIncome: number;
  monthlyRepaymentCapacity: number;
  calculatedMonthlyRepayment: number;
  failureReasons: string[];
  failureType: AffordabilityFailureType;
  maxAffordableAmount: number | null;
  minAffordableTermMonths: number | null;
  riskCategory: 'LOW' | 'MEDIUM' | 'HIGH';
  creditScoreCategory: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
}

export interface EligibleProduct {
  productId: string;
  productName: string;
  description?: string;
  interestRate: number;
  minAmount: number;
  maxAmount: number;
  minTermMonths: number;
  maxTermMonths: number;
  minCreditScore: number;
  minMonthlyIncome?: number;
  monthlyRepayment: number;
  totalRepayable: number;
  recommended: boolean;
}

export interface PreApprovedOffer {
  nationalId: string;
  productCode: string;
  productName: string;
  annualInterestRate: number;
  amount: number;
  termMonths: number;
  monthlyRepayment: number;
  totalRepayable: number;
}

/** "What this customer holds with the bank", shown on the dashboard. CURRENT/DEPOSIT are
 * demo-only, deterministically generated (seeded by nationalId) since no core-banking integration
 * exists — see DashboardComponent.buildRelationshipAccounts(). LOAN is real: once an application
 * is disbursed, its outstanding balance is genuinely calculated from the approved amount, product
 * rate/term, and elapsed time since approval — see DashboardComponent.buildLoanAccount(). */
export interface BankRelationshipAccount {
  type: 'CURRENT' | 'DEPOSIT' | 'LOAN';
  accountMasked: string;
  branch: string;
  balance: number;
  customerSinceYear: number;
  interestRate?: number;
  termMonths?: number;
  maturityDate?: string;
  principal?: number;
  monthlyRepayment?: number;
  disbursedDate?: string;
  elapsedMonths?: number;
}

export interface Notification {
  id: string;
  customerId: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  applicationRef?: string;
  createdAt: string;
}

export interface GeneratedDocument {
  id: string;
  applicationRef: string;
  customerId: number;
  documentType: string;
  documentName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  generatedAt: string;
}

export interface UploadedDocument {
  id: string;
  applicationRef: string;
  customerId: number;
  documentType: string;
  originalFilename: string;
  storagePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

// Pick-lists (document types, loan purposes, employment/marital status, nationalities, the bank's
// branches and staff, banks and bank branches) now live in the Masters, not here: see
// core/services/master-lists.service.ts and the Masters admin screen.
