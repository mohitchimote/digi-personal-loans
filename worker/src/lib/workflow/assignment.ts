import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db/client";
import { loanApplications, orgUnits, users, wfCases, wfCaseTracks } from "../../db/schema";
import type { AuthUser } from "../../types";
import { isCaseVisible } from "../org";
import { allRoleConfigs, resolveRole } from "../roles";
import { ensureDefaultDefinition, getDefinitionRow, parseDefinition } from "./store";
import type { Label, StageDef, WorkflowDefinition } from "./types";

// Case ownership, routing and SLA clocks. Which roles own a stage, how cases are routed into it
// and how long it may take are all in the workflow definition (stage.owner / routing / sla);
// this module applies them. chooseAssignee and slaStatus are pure so the Java workflow-service can
// implement the same rules and be checked against the same unit tests.

type LoanRow = typeof loanApplications.$inferSelect;
export type RoutingMode = "MANUAL" | "ROUND_ROBIN" | "LEAST_LOADED";
export type SlaState = "NONE" | "GREEN" | "AMBER" | "RED";

export interface Candidate {
  userId: number;
  name: string;
  role: string;
  available: boolean;
  /** Open cases currently owned. */
  load: number;
  /** When this person was last given a case (null = never). */
  lastAssignedAt: string | null;
}

/** Picks who gets the case. Unavailable people are never chosen. Ties fall to whoever was
 * assigned longest ago, then the lowest user id, so the result is deterministic. */
export function chooseAssignee(candidates: Candidate[], mode: RoutingMode): Candidate | null {
  if (mode === "MANUAL") return null;
  const pool = candidates.filter((c) => c.available);
  if (pool.length === 0) return null;
  const since = (c: Candidate) => c.lastAssignedAt ?? "";
  const byRecency = (a: Candidate, b: Candidate) => since(a).localeCompare(since(b)) || a.userId - b.userId;
  pool.sort(mode === "LEAST_LOADED" ? (a, b) => a.load - b.load || byRecency(a, b) : byRecency);
  return pool[0];
}

export interface SlaInfo { state: SlaState; hours: number | null; dueAt: string | null; percentUsed: number | null }
const NO_SLA: SlaInfo = { state: "NONE", hours: null, dueAt: null, percentUsed: null };

/** Green until `amberAtPercent` (default 75) of the stage's allowed hours is used, amber until the
 * full allowance, red after. Calendar hours, not business hours. */
export function slaStatus(stage: StageDef | undefined, enteredAt: string, now: Date, closed = false): SlaInfo {
  if (closed || !stage?.sla) return NO_SLA;
  const entered = Date.parse(enteredAt);
  if (Number.isNaN(entered)) return NO_SLA;
  const allowedMs = stage.sla.hours * 3_600_000;
  const percent = ((now.getTime() - entered) / allowedMs) * 100;
  const amberAt = stage.sla.amberAtPercent ?? 75;
  return {
    state: percent >= 100 ? "RED" : percent >= amberAt ? "AMBER" : "GREEN",
    hours: stage.sla.hours,
    dueAt: new Date(entered + allowedMs).toISOString(),
    percentUsed: Math.round(percent),
  };
}

async function ancestorsOf(db: Db, unitId: number): Promise<number[]> {
  const all = await db.select({ id: orgUnits.id, parentId: orgUnits.parentId }).from(orgUnits);
  const parent = new Map(all.map((u) => [u.id, u.parentId]));
  const out: number[] = [];
  for (let id: number | null | undefined = unitId; id != null && !out.includes(id); id = parent.get(id)) out.push(id);
  return out;
}

const terminalStatuses = (def: WorkflowDefinition, track: string) =>
  new Set((def.tracks.find((t) => t.key === track)?.statuses ?? []).filter((s) => s.category === "TERMINAL").map((s) => s.key));

/** Staff who may own a case in `stageKey`: holders of the stage's owning roles (or, with none
 * configured, any role that can open the pipeline), matched on org unit by the stage's unit rule,
 * and able to see the case under their own role's scope. Includes unavailable people (flagged). */
export async function eligibleStaff(db: Db, def: WorkflowDefinition, stageKey: string | null, app: { orgUnitId: number | null }, track = "case"): Promise<Candidate[]> {
  const stage = def.stages.find((s) => s.key === stageKey);
  const configs = await allRoleConfigs(db);
  const roleCodes = stage?.owner?.roles?.length
    ? stage.owner.roles
    : configs.filter((r) => r.entitlements.has("queue.pipeline")).map((r) => r.code);
  if (roleCodes.length === 0) return [];

  const staff = await db.select().from(users).where(and(inArray(users.role, roleCodes), eq(users.enabled, true)));
  const rule = stage?.owner?.unitRule ?? "ANY";
  const caseAncestors = rule === "CASE_UNIT_OR_ANCESTOR" && app.orgUnitId != null ? await ancestorsOf(db, app.orgUnitId) : [];

  const eligible: typeof staff = [];
  for (const u of staff) {
    if (app.orgUnitId != null) {
      if (rule === "CASE_UNIT" && u.orgUnitId !== app.orgUnitId) continue;
      if (rule === "CASE_UNIT_OR_ANCESTOR" && (u.orgUnitId == null || !caseAncestors.includes(u.orgUnitId))) continue;
    }
    const cfg = await resolveRole(db, u.role);
    if (!cfg.isStaff || !(await isCaseVisible(db, u as AuthUser, cfg.scope, app))) continue;
    eligible.push(u);
  }
  if (eligible.length === 0) return [];

  const done = terminalStatuses(def, track);
  const owned = await db.select().from(wfCaseTracks).where(and(inArray(wfCaseTracks.assigneeUserId, eligible.map((u) => u.id)), eq(wfCaseTracks.trackKey, track)));
  return eligible.map((u) => {
    const mine = owned.filter((t) => t.assigneeUserId === u.id);
    return {
      userId: u.id, name: u.fullName?.trim() || u.email, role: u.role, available: u.isAvailable,
      load: mine.filter((t) => !done.has(t.status)).length,
      lastAssignedAt: mine.reduce<string | null>((latest, t) => (t.assignedAt && (!latest || t.assignedAt > latest) ? t.assignedAt : latest), null),
    };
  });
}

