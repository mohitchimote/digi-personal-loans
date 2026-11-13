import { inArray } from "drizzle-orm";
import { masterItems } from "../db/schema";
import { normaliseName } from "./masters";
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

// Loan purposes come from the Loan Purpose / Business Loan Purpose masters (an application stores the
// item's code). The message builders are synchronous, so the names are loaded into a short-lived cache
// at the entry points (see warmLoanPurposeNames) instead of the builders awaiting the database.
interface PurposeName { en: string; he: string }
const PURPOSE_CACHE_MS = 60_000;
let purposeCache: { at: number; byCode: Map<string, PurposeName>; byName: Map<string, PurposeName> } | null = null;

export async function warmLoanPurposeNames(db: ReturnType<typeof import("../db/client").getDb>): Promise<void> {
  if (purposeCache && Date.now() - purposeCache.at < PURPOSE_CACHE_MS) return;
  const rows = await db.select().from(masterItems).where(inArray(masterItems.typeCode, ["loan_purpose", "business_loan_purpose"]));
  const byCode = new Map<string, PurposeName>();
  const byName = new Map<string, PurposeName>();
  for (const r of rows) {
    byCode.set(r.code, { en: r.nameEn, he: r.nameHe });
    byName.set(normaliseName(r.nameEn), { en: r.nameEn, he: r.nameHe }); // applications saved before purposes were masters
  }
  purposeCache = { at: Date.now(), byCode, byName };
}

/** The wording for a stored purpose: a master code, or older display text. Pure, so it can be tested. */
export function resolvePurposeLabel(
  value: string,
  names: { byCode: ReadonlyMap<string, PurposeName>; byName: ReadonlyMap<string, PurposeName> } | null,
  lang: Lang,
): string {
  const hit = names?.byCode.get(value) ?? names?.byName.get(normaliseName(value));
  if (hit) return lang === "he" ? hit.he || hit.en : hit.en;
  // Not in the masters (list not loaded, or a purpose since removed): make a code readable rather than fail.
  return /^[A-Z0-9_]+$/.test(value) ? value.toLowerCase().split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : value;
}

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
  return resolvePurposeLabel(value, purposeCache, lang);
}
