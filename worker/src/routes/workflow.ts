import { Hono, type Context } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { loanApplications, orgUnits, users, wfCaseTracks } from "../db/schema";
import { assertEntitlement, isStaff, requireAuth } from "../middleware/auth";
import { AppError } from "../lib/errors";
import { assertCaseVisible, caseScopeCondition } from "../lib/org";
import { recordAudit } from "../lib/audit";
import { describeActions } from "../lib/workflow/host";
import { loadCase, projectPublished, statusesByCategory } from "../lib/workflow/store";
import { eligibleStaff, workflowInfoFor, type CaseWorkflowInfo } from "../lib/workflow/assignment";

// Runtime API for the UI: what the statuses are called, which queues exist, what the signed-in
// user can do to a case right now, who owns it and how long it has been in its stage. The UI
// renders from these instead of hard-coding status sets and action buttons.
export const workflow = new Hono<AppEnv>();
workflow.use("*", requireAuth);

workflow.get("/definition", async (c) => c.json(await projectPublished(getDb(c.env.DB))));

workflow.get("/cases/:ref/actions", async (c) => c.json(await describeActions(c, c.req.param("ref"))));

// ------------------------------------------------------------------ ownership

const who = (c: Context<AppEnv>) => { const u = c.get("authUser"); return { actor: u.fullName?.trim() || u.email, actorRole: u.role }; };

/** Loads the case and the ownership context every ownership endpoint needs; staff only. */
async function ownershipContext(c: Context<AppEnv>) {
  if (!isStaff(c)) throw new AppError("Forbidden.", 403);
  const db = getDb(c.env.DB);
  const ref = c.req.param("ref")!;
  const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, ref)).limit(1);
  if (!app) throw new AppError("Application not found.", 404);
  await assertCaseVisible(db, c.get("authUser"), c.get("authRole").scope, app);
  const loaded = await loadCase(db, app); // registers the case's workflow rows if it has none yet
  const info = (await workflowInfoFor(db, [app])).get(ref)!;
  const status = loaded.definition.tracks.find((t) => t.key === info.track)?.statuses.find((s) => s.key === info.status);
  if (status?.category === "TERMINAL") throw new AppError("This case is closed, so it cannot be assigned.", 409);
  return { db, ref, app, loaded, info };
}

async function setOwner(db: ReturnType<typeof getDb>, ref: string, info: CaseWorkflowInfo, userId: number | null) {
  await db.update(wfCaseTracks)
    .set({ assigneeUserId: userId, assignedAt: userId == null ? null : new Date().toISOString() })
    .where(and(eq(wfCaseTracks.applicationRef, ref), eq(wfCaseTracks.trackKey, info.track)));
}

async function respond(c: Context<AppEnv>, ref: string) {
  const db = getDb(c.env.DB);
  const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, ref)).limit(1);
  return c.json((await workflowInfoFor(db, [app])).get(ref));
}

// Stage, owner and SLA clock for one case.
workflow.get("/cases/:ref/state", async (c) => {
  const db = getDb(c.env.DB);
  const ref = c.req.param("ref");
  const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, ref)).limit(1);
  if (!app) throw new AppError("Application not found.", 404);
  if (isStaff(c)) await assertCaseVisible(db, c.get("authUser"), c.get("authRole").scope, app);
  else if (app.customerId !== c.get("authUser").id) throw new AppError("Application not found.", 404);
  return c.json((await workflowInfoFor(db, [app])).get(ref));
});

// Who could own this case in its current stage (the stage's roles, unit rule and each person's
// own visibility), with their availability and current load. Needs case.assign.
workflow.get("/cases/:ref/eligible", async (c) => {
  assertEntitlement(c, "case.assign");
  const { db, app, loaded, info } = await ownershipContext(c);
  return c.json(await eligibleStaff(db, loaded.definition, info.stage, app, info.track));
});

// Take an unowned case. The caller must hold one of the stage's owning roles.
workflow.post("/cases/:ref/claim", async (c) => {
  const { db, ref, app, loaded, info } = await ownershipContext(c);
  const me = c.get("authUser");
  const eligible = await eligibleStaff(db, loaded.definition, info.stage, app, info.track);
  if (!eligible.some((e) => e.userId === me.id)) throw new AppError("Your role does not own cases in this stage.", 403);
  if (info.assigneeUserId === me.id) return respond(c, ref);
  if (info.assigneeUserId != null) throw new AppError(`This case is already assigned to ${info.assigneeName ?? "someone else"}. Ask for it to be reassigned.`, 409);
  await setOwner(db, ref, info, me.id);
  await recordAudit(db, { eventType: "CASE_CLAIMED", subjectType: "LoanApplication", subjectId: ref, detail: info.stage, ...who(c) });
  return respond(c, ref);
});

