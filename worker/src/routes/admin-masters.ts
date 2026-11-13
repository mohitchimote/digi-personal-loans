import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, count, eq, inArray, or, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { masterTypes, masterItems } from "../db/schema";
import { AppError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { recordAudit } from "../lib/audit";
import {
  attributeDefsSchema, validateAttributes, typeCreatesCycle, parseJson, generateCode, generateAttributeKey, normaliseName,
  CODE_RE, type AttributeDef,
} from "../lib/masters";

// Masters: define-once reference data. Admin CRUD lives under /api/auth/admin/masters; the read-only
// pick-list endpoint other screens use lives under /api/masters (public: titles/countries are needed
// on the registration form, and nothing here is sensitive).
export const mastersAdmin = new Hono<AppEnv>();
mastersAdmin.use("*", requireAuth, requireRole("ADMIN"));

type Db = ReturnType<typeof getDb>;

// Attribute definitions arrive without keys when new: the server derives a camelCase key from the
// English label (keys, like codes, are never typed by hand).
const attributeInput = z.array(z.object({
  key: z.string().optional(),
  label: z.object({ en: z.string().trim().min(1), he: z.string().trim().min(1) }),
  kind: z.enum(["text", "number", "boolean"]),
  required: z.boolean().optional(),
})).max(20);

function finaliseAttributes(input: z.infer<typeof attributeInput>, existing: AttributeDef[]): AttributeDef[] {
  // Keys already on the master are kept as they are (stored item values refer to them); new rows get one.
  const existingKeys = new Set(existing.map((d) => d.key));
  const taken = new Set<string>();
  for (const d of input) if (d.key && existingKeys.has(d.key)) taken.add(d.key);
  const out: AttributeDef[] = input.map((d) => {
    if (d.key && existingKeys.has(d.key)) return { ...d, key: d.key };
    const key = generateAttributeKey(d.label.en, taken);
    taken.add(key);
    return { ...d, key };
  });
  const parsed = attributeDefsSchema.safeParse(out);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid extra fields.");
  return parsed.data;
}

const NO_TYPED_CODE = "Codes are generated automatically from the English name and can't be set by hand.";

const typeBase = z.object({
  labelEn: z.string().trim().min(1),
  labelHe: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  parentTypeCode: z.string().regex(CODE_RE).nullable().optional(),
  parentRequired: z.boolean().optional(),
  attributeDefs: attributeInput.optional(),
  sortOrder: z.number().int().optional(),
});
const typeCreate = typeBase.extend({ code: z.string().optional() });

const itemSchema = z.object({
  // Create: must be absent (generated). Update: optional, and if present must equal the existing code.
  code: z.string().optional(),
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
  if (body.code) throw new AppError(NO_TYPED_CODE);
  const all = await db.select().from(masterTypes);
  const taken = new Set(all.map((t) => t.code));
  if (all.some((t) => normaliseName(t.labelEn) === normaliseName(body.labelEn))) throw new AppError("A master with that name already exists.");
  const code = generateCode(body.labelEn, (x) => taken.has(x), { lower: true, fallback: "MASTER" });
  if (body.parentTypeCode && !all.some((t) => t.code === body.parentTypeCode)) throw new AppError("Unknown parent master.");
  const [saved] = await db.insert(masterTypes).values({
    code, labelEn: body.labelEn, labelHe: body.labelHe, description: body.description ?? null,
    parentTypeCode: body.parentTypeCode ?? null, parentRequired: body.parentRequired ?? true,
    attributeDefs: JSON.stringify(finaliseAttributes(body.attributeDefs ?? [], [])),
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
    parentRequired: body.parentRequired ?? existing.parentRequired,
    attributeDefs: body.attributeDefs
      ? JSON.stringify(finaliseAttributes(body.attributeDefs, parseJson<AttributeDef[]>(existing.attributeDefs, [])))
      : existing.attributeDefs,
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

/** LIKE pattern for a user search term: escapes the wildcards so "50%" matches literally. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

// Paged and searchable: a master can hold hundreds of thousands of rows (cities), so the admin screen
// never loads a whole master. ?limit (<=500, default 100) &offset &q (code or either name) &parentId
mastersAdmin.get("/types/:code/items", async (c) => {
  const db = getDb(c.env.DB);
  const type = await getType(db, c.req.param("code"));
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 500);
  const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
  const q = (c.req.query("q") ?? "").trim().slice(0, 100);
  const parentId = c.req.query("parentId") ? Number(c.req.query("parentId")) : null;
  const idFilter = c.req.query("id") ? Number(c.req.query("id")) : null;
  const conds = [eq(masterItems.typeCode, type.code)];
  if (idFilter != null && Number.isInteger(idFilter)) conds.push(eq(masterItems.id, idFilter));
  if (parentId != null && Number.isInteger(parentId)) conds.push(eq(masterItems.parentId, parentId));
  if (q) {
    const pat = likePattern(q);
    conds.push(or(
      sql`${masterItems.code} LIKE ${pat} ESCAPE '\\'`,
      sql`${masterItems.nameEn} LIKE ${pat} ESCAPE '\\'`,
      sql`${masterItems.nameHe} LIKE ${pat} ESCAPE '\\'`,
    )!);
  }
  const where = and(...conds);
  const [{ n }] = await db.select({ n: count() }).from(masterItems).where(where);
  const rows = await db.select().from(masterItems).where(where)
    .orderBy(asc(masterItems.sortOrder), asc(masterItems.nameEn)).limit(limit).offset(offset);
  // Parent names for display (one extra query for at most `limit` distinct parents).
  const pids = [...new Set(rows.map((r) => r.parentId).filter((v): v is number => v != null))];
  const parents = pids.length ? await db.select().from(masterItems).where(inArray(masterItems.id, pids)) : [];
  const pById = new Map(parents.map((p) => [p.id, p]));
  return c.json({
    items: rows.map((r) => ({
      ...shapeItem(r),
      parent: r.parentId != null && pById.has(r.parentId)
        ? { code: pById.get(r.parentId)!.code, nameEn: pById.get(r.parentId)!.nameEn, nameHe: pById.get(r.parentId)!.nameHe } : null,
    })),
    total: n, limit, offset,
  });
});

/** Validates parent (right type, no cycle) and attributes; returns the DB values. */
async function prepareItem(db: Db, type: typeof masterTypes.$inferSelect, body: z.infer<typeof itemSchema>) {
  const parentId = body.parentId ?? null;
  if (type.parentTypeCode) {
    if (parentId == null && type.parentRequired) throw new AppError(`A parent is required (pick a ${type.parentTypeCode.replace(/_/g, " ")}).`);
    if (parentId != null) {
      const [parent] = await db.select().from(masterItems).where(eq(masterItems.id, parentId)).limit(1);
      if (!parent || parent.typeCode !== type.parentTypeCode) throw new AppError("The parent must come from the parent master.");
    }
  } else if (parentId != null) {
    // Same-type nesting (e.g. an org-style tree) is allowed only if the type points at itself; here
    // the type has no parent master, so a parent makes no sense.
    throw new AppError("This master has no parent master, so items can't have a parent.");
  }
  // No item-level cycle check: a parent must come from a different master (type cycles are rejected
  // when the masters are defined), so an item can never be its own ancestor.
  const attrs = validateAttributes(parseJson<AttributeDef[]>(type.attributeDefs, []), body.attributes);
  if (!attrs.ok) throw new AppError(attrs.message);
  return { parentId, attributes: JSON.stringify(attrs.value) };
}

mastersAdmin.post("/types/:code/items", zValidator("json", itemSchema), async (c) => {
  const db = getDb(c.env.DB);
  const type = await getType(db, c.req.param("code"));
  const body = c.req.valid("json");
  if (body.code) throw new AppError(NO_TYPED_CODE);
  const prepared = await prepareItem(db, type, body);

  // Code: from the English name, unique within the master. Only rows whose code shares the base can
  // clash, so that is all we load. The same rows reveal a duplicate: the same name (ignoring case,
  // spacing and punctuation) under the same parent is a duplicate, not a new item.
  const base = generateCode(body.nameEn, () => false);
  const likeBase = base.replace(/[\\%_]/g, (m) => `\\${m}`) + "\\_%";
  const related = await db.select({ code: masterItems.code, nameEn: masterItems.nameEn, parentId: masterItems.parentId }).from(masterItems)
    .where(and(eq(masterItems.typeCode, type.code), or(eq(masterItems.code, base), sql`${masterItems.code} LIKE ${likeBase} ESCAPE '\\'`)));
  const wanted = normaliseName(body.nameEn);
  if (related.some((r) => (r.parentId ?? null) === prepared.parentId && normaliseName(r.nameEn) === wanted)) {
    throw new AppError(`"${body.nameEn.trim()}" already exists in this master.`);
  }
  const taken = new Set(related.map((r) => r.code));
  const code = generateCode(body.nameEn, (x) => taken.has(x));

  const [saved] = await db.insert(masterItems).values({
    typeCode: type.code, code, nameEn: body.nameEn, nameHe: body.nameHe, parentId: prepared.parentId,
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
  if (body.code !== undefined && body.code !== existing.code) throw new AppError("An item's code can't be changed - other records refer to it. Add a new item instead.");
  const prepared = await prepareItem(db, type, body);
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

async function pickList(db: Db, typeCode: string, parentCode?: string, q?: string, limit = 2000) {
  const [type] = await db.select().from(masterTypes).where(eq(masterTypes.code, typeCode)).limit(1);
  if (!type) throw new AppError("Unknown master.", 404);
  const conds = [eq(masterItems.typeCode, typeCode), eq(masterItems.active, true)];
  if (parentCode) {
    if (!type.parentTypeCode) throw new AppError("This master has no parent master.");
    const [p] = await db.select({ id: masterItems.id }).from(masterItems)
      .where(and(eq(masterItems.typeCode, type.parentTypeCode), eq(masterItems.code, parentCode))).limit(1);
    if (!p) return [];
    conds.push(eq(masterItems.parentId, p.id));
  }
  if (q) {
    const pat = likePattern(q.slice(0, 100));
    conds.push(or(
      sql`${masterItems.code} LIKE ${pat} ESCAPE '\\'`,
      sql`${masterItems.nameEn} LIKE ${pat} ESCAPE '\\'`,
      sql`${masterItems.nameHe} LIKE ${pat} ESCAPE '\\'`,
    )!);
  }
  const rows = await db.select().from(masterItems).where(and(...conds))
    .orderBy(asc(masterItems.sortOrder), asc(masterItems.nameEn)).limit(limit);
  const parentIds = rows.map((r) => r.parentId).filter((v): v is number => v != null);
  const parents = parentIds.length ? await db.select().from(masterItems).where(inArray(masterItems.id, [...new Set(parentIds)])) : [];
  const parentCodeById = new Map(parents.map((p) => [p.id, p.code]));
  const out = rows.map((r) => ({
    code: r.code,
    name: { en: r.nameEn, he: r.nameHe },
    parentCode: r.parentId != null ? parentCodeById.get(r.parentId) ?? null : null,
    attributes: parseJson<Record<string, unknown>>(r.attributes, {}),
  }));
  return out;
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
// Optional ?q= (search code or name) and ?limit= (default 2000, max 5000) for very large masters.
masters.get("/:type", async (c) => {
  const db = getDb(c.env.DB);
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 2000, 1), 5000);
  return c.json(await pickList(db, c.req.param("type"), c.req.query("parent") || undefined, c.req.query("q") || undefined, limit));
});
