import { Hono } from "hono";
import type { AppEnv } from "../types";
import { getDb } from "../db/client";
import { affordabilityRules } from "../db/schema";
import { assessPersonalAffordability, assessBusinessAffordability } from "../lib/affordability-calc";
import type { AffordabilityRequest, BusinessAffordabilityRequest } from "../lib/affordability-calc";
import { getAffordabilityRules, invalidateAffordabilityRulesCache } from "../lib/affordability-rules";
import { requireAuth, requireRole, requireLender } from "../middleware/auth";

export const affordability = new Hono<AppEnv>();
affordability.use("*", requireAuth);

affordability.post("/check", async (c) => {
  const db = getDb(c.env.DB);
  const rules = await getAffordabilityRules(db, requireLender(c));
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
  const rules = await getAffordabilityRules(db, requireLender(c));
  return c.json(rules);
});

affordability.put("/rules", requireRole("ADMIN"), async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json<Record<string, number>>();
  const lenderId = requireLender(c);
  const fields = {
    maxDti: body.maxDti,
    maxHti: body.maxHti,
    minMonthlyIncome: body.minMonthlyIncome,
    baseAnnualRate: body.baseAnnualRate,
    repaymentCapacityFactor: body.repaymentCapacityFactor,
    minCreditScore: body.minCreditScore,
    autoApprovalThresholdSingle: body.autoApprovalThresholdSingle,
    autoApprovalThresholdJoint: body.autoApprovalThresholdJoint,
  };
  // One row per lender; a lender that has never saved rules gets its row (with the defaults) now.
  const [updated] = await db
    .insert(affordabilityRules)
    .values({ lenderId, ...fields })
    .onConflictDoUpdate({ target: affordabilityRules.lenderId, set: fields })
    .returning();
  invalidateAffordabilityRulesCache(requireLender(c));
  return c.json(updated);
});
