import { z } from "zod";
import type { Condition, WorkflowDefinition } from "./types";

// Validation for workflow definitions, run on every save and publish. Layer 1 is a strict
// structural schema (mirrors workflow-spec/definition.schema.json); layer 2 is the cross-reference
// and graph checks a schema cannot express. Bad definitions never reach a case.

const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const label = z.object({ en: z.string().min(1), he: z.string().min(1) }).strict();
const vars = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

const condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({
      fact: z.string().regex(/^(input|case|actor|target)\.[A-Za-z0-9_.]+$/),
      op: z.enum(["eq", "ne", "truthy", "falsy", "in"]),
      value: z.unknown().optional(),
    }).strict(),
    z.object({ all: z.array(condition).min(1) }).strict(),
    z.object({ any: z.array(condition).min(1) }).strict(),
    z.object({ not: condition }).strict(),
  ]) as z.ZodType<Condition>,
);

const guard = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CASE_VISIBLE") }).strict(),
  z.object({ type: z.literal("OWNER_OR_ASSISTING") }).strict(),
  z.object({ type: z.literal("REFERRAL_LOCK"), status: key }).strict(),
  z.object({ type: z.literal("AMOUNT_POSITIVE"), field: z.string() }).strict(),
  z.object({ type: z.literal("MANDATE"), amountField: z.string() }).strict(),
  z.object({ type: z.literal("REASON_REQUIRED") }).strict(),
  z.object({ type: z.literal("TRACK_STATUS_IS"), track: key, statuses: z.array(key).min(1) }).strict(),
  z.object({ type: z.literal("REFERRAL_TARGET") }).strict(),
]);

const when = { when: condition.optional() };
const effect = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("SET"),
    field: z.enum(["submittedAt", "completionPercentage", "approvedAmount", "autoApproved", "referredToRole", "guarantorRequired", "currentSection"]),
    value: z.unknown(),
    ...when,
  }).strict(),
  z.object({ type: z.literal("REFERRAL_OPEN"), toRole: z.string(), ...when }).strict(),
  z.object({ type: z.literal("REFERRAL_CLOSE"), ...when }).strict(),
  z.object({ type: z.literal("NOTE"), noteType: z.string(), section: z.string(), text: z.string(), ...when }).strict(),
  z.object({ type: z.literal("NOTIFY"), template: z.string(), vars: vars.optional(), ...when }).strict(),
  z.object({ type: z.literal("EMAIL"), event: z.string(), vars: vars.optional(), ...when }).strict(),
  z.object({ type: z.literal("GENERATE_DOC"), doc: z.enum(["APPROVAL_LETTER"]), ...when }).strict(),
  z.object({ type: z.literal("CARD_PAYMENT"), mode: z.enum(["AUTHORISE"]), ...when }).strict(),
  z.object({ type: z.literal("PIN_FORM_VERSION"), ...when }).strict(),
  z.object({ type: z.literal("UNPIN_FORM_VERSION"), ...when }).strict(),
  z.object({ type: z.literal("RUN_AUTO_APPROVAL"), ...when }).strict(),
]);

const stage = z.object({
  key,
  label,
  owner: z.object({ roles: z.array(z.string()).optional(), unitRule: z.enum(["ANY", "CASE_UNIT", "CASE_UNIT_OR_ANCESTOR"]).optional() }).strict().optional(),
  sla: z.object({ hours: z.number().positive(), amberAtPercent: z.number().min(1).max(100).optional() }).strict().optional(),
  routing: z.object({ mode: z.enum(["MANUAL", "ROUND_ROBIN", "LEAST_LOADED"]) }).strict().optional(),
}).strict();

const status = z.object({
  key,
  stage: key.nullable(),
  category: z.enum(["DRAFT", "WAITING_CUSTOMER", "ACTIVE", "TERMINAL"]),
  badge: z.enum(["draft", "in-progress", "review", "approved", "declined"]),
  label,
}).strict();

const transition = z.object({
  key,
  label,
  actors: z.array(z.enum(["CUSTOMER", "STAFF", "SYSTEM"])).min(1),
  entitlement: z.string().regex(/^[a-z]+\.[A-Za-z]+$/).optional(),
  from: z.array(z.string()).min(1),
  to: key.optional(),
  guards: z.array(guard),
  effects: z.array(effect),
}).strict();

const track = z.object({
  key,
  label,
  entryPoints: z.array(z.object({ key, status: key }).strict()).optional(),
  initialStatus: key.optional(),
  statuses: z.array(status).min(1),
  transitions: z.array(transition),
}).strict();

const queue = z.object({
  key,
  label,
  track: key,
  statuses: z.array(key).min(1),
  requiresEntitlement: z.string(),
  requiresAlso: z.string().optional(),
  excludesEntitlement: z.string().optional(),
  applyScope: z.boolean(),
  hideReferredAbove: z.boolean(),
}).strict();

