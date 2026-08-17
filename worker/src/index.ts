import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types";
import { AppError } from "./lib/errors";
import { health } from "./routes/health";
import { auth } from "./routes/auth";
import { admin } from "./routes/admin";
import { branding, brandingAdmin } from "./routes/branding";
import { applications } from "./routes/applications";
import { affordability } from "./routes/affordability";
import { products } from "./routes/products";
import { notificationsRoute } from "./routes/notifications";
import { documents } from "./routes/documents";

const app = new Hono<AppEnv>();

// Same-origin deployment (frontend + API on one Worker) means CORS is not
// actually needed for the deployed app, but keeping it permissive for local
// `ng serve` + `wrangler dev` cross-port development.
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin ?? "*",
    credentials: true,
  })
);

// API responses carried no explicit caching directives at all, leaving the browser to fall back
// on undefined heuristic caching for JSON calls. Real-world testing showed a repeat GET to the
// same endpoint shortly after a prior successful fetch would sometimes hang indefinitely
// (DevTools: stuck in "Stalled", never even reaching a connection) — a known class of browser
// HTTP-cache/revalidation bug that explicit no-store headers eliminate outright.
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ success: false, message: err.message, data: null }, err.status as any);
  }
  console.error(err);
  return c.json({ success: false, message: "Internal server error.", data: null }, 500);
});

app.route("/api/health", health);
app.route("/api/auth", auth);
app.route("/api/auth/admin", admin);
app.route("/api/auth/admin/branding", brandingAdmin);
app.route("/api/branding", branding);
app.route("/api/applications", applications);
app.route("/api/affordability", affordability);
app.route("/api/products", products);
app.route("/api/notifications", notificationsRoute);
app.route("/api/documents", documents);

export default app;
