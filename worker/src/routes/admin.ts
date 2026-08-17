import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, inArray, asc } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { users, faqs } from "../db/schema";
import { success, fail } from "../lib/api-response";
import { AppError } from "../lib/errors";
import { toUserSummary } from "../lib/user-mappers";
import { requireAuth, requireRole } from "../middleware/auth";

export const admin = new Hono<AppEnv>();
admin.use("*", requireAuth, requireRole("ADMIN"));

const STAFF_ROLES = ["BANKER", "UNDERWRITER", "SENIOR_UNDERWRITER", "HEAD_OF_LENDING", "COO", "CEO", "ADMIN"];
const CUSTOMER_ROLES = ["CUSTOMER", "BUSINESS_OWNER"];

admin.get("/users", async (c) => {
  const db = getDb(c.env.DB);
  const type = c.req.query("type");
  const rows =
    type === "staff"
      ? await db.select().from(users).where(inArray(users.role, STAFF_ROLES))
      : type === "customers"
        ? await db.select().from(users).where(inArray(users.role, CUSTOMER_ROLES))
        : await db.select().from(users);
  return c.json(rows.map(toUserSummary));
});

admin.put("/users/:id/role", zValidator("json", z.object({ role: z.string() })), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw new AppError(`User not found: ${id}`);
  const { role } = c.req.valid("json");
  const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
  return success(c, "Role updated.", toUserSummary(updated));
});

admin.put("/users/:id/enabled", zValidator("json", z.object({ enabled: z.boolean() })), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw new AppError(`User not found: ${id}`);
  const { enabled } = c.req.valid("json");
  const [updated] = await db.update(users).set({ enabled }).where(eq(users.id, id)).returning();
  return success(c, "User updated.", toUserSummary(updated));
});

const createStaffSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  nationalId: z.string().regex(/^\d{9}$/),
  phoneNumber: z.string().optional().nullable(),
  role: z.string(),
});

admin.post("/users", zValidator("json", createStaffSchema), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  if ((await db.select().from(users).where(eq(users.email, body.email)).limit(1)).length > 0) {
    return fail(c, "Email already in use.");
  }
  if ((await db.select().from(users).where(eq(users.nationalId, body.nationalId)).limit(1)).length > 0) {
    return fail(c, "National ID already in use.");
  }
  if (!STAFF_ROLES.includes(body.role)) {
    return fail(c, "Invalid staff role.");
  }
  const [saved] = await db
    .insert(users)
    .values({
      uuid: crypto.randomUUID(),
      email: body.email,
      fullName: body.fullName,
      nationalId: body.nationalId,
      phoneNumber: body.phoneNumber ?? null,
      role: body.role,
      createdAt: new Date().toISOString(),
      enabled: true,
      emailVerified: true,
    })
    .returning();
  return success(c, "Staff user created.", toUserSummary(saved), 201);
});

admin.delete("/users/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) throw new AppError(`User not found: ${id}`);
  if (!CUSTOMER_ROLES.includes(user.role)) {
    return fail(c, "Only customer records can be deleted.");
  }
  await db.delete(users).where(eq(users.id, id));
  return c.body(null, 204);
});

admin.get("/faqs", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(faqs).orderBy(asc(faqs.category), asc(faqs.displayOrder));
  return c.json(rows);
});

const faqSchema = z.object({
  category: z.string(),
  question: z.string(),
  answer: z.string(),
  videoId: z.string().optional().nullable(),
  displayOrder: z.number().int().default(0),
});

admin.post("/faqs", zValidator("json", faqSchema), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const [saved] = await db.insert(faqs).values(body).returning();
  return c.json(saved, 201);
});

admin.put("/faqs/:id", zValidator("json", faqSchema), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(faqs).where(eq(faqs.id, id)).limit(1);
  if (existing.length === 0) throw new AppError(`FAQ not found: ${id}`);
  const body = c.req.valid("json");
  const [updated] = await db.update(faqs).set(body).where(eq(faqs.id, id)).returning();
  return c.json(updated);
});

admin.delete("/faqs/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  await db.delete(faqs).where(eq(faqs.id, id));
  return c.body(null, 204);
});
