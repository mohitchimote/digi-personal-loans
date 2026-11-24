import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { lenders, lenderSettings, users } from "../db/schema";
import { cached, invalidate } from "./cache";
import { AppError } from "./errors";

export type Lender = typeof lenders.$inferSelect;

export const SUPER_ADMIN_ROLE = "SUPER_ADMIN";
export const LENDER_ACTIVE = "ACTIVE";

export async function getLenderById(db: Db, id: number): Promise<Lender | null> {
  const [row] = await db.select().from(lenders).where(eq(lenders.id, id)).limit(1);
  return row ?? null;
}

export async function getLenderByCode(db: Db, code: string): Promise<Lender | null> {
  const [row] = await db.select().from(lenders).where(sql`upper(${lenders.code}) = ${code.trim().toUpperCase()}`).limit(1);
  return row ?? null;
}

/**
 * The lender a new registration belongs to. With a code it must name an ACTIVE lender; without
 * one it is the only active lender (so a single-lender deployment needs no code), otherwise the
 * customer has to say which lender they mean.
 */
export async function resolveRegistrationLender(db: Db, code?: string | null, hostLenderId: number | null = null): Promise<Lender> {
  if (code && code.trim()) {
    const lender = await getLenderByCode(db, code);
    if (!lender || lender.status !== LENDER_ACTIVE) throw new AppError("Unknown lender code.");
    await assertAllowedAtAddress(db, lender.id, hostLenderId);
    return lender;
  }
  const active = await db.select().from(lenders).where(eq(lenders.status, LENDER_ACTIVE)).limit(2);
  if (active.length === 1) { await assertAllowedAtAddress(db, active[0].id, hostLenderId); return active[0]; }
  throw new AppError("Please enter your lender code.");
}

export interface LoginAccount {
  user: typeof users.$inferSelect;
  /** null = a platform (super admin) account, which belongs to no lender. */
  lender: Lender | null;
}

/**
 * Every account a national ID can sign in to, optionally narrowed to one lender code. Accounts of
 * suspended lenders are left out. Platform accounts (no lender) are only found when no code is
 * given.
 */
export async function findLoginAccounts(db: Db, nationalId: string, lenderCode?: string | null, hostLenderId: number | null = null): Promise<LoginAccount[]> {
  const rows = await db
    .select({ user: users, lender: lenders })
    .from(users)
    .leftJoin(lenders, eq(users.lenderId, lenders.id))
    .where(eq(users.nationalId, nationalId));
  const withOwn = await lendersWithOwnAddress(db);
  return filterLoginAccounts(rows, lenderCode).filter((a) => allowedAtAddress(a.lender?.id ?? null, hostLenderId, withOwn));
}

type AccountRow = { user: typeof users.$inferSelect; lender: Lender | null };

/** Which of a National ID's accounts can be signed in to (pure, so it is unit-tested). */
export function filterLoginAccounts(rows: AccountRow[], lenderCode?: string | null): LoginAccount[] {
  const code = lenderCode?.trim().toUpperCase();
  return rows
    .filter((r) => (r.lender ? r.lender.status === LENDER_ACTIVE : r.user.role === SUPER_ADMIN_ROLE))
    .filter((r) => !code || r.lender?.code.toUpperCase() === code)
    .map((r) => ({ user: r.user, lender: r.lender }));
}

export type LenderContext = { ok: true; lenderId: number | null } | { ok: false };

/**
 * The lender a verified token runs inside (pure). The user's row decides; the token's `lnd` claim
 * must agree. A lender-less row is only valid for a super admin, whose claim is 0 (platform level)
 * or the id of an existing lender it has entered.
 */
export function decideLenderContext(
  user: { lenderId: number | null; role: string },
  claim: number,
  lender: { status: string } | null,
  claimedLenderExists: boolean,
): LenderContext {
  if (user.lenderId != null) {
    if (claim !== user.lenderId) return { ok: false };
    if (!lender || lender.status !== LENDER_ACTIVE) return { ok: false };
    return { ok: true, lenderId: user.lenderId };
  }
  if (user.role !== SUPER_ADMIN_ROLE) return { ok: false };
  if (claim === 0) return { ok: true, lenderId: null };
  return claimedLenderExists ? { ok: true, lenderId: claim } : { ok: false };
}

