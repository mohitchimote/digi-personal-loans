import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { getDb, type Db } from "../../db/client";
import { caseReferrals, loanApplications, underwritingNotes, wfCaseTracks, wfTransitions } from "../../db/schema";
import type { AppEnv, Env } from "../../types";
import { AppError } from "../errors";
import { isCaseVisible } from "../org";
import { resolveMandate } from "../mandates";
import { allRoleConfigs } from "../roles";
import { recordAudit } from "../audit";
import { sendNotification, getPreferredLanguage } from "../notifications";
import { sendTemplatedEmail } from "../email";
import { warmLoanPurposeNames } from "../app-format";
import { getAutoApprovalThreshold } from "../affordability-rules";
import { generateOfferPack } from "../document-pack";
import { authoriseCardPayment } from "../card-payment";
import { resolveActiveSchemaVersion } from "../form-versions";
import { logError } from "../log";
import { allowedActions, evaluate, findTransition, queueAccess } from "./engine";
import { routeOnEntry } from "./assignment";
import { ensureDefaultDefinition, loadCase, parseDefinition } from "./store";
import { buildEmailVars, buildNotification, type Vars } from "./messages";
import { eventOf, type Actor, type Facts, type QueueDef, type TransitionInput, type TransitionSuccess, type WorkflowDefinition } from "./types";
import { auditsEvent } from "./audit-policy";
import { inputsOf, resolveUi, type ActionInput, type ResolvedUi } from "./presentation";

// The Worker side of the workflow engine. engine.ts is pure; this resolves the facts it needs,
// persists its result, and runs the side effects a definition asks for.

type LoanRow = typeof loanApplications.$inferSelect;
type NoteRow = typeof underwritingNotes.$inferSelect;
type WaitUntil = (promise: Promise<unknown>) => void;

export interface RunOptions {
  action: string;
  input?: TransitionInput;
  /** Overrides the authenticated caller (used for SYSTEM actions such as auto-approval). */
  actor?: Actor;
  /** Application data the route has already validated, written in the same batch as the state. */
  extraColumns?: Record<string, unknown>;
  waitUntil: WaitUntil;
}

// Fields the engine may write on the application row (anything else in a definition is rejected
// at validation time, so this is a second line of defence).
const WRITABLE_FIELDS = new Set(["submittedAt", "completionPercentage", "approvedAmount", "autoApproved", "referredToRole", "guarantorRequired", "currentSection"]);

const displayName = (u: { fullName: string | null; email: string; role: string }) => u.fullName?.trim() || u.email || u.role;

export const SYSTEM_AUTO_APPROVAL: Actor = {
  type: "SYSTEM", userId: 0, name: "System (Auto-Approval)", role: null, rank: null, entitlements: [], scope: "ALL",
};

/** The signed-in caller as a workflow actor. */
export function callerActor(c: Context<AppEnv>): Actor {
  const user = c.get("authUser");
  const role = c.get("authRole");
  return {
    type: role.isStaff ? "STAFF" : "CUSTOMER",
    userId: user.id, name: displayName(user), role: user.role, rank: role.rank,
    entitlements: [...role.entitlements], scope: role.scope,
  };
}

async function buildFacts(c: Context<AppEnv>, db: Db, app: LoanRow, actor: Actor, needsMandate: boolean): Promise<Facts> {
  const user = c.get("authUser");
  const role = c.get("authRole");
  return {
    caseVisible: actor.type === "SYSTEM" ? true : await isCaseVisible(db, user, role.scope, app),
    isOwner: user.id === app.customerId,
    mandateLimit: actor.type === "STAFF" && needsMandate ? (await resolveMandate(db, user.role, app.orgUnitId, app.applicationType)).limit : null,
    ladder: (await allRoleConfigs(db)).filter((r) => r.rank != null).map((r) => ({ code: r.code, label: r.label, rank: r.rank as number })),
  };
}

export type { ActionInput, ResolvedUi } from "./presentation";
export interface ActionInfo { key: string; track: string; label: { en: string; he: string }; event: string; inputs: ActionInput[]; ui: ResolvedUi }
export interface ActionsView { allowed: ActionInfo[]; blocked: Record<string, { code: string; label: { en: string; he: string } }> }

/** What the caller can do to this case right now, with labels, for the UI to render buttons from.
 * Input-dependent rules (amount, reason, mandate) are enforced when the action is actually run. */
