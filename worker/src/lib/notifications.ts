import type { Db } from "../db/client";
import { notifications } from "../db/schema";

// Inlined equivalent of NotificationClient.send() — a direct D1 insert instead of an HTTP hop to
// a separate service, now that everything lives in one Worker. Best-effort by design: notification
// failures should never block an underwriting decision, matching the Java client's swallow-and-log.
export async function sendNotification(
  db: Db,
  customerId: number,
  title: string,
  message: string,
  type: string,
  applicationRef: string
) {
  try {
    await db.insert(notifications).values({
      customerId,
      title,
      message,
      type,
      applicationRef,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("sendNotification failed (non-fatal):", e);
  }
}
