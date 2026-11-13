import { describe, it, expect } from "vitest";
import { validateAttributes, createsCycle, typeCreatesCycle, attributeDefsSchema, CODE_RE, ITEM_CODE_RE, normaliseName, generateCode, generateAttributeKey, MAX_CODE_LENGTH } from "../src/lib/masters";

const defs = [
  { key: "address", label: { en: "Address", he: "כתובת" }, kind: "text" as const, required: true },
  { key: "capacity", label: { en: "Capacity", he: "קיבולת" }, kind: "number" as const },
  { key: "drive", label: { en: "Drive-through", he: "דרייב" }, kind: "boolean" as const },
];

describe("validateAttributes", () => {
  it("accepts valid values and coerces numeric strings", () => {
    expect(validateAttributes(defs, { address: " 1 Main St ", capacity: "12", drive: true })).toEqual({
      ok: true, value: { address: "1 Main St", capacity: 12, drive: true },
    });
  });
  it("rejects a missing required attribute", () => {
    expect(validateAttributes(defs, {}).ok).toBe(false);
  });
  it("rejects unknown keys, bad numbers and non-boolean booleans", () => {
    expect(validateAttributes(defs, { address: "x", nope: 1 }).ok).toBe(false);
    expect(validateAttributes(defs, { address: "x", capacity: "abc" }).ok).toBe(false);
    expect(validateAttributes(defs, { address: "x", drive: "yes" }).ok).toBe(false);
  });
  it("treats optional empties as absent", () => {
    expect(validateAttributes(defs, { address: "x", capacity: "", drive: null as any })).toEqual({ ok: true, value: { address: "x" } });
  });
});

describe("cycle checks", () => {
  const parents: Record<number, number | null> = { 1: null, 2: 1, 3: 2 };
  it("detects an item becoming its own ancestor", () => {
    expect(createsCycle(1, 3, (id) => parents[id])).toBe(true);
    expect(createsCycle(1, 1, (id) => parents[id])).toBe(true);
  });
  it("allows a valid re-parent", () => {
    expect(createsCycle(3, 1, (id) => parents[id])).toBe(false);
    expect(createsCycle(3, null, (id) => parents[id])).toBe(false);
  });
  it("detects type cycles", () => {
    const pt: Record<string, string | null> = { country: null, state: "country", city: "state" };
    expect(typeCreatesCycle("country", "city", (c) => pt[c])).toBe(true);
    expect(typeCreatesCycle("city", "country", (c) => pt[c])).toBe(false);
  });
});

describe("schemas and codes", () => {
  it("rejects duplicate attribute keys", () => {
    expect(attributeDefsSchema.safeParse([defs[0], defs[0]]).success).toBe(false);
  });
  it("code formats", () => {
    expect(CODE_RE.test("marital_status")).toBe(true);
    expect(CODE_RE.test("Marital Status")).toBe(false);
    expect(ITEM_CODE_RE.test("IL")).toBe(true);
    expect(ITEM_CODE_RE.test("a b")).toBe(false);
  });
});

describe("generated codes", () => {
  const free = () => false;
  it("derives the same code from the same name, however it is typed", () => {
    expect(generateCode("His Royal Highness", free)).toBe("HIS_ROYAL_HIGHNESS");
    expect(generateCode("  his   ROYAL highness ", free)).toBe("HIS_ROYAL_HIGHNESS");
    expect(generateCode("His-Royal Highness!", free)).toBe("HIS_ROYAL_HIGHNESS");
  });
  it("handles punctuation, ampersands and accents", () => {
    expect(generateCode("H.R.H.", free)).toBe("H_R_H");
    expect(generateCode("Mr & Mrs", free)).toBe("MR_AND_MRS");
    expect(generateCode("Åland Islands", free)).toBe("ALAND_ISLANDS");
    expect(normaliseName("Full-Time Employed")).toBe("FULL_TIME_EMPLOYED");
  });
  it("always satisfies the item code format and length", () => {
    for (const n of ["x", "A very long name that goes on and on and on forever", "7 days", "(Other)"]) {
      const c = generateCode(n, free);
      expect(ITEM_CODE_RE.test(c)).toBe(true);
      expect(c.length).toBeLessThanOrEqual(MAX_CODE_LENGTH);
    }
  });
  it("cuts long names at a word boundary", () => {
    expect(generateCode("Commercial Property Financing Facility", free)).toBe("COMMERCIAL_PROPERTY_FINANCING");
  });
  it("adds a numeric suffix on a clash and still fits the limit", () => {
    const taken = new Set(["OTHER", "OTHER_2"]);
    expect(generateCode("Other", (c) => taken.has(c))).toBe("OTHER_3");
    const long = "Commercial Property Financing Facility";
    const t2 = new Set(["COMMERCIAL_PROPERTY_FINANCING"]);
    const c = generateCode(long, (x) => t2.has(x));
    // The 29-char base plus "_2" would exceed 30, so the base is cut back to a word boundary first.
    expect(c).toBe("COMMERCIAL_PROPERTY_2");
    expect(c.length).toBeLessThanOrEqual(MAX_CODE_LENGTH);
  });
  it("falls back when the name has no Latin characters", () => {
    expect(generateCode("מדינה", free)).toBe("ITEM");
    expect(generateCode("מדינה", (c) => c === "ITEM")).toBe("ITEM_2");
  });
  it("makes lower-snake codes for master types", () => {
    expect(generateCode("Employment Status", free, { lower: true, fallback: "MASTER" })).toBe("employment_status");
    expect(CODE_RE.test(generateCode("Marital Status", free, { lower: true }))).toBe(true);
  });
  it("makes camelCase attribute keys, unique", () => {
    expect(generateAttributeKey("Branch code", new Set())).toBe("branchCode");
    expect(generateAttributeKey("Phone", new Set(["phone"]))).toBe("phone2");
    expect(generateAttributeKey("123", new Set())).toMatch(/^field/);
  });
});