export async function describeActions(c: Context<AppEnv>, appRef: string): Promise<ActionsView> {
  const db = getDb(c.env.DB);
  const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, appRef)).limit(1);
  if (!app) throw new AppError(`Application not found: ${appRef}`);
  const actor = callerActor(c);
  // A customer may only ask about their own case; staff are subject to org scope.
  if (actor.type === "CUSTOMER" && c.get("authUser").id !== app.customerId) throw new AppError("Application not found.", 404);
  if (actor.type === "STAFF" && !(await isCaseVisible(db, c.get("authUser"), c.get("authRole").scope, app))) throw new AppError("Application not found.", 404);

  const loaded = await loadCase(db, app);
  const facts = await buildFacts(c, db, app, actor, false);
  const r = allowedActions(loaded.definition, { case: loaded.state, actor, facts });
  const meta = new Map(loaded.definition.tracks.flatMap((t) => t.transitions.map((x) => [x.key, { track: t.key, label: x.label, event: eventOf(t.key, x), inputs: inputsOf(x), ui: resolveUi(t.key, x) }] as const)));
  const order = new Map([...meta.keys()].map((k, i) => [k, i] as const));
  return {
    // In the definition's own order (the engine returns them alphabetically), so buttons appear in the order the workflow lists its actions.
    allowed: [...r.allowed].sort((a, b) => order.get(a)! - order.get(b)!).map((k) => ({ key: k, track: meta.get(k)!.track, label: meta.get(k)!.label, event: meta.get(k)!.event, inputs: meta.get(k)!.inputs, ui: meta.get(k)!.ui })),
    blocked: Object.fromEntries(Object.entries(r.blocked).map(([k, code]) => [k, { code, label: meta.get(k)!.label }])),
  };
}

/** The first of `keys` that the caller may open in the published definition. Queue status lists,
 * required entitlements and the scope/referral filters all come from the definition. */
export async function resolveQueue(c: Context<AppEnv>, keys: string[]): Promise<QueueDef> {
  const db = getDb(c.env.DB);
  const def = parseDefinition(await ensureDefaultDefinition(db));
  const actor = callerActor(c);
  for (const key of keys) {
    if (queueAccess(def, { actor, queue: key }).ok) return def.queues.find((q) => q.key === key)!;
  }
  throw new AppError("Forbidden.", 403);
}

function transitionHasGuard(def: WorkflowDefinition, action: string, type: string): boolean {
  return !!findTransition(def, action)?.transition.guards.some((g) => g.type === type);
}

async function insertNote(db: Db, appRef: string, section: string, note: string, noteType: string, createdBy: string): Promise<NoteRow> {
  const [saved] = await db.insert(underwritingNotes).values({ applicationRef: appRef, section, note, noteType, createdBy, createdAt: new Date().toISOString() }).returning();
  // Open Point #19: every decisioning action is audited through its note, as it always was.
  await recordAudit(db, { eventType: noteType, subjectType: "LoanApplication", subjectId: appRef, actor: createdBy, detail: note });
  return saved;
}

export interface RunResult { app: LoanRow; /** The last note this action recorded, if any. */ note: NoteRow | null }

/** Runs one workflow action on a case end to end. Throws AppError (with the engine's HTTP status)
 * when the action is not allowed; otherwise persists the new state and returns the fresh row. */
export async function runAction(c: Context<AppEnv>, appRef: string, o: RunOptions): Promise<RunResult> {
  const db = getDb(c.env.DB);
  const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, appRef)).limit(1);
  if (!app) throw new AppError(`Application not found: ${appRef}`);

  const loaded = await loadCase(db, app);
  const actor = o.actor ?? callerActor(c);
  const facts = await buildFacts(c, db, app, actor, transitionHasGuard(loaded.definition, o.action, "MANDATE"));

  const now = new Date().toISOString();
  const result = evaluate(loaded.definition, { case: loaded.state, request: { action: o.action, actor, input: o.input, now }, facts });
  if (!result.ok) throw new AppError(result.message, result.status);

  await persist(db, app, loaded.definitionId, loaded.definition, result, o, actor, now);
  const note = await runHostEffects(c, db, app, result, o, actor);

  const [fresh] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, appRef)).limit(1);
  return { app: fresh, note };
}

