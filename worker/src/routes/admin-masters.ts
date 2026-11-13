import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { masterTypes, masterItems } from "../db/schema";
import { AppError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { recordAudit } from "../lib/audit";
import {
  CODE_RE, ITEM_CODE_RE, attributeDefsSchema, validateAttributes, createsCycle, typeCreatesCycle, parseJson,
  type AttributeDef,
} from "../lib/masters";

// Masters: define-once reference data. Admin CRUD lives under /api/auth/admin/masters; the read-only
// pick-list endpoint other screens use lives under /api/masters (public: titles/countries are needed
// on the registration form, and nothing here is sensitive).
export const mastersAdmin = new Hono<AppEnv>();
mastersAdmin.use("*", requireAuth, requireRole("ADMIN"));

type Db = ReturnType<typeof getDb>;

const typeBase = z.object({
  labelEn: z.string().trim().min(1),
  labelHe: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  parentTypeCode: z.string().regex(CODE_RE).nullable().optional(),
  attributeDefs: attributeDefsSchema.optional(),
  sortOrder: z.number().int().optional(),
});
const typeCreate = typeBase.extend({ code: z.string().regex(CODE_RE, "Use lowercase letters, digits, _ or -.") });

const itemSchema = z.object({
  code: z.string().regex(ITEM_CODE_RE, "Use letters, digits, _ . or -."),
  nameEn: z.string().trim().min(1),
  nameHe: z.string().trim().min(1),
  parentId: z.number().int().nullable().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  attributes: z.record(z.unknown()).optional(),
});

function actorOf(c: { get: (k: "authUser") => { fullName: string | null; email: string; role: string } }) {
  const a = c.get("authUser");
  return { actor: a.fullName?.trim() || a.email, actorRole: a.role };
}

async function getType(db: Db, code: string) {
  const [t] = await db.select().from(masterTypes).where(eq(masterTypes.code, code)).limit(1);
  if (!t) throw new AppError("Master type not found.", 404);
  return t;
}

function shapeType(t: typeof masterTypes.$inferSelect, itemCount?: number) {
  return { ...t, attributeDefs: parseJson<AttributeDef[]>(t.attributeDefs, []), itemCount };
}
function shapeItem(i: typeof masterItems.$inferSelect) {
  return { ...i, attributes: parseJson<Record<string, unknown>>(i.attributes, {}) };
}

mastersAdmin.get("/types", async (c) => {
  const db = getDb(c.env.DB);
  const types = await db.select().from(masterTypes).orderBy(asc(masterTypes.sortOrder), asc(masterTypes.labelEn));
  const counts = await db.select({ typeCode: masterItems.typeCode, n: count() }).from(masterItems).groupBy(masterItems.typeCode);
  const byType = new Map(counts.map((r) => [r.typeCode, r.n]));
  return c.json(types.map((t) => shapeType(t, byType.get(t.code) ?? 0)));
});

mastersAdmin.post("/types", zValidator("json", typeCreate), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const all = await db.select().from(masterTypes);
  if (all.some((t) => t.code === body.code)) throw new AppError("A master with that code already exists.");
  if (body.parentTypeCode && !all.some((t) => t.code === body.parentTypeCode)) throw new AppError("Unknown parent master.");
  const [saved] = await db.insert(masterTypes).values({
    code: body.code, labelEn: body.labelEn, labelHe: body.labelHe, description: body.description ?? null,
    parentTypeCode: body.parentTypeCode ?? null, attributeDefs: JSON.stringify(body.attributeDefs ?? []),
    sortOrder: body.sortOrder ?? 0, isSystem: false, createdAt: new Date().toISOString(),
  }).returning();
  await recordAudit(db, { eventType: "MASTER_TYPE_CREATED", subjectType: "MasterType", subjectId: saved.code, detail: saved.labelEn, ...actorOf(c) });
  return c.json(shapeType(saved, 0), 201);
});

