import { describe, it, expect } from "vitest";
import { formVersionSchemaSchema } from "../src/lib/form-schema-types";
import { applyMasterSources } from "../src/lib/form-master-sources";
import { masterSourceProblems } from "../src/lib/master-options";

const header = (key: string) => ({ key, labelKey: "x", order: 1 });
const field = (key: string, order: number, extra: Record<string, unknown> = {}) =>
  ({ key, sectionHeaderKey: "h", kind: "existing", labelKey: "x", required: false, order, ...extra });

const personal = () => formVersionSchemaSchema.parse({
  sections: [
    { key: "personalDetails", order: 1, sideMenuLabelKey: "s", sectionHeaders: [header("h"), header("currentAddress")],
      fields: [field("nationality", 1), field("maritalStatus", 2, { options: [{ value: "x", label: { en: "x", he: "x" } }] }), field("preferredBranch", 3), field("staffName", 4), field("city", 5, { sectionHeaderKey: "currentAddress" }), field("country", 6, { sectionHeaderKey: "currentAddress" })] },
    { key: "guarantorDetails", order: 3, sideMenuLabelKey: "s", sectionHeaders: [], fields: [] },
    { key: "directDebit", order: 2, sideMenuLabelKey: "s", sectionHeaders: [header("h")], fields: [field("bankCode", 1), field("branchCode", 2)] },
  ],
});
const business = () => formVersionSchemaSchema.parse({
  sections: [
    { key: "companyDetails", order: 1, sideMenuLabelKey: "s", sectionHeaders: [], fields: [] },
    { key: "directDebit", order: 2, sideMenuLabelKey: "s", sectionHeaders: [], fields: [] },
    { key: "guarantorDetails", order: 3, sideMenuLabelKey: "s", sectionHeaders: [], fields: [] },
  ],
});
const types = new Map([
  ["nationality", { parentTypeCode: null }], ["branch", { parentTypeCode: null }], ["staff", { parentTypeCode: "branch" }],
  ["bank", { parentTypeCode: null }], ["bank_branch", { parentTypeCode: "bank", attributeKeys: ["branchCode"] }],
  ["business_loan_purpose", { parentTypeCode: null }],
  ["country", { parentTypeCode: null }], ["state", { parentTypeCode: "country" }], ["city", { parentTypeCode: "state" }],
  ["relationship", { parentTypeCode: null }], ["industry_sector", { parentTypeCode: null }],
]);

describe("applyMasterSources", () => {
  it("re-points a field that still uses the retired branch_staff master at the staff list", () => {
    const schema = formVersionSchemaSchema.parse({
      sections: [{ key: "personalDetails", order: 1, sideMenuLabelKey: "s", sectionHeaders: [header("h")], fields: [
        field("preferredBranch", 1, { optionsSource: { master: "branch" } }),
        field("staffName", 2, { optionsSource: { master: "branch_staff", dependsOn: { fieldKey: "preferredBranch" } } }),
      ] }],
    });
    const out = applyMasterSources("personal-loan-wizard", schema);
    expect(out.schema.sections[0].fields[1].optionsSource).toEqual({ master: "staff", dependsOn: { fieldKey: "preferredBranch" } });
    expect(out.changes.some((c) => c.includes("branch_staff"))).toBe(true);
  });
  it("sets the source on known fields and result still validates", () => {
    const { schema, changes } = applyMasterSources("personal-loan-wizard", personal());
    const pd = schema.sections[0].fields;
    expect(pd.find((f) => f.key === "nationality")?.optionsSource).toEqual({ master: "nationality" });
    expect(pd.find((f) => f.key === "staffName")?.optionsSource?.dependsOn).toEqual({ fieldKey: "preferredBranch" });
    expect(schema.sections.find((x) => x.key === "directDebit")!.fields.find((f) => f.key === "branchCode")?.optionsSource?.valueAttribute).toBe("branchCode");
    expect(changes.length).toBe(11);
    expect(formVersionSchemaSchema.safeParse(schema).success).toBe(true);
  });
  it("makes country, state and city a cascade and adds the state field", () => {
    const { schema } = applyMasterSources("personal-loan-wizard", personal());
    const pd = schema.sections[0].fields;
    expect(pd.find((f) => f.key === "country")?.optionsSource).toEqual({ master: "country" });
    expect(pd.find((f) => f.key === "state")?.optionsSource).toEqual({ master: "state", dependsOn: { fieldKey: "country" } });
    expect(pd.find((f) => f.key === "city")?.optionsSource).toEqual({ master: "city", dependsOn: { fieldKey: "state" } });
    expect(masterSourceProblems(schema, types)).toEqual([]);
  });
  it("points guarantor relationship at the relationship master, in both forms", () => {
    for (const [key, s] of [["personal-loan-wizard", personal()], ["business-loan-wizard", business()]] as const) {
      const g = applyMasterSources(key, s).schema.sections.find((x) => x.key === "guarantorDetails")!;
      expect(g.fields.find((f) => f.key === "guarantorRelationship")?.optionsSource).toEqual({ master: "relationship" });
    }
  });
  it("leaves a field an admin already gave options", () => {
    const { schema } = applyMasterSources("personal-loan-wizard", personal());
    const f = schema.sections[0].fields.find((x) => x.key === "maritalStatus")!;
    expect(f.optionsSource).toBeUndefined();
    expect(f.options?.length).toBe(1);
  });
  it("is idempotent", () => {
    const once = applyMasterSources("personal-loan-wizard", personal());
    expect(applyMasterSources("personal-loan-wizard", once.schema).changes).toEqual([]);
  });
  it("adds the fields and headers the business definition lacks", () => {
    const { schema } = applyMasterSources("business-loan-wizard", business());
    const company = schema.sections[0];
    expect(company.sectionHeaders.map((h) => h.key)).toContain("company");
    expect(company.fields.map((f) => f.key)).toEqual(["industry", "country", "state", "city", "loanPurpose", "preferredBranch", "staffName"]);
    expect(schema.sections.find((x) => x.key === "directDebit")!.fields.map((f) => f.key)).toEqual(["bankCode", "branchCode"]);
    const r = formVersionSchemaSchema.safeParse(schema);
    expect(r.success ? [] : r.error.issues.map((i) => i.message)).toEqual([]);
  });
  it("produces definitions the master checks accept", () => {
    const { schema } = applyMasterSources("business-loan-wizard", business());
    expect(masterSourceProblems(schema, types)).toEqual([]);
  });
});
