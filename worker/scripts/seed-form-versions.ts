/**
 * Generates the day-one form_versions seed: one PUBLISHED v1 row per formKey, encoding exactly
 * what's hardcoded today (ALL_SECTIONS/BUSINESS_SECTIONS in lib/sections.ts, the field lists in
 * lib/section-schemas.ts, and the real labels in frontend/src/app/core/i18n/en.ts) — a faithful
 * snapshot, not a redesign, so behavior is unchanged on ship day. Run with:
 *   npx tsx scripts/seed-form-versions.ts > seed-form-versions.sql
 * then apply with:
 *   npx wrangler d1 execute digibank --local  --file=./seed-form-versions.sql
 *   npx wrangler d1 execute digibank --remote --file=./seed-form-versions.sql
 *
 * personal-loan-wizard below is fully fleshed out at field level (labels verified against en.ts
 * directly this session). business-loan-wizard is intentionally left at section/header level only
 * — its field-level copy hasn't been verified against en.ts yet, and per this project's own rule
 * (never invent form copy), guessing at business-journey field labels here would be exactly the
 * mistake that rule exists to prevent. Fill in businessSections' field arrays in a follow-up pass
 * once that copy has been pulled from source, the same way personal-loan-wizard's was.
 */

import type { FormVersionSchema, FormField, FormSectionHeader } from "../src/lib/form-schema-types";