// Give (or move) the case to a colleague. Needs case.assign; the colleague must be eligible.
workflow.post("/cases/:ref/assign", async (c) => {
  assertEntitlement(c, "case.assign");
  const { db, ref, app, loaded, info } = await ownershipContext(c);
  const body = await c.req.json<{ userId?: number }>().catch(() => ({} as { userId?: number }));
  const target = Number(body.userId);
  if (!Number.isInteger(target)) throw new AppError("userId is required.", 400);
  const eligible = await eligibleStaff(db, loaded.definition, info.stage, app, info.track);
  const pick = eligible.find((e) => e.userId === target);
  if (!pick) throw new AppError("That person cannot own cases in this stage or cannot see this case.", 400);
  await setOwner(db, ref, info, target);
  await recordAudit(db, { eventType: info.assigneeUserId == null ? "CASE_ASSIGNED" : "CASE_REASSIGNED", subjectType: "LoanApplication", subjectId: ref, detail: `${info.assigneeName ?? "unassigned"} -> ${pick.name}`, ...who(c) });
  return respond(c, ref);
});

// Give a case back to the queue. The owner can; so can anyone with case.assign.
workflow.post("/cases/:ref/release", async (c) => {
  const { db, ref, info } = await ownershipContext(c);
  if (info.assigneeUserId == null) return respond(c, ref);
  if (info.assigneeUserId !== c.get("authUser").id) assertEntitlement(c, "case.assign");
  await setOwner(db, ref, info, null);
  await recordAudit(db, { eventType: "CASE_RELEASED", subjectType: "LoanApplication", subjectId: ref, detail: info.assigneeName, ...who(c) });
  return respond(c, ref);
});

// ------------------------------------------------------------------ availability

// Whether the signed-in staff member currently receives automatically routed cases.
workflow.get("/availability", (c) => {
  if (!isStaff(c)) throw new AppError("Forbidden.", 403);
  return c.json({ available: c.get("authUser").isAvailable });
});

workflow.put("/availability", async (c) => {
  if (!isStaff(c)) throw new AppError("Forbidden.", 403);
  const { available } = await c.req.json<{ available?: boolean }>();
  if (typeof available !== "boolean") throw new AppError("available must be true or false.", 400);
  const db = getDb(c.env.DB);
  await db.update(users).set({ isAvailable: available }).where(eq(users.id, c.get("authUser").id));
  await recordAudit(db, { eventType: available ? "STAFF_AVAILABLE" : "STAFF_UNAVAILABLE", subjectType: "User", subjectId: String(c.get("authUser").id), ...who(c) });
  return c.json({ available });
});

// ------------------------------------------------------------------ SLA by organisation unit

interface Counts { green: number; amber: number; red: number; unassigned: number; total: number }
const empty = (): Counts => ({ green: 0, amber: 0, red: 0, unassigned: 0, total: 0 });

// Open cases per org unit by SLA state, each unit also rolled up over everything beneath it, so a
// regional manager can start at the top and drill into the branch that is breaching. Limited to
// the cases the caller may see.
workflow.get("/sla-summary", async (c) => {
  if (!isStaff(c)) throw new AppError("Forbidden.", 403);
  const db = getDb(c.env.DB);
  const open = await statusesByCategory(db, ["ACTIVE"]);
  if (open.length === 0) return c.json({ units: [], noUnit: empty() });
  const apps = await db.select().from(loanApplications).where(and(inArray(loanApplications.status, open), await caseScopeCondition(db, c.get("authUser"), c.get("authRole").scope)));
  const info = await workflowInfoFor(db, apps);

  const own = new Map<number | null, Counts>();
  for (const a of apps) {
    const i = info.get(a.applicationRef);
    if (!i) continue;
    const row = own.get(a.orgUnitId) ?? empty();
    row.total++;
    if (i.assigneeUserId == null) row.unassigned++;
    if (i.sla.state === "GREEN") row.green++; else if (i.sla.state === "AMBER") row.amber++; else if (i.sla.state === "RED") row.red++;
    own.set(a.orgUnitId, row);
  }

  const units = await db.select().from(orgUnits);
  const parent = new Map(units.map((u) => [u.id, u.parentId]));
  const rollup = new Map<number, Counts>();
  for (const [unitId, counts] of own) {
    // Add this unit's own counts to itself and every ancestor (cycle-guarded).
    const seen = new Set<number>();
    for (let id: number | null | undefined = unitId; id != null && !seen.has(id); id = parent.get(id)) {
      seen.add(id);
      const r = rollup.get(id) ?? empty();
      for (const k of Object.keys(r) as (keyof Counts)[]) r[k] += counts[k];
      rollup.set(id, r);
    }
  }
  return c.json({
    units: units.filter((u) => rollup.has(u.id)).map((u) => ({ unitId: u.id, name: u.name, code: u.code, parentId: u.parentId, own: own.get(u.id) ?? empty(), total: rollup.get(u.id)! })),
    noUnit: own.get(null) ?? empty(),
  });
});
