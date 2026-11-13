import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, like } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { letterImages, letterSavedRules, letterTemplates, letterVersions, loanApplications } from "../db/schema";
import { requireAuth, requireRole } from "../middleware/auth";
import { AppError } from "../lib/errors";
import { recordAudit } from "../lib/audit";
import { generateCode } from "../lib/masters";
import { LETTER_DICTIONARY, STORED_ON_APPLICATION } from "../lib/letters/dictionary";
import { SAMPLE_DATA, SAMPLE_LETTER } from "../lib/letters/samples";
import { letterDocument, rule as ruleSchema } from "../lib/letters/types";
import { buildLetterData } from "../lib/letters/data";
import { EMPTY_LETTER, decodeBase64, loadSavedRules, parseDocument, renderDocument, validateDocument } from "../lib/letters/service";
import { hasErrors } from "../lib/letters/validate";
import { LETTER_FONT_BYTES } from "../lib/pdf/letter-fonts";

// Admin side of letters: dictionary, shared rules, pictures, templates and their versions, validation,
// publishing and preview. Model and rules: letter-spec/.
export const lettersAdmin = new Hono<AppEnv>();
lettersAdmin.use("*", requireAuth, requireRole("ADMIN"));

const actorOf = (c: { get: (k: "authUser") => { fullName: string | null; email: string; role: string } }) => {
  const a = c.get("authUser");
  return { actor: a.fullName?.trim() || a.email, actorRole: a.role };
};
const now = () => new Date().toISOString();

lettersAdmin.get("/dictionary", (c) => c.json({ ...LETTER_DICTIONARY, storedOnApplication: [...STORED_ON_APPLICATION] }));

/** What the editor shows letters filled with: the built-in sample, or a real application's values. */
lettersAdmin.get("/sample-data", (c) => c.json(SAMPLE_DATA));
lettersAdmin.get("/application-data/:ref", async (c) => {
  const db = getDb(c.env.DB);
  const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, c.req.param("ref"))).limit(1);
  if (!app) throw new AppError("Application not found.", 404);
  return c.json(await buildLetterData(db, app));
});

// ---- shared rules

lettersAdmin.get("/rules", async (c) => c.json(await loadSavedRules(getDb(c.env.DB))));

const ruleBody = z.object({ name: z.string().trim().min(1).max(80), rule: ruleSchema });

lettersAdmin.post("/rules", zValidator("json", ruleBody), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const taken = new Set((await db.select({ id: letterSavedRules.id }).from(letterSavedRules)).map((r) => r.id));
  const id = generateCode(body.name, (x) => taken.has(x), { lower: true, max: 30, fallback: "rule" });
  await db.insert(letterSavedRules).values({ id, name: body.name, ruleJson: JSON.stringify(body.rule), updatedAt: now(), updatedBy: actorOf(c).actor });
  await recordAudit(db, { eventType: "LETTER_RULE_SAVED", subjectType: "LetterRule", subjectId: id, detail: body.name, ...actorOf(c) });
  return c.json({ id, name: body.name, rule: body.rule }, 201);
});

lettersAdmin.put("/rules/:id", zValidator("json", ruleBody), async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [existing] = await db.select().from(letterSavedRules).where(eq(letterSavedRules.id, id)).limit(1);
  if (!existing) throw new AppError("That rule does not exist.", 404);
  // A rule can never refer to itself, directly or through others; the validator reports loops, but a rule
  // saved with one would make every template that uses it fail, so refuse it here.
  const all = await loadSavedRules(db);
  const proposed = all.map((r) => (r.id === id ? { ...r, name: body.name, rule: body.rule } : r));
  const issues = (await import("../lib/letters/validate")).validateLetter({ ...EMPTY_LETTER, body: [{ id: "x", t: "when", rule: { t: "ref", id }, children: [] }] }, LETTER_DICTIONARY, proposed);
  if (issues.some((i) => i.code === "rule.refCycle")) throw new AppError("That change would make the rule depend on itself.", 409);
  await db.update(letterSavedRules).set({ name: body.name, ruleJson: JSON.stringify(body.rule), updatedAt: now(), updatedBy: actorOf(c).actor }).where(eq(letterSavedRules.id, id));
  await recordAudit(db, { eventType: "LETTER_RULE_SAVED", subjectType: "LetterRule", subjectId: id, detail: body.name, ...actorOf(c) });
  return c.json({ id, name: body.name, rule: body.rule });
});

