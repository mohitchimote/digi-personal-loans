import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { mandates, orgUnits } from "../db/schema";
import { AppError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { recordAudit } from "../lib/audit";
import { allRoleConfigs } from "../lib/roles";

// Phase 3 - admin-configured approval mandates with organisational context. A row is a limit for
// a ladder role, optionally narrowed to an org unit (and below) and/or an application type.
export const mandatesAdmin = new Hono<AppEnv>();
mandatesAdmin.use("*", requireAuth, requireRole("ADMIN"));

const bodySchema = z.object({
  roleCode: z.string().min(1),
  orgUnitId: z.number().int().nullable(),
  applicationType: z.enum(["PERSONAL", "BUSINESS"]).nullable(),
  maxAmount: z.number().min(0).max(1e12),
});

function actorOf(c: { get: (k: "authUser") => { fullName: string | null; email: string; role: string } }) {
  const a = c.get("authUser");
  return { actor: a.fullName?.trim() || a.email, actorRole: a.role };
}

async function validate(db: ReturnType<typeof getDb>, body: z.infer<typeof bodySchema>, selfId?: number) {
  const role = (await allRoleConfigs(db)).find((r) => r.code === body.roleCode);
  if (!role || role.rank == null) throw new AppError("Mandates can only be set for roles on the escalation ladder (give the role a rank first).");
  if (body.orgUnitId != null) {
    const [u] = await db.select().from(orgUnits).where(eq(orgUnits.id, body.orgUnitId)).limit(1);
    if (!u) throw new AppError("Unknown org unit.");
  }
  const existing = await db.select().from(mandates).where(eq(mandates.roleCode, body.roleCode));
  const dup = existing.find((m) => m.id !== selfId && m.orgUnitId === body.orgUnitId && m.applicationType === body.applicationType);
  if (dup) throw new AppError("A mandate for that role, unit and application type already exists - edit it instead.");
}

mandatesAdmin.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(mandates).orderBy(asc(mandates.roleCode), asc(mandates.id));
  const ladder = (await allRoleConfigs(db))
    .filter((r) => r.rank != null)
    .sort((a, b) => a.rank! - b.rank!)
    .map((r) => ({ code: r.code, label: r.label, rank: r.rank }));
  return c.json({ mandates: rows, ladder });
});

mandatesAdmin.post("/", zValidator("json", bodySchema), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  await validate(db, body);
  const [saved] = await db.insert(mandates).values(body).returning();
  await recordAudit(db, { eventType: "MANDATE_CREATED", subjectType: "Mandate", subjectId: String(saved.id), detail: `${body.roleCode} unit=${body.orgUnitId ?? "any"} type=${body.applicationType ?? "any"} max=${body.maxAmount}`, ...actorOf(c) });
  return c.json(saved, 201);
});

mandatesAdmin.put("/:id", zValidator("json", bodySchema), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(mandates).where(eq(mandates.id, id)).limit(1);
  if (!existing) throw new AppError("Mandate not found.", 404);
  const body = c.req.valid("json");
  await validate(db, body, id);
  const [saved] = await db.update(mandates).set(body).where(eq(mandates.id, id)).returning();
  await recordAudit(db, { eventType: "MANDATE_UPDATED", subjectType: "Mandate", subjectId: String(id), detail: `${existing.maxAmount} -> ${body.maxAmount}`, ...actorOf(c) });
  return c.json(saved);
});

mandatesAdmin.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(mandates).where(eq(mandates.id, id)).limit(1);
  if (!existing) throw new AppError("Mandate not found.", 404);
  await db.delete(mandates).where(eq(mandates.id, id));
  await recordAudit(db, { eventType: "MANDATE_DELETED", subjectType: "Mandate", subjectId: String(id), detail: `${existing.roleCode} max=${existing.maxAmount}`, ...actorOf(c) });
  return c.body(null, 204);
});
