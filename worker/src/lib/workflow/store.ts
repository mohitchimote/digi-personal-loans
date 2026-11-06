import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { loanApplications, wfCases, wfCaseTracks, wfDefinitions } from "../../db/schema";
import { AppError } from "../errors";
import { ENTITLEMENT_KEYS } from "../entitlements";
import { createCase } from "./engine";
import { validateDefinition } from "./validate";
import type { CaseFields, CaseState, TrackStates, WorkflowDefinition } from "./types";
// The default definition is bundled so a fresh environment works on day one with no seed step.
// workflow-spec/ is the source of truth (the Java engine reads the same files).
import defaultDefinitionJson from "../../../../workflow-spec/loan-origination.v1.json";

export const DEFAULT_DEFINITION_KEY = "loan-origination";

type LoanRow = typeof loanApplications.$inferSelect;
export type DefinitionRow = typeof wfDefinitions.$inferSelect;

// PUBLISHED and ARCHIVED definitions are immutable, so parsed copies are cached for the isolate's
// lifetime. DRAFT rows are never cached.
const parsedById = new Map<number, WorkflowDefinition>();

export function parseDefinition(row: DefinitionRow): WorkflowDefinition {
  const cached = parsedById.get(row.id);
  if (cached) return cached;
  const parsed = JSON.parse(row.definitionJson) as WorkflowDefinition;
  if (row.status !== "DRAFT") parsedById.set(row.id, parsed);
  return parsed;
}

export async function getPublishedRow(db: Db, key = DEFAULT_DEFINITION_KEY): Promise<DefinitionRow | null> {
  const [row] = await db
    .select().from(wfDefinitions)
    .where(and(eq(wfDefinitions.definitionKey, key), eq(wfDefinitions.status, "PUBLISHED")))
    .orderBy(desc(wfDefinitions.version)).limit(1);
  return row ?? null;
}

/** The published default definition, seeding v1 from the bundled copy the first time it is needed. */
export async function ensureDefaultDefinition(db: Db): Promise<DefinitionRow> {
  const existing = await getPublishedRow(db);
  if (existing) return existing;

  const checked = validateDefinition(defaultDefinitionJson, { entitlementKeys: ENTITLEMENT_KEYS });
  if (!checked.ok) throw new Error(`Bundled default workflow definition is invalid: ${checked.errors.join("; ")}`);
  const now = new Date().toISOString();
  await db.insert(wfDefinitions).values({
    definitionKey: DEFAULT_DEFINITION_KEY, version: 1, status: "PUBLISHED",
    definitionJson: JSON.stringify(checked.definition), changeNote: "Seeded default definition",
    createdAt: now, createdBy: "system", publishedAt: now, publishedBy: "system",
  });
  // Two first requests can race to seed; keep the lowest id and drop any duplicate we just made.
  const all = await db.select().from(wfDefinitions)
    .where(and(eq(wfDefinitions.definitionKey, DEFAULT_DEFINITION_KEY), eq(wfDefinitions.status, "PUBLISHED")))
    .orderBy(wfDefinitions.id);
  for (const dup of all.slice(1)) await db.delete(wfDefinitions).where(eq(wfDefinitions.id, dup.id));
  return all[0];
}

export async function getDefinitionRow(db: Db, id: number): Promise<DefinitionRow> {
  const [row] = await db.select().from(wfDefinitions).where(eq(wfDefinitions.id, id)).limit(1);
  if (!row) throw new AppError(`Workflow definition not found: ${id}`, 404);
  return row;
}

export function caseFieldsOf(app: LoanRow): CaseFields {
  return {
    referredToRole: app.referredToRole ?? null,
    approvedAmount: app.approvedAmount ?? null,
    guarantorRequired: !!app.guarantorRequired,
    guarantorDetailsPresent: app.guarantorDetailsJson != null,
    currentSection: app.currentSection,
    applicationType: app.applicationType === "BUSINESS" ? "BUSINESS" : "PERSONAL",
    orgUnitId: app.orgUnitId ?? null,
  };
}

/** The legacy columns (`status`, `disbursementStatus`) are a mirror of the engine's track state;
 * this reads them back for a case that predates the engine. */
