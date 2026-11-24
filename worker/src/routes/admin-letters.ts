import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { inLender } from "../lib/lender-scope";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { letterImages, letterSavedRules, letterTemplates, letterVersions, loanApplications } from "../db/schema";
import { requireAuth, requireRole, requireLender } from "../middleware/auth";
import { AppError } from "../lib/errors";
import { recordAudit, actorOf } from "../lib/audit";
import { generateCode } from "../lib/masters";
import { LETTER_DICTIONARY, STORED_ON_APPLICATION } from "../lib/letters/dictionary";
import { SAMPLE_DATA, SAMPLE_LETTER } from "../lib/letters/samples";
import { letterDocument, rule as ruleSchema } from "../lib/letters/types";
import { buildLetterData } from "../lib/letters/data";
import { EMPTY_LETTER, decodeBase64, loadSavedRules, parseDocument, refersToRule, renderDocument, usesImage, validateDocument } from "../lib/letters/service";
import { hasErrors } from "../lib/letters/validate";
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, sniffImage } from "../lib/letters/image";
import { LETTER_FONT_BYTES } from "../lib/pdf/letter-fonts";

// Admin side of letters: dictionary, shared rules, pictures, templates and their versions, validation,
// publishing and preview. Model and rules: letter-spec/.
export const lettersAdmin = new Hono<AppEnv>();
lettersAdmin.use("*", requireAuth, requireRole("ADMIN"));

const now = () => new Date().toISOString();

lettersAdmin.get("/dictionary", (c) => c.json({ ...LETTER_DICTIONARY, storedOnApplication: [...STORED_ON_APPLICATION] }));

/** What the editor shows letters filled with: the built-in sample, or a real application's values. */
lettersAdmin.get("/sample-data", (c) => c.json(SAMPLE_DATA));
lettersAdmin.get("/application-data/:ref", async (c) => {
  const db = getDb(c.env.DB);
  const [app] = await db.select().from(loanApplications).where(inLender(loanApplications, requireLender(c), eq(loanApplications.applicationRef, c.req.param("ref")))).limit(1);
  if (!app) throw new AppError("Application not found.", 404);
  return c.json(await buildLetterData(db, app));
});

// ---- shared rules

lettersAdmin.get("/rules", async (c) => c.json(await loadSavedRules(getDb(c.env.DB), requireLender(c))));

const ruleBody = z.object({ name: z.string().trim().min(1).max(80), rule: ruleSchema });

lettersAdmin.post("/rules", zValidator("json", ruleBody), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const taken = new Set((await db.select({ id: letterSavedRules.id }).from(letterSavedRules).where(inLender(letterSavedRules, requireLender(c)))).map((r) => r.id));
  const id = generateCode(body.name, (x) => taken.has(x), { lower: true, max: 30, fallback: "rule" });
  await db.insert(letterSavedRules).values({ lenderId: requireLender(c), id, name: body.name, ruleJson: JSON.stringify(body.rule), updatedAt: now(), updatedBy: actorOf(c).actor });
  await recordAudit(db, { eventType: "LETTER_RULE_SAVED", subjectType: "LetterRule", subjectId: id, detail: body.name, ...actorOf(c) });
  return c.json({ id, name: body.name, rule: body.rule }, 201);
});

lettersAdmin.put("/rules/:id", zValidator("json", ruleBody), async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [existing] = await db.select().from(letterSavedRules).where(inLender(letterSavedRules, requireLender(c), eq(letterSavedRules.id, id))).limit(1);
  if (!existing) throw new AppError("That rule does not exist.", 404);
  // A rule can never refer to itself, directly or through others; the validator reports loops, but a rule
  // saved with one would make every template that uses it fail, so refuse it here.
  const all = await loadSavedRules(db, requireLender(c));
  const proposed = all.map((r) => (r.id === id ? { ...r, name: body.name, rule: body.rule } : r));
  const issues = (await import("../lib/letters/validate")).validateLetter({ ...EMPTY_LETTER, body: [{ id: "x", t: "when", rule: { t: "ref", id }, children: [] }] }, LETTER_DICTIONARY, proposed);
  if (issues.some((i) => i.code === "rule.refCycle")) throw new AppError("That change would make the rule depend on itself.", 409);
  await db.update(letterSavedRules).set({ name: body.name, ruleJson: JSON.stringify(body.rule), updatedAt: now(), updatedBy: actorOf(c).actor }).where(inLender(letterSavedRules, requireLender(c), eq(letterSavedRules.id, id)));
  await recordAudit(db, { eventType: "LETTER_RULE_SAVED", subjectType: "LetterRule", subjectId: id, detail: body.name, ...actorOf(c) });
  return c.json({ id, name: body.name, rule: body.rule });
});

