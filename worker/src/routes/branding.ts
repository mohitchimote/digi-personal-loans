import { Hono } from "hono";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { brandingSettings } from "../db/schema";
import { requireAuth, requireRole, requireLender, optionalAuth, publicLender } from "../middleware/auth";
import { inLender } from "../lib/lender-scope";
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

async function currentSettings(db: ReturnType<typeof getDb>, lenderId: number) {
  const [existing] = await db.select().from(brandingSettings).where(inLender(brandingSettings, lenderId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(brandingSettings).values({ lenderId }).returning();
  return created;
}

// Public, so the lender is not known from a token: the login and register pages pass ?lender=CODE
// (the same code the login uses), and a single-lender deployment needs none. Without a usable code
// the neutral defaults are returned rather than any one lender's branding.
const NEUTRAL_BRANDING = { primaryColor: "#003366", secondaryColor: "#002244", accentColor: "#FBB034", gradientStart: null, gradientEnd: null, logoUrl: null };

branding.get("/", optionalAuth, async (c) => {
  const db = getDb(c.env.DB);
  const lenderId = await publicLender(c, db);
  if (lenderId == null) return c.json(NEUTRAL_BRANDING);
  return c.json(await currentSettings(db, lenderId));
});

// Logos live under lender-<id>/branding/ in storage; the id is part of the URL. Logos uploaded
// before lenders existed are at branding/<file> and keep their old URL.
branding.get("/logo/:lenderId/:filename", async (c) => {
  const bucket = requireBucket(c);
  const lenderId = Number(c.req.param("lenderId"));
  if (!Number.isInteger(lenderId)) return c.notFound();
  const obj = await bucket.get(`lender-${lenderId}/branding/${c.req.param("filename")}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream" },
  });
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
  const lenderId = requireLender(c);
  const body = await c.req.json<{
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    gradientStart?: string | null;
    gradientEnd?: string | null;
  }>();
  const settings = await currentSettings(db, lenderId);
  const [updated] = await db
    .update(brandingSettings)
    .set({
      primaryColor: body.primaryColor ?? settings.primaryColor,
      secondaryColor: body.secondaryColor ?? settings.secondaryColor,
      accentColor: body.accentColor ?? settings.accentColor,
      gradientStart: body.gradientStart !== undefined ? body.gradientStart : settings.gradientStart,
      gradientEnd: body.gradientEnd !== undefined ? body.gradientEnd : settings.gradientEnd,
    })
    .where(inLender(brandingSettings, lenderId))
    .returning();
  return c.json(updated);
});

brandingAdmin.post("/logo", async (c) => {
  const bucket = requireBucket(c);
  const db = getDb(c.env.DB);
  const lenderId = requireLender(c);
  const body = await c.req.parseBody();

  const file = body["file"];
  if (!(file instanceof File)) throw new AppError("A logo file is required.");
  const ext = ALLOWED_LOGO_TYPES[file.type];
  if (!ext) throw new AppError("Logo must be a PNG, JPEG, or SVG image.");
  if (file.size > MAX_LOGO_BYTES) throw new AppError("Logo is too large. Maximum size is 5MB.", 413);

  const filename = `logo_${crypto.randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();
  await bucket.put(`lender-${lenderId}/branding/${filename}`, bytes, { httpMetadata: { contentType: file.type } });

  const settings = await currentSettings(db, lenderId);
  const previousLogoUrl = settings.logoUrl;
  const [updated] = await db
    .update(brandingSettings)
    .set({ logoUrl: `/api/branding/logo/${lenderId}/${filename}` })
    .where(inLender(brandingSettings, lenderId))
    .returning();

  // Best-effort cleanup of the previous logo — a failure here shouldn't fail the upload itself,
  // the new logo is already saved and live.
  if (previousLogoUrl?.startsWith("/api/branding/logo/")) {
    // New URLs are /logo/<lenderId>/<file>; older ones are /logo/<file> (stored at branding/<file>).
    const rest = previousLogoUrl.replace("/api/branding/logo/", "");
    const key = rest.includes("/") ? `lender-${rest.split("/")[0]}/branding/${rest.split("/")[1]}` : `branding/${rest}`;
    // Only ever delete within the caller's own lender (or the pre-lender folder).
    if (key.startsWith(`lender-${lenderId}/`) || key.startsWith("branding/")) await bucket.delete(key).catch(() => {});
  }

  return c.json(updated);
});
