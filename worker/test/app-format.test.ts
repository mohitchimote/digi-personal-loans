import { describe, it, expect } from "vitest";
import { resolvePurposeLabel } from "../src/lib/app-format";

const names = {
  byCode: new Map([["HOME_IMPROVEMENT", { en: "Home Improvement", he: "שיפוץ הבית" }]]),
  byName: new Map([["HOME_IMPROVEMENT", { en: "Home Improvement", he: "שיפוץ הבית" }]]),
};

describe("resolvePurposeLabel", () => {
  it("uses the master's name in the requested language for a code", () => {
    expect(resolvePurposeLabel("HOME_IMPROVEMENT", names, "en")).toBe("Home Improvement");
    expect(resolvePurposeLabel("HOME_IMPROVEMENT", names, "he")).toBe("שיפוץ הבית");
  });
  it("maps older display text saved before purposes were masters", () => {
    expect(resolvePurposeLabel("Home Improvement", names, "he")).toBe("שיפוץ הבית");
  });
  it("makes an unknown code readable instead of failing", () => {
    expect(resolvePurposeLabel("DEBT_CONSOLIDATION", null, "en")).toBe("Debt Consolidation");
    expect(resolvePurposeLabel("DEBT_CONSOLIDATION", names, "en")).toBe("Debt Consolidation");
  });
  it("leaves free text untouched", () => {
    expect(resolvePurposeLabel("a new boat", names, "en")).toBe("a new boat");
  });
});