lettersAdmin.delete("/rules/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const needle = `%"t":"ref","id":"${id}"%`;
  const inTemplate = await db.select({ id: letterVersions.id }).from(letterVersions).where(like(letterVersions.documentJson, needle)).limit(1);
  const inRule = await db.select({ id: letterSavedRules.id }).from(letterSavedRules).where(and(like(letterSavedRules.ruleJson, needle))).limit(1);
  if (inTemplate.length || inRule.length) throw new AppError("This rule is used by a letter or another rule, so it cannot be deleted.", 409);
  await db.delete(letterSavedRules).where(eq(letterSavedRules.id, id));
  await recordAudit(db, { eventType: "LETTER_RULE_DELETED", subjectType: "LetterRule", subjectId: id, ...actorOf(c) });
  return c.json({ ok: true });
});

// ---- pictures (PNG or JPEG, kept in the database)

const MAX_IMAGE_BYTES = 500 * 1024;

/** Type and pixel size from the file's own header; null when it is neither a PNG nor a JPEG. */
export function sniffImage(b: Uint8Array): { mimeType: "image/png" | "image/jpeg"; width: number; height: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { mimeType: "image/png", width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mimeType: "image/jpeg", height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return { mimeType: "image/jpeg", width: 0, height: 0 };
  }
  return null;
}

lettersAdmin.get("/images", async (c) => {
  const rows = await getDb(c.env.DB).select({ id: letterImages.id, name: letterImages.name, kind: letterImages.kind, mimeType: letterImages.mimeType, width: letterImages.width, height: letterImages.height, sizeBytes: letterImages.sizeBytes, createdAt: letterImages.createdAt }).from(letterImages).orderBy(letterImages.name);
  return c.json(rows);
});

lettersAdmin.post("/images", zValidator("json", z.object({ name: z.string().trim().min(1).max(80), kind: z.enum(["logo", "signature", "seal", "other"]).default("other"), dataBase64: z.string().min(1) })), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const b64 = body.dataBase64.replace(/^data:[^,]*,/, "");
  let bytes: Uint8Array;
  try { bytes = decodeBase64(b64); } catch { throw new AppError("The picture could not be read."); }
  if (bytes.length > MAX_IMAGE_BYTES) throw new AppError(`The picture is ${(bytes.length / 1024).toFixed(0)} KB; the limit is ${MAX_IMAGE_BYTES / 1024} KB.`);
  const kind = sniffImage(bytes);
  if (!kind) throw new AppError("Only PNG and JPEG pictures can be used.");
  const id = crypto.randomUUID();
  await db.insert(letterImages).values({ id, name: body.name, kind: body.kind, mimeType: kind.mimeType, width: kind.width || null, height: kind.height || null, sizeBytes: bytes.length, dataBase64: b64, createdAt: now(), createdBy: actorOf(c).actor });
  await recordAudit(db, { eventType: "LETTER_IMAGE_ADDED", subjectType: "LetterImage", subjectId: id, detail: body.name, ...actorOf(c) });
  return c.json({ id, name: body.name, kind: body.kind, mimeType: kind.mimeType, width: kind.width, height: kind.height, sizeBytes: bytes.length }, 201);
});

lettersAdmin.get("/images/:id/file", async (c) => {
  const [r] = await getDb(c.env.DB).select().from(letterImages).where(eq(letterImages.id, c.req.param("id"))).limit(1);
  if (!r) throw new AppError("Picture not found.", 404);
  return new Response(decodeBase64(r.dataBase64), { headers: { "Content-Type": r.mimeType, "Cache-Control": "private, max-age=300" } });
});

