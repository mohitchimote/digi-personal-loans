import type { Context, Next } from "hono";
import { resolveRegistrationLender, findLenderByHost, type Lender } from "../lib/lenders";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { verifyJwt } from "../lib/jwt";
import { AppError } from "../lib/errors";
import { resolveRole } from "../lib/roles";
import { mayViewAs, isReadMethod, VIEW_AS_ALLOWED_WRITES } from "../lib/impersonation";
import { getLenderById, decideLenderContext, SUPER_ADMIN_ROLE } from "../lib/lenders";
import type { AppEnv } from "../types";

// Mirrors JwtAuthenticationFilter + SecurityConfig's `anyRequest().authenticated()`
// default: any route not explicitly public requires a valid Bearer token.
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  await authenticate(c);
  await next();
}

/** For public routes that are lender-specific (branding, FAQs, pick-lists on the registration
 * form): a valid token sets the lender as usual; with no token (or a stale one) the request stays
 * anonymous and the route works out the lender from ?lender=CODE with publicLender(). */
export async function optionalAuth(c: Context<AppEnv>, next: Next) {
  if (c.req.header("Authorization")?.startsWith("Bearer ")) {
    try { await authenticate(c); } catch { /* anonymous */ }
  }
  await next();
}

/** The lender of a public request: the signed-in user's own, else the one that owns the address, else ?lender=CODE,
 * else the only active lender. Null when it cannot be told (callers then return neutral content). */
export async function publicLender(c: Context<AppEnv>, db: ReturnType<typeof getDb>): Promise<number | null> {
  const known = c.get("lenderId");
  if (known != null) return known;
  const byHost = await hostLender(c, db);
  if (byHost) return byHost.id;
  const lender = await resolveRegistrationLender(db, c.req.query("lender")).catch(() => null);
  return lender?.id ?? null;
}

/** The lender that owns the address the request came to (its configured domain), if any. */
export async function hostLender(c: Context<AppEnv>, db: ReturnType<typeof getDb>): Promise<Lender | null> {
  // On Cloudflare the request URL's host and the Host header are the same address. The header is read
  // first because `wrangler dev` builds the URL from the connection, which makes local tests with
  // another host name impossible otherwise.
  return findLenderByHost(db, c.req.header("host") ?? new URL(c.req.url).host);
}

/** On a lender's own address the lender is that one whatever the client sent; elsewhere the code
 * the client sent (if any) is used. Login and registration go through this. */
export async function lenderCodeFor(c: Context<AppEnv>, db: ReturnType<typeof getDb>, sent?: string | null): Promise<string | undefined> {
  return (await hostLender(c, db))?.code ?? (sent?.trim() || undefined);
}

async function authenticate(c: Context<AppEnv>) {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("Token is invalid or expired.", 401);
  }
  const token = header.slice(7);

  let verified: { uuid: string; issuedAt: number; lenderId: number; actor?: string };
  try {
    verified = await verifyJwt(token, c.env.JWT_SECRET);
  } catch {
    throw new AppError("Token is invalid or expired.", 401);
  }

  const db = getDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.uuid, verified.uuid)).limit(1);
  if (!user || !user.enabled) {
    throw new AppError("Token is invalid or expired.", 401);
  }

  // S2 (ARCHITECTURE_REVIEW_GAPS.md) — every token issued before sessionsRevokedAt is rejected,
  // regardless of its own expiry. Bumped by admin enable/disable/role-change actions and by
  // logout-everywhere, so those take effect on the very next request instead of waiting out the
  // token's full 24h natural expiry.
  if (user.sessionsRevokedAt && verified.issuedAt * 1000 < Date.parse(user.sessionsRevokedAt)) {
    throw new AppError("Token is invalid or expired.", 401);
  }

  // Which lender this request runs inside. The user's row decides; the token's `lnd` claim must
  // agree with it, so a token issued for one lender is useless against another.
  const ownLender = user.lenderId != null ? await getLenderById(db, user.lenderId) : null;
  const claimed = user.lenderId == null && verified.lenderId > 0 ? await getLenderById(db, verified.lenderId) : null;
  const decided = decideLenderContext(user, verified.lenderId, ownLender, !!claimed);
  if (!decided.ok) throw new AppError("Token is invalid or expired.", 401);
  const lenderId = decided.lenderId;

  // "Enter as": the token also names the administrator behind the user. The administrator is
  // checked as strictly as the user (still enabled, sessions not revoked, still allowed to do this),
  // so disabling or signing out the administrator ends the session at once, and the session can only read.
  if (verified.actor) {
    const [actor] = await db.select().from(users).where(eq(users.uuid, verified.actor)).limit(1);
    const stale = !actor || (actor.sessionsRevokedAt && verified.issuedAt * 1000 < Date.parse(actor.sessionsRevokedAt));
    if (stale || !mayViewAs(actor, user, lenderId).ok) throw new AppError("Token is invalid or expired.", 401);
    if (!isReadMethod(c.req.method) && !VIEW_AS_ALLOWED_WRITES.has(c.req.path)) {
      throw new AppError("This session is read-only while viewing as another user. Exit to make changes.", 403);
    }
    c.set("actingUser", actor);
  }

  c.set("authUser", user);
  c.set("lenderId", lenderId);
  // Phase 2 - resolve the role's admin-configured entitlements/scope once per request (cached),
  // so every later check is a plain synchronous lookup. A platform token outside any lender holds
  // only the built-in super admin role, which does not depend on a lender.
  c.set("authRole", await resolveRole(db, lenderId ?? 0, user.role));
}

// Mirrors SecurityConfig's per-path `.hasRole(...)` rules
// (/api/auth/admin/** -> ADMIN, register-by-staff/customer-profile -> BANKER).
export function requireRole(...roles: string[]) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get("authUser");
    // The platform super admin satisfies any "ADMIN" check: it administers every lender.
    const allowed = !!user && (roles.includes(user.role) || (user.role === SUPER_ADMIN_ROLE && roles.includes("ADMIN")));
    if (!allowed) {
      throw new AppError("Forbidden.", 403);
    }
    await next();
  };
}

// Phase 2 - gate a route on an admin-configurable entitlement instead of a hard-coded role list.
export function requireEntitlement(key: string) {
  return async (c: Context<AppEnv>, next: Next) => {
    assertEntitlement(c, key);
    await next();
  };
}

export function assertEntitlement(c: Context<AppEnv>, key: string) {
  const role = c.get("authRole");
  if (!role || !role.entitlements.has(key)) {
    throw new AppError("Forbidden.", 403);
  }
}

/** Any staff role (holds a row in the roles table) - the replacement for STAFF_ROLES.includes. */
export function isStaff(c: Context<AppEnv>): boolean {
  return !!c.get("authRole")?.isStaff;
}

// Same check as requireRole, called as a plain guard at the top of a handler body instead of as
// route middleware. Needed on routes with path params (e.g. "/:appRef/decline") — chaining
// requireRole as a second handler argument there widens Hono's inferred c.req.param() type to
// `string | undefined` (a known Hono generics quirk when a non-path-specific middleware sits
// between a typed path and its handler), which cascades into type errors through the handler body.
export function assertRole(c: Context<AppEnv>, ...roles: string[]) {
  const user = c.get("authUser");
  if (!user || !roles.includes(user.role)) {
    throw new AppError("Forbidden.", 403);
  }
}

/** The lender this request is scoped to. A super admin who has not entered a lender has none, and
 * is told to pick one rather than silently seeing a mix. */
export function requireLender(c: Context<AppEnv>): number {
  const id = c.get("lenderId");
  if (id == null) throw new AppError("Select a lender first.", 400);
  return id;
}
