import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { lenders, users } from "../db/schema";
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
export async function resolveRegistrationLender(db: Db, code?: string | null): Promise<Lender> {
  if (code && code.trim()) {
    const lender = await getLenderByCode(db, code);
    if (!lender || lender.status !== LENDER_ACTIVE) throw new AppError("Unknown lender code.");
    return lender;
  }
  const active = await db.select().from(lenders).where(eq(lenders.status, LENDER_ACTIVE)).limit(2);
  if (active.length === 1) return active[0];
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
export async function findLoginAccounts(db: Db, nationalId: string, lenderCode?: string | null): Promise<LoginAccount[]> {
  const rows = await db
    .select({ user: users, lender: lenders })
    .from(users)
    .leftJoin(lenders, eq(users.lenderId, lenders.id))
    .where(eq(users.nationalId, nationalId));
  return filterLoginAccounts(rows, lenderCode);
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
export async function findUsersByEmail(db: Db, email: string, lenderCode?: string | null) {
  const rows = await db
    .select({ user: users, lender: lenders })
    .from(users)
    .leftJoin(lenders, eq(users.lenderId, lenders.id))
    .where(and(eq(users.email, email)));
  const code = lenderCode?.trim().toUpperCase();
  return rows.filter((r) => !code || r.lender?.code.toUpperCase() === code).map((r) => r.user);
}

/**
 * Updates the row of a user the caller has already resolved (a login, a registration, or the
 * signed-in user themself). It is keyed by that row's own id, so it cannot touch another lender's
 * user; it lives here because it is also used before any lender context exists (OTP flows).
 */
export function updateUserRow(db: Db, user: { id: number }, set: Partial<typeof users.$inferInsert>) {
  return db.update(users).set(set).where(eq(users.id, user.id)).returning();
}
