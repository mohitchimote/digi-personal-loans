import type { FormField, FormKey, FormSection, FormVersionSchema, OptionsSource } from "./form-schema-types";

// Which master each pick-list field of the application forms takes its options from. This is the one
// place that pairing is written down, and it is used once: to populate the form definitions (a new
// published version per form). After that the form definition is the source of truth; screens and the
// server's checks read `optionsSource` from it and never name a master themselves.

interface FieldDefault {
  section: string;
  field: string;
  source: OptionsSource;
  /** For forms whose definition does not declare the field yet: the field, and its header, to add. */
  add?: { header?: { key: string; labelKey: string }; field: Omit<FormField, "key" | "optionsSource" | "kind" | "options" | "optionsDependOn"> };
}

const PERSONAL: FieldDefault[] = [
  { section: "loanRequirements", field: "loanPurpose", source: { master: "loan_purpose" } },
  { section: "personalDetails", field: "nationality", source: { master: "nationality" } },
  { section: "personalDetails", field: "maritalStatus", source: { master: "marital_status" } },
  { section: "personalDetails", field: "preferredBranch", source: { master: "branch" } },
  { section: "personalDetails", field: "staffName", source: { master: "staff", dependsOn: { fieldKey: "preferredBranch" } } },
  { section: "personalDetails", field: "country", source: { master: "country" } },
  {
    section: "personalDetails", field: "state", source: { master: "state", dependsOn: { fieldKey: "country" } },
    add: { field: { sectionHeaderKey: "currentAddress", labelKey: "personal.stateLabel", required: true, order: 5 } },
  },
  { section: "personalDetails", field: "city", source: { master: "city", dependsOn: { fieldKey: "state" } } },
  {
    section: "guarantorDetails", field: "guarantorRelationship", source: { master: "relationship" },
    add: { header: { key: "guarantor", labelKey: "guarantor.detailsHeader" }, field: { sectionHeaderKey: "guarantor", labelKey: "directDebit.guarantorRelationshipLabel", required: true, order: 1 } },
  },
  { section: "incomeEmployment", field: "employmentStatus", source: { master: "employment_status" } },
  { section: "incomeEmployment", field: "employmentDuration", source: { master: "employment_duration" } },
  { section: "directDebit", field: "bankCode", source: { master: "bank" } },
  { section: "directDebit", field: "branchCode", source: { master: "bank_branch", dependsOn: { fieldKey: "bankCode" }, valueAttribute: "branchCode" } },
];

// The business form's definition is only a list of empty sections today, so these fields are added to it.
const BUSINESS: FieldDefault[] = [
  {
    section: "companyDetails", field: "industry", source: { master: "industry_sector" },
    add: { header: { key: "company", labelKey: "company.detailsTitle" }, field: { sectionHeaderKey: "company", labelKey: "register.companyIndustryLabel", required: true, order: 0 } },
  },
  {
    section: "companyDetails", field: "country", source: { master: "country" },
    add: { field: { sectionHeaderKey: "company", labelKey: "personal.countryLabel", required: true, order: 0 } },
  },
  {
    section: "companyDetails", field: "state", source: { master: "state", dependsOn: { fieldKey: "country" } },
    add: { field: { sectionHeaderKey: "company", labelKey: "personal.stateLabel", required: true, order: 0 } },
  },
  {
    section: "companyDetails", field: "city", source: { master: "city", dependsOn: { fieldKey: "state" } },
    add: { field: { sectionHeaderKey: "company", labelKey: "personal.cityLabel", required: true, order: 0 } },
  },
  {
    section: "guarantorDetails", field: "guarantorRelationship", source: { master: "relationship" },
    add: { header: { key: "guarantor", labelKey: "guarantor.detailsHeader" }, field: { sectionHeaderKey: "guarantor", labelKey: "directDebit.guarantorRelationshipLabel", required: true, order: 1 } },
  },
  {
    section: "companyDetails", field: "loanPurpose", source: { master: "business_loan_purpose" },
    add: { header: { key: "loanRequest", labelKey: "company.loanRequestHeader" }, field: { sectionHeaderKey: "loanRequest", labelKey: "loanReq.purposeLabel", required: true, order: 1 } },
  },
  {
    section: "companyDetails", field: "preferredBranch", source: { master: "branch" },
    add: { header: { key: "branchAssistance", labelKey: "personal.staffAssistHeader" }, field: { sectionHeaderKey: "branchAssistance", labelKey: "personal.preferredBranchLabel", required: false, order: 2 } },
  },
  {
    section: "companyDetails", field: "staffName", source: { master: "staff", dependsOn: { fieldKey: "preferredBranch" } },
    add: { field: { sectionHeaderKey: "branchAssistance", labelKey: "personal.staffNameLabel", required: false, order: 3 } },
  },
  {
    section: "directDebit", field: "bankCode", source: { master: "bank" },
    add: { header: { key: "account", labelKey: "directDebit.accountHeader" }, field: { sectionHeaderKey: "account", labelKey: "directDebit.bankNameLabel", required: true, order: 2 } },
  },
  {
    section: "directDebit", field: "branchCode", source: { master: "bank_branch", dependsOn: { fieldKey: "bankCode" }, valueAttribute: "branchCode" },
    add: { field: { sectionHeaderKey: "account", labelKey: "directDebit.branchCodeLabel", required: true, order: 3 } },
  },
];

