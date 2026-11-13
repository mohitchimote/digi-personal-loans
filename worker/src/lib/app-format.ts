import { eq } from "drizzle-orm";
import { masterItems } from "../db/schema";
import { normaliseName } from "./masters";
import { parseSchema, resolveActiveSchemaVersion } from "./form-versions";
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

// A stored loan purpose is the code of an item in whichever master the application's form definition
// gives the loanPurpose field (personal and business forms use different ones). The message builders are
// synchronous, so the names are loaded into a short-lived cache at the entry points (warmLoanPurposeNames)
// instead of the builders awaiting the database.
interface PurposeName { en: string; he: string }
interface PurposeNames { at: number; byCode: Map<string, PurposeName>; byName: Map<string, PurposeName> }
const PURPOSE_CACHE_MS = 60_000;
const purposeNamesByMaster = new Map<string, PurposeNames>();
const masterByApplication = new Map<string, string>();

export async function warmLoanPurposeNames(
  db: ReturnType<typeof import("../db/client").getDb>,
  app: Parameters<typeof resolveActiveSchemaVersion>[1],
): Promise<void> {
  const version = await resolveActiveSchemaVersion(db, app);
  let master: string | undefined;
  try {
    for (const section of version ? parseSchema(version).sections : []) {
      master ??= section.fields.find((f) => f.key === "loanPurpose")?.optionsSource?.master;
    }
  } catch { /* an unreadable definition: fall back to readable codes below */ }
  if (!master) return;
  if (masterByApplication.size > 500) masterByApplication.clear();
  masterByApplication.set(app.applicationRef, master);

  const cached = purposeNamesByMaster.get(master);
  if (cached && Date.now() - cached.at < PURPOSE_CACHE_MS) return;
  const rows = await db.select().from(masterItems).where(eq(masterItems.typeCode, master));
  const byCode = new Map<string, PurposeName>();
  const byName = new Map<string, PurposeName>();
  for (const r of rows) {
    byCode.set(r.code, { en: r.nameEn, he: r.nameHe });
    byName.set(normaliseName(r.nameEn), { en: r.nameEn, he: r.nameHe }); // applications saved before purposes were masters
  }
  purposeNamesByMaster.set(master, { at: Date.now(), byCode, byName });
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

export function loanPurpose(app: { applicationRef?: string; loanRequirementsJson: string | null; companyDetailsJson?: string | null }, lang: Lang = "en"): string {
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
  const master = app.applicationRef ? masterByApplication.get(app.applicationRef) : undefined;
  return resolvePurposeLabel(value, master ? purposeNamesByMaster.get(master) ?? null : null, lang);
}
