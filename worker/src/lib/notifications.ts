import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { notifications, users } from "../db/schema";
import type { Lang } from "./app-format";

/** Server-generated content (this file, sendTemplatedEmail) has no other way to know which
 * language to write in — the frontend's language toggle is purely client-side (localStorage), so
 * this is the only source of truth once we're on the server. */
export async function getPreferredLanguage(db: Db, customerId: number): Promise<Lang> {
  const [user] = await db.select({ preferredLanguage: users.preferredLanguage }).from(users).where(eq(users.id, customerId)).limit(1);
  return user?.preferredLanguage === "he" ? "he" : "en";
}

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
