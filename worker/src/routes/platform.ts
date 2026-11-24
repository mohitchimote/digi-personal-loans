import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { lenders, lenderSettings, users } from "../db/schema";
import { AppError } from "../lib/errors";
import { requireAuth, requireEntitlement } from "../middleware/auth";
import { getLenderByCode, getLenderById, SUPER_ADMIN_ROLE, LENDER_ACTIVE, DOMAINS_SETTING, normaliseHost, parseDomains, invalidateHostMap } from "../lib/lenders";
import { buildAuthResponse } from "../lib/user-mappers";
import { buildCloneStatements, loadCloneFacts } from "../lib/lender-clone";
import { recordAudit } from "../lib/audit";
import { success } from "../lib/api-response";

// Platform console: the super admin's view across lenders. Every route needs `platform.lenders`,
// which only the built-in SUPER_ADMIN role holds. It reads and writes across lenders on purpose, so
// the lender-isolation test exempts this file; everything else a super admin does goes through the
// ordinary admin routes after entering a lender.
export const platform = new Hono<AppEnv>();
platform.use("*", requireAuth, requireEntitlement("platform.lenders"));

const actorOf = (c: { get: (k: "authUser") => { fullName: string | null; email: string; role: string } }) => {
  const a = c.get("authUser");
  return { actor: a.fullName?.trim() || a.email, actorRole: a.role };
};

platform.get("/lenders", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(lenders).orderBy(lenders.id);
  const count = async (table: string) => new Map((await db.all<{ id: number; n: number }>(sql.raw(`SELECT lender_id AS id, COUNT(*) AS n FROM ${table} GROUP BY lender_id`))).map((r) => [Number(r.id), Number(r.n)]));
  const [staffAndCustomers, applications] = await Promise.all([count("users"), count("loan_applications")]);
  const domainRows = await db.select().from(lenderSettings).where(eq(lenderSettings.key, DOMAINS_SETTING));
  const domains = new Map(domainRows.map((r) => [r.lenderId, parseDomains(r.valueJson)]));
  return c.json(rows.map((l) => ({ ...l, domains: domains.get(l.id) ?? [], users: staffAndCustomers.get(l.id) ?? 0, applications: applications.get(l.id) ?? 0 })));
});

const CODE_RE = /^[A-Z][A-Z0-9_]{1,15}$/;
const createSchema = z.object({
  code: z.string().trim().toUpperCase().regex(CODE_RE, "Code: 2-16 characters, A-Z, 0-9 and underscore, starting with a letter."),
  name: z.string().trim().min(1).max(120),
  /** The lender whose configuration is copied. */
  cloneFromLenderId: z.number().int(),
  admin: z.object({
    fullName: z.string().trim().min(1),
    email: z.string().trim().email(),
    nationalId: z.string().regex(/^\d{9}$/, "National ID must be 9 digits"),
  }),
});

platform.post("/lenders", zValidator("json", createSchema), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  if (await getLenderByCode(db, body.code)) throw new AppError("A lender with that code already exists.");
  const source = await getLenderById(db, body.cloneFromLenderId);
  if (!source) throw new AppError("The lender to copy from does not exist.", 404);

  const facts = await loadCloneFacts(db, source.id);
  const { statements, summary } = buildCloneStatements(source.id, body.code, facts);
  const now = new Date().toISOString();
  // The lender row, its copied configuration and its first admin land together or not at all.
  await db.batch([
    db.insert(lenders).values({ code: body.code, name: body.name, status: LENDER_ACTIVE, createdAt: now }),
    ...statements.map((s) => db.run(sql.raw(s))),
    db.insert(users).values({
      lenderId: sql`(SELECT id FROM lenders WHERE code = ${body.code})` as unknown as number,
      uuid: crypto.randomUUID(), email: body.admin.email, nationalId: body.admin.nationalId, fullName: body.admin.fullName,
      role: "ADMIN", createdAt: now, enabled: true, emailVerified: true,
    }),
  ] as unknown as [never, ...never[]]);

  const created = (await getLenderByCode(db, body.code))!;
  await recordAudit(db, { lenderId: created.id, eventType: "LENDER_CREATED", subjectType: "Lender", subjectId: String(created.id), detail: `${created.code}; copied from ${source.code}`, ...actorOf(c) });
  return success(c, `Lender ${created.code} created from ${source.code}.`, { lender: created, mastersWithoutItems: summary.mastersWithoutItems }, 201);
});