function sqlStr(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

function existing(key: string, sectionHeaderKey: string, labelKey: string, order: number, required = true, extra: Partial<FormField> = {}): FormField {
  return { key, sectionHeaderKey, kind: "existing", labelKey, required, order, ...extra };
}

function header(key: string, labelKey: string, order: number): FormSectionHeader {
  return { key, labelKey, order };
}

// --- personal-loan-wizard ---------------------------------------------------

const personalSections: FormVersionSchema["sections"] = [
  {
    key: "loanRequirements",
    order: 1,
    sideMenuLabelKey: "steps.loanRequirements",
    sectionHeaders: [header("details", "loanReq.title", 1)],
    fields: [
      existing("loanAmount", "details", "loanReq.amountLabel", 1, true, { validation: { min: 5000, max: 300000 } }),
      existing("loanPurpose", "details", "loanReq.purposeLabel", 2),
      existing("loanTerm", "details", "loanReq.termLabel", 3, true, { validation: { min: 6, max: 84 } }),
      existing("numberOfApplicants", "details", "loanReq.numberOfApplicantsLabel", 4),
    ],
  },
  {
    key: "personalDetails",
    order: 2,
    sideMenuLabelKey: "steps.personalDetails",
    sectionHeaders: [
      header("identityInformation", "personal.identityHeader", 1),
      header("currentAddress", "personal.addressHeader", 2),
      header("branchAssistance", "personal.staffAssistHeader", 3),
    ],
    fields: [
      existing("firstName", "identityInformation", "personal.firstNameLabel", 1),
      existing("lastName", "identityInformation", "personal.lastNameLabel", 2),
      existing("dateOfBirth", "identityInformation", "personal.dobLabel", 3),
      existing("nationalId", "identityInformation", "personal.nationalIdLabel", 4),
      existing("idIssueDate", "identityInformation", "personal.idIssueDateLabel", 5),
      existing("nationality", "identityInformation", "personal.nationalityLabel", 6),
      existing("maritalStatus", "identityInformation", "personal.maritalStatusLabel", 7),
      existing("dependents", "identityInformation", "personal.dependentsLabel", 8, true, { validation: { min: 0, max: 20 } }),
      existing("phoneNumber", "identityInformation", "personal.phoneLabel", 9, false),
      existing("email", "identityInformation", "personal.emailLabel", 10, false),
      existing("street", "currentAddress", "personal.streetLabel", 1),
      existing("city", "currentAddress", "personal.cityLabel", 2),
      existing("postCode", "currentAddress", "personal.postCodeLabel", 3),
      existing("country", "currentAddress", "personal.countryLabel", 4),
      existing("monthsAtCurrentAddress", "currentAddress", "personal.monthsAtAddressLabel", 5, false),
      existing("assistedByStaff", "branchAssistance", "personal.assistedByStaffQuestion", 1, false),
      existing("preferredBranch", "branchAssistance", "personal.preferredBranchLabel", 2, false, {
        visibility: { fieldKey: "assistedByStaff", op: "equals", value: true },
      }),
      existing("staffName", "branchAssistance", "personal.staffNameLabel", 3, false, {
        visibility: { fieldKey: "assistedByStaff", op: "equals", value: true },
      }),
    ],
  },
  {
    key: "guarantorDetails",
    order: 3,
    sideMenuLabelKey: "guarantor.title",
    sectionHeaders: [header("guarantor", "guarantor.detailsHeader", 1)],
    fields: [], // Underwriter-triggered only, skipped by default — see sections.ts's isSectionFilled. Field-level detail not yet seeded.
  },
  {
    key: "connectBank",
    order: 4,
    sideMenuLabelKey: "steps.connectBank",
    sectionHeaders: [header("connect", "connectBank.title", 1)],
    fields: [], // Simulated Open Banking flow — bespoke UI (bank picker, connecting state, account summary), not a plain field list.
  },
  {
    key: "incomeEmployment",
    order: 5,
    sideMenuLabelKey: "steps.incomeEmployment",
    sectionHeaders: [
      header("employment1", "income.employmentHeader", 1),
      header("monthlyIncome", "income.monthlyIncomeHeader", 2),
    ],
    fields: [
      existing("employmentStatus", "employment1", "income.statusLabel", 1),
      existing("employer", "employment1", "income.employerLabel", 2, false),
      existing("jobTitle", "employment1", "income.jobTitleLabel", 3, false),
      existing("employmentDuration", "employment1", "income.durationLabel", 4, false),
      existing("monthlyGrossIncome", "monthlyIncome", "income.grossIncomeLabel", 1),
      existing("monthlyNetIncome", "monthlyIncome", "income.netIncomeLabel", 2),
      existing("otherIncome", "monthlyIncome", "income.otherIncomeLabel", 3, false),
    ],
  },
  {
    key: "outgoings",
    order: 6,
    sideMenuLabelKey: "steps.outgoings",
    sectionHeaders: [
      header("housing", "outgoings.housingHeader", 1),
      header("debt", "outgoings.debtHeader", 2),
      header("living", "outgoings.livingHeader", 3),
    ],
    fields: [
      existing("monthlyRent", "housing", "outgoings.rentLabel", 1),
      existing("monthlyMortgage", "housing", "outgoings.mortgageLabel", 2),
      existing("monthlyLoans", "debt", "outgoings.loansLabel", 1),
      existing("creditCardPayments", "debt", "outgoings.creditCardLabel", 2),
      existing("otherMonthlyCommitments", "debt", "outgoings.otherLabel", 3, false),
      existing("monthlyLivingExpenses", "living", "outgoings.livingLabel", 1, false),
    ],
  },
  {
    key: "creditDeclarations",
    order: 7,
    sideMenuLabelKey: "steps.creditDeclarations",
    sectionHeaders: [header("history", "credit.historyHeader", 1)],
    fields: [
      existing("hasDefaulted", "history", "credit.defaultTitle", 1),
      existing("hasBankruptcy", "history", "credit.bankruptcyTitle", 2),
      existing("hasCCJ", "history", "credit.ccjTitle", 3),
      existing("hasPaymentPlan", "history", "credit.paymentPlanTitle", 4),
    ],
  },
  {
    key: "verifyId",
    order: 8,
    sideMenuLabelKey: "steps.verifyId",
    sectionHeaders: [header("upload", "verifyId.title", 1)],
    fields: [], // Drag-and-drop document upload, not a plain field list.
  },
  {
    key: "directDebit",
    order: 9,
    sideMenuLabelKey: "steps.directDebit",
    sectionHeaders: [header("account", "directDebit.accountHeader", 1)],
    fields: [
      existing("accountHolderName", "account", "directDebit.accountHolderLabel", 1),
      existing("bankCode", "account", "directDebit.bankNameLabel", 2),
      existing("branchCode", "account", "directDebit.branchCodeLabel", 3),
      existing("accountNumber", "account", "directDebit.accountNumberLabel", 4),
    ],
  },
  {
    key: "reviewSubmit",
    order: 10,
    sideMenuLabelKey: "steps.reviewSubmit",
    sectionHeaders: [header("declaration", "reviewSubmit.declarationHeader", 1)],
    fields: [
      existing("agreedToTerms", "declaration", "reviewSubmit.confirmAccurate", 1),
      existing("agreedToPrivacy", "declaration", "reviewSubmit.agreeTermsPrefix", 2),
      existing("agreedToCredit", "declaration", "reviewSubmit.consentCreditSearch", 3),
      existing("signature", "declaration", "reviewSubmit.signatureLabel", 4),
    ],
  },
];

// --- business-loan-wizard (coarse — see file header) ------------------------

const businessSections: FormVersionSchema["sections"] = [
  { key: "companyDetails", order: 1, sideMenuLabelKey: "steps.loanRequirements", sectionHeaders: [], fields: [] },
  { key: "signatories", order: 2, sideMenuLabelKey: "steps.personalDetails", sectionHeaders: [], fields: [] },
  { key: "guarantorDetails", order: 3, sideMenuLabelKey: "guarantor.title", sectionHeaders: [], fields: [] },
  { key: "connectBusinessBank", order: 4, sideMenuLabelKey: "steps.connectBank", sectionHeaders: [], fields: [] },
  { key: "businessFinancials", order: 5, sideMenuLabelKey: "steps.incomeEmployment", sectionHeaders: [], fields: [] },
  { key: "businessOutgoings", order: 6, sideMenuLabelKey: "steps.outgoings", sectionHeaders: [], fields: [] },
  { key: "businessCreditDeclarations", order: 7, sideMenuLabelKey: "steps.creditDeclarations", sectionHeaders: [], fields: [] },
  { key: "verifyId", order: 8, sideMenuLabelKey: "steps.verifyId", sectionHeaders: [], fields: [] },
  { key: "directDebit", order: 9, sideMenuLabelKey: "steps.directDebit", sectionHeaders: [], fields: [] },
  { key: "reviewSubmit", order: 10, sideMenuLabelKey: "steps.reviewSubmit", sectionHeaders: [], fields: [] },
];

const lines: string[] = [];
lines.push("-- Generated by scripts/seed-form-versions.ts — do not edit by hand, edit the script instead.");

const now = new Date().toISOString();
const forms: { formKey: string; sections: FormVersionSchema["sections"] }[] = [
  { formKey: "personal-loan-wizard", sections: personalSections },
  { formKey: "business-loan-wizard", sections: businessSections },
];

for (const { formKey, sections } of forms) {
  const schemaJson = JSON.stringify({ sections } satisfies FormVersionSchema);
  lines.push(
    `INSERT INTO form_versions (form_key, version, status, schema_json, change_note, created_at, created_by, published_at, published_by)
     SELECT ${sqlStr(formKey)}, 1, 'PUBLISHED', ${sqlStr(schemaJson)}, 'Initial version — encodes the existing hardcoded wizard as-is.', '${now}', 'seed-script', '${now}', 'seed-script'
     WHERE NOT EXISTS (SELECT 1 FROM form_versions WHERE form_key = ${sqlStr(formKey)});`
  );
}

console.log(lines.join("\n\n"));
