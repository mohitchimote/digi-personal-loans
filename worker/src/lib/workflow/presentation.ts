import type { TransitionDef } from "./types";

// How an action is presented to people: which inputs it asks for and where its button goes. Pure
// functions over a transition, so they are shared by the host and unit-tested without a database.

/** One thing the caller must (or may) supply when running an action. */
export interface ActionInput { field: string; kind: "text" | "number" | "role" | "boolean"; required: boolean }

/** An action's presentation with the defaults filled in, so every client resolves it the same way. */
export interface ResolvedUi { area: "decision" | "disbursement" | "general"; style: "primary" | "secondary" | "danger"; icon: string | null; after: "pipeline" | null }

/** Where an action goes when its definition does not say. Disbursement-track actions go to the
 * disbursement area. A staff-only action that asks for a decision input (a reason, an amount, a
 * role to hand the case to) is a decision, so it defaults to the Decision area; this keeps cases on
 * older versions, which carry no `ui` at all, behaving like the current ones. */
function defaultArea(trackKey: string, t: TransitionDef): ResolvedUi["area"] {
  if (trackKey === "disbursement") return "disbursement";
  const staffOnly = t.actors.length === 1 && t.actors[0] === "STAFF";
  const asksForDecision = inputsOf(t).some((i) => i.required || i.field === "toRole" || i.kind === "number");
  return staffOnly && asksForDecision ? "decision" : "general";
}

export function resolveUi(trackKey: string, t: TransitionDef): ResolvedUi {
  return {
    area: t.ui?.area ?? defaultArea(trackKey, t),
    style: t.ui?.style ?? "secondary",
    icon: t.ui?.icon ?? null,
    after: t.ui?.after ?? null,
  };
}

/** Input fields the UI knows how to render specifically; anything else referenced is free text. */
const KNOWN_KINDS: Record<string, ActionInput["kind"]> = { reason: "text", approvedAmount: "number", toRole: "role", requireGuarantor: "boolean" };
/** Referenced as input.* but supplied by the case-note composer, not asked of the person running the action. */
const NOT_ASKED = new Set(["section", "noteType"]);

/** The inputs an action asks for, so the UI can render the right fields for any action. Guards say
 * which are required (a reason, an amount); every other `input.<field>` the action's effects and
 * conditions refer to is offered as an optional input, so an action added in the builder gets its
 * fields without a code change. */
export function inputsOf(t: TransitionDef): ActionInput[] {
  const out = new Map<string, ActionInput>();
  for (const g of t.guards) {
    if (g.type === "REASON_REQUIRED") out.set("reason", { field: "reason", kind: "text", required: true });
    else if (g.type === "AMOUNT_POSITIVE") out.set(g.field, { field: g.field, kind: "number", required: true });
    else if (g.type === "MANDATE" && !out.has(g.amountField)) out.set(g.amountField, { field: g.amountField, kind: "number", required: false });
    else if (g.type === "REFERRAL_TARGET") out.set("toRole", { field: "toRole", kind: "role", required: false });
  }
  const refs = JSON.stringify([t.effects, t.guards]).matchAll(/input\.([A-Za-z_][A-Za-z0-9_]*)/g);
  for (const m of refs) {
    const field = m[1];
    if (NOT_ASKED.has(field) || out.has(field)) continue;
    out.set(field, { field, kind: KNOWN_KINDS[field] ?? "text", required: false });
  }
  return [...out.values()];
}
