import type { Context, Next } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { verifyJwt } from "../lib/jwt";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

// Mirrors JwtAuthenticationFilter + SecurityConfig's `anyRequest().authenticated()`
// default: any route not explicitly public requires a valid Bearer token.
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("Token is invalid or expired.", 401);
  }
  const token = header.slice(7);

  let uuid: string;
  try {
    uuid = await verifyJwt(token, c.env.JWT_SECRET);
  } catch {
    throw new AppError("Token is invalid or expired.", 401);
  }

  const db = getDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.uuid, uuid)).limit(1);
  if (!user || !user.enabled) {
    throw new AppError("Token is invalid or expired.", 401);
  }

  c.set("authUser", user);
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
