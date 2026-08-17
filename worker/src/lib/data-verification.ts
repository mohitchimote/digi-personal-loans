import { javaStringHashCode, SeededRandom } from "./seeded-random";
import { AppError } from "./errors";

// Ports DataVerificationService.java. Demo-only, deterministic-per-application discrepancy check
// comparing self-declared Application Data against synthetic Document/3rd-Party Data — no OCR or
// credit-bureau integration exists, so the "documents" and "bureau" are pure synthesis, generated
// once per application and cached (never regenerated) so it's stable across reloads.

const SURNAME_POOL = ["Cohen", "Levi", "Mizrahi", "Peretz", "Biton", "Avraham", "Friedman", "Katz"];
const CITY_POOL = ["Tel Aviv", "Haifa", "Jerusalem", "Beer Sheva", "Netanya", "Rishon LeZion"];
const EMPLOYER_POOL = [
  "Teva Pharmaceutical Industries",
  "Bank Hapoalim",
  "Check Point Software",
  "Elbit Systems",
  "Wix.com",
  "Amdocs",
];

export interface DataVerificationRule {
  ruleKey: string;
  section: string;
  applicationValue: string;
  documentValue: string;
  thirdPartyValue: string;
  status: "GREEN" | "AMBER" | "RED";
  resolution?: {
    action: string;
    note: string | null;
    reviewedBy: string;
    resolvedAt: string;
  } | null;
}

export interface DataVerificationSummary {
  generatedAt: string;
  seed: string;
  rules: DataVerificationRule[];
}

function ruleRandom(seed: number, ruleKey: string): SeededRandom {
  return new SeededRandom((seed + javaStringHashCode(ruleKey)) | 0);
}

function bucket(roll: number): "GREEN" | "AMBER" | "RED" {
  if (roll < 60) return "GREEN";
  if (roll < 85) return "AMBER";
  return "RED";
}

function pick(pool: string[], rng: SeededRandom, exclude: string): string {
  const candidates = pool.filter((v) => v.toLowerCase() !== (exclude ?? "").toLowerCase());
  if (candidates.length === 0) return pool[0];
  return candidates[rng.nextInt(candidates.length)];
}

function swapAdjacentChars(value: string, rng: SeededRandom): string {
  if (!value || value.trim().length < 2) return value;
  const chars = value.split("");
  let i = rng.nextInt(chars.length - 1);
  if (chars[i] === " ") i = Math.max(0, i - 1);
  if (i + 1 >= chars.length || chars[i] === " " || chars[i + 1] === " ") return value;
  const tmp = chars[i];
  chars[i] = chars[i + 1];
  chars[i + 1] = tmp;
  return chars.join("");
}

function mutateLastDigits(value: string, rng: SeededRandom): string {
  if (value.length < 2) return value;
  const chars = value.split("");
  const idx = chars.length - 1;
  const digit = /\d/.test(chars[idx]) ? Number(chars[idx]) : 0;
  const mutated = (digit + 1 + rng.nextInt(8)) % 10;
  chars[idx] = String(mutated);
  return chars.join("");
}

function abbreviateStreet(street: string): string {
  if (!street) return street;
  return street.replace("Street", "St.").replace("Boulevard", "Blvd.").replace("Avenue", "Ave.");
}

function formatCurrency(amount: number): string {
  return `₪${Math.round(amount).toLocaleString("en-US")}`;
}

