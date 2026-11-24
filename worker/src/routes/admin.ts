import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, inArray, asc } from "drizzle-orm";
import { inLender } from "../lib/lender-scope";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { users, faqs, orgUnits } from "../db/schema";
import { success, fail } from "../lib/api-response";
import { AppError } from "../lib/errors";
import { toUserSummary } from "../lib/user-mappers";
import { requireAuth, requireRole, requireLender } from "../middleware/auth";
import { CUSTOMER_ROLES, staffRoleCodes } from "../lib/roles";
import { recordAudit, actorOf } from "../lib/audit";
import { mayViewAs } from "../lib/impersonation";
import { buildAuthResponse } from "../lib/user-mappers";
import { getLenderById } from "../lib/lenders";

export const admin = new Hono<AppEnv>();
admin.use("*", requireAuth, requireRole("ADMIN"));

admin.get("/users", async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  const type = c.req.query("type");
  const rows =
    type === "staff"
      ? await db.select().from(users).where(inLender(users, lenderId, inArray(users.role, await staffRoleCodes(db, lenderId))))
      : type === "customers"
        ? await db.select().from(users).where(inLender(users, lenderId, inArray(users.role, CUSTOMER_ROLES)))
        : await db.select().from(users).where(inLender(users, lenderId));
  return c.json(rows.map(toUserSummary));
});

admin.put("/users/:id/role", zValidator("json", z.object({ role: z.string() })), async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  const id = Number(c.req.param("id"));
  const [user] = await db.select().from(users).where(inLender(users, lenderId, eq(users.id, id))).limit(1);
  if (!user) throw new AppError(`User not found: ${id}`);
  const { role } = c.req.valid("json");
  if (!(await staffRoleCodes(db, lenderId)).includes(role) && !CUSTOMER_ROLES.includes(role)) throw new AppError("Unknown role.");
  // S2 — a role change invalidates any token already issued for this user; without this, the old
  // role's permissions stay live in the token's claims until natural (24h) expiry.
  const [updated] = await db
    .update(users)
    .set({ role, sessionsRevokedAt: new Date().toISOString() })
    .where(inLender(users, lenderId, eq(users.id, id)))
    .returning();
  await recordAudit(db, {
    eventType: "ROLE_CHANGED",
    subjectType: "User",
    subjectId: String(id),
    ...actorOf(c),
    detail: `${user.role} -> ${role}`,
  });
  return success(c, "Role updated.", toUserSummary(updated));
});

// Y1 - assign (or clear) a staff member's org unit. Bumps sessionsRevokedAt like a role change:
// the user's case visibility changes, so their next request must re-resolve it.
admin.put("/users/:id/org-unit", zValidator("json", z.object({ orgUnitId: z.number().int().nullable() })), async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  const id = Number(c.req.param("id"));
  const [user] = await db.select().from(users).where(inLender(users, lenderId, eq(users.id, id))).limit(1);
  if (!user) throw new AppError(`User not found: ${id}`);
  if (!(await staffRoleCodes(db, lenderId)).includes(user.role)) throw new AppError("Only staff users can be assigned to an org unit.");
  const { orgUnitId } = c.req.valid("json");
  if (orgUnitId != null) {
    const [unit] = await db.select().from(orgUnits).where(inLender(orgUnits, lenderId, eq(orgUnits.id, orgUnitId))).limit(1);
    if (!unit) throw new AppError("Unknown org unit.");
  }
  const [updated] = await db
    .update(users)
    .set({ orgUnitId, sessionsRevokedAt: new Date().toISOString() })
    .where(inLender(users, lenderId, eq(users.id, id)))
    .returning();
  await recordAudit(db, {
    eventType: "USER_ORG_UNIT_CHANGED",
    subjectType: "User",
    subjectId: String(id),
    ...actorOf(c),
    detail: `${user.orgUnitId ?? "none"} -> ${orgUnitId ?? "none"}`,
  });
  return success(c, "Org unit updated.", toUserSummary(updated));
});

admin.put("/users/:id/enabled", zValidator("json", z.object({ enabled: z.boolean() })), async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  const id = Number(c.req.param("id"));
  const [user] = await db.select().from(users).where(inLender(users, lenderId, eq(users.id, id))).limit(1);
  if (!user) throw new AppError(`User not found: ${id}`);
  const { enabled } = c.req.valid("json");
  // S2 — disabling a user invalidates any token already issued for them immediately, rather than
  // relying solely on requireAuth's existing !user.enabled check racing the token's own expiry.
  const [updated] = await db
    .update(users)
    .set({ enabled, sessionsRevokedAt: new Date().toISOString() })
    .where(inLender(users, lenderId, eq(users.id, id)))
    .returning();
  await recordAudit(db, {
    eventType: enabled ? "USER_ENABLED" : "USER_DISABLED",
    subjectType: "User",
    subjectId: String(id),
    ...actorOf(c),
  });
  return success(c, "User updated.", toUserSummary(updated));
});

const createStaffSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  nationalId: z.string().regex(/^\d{9}$/),
  phoneNumber: z.string().optional().nullable(),
  role: z.string(),
  orgUnitId: z.number().int().nullable().optional(),
});

admin.post("/users", zValidator("json", createStaffSchema), async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  const body = c.req.valid("json");
  if ((await db.select().from(users).where(inLender(users, lenderId, eq(users.email, body.email))).limit(1)).length > 0) {
    return fail(c, "Email already in use.");
  }
  if ((await db.select().from(users).where(inLender(users, lenderId, eq(users.nationalId, body.nationalId))).limit(1)).length > 0) {
    return fail(c, "National ID already in use.");
  }
  if (!(await staffRoleCodes(db, lenderId)).includes(body.role)) {
    return fail(c, "Invalid staff role.");
  }
  if (body.orgUnitId != null) {
    const [unit] = await db.select().from(orgUnits).where(inLender(orgUnits, lenderId, eq(orgUnits.id, body.orgUnitId))).limit(1);
    if (!unit) return fail(c, "Unknown org unit.");
  }
  const [saved] = await db
    .insert(users)
    .values({
      lenderId,
      uuid: crypto.randomUUID(),
      email: body.email,
      fullName: body.fullName,
      nationalId: body.nationalId,
      phoneNumber: body.phoneNumber ?? null,
      role: body.role,
      orgUnitId: body.orgUnitId ?? null,
      createdAt: new Date().toISOString(),
      enabled: true,
      emailVerified: true,
    })
    .returning();
  await recordAudit(db, {
    eventType: "STAFF_USER_CREATED",
    subjectType: "User",
    subjectId: String(saved.id),
    ...actorOf(c),
    detail: `role=${body.role}`,
  });
  return success(c, "Staff user created.", toUserSummary(saved), 201);
});

admin.delete("/users/:id", async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  const id = Number(c.req.param("id"));
  const [user] = await db.select().from(users).where(inLender(users, lenderId, eq(users.id, id))).limit(1);
  if (!user) throw new AppError(`User not found: ${id}`);
  if (!CUSTOMER_ROLES.includes(user.role)) {
    return fail(c, "Only customer records can be deleted.");
  }
  await db.delete(users).where(inLender(users, lenderId, eq(users.id, id)));
  await recordAudit(db, {
    eventType: "USER_DELETED",
    subjectType: "User",
    subjectId: String(id),
    ...actorOf(c),
  });
  return c.body(null, 204);
});

admin.get("/faqs", async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  const rows = await db.select().from(faqs).where(inLender(faqs, lenderId)).orderBy(asc(faqs.category), asc(faqs.displayOrder));
  return c.json(rows);
});

const faqSchema = z.object({
  category: z.string(),
  question: z.string(),
  answer: z.string(),
  questionHe: z.string().optional().nullable(),
  answerHe: z.string().optional().nullable(),
  videoId: z.string().optional().nullable(),
  displayOrder: z.number().int().default(0),
});

admin.post("/faqs", zValidator("json", faqSchema), async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  const body = c.req.valid("json");
  const [saved] = await db.insert(faqs).values({ ...body, lenderId }).returning();
  return c.json(saved, 201);
});

admin.put("/faqs/:id", zValidator("json", faqSchema), async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(faqs).where(inLender(faqs, lenderId, eq(faqs.id, id))).limit(1);
  if (existing.length === 0) throw new AppError(`FAQ not found: ${id}`);
  const body = c.req.valid("json");
  const [updated] = await db.update(faqs).set(body).where(inLender(faqs, lenderId, eq(faqs.id, id))).returning();
  return c.json(updated);
});

admin.delete("/faqs/:id", async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  const id = Number(c.req.param("id"));
  await db.delete(faqs).where(inLender(faqs, lenderId, eq(faqs.id, id)));
  return c.body(null, 204);
});

// "Enter as": see the screens as one of this lender's users (read-only; rules in lib/impersonation.ts).
// Always audited, and the session carries the administrator's identity so the UI can flag it.
admin.post("/users/:id/enter-as", async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  if (c.get("actingUser")) throw new AppError("Exit the current view first.", 403);
  const admin = c.get("authUser");
  const [target] = await db.select().from(users).where(inLender(users, lenderId, eq(users.id, Number(c.req.param("id"))))).limit(1);
  if (!target) throw new AppError("User not found.", 404);
  const decision = mayViewAs(admin, target, lenderId);
  if (!decision.ok) throw new AppError(decision.reason, 403);
  await recordAudit(db, { eventType: "USER_VIEW_AS_STARTED", subjectType: "User", subjectId: String(target.id), detail: `${target.role} ${target.fullName ?? target.email}`, ...actorOf(c) });
  const lender = await getLenderById(db, lenderId);
  return success(c, `Viewing as ${target.fullName ?? target.email}.`, await buildAuthResponse(db, target, c.env.JWT_SECRET, lender, admin));
});
