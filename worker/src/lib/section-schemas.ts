import { z } from "zod";

// Per-section payload shapes for PUT /:appRef/section and /:appRef/section-by-underwriter.
//
// Added per the 2026-09 architecture review (Architecture Review Notes.docx, "Field Exposure
// Controls" / "Channel-Specific Validation"): the wizard's save-section endpoint used to accept
// `data: Record<string, unknown>` and store it verbatim — any channel could submit an arbitrary
// JSON blob under any section key. Every schema below is `.strict()` (including nested objects),
// so an unrecognised field anywhere in the payload fails the request instead of being silently
// accepted or silently dropped. Field lists are taken from the Angular step components' actual
// payloads (frontend/src/app/core/models/index.ts is incomplete for several sections — several
// fields it doesn't list, e.g. personalDetails.applicant2, are still real and included here).
//
// This validates shape and reasonable per-field bounds, not full cross-field business rules
// (e.g. net income <= gross income) — those already run client-side for UX and are a separate,
// larger concern from the exposure-control gap this closes.

const addressHistoryEntrySchema = z
  .object({
    street: z.string(),
    city: z.string(),
    postCode: z.string(),
    country: z.string(),
    monthsAtAddress: z.number().optional(),
  })
  .strict();

const applicant2PersonalSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    dateOfBirth: z.string().optional(),
    nationalId: z.string().optional(),
    idIssueDate: z.string().optional(),
    nationality: z.string().optional(),
    maritalStatus: z.string().optional(),
    relationshipToApplicant1: z.string().optional(),
    phoneNumber: z.string().optional(),
    email: z.string().email().optional(),
  })
  .strict();

const loanRequirementsSchema = z
  .object({
    loanAmount: z.number().min(5000).max(300000),
    loanPurpose: z.string(),
    loanTerm: z.number().min(6).max(84),
    numberOfApplicants: z.number(),
  })
  .strict();

const consentManagementSchema = z
  .object({
    creditBureauConsent: z.boolean(),
    pepScreeningConsent: z.boolean(),
    sanctionsScreeningConsent: z.boolean(),
    dataProcessingConsent: z.boolean(),
    consentTimestamp: z.string().optional(),
    consentMethod: z.string().optional(),
  })
  .strict();

const personalDetailsSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    dateOfBirth: z.string(),
    nationalId: z.string(),
    idIssueDate: z.string(),
    nationality: z.string(),
    maritalStatus: z.string(),
    dependents: z.number().min(0),
    phoneNumber: z.string().optional(),
    email: z.string().email().optional(),
    street: z.string(),
    city: z.string(),
    postCode: z.string(),
    country: z.string(),
    monthsAtCurrentAddress: z.number().min(0).optional(),
    previousAddresses: z.array(addressHistoryEntrySchema),
    assistedByStaff: z.boolean().optional(),
    preferredBranch: z.string().optional(),
    staffName: z.string().optional(),
    applicant2: applicant2PersonalSchema.nullable().optional(),
  })
  .strict();

const guarantorDetailsSchema = z
  .object({
    guarantorName: z.string(),
    guarantorNationalId: z.string().regex(/^\d{9}$/),
    guarantorRelationship: z.string(),
    guarantorPhone: z.string(),
    guarantorEmail: z.string().email(),
    files: z.array(z.string()).min(1),
  })
  .strict();

const bankSummarySchema = z
  .object({
    accountMasked: z.string(),
    avgBalance: z.number().nullable(),
    transactions: z.number().nullable(),
  })
  .strict();

const connectedAccountSchema = z
  .object({
    id: z.string(),
    bankName: z.string(),
    accountMasked: z.string(),
    avgBalance: z.number().nullable(),
    transactions: z.number().nullable(),
    manual: z.boolean(),
  })
  .strict();

const connectBankApplicant2Schema = z
  .object({
    connected: z.boolean(),
    bankId: z.string().optional(),
    bankName: z.string().optional(),
    summary: bankSummarySchema.optional(),
    skipped: z.boolean().optional(),
  })
  .strict();

const connectBankSchema = z
  .object({
    connected: z.boolean(),
    bankName: z.string().optional(),
    summary: bankSummarySchema.optional(),
    accounts: z.array(connectedAccountSchema).optional(),
    primaryAccountId: z.string().optional(),
    skipped: z.boolean().optional(),
    applicant2: connectBankApplicant2Schema.nullable().optional(),
  })
  .strict();

const employmentEntrySchema = z
  .object({
    employmentStatus: z.string(),
    employer: z.string().optional(),
    jobTitle: z.string().optional(),
    employmentDuration: z.string().optional(),
    monthlyGrossIncome: z.number().min(0),
    monthlyNetIncome: z.number().min(0),
    otherIncome: z.number(),
  })
  .strict();

const incomeEmploymentApplicant2Schema = z
  .object({
    employmentStatus: z.string(),
    employer: z.string().optional(),
    jobTitle: z.string().optional(),
    employmentDuration: z.string().optional(),
    monthlyGrossIncome: z.number().min(0),
    monthlyNetIncome: z.number().min(0),
    otherIncome: z.number(),
  })
  .strict();

const incomeEmploymentSchema = z
  .object({
    employmentStatus: z.string(),
    employer: z.string().optional(),
    jobTitle: z.string().optional(),
    employmentDuration: z.string().optional(),
    monthlyGrossIncome: z.number().min(0),
    monthlyNetIncome: z.number().min(0),
    otherIncome: z.number(),
    employments: z.array(employmentEntrySchema),
    applicant2: incomeEmploymentApplicant2Schema.nullable().optional(),
  })
  .strict();

