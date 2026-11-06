import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, asc, count } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { orgLevels, orgUnits, users, loanApplications } from "../db/schema";
import { AppError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { recordAudit } from "../lib/audit";
import { subtreeIds } from "../lib/org";

// Y1 - admin-configured organisational hierarchy. Levels (Head Office / Region / Branch ...) and
// units are plain data; nothing here names a specific level.
export const orgAdmin = new Hono<AppEnv>();
orgAdmin.use("*", requireAuth, requireRole("ADMIN"));

const levelSchema = z.object({ name: z.string().trim().min(1), depth: z.number().int().min(1) });
const unitSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1),
  levelId: z.number().int(),
  parentId: z.number().int().nullable(),
  active: z.boolean().optional(),
});

function actorOf(c: { get: (k: "authUser") => { fullName: string | null; email: string; role: string } }) {
  const a = c.get("authUser");
  return { actor: a.fullName?.trim() || a.email, actorRole: a.role };
}

orgAdmin.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const levels = await db.select().from(orgLevels).orderBy(asc(orgLevels.depth));
  const units = await db.select().from(orgUnits).orderBy(asc(orgUnits.name));
  return c.json({ levels, units });
});

orgAdmin.post("/levels", zValidator("json", levelSchema), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const [dup] = await db.select().from(orgLevels).where(eq(orgLevels.name, body.name)).limit(1);
  if (dup) throw new AppError("A level with that name already exists.");
  const [saved] = await db.insert(orgLevels).values(body).returning();
  await recordAudit(db, { eventType: "ORG_LEVEL_CREATED", subjectType: "OrgLevel", subjectId: String(saved.id), detail: body.name, ...actorOf(c) });
  return c.json(saved, 201);
});

orgAdmin.put("/levels/:id", zValidator("json", levelSchema), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(orgLevels).where(eq(orgLevels.id, id)).limit(1);
  if (!existing) throw new AppError("Level not found.", 404);
  const body = c.req.valid("json");
  const [saved] = await db.update(orgLevels).set(body).where(eq(orgLevels.id, id)).returning();
  await recordAudit(db, { eventType: "ORG_LEVEL_UPDATED", subjectType: "OrgLevel", subjectId: String(id), detail: `${existing.name} -> ${body.name}`, ...actorOf(c) });
  return c.json(saved);
});

orgAdmin.delete("/levels/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [{ n }] = await db.select({ n: count() }).from(orgUnits).where(eq(orgUnits.levelId, id));
  if (n > 0) throw new AppError("Level is in use by org units - move or delete them first.");
  await db.delete(orgLevels).where(eq(orgLevels.id, id));
  await recordAudit(db, { eventType: "ORG_LEVEL_DELETED", subjectType: "OrgLevel", subjectId: String(id), ...actorOf(c) });
  return c.body(null, 204);
});

// A unit must sit on a deeper level than its parent, and re-parenting must not create a cycle.
async function validateUnit(db: ReturnType<typeof getDb>, body: z.infer<typeof unitSchema>, selfId?: number) {
  const [level] = await db.select().from(orgLevels).where(eq(orgLevels.id, body.levelId)).limit(1);
  if (!level) throw new AppError("Unknown level.");
  if (body.parentId != null) {
    const [parent] = await db.select().from(orgUnits).where(eq(orgUnits.id, body.parentId)).limit(1);
    if (!parent) throw new AppError("Unknown parent unit.");
    const [parentLevel] = await db.select().from(orgLevels).where(eq(orgLevels.id, parent.levelId)).limit(1);
    if (parentLevel && parentLevel.depth >= level.depth) {
      throw new AppError(`A ${level.name} must sit under a higher level than ${parentLevel.name}.`);
    }
    if (selfId != null && (await subtreeIds(db, selfId)).includes(body.parentId)) {
      throw new AppError("A unit cannot be moved under itself or one of its own descendants.");
    }
  }
}

orgAdmin.post("/units", zValidator("json", unitSchema), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const [dup] = await db.select().from(orgUnits).where(eq(orgUnits.code, body.code)).limit(1);
  if (dup) throw new AppError("A unit with that code already exists.");
  await validateUnit(db, body);
  const [saved] = await db
    .insert(orgUnits)
    .values({ ...body, active: body.active ?? true, createdAt: new Date().toISOString() })
    .returning();
  await recordAudit(db, { eventType: "ORG_UNIT_CREATED", subjectType: "OrgUnit", subjectId: String(saved.id), detail: `${body.code} ${body.name}`, ...actorOf(c) });
  return c.json(saved, 201);
});

orgAdmin.put("/units/:id", zValidator("json", unitSchema), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(orgUnits).where(eq(orgUnits.id, id)).limit(1);
  if (!existing) throw new AppError("Unit not found.", 404);
  const body = c.req.valid("json");
  if (body.code !== existing.code) {
    const [dup] = await db.select().from(orgUnits).where(eq(orgUnits.code, body.code)).limit(1);
    if (dup) throw new AppError("A unit with that code already exists.");
  }
  await validateUnit(db, body, id);
  const [saved] = await db
    .update(orgUnits)
    .set({ ...body, active: body.active ?? existing.active })
    .where(eq(orgUnits.id, id))
    .returning();
  await recordAudit(db, { eventType: "ORG_UNIT_UPDATED", subjectType: "OrgUnit", subjectId: String(id), detail: `${existing.code} ${existing.name}`, ...actorOf(c) });
  return c.json(saved);
});

// Only an empty unit can be deleted - otherwise deactivate it. Keeps case history attributable.
orgAdmin.delete("/units/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [kids] = await db.select({ n: count() }).from(orgUnits).where(eq(orgUnits.parentId, id));
  const [staff] = await db.select({ n: count() }).from(users).where(eq(users.orgUnitId, id));
  const [cases] = await db.select({ n: count() }).from(loanApplications).where(eq(loanApplications.orgUnitId, id));
  if (kids.n > 0 || staff.n > 0 || cases.n > 0) {
    throw new AppError(
      `Unit still has ${kids.n} child unit(s), ${staff.n} staff user(s) and ${cases.n} case(s) - deactivate it instead of deleting.`
    );
  }
  await db.delete(orgUnits).where(eq(orgUnits.id, id));
  await recordAudit(db, { eventType: "ORG_UNIT_DELETED", subjectType: "OrgUnit", subjectId: String(id), ...actorOf(c) });
  return c.body(null, 204);
});
