import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { generatedDocuments, letterTemplates, lettersIssued, loanApplications } from "../db/schema";
import { assertEntitlement, requireAuth } from "../middleware/auth";
import { AppError } from "../lib/errors";
import { recordAudit } from "../lib/audit";
import { issueLetter, publishedVersion } from "../lib/letters/service";
import { LETTER_FONT_BYTES } from "../lib/pdf/letter-fonts";

// Staff side of letters: which published letters apply to an application, issuing one, and the ones already
// issued. Gated by the `letters.issue` entitlement.
export const letters = new Hono<AppEnv>();
letters.use("*", requireAuth);

/** Published letters that can be produced for this application. */
letters.get("/available/:appRef", async (c) => {
  assertEntitlement(c, "letters.issue");
  const db = getDb(c.env.DB);
  const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, c.req.param("appRef"))).limit(1);
  if (!app) throw new AppError("Application not found.", 404);
  const templates = await db.select().from(letterTemplates).orderBy(letterTemplates.nameEn);
  const out = [];
  for (const t of templates) {
    if (t.appliesTo !== "BOTH" && t.appliesTo !== app.applicationType) continue;
    const v = await publishedVersion(db, t.key);
    if (v) out.push({ key: t.key, nameEn: t.nameEn, nameHe: t.nameHe, description: t.description, version: v.version });
  }
  return c.json(out);
});

letters.get("/issued/:appRef", async (c) => {
  assertEntitlement(c, "letters.issue");
  const db = getDb(c.env.DB);
  const rows = await db.select().from(lettersIssued).where(eq(lettersIssued.applicationRef, c.req.param("appRef"))).orderBy(desc(lettersIssued.issuedAt));
  const names = new Map((await db.select({ key: letterTemplates.key, nameEn: letterTemplates.nameEn }).from(letterTemplates)).map((t) => [t.key, t.nameEn]));
  return c.json(rows.map((r) => ({ id: r.id, templateKey: r.templateKey, name: names.get(r.templateKey) ?? r.templateKey, templateVersion: r.templateVersion, issuedAt: r.issuedAt, issuedBy: r.issuedBy })));
});

letters.post("/issue", zValidator("json", z.object({ templateKey: z.string().min(1), applicationRef: z.string().min(1), decisionReason: z.string().trim().max(1000).optional() })), async (c) => {
  assertEntitlement(c, "letters.issue");
  const db = getDb(c.env.DB);
  const body = c.req.valid("json");
  const user = c.get("authUser");
  const by = user.fullName?.trim() || user.email;
  const { issued } = await issueLetter(db, c.env, LETTER_FONT_BYTES, { ...body, issuedBy: by });
  await recordAudit(db, { eventType: "LETTER_ISSUED", subjectType: "LoanApplication", subjectId: body.applicationRef, detail: `${body.templateKey} v${issued.templateVersion}`, actor: by, actorRole: user.role });
  return c.json({ id: issued.id, templateVersion: issued.templateVersion, issuedAt: issued.issuedAt }, 201);
});

/** The PDF of an issued letter. */
letters.get("/issued/:appRef/:id/pdf", async (c) => {
  assertEntitlement(c, "letters.issue");
  const db = getDb(c.env.DB);
  const [row] = await db.select().from(lettersIssued).where(and(eq(lettersIssued.id, Number(c.req.param("id"))), eq(lettersIssued.applicationRef, c.req.param("appRef")))).limit(1);
  if (!row?.generatedDocumentId) throw new AppError("Letter not found.", 404);
  const [doc] = await db.select().from(generatedDocuments).where(eq(generatedDocuments.id, row.generatedDocumentId)).limit(1);
  const obj = doc && (await c.env.DOCUMENTS?.get(doc.filePath));
  if (!obj) throw new AppError("The stored letter could not be found.", 404);
  return new Response(obj.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${row.templateKey}-${row.applicationRef}.pdf"` } });
});