lettersAdmin.delete("/rules/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const lenderId = requireLender(c);
  const docs = await db.select({ json: letterVersions.documentJson }).from(letterVersions).where(inLender(letterVersions, lenderId));
  const rules = await db.select({ id: letterSavedRules.id, json: letterSavedRules.ruleJson }).from(letterSavedRules).where(inLender(letterSavedRules, lenderId));
  if (docs.some((d) => refersToRule(d.json, id)) || rules.some((r) => r.id !== id && refersToRule(r.json, id))) throw new AppError("This rule is used by a letter or another rule, so it cannot be deleted.", 409);
  await db.delete(letterSavedRules).where(inLender(letterSavedRules, requireLender(c), eq(letterSavedRules.id, id)));
  await recordAudit(db, { eventType: "LETTER_RULE_DELETED", subjectType: "LetterRule", subjectId: id, ...actorOf(c) });
  return c.json({ ok: true });
});

// ---- pictures (PNG or JPEG, kept in the database)

const MAX_IMAGE_BYTES = 500 * 1024;
// Base64 is 4 characters per 3 bytes (plus an optional data: prefix); bounding the text rejects an oversized body
// before it is decoded into memory.
const MAX_IMAGE_BASE64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 200;

lettersAdmin.get("/images", async (c) => {
  const rows = await getDb(c.env.DB).select({ id: letterImages.id, name: letterImages.name, kind: letterImages.kind, mimeType: letterImages.mimeType, width: letterImages.width, height: letterImages.height, sizeBytes: letterImages.sizeBytes, createdAt: letterImages.createdAt }).from(letterImages).where(inLender(letterImages, requireLender(c))).orderBy(letterImages.name);
  return c.json(rows);
});

lettersAdmin.post("/images", zValidator("json", z.object({ name: z.string().trim().min(1).max(80), kind: z.enum(["logo", "signature", "seal", "other"]).default("other"), dataBase64: z.string().min(1).max(MAX_IMAGE_BASE64_CHARS) })), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const b64 = body.dataBase64.replace(/^data:[^,]*,/, "");
  let bytes: Uint8Array;
  try { bytes = decodeBase64(b64); } catch { throw new AppError("The picture could not be read."); }
  if (bytes.length > MAX_IMAGE_BYTES) throw new AppError(`The picture is ${(bytes.length / 1024).toFixed(0)} KB; the limit is ${MAX_IMAGE_BYTES / 1024} KB.`);
  const kind = sniffImage(bytes);
  if (!kind) throw new AppError("Only PNG and JPEG pictures can be used.");
  if (kind.width > MAX_IMAGE_SIDE || kind.height > MAX_IMAGE_SIDE || kind.width * kind.height > MAX_IMAGE_PIXELS) {
    throw new AppError(`The picture is ${kind.width} x ${kind.height} pixels; the limit is ${MAX_IMAGE_SIDE} on a side and ${MAX_IMAGE_PIXELS / 1_000_000} million pixels.`);
  }
  const id = crypto.randomUUID();
  await db.insert(letterImages).values({ lenderId: requireLender(c), id, name: body.name, kind: body.kind, mimeType: kind.mimeType, width: kind.width || null, height: kind.height || null, sizeBytes: bytes.length, dataBase64: b64, createdAt: now(), createdBy: actorOf(c).actor });
  await recordAudit(db, { eventType: "LETTER_IMAGE_ADDED", subjectType: "LetterImage", subjectId: id, detail: body.name, ...actorOf(c) });
  return c.json({ id, name: body.name, kind: body.kind, mimeType: kind.mimeType, width: kind.width, height: kind.height, sizeBytes: bytes.length }, 201);
});

lettersAdmin.get("/images/:id/file", async (c) => {
  const [r] = await getDb(c.env.DB).select().from(letterImages).where(inLender(letterImages, requireLender(c), eq(letterImages.id, c.req.param("id")))).limit(1);
  if (!r) throw new AppError("Picture not found.", 404);
  return new Response(decodeBase64(r.dataBase64), { headers: { "Content-Type": r.mimeType, "Cache-Control": "private, max-age=300" } });
});

lettersAdmin.delete("/images/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const docs = await db.select({ json: letterVersions.documentJson }).from(letterVersions).where(inLender(letterVersions, requireLender(c)));
  if (docs.some((d) => usesImage(d.json, id))) throw new AppError("This picture is used by a letter, so it cannot be deleted.", 409);
  await db.delete(letterImages).where(inLender(letterImages, requireLender(c), eq(letterImages.id, id)));
  await recordAudit(db, { eventType: "LETTER_IMAGE_DELETED", subjectType: "LetterImage", subjectId: id, ...actorOf(c) });
  return c.json({ ok: true });
});

// ---- templates and versions