mastersAdmin.put("/types/:code", zValidator("json", typeBase), async (c) => {
  const db = getDb(c.env.DB);
  const existing = await getType(db, c.req.param("code"));
  const body = c.req.valid("json");
  const parentTypeCode = body.parentTypeCode === undefined ? existing.parentTypeCode : body.parentTypeCode;
  const all = await db.select().from(masterTypes);
  if (parentTypeCode) {
    if (!all.some((t) => t.code === parentTypeCode)) throw new AppError("Unknown parent master.");
    const map = new Map(all.map((t) => [t.code, t.parentTypeCode]));
    if (typeCreatesCycle(existing.code, parentTypeCode, (k) => map.get(k))) throw new AppError("That parent would make the masters loop back on themselves.");
  }
  if (parentTypeCode !== existing.parentTypeCode) {
    const [{ n }] = await db.select({ n: count() }).from(masterItems).where(eq(masterItems.typeCode, existing.code));
    if (n > 0) throw new AppError("This master already has items - the parent master can't change. Delete the items first.");
  }
  // Removing a required attribute definition that items depend on is harmless (values just stop
  // being validated), but newly required attributes would invalidate existing items on next edit -
  // acceptable: items are re-validated only when saved.
  const [saved] = await db.update(masterTypes).set({
    labelEn: body.labelEn, labelHe: body.labelHe, description: body.description ?? null, parentTypeCode,
    attributeDefs: body.attributeDefs ? JSON.stringify(body.attributeDefs) : existing.attributeDefs,
    sortOrder: body.sortOrder ?? existing.sortOrder,
  }).where(eq(masterTypes.code, existing.code)).returning();
  await recordAudit(db, { eventType: "MASTER_TYPE_UPDATED", subjectType: "MasterType", subjectId: saved.code, detail: saved.labelEn, ...actorOf(c) });
  return c.json(shapeType(saved));
});

mastersAdmin.delete("/types/:code", async (c) => {
  const db = getDb(c.env.DB);
  const existing = await getType(db, c.req.param("code"));
  if (existing.isSystem) throw new AppError("Built-in masters can't be deleted.");
  const [{ n }] = await db.select({ n: count() }).from(masterItems).where(eq(masterItems.typeCode, existing.code));
  if (n > 0) throw new AppError("This master still has items - delete them first.");
  const [child] = await db.select().from(masterTypes).where(eq(masterTypes.parentTypeCode, existing.code)).limit(1);
  if (child) throw new AppError(`"${child.labelEn}" depends on this master - change or delete it first.`);
  await db.delete(masterTypes).where(eq(masterTypes.code, existing.code));
  await recordAudit(db, { eventType: "MASTER_TYPE_DELETED", subjectType: "MasterType", subjectId: existing.code, ...actorOf(c) });
  return c.body(null, 204);
});

mastersAdmin.get("/types/:code/items", async (c) => {
  const db = getDb(c.env.DB);
  const type = await getType(db, c.req.param("code"));
  const rows = await db.select().from(masterItems).where(eq(masterItems.typeCode, type.code))
    .orderBy(asc(masterItems.sortOrder), asc(masterItems.nameEn));
  return c.json(rows.map(shapeItem));
});

/** Validates parent (right type, no cycle) and attributes; returns the DB values. */
async function prepareItem(db: Db, type: typeof masterTypes.$inferSelect, body: z.infer<typeof itemSchema>, selfId?: number) {
  const parentId = body.parentId ?? null;
  if (type.parentTypeCode) {
    if (parentId == null) throw new AppError(`A parent is required (pick a ${type.parentTypeCode.replace(/_/g, " ")}).`);
    const [parent] = await db.select().from(masterItems).where(eq(masterItems.id, parentId)).limit(1);
    if (!parent || parent.typeCode !== type.parentTypeCode) throw new AppError("The parent must come from the parent master.");
  } else if (parentId != null) {
    // Same-type nesting (e.g. an org-style tree) is allowed only if the type points at itself; here
    // the type has no parent master, so a parent makes no sense.
    throw new AppError("This master has no parent master, so items can't have a parent.");
  }
  if (selfId != null && parentId != null) {
    const rows = await db.select({ id: masterItems.id, parentId: masterItems.parentId }).from(masterItems);
    const map = new Map(rows.map((r) => [r.id, r.parentId]));
    if (createsCycle(selfId, parentId, (id) => map.get(id))) throw new AppError("An item can't be its own ancestor.");
  }
  const attrs = validateAttributes(parseJson<AttributeDef[]>(type.attributeDefs, []), body.attributes);
  if (!attrs.ok) throw new AppError(attrs.message);
  return { parentId, attributes: JSON.stringify(attrs.value) };
}

