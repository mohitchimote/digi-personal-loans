import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, asc, count, and } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { orgLevels, orgUnits, users, loanApplications, masterTypes, masterItems } from "../db/schema";
import { AppError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { recordAudit } from "../lib/audit";
import { subtreeIds } from "../lib/org";

// Y1 - admin-configured organisational hierarchy. Levels (Head Office / Region / Branch ...) and
// units are plain data; nothing here names a specific level.
export const orgAdmin = new Hono<AppEnv>();
orgAdmin.use("*", requireAuth, requireRole("ADMIN"));

const levelSchema = z.object({
  name: z.string().trim().min(1),
  depth: z.number().int().min(1),
  // Master the level's units are picked from (e.g. "branch"); null/absent = units are typed by hand.
  masterTypeCode: z.string().nullable().optional(),
});
// code/name are only needed for units typed by hand. At a level with a source master the unit is
// identified by `masterCode` and its code and names are copied from that master item.
const unitSchema = z.object({
  code: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().min(1).optional(),
  masterCode: z.string().nullable().optional(),
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
  await assertMasterType(db, body.masterTypeCode);
  const [saved] = await db.insert(orgLevels).values({ name: body.name, depth: body.depth, masterTypeCode: body.masterTypeCode ?? null }).returning();
  await recordAudit(db, { eventType: "ORG_LEVEL_CREATED", subjectType: "OrgLevel", subjectId: String(saved.id), detail: body.name, ...actorOf(c) });
  return c.json(saved, 201);
});

orgAdmin.put("/levels/:id", zValidator("json", levelSchema), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(orgLevels).where(eq(orgLevels.id, id)).limit(1);
  if (!existing) throw new AppError("Level not found.", 404);
  const body = c.req.valid("json");
  await assertMasterType(db, body.masterTypeCode);
  if (body.masterTypeCode !== undefined && (body.masterTypeCode ?? null) !== existing.masterTypeCode) {
    // Units already linked to the old master would point at items of the wrong master.
    const rows = await db.select({ m: orgUnits.masterCode }).from(orgUnits).where(eq(orgUnits.levelId, id));
    if (rows.some((r) => r.m != null)) throw new AppError("Units at this level are already linked to the current master - unlink or delete them before changing the source master.");
  }
  const [saved] = await db.update(orgLevels).set({
    name: body.name, depth: body.depth,
    masterTypeCode: body.masterTypeCode === undefined ? existing.masterTypeCode : body.masterTypeCode,
  }).where(eq(orgLevels.id, id)).returning();
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

type Db = ReturnType<typeof getDb>;

async function assertMasterType(db: Db, code: string | null | undefined) {
  if (!code) return;
  const [t] = await db.select({ code: masterTypes.code }).from(masterTypes).where(eq(masterTypes.code, code)).limit(1);
  if (!t) throw new AppError("Unknown master for this level.");
}

interface ResolvedUnit { code: string; name: string; nameHe: string | null; masterCode: string | null }

/**
 * Works out a unit's code and names. At a level with a source master the unit must be picked from that
 * master (its code and names are copied from the item); otherwise code and name are typed. A unit that
 * pre-dates the link (masterCode null) may be saved unchanged until someone links it.
 */
async function resolveUnit(db: Db, body: z.infer<typeof unitSchema>, existing?: typeof orgUnits.$inferSelect): Promise<ResolvedUnit> {
  const [level] = await db.select().from(orgLevels).where(eq(orgLevels.id, body.levelId)).limit(1);
  if (!level) throw new AppError("Unknown level.");
  if (!level.masterTypeCode) {
    if (!body.code || !body.name) throw new AppError("Code and name are required.");
    return { code: body.code, name: body.name, nameHe: null, masterCode: null };
  }
  const wanted = body.masterCode ?? (existing && existing.levelId === level.id ? existing.masterCode : null);
  if (!wanted) {
    // Legacy unit at a mastered level, being edited without a link: keep it as typed.
    if (existing && existing.levelId === level.id && body.code && body.name) {
      return { code: body.code, name: body.name, nameHe: existing.nameHe, masterCode: null };
    }
    throw new AppError(`Pick the ${level.name.toLowerCase()} from the ${level.masterTypeCode.replace(/_/g, " ")} list.`);
  }
  const [item] = await db.select().from(masterItems)
    .where(and(eq(masterItems.typeCode, level.masterTypeCode), eq(masterItems.code, wanted))).limit(1);
  if (!item) throw new AppError("That item isn't in the master list.");
  // Newly linking requires an active item; an already-linked unit keeps working if its item is deactivated.
  if (!item.active && existing?.masterCode !== wanted) throw new AppError("That item is inactive in the master list.");
  const [taken] = await db.select({ id: orgUnits.id }).from(orgUnits)
    .where(and(eq(orgUnits.levelId, level.id), eq(orgUnits.masterCode, item.code))).limit(1);
  if (taken && taken.id !== existing?.id) throw new AppError(`"${item.nameEn}" already has a unit at this level.`);
  return { code: item.code, name: item.nameEn, nameHe: item.nameHe, masterCode: item.code };
}

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
  const resolved = await resolveUnit(db, body);
  const [dup] = await db.select().from(orgUnits).where(eq(orgUnits.code, resolved.code)).limit(1);
  if (dup) throw new AppError("A unit with that code already exists.");
  await validateUnit(db, body);
  const [saved] = await db
    .insert(orgUnits)
    .values({ ...resolved, levelId: body.levelId, parentId: body.parentId, active: body.active ?? true, createdAt: new Date().toISOString() })
    .returning();
  await recordAudit(db, { eventType: "ORG_UNIT_CREATED", subjectType: "OrgUnit", subjectId: String(saved.id), detail: `${saved.code} ${saved.name}`, ...actorOf(c) });
  return c.json(saved, 201);
});

orgAdmin.put("/units/:id", zValidator("json", unitSchema), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(orgUnits).where(eq(orgUnits.id, id)).limit(1);
  if (!existing) throw new AppError("Unit not found.", 404);
  const body = c.req.valid("json");
  const resolved = await resolveUnit(db, body, existing);
  if (resolved.code !== existing.code) {
    const [dup] = await db.select().from(orgUnits).where(eq(orgUnits.code, resolved.code)).limit(1);
    if (dup) throw new AppError("A unit with that code already exists.");
  }
  await validateUnit(db, body, id);
  const [saved] = await db
    .update(orgUnits)
    .set({ ...resolved, levelId: body.levelId, parentId: body.parentId, active: body.active ?? existing.active })
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