lettersAdmin.delete("/images/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param("id");
  const used = await db.select({ id: letterVersions.id }).from(letterVersions).where(like(letterVersions.documentJson, `%"imageId":"${id}"%`)).limit(1);
  if (used.length) throw new AppError("This picture is used by a letter, so it cannot be deleted.", 409);
  await db.delete(letterImages).where(eq(letterImages.id, id));
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

async function loadTemplate(db: ReturnType<typeof getDb>, key: string) {
  const [t] = await db.select().from(letterTemplates).where(eq(letterTemplates.key, key)).limit(1);
  if (!t) throw new AppError("That letter does not exist.", 404);
  return t;
}
const versionsOf = (db: ReturnType<typeof getDb>, key: string) => db.select().from(letterVersions).where(eq(letterVersions.templateKey, key)).orderBy(desc(letterVersions.version));
const shapeVersion = (v: typeof letterVersions.$inferSelect) => ({ version: v.version, status: v.status, changeNote: v.changeNote, createdAt: v.createdAt, createdBy: v.createdBy, publishedAt: v.publishedAt, publishedBy: v.publishedBy });

lettersAdmin.get("/templates", async (c) => {
  const db = getDb(c.env.DB);
  const templates = await db.select().from(letterTemplates).orderBy(letterTemplates.nameEn);
  const versions = await db.select().from(letterVersions);
  return c.json(templates.map((t) => {
    const mine = versions.filter((v) => v.templateKey === t.key);
    return { ...t, publishedVersion: mine.find((v) => v.status === "PUBLISHED")?.version ?? null, hasDraft: mine.some((v) => v.status === "DRAFT"), versionCount: mine.length };
  }));
});

lettersAdmin.post("/templates", zValidator("json", templateBody.extend({ starter: z.boolean().default(false) })), async (c) => {
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const taken = new Set((await db.select({ key: letterTemplates.key }).from(letterTemplates)).map((r) => r.key));
  const key = generateCode(body.nameEn, (x) => taken.has(x), { lower: true, max: 30, fallback: "letter" });
  const doc = body.starter ? SAMPLE_LETTER : EMPTY_LETTER;
  await db.insert(letterTemplates).values({ key, nameEn: body.nameEn, nameHe: body.nameHe, description: body.description ?? null, appliesTo: body.appliesTo, createdAt: now(), createdBy: actorOf(c).actor });
  await db.insert(letterVersions).values({ templateKey: key, version: 1, status: "DRAFT", documentJson: JSON.stringify(doc), changeNote: body.starter ? "Started from the sample letter" : "New letter", createdAt: now(), createdBy: actorOf(c).actor });
  await recordAudit(db, { eventType: "LETTER_CREATED", subjectType: "LetterTemplate", subjectId: key, detail: body.nameEn, ...actorOf(c) });
  return c.json({ key }, 201);
});

lettersAdmin.get("/templates/:key", async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, c.req.param("key"));
  return c.json({ ...t, versions: (await versionsOf(db, t.key)).map(shapeVersion) });
});

lettersAdmin.put("/templates/:key", zValidator("json", templateBody), async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, c.req.param("key"));
  const body = c.req.valid("json");
  await db.update(letterTemplates).set({ nameEn: body.nameEn, nameHe: body.nameHe, description: body.description ?? null, appliesTo: body.appliesTo }).where(eq(letterTemplates.key, t.key));
  return c.json({ ok: true });
});

/** One version's document: a number, or "draft" / "published" for whichever that is. */
lettersAdmin.get("/templates/:key/versions/:version", async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, c.req.param("key"));
  const which = c.req.param("version");
  const all = await versionsOf(db, t.key);
  const v = which === "draft" ? all.find((x) => x.status === "DRAFT") : which === "published" ? all.find((x) => x.status === "PUBLISHED") : all.find((x) => x.version === Number(which));
  if (!v) throw new AppError("That version does not exist.", 404);
  return c.json({ ...shapeVersion(v), document: parseDocument(v.documentJson) });
});