mastersAdmin.post("/types/:code/items", zValidator("json", itemSchema), async (c) => {
  const db = getDb(c.env.DB);
  const type = await getType(db, c.req.param("code"));
  const body = c.req.valid("json");
  const [dup] = await db.select().from(masterItems).where(and(eq(masterItems.typeCode, type.code), eq(masterItems.code, body.code))).limit(1);
  if (dup) throw new AppError("An item with that code already exists in this master.");
  const prepared = await prepareItem(db, type, body);
  const [saved] = await db.insert(masterItems).values({
    typeCode: type.code, code: body.code, nameEn: body.nameEn, nameHe: body.nameHe, parentId: prepared.parentId,
    sortOrder: body.sortOrder ?? 0, active: body.active ?? true, attributes: prepared.attributes,
    createdAt: new Date().toISOString(),
  }).returning();
  await recordAudit(db, { eventType: "MASTER_ITEM_CREATED", subjectType: "MasterItem", subjectId: `${type.code}:${saved.code}`, detail: saved.nameEn, ...actorOf(c) });
  return c.json(shapeItem(saved), 201);
});

mastersAdmin.put("/items/:id", zValidator("json", itemSchema), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(masterItems).where(eq(masterItems.id, id)).limit(1);
  if (!existing) throw new AppError("Item not found.", 404);
  const type = await getType(db, existing.typeCode);
  const body = c.req.valid("json");
  // The code is what other records store, so it can't be edited after creation.
  if (body.code !== existing.code) throw new AppError("An item's code can't be changed - other records refer to it. Add a new item instead.");
  const prepared = await prepareItem(db, type, body, id);
  const [saved] = await db.update(masterItems).set({
    nameEn: body.nameEn, nameHe: body.nameHe, parentId: prepared.parentId, sortOrder: body.sortOrder ?? existing.sortOrder,
    active: body.active ?? existing.active, attributes: prepared.attributes, updatedAt: new Date().toISOString(),
  }).where(eq(masterItems.id, id)).returning();
  await recordAudit(db, { eventType: "MASTER_ITEM_UPDATED", subjectType: "MasterItem", subjectId: `${type.code}:${saved.code}`, detail: saved.nameEn, ...actorOf(c) });
  return c.json(shapeItem(saved));
});

mastersAdmin.delete("/items/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [existing] = await db.select().from(masterItems).where(eq(masterItems.id, id)).limit(1);
  if (!existing) throw new AppError("Item not found.", 404);
  const [child] = await db.select().from(masterItems).where(eq(masterItems.parentId, id)).limit(1);
  if (child) throw new AppError(`"${child.nameEn}" sits under this item - move or delete it first.`);
  await db.delete(masterItems).where(eq(masterItems.id, id));
  await recordAudit(db, { eventType: "MASTER_ITEM_DELETED", subjectType: "MasterItem", subjectId: `${existing.typeCode}:${existing.code}`, detail: existing.nameEn, ...actorOf(c) });
  return c.body(null, 204);
});

// ---- Read-only pick-lists for forms and other modules --------------------------------------------

export const masters = new Hono<AppEnv>();

async function pickList(db: Db, typeCode: string, parentCode?: string) {
  const [type] = await db.select().from(masterTypes).where(eq(masterTypes.code, typeCode)).limit(1);
  if (!type) throw new AppError("Unknown master.", 404);
  let rows = await db.select().from(masterItems)
    .where(and(eq(masterItems.typeCode, typeCode), eq(masterItems.active, true)))
    .orderBy(asc(masterItems.sortOrder), asc(masterItems.nameEn));
  const parentIds = rows.map((r) => r.parentId).filter((v): v is number => v != null);
  const parents = parentIds.length ? await db.select().from(masterItems).where(inArray(masterItems.id, [...new Set(parentIds)])) : [];
  const parentCodeById = new Map(parents.map((p) => [p.id, p.code]));
  const out = rows.map((r) => ({
    code: r.code,
    name: { en: r.nameEn, he: r.nameHe },
    parentCode: r.parentId != null ? parentCodeById.get(r.parentId) ?? null : null,
    attributes: parseJson<Record<string, unknown>>(r.attributes, {}),
  }));
  return parentCode ? out.filter((r) => r.parentCode === parentCode) : out;
}

// GET /api/masters?types=title,gender,country  -> { title: [...], gender: [...], country: [...] }
masters.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const types = (c.req.query("types") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 25);
  if (types.length === 0) throw new AppError("Pass ?types=code1,code2.");
  const result: Record<string, Awaited<ReturnType<typeof pickList>>> = {};
  for (const t of types) result[t] = await pickList(db, t);
  return c.json(result);
});

// GET /api/masters/:type?parent=IL  -> active items, optionally only the children of one parent code
masters.get("/:type", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await pickList(db, c.req.param("type"), c.req.query("parent") || undefined));
});