function tracksFromMirror(def: WorkflowDefinition, app: LoanRow): TrackStates {
  const base = createCase(def, def.tracks.find((t) => t.entryPoints?.length)?.entryPoints?.[0]?.key ?? "start");
  if (!base.ok) throw new AppError(base.message, 500);
  const tracks = base.tracks;
  const legacy: Record<string, string | null | undefined> = { case: app.status, disbursement: app.disbursementStatus ?? "NOT_STARTED" };
  for (const t of def.tracks) {
    const wanted = legacy[t.key];
    const st = wanted ? t.statuses.find((s) => s.key === wanted) : undefined;
    if (wanted && !st) throw new AppError(`Application ${app.applicationRef} is in status ${wanted}, which the workflow does not define.`, 500);
    if (st) tracks[t.key] = { status: st.key, stage: st.stage };
  }
  return tracks;
}

export interface LoadedCase {
  definitionId: number;
  definition: WorkflowDefinition;
  state: CaseState;
}

/** Loads the case's workflow state, registering it first if this application predates the engine
 * (or was just created): the case is pinned to the definition published right now. */
export async function loadCase(db: Db, app: LoanRow): Promise<LoadedCase> {
  let [wc] = await db.select().from(wfCases).where(eq(wfCases.applicationRef, app.applicationRef)).limit(1);
  if (!wc) {
    const published = await ensureDefaultDefinition(db);
    const definition = parseDefinition(published);
    const tracks = tracksFromMirror(definition, app);
    const now = new Date().toISOString();
    await db.batch([
      db.insert(wfCases).values({ applicationRef: app.applicationRef, definitionId: published.id, createdAt: now }).onConflictDoNothing(),
      ...Object.entries(tracks).map(([trackKey, t]) =>
        db.insert(wfCaseTracks).values({ applicationRef: app.applicationRef, trackKey, status: t.status, stage: t.stage, enteredAt: now }).onConflictDoNothing(),
      ),
    ] as unknown as [never, ...never[]]);
    [wc] = await db.select().from(wfCases).where(eq(wfCases.applicationRef, app.applicationRef)).limit(1);
  }
  const definition = parseDefinition(await getDefinitionRow(db, wc.definitionId));
  const rows = await db.select().from(wfCaseTracks).where(eq(wfCaseTracks.applicationRef, app.applicationRef));
  const tracks: TrackStates = {};
  for (const r of rows) tracks[r.trackKey] = { status: r.status, stage: r.stage };
  // Fill any track added to the definition after this case was registered.
  for (const [k, v] of Object.entries(tracksFromMirror(definition, app))) if (!tracks[k]) tracks[k] = v;
  return { definitionId: wc.definitionId, definition, state: { tracks, fields: caseFieldsOf(app) } };
}

// ---------------------------------------------------------------- definition lifecycle (admin)
// Same shape as lib/form-versions.ts: DRAFT -> PUBLISHED -> ARCHIVED. One open draft per key keeps
// the builder simple. A case is pinned to whichever definition was published when it registered,
// so publishing never changes the rules of a case already in flight.

export async function listDefinitions(db: Db): Promise<(DefinitionRow & { caseCount: number })[]> {
  const rows = await db.select().from(wfDefinitions).orderBy(wfDefinitions.definitionKey, desc(wfDefinitions.version));
  const counts = await db.select({ id: wfCases.definitionId, n: sql<number>`count(*)` }).from(wfCases).groupBy(wfCases.definitionId);
  const byId = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return rows.map((r) => ({ ...r, caseCount: byId.get(r.id) ?? 0 }));
}

export async function createDraft(db: Db, key: string, sourceId: number | undefined, actor: string): Promise<{ row: DefinitionRow; existing: boolean }> {
  const all = await db.select().from(wfDefinitions).where(eq(wfDefinitions.definitionKey, key));
  if (all.length === 0) throw new AppError(`Unknown workflow: ${key}`, 404);
  const open = all.find((r) => r.status === "DRAFT");
  if (open) return { row: open, existing: true };

  const source = sourceId !== undefined ? all.find((r) => r.id === sourceId) : all.filter((r) => r.status === "PUBLISHED")[0];
  if (!source) throw new AppError(sourceId !== undefined ? "Source version not found." : "Nothing is published to copy from.", 404);
  const [row] = await db.insert(wfDefinitions).values({
    definitionKey: key, version: Math.max(...all.map((r) => r.version)) + 1, status: "DRAFT",
    definitionJson: source.definitionJson, changeNote: null, createdAt: new Date().toISOString(), createdBy: actor,
  }).returning();
  return { row, existing: false };
}

export type SaveResult = { ok: true; row: DefinitionRow } | { ok: false; errors: string[] };

