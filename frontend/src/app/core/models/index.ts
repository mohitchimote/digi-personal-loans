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
  expiresIn: number;
  companyName?: string;
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

export interface LoanApplication {
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
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
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

/** Admin-editable approval mandate limits per role in the hierarchy
 * UW -> Senior UW -> Head of Lending -> COO -> CEO. See PROJECT_DOCUMENTATION.md. */
export interface MandateRules {
  underwriterLimit: number;
  seniorUnderwriterLimit: number;
  headOfLendingLimit: number;
  cooLimit: number;
  ceoLimit: number;
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

export interface BusinessAffordabilityResult {
  passed: boolean;
  dscr: number;
  monthlyNetOperatingIncome: number;
  monthlyRepaymentCapacity: number;
  calculatedMonthlyRepayment: number;
  failureReasons: string[];
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
  id: number;
  customerId: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  applicationRef?: string;
  createdAt: string;
}

export interface GeneratedDocument {
  id: number;
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
  id: number;
  applicationRef: string;
  customerId: number;
  documentType: string;
  originalFilename: string;
  storagePath: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
}

export interface RequiredDocType { type: string; labelKey: string; }

export const REQUIRED_DOCUMENT_TYPES: RequiredDocType[] = [
  { type: 'NATIONAL_ID',       labelKey: 'docs.requiredId' },
  { type: 'PAYSLIPS',          labelKey: 'docs.requiredPayslips' },
  { type: 'BANK_STATEMENTS',   labelKey: 'docs.requiredBankStatements' },
  { type: 'PROOF_OF_ADDRESS',  labelKey: 'docs.requiredProofAddress' },
];

export const BUSINESS_REQUIRED_DOCUMENT_TYPES: RequiredDocType[] = [
  { type: 'CERTIFICATE_OF_INCORPORATION', labelKey: 'docs.requiredIncorporation' },
  { type: 'FINANCIAL_STATEMENTS',         labelKey: 'docs.requiredFinancialStatements' },
  { type: 'BUSINESS_BANK_STATEMENTS',     labelKey: 'docs.requiredBusinessBankStatements' },
];

export const LOAN_PURPOSES = [
  'Home Improvement', 'Debt Consolidation', 'Vehicle Purchase',
  'Education', 'Medical Expenses', 'Wedding', 'Travel',
  'Business', 'Other'
];

export const BUSINESS_LOAN_PURPOSES = [
  'Working Capital', 'Equipment Purchase', 'Business Expansion',
  'Inventory Financing', 'Debt Refinancing', 'Commercial Property', 'Other'
];

export const EMPLOYMENT_STATUSES = [
  'Full-Time Employed', 'Part-Time Employed', 'Self-Employed',
  'Contract', 'Retired', 'Student', 'Unemployed'
];

export const MARITAL_STATUSES = [
  'Single', 'Married', 'Divorced', 'Widowed', 'Civil Partnership', 'Separated'
];

export const NATIONALITIES = [
  'Israeli', 'American', 'British', 'French', 'German',
  'Russian', 'Ethiopian', 'Indian', 'Other'
];

// DigiBank's own customer-facing branches (for in-person assistance), distinct from the
// customer's external bank used for direct debit (see ISRAELI_BANKS below).
export const DIGIBANK_BRANCHES = [
  'Tel Aviv - Rothschild Blvd',
  'Jerusalem - Jaffa Road',
  'Haifa - Hadar',
  'Beer Sheva - Old City',
  'Netanya - City Center',
  'Eilat - Tourist Center',
];

// Staff names a customer can pick from once they've selected a branch above, for the
// "assisted by staff" question — static/demo data, not tied to real Banker login accounts.
export const DIGIBANK_BRANCH_STAFF: Record<string, string[]> = {
  'Tel Aviv - Rothschild Blvd': ['Yael Cohen', 'Itai Mor', 'Shira Ben-Ari', 'Omer Katz'],
  'Jerusalem - Jaffa Road': ['Avi Steinberg', 'Noa Friedman', 'Eitan Azulay'],
  'Haifa - Hadar': ['Liat Peretz', 'Ronen Asaf', 'Dana Shapiro', 'Gil Bar-On'],
  'Beer Sheva - Old City': ['Maya Sasson', 'Tomer Halevi', 'Adi Malka'],
  'Netanya - City Center': ['Yossi Amar', 'Keren Tzur', 'Nadav Eliyahu', 'Sigal Dotan'],
  'Eilat - Tourist Center': ['Roni Vaknin', 'Eyal Barkan', 'Hila Marom'],
};

export interface IsraeliBankBranch { code: string; name: string; }
export interface IsraeliBank { code: string; name: string; branches: IsraeliBankBranch[]; }

// Bank codes are the standard Israeli bank-number registry (stable, publicly documented values
// used in account/IBAN details). Branch codes/names below are illustrative demo data only — not
// sourced from a verified live branch directory, so they should never be treated as authoritative.
export const ISRAELI_BANKS: IsraeliBank[] = [
  { code: '10', name: 'Bank Leumi', branches: [
    { code: '800', name: 'Tel Aviv Main' }, { code: '901', name: 'Jerusalem Center' }, { code: '614', name: 'Haifa' },
  ]},
  { code: '12', name: 'Bank Hapoalim', branches: [
    { code: '532', name: 'Tel Aviv Main' }, { code: '744', name: 'Jerusalem Center' }, { code: '627', name: 'Haifa' },
  ]},
  { code: '11', name: 'Discount Bank', branches: [
    { code: '027', name: 'Tel Aviv Main' }, { code: '105', name: 'Jerusalem Center' }, { code: '049', name: 'Netanya' },
  ]},
  { code: '20', name: 'Mizrahi-Tefahot Bank', branches: [
    { code: '457', name: 'Tel Aviv Main' }, { code: '368', name: 'Jerusalem Center' }, { code: '512', name: 'Beer Sheva' },
  ]},
  { code: '13', name: 'Union Bank of Israel (Igud)', branches: [
    { code: '003', name: 'Tel Aviv Main' }, { code: '012', name: 'Ramat Gan' },
  ]},
  { code: '14', name: 'Bank Otsar Ha-Hayal', branches: [
    { code: '101', name: 'Tel Aviv Main' }, { code: '110', name: 'Jerusalem' },
  ]},
  { code: '17', name: 'Mercantile Discount Bank', branches: [
    { code: '007', name: 'Tel Aviv Main' }, { code: '021', name: 'Haifa' },
  ]},
  { code: '31', name: 'First International Bank of Israel', branches: [
    { code: '017', name: 'Tel Aviv Main' }, { code: '033', name: 'Jerusalem Center' },
  ]},
  { code: '34', name: 'Bank Massad', branches: [
    { code: '001', name: 'Jerusalem Main' }, { code: '004', name: 'Tel Aviv' },
  ]},
  { code: '54', name: 'Bank of Jerusalem', branches: [
    { code: '001', name: 'Jerusalem Main' }, { code: '015', name: 'Tel Aviv' },
  ]},
  { code: '4', name: 'Bank Yahav', branches: [
    { code: '001', name: 'Jerusalem Main' }, { code: '008', name: 'Tel Aviv' },
  ]},
  { code: '18', name: 'One Zero Digital Bank', branches: [
    { code: '001', name: 'Digital (No Physical Branch)' },
  ]},
];