/**
 * Sources that used to point at something that no longer exists, and where they point now. Bank staff were
 * briefly a master ("branch_staff"); they are read from the Users table now.
 */
const REPOINT: Record<string, string> = { branch_staff: "staff" };

/**
 * Cascades need the parent before the child in display order (country, then state, then city), but the
 * personal form lists city before country. When a default touches one of these fields, the header's fields
 * are renumbered with these first, in this order, and any others after them in their existing order.
 */
const ORDERED: Record<FormKey, { section: string; header: string; keys: string[] }[]> = {
  "personal-loan-wizard": [{ section: "personalDetails", header: "currentAddress", keys: ["street", "country", "state", "city", "postCode"] }],
  "business-loan-wizard": [{ section: "companyDetails", header: "company", keys: ["industry", "country", "state", "city"] }],
};

export const MASTER_SOURCE_DEFAULTS: Record<FormKey, FieldDefault[]> = {
  "personal-loan-wizard": PERSONAL,
  "business-loan-wizard": BUSINESS,
};

/**
 * Returns a copy of the schema in which each known pick-list field takes its options from its master.
 * A field an admin already gave options (typed, or a master of their choice) is left alone, so this
 * never overrides a deliberate choice. `changes` says what was done, for the change note and the log.
 */
export function applyMasterSources(formKey: FormKey, schema: FormVersionSchema): { schema: FormVersionSchema; changes: string[] } {
  const next: FormVersionSchema = JSON.parse(JSON.stringify(schema));
  const changes: string[] = [];
  for (const section of next.sections) {
    for (const f of section.fields) {
      const to = f.optionsSource && REPOINT[f.optionsSource.master];
      if (to) { changes.push(`${section.key}.${f.key}: options from "${f.optionsSource!.master}" now come from "${to}"`); f.optionsSource = { ...f.optionsSource!, master: to }; }
    }
  }
  for (const d of MASTER_SOURCE_DEFAULTS[formKey]) {
    const section: FormSection | undefined = next.sections.find((s) => s.key === d.section);
    if (!section) continue;
    let field = section.fields.find((f) => f.key === d.field);
    if (!field) {
      if (!d.add) continue;
      if (d.add.header && !section.sectionHeaders.some((h) => h.key === d.add!.header!.key)) {
        section.sectionHeaders.push({ key: d.add.header.key, labelKey: d.add.header.labelKey, order: section.sectionHeaders.length + 1 });
      }
      field = { key: d.field, kind: "existing", ...d.add.field } as FormField;
      section.fields.push(field);
      changes.push(`${d.section}.${d.field}: field added`);
    }
    if (field.optionsSource || field.options?.length || field.optionsDependOn) continue;
    field.optionsSource = d.source;
    changes.push(`${d.section}.${d.field}: options from "${d.source.master}"`);
  }
  for (const o of ORDERED[formKey]) {
    if (!changes.some((c) => o.keys.some((k) => c.startsWith(`${o.section}.${k}:`)))) continue;
    const section = next.sections.find((x) => x.key === o.section);
    if (!section) continue;
    const inHeader = section.fields.filter((f) => f.sectionHeaderKey === o.header);
    const rank = (f: FormField) => { const i = o.keys.indexOf(f.key); return i >= 0 ? i : o.keys.length + f.order; };
    inHeader.sort((a, b) => rank(a) - rank(b)).forEach((f, i) => { f.order = i + 1; });
  }
  return { schema: next, changes };
}