// Saving the draft never blocks on content problems (an editor saves half-finished work); publishing does.
lettersAdmin.put("/templates/:key/draft", zValidator("json", z.object({ document: letterDocument, changeNote: z.string().trim().max(200).optional() })), async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, c.req.param("key"));
  const body = c.req.valid("json");
  const all = await versionsOf(db, t.key);
  const draft = all.find((v) => v.status === "DRAFT");
  const json = JSON.stringify(body.document);
  if (draft) {
    await db.update(letterVersions).set({ documentJson: json, changeNote: body.changeNote ?? draft.changeNote }).where(eq(letterVersions.id, draft.id));
    return c.json({ version: draft.version, issues: await validateDocument(db, body.document) });
  }
  const next = (all[0]?.version ?? 0) + 1;
  await db.insert(letterVersions).values({ templateKey: t.key, version: next, status: "DRAFT", documentJson: json, changeNote: body.changeNote ?? null, createdAt: now(), createdBy: actorOf(c).actor });
  return c.json({ version: next, issues: await validateDocument(db, body.document) });
});

lettersAdmin.post("/templates/:key/discard-draft", async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, c.req.param("key"));
  const all = await versionsOf(db, t.key);
  const draft = all.find((v) => v.status === "DRAFT");
  if (!draft) throw new AppError("There is no draft to discard.", 404);
  if (all.length === 1) throw new AppError("This is the only version; delete the letter instead.", 409);
  await db.delete(letterVersions).where(eq(letterVersions.id, draft.id));
  return c.json({ ok: true });
});

lettersAdmin.post("/templates/:key/validate", zValidator("json", z.object({ document: letterDocument.optional() })), async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, c.req.param("key"));
  const { document } = c.req.valid("json");
  let doc = document;
  if (!doc) {
    const draft = (await versionsOf(db, t.key)).find((v) => v.status === "DRAFT");
    if (!draft) throw new AppError("There is no draft to check.", 404);
    doc = parseDocument(draft.documentJson);
  }
  const issues = await validateDocument(db, doc);
  return c.json({ issues, canPublish: !hasErrors(issues) });
});

lettersAdmin.post("/templates/:key/publish", async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, c.req.param("key"));
  const all = await versionsOf(db, t.key);
  const draft = all.find((v) => v.status === "DRAFT");
  if (!draft) throw new AppError("There is no draft to publish.", 404);
  const issues = await validateDocument(db, parseDocument(draft.documentJson));
  if (hasErrors(issues)) return c.json({ message: "Fix the errors before publishing.", issues }, 422);
  const at = now(), by = actorOf(c).actor;
  // Exactly one PUBLISHED version: the previous one is archived, never deleted, so issued letters can be traced.
  await db.update(letterVersions).set({ status: "ARCHIVED" }).where(and(eq(letterVersions.templateKey, t.key), eq(letterVersions.status, "PUBLISHED")));
  await db.update(letterVersions).set({ status: "PUBLISHED", publishedAt: at, publishedBy: by }).where(eq(letterVersions.id, draft.id));
  await recordAudit(db, { eventType: "LETTER_PUBLISHED", subjectType: "LetterTemplate", subjectId: t.key, detail: `v${draft.version}`, ...actorOf(c) });
  return c.json({ version: draft.version, issues });
});

/** A PDF of the draft (or `version`) for a real application or, without one, the sample data. Missing values are listed in a header. */
lettersAdmin.post("/templates/:key/preview", zValidator("json", z.object({ document: letterDocument.optional(), applicationRef: z.string().optional() })), async (c) => {
  const db = getDb(c.env.DB);
  const t = await loadTemplate(db, c.req.param("key"));
  const { document, applicationRef } = c.req.valid("json");
  let doc = document;
  if (!doc) {
    const all = await versionsOf(db, t.key);
    const v = all.find((x) => x.status === "DRAFT") ?? all.find((x) => x.status === "PUBLISHED");
    if (!v) throw new AppError("This letter has no versions.", 404);
    doc = parseDocument(v.documentJson);
  }
  let data: Record<string, unknown> = SAMPLE_DATA as Record<string, unknown>;
  if (applicationRef) {
    const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, applicationRef)).limit(1);
    if (!app) throw new AppError("Application not found.", 404);
    data = await buildLetterData(db, app);
  }
  const out = await renderDocument(db, doc, data, LETTER_FONT_BYTES, `${t.nameEn} (preview)`);
  return new Response(out.pdf, { headers: { "Content-Type": "application/pdf", "X-Letter-Missing": encodeURIComponent(out.missing.join(",")), "Content-Disposition": `inline; filename="${t.key}-preview.pdf"` } });
});

