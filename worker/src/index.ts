import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./types";
import { AppError } from "./lib/errors";
import { health } from "./routes/health";
import { auth } from "./routes/auth";
import { admin } from "./routes/admin";
import { branding, brandingAdmin } from "./routes/branding";

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

export default app;
