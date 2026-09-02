import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { generatedDocuments, uploadedDocuments } from "../db/schema";
import { AppError } from "../lib/errors";
import { generateOfferPack } from "../lib/document-pack";
import { requireAuth } from "../middleware/auth";

export const documents = new Hono<AppEnv>();
documents.use("*", requireAuth);

// Same duplicated list as applications.ts/admin.ts (tracked separately as Q2) — staff can
// download/view any customer's documents; a customer may only reach their own.
const STAFF_ROLES = ["BANKER", "UNDERWRITER", "SENIOR_UNDERWRITER", "HEAD_OF_LENDING", "COO", "CEO", "ADMIN"];

function assertOwnsDocument(c: any, documentCustomerId: number) {
  const authUser = c.get("authUser");
  if (STAFF_ROLES.includes(authUser.role)) return;
  if (authUser.id !== documentCustomerId) {
    throw new AppError("Forbidden.", 403);
  }
}

// Enough for a scanned payslip/ID photo or a multi-page PDF, small enough to keep a single
// upload from being a disproportionate R2 storage cost.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// R2 needs a one-time manual enable in the Cloudflare dashboard (blocked since Day 1 — error code
// 10042 from the API). Every route below checks for the binding and fails clearly rather than
// throwing an opaque runtime error, so the rest of the app keeps working in the meantime.
function requireBucket(c: any) {
  if (!c.env.DOCUMENTS) {
    throw new AppError("Document storage (R2) is not yet enabled on this Cloudflare account.", 503);
  }
  return c.env.DOCUMENTS as R2Bucket;
}

interface GenerateRequest {
  applicationRef: string;
  customerId: number;
  documentType: "APPROVAL_LETTER" | "FINAL_APPROVAL_LETTER";
  customerName: string;
  loanAmount: number;
  productName: string;
  interestRate: number;
  termMonths: number;
  monthlyRepayment: number;
}

// Client-triggered from the customer's "Generate Approval Letter" button — produces the full
// offer pack (cover letter + Key Facts Statement + Repayment Schedule + T&Cs, see
// lib/document-pack.ts) in one call rather than just the single cover letter this used to return.
// Returns every document created, cover letter first, so the frontend can pick that one out for
// its existing "letter ready" state while also listing the rest.
documents.post("/generate", async (c) => {
  requireBucket(c);
  const db = getDb(c.env.DB);
  const req = await c.req.json<GenerateRequest>();

  if (req.documentType !== "APPROVAL_LETTER" && req.documentType !== "FINAL_APPROVAL_LETTER") {
    throw new AppError(`Unknown document type: ${req.documentType}`);
  }

  const pack = await generateOfferPack(db, c.env, req, req.documentType === "FINAL_APPROVAL_LETTER");
  return c.json(pack);
});

documents.get("/customer/:customerId", async (c) => {
  const db = getDb(c.env.DB);
  const customerId = Number(c.req.param("customerId"));
  const rows = await db
    .select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.customerId, customerId))
    .orderBy(desc(generatedDocuments.generatedAt));
  return c.json(rows);
});

documents.get("/application/:appRef", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const rows = await db
    .select()
    .from(generatedDocuments)
    .where(eq(generatedDocuments.applicationRef, appRef))
    .orderBy(desc(generatedDocuments.generatedAt));
  return c.json(rows);
});

async function serveGenerated(c: any, disposition: "attachment" | "inline") {
  const bucket = requireBucket(c);
  const db = getDb(c.env.DB);
  const docId = Number(c.req.param("docId"));
  const [doc] = await db.select().from(generatedDocuments).where(eq(generatedDocuments.id, docId)).limit(1);
  if (!doc) throw new AppError(`Document not found: ${docId}`);
  assertOwnsDocument(c, doc.customerId);
  const obj = await bucket.get(doc.filePath);
  if (!obj) throw new AppError(`Document not found: ${docId}`);
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${doc.documentName}.pdf"`,
    },
  });
}

documents.get("/:docId/download", (c) => serveGenerated(c, "attachment"));
documents.get("/:docId/view", (c) => serveGenerated(c, "inline"));

documents.post("/upload", async (c) => {
  const bucket = requireBucket(c);
  const db = getDb(c.env.DB);
  const body = await c.req.parseBody();

  const file = body["file"];
  if (!(file instanceof File)) throw new AppError("A file is required.");
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError("File is too large. Maximum size is 5MB.", 413);
  const appRef = String(body["applicationRef"] ?? "");
  const customerId = Number(body["customerId"]);
  const docType = String(body["documentType"] ?? "SUPPORTING");

  const key = `uploaded/${appRef}/${crypto.randomUUID()}_${file.name}`;
  const bytes = await file.arrayBuffer();
  await bucket.put(key, bytes, { httpMetadata: { contentType: file.type || "application/octet-stream" } });

  const [saved] = await db
    .insert(uploadedDocuments)
    .values({
      applicationRef: appRef,
      customerId,
      documentType: docType,
      originalFilename: file.name,
      storagePath: key,
      fileSize: bytes.byteLength,
      mimeType: file.type || "application/octet-stream",
      uploadedAt: new Date().toISOString(),
    })
    .returning();
  return c.json(saved);
});

documents.get("/uploaded/:appRef", async (c) => {
  const db = getDb(c.env.DB);
  const appRef = c.req.param("appRef");
  const rows = await db
    .select()
    .from(uploadedDocuments)
    .where(eq(uploadedDocuments.applicationRef, appRef))
    .orderBy(desc(uploadedDocuments.uploadedAt));
  return c.json(rows);
});

async function serveUploaded(c: any, disposition: "attachment" | "inline") {
  const bucket = requireBucket(c);
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [doc] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, id)).limit(1);
  if (!doc) throw new AppError(`Uploaded document not found: ${id}`);
  assertOwnsDocument(c, doc.customerId);
  const obj = await bucket.get(doc.storagePath);
  if (!obj) throw new AppError(`Uploaded document not found: ${id}`);
  return new Response(obj.body, {
    headers: {
      "Content-Type": doc.mimeType ?? "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${doc.originalFilename}"`,
    },
  });
}

documents.get("/uploaded/file/:id/view", (c) => serveUploaded(c, "inline"));
documents.get("/uploaded/file/:id/download", (c) => serveUploaded(c, "attachment"));
