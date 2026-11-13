import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db/client";
import type { Env } from "../../types";
import { generatedDocuments, letterImages, letterSavedRules, letterTemplates, letterVersions, lettersIssued, loanApplications } from "../../db/schema";
import { AppError } from "../errors";
import { renderLetterPdf, type LetterImageFile } from "../pdf/letter-renderer";
import { buildLetterData } from "./data";
import { LETTER_DICTIONARY } from "./dictionary";
import { resolveBoth } from "./resolve";
import { letterDocument, savedRule, type LetterDocument, type SavedRule } from "./types";
import { hasErrors, validateLetter, type LetterIssue } from "./validate";

export interface FontBytes { regular: Uint8Array | ArrayBuffer; bold: Uint8Array | ArrayBuffer }

export const EMPTY_LETTER: LetterDocument = { formatVersion: 1, header: [], body: [], footer: [] };

export function parseDocument(json: string): LetterDocument {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new AppError("The stored letter is not valid JSON."); }
  const r = letterDocument.safeParse(raw);
  if (!r.success) throw new AppError("The stored letter does not match the letter format.");
  return r.data;
}

export async function loadSavedRules(db: Db): Promise<SavedRule[]> {
  const rows = await db.select().from(letterSavedRules);
  const out: SavedRule[] = [];
  for (const r of rows) {
    const parsed = savedRule.safeParse({ id: r.id, name: r.name, rule: safeJson(r.ruleJson) });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }

export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Every image id a document names, anywhere in it. */
export function imageIdsIn(doc: LetterDocument): string[] {
  const ids = new Set<string>();
  const walk = (nodes: LetterDocument["body"]) => {
    for (const n of nodes) {
      if ((n.t === "image" || n.t === "signature") && n.imageId) ids.add(n.imageId);
      if (n.t === "when" || n.t === "repeat") walk(n.children);
      if (n.t === "alternatives") n.variants.forEach((v) => walk(v.children));
    }
  };
  walk(doc.header); walk(doc.body); walk(doc.footer);
  return [...ids];
}

export async function loadImages(db: Db, ids: string[]): Promise<Map<string, LetterImageFile>> {
  const out = new Map<string, LetterImageFile>();
  if (ids.length === 0) return out;
  const rows = await db.select().from(letterImages).where(inArray(letterImages.id, ids));
  for (const r of rows) out.set(r.id, { mimeType: r.mimeType, bytes: decodeBase64(r.dataBase64) });
  return out;
}

export async function knownImageIds(db: Db): Promise<Set<string>> {
  return new Set((await db.select({ id: letterImages.id }).from(letterImages)).map((r) => r.id));
}

/** Validates a document against the live dictionary, the shared saved rules and the stored images. */
export async function validateDocument(db: Db, doc: LetterDocument): Promise<LetterIssue[]> {
  return validateLetter(doc, LETTER_DICTIONARY, await loadSavedRules(db), { knownImageIds: await knownImageIds(db) });
}

export interface Rendered { pdf: Uint8Array; missing: string[]; decisions: unknown[]; data: Record<string, unknown> }

/** Resolves a document against data in both languages and draws it. */
export async function renderDocument(db: Db, doc: LetterDocument, data: Record<string, unknown>, fontBytes: FontBytes, title: string): Promise<Rendered> {
  const letters = resolveBoth({ document: doc, dictionary: LETTER_DICTIONARY, savedRules: await loadSavedRules(db), data, today: new Date().toISOString().slice(0, 10) });
  const images = await loadImages(db, imageIdsIn(doc));
  const pdf = await renderLetterPdf({ letters, fontBytes, images, title });
  return { pdf, missing: [...new Set([...letters.en.missing, ...letters.he.missing])], decisions: letters.en.decisions, data };
}

export async function publishedVersion(db: Db, templateKey: string) {
  const [v] = await db.select().from(letterVersions).where(and(eq(letterVersions.templateKey, templateKey), eq(letterVersions.status, "PUBLISHED"))).orderBy(desc(letterVersions.version)).limit(1);
  return v ?? null;
}

/**
 * Issues a published letter for an application: refuses if the template has errors or the application lacks a
 * value the letter prints, then stores the PDF, the version used and the data it was built from.
 */
export async function issueLetter(db: Db, env: Env, fontBytes: FontBytes, args: { templateKey: string; applicationRef: string; issuedBy: string; decisionReason?: string }) {
  if (!env.DOCUMENTS) throw new AppError("Document storage is not enabled on this account.", 503);
  const [template] = await db.select().from(letterTemplates).where(eq(letterTemplates.key, args.templateKey)).limit(1);
  if (!template) throw new AppError("That letter does not exist.", 404);
  const version = await publishedVersion(db, args.templateKey);
  if (!version) throw new AppError("That letter has no published version yet.", 409);
  const [app] = await db.select().from(loanApplications).where(eq(loanApplications.applicationRef, args.applicationRef)).limit(1);
  if (!app) throw new AppError("Application not found.", 404);
  if (template.appliesTo !== "BOTH" && template.appliesTo !== app.applicationType) throw new AppError(`This letter is only for ${template.appliesTo.toLowerCase()} applications.`, 409);

  const doc = parseDocument(version.documentJson);
  const issues = await validateDocument(db, doc);
  if (hasErrors(issues)) throw new AppError("The published letter has errors and cannot be issued.", 409);
  const data = await buildLetterData(db, app, { decisionReason: args.decisionReason });
  const out = await renderDocument(db, doc, data, fontBytes, `${template.nameEn} ${args.applicationRef}`);
  if (out.missing.length) throw new AppError(`This application is missing information the letter prints: ${out.missing.join(", ")}.`, 422);

  const key = `letters/${args.applicationRef}/${args.templateKey}_v${version.version}_${crypto.randomUUID()}.pdf`;
  await env.DOCUMENTS.put(key, out.pdf, { httpMetadata: { contentType: "application/pdf" } });
  const now = new Date().toISOString();
  const [doc2] = await db.insert(generatedDocuments).values({
    applicationRef: args.applicationRef, customerId: app.customerId, documentType: `LETTER_${args.templateKey}`,
    documentName: template.nameEn, filePath: key, fileSize: out.pdf.byteLength, mimeType: "application/pdf", generatedAt: now,
  }).returning();
  const [issued] = await db.insert(lettersIssued).values({
    templateKey: args.templateKey, templateVersion: version.version, applicationRef: args.applicationRef, issuedAt: now, issuedBy: args.issuedBy,
    dataJson: JSON.stringify(data), decisionsJson: JSON.stringify(out.decisions), generatedDocumentId: doc2.id,
  }).returning();
  return { issued, document: doc2 };
}
