// Shared between applications.ts (in-app notification text) and email.ts (templated email
// variables) — relocated here so both can reuse the same safe-parse-with-fallback logic without
// an awkward cross-import between route and lib files.

export type Lang = "en" | "he";

export function applicantFirstName(app: { personalDetailsJson: string | null }): string {
  try {
    if (app.personalDetailsJson) {
      const parsed = JSON.parse(app.personalDetailsJson);
      if (parsed.firstName?.trim()) return parsed.firstName;
    }
  } catch {
    /* ignore */
  }
  return "Customer";
}

export function greeting(app: { personalDetailsJson: string | null }, lang: Lang = "en"): string {
  const name = applicantFirstName(app);
  return lang === "he" ? `שלום ${name === "Customer" ? "רבים" : name},` : `Dear ${name},`;
}

// Mirrors the frontend's loanPurpose.*/businessLoanPurpose.* dictionaries (frontend/src/app/core/i18n/he.ts)
// — kept in sync manually since the worker can't import Angular app code. Falls back to the raw
// English value for anything not in the list (e.g. free-text "Other" purposes), which is
// preferable to the notification failing to send.
const LOAN_PURPOSE_HE: Record<string, string> = {
  "Home Improvement": "שיפוץ דירה",
  "Debt Consolidation": "איחוד הלוואות",
  "Vehicle Purchase": "רכישת רכב",
  Education: "לימודים",
  "Medical Expenses": "הוצאות רפואיות",
  Wedding: "חתונה",
  Travel: "נסיעה",
  Business: "עסק",
  "Working Capital": "הון חוזר",
  "Equipment Purchase": "רכישת ציוד",
  "Business Expansion": "הרחבת העסק",
  "Inventory Financing": "מימון מלאי",
  "Debt Refinancing": "מיחזור חוב",
  "Commercial Property": "נכס מסחרי",
  Other: "אחר",
};

export function loanPurpose(app: { loanRequirementsJson: string | null; companyDetailsJson?: string | null }, lang: Lang = "en"): string {
  let value: string | null = null;
  try {
    if (app.loanRequirementsJson) {
      value = JSON.parse(app.loanRequirementsJson).loanPurpose?.trim() || null;
    }
    if (!value && app.companyDetailsJson) {
      value = JSON.parse(app.companyDetailsJson).loanPurpose?.trim() || null;
    }
  } catch {
    /* ignore */
  }
  if (!value) return lang === "he" ? "המטרה שביקשת" : "your requested purpose";
  return lang === "he" ? LOAN_PURPOSE_HE[value] ?? value : value;
}
