import type { InferSelectModel } from "drizzle-orm";
import type { Db } from "../../db/client";
import type { loanApplications } from "../../db/schema";
import { computeCalculated } from "../calculated";
import { masterItemNames } from "../master-options";

type App = InferSelectModel<typeof loanApplications>;
type Bi = { en: string; he: string };

const parse = (s: string | null): Record<string, unknown> => { try { return s ? (JSON.parse(s) as Record<string, unknown>) : {}; } catch { return {}; } };
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const join = (parts: (Bi | string | undefined)[], lang: "en" | "he") => parts.filter(Boolean).map((p) => (typeof p === "string" ? p : p![lang])).join(", ");

/**
 * The values of one application, nested the way the letter dictionary's dotted paths name them
 * ({ loan: { amount } } for "loan.amount"). A value the application does not have yet is left out, which
 * the letter engine reports as missing; nothing is invented. Master-backed values (purpose, branch, city ...)
 * are {en, he} so each language prints its own name. Calculated values come from the application's stored
 * `calculatedJson`.
 */
export async function buildLetterData(db: Db, app: App, extra: { decisionReason?: string } = {}): Promise<Record<string, unknown>> {
  const business = app.applicationType === "BUSINESS";
  const personal = parse(app.personalDetailsJson);
  const company = parse(app.companyDetailsJson);
  const loanReq = parse(business ? app.companyDetailsJson : app.loanRequirementsJson);
  const income = parse(app.incomeEmploymentJson);
  const guarantor = parse(app.guarantorDetailsJson);
  const product = parse(app.selectedProductJson);
  // Normally stored by the backend on every change; applications saved before that existed are worked out here.
  const calc = app.calculatedJson ? parse(app.calculatedJson) : (computeCalculated(app) as Record<string, unknown>);
  const applicant2 = (personal.applicant2 ?? null) as Record<string, unknown> | null;
  const addr = business ? company : personal;
  const branchCode = business ? company.preferredBranch : personal.preferredBranch;

  const names = (master: string, code: unknown) => masterItemNames(db, master, [str(code)].filter((c): c is string => !!c));
  const [purpose, branch, relationship, industry, country, city] = await Promise.all([
    names(business ? "business_loan_purpose" : "loan_purpose", loanReq.loanPurpose),
    names("branch", branchCode),
    names("relationship", guarantor.guarantorRelationship),
    names("industry_sector", company.industry),
    names("country", addr.country),
    names("city", addr.city),
  ]);
  const pick = (m: Map<string, Bi>, code: unknown) => { const c = str(code); return c ? m.get(c) : undefined; };

  const data: Record<string, unknown> = {};
  // Paths are dotted ("loan.amount") and the engine walks nested objects, so values are stored nested.
  const put = (k: string, v: unknown) => {
    const parts = k.split(".");
    let o = data;
    for (const p of parts.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>;
    o[parts[parts.length - 1]] = v;
  };
  const set = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== "") put(k, v); };

  set("application.reference", app.applicationRef);
  set("application.type", app.applicationType);
  set("application.submittedAt", app.submittedAt ? app.submittedAt.slice(0, 10) : undefined);

  const fullName = [str(personal.firstName), str(personal.lastName)].filter(Boolean).join(" ");
  set("customer.name", business ? str(company.companyName) : fullName);
  set("customer.email", str(personal.email) ?? app.customerEmail);
  set("customer.phone", str(personal.phoneNumber));

  const street = str(addr.street), cityBi = pick(city, addr.city), countryBi = pick(country, addr.country);
  if (street || cityBi || countryBi) {
    set(business ? "company.address" : "customer.address", { en: join([street, cityBi, countryBi], "en"), he: join([street, cityBi, countryBi], "he") });
  }

  if (!business && fullName) {
    const rows: Record<string, unknown>[] = [{ fullName, role: "MAIN", dateOfBirth: str(personal.dateOfBirth), nationalId: str(personal.nationalId), monthlyIncome: num(income.monthlyNetIncome) }];
    const a2Name = applicant2 ? [str(applicant2.firstName), str(applicant2.lastName)].filter(Boolean).join(" ") : "";
    if (applicant2 && a2Name) rows.push({ fullName: a2Name, role: "JOINT", dateOfBirth: str(applicant2.dateOfBirth), nationalId: str(applicant2.nationalId) });
    put("applicants", rows.map((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined))));
  }

  if (business) {
    set("company.name", str(company.companyName));
    set("company.registrationNumber", str(company.companyRegistrationNumber));
    set("company.industry", pick(industry, company.industry));
    set("company.yearFounded", num(company.yearFounded));
  }

  set("loan.purpose", pick(purpose, loanReq.loanPurpose));
  set("loan.requestedAmount", num(loanReq.loanAmount));
  set("loan.amount", num(calc.loanAmount));
  set("loan.termMonths", num(calc.termMonths));
  set("loan.annualRate", num(calc.annualRate));
  for (const k of ["monthlyRepayment", "totalPayable", "totalInterest", "costPerShekel"]) set(`calculated.${k}`, num(calc[k]));

  set("product.name", str(product.productName) ?? str(product.name));
  set("branch.name", pick(branch, branchCode));

  put("guarantor.required", app.guarantorRequired);
  set("guarantor.name", str(guarantor.guarantorName));
  set("guarantor.relationship", pick(relationship, guarantor.guarantorRelationship));
  set("guarantor.phone", str(guarantor.guarantorPhone));
  set("guarantor.email", str(guarantor.guarantorEmail));
  set("decision.reason", extra.decisionReason);
  return data;
}
