import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inputsOf, resolveUi } from "../src/lib/workflow/presentation";

const specDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../workflow-spec");
const def = JSON.parse(readFileSync(resolve(specDir, "loan-origination.v1.json"), "utf8"));
const find = (key: string) => {
  for (const track of def.tracks) {
    const transition = track.transitions.find((x: any) => x.key === key);
    if (transition) return { track: track.key as string, transition };
  }
  throw new Error(`no action ${key}`);
};
const inputs = (key: string) => Object.fromEntries(inputsOf(find(key).transition).map((i) => [i.field, `${i.kind}${i.required ? "!" : ""}`]));

describe("which inputs an action asks for", () => {
  it("reads required inputs from guards", () => {
    expect(inputs("decline")).toEqual({ reason: "text!" });
  });

  it("offers the fields effects and conditions refer to, typed by the known vocabulary", () => {
    // reason is required by its guard; requireGuarantor is only referenced by effects (optional checkbox)
    expect(inputs("send_back")).toEqual({ reason: "text!", requireGuarantor: "boolean" });
  });

  it("asks for nothing when the action needs nothing", () => {
    expect(inputs("authorise")).toEqual({});
    expect(inputs("second_check")).toEqual({});
  });

  it("does not ask the person for fields the note composer supplies", () => {
    expect(Object.keys(inputs("add_note"))).not.toContain("section");
    expect(Object.keys(inputs("add_note"))).not.toContain("noteType");
  });

  it("an amount guard makes the amount a number input", () => {
    expect(inputs("approve").approvedAmount).toMatch(/^number/);
  });
});

describe("how an action is presented", () => {
  it("defaults to the general area, secondary, no icon, stay on the case", () => {
    expect(resolveUi("case", { ...find("add_note").transition, ui: undefined })).toEqual({ area: "general", style: "secondary", icon: null, after: null });
  });

  it("puts disbursement-track actions in the disbursement area unless told otherwise", () => {
    expect(resolveUi("disbursement", { ...find("authorise").transition, ui: undefined }).area).toBe("disbursement");
    expect(resolveUi("disbursement", { ...find("authorise").transition, ui: { area: "general" } }).area).toBe("general");
  });

  it("defaults decision-style actions to the Decision area when the definition says nothing", () => {
    const bare = (key: string) => resolveUi("case", { ...find(key).transition, ui: undefined }).area;
    for (const k of ["approve", "decline", "send_back", "refer"]) expect(bare(k), k).toBe("decision");
    for (const k of ["add_note", "request_documents", "approve_conditional", "submit", "withdraw"]) expect(bare(k), k).toBe("general");
  });

  it("carries what the definition sets", () => {
    expect(resolveUi("case", find("decline").transition)).toEqual({ area: "decision", style: "danger", icon: "close", after: "pipeline" });
  });
});
