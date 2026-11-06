import type {
  ActionsResult, Actor, CaseState, CreateResult, Facts, Failure, Guard, HostEffect, LadderRole, QueueResult,
  TrackDef, TrackStates, TransitionDef, TransitionRequest, TransitionResult, WorkflowDefinition,
} from "./types";
import { evalCondition, resolveTemplate, resolveVars, type TemplateContext } from "./template";

// The workflow engine: pure functions, no I/O. The host (Worker routes today) resolves `facts`
// first, calls these, then persists the result and runs the host effects. The contract and the
// evaluation order are fixed in workflow-spec/README.md and checked by workflow-spec/vectors.

const fail = (status: number, code: string, message: string): Failure => ({ ok: false, status, code, message });

function stageOf(track: TrackDef, status: string): string | null {
  return track.statuses.find((s) => s.key === status)?.stage ?? null;
}

export function createCase(def: WorkflowDefinition, entryKey: string): CreateResult {
  const entry = def.tracks.flatMap((t) => (t.entryPoints ?? []).map((e) => ({ track: t, entry: e }))).find((x) => x.entry.key === entryKey);
  if (!entry) return fail(404, "UNKNOWN_ENTRY", `Unknown entry point: ${entryKey}`);
  const tracks: TrackStates = {};
  for (const t of def.tracks) {
    const status = t === entry.track ? entry.entry.status : (t.initialStatus ?? t.entryPoints?.[0]?.status);
    if (!status) return fail(500, "INVALID_DEFINITION", `Track ${t.key} has no initial status`);
    tracks[t.key] = { status, stage: stageOf(t, status) };
  }
  return { ok: true, tracks };
}

export function findTransition(def: WorkflowDefinition, action: string): { track: TrackDef; transition: TransitionDef } | null {
  for (const track of def.tracks) {
    const transition = track.transitions.find((x) => x.key === action);
    if (transition) return { track, transition };
  }
  return null;
}

/** Guards that need user input to be judged; skipped when listing which actions are available. */
const INPUT_DEPENDENT = new Set<Guard["type"]>(["AMOUNT_POSITIVE", "MANDATE", "REASON_REQUIRED", "REFERRAL_TARGET"]);

interface GuardEnv {
  def: WorkflowDefinition;
  track: TrackDef;
  c: CaseState;
  actor: Actor;
  facts: Facts;
  input: Record<string, unknown>;
  target: LadderRole | null;
}

function runGuard(g: Guard, env: GuardEnv): Failure | null {
  const { c, actor, facts, input } = env;
  switch (g.type) {
    case "CASE_VISIBLE":
      return facts.caseVisible ? null : fail(404, "CASE_NOT_FOUND", "Application not found.");

    case "OWNER_OR_ASSISTING": {
      const ok =
        actor.type === "SYSTEM" ||
        (actor.type === "CUSTOMER" && facts.isOwner) ||
        (actor.type === "STAFF" && actor.entitlements.includes("case.actAsCustomer"));
      return ok ? null : fail(403, "NOT_OWNER", "You can only act on your own applications.");
    }

    case "REFERRAL_LOCK": {
      const current = c.tracks[env.track.key]?.status;
      const to = c.fields.referredToRole;
      if (current !== g.status || !to || actor.rank === null) return null;
      const target = facts.ladder.find((r) => r.code === to);
      if (target && actor.rank < target.rank) {
        return fail(403, "REFERRAL_LOCKED", `This case has been referred to ${target.label} and can only be actioned at that level or above.`);
      }
      return null;
    }

    case "AMOUNT_POSITIVE": {
      const v = input[g.field];
      return typeof v === "number" && Number.isFinite(v) && v > 0 ? null : fail(400, "INVALID_AMOUNT", "Amount must be greater than zero.");
    }

    case "MANDATE": {
      if (actor.type === "SYSTEM") return null;
      const amount = Number(input[g.amountField]);
      const limit = facts.mandateLimit ?? 0;
      return amount > limit
        ? fail(403, "OVER_MANDATE", `Amount (${amount}) exceeds your mandate limit (${limit}) for this case. Refer it to a higher approval level - there is no override.`)
        : null;
    }

    case "REASON_REQUIRED": {
      const r = input.reason;
      return typeof r === "string" && r.trim() !== "" ? null : fail(400, "REASON_REQUIRED", "A reason is required.");
    }

    case "TRACK_STATUS_IS": {
      const s = c.tracks[g.track]?.status;
      return s !== undefined && g.statuses.includes(s) ? null : fail(409, "INVALID_STATE", `Not allowed while ${g.track} is ${s ?? "unknown"}.`);
    }

    case "REFERRAL_TARGET": {
      const ladder = [...facts.ladder].sort((a, b) => a.rank - b.rank);
      const myRank = actor.rank ?? -1;
      const asked = typeof input.toRole === "string" && input.toRole !== "" ? input.toRole : null;
      if (asked) {
        const t = ladder.find((r) => r.code === asked);
        if (!t || myRank >= t.rank) return fail(400, "INVALID_TARGET", "A case can only be referred to a role above your own.");
        env.target = t;
        return null;
      }
      const next = ladder.find((r) => r.rank > myRank);
      if (!next) return fail(400, "NO_HIGHER_LEVEL", "There is no higher approval level to refer this case to.");
      env.target = next;
      return null;
    }
  }
}

