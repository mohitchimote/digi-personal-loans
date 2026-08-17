import { Hono } from "hono";
import { and, count, desc, eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { notifications } from "../db/schema";

export const notificationsRoute = new Hono<AppEnv>();

notificationsRoute.get("/customer/:customerId", async (c) => {
  const db = getDb(c.env.DB);
  const customerId = Number(c.req.param("customerId"));
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.customerId, customerId))
    .orderBy(desc(notifications.createdAt));
  return c.json(rows);
});

notificationsRoute.get("/customer/:customerId/unread-count", async (c) => {
  const db = getDb(c.env.DB);
  const customerId = Number(c.req.param("customerId"));
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.customerId, customerId), eq(notifications.isRead, false)));
  return c.json({ count: row?.value ?? 0 });
});

notificationsRoute.put("/:id/read", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  return c.body(null, 200);
});

notificationsRoute.put("/customer/:customerId/read-all", async (c) => {
  const db = getDb(c.env.DB);
  const customerId = Number(c.req.param("customerId"));
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.customerId, customerId), eq(notifications.isRead, false)));
  return c.body(null, 200);
});

notificationsRoute.post("/create", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<{ customerId: number | string; title: string; message: string; type?: string; applicationRef?: string }>();
  const [created] = await db
    .insert(notifications)
    .values({
      customerId: Number(body.customerId),
      title: body.title,
      message: body.message,
      type: body.type ?? "INFO",
      applicationRef: body.applicationRef ?? null,
      isRead: false,
      createdAt: new Date().toISOString(),
    })
    .returning();
  return c.json(created);
});

const WELCOME_MESSAGES = [
  {
    title: "Welcome to DigiBank Personal Loans",
    message:
      "Thank you for choosing DigiBank. We're here to help you find the right personal loan for your needs. Our application process is quick, transparent, and entirely digital.",
    type: "SUCCESS",
  },
  {
    title: "Documents You'll Need",
    message:
      "To complete your application you will need: recent payslips (last 3 months), bank statements (last 6 months), a valid ID document, and proof of address dated within 3 months.",
    type: "INFO",
  },
  {
    title: "Your Application is Auto-Saved",
    message:
      "Don't worry about losing progress — your application is automatically saved after each section. You can return at any time to complete it from where you left off.",
    type: "INFO",
  },
];

notificationsRoute.post("/customer/:customerId/seed-welcome", async (c) => {
  const db = getDb(c.env.DB);
  const customerId = Number(c.req.param("customerId"));
  const now = new Date().toISOString();
  await db.insert(notifications).values(
    WELCOME_MESSAGES.map((m) => ({
      customerId,
      title: m.title,
      message: m.message,
      type: m.type,
      applicationRef: null,
      isRead: false,
      createdAt: now,
    }))
  );
  return c.body(null, 200);
});