const outgoingsSchema = z
  .object({
    monthlyRent: z.number().min(0),
    monthlyMortgage: z.number().min(0),
    monthlyLoans: z.number().min(0),
    creditCardPayments: z.number().min(0),
    otherMonthlyCommitments: z.number().min(0),
    monthlyLivingExpenses: z.number().min(0).optional(),
  })
  .strict();

const creditDeclarationsApplicant2Schema = z
  .object({
    hasDefaulted: z.boolean(),
    hasBankruptcy: z.boolean(),
    hasCCJ: z.boolean(),
    hasPaymentPlan: z.boolean(),
    creditScore: z.number().min(300).max(850),
  })
  .strict();

const creditDeclarationsSchema = z
  .object({
    hasDefaulted: z.boolean(),
    hasBankruptcy: z.boolean(),
    hasCCJ: z.boolean(),
    hasPaymentPlan: z.boolean(),
    creditScore: z.number().min(300).max(850),
    applicant2: creditDeclarationsApplicant2Schema.nullable().optional(),
  })
  .strict();

const verifyIdSchema = z
  .object({
    idVerified: z.literal(true),
    files: z.array(z.string()),
  })
  .strict();

const directDebitSchema = z
  .object({
    accountSource: z.enum(["applicant1", "applicant2", "manual"]).optional(),
    accountHolderName: z.string(),
    bankCode: z.string(),
    branchCode: z.string(),
    accountNumber: z.string(),
    preferredRepaymentDay: z.number().min(1).max(28),
    confirmAuthorisation: z.literal(true),
    bankName: z.string().optional(),
    branchName: z.string().optional(),
  })
  .strict();

const reviewSubmitSchema = z
  .object({
    agreedToTerms: z.literal(true),
    agreedToPrivacyPolicy: z.literal(true),
    electronicSignature: z.string().min(2),
    submittedAt: z.string(),
  })
  .strict();

const companyDetailsSchema = z
  .object({
    companyName: z.string(),
    companyRegistrationNumber: z.string(),
    industry: z.string(),
    yearFounded: z.number(),
    street: z.string(),
    city: z.string(),
    postCode: z.string(),
    country: z.string(),
    loanAmount: z.number().min(20000).max(1000000),
    loanPurpose: z.string(),
    loanTerm: z.number().min(6).max(84),
    assistedByStaff: z.boolean().optional(),
    preferredBranch: z.string().optional(),
    staffName: z.string().optional(),
  })
  .strict();

const signatorySchema = z
  .object({
    fullName: z.string(),
    nationalId: z.string().regex(/^\d{9}$/),
    title: z.string(),
    ownershipPercentage: z.number().min(0).max(100),
    primarySignatory: z.boolean(),
  })
  .strict();

const signatoriesSchema = z
  .object({
    signatories: z.array(signatorySchema).min(1),
  })
  .strict();

const businessBankSummarySchema = z
  .object({
    accountMasked: z.string(),
    avgBalance: z.number(),
    transactions: z.number(),
  })
  .strict();

const connectBusinessBankSchema = z
  .object({
    connected: z.boolean(),
    bankId: z.string().optional(),
    bankName: z.string().optional(),
    summary: businessBankSummarySchema.optional(),
    skipped: z.boolean().optional(),
  })
  .strict();

const businessFinancialsSchema = z
  .object({
    annualTurnover: z.number().min(0),
    monthlyRevenue: z.number().min(0),
    netProfitMargin: z.number().min(0).max(100),
    yearsTrading: z.number().min(0),
    employeeCount: z.number().min(0),
  })
  .strict();

const businessOutgoingsSchema = z
  .object({
    existingBusinessDebtService: z.number().min(0),
    monthlyLeaseRent: z.number().min(0),
    monthlyPayroll: z.number().min(0),
    monthlySupplierPayments: z.number().min(0),
  })
  .strict();

const businessCreditDeclarationsSchema = z
  .object({
    hasLiquidationOrWindingUp: z.boolean(),
    hasCompanyDefaulted: z.boolean(),
    hasCCJ: z.boolean(),
    directorCreditScore: z.number().min(1).max(100),
  })
  .strict();

// Keyed by the same section string used throughout worker/src/lib/sections.ts
// (SECTION_TO_COLUMN) and the Java mirror (WizardService's switch on `section`).
export const SECTION_SCHEMAS: Record<string, z.ZodTypeAny> = {
  loanRequirements: loanRequirementsSchema,
  consentManagement: consentManagementSchema,
  personalDetails: personalDetailsSchema,
  guarantorDetails: guarantorDetailsSchema,
  connectBank: connectBankSchema,
  incomeEmployment: incomeEmploymentSchema,
  outgoings: outgoingsSchema,
  creditDeclarations: creditDeclarationsSchema,
  verifyId: verifyIdSchema,
  directDebit: directDebitSchema,
  reviewSubmit: reviewSubmitSchema,
  companyDetails: companyDetailsSchema,
  signatories: signatoriesSchema,
  connectBusinessBank: connectBusinessBankSchema,
  businessFinancials: businessFinancialsSchema,
  businessOutgoings: businessOutgoingsSchema,
  businessCreditDeclarations: businessCreditDeclarationsSchema,
};

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
}
