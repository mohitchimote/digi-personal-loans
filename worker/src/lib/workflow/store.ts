import { and, desc, eq } from "drizzle-orm";
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