const definitionSchema = z.object({
  formatVersion: z.literal(1),
  key,
  name: label,
  appliesTo: z.object({ applicationTypes: z.array(z.enum(["PERSONAL", "BUSINESS"])).min(1).optional() }).strict().optional(),
  stages: z.array(stage).min(1),
  tracks: z.array(track).min(1),
  queues: z.array(queue),
}).strict();

export type ValidationResult = { ok: true; definition: WorkflowDefinition } | { ok: false; errors: string[] };

function dupes(keys: string[], what: string, errors: string[]) {
  const seen = new Set<string>();
  for (const k of keys) { if (seen.has(k)) errors.push(`Duplicate ${what}: ${k}`); seen.add(k); }
}

export function validateDefinition(raw: unknown, opts: { entitlementKeys: string[] }): ValidationResult {
  const parsed = definitionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  const def = parsed.data as unknown as WorkflowDefinition;
  const errors: string[] = [];
  const ents = new Set(opts.entitlementKeys);
  const stageKeys = new Set(def.stages.map((s) => s.key));

  dupes(def.stages.map((s) => s.key), "stage", errors);
  dupes(def.tracks.map((t) => t.key), "track", errors);
  dupes(def.queues.map((q) => q.key), "queue", errors);
  dupes(def.tracks.flatMap((t) => t.transitions.map((x) => x.key)), "transition key (keys are unique across all tracks)", errors);
  dupes(def.tracks.flatMap((t) => (t.entryPoints ?? []).map((e) => e.key)), "entry point", errors);

  for (const t of def.tracks) {
    const statusKeys = new Set(t.statuses.map((s) => s.key));
    dupes(t.statuses.map((s) => s.key), `status in ${t.key}`, errors);
    for (const s of t.statuses) if (s.stage && !stageKeys.has(s.stage)) errors.push(`${t.key}.${s.key}: unknown stage ${s.stage}`);
    for (const e of t.entryPoints ?? []) if (!statusKeys.has(e.status)) errors.push(`${t.key} entry point ${e.key}: unknown status ${e.status}`);
    if (t.initialStatus && !statusKeys.has(t.initialStatus)) errors.push(`${t.key}: unknown initialStatus ${t.initialStatus}`);
    if (!t.initialStatus && !(t.entryPoints ?? []).length) errors.push(`${t.key}: needs an entry point or an initialStatus`);

    for (const x of t.transitions) {
      const id = `${t.key}.${x.key}`;
      for (const f of x.from) if (f !== "*" && !statusKeys.has(f)) errors.push(`${id}: unknown from-status ${f}`);
      if (x.to && !statusKeys.has(x.to)) errors.push(`${id}: unknown target status ${x.to}`);
      if (x.entitlement && !ents.has(x.entitlement)) errors.push(`${id}: entitlement ${x.entitlement} is not in the catalog`);
      if (x.actors.includes("STAFF") && !x.actors.includes("CUSTOMER") && !x.entitlement) errors.push(`${id}: a staff-only transition needs an entitlement`);
      for (const g of x.guards) {
        if (g.type === "TRACK_STATUS_IS") {
          const other = def.tracks.find((o) => o.key === g.track);
          if (!other) errors.push(`${id}: guard references unknown track ${g.track}`);
          else for (const s of g.statuses) if (!other.statuses.some((k) => k.key === s)) errors.push(`${id}: guard references unknown status ${g.track}.${s}`);
        }
        if (g.type === "REFERRAL_LOCK" && !statusKeys.has(g.status)) errors.push(`${id}: REFERRAL_LOCK status ${g.status} is unknown`);
      }
      const hasTarget = x.guards.some((g) => g.type === "REFERRAL_TARGET");
      if (!hasTarget && x.effects.some((e) => JSON.stringify(e).includes("{{target."))) errors.push(`${id}: uses target.* without a REFERRAL_TARGET guard`);
    }
  }

  for (const q of def.queues) {
    const t = def.tracks.find((x) => x.key === q.track);
    if (!t) { errors.push(`queue ${q.key}: unknown track ${q.track}`); continue; }
    for (const s of q.statuses) if (!t.statuses.some((k) => k.key === s)) errors.push(`queue ${q.key}: unknown status ${s}`);
    for (const e of [q.requiresEntitlement, q.requiresAlso, q.excludesEntitlement]) if (e && !ents.has(e)) errors.push(`queue ${q.key}: entitlement ${e} is not in the catalog`);
  }

  // Every status must be reachable from an entry point or the track's initial status.
  for (const t of def.tracks) {
    const reach = new Set<string>([...(t.entryPoints ?? []).map((e) => e.status), ...(t.initialStatus ? [t.initialStatus] : [])]);
    for (let changed = true; changed;) {
      changed = false;
      for (const x of t.transitions) {
        if (x.to && !reach.has(x.to) && (x.from.includes("*") || x.from.some((f) => reach.has(f)))) { reach.add(x.to); changed = true; }
      }
    }
    for (const s of t.statuses) if (!reach.has(s.key)) errors.push(`${t.key}.${s.key}: status is unreachable`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, definition: def };
}
