import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { brandingSettings } from "../db/schema";
import { requireAuth, requireRole } from "../middleware/auth";

// Public: GET /api/branding, GET /api/branding/logo/**
export const branding = new Hono<AppEnv>();

async function currentSettings(db: ReturnType<typeof getDb>) {
  const [existing] = await db.select().from(brandingSettings).where(eq(brandingSettings.id, 1)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(brandingSettings).values({ id: 1 }).returning();
  return created;
}

branding.get("/", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await currentSettings(db));
});

// TODO(Day 4): serve uploaded logos from R2 once the bucket is enabled on the account
// (see wrangler.toml). Until then the admin can still set primary/accent colors via
// brandingAdmin below — only the logo image itself is unavailable.
branding.get("/logo/:filename", async (c) => c.notFound());

// Admin-only: PUT /api/auth/admin/branding, POST /api/auth/admin/branding/logo — mounted
// separately under the admin router's path prefix in index.ts.
export const brandingAdmin = new Hono<AppEnv>();
brandingAdmin.use("*", requireAuth, requireRole("ADMIN"));

brandingAdmin.put("/", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ primaryColor?: string; accentColor?: string }>();
  const settings = await currentSettings(db);
  const [updated] = await db
    .update(brandingSettings)
    .set({
      primaryColor: body.primaryColor ?? settings.primaryColor,
      accentColor: body.accentColor ?? settings.accentColor,
    })
    .where(eq(brandingSettings.id, 1))
    .returning();
  return c.json(updated);
});

brandingAdmin.post("/logo", async (c) => c.json({ message: "Logo upload needs R2 (Day 4)." }, 501));
