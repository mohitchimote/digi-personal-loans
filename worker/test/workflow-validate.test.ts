import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENTITLEMENT_KEYS } from "../src/lib/entitlements";
import { validateDefinition } from "../src/lib/workflow/validate";

const specDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../workflow-spec");
const base = () => JSON.parse(readFileSync(resolve(specDir, "loan-origination.v1.json"), "utf8"));
const check = (d: unknown) => validateDefinition(d, { entitlementKeys: ENTITLEMENT_KEYS });
const errorsOf = (d: unknown) => { const r = check(d); return r.ok ? [] : r.errors; };

describe("definition validation", () => {
  it("accepts the default definition", () => {
    const r = check(base());
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("rejects unknown top-level keys (strict)", () => {
    const d = base(); d.surprise = 1;
    expect(errorsOf(d).length).toBeGreaterThan(0);
  });

  it("rejects an unknown guard type", () => {
    const d = base(); d.tracks[0].transitions[0].guards.push({ type: "MAGIC" });
    expect(errorsOf(d).length).toBeGreaterThan(0);
  });

  it("rejects a transition to an unknown status", () => {
    const d = base(); d.tracks[0].transitions.find((t: { key: string }) => t.key === "decline").to = "NOPE";
    expect(errorsOf(d).join("\n")).toMatch(/decline: unknown target status NOPE/);
  });

  it("rejects an entitlement that is not in the catalog", () => {
    const d = base(); d.tracks[0].transitions.find((t: { key: string }) => t.key === "send_back").entitlement = "case.fly";
    expect(errorsOf(d).join("\n")).toMatch(/entitlement case.fly is not in the catalog/);
  });

  it("rejects a staff-only transition with no entitlement", () => {
    const d = base(); delete d.tracks[0].transitions.find((t: { key: string }) => t.key === "decline").entitlement;
    expect(errorsOf(d).join("\n")).toMatch(/staff-only transition needs an entitlement/);
  });

  it("rejects an unreachable status", () => {
    const d = base();
    d.tracks[0].statuses.push({ key: "ORPHAN", stage: "INTAKE", category: "ACTIVE", badge: "draft", label: { en: "x", he: "x" } });
    expect(errorsOf(d).join("\n")).toMatch(/case.ORPHAN: status is unreachable/);
  });

  it("rejects a queue with an unknown status", () => {
    const d = base(); d.queues[0].statuses.push("GHOST");
    expect(errorsOf(d).join("\n")).toMatch(/queue pipeline: unknown status GHOST/);
  });

  it("rejects target.* templates without a REFERRAL_TARGET guard", () => {
    const d = base();
    d.tracks[0].transitions.find((t: { key: string }) => t.key === "add_note").effects.push({ type: "NOTE", noteType: "X", section: "g", text: "{{target.code}}" });
    expect(errorsOf(d).join("\n")).toMatch(/add_note: uses target\.\* without a REFERRAL_TARGET guard/);
  });

  it("rejects a guard that points at an unknown track or status", () => {
    const d = base();
    d.tracks[1].transitions[0].guards.push({ type: "TRACK_STATUS_IS", track: "ghost", statuses: ["X"] });
    d.tracks[1].transitions[1].guards.push({ type: "TRACK_STATUS_IS", track: "case", statuses: ["NOPE"] });
    const e = errorsOf(d).join("\n");
    expect(e).toMatch(/unknown track ghost/);
    expect(e).toMatch(/unknown status case.NOPE/);
  });

  it("rejects duplicate transition keys across tracks", () => {
    const d = base();
    d.tracks[1].transitions[0].key = "approve";
    expect(errorsOf(d).join("\n")).toMatch(/Duplicate transition key/);
  });

  it("rejects two actions that emit the same event, and malformed event names", () => {
    const d = base();
    d.tracks[1].transitions[0].event = "case.approved";
    d.tracks[1].transitions[1].event = "case.approved";
    expect(errorsOf(d).join(";")).toMatch(/Duplicate event/);
    d.tracks[1].transitions[1].event = "Not An Event";
    expect(errorsOf(d).join(";")).not.toBe("");
  });

  it("rejects an action whose default event name would be invalid, unless it sets an explicit one", () => {
    const d = base();
    d.tracks[1].transitions[0].key = "Approve-Early";
    delete d.tracks[1].transitions[0].event;
    expect(errorsOf(d).join(";")).toMatch(/default event .* is not a valid event name/);
    d.tracks[1].transitions[0].event = "disbursement.approvedEarly";
    expect(errorsOf(d).join(";")).not.toMatch(/default event/);
  });

  it("accepts a ui block and rejects unknown areas, styles, icons and stray keys", () => {
    const d = base();
    d.tracks[1].transitions[0].ui = { area: "decision", style: "danger", icon: "close", after: "pipeline" };
    expect(errorsOf(d)).toEqual([]);
    for (const bad of [{ area: "sidebar" }, { style: "loud" }, { icon: "Not An Icon" }, { after: "home" }, { colour: "red" }]) {
      d.tracks[1].transitions[0].ui = bad;
      expect(errorsOf(d).join(";"), JSON.stringify(bad)).not.toBe("");
    }
  });

  it("rejects a track with no way to start", () => {
    const d = base(); delete d.tracks[1].initialStatus;
    expect(errorsOf(d).join("\n")).toMatch(/needs an entry point or an initialStatus/);
  });
});