async function persist(
  db: Db, app: LoanRow, definitionId: number, def: WorkflowDefinition, r: TransitionSuccess, o: RunOptions, actor: Actor, now: string,
) {
  const transition = findTransition(def, r.action)!.transition;
  const statusChanged = r.from.status !== r.to.status;
  const set: Record<string, unknown> = { ...(o.extraColumns ?? {}) };

  if (statusChanged) {
    if (r.track === "case") set.status = r.to.status;
    if (r.track === "disbursement") set.disbursementStatus = r.to.status === "NOT_STARTED" ? null : r.to.status;
  }
  for (const [k, v] of Object.entries(r.fieldUpdates)) if (WRITABLE_FIELDS.has(k)) set[k] = v;
  // Freeze / release the form version in the same write as the status change.
  if (r.hostEffects.some((e) => e.type === "PIN_FORM_VERSION")) set.formVersionId = (await resolveActiveSchemaVersion(db, app))?.id ?? null;
  if (r.hostEffects.some((e) => e.type === "UNPIN_FORM_VERSION")) set.formVersionId = null;
  // select-product re-enters the same status; nothing to write unless something else changed.
  if (Object.keys(set).length > 0) set.updatedAt = now;

  // A case entering a new stage loses its previous owner and, if that stage routes automatically,
  // is handed to the next eligible person in the same atomic write as the move.
  const stageChanged = statusChanged && r.from.stage !== r.to.stage;
  const routed = stageChanged ? await routeOnEntry(db, def, app, r.to.stage, r.track) : null;
  const ownerSet = stageChanged ? { assigneeUserId: routed?.userId ?? null, assignedAt: routed ? now : null } : {};

  const queries: unknown[] = [];
  if (Object.keys(set).length > 0) queries.push(db.update(loanApplications).set(set).where(eq(loanApplications.applicationRef, app.applicationRef)));
  if (statusChanged) {
    queries.push(
      db.insert(wfCaseTracks)
        .values({ applicationRef: app.applicationRef, trackKey: r.track, status: r.to.status, stage: r.to.stage, enteredAt: now, ...ownerSet })
        .onConflictDoUpdate({ target: [wfCaseTracks.applicationRef, wfCaseTracks.trackKey], set: { status: r.to.status, stage: r.to.stage, enteredAt: now, ...ownerSet } }),
    );
  }
  // History records real workflow moves, not notes or staff edits (those have no target status).
  if (transition.to) {
    queries.push(db.insert(wfTransitions).values({
      applicationRef: app.applicationRef, trackKey: r.track, action: r.log.action,
      fromStatus: r.log.fromStatus, toStatus: r.log.toStatus, fromStage: r.log.fromStage, toStage: r.log.toStage,
      actorType: r.log.actorType, actorUserId: r.log.actorUserId, actorName: r.log.actorName, actorRole: r.log.actorRole,
      reason: r.log.reason, at: r.log.at, definitionId,
    }));
  }
  if (r.referral.close) {
    queries.push(db.update(caseReferrals).set({ resolvedAt: now }).where(and(eq(caseReferrals.applicationRef, app.applicationRef), isNull(caseReferrals.resolvedAt))));
  }
  if (r.referral.open) {
    queries.push(db.insert(caseReferrals).values({
      applicationRef: app.applicationRef, fromRole: actor.role ?? "SYSTEM", fromUserId: actor.userId, fromName: actor.name,
      toRole: r.referral.open.toRole, reason: r.log.reason, createdAt: now,
    }));
  }
  // One atomic write for state, history and referral rows (D1 batch = a single transaction).
  if (queries.length > 0) await db.batch(queries as unknown as [never, ...never[]]);
  // Every action emits its event; the audit trail records it, so audit entries use the same names the
  // workflow definition (and its notification/email/document subscribers) uses.
  if (auditsEvent(r)) {
    await recordAudit(db, {
      eventType: r.event, subjectType: "LoanApplication", subjectId: app.applicationRef,
      actor: r.log.actorName, actorRole: r.log.actorRole,
      detail: `${r.action}: ${r.log.fromStatus} -> ${r.log.toStatus}${r.log.reason ? ` (${r.log.reason})` : ""}`,
    });
  }
  if (routed) {
    await recordAudit(db, { eventType: "CASE_AUTO_ASSIGNED", subjectType: "LoanApplication", subjectId: app.applicationRef, actor: "System (Routing)", detail: `${routed.name} (${r.to.stage})` });
  }
}