/** Same, by e-mail (registration verification), within one lender when a code is given. */
export async function findUsersByEmail(db: Db, email: string, lenderCode?: string | null, hostLenderId: number | null = null) {
  const rows = await db
    .select({ user: users, lender: lenders })
    .from(users)
    .leftJoin(lenders, eq(users.lenderId, lenders.id))
    .where(and(eq(users.email, email)));
  const code = lenderCode?.trim().toUpperCase();
  const withOwn = await lendersWithOwnAddress(db);
  return rows.filter((r) => (!code || r.lender?.code.toUpperCase() === code) && allowedAtAddress(r.lender?.id ?? null, hostLenderId, withOwn)).map((r) => r.user);
}

/**
 * Updates the row of a user the caller has already resolved (a login, a registration, or the
 * signed-in user themself). It is keyed by that row's own id, so it cannot touch another lender's
 * user; it lives here because it is also used before any lender context exists (OTP flows).
 */
export function updateUserRow(db: Db, user: { id: number }, set: Partial<typeof users.$inferInsert>) {
  return db.update(users).set(set).where(eq(users.id, user.id)).returning();
}

// ---- Hosts: a lender can be reached on its own addresses (loans.theirbank.com, bank-a.<platform>).
// The hostnames are the lender setting `domains` (a JSON array). On such a host the lender is known
// from the address alone: no lender code is typed, and login only looks at that lender's accounts.

export const DOMAINS_SETTING = "domains";
const HOSTS_CACHE_KEY = "lender-hosts";

/** Lower-case host without port or trailing dot; null when it is not a plausible hostname. */
export function normaliseHost(raw: string): string | null {
  const h = raw.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(h) ? h : null;
}

/** The hosts a stored `domains` value lists (pure; tolerant of a malformed value). */
export function parseDomains(valueJson: string | null | undefined): string[] {
  try {
    const v = JSON.parse(valueJson ?? "[]");
    return Array.isArray(v) ? v.map((x) => (typeof x === "string" ? normaliseHost(x) : null)).filter((x): x is string => !!x) : [];
  } catch { return []; }
}

/** host -> lender id over all stored domain settings (cached briefly; saving domains invalidates it). */
async function hostMap(db: Db): Promise<Map<string, number>> {
  return cached(HOSTS_CACHE_KEY, 60_000, async () => {
    const rows = await db.select().from(lenderSettings).where(eq(lenderSettings.key, DOMAINS_SETTING));
    const map = new Map<string, number>();
    for (const r of rows) for (const h of parseDomains(r.valueJson)) if (!map.has(h)) map.set(h, r.lenderId);
    return map;
  });
}

export function invalidateHostMap(): void { invalidate(HOSTS_CACHE_KEY); }

/** The lender that owns this request host, if any. */
export async function findLenderByHost(db: Db, host: string): Promise<Lender | null> {
  const h = normaliseHost(host);
  if (!h) return null;
  const id = (await hostMap(db)).get(h);
  return id == null ? null : getLenderById(db, id);
}

/** Active lenders (to tell whether a visitor could be asked which one they mean). */
export async function countActiveLenders(db: Db): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(lenders).where(eq(lenders.status, LENDER_ACTIVE));
  return Number(r?.n ?? 0);
}

/** Lenders that have at least one address of their own configured. */
export async function lendersWithOwnAddress(db: Db): Promise<Set<number>> {
  return new Set((await hostMap(db)).values());
}

/**
 * Whether an account (or registration) of this lender may be used at this address (pure).
 * A lender with its own address can only be signed in to there: knowing its lender code on a shared
 * address (or on someone else's) is not enough. A lender without one works on any address that does
 * not belong to a different lender. A platform account (no lender) only on a shared address.
 */
export function allowedAtAddress(lenderId: number | null, hostLenderId: number | null, lendersWithOwn: ReadonlySet<number>): boolean {
  if (lenderId == null) return hostLenderId == null;
  if (lendersWithOwn.has(lenderId)) return hostLenderId === lenderId;
  return hostLenderId == null || hostLenderId === lenderId;
}

async function assertAllowedAtAddress(db: Db, lenderId: number, hostLenderId: number | null): Promise<void> {
  if (!allowedAtAddress(lenderId, hostLenderId, await lendersWithOwnAddress(db))) {
    throw new AppError("Please register at your bank's own web address.");
  }
}