const templateBody = z.object({
  nameEn: z.string().trim().min(1).max(120),
  nameHe: z.string().trim().max(120).default(""),
  description: z.string().trim().max(500).optional(),
  appliesTo: z.enum(["PERSONAL", "BUSINESS", "BOTH"]).default("BOTH"),
});

async function loadTemplate(db: ReturnType<typeof getDb>, lenderId: number, key: string) {
  const [t] = await db.select().from(letterTemplates).where(inLender(letterTemplates, lenderId, eq(letterTemplates.key, key))).limit(1);
  if (!t) throw new AppError("That letter does not exist.", 404);
  return t;
}
const versionsOf = (db: ReturnType<typeof getDb>, lenderId: number, key: string) => db.select().from(letterVersions).where(inLender(letterVersions, lenderId, eq(letterVersions.templateKey, key))).orderBy(desc(letterVersions.version));
const shapeVersion = (v: typeof letterVersions.$inferSelect) => ({ version: v.version, status: v.status, changeNote: v.changeNote, createdAt: v.createdAt, createdBy: v.createdBy, publishedAt: v.publishedAt, publishedBy: v.publishedBy });

lettersAdmin.get("/templates", async (c) => {
  const db = getDb(c.env.DB);
  const templates = await db.select().from(letterTemplates).where(inLender(letterTemplates, requireLender(c))).orderBy(letterTemplates.nameEn);
  const versions = await db.select().from(letterVersions).where(inLender(letterVersions, requireLender(c)));
  return c.json(templates.map((t) => {
    const mine = versions.filter((v) => v.templateKey === t.key);
    return { ...t, publishedVersion: mine.find((v) => v.status === "PUBLISHED")?.version ?? null, hasDraft: mine.some((v) => v.status === "DRAFT"), versionCount: mine.length };
  }));
});

lettersAdmin.post("/templates", zValidator("json", templateBody.extend({ starter: z.boolean().default(false) })), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const taken = new Set((await db.select({ key: letterTemplates.key }).from(letterTemplates).where(inLender(letterTemplates, requireLender(c)))).map((r) => r.key));
  const key = generateCode(body.nameEn, (x) => taken.has(x), { lower: true, max: 30, fallback: "letter" });
  const doc = body.starter ? SAMPLE_LETTER : EMPTY_LETTER;
  await db.insert(letterTemplates).values({ lenderId: requireLender(c), key, nameEn: body.nameEn, nameHe: body.nameHe, description: body.description ?? null, appliesTo: body.appliesTo, createdAt: now(), createdBy: actorOf(c).actor });
  await db.insert(letterVersions).values({ lenderId: requireLender(c), templateKey: key, version: 1, status: "DRAFT", documentJson: JSON.stringify(doc), changeNote: body.starter ? "Started from the sample letter" : "New letter", createdAt: now(), createdBy: actorOf(c).actor });
  await recordAudit(db, { eventType: "LETTER_CREATED", subjectType: "LetterTemplate", subjectId: key, detail: body.nameEn, ...actorOf(c) });
  return c.json({ key }, 201);
});

lettersAdmin.get("/templates/:key", async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, requireLender(c), c.req.param("key"));
  return c.json({ ...t, versions: (await versionsOf(db, t.lenderId, t.key)).map(shapeVersion) });
});

lettersAdmin.put("/templates/:key", zValidator("json", templateBody), async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, requireLender(c), c.req.param("key"));
  const body = c.req.valid("json");
  await db.update(letterTemplates).set({ nameEn: body.nameEn, nameHe: body.nameHe, description: body.description ?? null, appliesTo: body.appliesTo }).where(inLender(letterTemplates, t.lenderId, eq(letterTemplates.key, t.key)));
  return c.json({ ok: true });
});

/** One version's document: a number, or "draft" / "published" for whichever that is. */
lettersAdmin.get("/templates/:key/versions/:version", async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, requireLender(c), c.req.param("key"));
  const which = c.req.param("version");
  const all = await versionsOf(db, t.lenderId, t.key);
  const v = which === "draft" ? all.find((x) => x.status === "DRAFT") : which === "published" ? all.find((x) => x.status === "PUBLISHED") : all.find((x) => x.version === Number(which));
  if (!v) throw new AppError("That version does not exist.", 404);
  return c.json({ ...shapeVersion(v), document: parseDocument(v.documentJson) });
});