async function runHostEffects(c: Context<AppEnv>, db: Db, app: LoanRow, r: TransitionSuccess, o: RunOptions, actor: Actor): Promise<NoteRow | null> {
  let lastNote: NoteRow | null = null;
  let lang: "en" | "he" | null = null;
  const language = async () => (lang ??= await getPreferredLanguage(db, app.customerId));

  for (const e of r.hostEffects) {
    switch (e.type) {
      case "NOTE":
        lastNote = await insertNote(db, app.applicationRef, String(e.section ?? "general"), String(e.text ?? ""), String(e.noteType ?? "NOTE"), actor.name);
        break;
      case "NOTIFY": {
        await warmLoanPurposeNames(db);
        const spec = buildNotification(String(e.template), app, await language(), (e.vars ?? {}) as Vars);
        if (spec) await sendNotification(db, app.customerId, spec.title, spec.message, spec.type, app.applicationRef);
        break;
      }
      case "EMAIL":
        o.waitUntil(sendTemplatedEmail(db, c.env, String(e.event), app, buildEmailVars(String(e.event), (e.vars ?? {}) as Vars, await language())));
        break;
      case "GENERATE_DOC":
        await generateFinalApprovalLetter(db, c.env, app.applicationRef);
        break;
      case "CARD_PAYMENT": {
        // N1 - generate once, then persist: a repeat call never regenerates the synthetic transaction.
        const json = app.cardPaymentResultJson ?? JSON.stringify(authoriseCardPayment(app.applicationRef, app.approvedAmount));
        await db.update(loanApplications).set({ cardPaymentResultJson: json }).where(eq(loanApplications.applicationRef, app.applicationRef));
        break;
      }
      case "RUN_AUTO_APPROVAL":
        await maybeAutoApprove(c, db, app, o.waitUntil);
        break;
      // PIN_FORM_VERSION / UNPIN_FORM_VERSION were applied in persist().
    }
  }
  return lastNote;
}

/** Auto-approval is a convenience; failures fall back to manual underwriter review. */
async function maybeAutoApprove(c: Context<AppEnv>, db: Db, app: LoanRow, waitUntil: WaitUntil) {
  try {
    const [fresh] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, app.applicationRef)).limit(1);
    const a = fresh ?? app;
    // Business loans always go to manual review for now: the threshold is sized for personal loans
    // and reads loanRequirementsJson, which business applications never populate.
    if (a.applicationType === "BUSINESS") return;
    if (!a.affordabilityResultJson) return;
    if (JSON.parse(a.affordabilityResultJson).passed !== true) return;

    const personal = a.personalDetailsJson ? JSON.parse(a.personalDetailsJson) : null;
    const threshold = await getAutoApprovalThreshold(db, !!(personal && personal.applicant2 != null));
    if (threshold == null) return;

    const loan = a.loanRequirementsJson ? JSON.parse(a.loanRequirementsJson) : null;
    const loanAmount = Number(loan?.loanAmount ?? 0);
    if (loanAmount > threshold) return;

    await runAction(c, a.applicationRef, { action: "auto_approve", actor: SYSTEM_AUTO_APPROVAL, input: { approvedAmount: loanAmount }, waitUntil });
  } catch (e) {
    logError("maybeAutoApprove failed (non-fatal)", e, { appRef: app.applicationRef });
  }
}

// Generates the full final-approval offer pack (cover letter + Key Facts Statement + Repayment
// Schedule, re-run against the actually-approved amount). Swallow-all: document generation failure
// (including R2 not being enabled yet) must never block an underwriting decision.
async function generateFinalApprovalLetter(db: Db, env: Env, appRef: string) {
  try {
    const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, appRef)).limit(1);
    if (!app) return;
    const isBusiness = app.applicationType === "BUSINESS";
    // Business applications never populate loanRequirementsJson; their loan amount lives in companyDetailsJson.
    const loanSource = isBusiness ? app.companyDetailsJson : app.loanRequirementsJson;
    if (!app.selectedProductJson || !loanSource) return;

    const product = JSON.parse(app.selectedProductJson);
    const loan = JSON.parse(loanSource);
    const personal = app.personalDetailsJson ? JSON.parse(app.personalDetailsJson) : null;
    const company = app.companyDetailsJson ? JSON.parse(app.companyDetailsJson) : null;
    const customerName = isBusiness
      ? (company?.companyName ?? app.customerEmail)
      : (personal ? `${personal.firstName ?? ""} ${personal.lastName ?? ""}`.trim() : app.customerEmail);
    const approvedAmount = app.approvedAmount ?? loan.loanAmount ?? 0;

    await generateOfferPack(
      db, env,
      {
        applicationRef: app.applicationRef, customerId: app.customerId, customerName, loanAmount: approvedAmount,
        productName: product.productName ?? "", interestRate: product.interestRate ?? product.apr ?? 0,
        termMonths: product.termMonths ?? 0, monthlyRepayment: product.monthlyRepayment ?? 0,
      },
      true,
    );
  } catch (e) {
    logError("generateFinalApprovalLetter failed (non-fatal)", e, { appRef });
  }
}
