import { Hono } from "hono";
import type { AppEnv } from "../types";

export const health = new Hono<AppEnv>();

health.get("/", (c) =>
  c.json({
    status: "ok",
    service: "digibank-personal-loans-worker",
    time: new Date().toISOString(),
  })
);