export async function saveDraft(db: Db, id: number, raw: unknown, changeNote: string | null): Promise<SaveResult> {
  const row = await getDefinitionRow(db, id);
  if (row.status !== "DRAFT") throw new AppError("Only a draft can be edited.", 409);
  const checked = validateDefinition(raw, { entitlementKeys: ENTITLEMENT_KEYS });
  if (!checked.ok) return { ok: false, errors: checked.errors };
  if (checked.definition.key !== row.definitionKey) return { ok: false, errors: [`key: must stay "${row.definitionKey}"`] };
  const [saved] = await db.update(wfDefinitions)
    .set({ definitionJson: JSON.stringify(checked.definition), changeNote })
    .where(eq(wfDefinitions.id, id)).returning();
  return { ok: true, row: saved };
}

export async function discardDraft(db: Db, id: number): Promise<void> {
  const row = await getDefinitionRow(db, id);
  if (row.status !== "DRAFT") throw new AppError("Only a draft can be discarded.", 409);
  await db.delete(wfDefinitions).where(eq(wfDefinitions.id, id));
}

/** Statuses the new definition drops while live cases are still sitting in them. Those cases'
 * queues, labels and actions would vanish, so publishing is refused until they are moved. */
async function strandedStatuses(db: Db, previous: WorkflowDefinition, next: WorkflowDefinition): Promise<string[]> {
  const problems: string[] = [];
  for (const t of previous.tracks) {
    const nextTrack = next.tracks.find((x) => x.key === t.key);
    for (const s of t.statuses) {
      if (nextTrack?.statuses.some((n) => n.key === s.key)) continue;
      const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(wfCaseTracks)
        .where(and(eq(wfCaseTracks.trackKey, t.key), eq(wfCaseTracks.status, s.key)));
      if (Number(n) > 0) problems.push(`${t.key}.${s.key} was removed but ${Number(n)} case(s) are still in it`);
    }
  }
  return problems;
}

export async function publishDraft(db: Db, id: number, actor: string): Promise<SaveResult> {
  const row = await getDefinitionRow(db, id);
  if (row.status !== "DRAFT") throw new AppError("Only a draft can be published.", 409);
  const checked = validateDefinition(JSON.parse(row.definitionJson), { entitlementKeys: ENTITLEMENT_KEYS });
  if (!checked.ok) return { ok: false, errors: checked.errors };

  const current = await getPublishedRow(db, row.definitionKey);
  if (current) {
    const stranded = await strandedStatuses(db, parseDefinition(current), checked.definition);
    if (stranded.length) return { ok: false, errors: stranded };
  }
  const now = new Date().toISOString();
  const queries = [
    ...(current ? [db.update(wfDefinitions).set({ status: "ARCHIVED" }).where(eq(wfDefinitions.id, current.id))] : []),
    db.update(wfDefinitions).set({ status: "PUBLISHED", publishedAt: now, publishedBy: actor }).where(eq(wfDefinitions.id, id)),
  ];
  await db.batch(queries as unknown as [never, ...never[]]);
  return { ok: true, row: await getDefinitionRow(db, id) };
}

// ---------------------------------------------------------------- runtime projection (UI)

export interface DefinitionProjection {
  definitionId: number;
  key: string;
  version: number;
  stages: WorkflowDefinition["stages"];
  /** track -> status key -> display info. Includes statuses that only older versions define, so
   * a case pinned to an older version still shows a proper label. */
  statuses: Record<string, Record<string, { label: { en: string; he: string }; badge: string; category: string; stage: string | null }>>;
  queues: WorkflowDefinition["queues"];
}

export async function projectPublished(db: Db): Promise<DefinitionProjection> {
  const published = await ensureDefaultDefinition(db);
  const def = parseDefinition(published);
  const rows = await db.select().from(wfDefinitions)
    .where(and(eq(wfDefinitions.definitionKey, published.definitionKey), ne(wfDefinitions.status, "DRAFT")))
    .orderBy(wfDefinitions.version);
  const statuses: DefinitionProjection["statuses"] = {};
  for (const r of rows) {
    for (const t of parseDefinition(r).tracks) {
      const bucket = (statuses[t.key] ??= {});
      for (const s of t.statuses) bucket[s.key] = { label: s.label, badge: s.badge, category: s.category, stage: s.stage };
    }
  }
  return { definitionId: published.id, key: def.key, version: published.version, stages: def.stages, statuses, queues: def.queues };
}

/** Status keys of the case track whose category is one of `categories` (e.g. the statuses in which
 * the customer is still working on the application). */
export async function statusesByCategory(db: Db, categories: string[]): Promise<string[]> {
  const def = parseDefinition(await ensureDefaultDefinition(db));
  const track = def.tracks.find((t) => t.key === "case") ?? def.tracks[0];
  return track.statuses.filter((s) => categories.includes(s.category)).map((s) => s.key);
}
