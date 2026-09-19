import { auditLog } from "../db/schema";
import type { Db } from "../db/client";
import { logError } from "./log";

// Open Point #19 (ARCHITECTURE_REVIEW_GAPS.md) — resolved in favour of a plain table over a
// separate MongoDB-based store (no new infra to run, same reasoning as S2/S5's Redis decision).
// Never allowed to block or fail the real action it's recording, same convention as this project's
// other non-critical side effects (email sending, document generation).
export async function recordAudit(
  db: Db,
  params: {
    eventType: string;
    subjectType: string;
    subjectId: string;
    actor?: string | null;
    actorRole?: string | null;
    detail?: string | null;
  }
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      occurredAt: new Date().toISOString(),
      eventType: params.eventType,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      actor: params.actor ?? null,
      actorRole: params.actorRole ?? null,
      detail: params.detail ?? null,
    });
  } catch (err) {
    logError("Compliance audit write failed", err, { eventType: params.eventType, subjectId: params.subjectId });
  }
}
