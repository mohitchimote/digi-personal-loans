import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import type { Db } from "../db/client";
import { getDb } from "../db/client";
import { emailTemplates } from "../db/schema";
import { requireAuth, requireRole } from "../middleware/auth";
import { AppError } from "../lib/errors";
import { success, fail } from "../lib/api-response";
import { EVENT_REGISTRY, EVENT_KEYS, isKnownEventKey, SAMPLE_VARIABLES } from "../lib/email-events";
import { renderTemplate, deliverEmail, splitAddresses, getBrandingForEmail } from "../lib/email";

// Own router mounted at /api/auth/admin/email-templates in index.ts, following the same
// large-admin-sub-feature-gets-its-own-file precedent as routes/branding.ts's brandingAdmin.
export const emailTemplatesAdmin = new Hono<AppEnv>();
emailTemplatesAdmin.use("*", requireAuth, requireRole("ADMIN"));

async function getOrSeedTemplate(db: Db, eventKey: string) {
  const [existing] = await db.select().from(emailTemplates).where(eq(emailTemplates.eventKey, eventKey)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(emailTemplates).values({ eventKey }).returning();
  return created;
}

function requireKnownEvent(eventKey: string) {
  if (!isKnownEventKey(eventKey)) throw new AppError(`Unknown event: ${eventKey}`);
}

emailTemplatesAdmin.get("/events", (c) => {
  return c.json(EVENT_KEYS.map((key) => EVENT_REGISTRY[key]));
});

emailTemplatesAdmin.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await Promise.all(EVENT_KEYS.map((key) => getOrSeedTemplate(db, key)));
  const withMeta = rows.map((row) => ({ ...row, ...EVENT_REGISTRY[row.eventKey] }));
  return c.json(withMeta);
});

const upsertSchema = z.object({
  enabled: z.boolean(),
  toAddress: z.string().nullable().optional(),
  ccAddress: z.string().nullable().optional(),
  subject: z.string().min(1),
  headerContent: z.string().nullable().optional(),
  bodyContent: z.string().min(1),
  signature: z.string().nullable().optional(),
  footer: z.string().nullable().optional(),
});

emailTemplatesAdmin.put("/:eventKey", zValidator("json", upsertSchema), async (c) => {
  const eventKey = c.req.param("eventKey");
  requireKnownEvent(eventKey);
  const db = getDb(c.env.DB);
  await getOrSeedTemplate(db, eventKey);
  const body = c.req.valid("json");
  const authUser = c.get("authUser");
  const [updated] = await db
    .update(emailTemplates)
    .set({
      ...body,
      updatedAt: new Date().toISOString(),
      updatedBy: authUser.email,
    })
    .where(eq(emailTemplates.eventKey, eventKey))
    .returning();
  return c.json({ ...updated, ...EVENT_REGISTRY[eventKey] });
});

const draftFieldsSchema = z.object({
  subject: z.string().optional(),
  headerContent: z.string().nullable().optional(),
  bodyContent: z.string().optional(),
  signature: z.string().nullable().optional(),
  footer: z.string().nullable().optional(),
  ccAddress: z.string().nullable().optional(),
});

emailTemplatesAdmin.post("/:eventKey/preview", zValidator("json", draftFieldsSchema), async (c) => {
  const eventKey = c.req.param("eventKey");
  requireKnownEvent(eventKey);
  const db = getDb(c.env.DB);
  const draft = c.req.valid("json");
  const existing = await getOrSeedTemplate(db, eventKey);
  const fields = {
    subject: draft.subject ?? existing.subject,
    headerContent: draft.headerContent ?? existing.headerContent,
    bodyContent: draft.bodyContent ?? existing.bodyContent,
    signature: draft.signature ?? existing.signature,
    footer: draft.footer ?? existing.footer,
  };
  const branding = await getBrandingForEmail(db);
  const rendered = renderTemplate(branding, fields, SAMPLE_VARIABLES);
  return c.json({ html: rendered.html });
});

emailTemplatesAdmin.post("/:eventKey/test", zValidator("json", draftFieldsSchema), async (c) => {
  const eventKey = c.req.param("eventKey");
  requireKnownEvent(eventKey);
  const db = getDb(c.env.DB);
  const draft = c.req.valid("json");
  const existing = await getOrSeedTemplate(db, eventKey);
  const fields = {
    subject: draft.subject ?? existing.subject,
    headerContent: draft.headerContent ?? existing.headerContent,
    bodyContent: draft.bodyContent ?? existing.bodyContent,
    signature: draft.signature ?? existing.signature,
    footer: draft.footer ?? existing.footer,
  };
  const ccSource = draft.ccAddress ?? existing.ccAddress;

  const branding = await getBrandingForEmail(db);
  const rendered = renderTemplate(branding, fields, SAMPLE_VARIABLES);
  const authUser = c.get("authUser");

  // Unlike sendTemplatedEmail's best-effort/swallow behavior, a test send with no feedback is
  // useless to the admin — surface Resend's error (e.g. a sandbox-domain rejection) directly.
  const result = await deliverEmail(c.env, {
    to: authUser.email,
    cc: splitAddresses(ccSource),
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (!result.ok) return fail(c, result.error);
  return success(c, `Test email sent to ${authUser.email}.`, null);
});
