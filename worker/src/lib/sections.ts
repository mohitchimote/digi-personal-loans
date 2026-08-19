import type { InferSelectModel } from "drizzle-orm";
import type { loanApplications } from "../db/schema";

type App = InferSelectModel<typeof loanApplications>;

// "guarantorDetails" sits right after personalDetails but is normally skipped — see
// isSectionFilled(), which treats it as filled/skippable unless an underwriter has flagged
// guarantorRequired via sendBackApplication().
export const ALL_SECTIONS = [
  "loanRequirements",
  "personalDetails",
  "guarantorDetails",
  "connectBank",
  "incomeEmployment",
  "outgoings",
  "creditDeclarations",
  "verifyId",
  "directDebit",
  "reviewSubmit",
] as const;

// Business-loan equivalent of ALL_SECTIONS — companyDetails doubles as "loan requirements" for a
// business application. guarantorDetails sits after signatories (the business equivalent of
// personalDetails), same skip-unless-required semantics as the personal list.
export const BUSINESS_SECTIONS = [
  "companyDetails",
  "signatories",
  "guarantorDetails",
  "connectBusinessBank",
  "businessFinancials",
  "businessOutgoings",
  "businessCreditDeclarations",
  "verifyId",
  "directDebit",
  "reviewSubmit",
] as const;

// Sections that must always be visited explicitly, even when pre-filled (e.g. via the
// pre-approved fast-track flow) — personalDetails carries the consent gate, connectBank is where
// the customer confirms/changes the repayment account, reviewSubmit is always last.
const MANDATORY_STOPS = new Set(["personalDetails", "connectBank", "reviewSubmit"]);

const SECTION_TO_COLUMN: Record<string, keyof App> = {
  loanRequirements: "loanRequirementsJson",
  consentManagement: "consentManagementJson",
  personalDetails: "personalDetailsJson",
  connectBank: "bankConnectionJson",
  incomeEmployment: "incomeEmploymentJson",
  outgoings: "outgoingsJson",
  creditDeclarations: "creditDeclarationsJson",
  verifyId: "verifyIdJson",
  directDebit: "directDebitJson",
  reviewSubmit: "reviewSubmitJson",
  guarantorDetails: "guarantorDetailsJson",
  companyDetails: "companyDetailsJson",
  signatories: "signatoriesJson",
  connectBusinessBank: "businessBankConnectionJson",
  businessFinancials: "businessFinancialsJson",
  businessOutgoings: "businessOutgoingsJson",
  businessCreditDeclarations: "businessCreditDeclarationsJson",
};

export function columnForSection(section: string): keyof App | undefined {
  return SECTION_TO_COLUMN[section];
}

function isSectionFilled(app: App, section: string): boolean {
  if (section === "guarantorDetails") {
    // Skipped by default — only becomes a real stop once an underwriter has flagged
    // guarantorRequired and it hasn't been filled in yet.
    return !app.guarantorRequired || app.guarantorDetailsJson != null;
  }
  const column = SECTION_TO_COLUMN[section];
  if (!column) return false;
  return (app as any)[column] != null;
}

export function sectionsFor(app: App): readonly string[] {
  return app.applicationType === "BUSINESS" ? BUSINESS_SECTIONS : ALL_SECTIONS;
}

export function calculateCompletion(app: App): number {
  const sections = sectionsFor(app);
  const filled = sections.filter((s) => isSectionFilled(app, s)).length;
  return Math.floor((filled * 100) / sections.length);
}

// Normally advances one section at a time. Skips forward over any later section that's already
// filled in (e.g. pre-filled by the pre-approved fast-track flow), except the permanent
// MANDATORY_STOPS — so the standard journey is unaffected (every later section is null until
// reached in order) while a fast-track application jumps straight to the next thing that
// actually needs the customer's attention.
export function nextSection(currentSection: string, app: App): string {
  const sections = sectionsFor(app);
  const idx = sections.indexOf(currentSection as any);
  for (let i = idx + 1; i < sections.length; i++) {
    const candidate = sections[i];
    if (MANDATORY_STOPS.has(candidate) || !isSectionFilled(app, candidate)) {
      return candidate;
    }
  }
  return sections[sections.length - 1];
}

export function sectionLabel(section: string, lang: "en" | "he" = "en"): string {
  if (lang === "he") {
    switch (section) {
      case "loanRequirements": return "פרטי ההלוואה";
      case "consentManagement": return "ניהול הסכמות";
      case "personalDetails": return "פרטים אישיים";
      case "connectBank": return "חיבור לבנק";
      case "incomeEmployment": return "הכנסה ותעסוקה";
      case "outgoings": return "הוצאות";
      case "creditDeclarations": return "הצהרות אשראי";
      case "verifyId": return "אימות זהות";
      case "directDebit": return "פרטי הוראת קבע";
      case "guarantorDetails": return "פרטי ערב";
      default: return "הבקשה";
    }
  }
  switch (section) {
    case "loanRequirements":
      return "Loan Requirements";
    case "consentManagement":
      return "Consent Management";
    case "personalDetails":
      return "Personal Details";
    case "connectBank":
      return "Bank Connection";
    case "incomeEmployment":
      return "Income & Employment";
    case "outgoings":
      return "Outgoings & Expenditure";
    case "creditDeclarations":
      return "Credit Declarations";
    case "verifyId":
      return "ID Verification";
    case "directDebit":
      return "Direct Debit Details";
    case "guarantorDetails":
      return "Guarantor Details";
    default:
      return "application";
  }
}

export function generateApplicationRef(): string {
  const year = new Date().getFullYear();
  const seq = 10000 + Math.floor(Math.random() * 89999);
  return `DGB-${year}-${seq}`;
}
