export interface AuthResponse {
  token: string;
  tokenType: string;
  userId: number;
  email: string;
  fullName: string;
  role: string;
  expiresIn: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
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
  personalDetailsJson?: string;
  incomeEmploymentJson?: string;
  outgoingsJson?: string;
  creditDeclarationsJson?: string;
  reviewSubmitJson?: string;
  selectedProductJson?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
}

export type ApplicationStatus =
  | 'DRAFT' | 'IN_PROGRESS' | 'SUBMITTED'
  | 'UNDER_REVIEW' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';

export interface LoanRequirements {
  loanAmount: number;
  loanPurpose: string;
  loanTerm: number;
  preferredRepaymentDay: number;
}

export interface PersonalDetails {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationalId: string;
  nationality: string;
  maritalStatus: string;
  dependents: number;
  street: string;
  city: string;
  postCode: string;
  country: string;
}

export interface IncomeEmployment {
  employmentStatus: string;
  employer: string;
  jobTitle: string;
  employmentDuration: string;
  monthlyGrossIncome: number;
  monthlyNetIncome: number;
  otherIncome: number;
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
