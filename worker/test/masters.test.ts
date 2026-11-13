import { describe, it, expect } from "vitest";
import { validateAttributes, createsCycle, typeCreatesCycle, attributeDefsSchema, CODE_RE, ITEM_CODE_RE } from "../src/lib/masters";

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
