import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, count } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { roles, roleEntitlements, users } from "../db/schema";
import { AppError } from "../lib/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { recordAudit } from "../lib/audit";
import { ENTITLEMENT_CATALOG, ENTITLEMENT_KEYS, SCOPES } from "../lib/entitlements";
import { CUSTOMER_ROLES, invalidateRoleConfig } from "../lib/roles";

// Phase 2 - admin-configured staff roles and their entitlements. ADMIN itself is a locked
// super-role: always holds every entitlement, cannot be edited or deleted.
export const rolesAdmin = new Hono<AppEnv>();
rolesAdmin.use("*", requireAuth, requireRole("ADMIN"));

const bodySchema = z.object({
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  scope: z.enum(SCOPES),
  // Position on the approval/escalation ladder; null = not an approver. Unique across roles.
  escalationRank: z.number().int().min(0).max(100).nullable().optional(),
  entitlements: z.array(z.string()),
});
const createSchema = bodySchema.extend({ code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/, "Code must be 2-32 chars: A-Z, 0-9, underscore.") });

function actorOf(c: { get: (k: "authUser") => { fullName: string | null; email: string; role: string } }) {
  const a = c.get("authUser");
  return { actor: a.fullName?.trim() || a.email, actorRole: a.role };
}

async function assertRankFree(db: ReturnType<typeof getDb>, rank: number | null | undefined, selfCode?: string) {
  if (rank == null) return;
  const clash = (await db.select().from(roles)).find((r) => r.escalationRank === rank && r.code !== selfCode);
  if (clash) throw new AppError(`Ladder position ${rank} is already used by ${clash.label}.`);
}

function assertKnownEntitlements(keys: string[]) {
  const bad = keys.filter((k) => !ENTITLEMENT_KEYS.includes(k));
  if (bad.length) throw new AppError(`Unknown entitlement(s): ${bad.join(", ")}`);
}

// Role/entitlement changes alter what an already-signed-in user's client shows, so every session
// held by that role is revoked - the next request forces a re-login that carries the new set.
async function revokeSessionsForRole(db: ReturnType<typeof getDb>, code: string) {
  await db.update(users).set({ sessionsRevokedAt: new Date().toISOString() }).where(eq(users.role, code));
}

rolesAdmin.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const roleRows = await db.select().from(roles);
  const ents = await db.select().from(roleEntitlements);
  const userRows = await db.select({ role: users.role }).from(users);
  return c.json({
    catalog: ENTITLEMENT_CATALOG,
    scopes: SCOPES,
    roles: roleRows.map((r) => ({
      ...r,
      entitlements: r.locked ? ENTITLEMENT_KEYS : ents.filter((e) => e.roleCode === r.code).map((e) => e.entitlement),
      userCount: userRows.filter((u) => u.role === r.code).length,
    })),
  });
});

rolesAdmin.post("/", zValidator("json", createSchema), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  if (CUSTOMER_ROLES.includes(body.code)) throw new AppError("That code is reserved.");
  const [dup] = await db.select().from(roles).where(eq(roles.code, body.code)).limit(1);
  if (dup) throw new AppError("A role with that code already exists.");
  assertKnownEntitlements(body.entitlements);
  await assertRankFree(db, body.escalationRank);
  await db.insert(roles).values({
    code: body.code, label: body.label, description: body.description ?? null, scope: body.scope, escalationRank: body.escalationRank ?? null,
    isSystem: false, locked: false, createdAt: new Date().toISOString(),
  });
  if (body.entitlements.length) {
    await db.insert(roleEntitlements).values([...new Set(body.entitlements)].map((e) => ({ roleCode: body.code, entitlement: e })));
  }
  invalidateRoleConfig();
  await recordAudit(db, { eventType: "ROLE_CREATED", subjectType: "Role", subjectId: body.code, detail: `${body.label}; scope=${body.scope}; ${body.entitlements.length} entitlements`, ...actorOf(c) });
  return c.json({ code: body.code }, 201);
});

rolesAdmin.put("/:code", zValidator("json", bodySchema), async (c) => {
  const db = getDb(c.env.DB);
  const code = c.req.param("code");
  const [existing] = await db.select().from(roles).where(eq(roles.code, code)).limit(1);
  if (!existing) throw new AppError("Role not found.", 404);
  if (existing.locked) throw new AppError("The ADMIN role is locked and cannot be edited.", 403);
  const body = c.req.valid("json");
  assertKnownEntitlements(body.entitlements);
  await assertRankFree(db, body.escalationRank, code);
  const before = (await db.select().from(roleEntitlements).where(eq(roleEntitlements.roleCode, code))).map((e) => e.entitlement);
  const after = [...new Set(body.entitlements)];
  await db.update(roles).set({ label: body.label, description: body.description ?? null, scope: body.scope, escalationRank: body.escalationRank ?? null }).where(eq(roles.code, code));
  await db.delete(roleEntitlements).where(eq(roleEntitlements.roleCode, code));
  if (after.length) await db.insert(roleEntitlements).values(after.map((e) => ({ roleCode: code, entitlement: e })));
  invalidateRoleConfig();
  const changed = existing.scope !== body.scope || existing.escalationRank !== (body.escalationRank ?? null) || before.length !== after.length || before.some((e) => !after.includes(e));
  if (changed) await revokeSessionsForRole(db, code);
  const added = after.filter((e) => !before.includes(e));
  const removed = before.filter((e) => !after.includes(e));
  await recordAudit(db, {
    eventType: "ROLE_UPDATED", subjectType: "Role", subjectId: code,
    detail: `scope ${existing.scope}->${body.scope}; rank ${existing.escalationRank ?? "none"}->${body.escalationRank ?? "none"}; +[${added.join(",")}] -[${removed.join(",")}]`, ...actorOf(c),
  });
  return c.json({ code });
});

rolesAdmin.delete("/:code", async (c) => {
  const db = getDb(c.env.DB);
  const code = c.req.param("code");
  const [existing] = await db.select().from(roles).where(eq(roles.code, code)).limit(1);
  if (!existing) throw new AppError("Role not found.", 404);
  if (existing.locked || existing.isSystem) throw new AppError("Built-in roles cannot be deleted.", 403);
  const [{ n }] = await db.select({ n: count() }).from(users).where(eq(users.role, code));
  if (n > 0) throw new AppError(`${n} user(s) still hold this role - reassign them first.`);
  await db.delete(roleEntitlements).where(eq(roleEntitlements.roleCode, code));
  await db.delete(roles).where(eq(roles.code, code));
  invalidateRoleConfig();
  await recordAudit(db, { eventType: "ROLE_DELETED", subjectType: "Role", subjectId: code, ...actorOf(c) });
  return c.body(null, 204);
});
