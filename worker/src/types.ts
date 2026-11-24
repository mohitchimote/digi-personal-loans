import type { users } from "./db/schema";
import type { RoleConfig } from "./lib/roles";

export interface Env {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  ASSETS: Fetcher;
  DEMO_MODE: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
}

export type AuthUser = typeof users.$inferSelect;

export type AppEnv = {
  Bindings: Env;
  Variables: {
    authUser: AuthUser;
    authRole: RoleConfig;
    /** The lender every query in this request is scoped to. Null only for a platform (super admin)
     * token that has not entered a lender; routes that need a lender use requireLender(c). */
    lenderId: number | null;
    /** Set only in an "enter as" session: the administrator behind the user in `authUser`. */
    actingUser?: AuthUser;
  };
};