function incomeBand(aroundAmount: number): string {
  const low = Math.max(0, aroundAmount - 2500);
  const high = aroundAmount + 2500;
  return `${formatCurrency(low)} – ${formatCurrency(high)} (est.)`;
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function addDays(d: Date, days: number): string {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString().slice(0, 10);
}

function addMonths(d: Date, months: number): string {
  const copy = new Date(d);
  copy.setMonth(copy.getMonth() + months);
  return copy.toISOString().slice(0, 10);
}

function rule(
  key: string,
  section: string,
  applicationValue: string,
  documentValue: string,
  thirdPartyValue: string,
  status: "GREEN" | "AMBER" | "RED"
): DataVerificationRule {
  return { ruleKey: key, section, applicationValue, documentValue, thirdPartyValue, status, resolution: null };
}

function safeParse(json: string | null): any {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export function generateDataVerification(app: {
  applicationRef: string;
  personalDetailsJson: string | null;
  incomeEmploymentJson: string | null;
  creditDeclarationsJson: string | null;
}): DataVerificationSummary {
  const personal = safeParse(app.personalDetailsJson);
  const income = safeParse(app.incomeEmploymentJson);
  const credit = safeParse(app.creditDeclarationsJson);
  const seed = javaStringHashCode(app.applicationRef);

  const rules: DataVerificationRule[] = [
    buildFullNameRule(personal, seed),
    buildDateOfBirthRule(personal, seed),
    buildNationalIdRule(personal, seed),
    buildAddressRule(personal, seed),
    buildIncomeRule(income, seed),
    buildEmployerRule(income, seed),
    buildCreditScoreRule(credit, seed),
    buildBooleanFlagRule(credit, seed, "hasDefaulted"),
    buildBooleanFlagRule(credit, seed, "hasBankruptcy"),
    buildBooleanFlagRule(credit, seed, "hasCCJ"),
  ];

  return { generatedAt: new Date().toISOString(), seed: app.applicationRef, rules };
}

function buildFullNameRule(personal: any, seed: number): DataVerificationRule {
  const first = personal.firstName ?? "";
  const last = personal.lastName ?? "";
  const appValue = `${first} ${last}`.trim();
  const rng = ruleRandom(seed, "fullName");
  const status = bucket(rng.nextInt(100));
  let docValue = appValue;
  if (status === "AMBER") docValue = swapAdjacentChars(appValue, rng);
  else if (status === "RED") docValue = `${first} ${pick(SURNAME_POOL, rng, last)}`.trim();
  return rule("fullName", "personalDetails", appValue, docValue, appValue, status);
}

function buildDateOfBirthRule(personal: any, seed: number): DataVerificationRule {
  const appValue = personal.dateOfBirth ?? "";
  const rng = ruleRandom(seed, "dateOfBirth");
  const status = bucket(rng.nextInt(100));
  let docValue = appValue;
  let thirdPartyValue = appValue;
  const parsed = parseDate(appValue);
  if (parsed) {
    if (status === "AMBER") {
      docValue = addDays(parsed, rng.nextBoolean() ? 1 : -1);
    } else if (status === "RED") {
      docValue = addMonths(parsed, 1 + rng.nextInt(3));
      thirdPartyValue = docValue;
    }
  }
  return rule("dateOfBirth", "personalDetails", appValue, docValue, thirdPartyValue, status);
}

function buildNationalIdRule(personal: any, seed: number): DataVerificationRule {
  const appValue = personal.nationalId ?? "";
  const rng = ruleRandom(seed, "nationalId");
  const status = bucket(rng.nextInt(100));
  let docValue = appValue;
  const thirdPartyValue = appValue;
  if (appValue.length >= 2) {
    if (status === "AMBER") docValue = swapAdjacentChars(appValue, rng);
    else if (status === "RED") docValue = mutateLastDigits(appValue, rng);
  }
  return rule("nationalId", "personalDetails", appValue, docValue, thirdPartyValue, status);
}

function buildAddressRule(personal: any, seed: number): DataVerificationRule {
  const street = personal.street ?? "";
  const city = personal.city ?? "";
  const appValue = `${street}, ${city}`.trim();
  const rng = ruleRandom(seed, "address");
  const status = bucket(rng.nextInt(100));
  let docValue = appValue;
  let thirdPartyValue = appValue;
  if (status === "AMBER") {
    docValue = `${abbreviateStreet(street)}, ${city}`;
  } else if (status === "RED") {
    docValue = `${street}, ${pick(CITY_POOL, rng, city)}`;
    thirdPartyValue = docValue;
  }
  return rule("address", "personalDetails", appValue, docValue, thirdPartyValue, status);
}

function buildIncomeRule(income: any, seed: number): DataVerificationRule {
  const gross = Number(income.monthlyGrossIncome ?? 0);
  const appValue = formatCurrency(gross);
  const rng = ruleRandom(seed, "monthlyIncome");
  const status = bucket(rng.nextInt(100));
  let docAmount = gross;
  if (status === "AMBER") docAmount = gross * 0.9;
  else if (status === "RED") docAmount = gross * 0.7;
  const docValue = gross > 0 ? formatCurrency(docAmount) : "";
  const thirdPartyValue = gross > 0 ? incomeBand(docAmount) : "";
  return rule("monthlyIncome", "incomeEmployment", appValue, docValue, thirdPartyValue, status);
}

function buildEmployerRule(income: any, seed: number): DataVerificationRule {
  const appValue = income.employer ?? "";
  const rng = ruleRandom(seed, "employer");
  const status = bucket(rng.nextInt(100));
  let docValue = appValue;
  if (status === "AMBER") docValue = appValue.trim() === "" ? appValue : `${appValue} Ltd`;
  else if (status === "RED") docValue = pick(EMPLOYER_POOL, rng, appValue);
  return rule("employer", "incomeEmployment", appValue, docValue, "—", status);
}

function buildCreditScoreRule(credit: any, seed: number): DataVerificationRule {
  const declared = Number(credit.creditScore ?? 0);
  const appValue = declared > 0 ? String(declared) : "";
  const rng = ruleRandom(seed, "creditScore");
  const status = bucket(rng.nextInt(100));
  let bureauScore = declared > 0 ? declared : 650;
  if (status === "AMBER") bureauScore -= 40;
  else if (status === "RED") bureauScore -= 120;
  bureauScore = Math.max(300, Math.min(850, bureauScore));
  const thirdPartyValue = declared > 0 ? `${bureauScore} (bureau)` : "";
  return rule("creditScore", "creditDeclarations", appValue, "—", thirdPartyValue, status);
}

function buildBooleanFlagRule(credit: any, seed: number, field: string): DataVerificationRule {
  const declared = credit[field] === true;
  const appValue = declared ? "Yes" : "No";
  const rng = ruleRandom(seed, field);
  const status = bucket(rng.nextInt(100));
  let bureauValue = declared;
  if (status === "RED") bureauValue = !declared;
  return rule(field, "creditDeclarations", appValue, "—", bureauValue ? "Yes" : "No", status);
}

export function resolveDataVerificationRule(
  summary: DataVerificationSummary,
  input: { ruleKey: string; action: string; note?: string | null; reviewedBy: string }
): DataVerificationSummary {
  if (input.action === "APPROVE_EXCEPTION" && (!input.note || input.note.trim() === "")) {
    throw new AppError("A note is required to approve as an exception.");
  }
  const target = summary.rules.find((r) => r.ruleKey === input.ruleKey);
  if (!target) throw new AppError(`Unknown data verification rule: ${input.ruleKey}`);

  target.resolution = {
    action: input.action,
    note: input.note ?? null,
    reviewedBy: input.reviewedBy,
    resolvedAt: new Date().toISOString(),
  };
  return summary;
}
