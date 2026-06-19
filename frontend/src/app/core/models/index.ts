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
}

export interface RegisterRequest {
  email: string;
  nationalId: string;
  idIssueDate: string;
  fullName: string;
  phoneNumber?: string;
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

export const LOAN_PURPOSES = [
  'Home Improvement', 'Debt Consolidation', 'Vehicle Purchase',
  'Education', 'Medical Expenses', 'Wedding', 'Travel',
  'Business', 'Other'
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
