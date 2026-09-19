import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { formVersions, type loanApplications } from "../db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { AppError } from "./errors";
import { recordAudit } from "./audit";
import { formVersionSchemaSchema, type FormKey, type FormVersionSchema } from "./form-schema-types";
import { needsAttentionSections } from "./sections";

type App = InferSelectModel<typeof loanApplications>;
type FormVersionRow = InferSelectModel<typeof formVersions>;

export function formKeyFor(applicationType: string): FormKey {
  return applicationType === "BUSINESS" ? "business-loan-wizard" : "personal-loan-wizard";
}

export async function getPublishedVersion(db: Db, formKey: FormKey): Promise<FormVersionRow | null> {
  const [row] = await db
    .select()
    .from(formVersions)
    .where(and(eq(formVersions.formKey, formKey), eq(formVersions.status, "PUBLISHED")))
    .limit(1);
  return row ?? null;
}

export async function getVersionById(db: Db, id: number): Promise<FormVersionRow | null> {
  const [row] = await db.select().from(formVersions).where(eq(formVersions.id, id)).limit(1);
  return row ?? null;
}

export async function listVersions(db: Db, formKey: FormKey): Promise<FormVersionRow[]> {
  return db.select().from(formVersions).where(eq(formVersions.formKey, formKey)).orderBy(desc(formVersions.version));
}

export function parseSchema(row: FormVersionRow): FormVersionSchema {
  return formVersionSchemaSchema.parse(JSON.parse(row.schemaJson));
}

// Resolves which form_versions row an application should be judged against right now.
// - Submitted (or beyond): the row frozen onto the application at submit time — see
//   applications.ts's review-submit handler, which is the only writer of formVersionId. Never
//   re-resolved afterward, so a later publish can't change what an already-submitted application
//   is judged against.
// - Still in flight (DRAFT/IN_PROGRESS): always whatever is currently PUBLISHED for this
//   application's formKey — there is nothing pinned yet, deliberately, so a newly-published
//   required field surfaces on the customer's very next load (see sections.ts's schema-aware
//   completion check, which is what can un-tick a previously-complete section).
export async function resolveActiveSchemaVersion(db: Db, app: App): Promise<FormVersionRow | null> {
  if (app.formVersionId != null) {
    return getVersionById(db, app.formVersionId);
  }
  return getPublishedVersion(db, formKeyFor(app.applicationType));
}

// The read-path counterpart to the write-path decisions above: attaches the info the wizard and
// sidebar need to render schema-aware, without changing the shape of `app` itself (every existing
// consumer of GET /:appRef keeps working unchanged; these are additive top-level fields). Scoped
// to the two read routes the wizard/sidebar actually resolve against (GET /:appRef and
// GET /customer/:customerId/current) rather than every mutation response — a mutation's own
// `.returning()` row doesn't need this, and widening every response risked touching more call
// sites than necessary for what's a read-side concern.
export async function withResolvedFormVersion(db: Db, app: App) {
  const version = await resolveActiveSchemaVersion(db, app);
  if (!version) {
    return { ...app, resolvedFormVersion: null, formSchema: null, needsAttentionSections: [] as string[] };
  }
  let schema: FormVersionSchema | null = null;
  try {
    schema = parseSchema(version);
  } catch {
    schema = null; // a malformed schema on the resolved version degrades to "nothing to check", never to a broken page
  }
  return {
    ...app,
    resolvedFormVersion: { id: version.id, version: version.version, status: version.status },
    // The full parsed schema, not just the version pointer — lets the wizard render any kind:
    // "custom" fields and the sidebar compute completion in the same round-trip that already
    // fetches the application, per the plan's "no second round-trip" call.
    formSchema: schema,
    needsAttentionSections: needsAttentionSections(app, schema),
  };
}

export async function createDraftFrom(
  db: Db,
  formKey: FormKey,
  sourceVersionId: number | null,
  createdBy: string | null
): Promise<FormVersionRow> {
  const source = sourceVersionId != null ? await getVersionById(db, sourceVersionId) : await getPublishedVersion(db, formKey);
  const siblings = await listVersions(db, formKey);
  const nextVersion = (siblings[0]?.version ?? 0) + 1;
  const schemaJson = source ? source.schemaJson : JSON.stringify({ sections: [] } satisfies FormVersionSchema);
  const [created] = await db
    .insert(formVersions)
    .values({
      formKey,
      version: nextVersion,
      status: "DRAFT",
      schemaJson,
      createdAt: new Date().toISOString(),
      createdBy,
    })
    .returning();
  return created;
}

export async function updateDraft(
  db: Db,
  id: number,
  fields: { schemaJson?: string; changeNote?: string | null }
): Promise<FormVersionRow> {
  const existing = await getVersionById(db, id);
  if (!existing) throw new AppError("Form version not found.", 404);
  if (existing.status !== "DRAFT") throw new AppError("Only a draft version can be edited.", 400);
  if (fields.schemaJson) {
    // Throws with a readable Zod issue list on malformed input — same "validate shape, don't
    // silently accept anything" discipline as section-schemas.ts's .strict() schemas.
    formVersionSchemaSchema.parse(JSON.parse(fields.schemaJson));
  }
  const [updated] = await db
    .update(formVersions)
    .set({
      schemaJson: fields.schemaJson ?? existing.schemaJson,
      changeNote: fields.changeNote !== undefined ? fields.changeNote : existing.changeNote,
    })
    .where(eq(formVersions.id, id))
    .returning();
  return updated;
}

export async function discardDraft(db: Db, id: number): Promise<void> {
  const existing = await getVersionById(db, id);
  if (!existing) throw new AppError("Form version not found.", 404);
  if (existing.status !== "DRAFT") throw new AppError("Only a draft version can be discarded.", 400);
  await db.delete(formVersions).where(eq(formVersions.id, id));
}

// Archive-then-promote, as two sequential statements rather than a wrapped transaction — this
// project has no existing multi-statement-transaction precedent anywhere (D1's batch/transaction
// support is limited and every other mutation here is a single UPDATE/INSERT); publishing is a
// rare, single-admin action, so the small window between the two statements is an accepted,
// consistent-with-the-rest-of-this-codebase risk rather than new infrastructure.
export async function publishVersion(
  db: Db,
  id: number,
  publishedBy: string
): Promise<FormVersionRow> {
  const draft = await getVersionById(db, id);
  if (!draft) throw new AppError("Form version not found.", 404);
  if (draft.status !== "DRAFT") throw new AppError("Only a draft version can be published.", 400);

  const currentlyPublished = await getPublishedVersion(db, draft.formKey as FormKey);
  if (currentlyPublished) {
    await db.update(formVersions).set({ status: "ARCHIVED" }).where(eq(formVersions.id, currentlyPublished.id));
  }

  const [published] = await db
    .update(formVersions)
    .set({ status: "PUBLISHED", publishedAt: new Date().toISOString(), publishedBy })
    .where(eq(formVersions.id, id))
    .returning();

  await recordAudit(db, {
    eventType: "FORM_VERSION_PUBLISHED",
    subjectType: "form_versions",
    subjectId: String(id),
    actor: publishedBy,
    actorRole: "ADMIN",
    detail: `${draft.formKey} v${draft.version}${draft.changeNote ? `: ${draft.changeNote}` : ""}`,
  });

  return published;
}
