import type { Db } from "../db/client";
import type { Env } from "../types";
import { generatedDocuments } from "../db/schema";
import { generateApprovalLetterPdf } from "./pdf/approval-letter";
import { generateKeyFactsStatementPdf } from "./pdf/key-facts-statement";
import { generateTermsAndConditionsPdf } from "./pdf/terms-and-conditions";
import { generateRepaymentSchedulePdf } from "./pdf/repayment-schedule";
import { friendlyDocumentName } from "./pdf/approval-letter";

// The full "offer pack" a real personal-loan decision would hand a customer, in place of the
// single approval letter this app used to produce on its own — modelled on the UK's cover-letter
// + ESIS/SECCI + T&Cs + repayment-schedule bundle. See ILLUSTRATIVE_NOTICE in pdf-common.ts: every
// document but the original approval letter is a demo-shaped placeholder pending real Israeli
// Legal & Compliance content.
//
// Terms & Conditions describe the loan *product*, not the specific decision, so they're generated
// once at the conditional stage and reused — regenerating identical T&Cs at final approval would
// just be a duplicate row. The Key Facts Statement and Repayment Schedule DO get regenerated at
// final approval, since `approvedAmount` can differ from the originally requested amount.

export interface OfferPackData {
  applicationRef: string;
  customerId: number;
  customerName: string;
  loanAmount: number;
  productName: string;
  interestRate: number;
  termMonths: number;
  monthlyRepayment: number;
}

async function storeDocument(
  db: Db,
  bucket: R2Bucket,
  data: OfferPackData,
  documentType: string,
  pdfBytes: Uint8Array
) {
  const key = `generated/${data.applicationRef}/${documentType}_${crypto.randomUUID()}.pdf`;
  await bucket.put(key, pdfBytes, { httpMetadata: { contentType: "application/pdf" } });
  const [saved] = await db
    .insert(generatedDocuments)
    .values({
      applicationRef: data.applicationRef,
      customerId: data.customerId,
      documentType,
      documentName: friendlyDocumentName(documentType),
      filePath: key,
      fileSize: pdfBytes.byteLength,
      mimeType: "application/pdf",
      generatedAt: new Date().toISOString(),
    })
    .returning();
  return saved;
}

/** Generates the cover/approval letter plus its companion Key Facts Statement and Repayment
 * Schedule, appropriate to the decision stage — call with `isFinal: false` for the conditional
 * offer, `isFinal: true` for full approval. Also generates Terms & Conditions, but only when
 * `isFinal` is false (see module doc above). Returns every row created, cover letter first. */
export async function generateOfferPack(
  db: Db,
  env: Env,
  data: OfferPackData,
  isFinal: boolean
): Promise<(typeof generatedDocuments.$inferSelect)[]> {
  if (!env.DOCUMENTS) return []; // R2 not yet enabled on this account — degrade silently
  const bucket = env.DOCUMENTS;
  const coverType = isFinal ? "FINAL_APPROVAL_LETTER" : "APPROVAL_LETTER";

  const results: (typeof generatedDocuments.$inferSelect)[] = [];

  const coverPdf = await generateApprovalLetterPdf(data, isFinal);
  results.push(await storeDocument(db, bucket, data, coverType, coverPdf));

  const keyFactsPdf = await generateKeyFactsStatementPdf(data, isFinal);
  results.push(await storeDocument(db, bucket, data, "KEY_FACTS_STATEMENT", keyFactsPdf));

  const schedulePdf = await generateRepaymentSchedulePdf(data);
  results.push(await storeDocument(db, bucket, data, "REPAYMENT_SCHEDULE", schedulePdf));

  if (!isFinal) {
    const termsPdf = await generateTermsAndConditionsPdf(data);
    results.push(await storeDocument(db, bucket, data, "TERMS_AND_CONDITIONS", termsPdf));
  }

  return results;
}
