import { inLender } from "./lender-scope";
import type { Db } from "../db/client";
import { affordabilityRules } from "../db/schema";
import { cached, invalidate } from "./cache";

const rulesCacheKey = (lenderId: number) => `affordability-rules:${lenderId}`;
const RULES_TTL_MS = 30_000;

// The single admin-editable affordability-rules row, cached — see lib/cache.ts. Every route that
// updates this row must call invalidateAffordabilityRulesCache() so the change is visible
// immediately, not after the TTL expires.
export async function getAffordabilityRules(db: Db, lenderId: number) {
  return cached(rulesCacheKey(lenderId), RULES_TTL_MS, async () => {
    const [rules] = await db.select().from(affordabilityRules).where(inLender(affordabilityRules, lenderId)).limit(1);
    return rules ?? null;
  });
}

export function invalidateAffordabilityRulesCache(lenderId: number): void {
  invalidate(rulesCacheKey(lenderId));
}

// Inlined equivalent of AffordabilityClient.getAutoApprovalThreshold.
export async function getAutoApprovalThreshold(db: Db, lenderId: number, jointApplication: boolean): Promise<number | null> {
  const rules = await getAffordabilityRules(db, lenderId);
  if (!rules) return null;
  return jointApplication ? rules.autoApprovalThresholdJoint : rules.autoApprovalThresholdSingle;
}