function applicable(t: TransitionDef, actor: Actor, currentStatus: string | undefined): boolean {
  if (!t.actors.includes(actor.type)) return false;
  if (actor.type === "STAFF" && t.entitlement && !actor.entitlements.includes(t.entitlement)) return false;
  return t.from.includes("*") || (currentStatus !== undefined && t.from.includes(currentStatus));
}

export function evaluate(def: WorkflowDefinition, args: { case: CaseState; request: TransitionRequest; facts: Facts }): TransitionResult {
  const { case: c, request, facts } = args;
  const { actor } = request;
  const input = (request.input ?? {}) as Record<string, unknown>;

  const found = findTransition(def, request.action);
  if (!found) return fail(404, "UNKNOWN_ACTION", `Unknown action: ${request.action}`);
  const { track, transition: t } = found;

  if (!t.actors.includes(actor.type)) return fail(403, "ACTOR_NOT_ALLOWED", `${actor.type} cannot perform ${t.key}.`);
  if (actor.type === "STAFF" && t.entitlement && !actor.entitlements.includes(t.entitlement)) {
    return fail(403, "MISSING_ENTITLEMENT", "Forbidden.");
  }

  const current = c.tracks[track.key];
  if (!current) return fail(500, "INVALID_CASE", `Case has no ${track.key} track.`);
  if (!t.from.includes("*") && !t.from.includes(current.status)) {
    return fail(409, "INVALID_STATE", `${t.key} is not allowed while the case is ${current.status}.`);
  }

  const env: GuardEnv = { def, track, c, actor, facts, input, target: null };
  for (const g of t.guards) {
    const failure = runGuard(g, env);
    if (failure) return failure;
  }

  // ---- effects
  const ctx: TemplateContext = {
    now: request.now,
    input,
    case: c.fields,
    actor: { name: actor.name, userId: actor.userId, role: actor.role },
    target: env.target ?? undefined,
  };
  const fieldUpdates: Record<string, unknown> = {};
  const referral: { close: boolean; open: { toRole: string } | null } = { close: false, open: null };
  const hostEffects: HostEffect[] = [];

  for (const e of t.effects) {
    if (e.when && !evalCondition(e.when, ctx)) continue;
    switch (e.type) {
      case "SET": fieldUpdates[e.field] = resolveTemplate(e.value, ctx); break;
      case "REFERRAL_CLOSE": referral.close = true; break;
      case "REFERRAL_OPEN": referral.open = { toRole: String(resolveTemplate(e.toRole, ctx)) }; break;
      case "NOTE":
        hostEffects.push({ type: "NOTE", noteType: resolveTemplate(e.noteType, ctx), section: resolveTemplate(e.section, ctx), text: resolveTemplate(e.text, ctx) });
        break;
      case "NOTIFY": {
        const vars = resolveVars(e.vars, ctx);
        hostEffects.push(vars ? { type: "NOTIFY", template: e.template, vars } : { type: "NOTIFY", template: e.template });
        break;
      }
      case "EMAIL": {
        const vars = resolveVars(e.vars, ctx);
        hostEffects.push(vars ? { type: "EMAIL", event: e.event, vars } : { type: "EMAIL", event: e.event });
        break;
      }
      case "GENERATE_DOC": hostEffects.push({ type: "GENERATE_DOC", doc: e.doc }); break;
      case "CARD_PAYMENT": hostEffects.push({ type: "CARD_PAYMENT", mode: e.mode }); break;
      case "PIN_FORM_VERSION":
      case "UNPIN_FORM_VERSION":
      case "RUN_AUTO_APPROVAL":
        hostEffects.push({ type: e.type });
        break;
    }
  }

  const toStatus = t.to ?? current.status;
  const to = t.to ? { status: t.to, stage: stageOf(track, t.to) } : { ...current };
  const tracks: TrackStates = Object.fromEntries(Object.entries(c.tracks).map(([k, v]) => [k, { ...v }]));
  tracks[track.key] = to;

  return {
    ok: true,
    action: t.key,
    track: track.key,
    from: { ...current },
    to,
    tracks,
    fieldUpdates,
    referral,
    hostEffects,
    log: {
      action: t.key,
      track: track.key,
      fromStatus: current.status,
      toStatus,
      fromStage: current.stage,
      toStage: to.stage,
      actorType: actor.type,
      actorUserId: actor.userId,
      actorName: actor.name,
      actorRole: actor.role,
      reason: typeof input.reason === "string" ? input.reason : null,
      at: request.now,
    },
  };
}

