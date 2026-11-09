import { describe, expect, it } from "vitest";
import { auditsEvent } from "../src/lib/workflow/audit-policy";

const run = (fromTo: [string, string], actorType: string, effects: string[] = []) => ({
  from: { status: fromTo[0] }, to: { status: fromTo[1] }, hostEffects: effects.map((type) => ({ type })), log: { actorType },
});

describe("which actions are audited under their event name", () => {
  it("audits every action that moves a case", () => {
    expect(auditsEvent(run(["SUBMITTED", "DECLINED"], "STAFF", ["NOTE"]))).toBe(true);
    expect(auditsEvent(run(["DRAFT", "SUBMITTED"], "CUSTOMER"))).toBe(true);
    expect(auditsEvent(run(["UNDER_REVIEW", "APPROVED"], "SYSTEM"))).toBe(true);
  });

  it("does not audit a customer's in-place action (autosaves)", () => {
    expect(auditsEvent(run(["IN_PROGRESS", "IN_PROGRESS"], "CUSTOMER"))).toBe(false);
  });

  it("does not double-count a note-only action: the note already audits itself", () => {
    expect(auditsEvent(run(["UNDER_REVIEW", "UNDER_REVIEW"], "STAFF", ["NOTE"]))).toBe(false);
  });

  it("audits other staff actions that change no status (e.g. editing a section)", () => {
    expect(auditsEvent(run(["UNDER_REVIEW", "UNDER_REVIEW"], "STAFF"))).toBe(true);
  });
});
