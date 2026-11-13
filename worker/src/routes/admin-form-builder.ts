import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { AppError } from "../lib/errors";
import { success } from "../lib/api-response";
import { FORM_KEYS, isFormKey, type FormKey } from "../lib/form-schema-types";
import { applyMasterSources } from "../lib/form-master-sources";
import {
  createDraftFrom,
  discardDraft,
  getPublishedVersion,
  getVersionById,
  listVersions,
  parseSchema,
  publishVersion,
  updateDraft,
} from "../lib/form-versions";

// Admin Form Builder — own router mounted at /api/auth/admin/form-builder in index.ts, following
// the same large-admin-sub-feature-gets-its-own-file precedent as admin-email-templates.ts.
export const formBuilderAdmin = new Hono<AppEnv>();
formBuilderAdmin.use("*", requireAuth, requireRole("ADMIN"));

function requireKnownFormKey(formKey: string) {
  if (!isFormKey(formKey)) throw new AppError(`Unknown form: ${formKey}`);
}

// One row per formKey: its published version's summary (or null if nothing's published yet,
// which only happens before the seed script has run) plus a draft/archived count for context.
formBuilderAdmin.get("/forms", async (c) => {
  const db = getDb(c.env.DB);
  const forms = await Promise.all(
    FORM_KEYS.map(async (formKey) => {
      const versions = await listVersions(db, formKey);
      const published = versions.find((v) => v.status === "PUBLISHED") ?? null;
      return {
        formKey,
        published: published ? { id: published.id, version: published.version, publishedAt: published.publishedAt, publishedBy: published.publishedBy } : null,
        draftCount: versions.filter((v) => v.status === "DRAFT").length,
        totalVersions: versions.length,
      };
    })
  );
  return c.json(forms);
});

formBuilderAdmin.get("/forms/:formKey/versions", async (c) => {
  const formKey = c.req.param("formKey");
  requireKnownFormKey(formKey);
  const db = getDb(c.env.DB);
  const versions = await listVersions(db, formKey as any);
  return c.json(versions.map((v) => ({ ...v, schemaJson: undefined })));
});

formBuilderAdmin.get("/versions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const version = await getVersionById(db, id);
  if (!version) throw new AppError("Form version not found.", 404);
  return c.json(version);
});

const createDraftSchema = z.object({ sourceVersionId: z.number().nullable().optional() }).strict();

formBuilderAdmin.post("/forms/:formKey/draft", zValidator("json", createDraftSchema), async (c) => {
  const formKey = c.req.param("formKey");
  requireKnownFormKey(formKey);
  const { sourceVersionId } = c.req.valid("json");
  const db = getDb(c.env.DB);
  const authUser = c.get("authUser");
  const draft = await createDraftFrom(db, formKey as any, sourceVersionId ?? null, authUser.email);
  return success(c, "Draft created.", draft, 201);
});

const updateDraftSchema = z
  .object({
    schemaJson: z.string().optional(),
    changeNote: z.string().nullable().optional(),
  })
  .strict();

formBuilderAdmin.put("/versions/:id", zValidator("json", updateDraftSchema), async (c) => {
  const id = Number(c.req.param("id"));
  const body = c.req.valid("json");
  const db = getDb(c.env.DB);
  const updated = await updateDraft(db, id, body);
  return success(c, "Draft saved.", updated);
});

formBuilderAdmin.post("/versions/:id/publish", async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const authUser = c.get("authUser");
  const published = await publishVersion(db, id, authUser.email);
  return success(c, `Published as v${published.version}.`, published);
});

formBuilderAdmin.delete("/versions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  await discardDraft(db, id);
  return success(c, "Draft discarded.", null);
});

// Brings a form's published definition up to date with the masters: each pick-list field takes its options
// from its master (lib/form-master-sources.ts). Creates a draft from the published version, applies the
// sources, and publishes it as a new version; a field an admin already configured is never overridden.
// Idempotent: when nothing needs changing no version is created.
formBuilderAdmin.post("/forms/:formKey/apply-master-sources", async (c) => {
  const formKey = c.req.param("formKey");
  requireKnownFormKey(formKey);
  const db = getDb(c.env.DB);
  const published = await getPublishedVersion(db, formKey as FormKey);
  if (!published) throw new AppError("No published version for this form yet.", 404);
  const { schema, changes } = applyMasterSources(formKey as FormKey, parseSchema(published));
  if (changes.length === 0) return success(c, "Already up to date.", { changes });
  const authUser = c.get("authUser");
  const draft = await createDraftFrom(db, formKey as FormKey, published.id, authUser.email);
  try {
    await updateDraft(db, draft.id, { schemaJson: JSON.stringify(schema), changeNote: `Options now come from masters (${changes.length} field${changes.length === 1 ? "" : "s"})` });
    const version = await publishVersion(db, draft.id, authUser.email);
    return success(c, `Published as v${version.version}.`, { version: version.version, changes });
  } catch (e) {
    await discardDraft(db, draft.id).catch(() => undefined); // do not leave a half-made draft behind
    throw e;
  }
});

// Convenience for the Angular wizard preview panel — the currently-published version's parsed
// schema for a form, with no auth beyond ADMIN since this mirrors what the builder's own preview
// pane needs; the *customer-facing* resolution path lives in applications.ts, not here.
formBuilderAdmin.get("/forms/:formKey/published", async (c) => {
  const formKey = c.req.param("formKey");
  requireKnownFormKey(formKey);
  const db = getDb(c.env.DB);
  const version = await getPublishedVersion(db, formKey as any);
  if (!version) throw new AppError("No published version for this form yet.", 404);
  return c.json(version);
});