/** Which actions the actor can take on this case right now, for the UI. See workflow-spec/README.md. */
export function allowedActions(def: WorkflowDefinition, args: { case: CaseState; actor: Actor; facts: Facts }): ActionsResult {
  const { case: c, actor, facts } = args;
  const allowed: string[] = [];
  const blocked: Record<string, string> = {};
  for (const track of def.tracks) {
    for (const t of track.transitions) {
      if (!applicable(t, actor, c.tracks[track.key]?.status)) continue;
      const env: GuardEnv = { def, track, c, actor, facts, input: {}, target: null };
      let failure: Failure | null = null;
      for (const g of t.guards) {
        if (INPUT_DEPENDENT.has(g.type)) continue;
        failure = runGuard(g, env);
        if (failure) break;
      }
      if (!failure) allowed.push(t.key);
      else if (failure.code !== "NOT_OWNER" && failure.code !== "CASE_NOT_FOUND") blocked[t.key] = failure.code;
    }
  }
  return { allowed: allowed.sort(), blocked };
}

export function queueAccess(def: WorkflowDefinition, args: { actor: Actor; queue: string }): QueueResult {
  const q = def.queues.find((x) => x.key === args.queue);
  if (!q) return fail(404, "UNKNOWN_QUEUE", `Unknown queue: ${args.queue}`);
  const has = (k: string) => args.actor.entitlements.includes(k);
  if (!has(q.requiresEntitlement) || (q.requiresAlso && !has(q.requiresAlso)) || (q.excludesEntitlement && has(q.excludesEntitlement))) {
    return fail(403, "MISSING_ENTITLEMENT", "Forbidden.");
  }
  return { ok: true, queue: q.key, statuses: [...q.statuses], applyScope: q.applyScope, hideReferredAbove: q.hideReferredAbove };
}
