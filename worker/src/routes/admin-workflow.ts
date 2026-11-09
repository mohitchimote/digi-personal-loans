import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { requireAuth, requireRole } from "../middleware/auth";
import { recordAudit } from "../lib/audit";
import { ENTITLEMENT_CATALOG, ENTITLEMENT_KEYS } from "../lib/entitlements";
import { validateDefinition } from "../lib/workflow/validate";
import { createDraft, discardDraft, ensureDefaultDefinition, getDefinitionRow, listDefinitions, publishDraft, saveDraft } from "../lib/workflow/store";

// Admin workflow builder API: versioned definitions (DRAFT -> PUBLISHED -> ARCHIVED), copying the
// form-builder lifecycle. Validation errors come back as a list so the builder can show every
// problem at once rather than one per save.
export const workflowAdmin = new Hono<AppEnv>();
workflowAdmin.use("*", requireAuth, requireRole("ADMIN"));

const who = (c: { get: (k: "authUser") => { fullName: string | null; email: string; role: string } }) => {
  const u = c.get("authUser");
  return { actor: u.fullName?.trim() || u.email, actorRole: u.role };
};

const summary = (r: Awaited<ReturnType<typeof getDefinitionRow>>) => ({
  id: r.id, key: r.definitionKey, version: r.version, status: r.status, changeNote: r.changeNote,
  createdAt: r.createdAt, createdBy: r.createdBy, publishedAt: r.publishedAt, publishedBy: r.publishedBy,
});

// Everything a builder needs to offer choices: the guard/effect primitives code supports and the
// entitlement catalog a transition may require.
workflowAdmin.get("/catalog", (c) =>
  c.json({
    entitlements: ENTITLEMENT_CATALOG,
    guards: ["CASE_VISIBLE", "OWNER_OR_ASSISTING", "REFERRAL_LOCK", "AMOUNT_POSITIVE", "MANDATE", "REASON_REQUIRED", "TRACK_STATUS_IS", "REFERRAL_TARGET"],
    effects: ["SET", "REFERRAL_OPEN", "REFERRAL_CLOSE", "NOTE", "NOTIFY", "EMAIL", "GENERATE_DOC", "CARD_PAYMENT", "PIN_FORM_VERSION", "UNPIN_FORM_VERSION", "RUN_AUTO_APPROVAL"],
    setFields: ["submittedAt", "completionPercentage", "approvedAmount", "autoApproved", "referredToRole", "guarantorRequired", "currentSection"],
    emailEvents: ["SUBMITTED", "DOCUMENT_REQUEST", "CLARIFICATION_REQUEST", "DECISION_APPROVED", "DECISION_DECLINED", "SEND_BACK", "DISBURSEMENT_AUTHORISED"],
    notifyTemplates: ["DECISION_DECLINED", "SEND_BACK", "DECISION_APPROVED", "DISBURSEMENT_AUTHORISED", "CLARIFICATION_REQUEST", "DOCUMENT_REQUEST"],
  }),
);

workflowAdmin.get("/definitions", async (c) => {
  const db = getDb(c.env.DB);
  // A fresh environment has no rows until something seeds the bundled default; the builder must not open empty.
  await ensureDefaultDefinition(db);
  const rows = await listDefinitions(db);
  return c.json(rows.map((r) => ({ ...summary(r), caseCount: r.caseCount })));
});

workflowAdmin.get("/definitions/:id", async (c) => {
  const row = await getDefinitionRow(getDb(c.env.DB), Number(c.req.param("id")));
  return c.json({ ...summary(row), definition: JSON.parse(row.definitionJson) });
});

// Stateless check for the builder's live validation: nothing is saved.
workflowAdmin.post("/validate", zValidator("json", z.object({ definition: z.unknown() })), (c) => {
  const r = validateDefinition(c.req.valid("json").definition, { entitlementKeys: ENTITLEMENT_KEYS });
  return c.json(r.ok ? { ok: true, errors: [] } : { ok: false, errors: r.errors });
});

workflowAdmin.post("/definitions/:key/draft", zValidator("json", z.object({ sourceId: z.number().int().optional() }).default({})), async (c) => {
  const db = getDb(c.env.DB);
  const { row, existing } = await createDraft(db, c.req.param("key"), c.req.valid("json").sourceId, who(c).actor);
  if (!existing) await recordAudit(db, { eventType: "WORKFLOW_DRAFT_CREATED", subjectType: "WorkflowDefinition", subjectId: String(row.id), detail: `${row.definitionKey} v${row.version}`, ...who(c) });
  return c.json({ ...summary(row), existing }, existing ? 200 : 201);
});

workflowAdmin.put("/definitions/:id", zValidator("json", z.object({ definition: z.unknown(), changeNote: z.string().max(300).nullable().optional() })), async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const body = c.req.valid("json");
  const r = await saveDraft(db, id, body.definition, body.changeNote ?? null);
  if (!r.ok) return c.json({ success: false, message: "The definition is not valid.", errors: r.errors }, 400);
  await recordAudit(db, { eventType: "WORKFLOW_DRAFT_SAVED", subjectType: "WorkflowDefinition", subjectId: String(id), detail: body.changeNote ?? null, ...who(c) });
  return c.json(summary(r.row));
});

workflowAdmin.post("/definitions/:id/publish", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const r = await publishDraft(db, id, who(c).actor);
  if (!r.ok) return c.json({ success: false, message: "The definition cannot be published.", errors: r.errors }, 400);
  await recordAudit(db, { eventType: "WORKFLOW_DEFINITION_PUBLISHED", subjectType: "WorkflowDefinition", subjectId: String(id), detail: `${r.row.definitionKey} v${r.row.version}`, ...who(c) });
  return c.json(summary(r.row));
});

workflowAdmin.delete("/definitions/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  await discardDraft(db, id);
  await recordAudit(db, { eventType: "WORKFLOW_DRAFT_DISCARDED", subjectType: "WorkflowDefinition", subjectId: String(id), ...who(c) });
  return c.body(null, 204);
});
