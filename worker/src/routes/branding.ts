import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { brandingSettings } from "../db/schema";
import { requireAuth, requireRole } from "../middleware/auth";
import { AppError } from "../lib/errors";

const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

function requireBucket(c: any) {
  if (!c.env.DOCUMENTS) {
    throw new AppError("File storage (R2) is not yet enabled on this Cloudflare account.", 503);
  }
  return c.env.DOCUMENTS as R2Bucket;
}

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

branding.get("/logo/:filename", async (c) => {
  const bucket = requireBucket(c);
  const filename = c.req.param("filename");
  const obj = await bucket.get(`branding/${filename}`);
  if (!obj) return c.notFound();
  // Cache-Control is deliberately not set here — the global /api/* middleware in index.ts
  // overwrites it to no-store regardless, so setting a long-lived value here would be dead code.
  return new Response(obj.body, {
    headers: { "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream" },
  });
});

// Admin-only: PUT /api/auth/admin/branding, POST /api/auth/admin/branding/logo — mounted
// separately under the admin router's path prefix in index.ts.
export const brandingAdmin = new Hono<AppEnv>();
brandingAdmin.use("*", requireAuth, requireRole("ADMIN"));

brandingAdmin.put("/", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ primaryColor?: string; secondaryColor?: string; accentColor?: string }>();
  const settings = await currentSettings(db);
  const [updated] = await db
    .update(brandingSettings)
    .set({
      primaryColor: body.primaryColor ?? settings.primaryColor,
      secondaryColor: body.secondaryColor ?? settings.secondaryColor,
      accentColor: body.accentColor ?? settings.accentColor,
    })
    .where(eq(brandingSettings.id, 1))
    .returning();
  return c.json(updated);
});

brandingAdmin.post("/logo", async (c) => {
  const bucket = requireBucket(c);
  const db = getDb(c.env.DB);
  const body = await c.req.parseBody();

  const file = body["file"];
  if (!(file instanceof File)) throw new AppError("A logo file is required.");
  const ext = ALLOWED_LOGO_TYPES[file.type];
  if (!ext) throw new AppError("Logo must be a PNG, JPEG, or SVG image.");
  if (file.size > MAX_LOGO_BYTES) throw new AppError("Logo is too large. Maximum size is 5MB.", 413);

  const filename = `logo_${crypto.randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();
  await bucket.put(`branding/${filename}`, bytes, { httpMetadata: { contentType: file.type } });

  const settings = await currentSettings(db);
  const previousLogoUrl = settings.logoUrl;
  const [updated] = await db
    .update(brandingSettings)
    .set({ logoUrl: `/api/branding/logo/${filename}` })
    .where(eq(brandingSettings.id, 1))
    .returning();

  // Best-effort cleanup of the previous logo — a failure here shouldn't fail the upload itself,
  // the new logo is already saved and live.
  if (previousLogoUrl?.startsWith("/api/branding/logo/")) {
    const previousFilename = previousLogoUrl.replace("/api/branding/logo/", "");
    await bucket.delete(`branding/${previousFilename}`).catch(() => {});
  }

  return c.json(updated);
});