/** Who a case entering `stageKey` should be given to, per that stage's routing mode (null = nobody). */
export async function routeOnEntry(db: Db, def: WorkflowDefinition, app: { orgUnitId: number | null }, stageKey: string | null, track: string): Promise<Candidate | null> {
  const stage = def.stages.find((s) => s.key === stageKey);
  const mode = stage?.routing?.mode ?? "MANUAL";
  if (mode === "MANUAL") return null;
  return chooseAssignee(await eligibleStaff(db, def, stageKey, app, track), mode);
}

// ------------------------------------------------------------------ read model for lists and detail

export interface CaseWorkflowInfo {
  track: string;
  status: string;
  stage: string | null;
  stageLabel: Label | null;
  enteredAt: string;
  assigneeUserId: number | null;
  assigneeName: string | null;
  assignedAt: string | null;
  sla: SlaInfo;
}

const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Stage, owner and SLA clock for each application, using the definition version each case is
 * pinned to. A case that has no workflow rows yet is described from its status. */
export async function workflowInfoFor(db: Db, apps: LoanRow[], now = new Date()): Promise<Map<string, CaseWorkflowInfo>> {
  const out = new Map<string, CaseWorkflowInfo>();
  if (apps.length === 0) return out;
  const refs = apps.map((a) => a.applicationRef);

  const pinned = new Map<string, number>();
  const tracks = new Map<string, (typeof wfCaseTracks.$inferSelect)[]>();
  for (const part of chunk(refs, 50)) {
    for (const r of await db.select().from(wfCases).where(inArray(wfCases.applicationRef, part))) pinned.set(r.applicationRef, r.definitionId);
    for (const t of await db.select().from(wfCaseTracks).where(inArray(wfCaseTracks.applicationRef, part))) {
      tracks.set(t.applicationRef, [...(tracks.get(t.applicationRef) ?? []), t]);
    }
  }

  const published = await ensureDefaultDefinition(db);
  const defs = new Map<number, WorkflowDefinition>([[published.id, parseDefinition(published)]]);
  for (const id of new Set(pinned.values())) if (!defs.has(id)) defs.set(id, parseDefinition(await getDefinitionRow(db, id)));

  const assigneeIds = [...new Set([...tracks.values()].flat().map((t) => t.assigneeUserId).filter((x): x is number => x != null))];
  const names = new Map<number, string>();
  for (const part of chunk(assigneeIds, 50)) {
    for (const u of await db.select().from(users).where(inArray(users.id, part))) names.set(u.id, u.fullName?.trim() || u.email);
  }

  for (const app of apps) {
    const def = defs.get(pinned.get(app.applicationRef) ?? published.id)!;
    const statusDef = (track: string, status: string) => def.tracks.find((t) => t.key === track)?.statuses.find((s) => s.key === status);
    let rows = tracks.get(app.applicationRef) ?? [];
    if (!rows.some((r) => r.trackKey === "case")) {
      rows = [...rows, { applicationRef: app.applicationRef, trackKey: "case", status: app.status, stage: statusDef("case", app.status)?.stage ?? null, enteredAt: app.updatedAt ?? now.toISOString(), assigneeUserId: null, assignedAt: null }];
    }
    // A track that is in progress (it has reached a stage and is not finished) wins, so a finished
    // or not-yet-started disbursement never hides the case's own clock.
    const open = rows.filter((r) => r.stage != null && statusDef(r.trackKey, r.status)?.category !== "TERMINAL");
    const primary = open.find((r) => r.trackKey !== "case") ?? open[0] ?? rows.find((r) => r.trackKey === "case")!;
    const stage = def.stages.find((s) => s.key === primary.stage);
    out.set(app.applicationRef, {
      track: primary.trackKey, status: primary.status, stage: primary.stage, stageLabel: stage?.label ?? null, enteredAt: primary.enteredAt,
      assigneeUserId: primary.assigneeUserId, assigneeName: primary.assigneeUserId != null ? (names.get(primary.assigneeUserId) ?? null) : null, assignedAt: primary.assignedAt,
      sla: slaStatus(stage, primary.enteredAt, now, statusDef(primary.trackKey, primary.status)?.category === "TERMINAL"),
    });
  }
  return out;
}

/** Adds `workflow` (stage, owner, SLA) to each application row for the queue and detail screens. */
export async function withWorkflowInfo(db: Db, apps: LoanRow[]): Promise<(LoanRow & { workflow: CaseWorkflowInfo | null })[]> {
  const info = await workflowInfoFor(db, apps);
  return apps.map((a) => ({ ...a, workflow: info.get(a.applicationRef) ?? null }));
}
