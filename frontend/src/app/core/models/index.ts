export interface AuthResponse {
  token: string;
  tokenType: string;
  userId: number;
  email: string;
  fullName: string;
  phoneNumber?: string;
  role: string;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
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

export interface LoginRequest {
  email: string;
  password: string;
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
}

export interface PersonalDetails {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationalId: string;
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
