import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { affordabilityRules } from "../db/schema";
import { assessPersonalAffordability, assessBusinessAffordability } from "../lib/affordability-calc";
import type { AffordabilityRequest, BusinessAffordabilityRequest } from "../lib/affordability-calc";

export const affordability = new Hono<AppEnv>();

affordability.post("/check", async (c) => {
  const db = getDb(c.env.DB);
  const [rules] = await db.select().from(affordabilityRules).where(eq(affordabilityRules.id, 1)).limit(1);
  const req = await c.req.json<AffordabilityRequest>();
  const result = assessPersonalAffordability(req, rules);
  return c.json(result);
});

affordability.post("/check-business", async (c) => {
  const req = await c.req.json<BusinessAffordabilityRequest>();
  const result = assessBusinessAffordability(req);
  return c.json(result);
});

affordability.get("/rules", async (c) => {
  const db = getDb(c.env.DB);
  const [rules] = await db.select().from(affordabilityRules).where(eq(affordabilityRules.id, 1)).limit(1);
  return c.json(rules);
});

affordability.put("/rules", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<Record<string, number>>();
  const [updated] = await db
    .update(affordabilityRules)
    .set({
      maxDti: body.maxDti,
      maxHti: body.maxHti,
      minMonthlyIncome: body.minMonthlyIncome,
      baseAnnualRate: body.baseAnnualRate,
      repaymentCapacityFactor: body.repaymentCapacityFactor,
      minCreditScore: body.minCreditScore,
      autoApprovalThresholdSingle: body.autoApprovalThresholdSingle,
      autoApprovalThresholdJoint: body.autoApprovalThresholdJoint,
    })
    .where(eq(affordabilityRules.id, 1))
    .returning();
  return c.json(updated);
});
