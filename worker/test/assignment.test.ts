import { describe, expect, it } from "vitest";
import { chooseAssignee, slaStatus, type Candidate } from "../src/lib/workflow/assignment";
import { validateDefinition } from "../src/lib/workflow/validate";
import { ENTITLEMENT_KEYS } from "../src/lib/entitlements";
import loanOrigination from "../../workflow-spec/loan-origination.v1.json";

const cand = (userId: number, o: Partial<Candidate> = {}): Candidate => ({ userId, name: `U${userId}`, role: "UNDERWRITER", available: true, load: 0, lastAssignedAt: null, ...o });

describe("chooseAssignee", () => {
  it("MANUAL never picks anyone", () => {
    expect(chooseAssignee([cand(1)], "MANUAL")).toBeNull();
  });
  it("returns null when nobody is available", () => {
    expect(chooseAssignee([cand(1, { available: false })], "ROUND_ROBIN")).toBeNull();
    expect(chooseAssignee([], "LEAST_LOADED")).toBeNull();
  });
  it("round-robin picks whoever was assigned longest ago, never-assigned first", () => {
    const picked = chooseAssignee([cand(1, { lastAssignedAt: "2026-01-02T00:00:00Z" }), cand(2, { lastAssignedAt: "2026-01-01T00:00:00Z" }), cand(3, { lastAssignedAt: "2026-01-03T00:00:00Z" })], "ROUND_ROBIN");
    expect(picked?.userId).toBe(2);
    expect(chooseAssignee([cand(1, { lastAssignedAt: "2026-01-02T00:00:00Z" }), cand(9)], "ROUND_ROBIN")?.userId).toBe(9);
  });
  it("round-robin skips unavailable staff even if they waited longest", () => {
    expect(chooseAssignee([cand(1, { available: false }), cand(2, { lastAssignedAt: "2026-01-05T00:00:00Z" })], "ROUND_ROBIN")?.userId).toBe(2);
  });
  it("least-loaded picks the fewest open cases; ties go to the longest wait, then the lowest id", () => {
    expect(chooseAssignee([cand(1, { load: 3 }), cand(2, { load: 1 }), cand(3, { load: 2 })], "LEAST_LOADED")?.userId).toBe(2);
    expect(chooseAssignee([cand(1, { load: 1, lastAssignedAt: "2026-01-02T00:00:00Z" }), cand(2, { load: 1, lastAssignedAt: "2026-01-01T00:00:00Z" })], "LEAST_LOADED")?.userId).toBe(2);
    expect(chooseAssignee([cand(5), cand(4)], "LEAST_LOADED")?.userId).toBe(4);
  });
});

describe("slaStatus", () => {
  const stage = { key: "REVIEW", label: { en: "R", he: "R" }, sla: { hours: 10, amberAtPercent: 80 } };
  const at = (h: number) => new Date(Date.parse("2026-01-01T00:00:00Z") + h * 3_600_000);
  const entered = "2026-01-01T00:00:00Z";

  it("is green early, amber from the threshold, red once the allowance is used", () => {
    expect(slaStatus(stage, entered, at(7.9)).state).toBe("GREEN");
    expect(slaStatus(stage, entered, at(8)).state).toBe("AMBER");
    expect(slaStatus(stage, entered, at(9.99)).state).toBe("AMBER");
    expect(slaStatus(stage, entered, at(10)).state).toBe("RED");
  });
  it("reports the due time and percent used", () => {
    const s = slaStatus(stage, entered, at(5));
    expect(s.dueAt).toBe("2026-01-01T10:00:00.000Z");
    expect(s.percentUsed).toBe(50);
  });
  it("defaults amber to 75 percent", () => {
    const s = { key: "X", label: { en: "X", he: "X" }, sla: { hours: 4 } };
    expect(slaStatus(s, entered, at(2.9)).state).toBe("GREEN");
    expect(slaStatus(s, entered, at(3)).state).toBe("AMBER");
  });
  it("has no clock without an SLA, for closed cases, or with a bad date", () => {
    expect(slaStatus({ key: "X", label: { en: "X", he: "X" } }, entered, at(100)).state).toBe("NONE");
    expect(slaStatus(stage, entered, at(100), true).state).toBe("NONE");
    expect(slaStatus(stage, "nonsense", at(1)).state).toBe("NONE");
    expect(slaStatus(undefined, entered, at(1)).state).toBe("NONE");
  });
});

describe("stage routing in definitions", () => {
  const base = () => structuredClone(loanOrigination) as any;
  it("the shipped definition (with SLAs and an owning role set) is valid", () => {
    expect(validateDefinition(base(), { entitlementKeys: ENTITLEMENT_KEYS }).ok).toBe(true);
  });
  it("accepts every routing mode and rejects an unknown one", () => {
    for (const mode of ["MANUAL", "ROUND_ROBIN", "LEAST_LOADED"]) {
      const d = base(); d.stages[1].routing = { mode };
      expect(validateDefinition(d, { entitlementKeys: ENTITLEMENT_KEYS }).ok).toBe(true);
    }
    const bad = base(); bad.stages[1].routing = { mode: "RANDOM" };
    expect(validateDefinition(bad, { entitlementKeys: ENTITLEMENT_KEYS }).ok).toBe(false);
  });
});