platform.put("/lenders/:id", zValidator("json", z.object({ name: z.string().trim().min(1).max(120) })), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [saved] = await db.update(lenders).set({ name: c.req.valid("json").name }).where(eq(lenders.id, id)).returning();
  if (!saved) throw new AppError("Lender not found.", 404);
  await recordAudit(db, { lenderId: id, eventType: "LENDER_RENAMED", subjectType: "Lender", subjectId: String(id), detail: saved.name, ...actorOf(c) });
  return c.json(saved);
});

async function setStatus(c: Context<AppEnv, any>, status: "ACTIVE" | "SUSPENDED") {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [saved] = await db.update(lenders).set({ status }).where(eq(lenders.id, id)).returning();
  if (!saved) throw new AppError("Lender not found.", 404);
  await recordAudit(db, { lenderId: id, eventType: status === "ACTIVE" ? "LENDER_ACTIVATED" : "LENDER_SUSPENDED", subjectType: "Lender", subjectId: String(id), ...actorOf(c) });
  return c.json(saved);
}
// A suspended lender's users cannot sign in and every token of theirs is refused (decideLenderContext);
// nothing is deleted, so activating it again restores everything.
platform.post("/lenders/:id/suspend", (c) => setStatus(c, "SUSPENDED"));
platform.post("/lenders/:id/activate", (c) => setStatus(c, "ACTIVE"));

/** A new token for the same super admin, inside the lender. Audited in that lender's trail. */
platform.post("/lenders/:id/enter", requireEntitlement("platform.enterLender"), async (c) => {
  const db = getDb(c.env.DB);
  const lender = await getLenderById(db, Number(c.req.param("id")));
  if (!lender) throw new AppError("Lender not found.", 404);
  const user = c.get("authUser");
  if (user.role !== SUPER_ADMIN_ROLE) throw new AppError("Forbidden.", 403);
  await recordAudit(db, { lenderId: lender.id, eventType: "LENDER_ENTERED", subjectType: "Lender", subjectId: String(lender.id), ...actorOf(c) });
  return success(c, `Entered ${lender.name}.`, await buildAuthResponse(db, user, c.env.JWT_SECRET, lender));
});

/** Back to platform level (a token with no lender). */
platform.post("/exit", async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get("authUser");
  const inside = c.get("lenderId");
  if (inside != null) await recordAudit(db, { lenderId: inside, eventType: "LENDER_EXITED", subjectType: "Lender", subjectId: String(inside), ...actorOf(c) });
  return success(c, "Back at platform level.", await buildAuthResponse(db, user, c.env.JWT_SECRET, null));
});

/** The addresses a lender is reached on. On one of them the lender is known from the address alone. */
platform.put("/lenders/:id/domains", zValidator("json", z.object({ domains: z.array(z.string()).max(10) })), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  if (!(await getLenderById(db, id))) throw new AppError("Lender not found.", 404);
  const hosts: string[] = [];
  for (const raw of c.req.valid("json").domains) {
    if (!raw.trim()) continue;
    const h = normaliseHost(raw.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, ""));
    if (!h) throw new AppError(`"${raw}" is not a valid host name (for example loans.example.com).`);
    if (!hosts.includes(h)) hosts.push(h);
  }
  const others = await db.select().from(lenderSettings).where(eq(lenderSettings.key, DOMAINS_SETTING));
  for (const o of others) {
    const clash = o.lenderId !== id ? parseDomains(o.valueJson).find((h) => hosts.includes(h)) : undefined;
    if (clash) throw new AppError(`${clash} already belongs to another lender.`);
  }
  const now = new Date().toISOString();
  await db.insert(lenderSettings).values({ lenderId: id, key: DOMAINS_SETTING, valueJson: JSON.stringify(hosts), updatedAt: now })
    .onConflictDoUpdate({ target: [lenderSettings.lenderId, lenderSettings.key], set: { valueJson: JSON.stringify(hosts), updatedAt: now } });
  invalidateHostMap();
  await recordAudit(db, { lenderId: id, eventType: "LENDER_DOMAINS_SET", subjectType: "Lender", subjectId: String(id), detail: hosts.join(", ") || "none", ...actorOf(c) });
  return c.json({ domains: hosts });
});
