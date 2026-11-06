import { Hono } from "hono";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { describeActions } from "../lib/workflow/host";
import { projectPublished } from "../lib/workflow/store";

// Runtime read API for the UI: what the statuses are called, which queues exist, and what the
// signed-in user can do to a case right now. The UI renders from these instead of hard-coding
// status sets and action buttons.
export const workflow = new Hono<AppEnv>();
workflow.use("*", requireAuth);

workflow.get("/definition", async (c) => c.json(await projectPublished(getDb(c.env.DB))));

workflow.get("/cases/:ref/actions", async (c) => c.json(await describeActions(c, c.req.param("ref"))));
