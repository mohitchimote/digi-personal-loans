import type { users } from "./db/schema";

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
  };
};
