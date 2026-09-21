import type { InferSelectModel } from "drizzle-orm";
import type { loanApplications } from "../db/schema";
import { isFieldVisible, type FormVersionSchema } from "./form-schema-types";

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

// Flattens every section's already-saved JSON into one map keyed `"sectionKey.fieldKey"` —
// what a visibility condition's field/computed operands are resolved against, so a rule can
// reference a field in any section (see form-schema-types.ts's condition engine), not just the
// section the field-carrying-the-rule lives in. A section with nothing saved yet (or that
// doesn't parse) simply contributes no entries — referencing one of its fields resolves to
// undefined, which the evaluator already treats as "condition unmet," never an error.
export function flattenAllSectionValues(app: App): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [sectionKey, column] of Object.entries(SECTION_TO_COLUMN)) {
    const raw = (app as any)[column];
    if (raw == null) continue;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const [fieldKey, value] of Object.entries(data)) {
      values[`${sectionKey}.${fieldKey}`] = value;
    }
  }
  return values;
}

export function isSectionFilled(app: App, section: string): boolean {
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

// Admin Form Builder integration: a section already "filled" by the legacy per-column check above
// can still be missing a *new* required custom field the admin added after the customer completed
// it — this is the check that can un-tick a previously-green sidebar item. Only ever adds sections
// to the legacy incomplete set, never removes one: a section the legacy check already considers
// incomplete stays incomplete regardless of what this finds.
export function needsAttentionSections(app: App, schema: FormVersionSchema | null): string[] {
  if (!schema) return [];
  const flagged: string[] = [];
  // Built once, across every section — not just the one currently being checked — so a rule can
  // reference a field anywhere in the form (see form-schema-types.ts's condition engine).
  const values = flattenAllSectionValues(app);
  const ctx = { constants: schema.constants ?? [], values };
  for (const section of schema.sections) {
    if (!isSectionFilled(app, section.key)) continue; // already incomplete by the legacy check — nothing new to add
    if ((app as any)[SECTION_TO_COLUMN[section.key]] == null) continue;
    // Checked across every schema field, not just kind: "custom" — an admin can also mark an
    // existing (hardcoded) field required, e.g. personalDetails' preferredBranch shown only when
    // assistedByStaff is true (see applications.ts's validateSectionData for the matching
    // submit-time enforcement).
    const missingRequiredField = section.fields.some((f) => {
      if (!f.required || f.hidden || !isFieldVisible(f, section.key, ctx)) return false;
      const value = values[`${section.key}.${f.key}`];
      return value === undefined || value === null || value === "";
    });
    if (missingRequiredField) flagged.push(section.key);
  }
  return flagged;
}

export function generateApplicationRef(): string {
  const year = new Date().getFullYear();
  const seq = 10000 + Math.floor(Math.random() * 89999);
  return `DGB-${year}-${seq}`;
}