// Saving the draft never blocks on content problems (an editor saves half-finished work); publishing does.
lettersAdmin.put("/templates/:key/draft", zValidator("json", z.object({ document: letterDocument, changeNote: z.string().trim().max(200).optional() })), async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, requireLender(c), c.req.param("key"));
  const body = c.req.valid("json");
  const all = await versionsOf(db, t.lenderId, t.key);
  const draft = all.find((v) => v.status === "DRAFT");
  const json = JSON.stringify(body.document);
  if (draft) {
    await db.update(letterVersions).set({ documentJson: json, changeNote: body.changeNote ?? draft.changeNote }).where(inLender(letterVersions, t.lenderId, eq(letterVersions.id, draft.id)));
    return c.json({ version: draft.version, issues: await validateDocument(db, t.lenderId, body.document) });
  }
  const next = (all[0]?.version ?? 0) + 1;
  await db.insert(letterVersions).values({ lenderId: t.lenderId, templateKey: t.key, version: next, status: "DRAFT", documentJson: json, changeNote: body.changeNote ?? null, createdAt: now(), createdBy: actorOf(c).actor });
  return c.json({ version: next, issues: await validateDocument(db, t.lenderId, body.document) });
});

lettersAdmin.post("/templates/:key/discard-draft", async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, requireLender(c), c.req.param("key"));
  const all = await versionsOf(db, t.lenderId, t.key);
  const draft = all.find((v) => v.status === "DRAFT");
  if (!draft) throw new AppError("There is no draft to discard.", 404);
  if (all.length === 1) throw new AppError("This is the only version; delete the letter instead.", 409);
  await db.delete(letterVersions).where(inLender(letterVersions, t.lenderId, eq(letterVersions.id, draft.id)));
  return c.json({ ok: true });
});

lettersAdmin.post("/templates/:key/validate", zValidator("json", z.object({ document: letterDocument.optional() })), async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, requireLender(c), c.req.param("key"));
  const { document } = c.req.valid("json");
  let doc = document;
  if (!doc) {
    const draft = (await versionsOf(db, t.lenderId, t.key)).find((v) => v.status === "DRAFT");
    if (!draft) throw new AppError("There is no draft to check.", 404);
    doc = parseDocument(draft.documentJson);
  }
  const issues = await validateDocument(db, t.lenderId, doc);
  return c.json({ issues, canPublish: !hasErrors(issues) });
});

lettersAdmin.post("/templates/:key/publish", async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, requireLender(c), c.req.param("key"));
  const all = await versionsOf(db, t.lenderId, t.key);
  const draft = all.find((v) => v.status === "DRAFT");
  if (!draft) throw new AppError("There is no draft to publish.", 404);
  const issues = await validateDocument(db, t.lenderId, parseDocument(draft.documentJson));
  if (hasErrors(issues)) return c.json({ message: "Fix the errors before publishing.", issues }, 422);
  const at = now(), by = actorOf(c).actor;
  // Exactly one PUBLISHED version: the previous one is archived, never deleted, so issued letters can be traced.
  // One atomic batch (as the workflow publish does), so a failure between the two can never leave the letter
  // with no published version, or with two.
  await db.batch([
    db.update(letterVersions).set({ status: "ARCHIVED" }).where(inLender(letterVersions, t.lenderId, eq(letterVersions.templateKey, t.key), eq(letterVersions.status, "PUBLISHED"))),
    db.update(letterVersions).set({ status: "PUBLISHED", publishedAt: at, publishedBy: by }).where(inLender(letterVersions, t.lenderId, eq(letterVersions.id, draft.id))),
  ]);
  await recordAudit(db, { eventType: "LETTER_PUBLISHED", subjectType: "LetterTemplate", subjectId: t.key, detail: `v${draft.version}`, ...actorOf(c) });
  return c.json({ version: draft.version, issues });
});

/** A PDF of the draft (or `version`) for a real application or, without one, the sample data. Missing values are listed in a header. */
lettersAdmin.post("/templates/:key/preview", zValidator("json", z.object({ document: letterDocument.optional(), applicationRef: z.string().optional() })), async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, requireLender(c), c.req.param("key"));
  const { document, applicationRef } = c.req.valid("json");
  let doc = document;
  if (!doc) {
    const all = await versionsOf(db, t.lenderId, t.key);
    const v = all.find((x) => x.status === "DRAFT") ?? all.find((x) => x.status === "PUBLISHED");
    if (!v) throw new AppError("This letter has no versions.", 404);
    doc = parseDocument(v.documentJson);
  }
  let data: Record<string, unknown> = SAMPLE_DATA as Record<string, unknown>;
  if (applicationRef) {
    const [app] = await db.select().from(loanApplications).where(inLender(loanApplications, t.lenderId, eq(loanApplications.applicationRef, applicationRef))).limit(1);
    if (!app) throw new AppError("Application not found.", 404);
    data = await buildLetterData(db, app);
  }
  const out = await renderDocument(db, t.lenderId, doc, data, LETTER_FONT_BYTES, `${t.nameEn} (preview)`);
  return new Response(out.pdf, { headers: { "Content-Type": "application/pdf", "X-Letter-Missing": encodeURIComponent(out.missing.join(",")), "Content-Disposition": `inline; filename="${t.key}-preview.pdf"` } });
});

