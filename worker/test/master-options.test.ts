import { describe, it, expect } from "vitest";
import { formVersionSchemaSchema } from "../src/lib/form-schema-types";
import { masterSourceProblems, masterValueProblem } from "../src/lib/master-options";

const field = (key: string, order: number, extra: Record<string, unknown> = {}) => ({
  key, sectionHeaderKey: "h", kind: "custom", type: "select", label: { en: key, he: key }, required: false, order, ...extra,
});
const schemaOf = (fields: unknown[]) => ({
  sections: [{ key: "s", order: 1, sideMenuLabelKey: "x", sectionHeaders: [{ key: "h", label: { en: "h", he: "h" }, order: 1 }], fields }],
});
const types = new Map([
  ["country", { parentTypeCode: null }],
  ["state", { parentTypeCode: "country" }],
  ["city", { parentTypeCode: "state" }],
]);
const parse = (fields: unknown[]) => formVersionSchemaSchema.safeParse(schemaOf(fields));

describe("optionsSource in the form schema", () => {
  it("accepts a master source and a valid cascade", () => {
    expect(parse([
      field("country", 1, { optionsSource: { master: "country" } }),
      field("state", 2, { optionsSource: { master: "state", dependsOn: { fieldKey: "country" } } }),
    ]).success).toBe(true);
  });
  it("rejects both a typed list and a master", () => {
    expect(parse([field("a", 1, { options: [{ value: "x", label: { en: "x", he: "x" } }], optionsSource: { master: "country" } })]).success).toBe(false);
  });
  it("rejects a dependency on a later, missing or non-master field", () => {
    const base = field("country", 2, { optionsSource: { master: "country" } });
    expect(parse([field("state", 1, { optionsSource: { master: "state", dependsOn: { fieldKey: "country" } } }), base]).success).toBe(false);
    expect(parse([field("state", 2, { optionsSource: { master: "state", dependsOn: { fieldKey: "nope" } } })]).success).toBe(false);
    expect(parse([field("plain", 1), field("state", 2, { optionsSource: { master: "state", dependsOn: { fieldKey: "plain" } } })]).success).toBe(false);
  });
});

describe("masterSourceProblems", () => {
  const check = (fields: unknown[]) => masterSourceProblems(formVersionSchemaSchema.parse(schemaOf(fields)), types);
  it("passes a correct country > state > city chain", () => {
    expect(check([
      field("country", 1, { optionsSource: { master: "country" } }),
      field("state", 2, { optionsSource: { master: "state", dependsOn: { fieldKey: "country" } } }),
      field("city", 3, { optionsSource: { master: "city", dependsOn: { fieldKey: "state" } } }),
    ])).toEqual([]);
  });
  it("flags an unknown master", () => {
    expect(check([field("x", 1, { optionsSource: { master: "planet" } })])[0]).toMatch(/does not exist/);
  });
  it("flags a cascade whose trigger is not from the parent master", () => {
    const p = check([
      field("country", 1, { optionsSource: { master: "country" } }),
      field("city", 2, { optionsSource: { master: "city", dependsOn: { fieldKey: "country" } } }), // city's parent is state
    ]);
    expect(p[0]).toMatch(/parent of "city"/);
  });
  it("flags a dependency on a master that has no parent", () => {
    const p = check([
      field("a", 1, { optionsSource: { master: "country" } }),
      field("b", 2, { optionsSource: { master: "country", dependsOn: { fieldKey: "a" } } }),
    ]);
    expect(p[0]).toMatch(/no parent master/);
  });
  it("flags a non select/radio custom field", () => {
    expect(check([field("t", 1, { type: "text", optionsSource: { master: "country" } })])[0]).toMatch(/select and radio/);
  });
});

describe("masterValueProblem", () => {
  const active = { active: true, parentCode: "IL" };
  const run = (o: Partial<Parameters<typeof masterValueProblem>[0]>) =>
    masterValueProblem({ item: active, value: "IL-HA", previous: undefined, dependsOn: false, dependsOnValue: undefined, ...o });
  it("accepts an active item", () => expect(run({})).toBeNull());
  it("rejects an unknown code", () => expect(run({ item: null })).toMatch(/not a valid choice/));
  it("rejects a newly chosen inactive item but keeps an unchanged one", () => {
    const off = { active: false, parentCode: "IL" };
    expect(run({ item: off })).toMatch(/no longer available/);
    expect(run({ item: off, previous: "IL-HA" })).toBeNull();
  });
  it("enforces the parent in a cascade", () => {
    expect(run({ dependsOn: true, dependsOnValue: "IL" })).toBeNull();
    expect(run({ dependsOn: true, dependsOnValue: "GB" })).toMatch(/does not belong/);
    expect(run({ dependsOn: true, dependsOnValue: "" })).toMatch(/chosen first/);
    expect(run({ dependsOn: true, dependsOnValue: undefined })).toMatch(/chosen first/);
  });
});
