import type { Context, Next } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { verifyJwt } from "../lib/jwt";
import { AppError } from "../lib/errors";
import { resolveRole } from "../lib/roles";
import type { AppEnv } from "../types";

// Mirrors JwtAuthenticationFilter + SecurityConfig's `anyRequest().authenticated()`
// default: any route not explicitly public requires a valid Bearer token.
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("Token is invalid or expired.", 401);
  }
  const token = header.slice(7);

  let verified: { uuid: string; issuedAt: number };
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

  c.set("authUser", user);
  // Phase 2 - resolve the role's admin-configured entitlements/scope once per request (cached),
  // so every later check is a plain synchronous lookup.
  c.set("authRole", await resolveRole(db, user.role));
  await next();
}

// Mirrors SecurityConfig's per-path `.hasRole(...)` rules
// (/api/auth/admin/** -> ADMIN, register-by-staff/customer-profile -> BANKER).
export function requireRole(...roles: string[]) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get("authUser");
    if (!user || !roles.includes(user.role)) {
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
